// L'ENVOI des courriels inscrits dans le journal `courriels` (Phase 3, lot 4).
//
// `traiterCourriels` est appelée APRÈS la réponse (after() de Next) par la
// page de retour de paiement, l'avis de Stripe, la signature du contrat et le
// tunnel : chaque activité du site rattrape ainsi les envois en retard. La
// minuterie du serveur (tâches automatiques) arrive en Phase 4.
//
// Un courriel à la fois, dans une transaction qui verrouille sa ligne (FOR
// UPDATE SKIP LOCKED) : deux traitements simultanés ne l'envoient pas deux
// fois. Limite connue : si le serveur s'arrête entre l'acceptation par Brevo
// et l'écriture du statut, le courriel repartira une fois de plus (Brevo n'a
// pas de clé d'idempotence).
//
// Échec : nouvel essai après 1, 5, 15, 60 puis 240 minutes ; au sixième échec
// le courriel est abandonné (« echec ») et, s'il était destiné au client, une
// alerte « À TRAITER — courriel non parti » prévient les propriétaires.
//
// Confirmation au client (décision du 27 octobre 2026) : le contrat est créé
// juste avant, et son lien de signature est dans le courriel. Si la création
// échoue trois fois, la confirmation part sans le lien, les propriétaires
// sont alertés, et un courriel « contrat à signer » retente la création.
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { courriels, paiements, reglages } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import type { ContratEmis, ResultatEmission } from "@/lib/contrat";
import { inscrireContratARelancer, inscrireProbleme } from "@/lib/courriels";
import {
  texteAlerteProbleme,
  texteAlerteReservation,
  texteAlerteSignature,
  texteConfirmation,
  texteContrat,
  texteLienSuivi,
  texteRemboursement,
  type Contenu,
  type FicheClient,
  type Probleme,
  type Sejour,
} from "@/lib/courriels-textes";
import { isGiteId } from "@/lib/data/gites";
import { lien, type Langue } from "@/lib/i18n/langues";
import { messagerie } from "@/lib/messagerie";
import { recapitulatif } from "@/lib/recapitulatif";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { finValidite, lienOuvert, lienSuivi } from "@/lib/suivi";
import { autresGitesLibres } from "@/lib/tunnel";

/** Délais avant chaque nouvel essai, en minutes ; au-delà, le courriel est abandonné. */
const DELAIS_MINUTES = [1, 5, 15, 60, 240];
const ESSAIS_MAX = DELAIS_MINUTES.length + 1;
/** Échecs de création du contrat tolérés avant d'envoyer la confirmation sans le lien. */
const ESSAIS_CONTRAT_AVANT_ENVOI = 2;
/** Délai avant le courriel « contrat à signer » qui retente la création. */
const RELANCE_CONTRAT_MINUTES = 30;

const OBJETS_CLIENT = new Set(["confirmation", "contrat", "remboursement", "lien_suivi"]);

type Courriel = typeof courriels.$inferSelect;

// ─── Émission du contrat (remplaçable pour les contrôles) ────────────────────

export interface EmetteurContrat {
  emettre(reservationId: string): Promise<ResultatEmission>;
  existant(reservationId: string): Promise<ContratEmis | null>;
}

let emetteurCourant: EmetteurContrat | null = null;

/**
 * lib/contrat.ts est chargé à la demande : il tire le moteur PDF, que les
 * scripts de contrôle (tsx) ne savent pas charger ; ils le remplacent.
 */
async function emetteur(): Promise<EmetteurContrat> {
  if (!emetteurCourant) {
    const m = await import("@/lib/contrat");
    emetteurCourant = {
      emettre: m.emettreContrat,
      existant: (id) => m.trouverContratExistant(getDb(), id),
    };
  }
  return emetteurCourant;
}

/** POUR LES CONTRÔLES SEULEMENT (scripts/verifier-courriels.ts). */
export function remplacerEmetteurContrat(e: EmetteurContrat): void {
  emetteurCourant = e;
}

// ─── Traitement ──────────────────────────────────────────────────────────────

export interface BilanEnvoi {
  envoyes: number;
  reportes: number;
  abandonnes: number;
}

/**
 * Envoie les courriels arrivés à échéance, au plus `limite`. `origine` : adresse
 * publique du site, pour les liens (signature, tunnel). Ne lève jamais.
 */
export async function traiterCourriels(origine: string, limite = 20): Promise<BilanEnvoi> {
  const bilan: BilanEnvoi = { envoyes: 0, reportes: 0, abandonnes: 0 };
  try {
    for (let i = 0; i < limite; i += 1) {
      if (!(await traiterUn(origine.replace(/\/$/, ""), bilan))) break;
    }
  } catch (erreur) {
    console.error("[courriels] traitement interrompu :", messageErreur(erreur));
  }
  return bilan;
}

/** Ce que l'envoi d'un courriel demande : son texte, et ce qu'il faut inscrire une fois parti. */
type Preparation =
  | { contenu: Contenu; apres?: (tx: Executeur) => Promise<void> }
  | { abandon: string };

async function traiterUn(origine: string, bilan: BilanEnvoi): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(courriels)
      // Échéance comparée à l'horloge de la BASE (à la microseconde), pas à celle de Node.
      .where(and(eq(courriels.statut, "a_envoyer"), lte(courriels.prochain_essai_at, sql`now()`)))
      // Les courriels au client d'abord : l'alerte « réservation » lit le
      // contrat que la confirmation vient de créer.
      .orderBy(sql`case when ${courriels.objet} like 'alerte%' then 1 else 0 end`, asc(courriels.prochain_essai_at))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!c) return false;

    try {
      // Point de reprise : une erreur de base dans la préparation n'empêche pas
      // d'enregistrer l'échec dans la transaction principale.
      await tx.transaction(async (sp) => {
        const prep = await preparer(sp, c, origine);
        if ("abandon" in prep) {
          await sp
            .update(courriels)
            .set({ statut: "echec", derniere_erreur: prep.abandon, tentatives: c.tentatives + 1 })
            .where(eq(courriels.id, c.id));
          console.warn(`[courriels] ${c.objet} à ${c.destinataire} abandonné : ${prep.abandon}`);
          bilan.abandonnes += 1;
          return;
        }
        const [r] = await sp.select().from(reglages).where(eq(reglages.id, 1));
        if (!r) throw new Error("ligne de réglages absente");
        const envoi = await messagerie().envoyer({
          expediteur: { email: r.courriel_expediteur, nom: r.courriel_expediteur_nom },
          repondreA: r.courriel_reponse,
          destinataire: c.destinataire,
          sujet: prep.contenu.sujet,
          html: prep.contenu.html,
          texte: prep.contenu.texte,
          etiquette: c.objet,
        });
        await sp
          .update(courriels)
          .set({
            statut: "envoye",
            tentatives: c.tentatives + 1,
            derniere_erreur: null,
            sujet: prep.contenu.sujet,
            corps_texte: prep.contenu.texte,
            voie: envoi.voie,
            reference_externe: envoi.reference || null,
            envoye_at: new Date(),
          })
          .where(eq(courriels.id, c.id));
        if (prep.apres) await prep.apres(sp);
        bilan.envoyes += 1;
      });
    } catch (erreur) {
      const tentatives = c.tentatives + 1;
      const message = messageErreur(erreur).slice(0, 1000);
      if (tentatives >= ESSAIS_MAX) {
        await tx
          .update(courriels)
          .set({ statut: "echec", tentatives, derniere_erreur: message })
          .where(eq(courriels.id, c.id));
        console.error(`[courriels] ÉCHEC DÉFINITIF de ${c.objet} à ${c.destinataire} : ${message}`);
        if (OBJETS_CLIENT.has(c.objet)) {
          await inscrireProbleme(tx, "courriel_non_parti", c.id, c.reservation_id, {
            objet: c.objet,
            destinataire: c.destinataire,
            erreur: message,
          });
        }
        bilan.abandonnes += 1;
      } else {
        await tx
          .update(courriels)
          .set({
            tentatives,
            derniere_erreur: message,
            prochain_essai_at: new Date(Date.now() + DELAIS_MINUTES[tentatives - 1] * 60_000),
          })
          .where(eq(courriels.id, c.id));
        console.warn(`[courriels] ${c.objet} à ${c.destinataire} : essai ${tentatives} échoué, retenté : ${message}`);
        bilan.reportes += 1;
      }
    }
    return true;
  });
}

// ─── Préparation de chaque sorte de courriel ─────────────────────────────────

function sejour(resa: ReservationAvecGite): Sejour {
  return {
    reference: resa.reference,
    prenom: resa.client_prenom,
    gite: resa.gites?.nom ?? "",
    arrivee: resa.date_arrivee,
    depart: resa.date_depart,
  };
}

function ficheClient(resa: ReservationAvecGite): FicheClient {
  return {
    nom: [resa.client_prenom, (resa.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client",
    email: resa.client_email ?? "",
    telephone: resa.client_telephone ?? "",
    langue: resa.langue === "en" ? "en" : "fr",
  };
}

/** Le paiement reçu de la réservation (acompte ou total), en centimes. */
async function paiementRecu(tx: Executeur, reservationId: string) {
  const [p] = await tx
    .select({ montant: paiements.montant, date: paiements.date_paiement })
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.statut, "reussi")))
    .orderBy(desc(paiements.date_paiement))
    .limit(1);
  return p ? { montant: centimesDepuisNumeric(p.montant), datePaiement: p.date } : null;
}

async function adresseReponse(tx: Executeur): Promise<string> {
  const [r] = await tx.select({ reponse: reglages.courriel_reponse }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r.reponse;
}

function lienSignature(origine: string, token: string): string {
  return `${origine}/signer/${token}`;
}

/** Lien vers le tunnel, mêmes dates et voyageurs (comme la page de retour). */
function lienTunnel(origine: string, langue: Langue, resa: ReservationAvecGite, slug: string): string {
  const p = new URLSearchParams({
    gite: slug,
    arrivee: resa.date_arrivee,
    depart: resa.date_depart,
    adultes: String(resa.nb_adultes),
    enfants: String(resa.nb_enfants),
    bebes: String(resa.nb_bebes),
  });
  return `${origine}${lien(langue, `/reserver?${p.toString()}`)}`;
}

async function preparer(tx: Executeur, c: Courriel, origine: string): Promise<Preparation> {
  const langue: Langue = c.langue === "en" ? "en" : "fr";
  const resa = c.reservation_id ? await chargerReservationAvecGite(c.reservation_id, tx) : null;
  if (c.reservation_id && !resa) return { abandon: "réservation introuvable" };
  const d = c.donnees;

  switch (c.objet) {
    case "confirmation": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      const paye = await paiementRecu(tx, resa.id);
      if (!paye) return { abandon: "aucun paiement reçu enregistré" };
      let lienContrat: string | null = null;
      let apres: ((sp: Executeur) => Promise<void>) | undefined;
      // Séjour payé en une fois compris : le contrat le prévoit depuis la v3 (lot 5).
      const emis = await (await emetteur()).emettre(resa.id);
      if (emis.ok && emis.contrat.token) {
        lienContrat = lienSignature(origine, emis.contrat.token);
      } else {
        const erreur = emis.ok ? "contrat sans jeton de signature" : emis.message;
        if (c.tentatives < ESSAIS_CONTRAT_AVANT_ENVOI) throw new Error(`contrat non créé : ${erreur}`);
        apres = async (sp) => {
          await inscrireContratARelancer(sp, resa.id, RELANCE_CONTRAT_MINUTES);
          await inscrireProbleme(sp, "contrat_non_cree", resa.id, resa.id, { erreur });
        };
      }
      const contenu = texteConfirmation(
        langue,
        sejour(resa),
        recapitulatif(resa, langue, paye),
        lienContrat,
        lienSuivi(origine, langue, resa.jeton_suivi),
        await adresseReponse(tx),
      );
      return { contenu, apres };
    }

    case "contrat": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      const emis = await (await emetteur()).emettre(resa.id);
      if (!emis.ok || !emis.contrat.token) {
        throw new Error(`contrat non créé : ${emis.ok ? "contrat sans jeton de signature" : emis.message}`);
      }
      return {
        contenu: texteContrat(langue, sejour(resa), lienSignature(origine, emis.contrat.token), await adresseReponse(tx)),
      };
    }

    case "lien_suivi": {
      if (!resa) return { abandon: "réservation absente" };
      const [r] = await tx
        .select({ validite: reglages.suivi_validite_jours })
        .from(reglages)
        .where(eq(reglages.id, 1));
      if (!r) throw new Error("ligne de réglages absente");
      if (!lienOuvert(resa.date_depart, r.validite)) return { abandon: "lien expiré entre la demande et l'envoi" };
      return {
        contenu: texteLienSuivi(
          langue,
          sejour(resa),
          lienSuivi(origine, langue, resa.jeton_suivi),
          finValidite(resa.date_depart, r.validite),
          await adresseReponse(tx),
        ),
      };
    }

    case "remboursement": {
      if (!resa) return { abandon: "réservation absente" };
      const paiementId = String(d.paiementId ?? "");
      const [p] = await tx
        .select({ statut: paiements.statut, montant: paiements.montant })
        .from(paiements)
        .where(eq(paiements.reference_externe, paiementId));
      const datesPrises = d.datesPrises === true;
      const slug = resa.gites?.slug ?? "";
      let autres: { nom: string; total: number; slug: string }[] = [];
      if (datesPrises && isGiteId(slug)) {
        try {
          autres = await autresGitesLibres(slug, {
            arrivee: resa.date_arrivee,
            depart: resa.date_depart,
            adultes: resa.nb_adultes,
            enfants: resa.nb_enfants,
            bebes: resa.nb_bebes,
          });
        } catch (erreur) {
          console.error("[courriels] autres gîtes :", messageErreur(erreur));
        }
      }
      return {
        contenu: texteRemboursement(
          langue,
          sejour(resa),
          {
            montant: p ? centimesDepuisNumeric(p.montant) : Number(d.montant ?? 0),
            fait: p?.statut === "rembourse",
            datesPrises,
            autres: autres.map((a) => ({ nom: a.nom, total: a.total, lien: lienTunnel(origine, langue, resa, a.slug) })),
            lienAutresDates: `${origine}${lien(langue, `/reserver?gite=${slug}`)}`,
          },
          await adresseReponse(tx),
        ),
      };
    }

    case "alerte_reservation": {
      if (!resa) return { abandon: "réservation absente" };
      const paye = await paiementRecu(tx, resa.id);
      if (!paye) return { abandon: "aucun paiement reçu enregistré" };
      const contrat = await (await emetteur()).existant(resa.id);
      return {
        contenu: texteAlerteReservation(sejour(resa), ficheClient(resa), recapitulatif(resa, "fr", paye), {
          numero: contrat?.numero ?? null,
        }),
      };
    }

    case "alerte_signature": {
      if (!resa) return { abandon: "réservation absente" };
      return { contenu: texteAlerteSignature(sejour(resa), ficheClient(resa), String(d.numero ?? "")) };
    }

    case "alerte_probleme": {
      const probleme = await lireProbleme(tx, d);
      if (!probleme) return { abandon: `alerte de genre inconnu (${String(d.genre)})` };
      return {
        contenu: texteAlerteProbleme(probleme, resa ? sejour(resa) : null, resa ? ficheClient(resa) : null),
      };
    }
  }
}

async function lireProbleme(tx: Executeur, d: Record<string, unknown>): Promise<Probleme | null> {
  switch (d.genre) {
    case "remboursement": {
      const paiementId = String(d.paiementId ?? "");
      const [p] = await tx
        .select({ statut: paiements.statut })
        .from(paiements)
        .where(eq(paiements.reference_externe, paiementId));
      return {
        genre: "remboursement",
        paiementId,
        motif: String(d.motif ?? ""),
        datesPrises: d.datesPrises === true,
        montant: Number(d.montant ?? 0),
        // Paiement inconnu du site : aucune ligne, l'état du remboursement ne se lit que chez Stripe.
        fait: p ? p.statut === "rembourse" : null,
      };
    }
    case "contrat_non_cree":
      return { genre: "contrat_non_cree", erreur: String(d.erreur ?? "") };
    case "courriel_non_parti":
      return {
        genre: "courriel_non_parti",
        objet: String(d.objet ?? ""),
        destinataire: String(d.destinataire ?? ""),
        erreur: String(d.erreur ?? ""),
      };
    default:
      return null;
  }
}
