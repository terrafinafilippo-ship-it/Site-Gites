// LA CAUTION PAR CARTE (Phase 4, lot 2, D-16, art. 6 du contrat).
//
// Exemple : Camille quitte L'Armu le samedi 27 mars 2027, caution de 500 €.
//   - vendredi 26 mars, à partir de `caution_heure_blocage` (18 h) :
//     préautorisation de 500 € sur la carte enregistrée à la réservation,
//     sans débit. Bloquée : courriel à Camille le jour même (art. 6.2) et
//     court message aux propriétaires. Refusée ou authentification exigée :
//     courriel avec le lien pour la valider sur « Ma réservation » (même
//     carte ou une autre), alerte « À TRAITER » aux propriétaires ; le site ne
//     réessaie pas tout seul (choix du gérant du 2 novembre 2026). Un passage
//     manqué le vendredi soir est rattrapé le samedi ;
//   - lundi 29 mars à `caution_heure_alerte` (8 h) : alerte aux propriétaires,
//     « levée demain » ;
//   - mardi 30 mars à `caution_heure_liberation` (8 h), soit 3 jours après le
//     départ (art. 6.4, 6.5) : levée automatique de la préautorisation si
//     rien n'a été retenu, courriel à Camille, réservation « terminée » ; une
//     préautorisation refusée et jamais validée est close ;
//   - la carte est supprimée chez Stripe dès la levée ou la retenue, et au
//     plus tard 7 jours après le départ (art. 6.5) ; tout de suite pour une
//     réservation annulée.
// Un séjour SANS préautorisation (chèque, virement, sans caution) passe
// « terminé » au même moment que la levée : mardi 30 mars à 8 h (Phase 4,
// lot 3, choix du gérant du 3 novembre 2026).
// La RETENUE (encaissement d'une partie) et la levée anticipée se font depuis
// l'écran de gestion (Phase 5, lot 2, lib/gestion/cautions.ts) ; une retenue
// faite dans le tableau de bord Stripe est constatée (avis de Stripe) et
// enregistrée.
//
// Caution non constituée à l'arrivée (art. 6.6) : `demanderCarteCaution`
// (bouton de l'écran de gestion, Phase 5) envoie au client le lien pour
// enregistrer une carte sur « Ma réservation » ; la préautorisation suit
// alors le même calendrier.
//
// UNE préautorisation par réservation (une ligne `paiements` de type
// « caution », clé d'idempotence `caution-{réservation}` chez Stripe),
// écrite AVANT l'appel, comme le prélèvement du solde : une panne entre la
// réponse et l'écriture se rejoue sans second blocage. Un montant de caution
// absent n'est jamais remplacé par une valeur par défaut : alerte, rien
// n'est bloqué.
//
// Les JOURS (veille du départ, 3 jours, 7 jours) sont ceux du contrat et du
// texte d'accord : des constantes, pas des réglages. Les HEURES sont des
// réglages (`reglages.caution_heure_*`), lus à chaque passage.
//
// MONTANTS EN CENTIMES ENTIERS.
import { timingSafeEqual } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements, reglages, reservations, type StatutPaiement } from "@/db/schema";
import type { MoyenCaution } from "@/db/schema/reservations";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import {
  inscrireAlerteCaution,
  inscrireCarteCaution,
  inscrireCautionAValider,
  inscrireCautionBloquee,
  inscrireCautionLiberee,
  inscrireProbleme,
} from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis, heureParis } from "@/lib/dates-civiles";
import type { CompteVirement } from "@/lib/iban";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { prestataire, type EtatPaiement, type Prestataire } from "@/lib/stripe";

/** Levée de la caution au plus tard ce nombre de jours après le départ (art. 6.4, 6.5 du contrat). */
export const LEVEE_JOURS = 3;
/** Données de carte supprimées au plus tard ce nombre de jours après le départ (art. 6.5). */
export const EFFACEMENT_CARTE_JOURS = 7;
/** Au-delà, une préautorisation restée sans réponse n'est plus rejouée (la clé d'idempotence de Stripe dure 24 h). */
const REJEU_HEURES = 20;

export interface ReglagesCaution {
  /** hh:mm, heure de Paris. */
  blocage: string;
  alerte: string;
  liberation: string;
}

export async function lireReglagesCaution(ex: Executeur): Promise<ReglagesCaution> {
  const [r] = await ex
    .select({
      blocage: reglages.caution_heure_blocage,
      alerte: reglages.caution_heure_alerte,
      liberation: reglages.caution_heure_liberation,
    })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return { blocage: r.blocage.slice(0, 5), alerte: r.alerte.slice(0, 5), liberation: r.liberation.slice(0, 5) };
}

// ─── Le calendrier ───────────────────────────────────────────────────────────

/** Jour de la préautorisation : la veille du départ (art. 6.2). */
export const jourBlocage = (depart: string) => ajouterJours(depart, -1);
/** Jour de l'alerte aux propriétaires : la veille de la levée. */
export const jourAlerte = (depart: string) => ajouterJours(depart, LEVEE_JOURS - 1);
/** Jour de la levée automatique. */
export const jourLevee = (depart: string) => ajouterJours(depart, LEVEE_JOURS);

/** Le moment `jour` à `heure` (hh:mm, Paris) est-il atteint ? */
export function atteint(aujourdhui: string, heure: string, jour: string, heureCible: string): boolean {
  return aujourdhui > jour || (aujourdhui === jour && heure >= heureCible);
}

type LignePaiement = typeof paiements.$inferSelect;

async function ligneCaution(ex: Executeur, reservationId: string): Promise<LignePaiement | null> {
  const [l] = await ex
    .select()
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.type, "caution")));
  return l ?? null;
}

// ─── Ce que voit le client (« Ma réservation ») ──────────────────────────────

export type EtatCaution =
  /** Carte enregistrée : préautorisation prévue le `date` (veille du départ). */
  | { etat: "prevue"; montant: number; date: string }
  /** Préautorisation refusée ou authentification exigée : à valider en ligne. */
  | { etat: "a_valider"; montant: number }
  /** Caution non constituée à l'arrivée (art. 6.6) : carte à enregistrer. */
  | { etat: "carte_a_enregistrer"; montant: number; moyen: MoyenCaution | null }
  /** Fonds bloqués, levés au plus tard le `levee`. */
  | { etat: "bloquee"; montant: number; levee: string }
  | { etat: "levee"; montant: number; date: Date | null }
  | { etat: "retenue"; montant: number; retenu: number; date: Date | null }
  /**
   * Caution par virement (Phase 4, lot 3, lib/virement.ts) : les coordonnées
   * du compte, montrées du jour du courriel à la date limite incluse.
   */
  | { etat: "virement"; montant: number; dateLimite: string; reference: string; compte: CompteVirement };


/** L'état de la caution par carte d'une réservation, ou `null` s'il n'y en a pas (ou plus rien à en dire). */
export async function lireEtatCaution(
  ex: Executeur,
  resa: ReservationAvecGite,
  aujourdhui: string = aujourdhuiParis(),
): Promise<EtatCaution | null> {
  const montant = resa.caution;
  if (montant === null || montant <= 0) return null;
  const ligne = await ligneCaution(ex, resa.id);
  if (ligne) {
    const m = centimesDepuisNumeric(ligne.montant);
    switch (ligne.statut) {
      case "bloque":
        return { etat: "bloquee", montant: m, levee: jourLevee(resa.date_depart) };
      case "libere":
        return { etat: "levee", montant: m, date: ligne.date_liberation };
      case "retenu":
        return { etat: "retenue", montant: m, retenu: centimesDepuisNumeric(ligne.montant_retenu ?? "0"), date: ligne.date_paiement };
      case "echoue":
        return aujourdhui < jourLevee(resa.date_depart) ? { etat: "a_valider", montant: m } : null;
      case "en_attente":
        if (ligne.reference_externe && aujourdhui < jourLevee(resa.date_depart)) return { etat: "a_valider", montant: m };
        return ligne.reference_externe ? null : { etat: "prevue", montant: m, date: jourBlocage(resa.date_depart) };
      default:
        return null;
    }
  }
  if (aujourdhui > resa.date_depart) return null;
  if (resa.stripe_customer_id && resa.stripe_payment_method_id) {
    return { etat: "prevue", montant, date: jourBlocage(resa.date_depart) };
  }
  if (resa.carte_caution_demandee_at) return { etat: "carte_a_enregistrer", montant, moyen: resa.moyen_caution ?? null };
  return null;
}

// ─── Le constat (tâches, retour du client, avis de Stripe) ───────────────────

export interface IssueCaution {
  issue: "CAUTION";
  reservationId: string;
  statut: StatutPaiement;
}

/**
 * Constate l'état de la préautorisation chez le prestataire et en tire les
 * conséquences, une seule fois (ligne verrouillée par l'appelant :
 * lib/paiement.ts, constaterPaiement, ou les tâches ci-dessous).
 */
export async function constaterCaution(tx: Executeur, ligne: LignePaiement, etat: EtatPaiement): Promise<IssueCaution> {
  const reservationId = ligne.reservation_id;
  const fin = (statut: StatutPaiement): IssueCaution => ({ issue: "CAUTION", reservationId, statut });
  // Levée, retenue ou close : définitif (art. 6.5 : aucun débit après la levée).
  if (ligne.statut === "libere" || ligne.statut === "retenu" || ligne.statut === "annule") return fin(ligne.statut);
  const maj = (v: Partial<typeof paiements.$inferInsert>) =>
    tx.update(paiements).set({ reference_externe: etat.id, ...v }).where(eq(paiements.id, ligne.id));

  switch (etat.statut) {
    case "bloque":
      if (ligne.statut !== "bloque") {
        if (etat.montant !== centimesDepuisNumeric(ligne.montant)) {
          console.warn(`[caution] ${etat.id} : ${etat.montant} centimes bloqués, ${ligne.montant} € attendus`);
        }
        await maj({ statut: "bloque", expire_at: etat.expireLe });
        await inscrireCautionBloquee(tx, reservationId);
        console.info(`[caution] caution bloquée (${etat.id})`);
      }
      return fin("bloque");
    case "reussi":
      // Encaissée (retenue), depuis le tableau de bord Stripe ou l'écran de gestion.
      if (etat.montantEncaisse <= 0) return fin(ligne.statut);
      await maj({
        statut: "retenu",
        montant_retenu: numericDepuisCentimes(etat.montantEncaisse),
        date_paiement: new Date(),
      });
      console.info(`[caution] caution retenue : ${etat.montantEncaisse} centimes (${etat.id})`);
      return fin("retenu");
    case "annule":
      if (ligne.statut === "bloque") {
        // Levée par le site, ou expirée chez la banque : rien n'a été débité.
        await maj({ statut: "libere", date_liberation: new Date() });
        await inscrireCautionLiberee(tx, reservationId);
        return fin("libere");
      }
      await maj({ statut: "annule" });
      return fin("annule");
    case "echoue":
      if (ligne.statut !== "echoue") await maj({ statut: "echoue" });
      // Une seule fois par réservation (clés des courriels) : un nouvel échec
      // du client sur sa page n'envoie rien de plus.
      await inscrireCautionAValider(tx, reservationId, etat.dernierRefus);
      return fin("echoue");
    default:
      // En attente (authentification en cours chez le client).
      if (!ligne.reference_externe) await maj({});
      return fin(ligne.statut);
  }
}

/** Constat sous verrou d'une préautorisation dont on vient de lire l'état (aussi : back-office, lib/gestion/cautions.ts). */
export async function constaterSousVerrou(ligneId: string, etat: EtatPaiement): Promise<IssueCaution | null> {
  return getDb().transaction(async (tx) => {
    const [ligne] = await tx.select().from(paiements).where(eq(paiements.id, ligneId)).for("update");
    return ligne ? constaterCaution(tx, ligne, etat) : null;
  });
}

// ─── La validation par le client (« Ma réservation ») ────────────────────────

export type OuvertureCaution =
  | { ok: true; mode: "paiement" | "enregistrement"; clientSecret: string; montant: number }
  | { ok: false; raison: "non_due" | "bloquee" };

/**
 * Le client valide sa caution sur sa page : la préautorisation refusée est
 * réutilisée (même paiement chez Stripe, confirmé par lui, avec
 * authentification, avec la même carte ou une autre) ; ou, caution non
 * constituée à l'arrivée (art. 6.6), une carte est enregistrée — `accord` est
 * le texte d'accord qu'il a sous les yeux, recopié sur la réservation.
 * LÈVE PaiementIndisponible si le prestataire ne répond pas.
 */
export async function ouvrirCaution(
  reservationId: string,
  accord: { id: string; texte: string } | null,
  p: Prestataire = prestataire(),
): Promise<OuvertureCaution> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa || (resa.statut !== "confirmee" && resa.statut !== "terminee")) return { ok: false, raison: "non_due" };
  const etat = await lireEtatCaution(db, resa);
  if (!etat) return { ok: false, raison: "non_due" };
  if (etat.etat === "bloquee") return { ok: false, raison: "bloquee" };

  if (etat.etat === "a_valider") {
    const ligne = await ligneCaution(db, resa.id);
    if (!ligne?.reference_externe) return { ok: false, raison: "non_due" };
    const chez = await p.lirePaiement(ligne.reference_externe);
    if (chez.statut === "bloque" || chez.statut === "reussi" || chez.statut === "annule") {
      const issue = await constaterSousVerrou(ligne.id, chez);
      return { ok: false, raison: issue?.statut === "bloque" ? "bloquee" : "non_due" };
    }
    if (!chez.clientSecret) return { ok: false, raison: "non_due" };
    return { ok: true, mode: "paiement", clientSecret: chez.clientSecret, montant: etat.montant };
  }

  if (etat.etat === "carte_a_enregistrer") {
    if (!accord) return { ok: false, raison: "non_due" };
    const si = await p.creerEnregistrement({
      reservationId: resa.id,
      reference: resa.reference,
      customerId: resa.stripe_customer_id,
      client: { email: resa.client_email ?? "", nom: [resa.client_prenom, resa.client_nom].filter(Boolean).join(" ") },
    });
    if (!si.clientSecret) return { ok: false, raison: "non_due" };
    // L'accord lu par le client, mot pour mot, comme dans le tunnel ; et son
    // client Stripe, auquel la carte sera rattachée.
    await db
      .update(reservations)
      .set({
        stripe_customer_id: si.customerId,
        ...(resa.accord_carte_id ? {} : { accord_carte_id: accord.id, accord_carte_texte: accord.texte }),
      })
      .where(eq(reservations.id, resa.id));
    return { ok: true, mode: "enregistrement", clientSecret: si.clientSecret, montant: etat.montant };
  }
  return { ok: false, raison: "non_due" };
}

export type IssueEnregistrement =
  | { issue: "CARTE_ENREGISTREE" | "EN_ATTENTE" | "ECHOUE"; reservationId: string }
  | { issue: "INCONNU" };

/**
 * Carte enregistrée pour la caution (art. 6.6) : rattachée à la réservation,
 * la préautorisation suivra la veille du départ. Idempotent ; appelée par le
 * retour du client et par l'avis de Stripe.
 */
export async function constaterEnregistrement(id: string, p: Prestataire = prestataire()): Promise<IssueEnregistrement> {
  const si = await p.lireEnregistrement(id);
  if (!si.reservationId) return { issue: "INCONNU" };
  const reservationId = si.reservationId;
  if (si.statut === "echoue") return { issue: "ECHOUE", reservationId };
  if (si.statut !== "reussi" || !si.paymentMethodId || !si.customerId) return { issue: "EN_ATTENTE", reservationId };
  return getDb().transaction(async (tx) => {
    const [resa] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!resa || !resa.carte_caution_demandee_at) return { issue: "INCONNU" } as const;
    if (resa.stripe_payment_method_id !== si.paymentMethodId) {
      await tx
        .update(reservations)
        .set({ stripe_customer_id: si.customerId, stripe_payment_method_id: si.paymentMethodId })
        .where(eq(reservations.id, reservationId));
      await inscrireAlerteCaution(tx, reservationId, "carte_enregistree");
      console.info(`[caution] carte enregistrée pour la caution (${id})`);
    }
    return { issue: "CARTE_ENREGISTREE", reservationId } as const;
  });
}

/** Retour du client après l'enregistrement : seul son navigateur connaît le secret. */
export async function constaterRetourEnregistrement(
  id: string,
  secret: string,
  p: Prestataire = prestataire(),
): Promise<IssueEnregistrement | null> {
  const si = await p.lireEnregistrement(id);
  const a = Buffer.from(si.clientSecret ?? "");
  const b = Buffer.from(secret);
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return constaterEnregistrement(id, p);
}

// ─── Le lien « enregistrer une carte » (art. 6.6) ────────────────────────────

export type DemandeCarte =
  | { ok: true }
  | { ok: false; raison: "introuvable" | "non_confirmee" | "carte_deja_enregistree" | "sans_caution" | "depart_passe" };

/**
 * La caution n'a pas été constituée à l'arrivée (chèque non remis, virement
 * non reçu) : le client reçoit le lien pour enregistrer une carte. Appelée par
 * le bouton de l'écran de gestion (Phase 5).
 */
export async function demanderCarteCaution(reservationId: string, maintenant: Date = new Date()): Promise<DemandeCarte> {
  return getDb().transaction(async (tx) => {
    const [resa] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!resa) return { ok: false, raison: "introuvable" } as const;
    if (resa.statut !== "confirmee") return { ok: false, raison: "non_confirmee" } as const;
    if (resa.stripe_payment_method_id) return { ok: false, raison: "carte_deja_enregistree" } as const;
    if (resa.caution === null || centimesDepuisNumeric(resa.caution) <= 0) return { ok: false, raison: "sans_caution" } as const;
    if (aujourdhuiParis(maintenant) > resa.date_depart) return { ok: false, raison: "depart_passe" } as const;
    if (!resa.carte_caution_demandee_at) {
      await tx.update(reservations).set({ carte_caution_demandee_at: maintenant }).where(eq(reservations.id, reservationId));
    }
    await inscrireCarteCaution(tx, reservationId);
    return { ok: true } as const;
  });
}

// ─── Les tâches automatiques ─────────────────────────────────────────────────

export interface BilanCautions {
  bloquees: number;
  refusees: number;
  levees: number;
  cartesEffacees: number;
  /** Séjours sans préautorisation passés « terminés » (lot 3). */
  terminees: number;
  erreurs: number;
}

/**
 * Un passage des tâches sur les cautions : préautorisations, alerte la veille
 * de la levée, levées, effacement des cartes. `maintenant` : l'heure du
 * passage (les contrôles la fixent). Une réservation en erreur n'arrête pas
 * les autres : journalisée, reprise au passage suivant.
 */
export async function traiterCautions(maintenant: Date = new Date(), p: Prestataire = prestataire()): Promise<BilanCautions> {
  const db = getDb();
  const bilan: BilanCautions = { bloquees: 0, refusees: 0, levees: 0, cartesEffacees: 0, terminees: 0, erreurs: 0 };
  const aujourdhui = aujourdhuiParis(maintenant);
  const heure = heureParis(maintenant);
  const r = await lireReglagesCaution(db);
  const essayer = async (id: string, quoi: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error(`[caution] ${quoi}, réservation ${id} : ${messageErreur(erreur)}`);
    }
  };

  // 1. Préautorisations : départ demain (à partir de l'heure réglée) ou
  //    aujourd'hui (passage de la veille manqué), carte enregistrée.
  const aBloquer = await db
    .select({ id: reservations.id, depart: reservations.date_depart })
    .from(reservations)
    .where(
      and(
        eq(reservations.statut, "confirmee"),
        sql`${reservations.stripe_customer_id} is not null and ${reservations.stripe_payment_method_id} is not null`,
        sql`${reservations.date_depart} between ${aujourdhui}::date and ${ajouterJours(aujourdhui, 1)}::date`,
        sql`not exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
              and ${paiements.type} = 'caution' and ${paiements.reference_externe} is not null)`,
      ),
    );
  for (const { id, depart } of aBloquer) {
    if (!atteint(aujourdhui, heure, jourBlocage(depart), r.blocage)) continue;
    await essayer(id, "préautorisation", () => bloquer(id, maintenant, p, bilan));
  }

  // 2. et 3. Alerte la veille de la levée, puis levée.
  const ouvertes = await db
    .select({ ligne: paiements, depart: reservations.date_depart })
    .from(paiements)
    .innerJoin(reservations, eq(reservations.id, paiements.reservation_id))
    .where(and(eq(paiements.type, "caution"), inArray(paiements.statut, ["bloque", "echoue", "en_attente"])));
  for (const { ligne, depart } of ouvertes) {
    const id = ligne.reservation_id;
    if (atteint(aujourdhui, heure, jourLevee(depart), r.liberation)) {
      await essayer(id, "levée", () => lever(ligne, maintenant, p, bilan));
    } else if (ligne.statut === "bloque" && atteint(aujourdhui, heure, jourAlerte(depart), r.alerte)) {
      await essayer(id, "alerte", () => inscrireAlerteCaution(db, id, "levee_demain"));
    }
  }

  // 4. Données de carte : supprimées dès la levée ou la retenue, au plus tard
  //    7 jours après le départ, tout de suite pour une réservation annulée.
  const aEffacer = await db
    .select({ id: reservations.id, pm: reservations.stripe_payment_method_id })
    .from(reservations)
    .where(
      and(
        sql`${reservations.stripe_payment_method_id} is not null`,
        sql`(${reservations.statut} = 'annulee'
              or ${reservations.date_depart} <= ${ajouterJours(aujourdhui, -EFFACEMENT_CARTE_JOURS)}::date
              or exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
                and ${paiements.type} = 'caution' and ${paiements.statut} in ('libere', 'retenu', 'annule')))`,
      ),
    );
  for (const { id, pm } of aEffacer) {
    await essayer(id, "effacement de la carte", async () => {
      await p.oublierCarte(pm!);
      await db
        .update(reservations)
        .set({ stripe_payment_method_id: null })
        .where(and(eq(reservations.id, id), eq(reservations.stripe_payment_method_id, pm!)));
      bilan.cartesEffacees += 1;
    });
  }

  // 5. Séjours sans préautorisation ouverte (chèque, virement, sans caution) :
  //    « terminés » au jour et à l'heure de la levée. Une préautorisation
  //    ouverte est levée ci-dessus, qui termine elle-même le séjour.
  const dernierDepart = ajouterJours(aujourdhui, heure >= r.liberation ? -LEVEE_JOURS : -LEVEE_JOURS - 1);
  try {
    const finis = await db
      .update(reservations)
      .set({ statut: "terminee" })
      .where(
        and(
          eq(reservations.statut, "confirmee"),
          sql`${reservations.date_depart} <= ${dernierDepart}::date`,
          sql`not exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
                and ${paiements.type} = 'caution' and ${paiements.statut} in ('bloque', 'echoue', 'en_attente'))`,
        ),
      )
      .returning({ id: reservations.id });
    bilan.terminees = finis.length;
  } catch (erreur) {
    bilan.erreurs += 1;
    console.error(`[caution] fin des séjours : ${messageErreur(erreur)}`);
  }
  return bilan;
}

/** Préautorisation de la caution d'une réservation. */
async function bloquer(reservationId: string, maintenant: Date, p: Prestataire, bilan: BilanCautions): Promise<void> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa?.stripe_customer_id || !resa.stripe_payment_method_id) return;
  if (resa.caution === null) {
    // Jamais de valeur par défaut sur un montant qu'on bloque : on alerte.
    await inscrireProbleme(db, "caution_montant_absent", resa.id, resa.id);
    return;
  }
  if (resa.caution <= 0) return;

  let ligne = await ligneCaution(db, resa.id);
  if (ligne?.reference_externe) return;
  if (ligne && maintenant.getTime() - ligne.created_at.getTime() > REJEU_HEURES * 3_600_000) {
    // Demandée, réponse jamais inscrite, trop tard pour rejouer sans risque.
    await inscrireProbleme(db, "caution_a_verifier", resa.id, resa.id, {
      montant: centimesDepuisNumeric(ligne.montant),
      depuis: ligne.created_at.toISOString(),
    });
    return;
  }
  if (!ligne) {
    // La trace AVANT l'appel : une panne entre la réponse et l'écriture se rejoue avec la même clé.
    [ligne] = await db
      .insert(paiements)
      .values({
        reservation_id: resa.id,
        type: "caution",
        montant: numericDepuisCentimes(resa.caution),
        statut: "en_attente",
        prestataire: p.nom,
      })
      .returning();
  }

  const etat = await p.bloquerCaution({
    reservationId: resa.id,
    reference: resa.reference,
    montant: centimesDepuisNumeric(ligne.montant),
    customerId: resa.stripe_customer_id,
    paymentMethodId: resa.stripe_payment_method_id,
    description: `Caution ${resa.reference} — ${resa.gites?.nom ?? ""}`,
  });
  const issue = await constaterSousVerrou(ligne.id, etat);
  if (issue?.statut === "bloque") bilan.bloquees += 1;
  if (issue?.statut === "echoue") {
    bilan.refusees += 1;
    console.warn(`[caution] ${resa.reference} : préautorisation refusée (${etat.dernierRefus ?? "sans motif"})`);
  }
}

/** Levée automatique au troisième jour après le départ ; une préautorisation jamais bloquée est close. */
async function lever(ligne: LignePaiement, maintenant: Date, p: Prestataire, bilan: BilanCautions): Promise<void> {
  const db = getDb();
  if (!ligne.reference_externe) {
    await inscrireProbleme(db, "caution_a_verifier", ligne.reservation_id, ligne.reservation_id, {
      montant: centimesDepuisNumeric(ligne.montant),
      depuis: ligne.created_at.toISOString(),
    });
    return;
  }
  const etat = await p.annulerPaiement(ligne.reference_externe);
  const issue = await constaterSousVerrou(ligne.id, etat);
  if (issue?.statut === "libere") bilan.levees += 1;
  // Le séjour est fini, sa caution réglée.
  await db
    .update(reservations)
    .set({ statut: "terminee" })
    .where(and(eq(reservations.id, ligne.reservation_id), eq(reservations.statut, "confirmee")));
  if (issue?.statut === "libere") console.info(`[caution] caution levée (${ligne.reference_externe}, ${aujourdhuiParis(maintenant)})`);
}
