// LE SOLDE REÇU PAR VIREMENT, noté dans le back-office (Phase 5, lot 2,
// réponses 14 A et 6 A des cadrages des 3 et 6 novembre 2026).
//
// Camille vire son solde de 403,66 € au lieu de payer par le lien : les
// propriétaires cliquent « Solde reçu par virement ». Le MONTANT doit être
// exactement le solde (un montant différent se règle hors du site) ; le
// VIREMENT seulement — un chèque ne peut pas être encaissé avant l'arrivée du
// client, et la carte bancaire reste le lien de paiement en ligne.
//
// Ce qui se passe :
//   - un paiement ouvert chez Stripe pour ce solde (lien, prélèvement refusé)
//     est annulé, pour que le client ne paie pas deux fois ; s'il venait
//     d'aboutir, il est constaté et le virement est refusé ;
//   - une ligne `paiements` « solde » réussie, prestataire « virement », datée
//     du jour de réception, avec la référence lue sur le relevé (facultative) ;
//   - la facture de solde part au client (même chemin que le paiement en
//     ligne, lib/courriels.ts) : elle imprime « Virement bancaire » ;
//   - le prélèvement prévu n'a plus lieu (le solde est payé, lib/solde.ts).
//
// MONTANTS EN CENTIMES ENTIERS.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements } from "@/db/schema";
import { numericDepuisCentimes } from "@/lib/centimes";
import { inscrireFacture } from "@/lib/courriels";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { fmtEuro } from "@/lib/format";
import { constaterPaiement } from "@/lib/paiement";
import { chargerReservationAvecGite } from "@/lib/reservations";
import { isUniqueViolation } from "@/lib/route-helpers";
import { lireEtatSolde } from "@/lib/solde";
import { prestataire, type Prestataire } from "@/lib/stripe";

import type { IssueGeste } from "./cautions";
import { journaliser, type Acteur } from "./journal";

const refus = (message: string): IssueGeste => ({ ok: false, message });
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function noterSoldeVirement(
  reservationId: string,
  saisie: { date: string; montant: number; reference: string },
  acteur: Acteur,
  p: Prestataire = prestataire(),
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa || resa.statut !== "confirmee") return refus("Seule une réservation confirmée a un solde à recevoir.");
  const etat = await lireEtatSolde(db, resa, aujourdhuiParis(maintenant));
  if (!etat) return refus("Cette réservation n'a pas de solde (séjour payé en une fois).");
  if (etat.etat === "paye") return refus("Le solde est déjà payé.");
  if (etat.etat === "en_cours") return refus("Un paiement du solde est en cours à la banque : attendez sa réponse avant de noter un virement.");
  if (saisie.montant !== etat.montant) {
    return refus(`Le montant doit être exactement le solde, ${fmtEuro(etat.montant)}. Un autre montant se règle hors du site.`);
  }
  if (!FORME_DATE.test(saisie.date)) return refus("Indiquez la date de réception du virement.");
  if (saisie.date > aujourdhuiParis(maintenant)) return refus("La date de réception ne peut pas être dans le futur.");
  if (saisie.date < aujourdhuiParis(resa.created_at)) return refus("La date de réception précède la réservation.");
  const reference = saisie.reference.trim().slice(0, 140) || null;

  // Les paiements du solde encore ouverts chez Stripe : annulés (le client ne paiera pas deux fois).
  const ouverts = await db
    .select()
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        eq(paiements.type, "solde"),
        inArray(paiements.statut, ["en_attente", "echoue"]),
        isNotNull(paiements.reference_externe),
      ),
    );
  for (const l of ouverts) {
    const chez = await p.annulerPaiement(l.reference_externe!);
    if (chez.statut === "reussi" || chez.statut === "en_cours") {
      await constaterPaiement(chez.id, p);
      return refus("Le client vient de payer son solde en ligne : le virement n'est pas noté. Rendez-le-lui s'il est aussi arrivé.");
    }
    await db.update(paiements).set({ statut: "annule" }).where(eq(paiements.id, l.id));
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(paiements).values({
        reservation_id: reservationId,
        type: "solde",
        montant: numericDepuisCentimes(saisie.montant),
        statut: "reussi",
        prestataire: "virement",
        reference_externe: reference,
        date_paiement: sql`(${saisie.date}::date + time '12:00') at time zone 'Europe/Paris'`,
      });
      await inscrireFacture(tx, reservationId, "solde");
      await journaliser(tx, {
        table: "reservations",
        ligne: reservationId,
        action: "solde_recu_virement",
        acteur,
        details: { montant: saisie.montant, date: saisie.date, reference },
      });
    });
  } catch (erreur) {
    if (isUniqueViolation(erreur)) return refus("Cette référence de virement est déjà enregistrée sur un autre paiement.");
    throw erreur;
  }
  return { ok: true, message: `Solde de ${fmtEuro(saisie.montant)} noté reçu par virement. La facture de solde part au client.` };
}
