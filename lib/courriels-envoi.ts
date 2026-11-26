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
//
// Phase 4, lot 1 (D-28, D-29) : le courriel « facture » ÉMET la facture
// (lib/factures.ts, idempotent) au moment de l'envoi et la joint en PDF ; les
// courriels du solde relisent l'état du solde à l'envoi, et ne partent pas
// s'il a été payé entre-temps.
//
// Phase 4, lot 2 (D-16) : les courriels de la caution relisent la
// préautorisation à l'envoi, et ne partent pas si elle a changé d'état
// entre-temps (validée par le client, levée, retenue).
//
// Phase 4, lot 3 (D-31) : le courriel des coordonnées bancaires relit le
// compte et la date limite à l'envoi ; sans compte, il est abandonné et les
// propriétaires sont alertés.
//
// Phase 6 (D-40) : l'invitation à donner son avis relit, à l'envoi, que le
// séjour n'est pas annulé, qu'aucun avis n'est déposé et que le lien est
// encore ouvert ; le courriel du retrait relit que l'avis est retiré.
//
// Phase 5, lot 5 (D-42) : le courriel d'annulation relit l'annulation et ses
// remboursements à l'envoi ; le courriel « avoir » ÉMET l'avoir
// (lib/avoirs.ts, idempotent) et le joint en PDF.
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  annulations,
  avis,
  courriels,
  documents,
  factures,
  gites,
  options_sejour,
  paiements,
  PLATEFORMES,
  reglages,
  remboursements,
  retenues,
  TYPES_FACTURE,
  type Plateforme,
  type TypeFacture,
} from "@/db/schema";
import type { ResultatAvoir } from "@/lib/avoirs";
import { finLienAvis, LIBELLES_MOTIF, lienAvis, signatureAvis } from "@/lib/avis";
import { jourBlocage, jourLevee, lireReglagesCaution } from "@/lib/caution";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import type { Detenteur } from "@/lib/plateformes";
import type { ContratEmis, ResultatEmission } from "@/lib/contrat";
import { inscrireContratARelancer, inscrireProbleme, QUOI_CAUTION, type QuoiCaution } from "@/lib/courriels";
import {
  texteAlerteAvis,
  texteAlerteCaution,
  texteAlerteProbleme,
  texteAlerteReservation,
  texteCarteCaution,
  texteCautionAValider,
  texteCautionBloquee,
  texteCautionLiberee,
  texteCautionRecue,
  texteCautionRendue,
  texteCautionRetenue,
  texteCautionVirement,
  texteAlerteSignature,
  texteAnnulation,
  texteAvisInvitation,
  texteAvoir,
  texteAvisRetrait,
  texteConfirmation,
  texteContrat,
  texteContratSigne,
  texteFacture,
  texteLienSuivi,
  texteOption,
  texteRemboursement,
  texteSoldeImpaye,
  texteSoldeLien,
  texteSoldePreavis,
  type Contenu,
  type FicheClient,
  type Probleme,
  type Sejour,
} from "@/lib/courriels-textes";
import { isGiteId } from "@/lib/data/gites";
import { calculerMontants } from "@/lib/montants";
import type { ResultatFacture } from "@/lib/factures";
import { lireEntreprise, type EntrepriseFacture } from "@/lib/montants";
import { lien, type Langue } from "@/lib/i18n/langues";
import { messagerie } from "@/lib/messagerie";
import { recapitulatif } from "@/lib/recapitulatif";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { dernierJourOption, etatOption } from "@/lib/options-sejour";
import { cheminContratSigne, getStorage } from "@/lib/storage";
import { dateLimiteSolde, lireEtatSolde } from "@/lib/solde";
import { finValidite, lienOuvert, lienSuivi } from "@/lib/suivi";
import { autresGitesLibres } from "@/lib/tunnel";
import { dateLimiteVirement, lireCompteVirement } from "@/lib/virement";

/** Délais avant chaque nouvel essai, en minutes ; au-delà, le courriel est abandonné. */
const DELAIS_MINUTES = [1, 5, 15, 60, 240];
const ESSAIS_MAX = DELAIS_MINUTES.length + 1;
/** Échecs de création du contrat tolérés avant d'envoyer la confirmation sans le lien. */
const ESSAIS_CONTRAT_AVANT_ENVOI = 2;
/** Délai avant le courriel « contrat à signer » qui retente la création. */
const RELANCE_CONTRAT_MINUTES = 30;

export const OBJETS_CLIENT = new Set<string>([
  "confirmation",
  "contrat",
  "remboursement",
  "lien_suivi",
  "facture",
  "solde_preavis",
  "solde_lien",
  "solde_rappel",
  "solde_impaye",
  "caution_bloquee",
  "caution_a_valider",
  "caution_liberee",
  "caution_carte",
  "caution_virement",
  "caution_retenue",
  "caution_recue",
  "caution_rendue",
  "option",
  "contrat_signe",
  "avis_invitation",
  "avis_retrait",
  "annulation",
  "avoir",
]);

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

// ─── Émission des factures (remplaçable pour les contrôles) ──────────────────

export interface EmetteurFacture {
  emettre(reservationId: string, type: TypeFacture, entreprise?: EntrepriseFacture | null): Promise<ResultatFacture>;
  /** Le PDF d'une facture émise. */
  pdf(chemin: string): Promise<Buffer>;
}

let emetteurFactureCourant: EmetteurFacture | null = null;

/** lib/factures.ts tire le moteur PDF, comme lib/contrat.ts : chargé à la demande. */
async function emetteurFacture(): Promise<EmetteurFacture> {
  if (!emetteurFactureCourant) {
    const m = await import("@/lib/factures");
    emetteurFactureCourant = { emettre: m.emettreFacture, pdf: m.lirePdfFacture };
  }
  return emetteurFactureCourant;
}

/** POUR LES CONTRÔLES SEULEMENT (scripts/verifier-solde.ts, scripts/verifier-courriels.ts). */
export function remplacerEmetteurFacture(e: EmetteurFacture): void {
  emetteurFactureCourant = e;
}

// ─── Émission des avoirs (remplaçable pour les contrôles) ────────────────────

export interface EmetteurAvoir {
  emettre(reservationId: string): Promise<ResultatAvoir>;
  /** Le PDF d'un avoir émis. */
  pdf(chemin: string): Promise<Buffer>;
}

let emetteurAvoirCourant: EmetteurAvoir | null = null;

/** lib/avoirs.ts tire le moteur PDF : chargé à la demande. */
async function emetteurAvoir(): Promise<EmetteurAvoir> {
  if (!emetteurAvoirCourant) {
    const m = await import("@/lib/avoirs");
    emetteurAvoirCourant = { emettre: m.emettreAvoir, pdf: m.lirePdfAvoir };
  }
  return emetteurAvoirCourant;
}

/** POUR LES CONTRÔLES SEULEMENT (scripts/verifier-annulation.ts). */
export function remplacerEmetteurAvoir(e: EmetteurAvoir): void {
  emetteurAvoirCourant = e;
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
  | { contenu: Contenu; apres?: (tx: Executeur) => Promise<void>; piecesJointes?: { nom: string; contenu: Buffer }[] }
  /** `alerte` : ce qu'il faut inscrire quand l'abandon doit être signalé aux propriétaires. */
  | { abandon: string; alerte?: (tx: Executeur) => Promise<void> };

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
          if (prep.alerte) await prep.alerte(sp);
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
          piecesJointes: prep.piecesJointes,
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

/** La préautorisation de la caution d'une réservation (une au plus). */
async function cautionDe(tx: Executeur, reservationId: string) {
  const [p] = await tx
    .select()
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.type, "caution")));
  return p ?? null;
}

const enCours = (resa: ReservationAvecGite) => resa.statut === "confirmee" || resa.statut === "terminee";

async function adresseReponse(tx: Executeur): Promise<string> {
  const [r] = await tx.select({ reponse: reglages.courriel_reponse }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r.reponse;
}

/** Le délai annoncé au client pour être prévenu d'un doublon (Phase 7, D-44). */
async function delaiDoublon(tx: Executeur): Promise<number> {
  const [r] = await tx.select({ heures: reglages.doublon_delai_heures }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r.heures;
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
        await delaiDoublon(tx),
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

    case "facture": {
      if (!resa) return { abandon: "réservation absente" };
      const type = String(d.type ?? "");
      if (!(TYPES_FACTURE as readonly string[]).includes(type)) return { abandon: `type de facture inconnu (${type})` };
      const e = await emetteurFacture();
      // Facture demandée au nom d'une entreprise (D-41) : rangée dans le courriel.
      const r = await e.emettre(resa.id, type as TypeFacture, lireEntreprise(d.entreprise));
      if (!r.ok) {
        // Erreur passagère (rendu, écriture) : retentée. Refus métier : rien
        // n'est numéroté ; les propriétaires sont prévenus.
        if (r.status >= 500) throw new Error(`facture non émise : ${r.message}`);
        return {
          abandon: `facture non émise : ${r.message}`,
          alerte: (sp) => inscrireProbleme(sp, "facture_non_emise", `${resa.id}:${type}`, resa.id, { type, erreur: r.message }),
        };
      }
      const f = r.facture;
      return {
        contenu: texteFacture(
          langue,
          sejour(resa),
          { numero: f.numero, type: f.type, montant: f.montant },
          lienSuivi(origine, langue, resa.jeton_suivi),
          await adresseReponse(tx),
        ),
        piecesJointes: [{ nom: `${f.numero}.pdf`, contenu: await e.pdf(f.chemin) }],
      };
    }

    case "annulation": {
      if (!resa) return { abandon: "réservation absente" };
      const [a] = await tx.select().from(annulations).where(eq(annulations.reservation_id, resa.id));
      if (!a || resa.statut !== "annulee") return { abandon: "réservation non annulée" };
      const mouvements = await tx
        .select({ mode: remboursements.mode, montant: remboursements.montant })
        .from(remboursements)
        .where(eq(remboursements.reservation_id, resa.id));
      const somme = (mode: "carte" | "virement") =>
        mouvements.filter((m) => m.mode === mode).reduce((s, m) => s + centimesDepuisNumeric(m.montant), 0);
      const [facture] = await tx
        .select({ id: factures.id })
        .from(factures)
        .where(and(eq(factures.reservation_id, resa.id), sql`${factures.type} in ('acompte', 'solde', 'total')`))
        .limit(1);
      const rembourse = centimesDepuisNumeric(a.rembourse);
      return {
        contenu: texteAnnulation(
          langue,
          sejour(resa),
          {
            initiative: a.initiative,
            conserve: centimesDepuisNumeric(a.conserve),
            rembourse,
            taxeRemboursee: centimesDepuisNumeric(a.taxe_remboursee),
            carte: somme("carte"),
            virement: somme("virement"),
            avoirASuivre: !!facture && rembourse > 0,
          },
          await adresseReponse(tx),
        ),
      };
    }

    case "avoir": {
      if (!resa) return { abandon: "réservation absente" };
      const e = await emetteurAvoir();
      const r = await e.emettre(resa.id);
      if (!r.ok) {
        if (r.status >= 500) throw new Error(`avoir non émis : ${r.message}`);
        return {
          abandon: `avoir non émis : ${r.message}`,
          alerte: (sp) => inscrireProbleme(sp, "facture_non_emise", `${resa.id}:avoir`, resa.id, { type: "avoir", erreur: r.message }),
        };
      }
      const corrigees = await tx
        .select({ numero: factures.numero })
        .from(factures)
        .where(and(eq(factures.reservation_id, resa.id), sql`${factures.type} in ('acompte', 'solde', 'total')`))
        .orderBy(asc(factures.date_emission), asc(factures.numero));
      return {
        contenu: texteAvoir(
          langue,
          sejour(resa),
          { numero: r.avoir.numero, montant: r.avoir.montant, factures: corrigees.map((f) => f.numero) },
          await adresseReponse(tx),
        ),
        piecesJointes: [{ nom: `${r.avoir.numero}.pdf`, contenu: await e.pdf(r.avoir.chemin) }],
      };
    }

    case "solde_preavis":
    case "solde_lien":
    case "solde_rappel":
    case "solde_impaye": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      const etat = await lireEtatSolde(tx, resa);
      if (!etat) return { abandon: "aucun solde pour cette réservation" };
      if (etat.etat === "paye") return { abandon: "solde payé entre-temps" };
      if (c.objet === "solde_preavis" && etat.etat !== "prelevement_prevu") {
        return { abandon: `prélèvement plus prévu (${etat.etat})` };
      }
      const faits = { montant: etat.montant, date: dateLimiteSolde(resa) };
      const suivi = lienSuivi(origine, langue, resa.jeton_suivi);
      const contact = await adresseReponse(tx);
      if (c.objet === "solde_preavis") return { contenu: texteSoldePreavis(langue, sejour(resa), faits, suivi, contact) };
      if (c.objet === "solde_impaye") {
        const motif = d.motif === "refus" ? "refus" : "echeance";
        return { contenu: texteSoldeImpaye(langue, sejour(resa), { ...faits, motif }, suivi, contact) };
      }
      return {
        contenu: texteSoldeLien(langue, sejour(resa), { ...faits, rappel: c.objet === "solde_rappel" }, suivi, contact),
      };
    }

    case "caution_bloquee":
    case "caution_a_valider":
    case "caution_liberee": {
      if (!resa) return { abandon: "réservation absente" };
      if (!enCours(resa)) return { abandon: `réservation au statut « ${resa.statut} »` };
      const caution = await cautionDe(tx, resa.id);
      const attendu = { caution_bloquee: ["bloque"], caution_a_valider: ["echoue", "en_attente"], caution_liberee: ["libere"] }[c.objet];
      if (!caution || !attendu.includes(caution.statut)) {
        return { abandon: `caution ${caution ? `à l'état « ${caution.statut} »` : "absente"} au moment de l'envoi` };
      }
      const montant = centimesDepuisNumeric(caution.montant);
      const contact = await adresseReponse(tx);
      const suivi = lienSuivi(origine, langue, resa.jeton_suivi);
      if (c.objet === "caution_bloquee") {
        return { contenu: texteCautionBloquee(langue, sejour(resa), { montant, levee: jourLevee(resa.date_depart) }, suivi, contact) };
      }
      if (c.objet === "caution_a_valider") {
        const authentification = d.refus === "authentication_required";
        return { contenu: texteCautionAValider(langue, sejour(resa), { montant, authentification }, suivi, contact) };
      }
      const date = caution.date_liberation ? caution.date_liberation.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : resa.date_depart;
      return {
        contenu: texteCautionLiberee(
          langue,
          sejour(resa),
          { montant, date, carteEffacee: resa.stripe_payment_method_id === null },
          contact,
        ),
      };
    }

    case "caution_carte": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      if (resa.stripe_payment_method_id) return { abandon: "carte enregistrée entre-temps" };
      if (resa.caution === null) return { abandon: "montant de la caution absent" };
      return {
        contenu: texteCarteCaution(
          langue,
          sejour(resa),
          { montant: resa.caution, moyen: resa.moyen_caution ?? null },
          lienSuivi(origine, langue, resa.jeton_suivi),
          await adresseReponse(tx),
        ),
      };
    }

    case "caution_virement": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      if (resa.moyen_caution !== "virement") return { abandon: `caution par ${resa.moyen_caution ?? "un moyen inconnu"}` };
      if (resa.caution === null || resa.caution <= 0) return { abandon: "montant de la caution absent" };
      if (resa.caution_recue_at) return { abandon: "virement déjà noté reçu" };
      const dateLimite = dateLimiteVirement(resa);
      if (aujourdhuiParis() > dateLimite) return { abandon: "date limite du virement passée avant l'envoi" };
      const compte = await lireCompteVirement(tx);
      if (!compte) {
        return {
          abandon: "compte de la caution par virement absent des réglages",
          alerte: (sp) => inscrireProbleme(sp, "virement_coordonnees_absentes", resa.id, resa.id),
        };
      }
      return {
        contenu: texteCautionVirement(
          langue,
          sejour(resa),
          { montant: resa.caution, dateLimite, restitution: jourLevee(resa.date_depart), compte },
          lienSuivi(origine, langue, resa.jeton_suivi),
          await adresseReponse(tx),
        ),
      };
    }

    // Phase 5, lot 2 : retenue sur la caution, caution par chèque ou virement reçue, rendue.
    case "caution_retenue": {
      if (!resa) return { abandon: "réservation absente" };
      const [r] = await tx.select().from(retenues).where(eq(retenues.reservation_id, resa.id));
      if (!r?.faite_at) return { abandon: "retenue absente ou inachevée au moment de l'envoi" };
      // Le montant de la caution : celui de la préautorisation pour une carte, celui de la réservation sinon.
      const carte = r.moyen === "carte" ? await cautionDe(tx, resa.id) : null;
      const montant = carte ? centimesDepuisNumeric(carte.montant) : (resa.caution ?? 0);
      const stockage = getStorage();
      const piecesJointes = [];
      for (const piece of r.pieces) piecesJointes.push({ nom: piece.nom, contenu: await stockage.read(piece.chemin) });
      return {
        contenu: texteCautionRetenue(
          langue,
          sejour(resa),
          { montant, retenu: centimesDepuisNumeric(r.montant), motif: r.motif, moyen: r.moyen, pieces: r.pieces.length },
          await adresseReponse(tx),
        ),
        piecesJointes,
      };
    }

    case "caution_recue":
    case "caution_rendue": {
      if (!resa) return { abandon: "réservation absente" };
      if (resa.moyen_caution !== "cheque" && resa.moyen_caution !== "virement") return { abandon: "caution ni par chèque ni par virement" };
      const montant = resa.caution ?? 0;
      if (c.objet === "caution_recue") {
        if (!resa.caution_recue_at) return { abandon: "caution plus notée reçue au moment de l'envoi" };
        return { contenu: texteCautionRecue(langue, sejour(resa), { montant, moyen: resa.moyen_caution }, await adresseReponse(tx)) };
      }
      if (!resa.caution_rendue_at) return { abandon: "caution plus notée rendue au moment de l'envoi" };
      return { contenu: texteCautionRendue(langue, sejour(resa), { montant }, await adresseReponse(tx)) };
    }

    // Phase 5, lot 4 : le lien d'une option posée au téléphone ; le contrat signé renvoyé.
    case "option": {
      const [o] = await tx
        .select({ o: options_sejour, gite: gites.nom })
        .from(options_sejour)
        .innerJoin(gites, eq(gites.id, options_sejour.gite_id))
        .where(eq(options_sejour.id, String(d.optionId ?? "")));
      if (!o) return { abandon: "option introuvable" };
      const etat = etatOption(o.o);
      if (etat !== "en_cours") return { abandon: `option ${etat} au moment de l'envoi` };
      return {
        contenu: texteOption(
          langue,
          {
            nom: o.o.client_nom,
            gite: o.gite,
            arrivee: o.o.date_arrivee,
            depart: o.o.date_depart,
            dernierJour: dernierJourOption(o.o.expire_at),
          },
          `${origine}${lien(langue, `/reserver?option=${o.o.jeton}`)}`,
          await adresseReponse(tx),
        ),
      };
    }

    case "contrat_signe": {
      if (!resa) return { abandon: "réservation absente" };
      const [doc] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.reservation_id, resa.id), eq(documents.type, "contrat_location")));
      if (!doc || doc.statut !== "signe" || !doc.date_signature) return { abandon: "contrat non signé au moment de l'envoi" };
      return {
        contenu: texteContratSigne(
          langue,
          sejour(resa),
          { numero: doc.numero, signeLe: aujourdhuiParis(doc.date_signature) },
          lienSuivi(origine, langue, resa.jeton_suivi),
          await adresseReponse(tx),
        ),
        piecesJointes: [
          { nom: `${doc.numero}-signe.pdf`, contenu: await getStorage().read(cheminContratSigne(resa.id, doc.numero)) },
        ],
      };
    }

    // Phase 6 (D-40) : les avis des clients.
    case "avis_invitation": {
      if (!resa) return { abandon: "réservation absente" };
      if (!enCours(resa)) return { abandon: `réservation au statut « ${resa.statut} »` };
      const [depose] = await tx.select({ id: avis.id }).from(avis).where(eq(avis.reservation_id, resa.id));
      if (depose) return { abandon: "avis déjà déposé" };
      const [r] = await tx.select({ jours: reglages.avis_lien_jours }).from(reglages).where(eq(reglages.id, 1));
      if (!r) throw new Error("ligne de réglages absente");
      const fin = finLienAvis(resa.date_depart, r.jours);
      if (aujourdhuiParis() > fin) return { abandon: "lien de l'avis expiré" };
      return {
        contenu: texteAvisInvitation(
          langue,
          sejour(resa),
          { lienAvis: lienAvis(origine, langue, resa.jeton_suivi), signature: signatureAvis(resa.client_prenom, resa.client_nom), finValidite: fin },
          await adresseReponse(tx),
        ),
      };
    }

    case "avis_retrait": {
      if (!resa) return { abandon: "réservation absente" };
      const [a] = await tx.select().from(avis).where(eq(avis.id, String(d.avisId ?? "")));
      if (!a) return { abandon: "avis introuvable (effacé)" };
      if (!a.retire_at || !a.motif_retrait) return { abandon: "avis plus retiré au moment de l'envoi" };
      return {
        contenu: texteAvisRetrait(
          langue,
          sejour(resa),
          {
            publieLe: aujourdhuiParis(a.created_at),
            motif: LIBELLES_MOTIF[a.motif_retrait][langue],
            aLaDemande: a.motif_retrait === "demande_auteur",
            lienPolitique: `${origine}${lien(langue, "/legal/avis")}`,
          },
          await adresseReponse(tx),
        ),
      };
    }

    case "alerte_avis": {
      if (!resa) return { abandon: "réservation absente" };
      const [a] = await tx.select().from(avis).where(eq(avis.id, String(d.avisId ?? "")));
      if (!a) return { abandon: "avis introuvable (effacé)" };
      if (a.retire_at) return { abandon: "avis déjà retiré" };
      return {
        contenu: texteAlerteAvis(sejour(resa), ficheClient(resa), a, `${origine}/gestion/avis`),
      };
    }

    case "alerte_caution": {
      if (!resa) return { abandon: "réservation absente" };
      const quoi = (QUOI_CAUTION as readonly unknown[]).includes(d.quoi) ? (d.quoi as QuoiCaution) : null;
      if (!quoi) return { abandon: `alerte de caution inconnue (${String(d.quoi)})` };
      const caution = await cautionDe(tx, resa.id);
      if (quoi === "levee_demain" && caution?.statut !== "bloque") return { abandon: "caution plus bloquée" };
      if ((quoi === "virement_a_verifier" || quoi === "virement_a_rendre") && resa.moyen_caution !== "virement") {
        return { abandon: `caution par ${resa.moyen_caution ?? "un moyen inconnu"}` };
      }
      if (quoi === "virement_a_verifier" && resa.statut !== "confirmee") return { abandon: `réservation au statut « ${resa.statut} »` };
      if (quoi === "virement_a_rendre" && !enCours(resa)) return { abandon: `réservation au statut « ${resa.statut} »` };
      // Phase 5, lot 2 : ce que les propriétaires ont déjà noté dans le back-office.
      if (quoi === "virement_a_verifier" && resa.caution_recue_at) return { abandon: "virement déjà noté reçu" };
      if (quoi === "virement_a_rendre" && resa.caution_rendue_at) return { abandon: "caution déjà notée rendue" };
      const r = await lireReglagesCaution(tx);
      const montant = caution ? centimesDepuisNumeric(caution.montant) : resa.caution;
      if (montant === null) return { abandon: "montant de la caution absent" };
      return {
        contenu: texteAlerteCaution(quoi, sejour(resa), ficheClient(resa), {
          montant,
          expire: caution?.statut === "bloque" ? caution.expire_at : null,
          levee: jourLevee(resa.date_depart),
          heureLevee: r.liberation,
          veille: jourBlocage(resa.date_depart),
          heureBlocage: r.blocage,
          dateLimiteVirement: dateLimiteVirement(resa),
        }),
      };
    }

    case "alerte_probleme": {
      if (d.genre === "solde_impaye" && resa && (await lireEtatSolde(tx, resa))?.etat === "paye") {
        return { abandon: "solde payé entre-temps" };
      }
      if (d.genre === "caution_refusee" && resa && (await cautionDe(tx, resa.id))?.statut === "bloque") {
        return { abandon: "caution validée par le client entre-temps" };
      }
      const probleme = await lireProbleme(tx, d, resa);
      if (!probleme) return { abandon: `alerte de genre inconnu (${String(d.genre)})` };
      return {
        contenu: texteAlerteProbleme(probleme, resa ? sejour(resa) : null, resa ? ficheClient(resa) : null),
      };
    }
  }
}

async function lireProbleme(
  tx: Executeur,
  d: Record<string, unknown>,
  resa: ReservationAvecGite | null,
): Promise<Probleme | null> {
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
    case "solde_impaye":
      if (!resa) return null;
      return {
        genre: "solde_impaye",
        motif: d.motif === "refus" ? "refus" : "echeance",
        refus: typeof d.refus === "string" ? d.refus : null,
        montant: calculerMontants(resa).solde,
        dateLimite: dateLimiteSolde(resa),
        relance: d.relance === true,
        jours: typeof d.jours === "number" ? d.jours : null,
      };
    case "solde_a_verifier":
      return { genre: "solde_a_verifier", montant: Number(d.montant ?? 0), depuis: String(d.depuis ?? "") };
    case "facture_non_emise":
      return { genre: "facture_non_emise", type: String(d.type ?? ""), erreur: String(d.erreur ?? "") };
    case "caution_refusee": {
      if (!resa) return null;
      const caution = await cautionDe(tx, resa.id);
      return {
        genre: "caution_refusee",
        montant: caution ? centimesDepuisNumeric(caution.montant) : (resa.caution ?? 0),
        refus: typeof d.refus === "string" ? d.refus : null,
        depart: resa.date_depart,
      };
    }
    case "caution_montant_absent":
      return { genre: "caution_montant_absent" };
    case "caution_a_verifier":
      return { genre: "caution_a_verifier", montant: Number(d.montant ?? 0), depuis: String(d.depuis ?? "") };
    case "virement_coordonnees_absentes":
      if (!resa) return null;
      return { genre: "virement_coordonnees_absentes", montant: resa.caution ?? 0, dateLimite: dateLimiteVirement(resa) };
    case "virement_compte_modifie": {
      const compte = (v: unknown): { titulaire: string; iban: string } | null => {
        const o = v as { titulaire?: unknown; iban?: unknown } | null;
        return o && typeof o.titulaire === "string" && typeof o.iban === "string" ? { titulaire: o.titulaire, iban: o.iban } : null;
      };
      return {
        genre: "virement_compte_modifie",
        quand: String(d.quand ?? ""),
        appareil: String(d.appareil ?? "un appareil inconnu"),
        avant: compte(d.avant),
        apres: compte(d.apres),
      };
    }
    case "contestation":
      return {
        genre: "contestation",
        paiementId: typeof d.paiementId === "string" ? d.paiementId : null,
        type: typeof d.type === "string" ? d.type : null,
        montant: Number(d.montant ?? 0),
        motif: String(d.motif ?? ""),
      };
    case "doublon":
      if (!PLATEFORMES.includes(d.plateforme as Plateforme) || !Array.isArray(d.detenteurs)) return null;
      return {
        genre: "doublon",
        plateforme: d.plateforme as Plateforme,
        gite: String(d.gite ?? ""),
        arrivee: String(d.arrivee ?? ""),
        depart: String(d.depart ?? ""),
        detenteurs: d.detenteurs as Detenteur[],
        delaiHeures: Number(d.delaiHeures ?? 0),
        vuLe: String(d.vuLe ?? ""),
      };
    default:
      return null;
  }
}
