// Table `paiements` : chaque mouvement d'argent lié à une réservation —
// acompte ou total à la réservation (Phase 3, lot 3), solde et caution
// (Phase 4). Forme définitive depuis la migration 0005.
//
// UNE LIGNE PAR PAIEMENT CHEZ LE PRESTATAIRE (PaymentIntent Stripe). Elle naît
// « en_attente » quand le client arrive sur l'écran de paiement, et suit :
//   - 'reussi'       : argent reçu, la réservation est confirmée ;
//   - 'echoue'       : refus de la banque (le client peut réessayer : même ligne) ;
//   - 'annule'       : paiement annulé avant d'aboutir (le client est revenu en arrière) ;
//   - 'a_rembourser' : argent reçu mais la réservation ne peut pas être honorée
//                      (dates reprises par un autre client après la fin du
//                      blocage) : le remboursement est à faire ou à retenter ;
//   - 'rembourse'    : remboursement intégral accepté par le prestataire.
// Le passage par 'a_rembourser' est écrit AVANT d'appeler le prestataire : une
// panne entre les deux laisse une trace, et le traitement suivant (retour du
// client ou avis de Stripe) termine le remboursement.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const TYPES_PAIEMENT = ["acompte", "total", "solde", "caution"] as const;
export type TypePaiement = (typeof TYPES_PAIEMENT)[number];

export const STATUTS_PAIEMENT = ["en_attente", "reussi", "echoue", "annule", "a_rembourser", "rembourse"] as const;
export type StatutPaiement = (typeof STATUTS_PAIEMENT)[number];

export const paiements = pgTable(
  "paiements",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // 'total' : paiement intégral à la réservation (D-20).
    type: text().$type<TypePaiement>().notNull(),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    montant: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    statut: text().$type<StatutPaiement>().notNull(),
    // Prestataire (« stripe »). NULL pour un règlement saisi à la main (Phase 5).
    prestataire: text(),
    // Identifiant du paiement chez le prestataire (PaymentIntent « pi_… »).
    reference_externe: text(),
    date_paiement: timestamp({ withTimezone: true }),
    // Remboursement intégral (paiement arrivé sur des dates reprises).
    motif_remboursement: text(),
    reference_remboursement: text(),
    date_remboursement: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Entretenu par le trigger paiements_set_updated_at (migration 0005).
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("paiements_reservation_id_idx").on(t.reservation_id),
    uniqueIndex("paiements_reference_externe_uidx").on(t.reference_externe),
    check("paiements_type_check", sql`${t.type} in ('acompte', 'total', 'solde', 'caution')`),
    check(
      "paiements_statut_check",
      sql`${t.statut} in ('en_attente', 'reussi', 'echoue', 'annule', 'a_rembourser', 'rembourse')`,
    ),
    check(
      "paiements_remboursement_check",
      sql`${t.statut} not in ('a_rembourser', 'rembourse') or ${t.motif_remboursement} is not null`,
    ),
  ],
);
