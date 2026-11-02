// LE SOLDE d'une réservation payée en deux fois (Phase 4, lot 1, D-28).
//
// Date limite du solde : arrivée − `delai_solde_jours` (figé sur la
// réservation, 30 jours). Choix du gérant du 1er novembre 2026, délais en
// réglages (`reglages.solde_*`, lus à chaque passage) :
//
//   PRÉLÈVEMENT (carte enregistrée) :
//     - `solde_preavis_jours` avant la date limite (7) : courriel de préavis ;
//     - le jour de la date limite : prélèvement sur la carte, sans le client ;
//       payé → facture par courriel ; refusé → IMPAYÉ tout de suite.
//   LIEN :
//     - `solde_lien_jours` avant la date limite (7) : courriel avec le lien
//       vers « Ma réservation », où le client paie ;
//     - `solde_rappel_jours` avant (1, la veille ; 0 = aucun) : rappel, s'il
//       n'a pas reçu le lien le jour même ;
//     - le lendemain de la date limite : IMPAYÉ.
//   IMPAYÉ : courriel au client avec le lien, alerte « À TRAITER » aux
//   propriétaires ; `solde_relance_jours` plus tard (3), seconde alerte si
//   rien n'est payé. La mise en demeure et la résiliation (article 5.3 du
//   contrat) restent la décision des propriétaires : le site ne résilie
//   jamais tout seul.
//
// Chaque courriel a une clé unique (lib/courriels.ts) : un passage répété des
// tâches n'envoie rien deux fois. Un seul prélèvement par réservation : clé
// d'idempotence chez Stripe, et ligne `paiements` écrite AVANT l'appel.
//
// Un solde payé, une réservation annulée ou payée en une fois, une arrivée
// passée : plus rien n'est fait.
//
// MONTANTS EN CENTIMES ENTIERS.
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { courriels, paiements, reglages, reservations } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import {
  inscrireImpaye,
  inscrireProbleme,
  inscrireRelanceImpaye,
  inscrireSolde,
  type MotifImpaye,
} from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis } from "@/lib/dates-civiles";
import { calculerMontants } from "@/lib/montants";
import { constaterPaiement } from "@/lib/paiement";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { prestataire, type EtatPaiement, type Prestataire } from "@/lib/stripe";

/** Au-delà, un prélèvement resté sans réponse n'est plus rejoué (la clé d'idempotence de Stripe dure 24 h). */
const REJEU_PRELEVEMENT_HEURES = 20;

interface ReglagesSolde {
  preavis: number;
  lien: number;
  rappel: number;
  relance: number;
}

async function lireReglages(ex: Executeur): Promise<ReglagesSolde> {
  const [r] = await ex
    .select({
      preavis: reglages.solde_preavis_jours,
      lien: reglages.solde_lien_jours,
      rappel: reglages.solde_rappel_jours,
      relance: reglages.solde_relance_jours,
    })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r;
}

type LignePaiement = typeof paiements.$inferSelect;

/** Date limite du solde (aaaa-mm-jj). */
export function dateLimiteSolde(resa: { date_arrivee: string; delai_solde_jours: number }): string {
  return ajouterJours(resa.date_arrivee, -resa.delai_solde_jours);
}

/** Le solde se prélève-t-il vraiment ? Il faut une carte enregistrée ; sinon, le lien. */
function parPrelevement(resa: ReservationAvecGite): boolean {
  return resa.mode_solde === "prelevement" && !!resa.stripe_customer_id && !!resa.stripe_payment_method_id;
}

async function lignesSolde(ex: Executeur, reservationId: string): Promise<LignePaiement[]> {
  return ex
    .select()
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.type, "solde")))
    .orderBy(asc(paiements.created_at));
}

const jourParis = (d: Date) => aujourdhuiParis(d);

// ─── Ce que voit le client (« Ma réservation ») ──────────────────────────────

export type EtatSolde =
  /** Payé : sa date. */
  | { etat: "paye"; montant: number; date: Date | null }
  /** À payer par le lien (ou après un prélèvement refusé, ou la date passée). */
  | { etat: "a_payer"; montant: number; dateLimite: string; refuse: boolean }
  /** Le prélèvement est prévu à la date limite. */
  | { etat: "prelevement_prevu"; montant: number; dateLimite: string }
  /** La banque traite un paiement. */
  | { etat: "en_cours"; montant: number; dateLimite: string };

/** L'état du solde d'une réservation confirmée, ou `null` s'il n'y a pas de solde. */
export async function lireEtatSolde(
  ex: Executeur,
  resa: ReservationAvecGite,
  aujourdhui: string = aujourdhuiParis(),
): Promise<EtatSolde | null> {
  if (resa.paiement_integral || !resa.mode_solde) return null;
  const montant = calculerMontants(resa).solde;
  if (montant <= 0) return null;
  const dateLimite = dateLimiteSolde(resa);
  const lignes = await lignesSolde(ex, resa.id);
  const paye = lignes.find((l) => l.statut === "reussi");
  if (paye) return { etat: "paye", montant, date: paye.date_paiement };
  // Prélèvement en attente de sa référence (les tâches le traitent) : en cours.
  if (lignes.some((l) => l.statut === "en_attente" && l.reference_externe === null)) {
    return { etat: "en_cours", montant, dateLimite };
  }
  const refuse = parPrelevement(resa) && lignes[0]?.statut === "echoue";
  if (parPrelevement(resa) && !refuse && aujourdhui <= dateLimite) return { etat: "prelevement_prevu", montant, dateLimite };
  return { etat: "a_payer", montant, dateLimite, refuse };
}

// ─── Le paiement par le lien ─────────────────────────────────────────────────

export type OuvertureSolde =
  | { ok: true; clientSecret: string; montant: number }
  | { ok: false; raison: "non_du" | "paye" | "prelevement_prevu" | "en_cours" };

/**
 * Le client veut payer son solde (page « Ma réservation ») : le paiement
 * ouvert est réutilisé (celui d'un prélèvement refusé compris : même paiement
 * chez Stripe, réglé en ligne avec authentification), sinon un nouveau est
 * créé. LÈVE PaiementIndisponible si le prestataire ne répond pas.
 */
export async function ouvrirSolde(reservationId: string, p: Prestataire = prestataire()): Promise<OuvertureSolde> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa || resa.statut !== "confirmee") return { ok: false, raison: "non_du" };
  const etat = await lireEtatSolde(db, resa);
  if (!etat) return { ok: false, raison: "non_du" };
  if (etat.etat === "paye") return { ok: false, raison: "paye" };
  if (etat.etat === "prelevement_prevu") return { ok: false, raison: "prelevement_prevu" };
  if (etat.etat === "en_cours") return { ok: false, raison: "en_cours" };

  const lignes = await lignesSolde(db, resa.id);
  for (const l of [...lignes].reverse()) {
    if (!l.reference_externe || (l.statut !== "en_attente" && l.statut !== "echoue")) continue;
    const chez = await p.lirePaiement(l.reference_externe);
    if (chez.statut === "en_cours") return { ok: false, raison: "en_cours" };
    if (chez.statut === "reussi") {
      await constaterPaiement(chez.id, p);
      return { ok: false, raison: "paye" };
    }
    if ((chez.statut === "en_attente" || chez.statut === "echoue") && chez.clientSecret && chez.montant === etat.montant) {
      return { ok: true, clientSecret: chez.clientSecret, montant: etat.montant };
    }
    if (chez.statut === "annule") await db.update(paiements).set({ statut: "annule" }).where(eq(paiements.id, l.id));
  }

  const cree = await p.creerPaiement({
    reservationId: resa.id,
    reference: resa.reference,
    montant: etat.montant,
    type: "solde",
    enregistrerCarte: false,
    client: { email: resa.client_email ?? "", nom: nomClient(resa) },
    description: `Solde ${resa.reference} — ${resa.gites?.nom ?? ""}`,
    essai: lignes.length + 1,
  });
  await db
    .insert(paiements)
    .values({
      reservation_id: resa.id,
      type: "solde",
      montant: numericDepuisCentimes(etat.montant),
      statut: "en_attente",
      prestataire: p.nom,
      reference_externe: cree.id,
    })
    // Deux ouvertures simultanées : Stripe a renvoyé le même paiement (même clé).
    .onConflictDoNothing({ target: paiements.reference_externe });
  return { ok: true, clientSecret: cree.clientSecret, montant: etat.montant };
}

function nomClient(resa: ReservationAvecGite): string {
  return [resa.client_prenom, resa.client_nom].filter(Boolean).join(" ");
}

// ─── Les tâches automatiques ─────────────────────────────────────────────────

export interface BilanSoldes {
  examines: number;
  preleves: number;
  refuses: number;
  erreurs: number;
}

/**
 * Un passage des tâches sur tous les soldes à suivre. `maintenant` : l'heure
 * du passage (les contrôles la fixent). Une réservation en erreur n'arrête
 * pas les autres : elle est journalisée et reprise au passage suivant.
 */
export async function traiterSoldes(maintenant: Date = new Date(), p: Prestataire = prestataire()): Promise<BilanSoldes> {
  const db = getDb();
  const bilan: BilanSoldes = { examines: 0, preleves: 0, refuses: 0, erreurs: 0 };
  const aujourdhui = aujourdhuiParis(maintenant);
  const r = await lireReglages(db);

  const aSuivre = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.statut, "confirmee"),
        eq(reservations.paiement_integral, false),
        sql`${reservations.mode_solde} is not null`,
        sql`${reservations.date_arrivee} >= ${aujourdhui}::date`,
        sql`not exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
              and ${paiements.type} = 'solde' and ${paiements.statut} = 'reussi')`,
      ),
    )
    .orderBy(asc(reservations.date_arrivee));

  for (const { id } of aSuivre) {
    bilan.examines += 1;
    try {
      await traiterUn(id, aujourdhui, maintenant, r, p, bilan);
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error(`[solde] réservation ${id} : ${messageErreur(erreur)}`);
    }
  }
  return bilan;
}

async function traiterUn(
  reservationId: string,
  aujourdhui: string,
  maintenant: Date,
  r: ReglagesSolde,
  p: Prestataire,
  bilan: BilanSoldes,
): Promise<void> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return;
  const montant = calculerMontants(resa).solde;
  if (montant <= 0) return;
  const limite = dateLimiteSolde(resa);
  // Lus AVANT ce passage : un lien ou un impayé inscrit maintenant n'a ni
  // rappel ni relance aujourd'hui.
  const impaye = await premierImpaye(db, resa.id);
  const lienAvant = await premierCourriel(db, resa.id, "solde_lien");

  if (parPrelevement(resa)) {
    if (aujourdhui >= ajouterJours(limite, -r.preavis) && aujourdhui < limite) {
      await inscrireSolde(db, resa.id, "solde_preavis");
    }
    if (aujourdhui >= limite) await prelever(resa, montant, maintenant, p, bilan);
  } else {
    if (resa.mode_solde === "prelevement") {
      console.warn(`[solde] ${resa.reference} : prélèvement choisi mais aucune carte enregistrée, le lien est envoyé`);
    }
    if (aujourdhui >= ajouterJours(limite, -r.lien) && aujourdhui <= limite) {
      await inscrireSolde(db, resa.id, "solde_lien");
    }
    if (r.rappel > 0 && aujourdhui >= ajouterJours(limite, -r.rappel) && aujourdhui < limite) {
      // Pas de rappel le jour même où le lien est parti.
      if (lienAvant && jourParis(lienAvant.created_at) < aujourdhui) await inscrireSolde(db, resa.id, "solde_rappel");
    }
    if (aujourdhui > limite) await inscrireImpaye(db, resa.id, { motif: "echeance" });
  }

  // Seconde alerte, `relance` jours après le premier impayé.
  if (impaye && aujourdhui >= ajouterJours(jourParis(impaye.date), r.relance)) {
    await inscrireRelanceImpaye(db, resa.id, impaye.motif, r.relance);
  }
}

/** Prélèvement du solde, le jour de la date limite ou après (passage manqué). */
async function prelever(
  resa: ReservationAvecGite,
  montant: number,
  maintenant: Date,
  p: Prestataire,
  bilan: BilanSoldes,
): Promise<void> {
  const db = getDb();
  const lignes = await lignesSolde(db, resa.id);
  let ligne = lignes[0];

  if (ligne?.reference_externe) {
    // Déjà prélevé : refusé → impayé (déjà inscrit, ou avis de Stripe arrivé
    // seul) ; en attente ou en cours → l'avis de Stripe le constatera.
    if (ligne.statut === "echoue") await inscrireImpaye(db, resa.id, { motif: "refus", refus: null });
    return;
  }
  if (ligne && maintenant.getTime() - ligne.created_at.getTime() > REJEU_PRELEVEMENT_HEURES * 3_600_000) {
    // Prélèvement demandé, réponse jamais inscrite, et trop tard pour le
    // rejouer sans risque : on ne prélève pas une seconde fois, on alerte.
    await inscrireProbleme(db, "solde_a_verifier", resa.id, resa.id, { montant, depuis: ligne.created_at.toISOString() });
    return;
  }
  if (!ligne) {
    // La trace AVANT l'appel : une panne entre la réponse et l'écriture se rejoue avec la même clé.
    [ligne] = await db
      .insert(paiements)
      .values({
        reservation_id: resa.id,
        type: "solde",
        montant: numericDepuisCentimes(montant),
        statut: "en_attente",
        prestataire: p.nom,
      })
      .returning();
  }

  const etat: EtatPaiement = await p.prelever({
    reservationId: resa.id,
    reference: resa.reference,
    montant: centimesDepuisNumeric(ligne.montant),
    customerId: resa.stripe_customer_id!,
    paymentMethodId: resa.stripe_payment_method_id!,
    email: resa.client_email ?? "",
    description: `Solde ${resa.reference} — ${resa.gites?.nom ?? ""}`,
  });
  await db
    .update(paiements)
    .set({ reference_externe: etat.id, statut: etat.statut === "echoue" ? "echoue" : "en_attente" })
    .where(eq(paiements.id, ligne.id));

  if (etat.statut === "reussi") {
    bilan.preleves += 1;
    await constaterPaiement(etat.id, p);
  } else if (etat.statut === "echoue" || etat.statut === "annule") {
    bilan.refuses += 1;
    console.warn(`[solde] ${resa.reference} : prélèvement refusé (${etat.dernierRefus ?? "sans motif"})`);
    await inscrireImpaye(db, resa.id, { motif: "refus", refus: etat.dernierRefus });
  }
}

async function premierCourriel(ex: Executeur, reservationId: string, objet: "solde_lien") {
  const [c] = await ex
    .select({ created_at: courriels.created_at })
    .from(courriels)
    .where(and(eq(courriels.reservation_id, reservationId), eq(courriels.objet, objet)))
    .orderBy(asc(courriels.created_at))
    .limit(1);
  return c ?? null;
}

/** Le premier impayé inscrit (courriel au client ou alerte), avec son motif. */
async function premierImpaye(ex: Executeur, reservationId: string): Promise<{ date: Date; motif: MotifImpaye } | null> {
  const [c] = await ex
    .select({ date: courriels.created_at, donnees: courriels.donnees })
    .from(courriels)
    .where(
      and(
        eq(courriels.reservation_id, reservationId),
        inArray(courriels.objet, ["solde_impaye", "alerte_probleme"]),
        sql`(${courriels.objet} = 'solde_impaye' or (${courriels.donnees}->>'genre' = 'solde_impaye'
              and coalesce(${courriels.donnees}->>'relance', 'false') = 'false'))`,
      ),
    )
    .orderBy(asc(courriels.created_at))
    .limit(1);
  if (!c) return null;
  const motif: MotifImpaye =
    c.donnees.motif === "refus"
      ? { motif: "refus", refus: typeof c.donnees.refus === "string" ? c.donnees.refus : null }
      : { motif: "echeance" };
  return { date: c.date, motif };
}
