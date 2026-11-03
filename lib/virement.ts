// LA CAUTION PAR VIREMENT (Phase 4, lot 3, D-19, D-31, art. 6.2 (c) et 6.5
// du contrat).
//
// Exemple : Camille arrive à L'Armu le samedi 20 mars 2027 et repart le
// samedi 27 ; caution de 500 € par virement, à recevoir au plus tard le
// mercredi 17 mars (3 jours avant l'arrivée, délai FIGÉ sur la réservation).
// Choix du gérant des 1er et 3 novembre 2026 :
//   - dimanche 7 mars (`virement_courriel_jours` = 10 jours avant la date
//     limite), au premier passage du jour comme les courriels du solde :
//     courriel à Camille avec les coordonnées du compte de la SARL, la
//     référence à indiquer et la demande de son RIB (elle répond au courriel ;
//     rien n'est gardé sur le site). Une réservation faite après le 7 reçoit
//     le courriel au passage suivant ;
//   - du 7 au 17 mars : les mêmes coordonnées sur « Ma réservation » ;
//   - jeudi 18 mars à `caution_heure_alerte` (8 h) : alerte aux
//     propriétaires, « vérifiez que le virement est arrivé » — le site ne voit
//     pas le compte en banque, c'est un rappel ;
//   - lundi 29 mars à la même heure (veille du délai de restitution) :
//     alerte, « rendez la caution par virement au plus tard le mardi 30 ».
// Le chèque : rien d'automatique (choix du gérant).
//
// Sans compte saisi dans les réglages (ou avec un IBAN dont la clé de
// contrôle est fausse), le courriel n'est PAS envoyé et une alerte « À
// TRAITER » le signale, une fois par réservation ; le courriel part au
// passage suivant la saisie, s'il n'est pas trop tard (date limite passée).
//
// Le tunnel ne propose plus le virement quand sa date limite est passée
// (lib/devis.ts, `virementPossible`).
//
// MONTANTS EN CENTIMES ENTIERS.
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { reglages, reservations } from "@/db/schema";
import { atteint, jourAlerte, jourLevee, LEVEE_JOURS, lireReglagesCaution, type EtatCaution } from "@/lib/caution";
import { inscrireAlerteCaution, inscrireCautionVirement, inscrireProbleme } from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis, heureParis } from "@/lib/dates-civiles";
import { ibanValide, type CompteVirement } from "@/lib/iban";
import type { Executeur, ReservationAvecGite } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";

// ─── Le compte ───────────────────────────────────────────────────────────────

/**
 * Le compte qui reçoit la caution, ou `null` s'il n'est pas saisi ou si
 * l'IBAN est faux (journalisé) : jamais de coordonnées douteuses au client.
 */
export async function lireCompteVirement(ex: Executeur): Promise<CompteVirement | null> {
  const [r] = await ex
    .select({ titulaire: reglages.virement_titulaire, iban: reglages.virement_iban, bic: reglages.virement_bic })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  if (!r.titulaire || !r.iban) return null;
  if (!ibanValide(r.iban)) {
    console.error("[virement] IBAN des réglages refusé : clé de contrôle fausse");
    return null;
  }
  return { titulaire: r.titulaire, iban: r.iban, bic: r.bic };
}

async function lireDelaiCourriel(ex: Executeur): Promise<number> {
  const [r] = await ex.select({ jours: reglages.virement_courriel_jours }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r.jours;
}

// ─── Le calendrier ───────────────────────────────────────────────────────────

/** Date limite de réception du virement : arrivée − délai figé sur la réservation (art. 6.2 (c)). */
export function dateLimiteVirement(resa: { date_arrivee: string; delai_virement_caution_jours: number }): string {
  return ajouterJours(resa.date_arrivee, -resa.delai_virement_caution_jours);
}

/** Jour du courriel des coordonnées. */
export function jourCourrielVirement(
  resa: { date_arrivee: string; delai_virement_caution_jours: number },
  delaiCourriel: number,
): string {
  return ajouterJours(dateLimiteVirement(resa), -delaiCourriel);
}

/** Jour de l'alerte « vérifiez que le virement est arrivé » : le lendemain de la date limite. */
export function jourVerification(resa: { date_arrivee: string; delai_virement_caution_jours: number }): string {
  return ajouterJours(dateLimiteVirement(resa), 1);
}

// ─── Ce que voit le client (« Ma réservation ») ──────────────────────────────

/**
 * Les coordonnées du virement, du jour du courriel à la date limite incluse ;
 * `null` en dehors, ou sans compte saisi.
 */
export async function lireEtatVirement(
  ex: Executeur,
  resa: ReservationAvecGite,
  aujourdhui: string = aujourdhuiParis(),
): Promise<EtatCaution | null> {
  if (resa.moyen_caution !== "virement" || resa.statut !== "confirmee") return null;
  if (resa.caution === null || resa.caution <= 0) return null;
  const dateLimite = dateLimiteVirement(resa);
  if (aujourdhui > dateLimite || aujourdhui < jourCourrielVirement(resa, await lireDelaiCourriel(ex))) return null;
  const compte = await lireCompteVirement(ex);
  if (!compte) return null;
  return { etat: "virement", montant: resa.caution, dateLimite, reference: resa.reference, compte };
}

// ─── Les tâches automatiques ─────────────────────────────────────────────────

export interface BilanVirements {
  examines: number;
  /** Courriel dû, mais compte non saisi (ou IBAN faux) : alerte « À TRAITER ». */
  sansCompte: number;
  erreurs: number;
}

/**
 * Un passage des tâches sur les cautions par virement : courriel des
 * coordonnées, alerte « à vérifier », alerte « à rendre ». Chaque courriel a
 * une clé unique : un passage répété n'envoie rien deux fois. Une
 * réservation en erreur n'arrête pas les autres.
 */
export async function traiterVirements(maintenant: Date = new Date()): Promise<BilanVirements> {
  const db = getDb();
  const bilan: BilanVirements = { examines: 0, sansCompte: 0, erreurs: 0 };
  const aujourdhui = aujourdhuiParis(maintenant);
  const heure = heureParis(maintenant);
  const delaiCourriel = await lireDelaiCourriel(db);
  const { alerte: heureAlerte } = await lireReglagesCaution(db);
  let compte: CompteVirement | null | undefined;

  const aSuivre = await db
    .select({
      id: reservations.id,
      statut: reservations.statut,
      arrivee: reservations.date_arrivee,
      depart: reservations.date_depart,
      delai: reservations.delai_virement_caution_jours,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.statut, ["confirmee", "terminee"]),
        eq(reservations.moyen_caution, "virement"),
        sql`${reservations.caution} > 0`,
        // Plus rien à faire après le délai de restitution.
        sql`${reservations.date_depart} >= ${ajouterJours(aujourdhui, -LEVEE_JOURS)}::date`,
      ),
    );

  for (const r of aSuivre) {
    bilan.examines += 1;
    const resa = { date_arrivee: r.arrivee, delai_virement_caution_jours: r.delai };
    try {
      const dateLimite = dateLimiteVirement(resa);
      // 1. Les coordonnées, du jour du courriel à la date limite incluse.
      if (r.statut === "confirmee" && aujourdhui >= jourCourrielVirement(resa, delaiCourriel) && aujourdhui <= dateLimite) {
        if (compte === undefined) compte = await lireCompteVirement(db);
        if (compte) {
          await inscrireCautionVirement(db, r.id);
        } else {
          bilan.sansCompte += 1;
          await inscrireProbleme(db, "virement_coordonnees_absentes", r.id, r.id);
        }
      }
      // 2. « Vérifiez que le virement est arrivé », le lendemain de la date limite, jusqu'à l'arrivée.
      if (r.statut === "confirmee" && aujourdhui <= r.arrivee && atteint(aujourdhui, heure, jourVerification(resa), heureAlerte)) {
        await inscrireAlerteCaution(db, r.id, "virement_a_verifier");
      }
      // 3. « Rendez la caution », la veille du délai de restitution (art. 6.5).
      if (aujourdhui <= jourLevee(r.depart) && atteint(aujourdhui, heure, jourAlerte(r.depart), heureAlerte)) {
        await inscrireAlerteCaution(db, r.id, "virement_a_rendre");
      }
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error(`[virement] réservation ${r.id} : ${messageErreur(erreur)}`);
    }
  }
  return bilan;
}
