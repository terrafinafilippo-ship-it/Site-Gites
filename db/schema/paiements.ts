// Table `paiements` — VERSION PROVISOIRE (Phase 0).
//
// Aucun code ne l'exerce encore. Elle enregistre chaque mouvement d'argent
// lié à une réservation : acompte, solde, empreinte de caution. Les colonnes
// et les statuts seront affinés en Phase 3 avec l'intégration du prestataire
// de paiement.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const paiements = pgTable(
  "paiements",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // 'acompte' | 'solde' | 'caution'
    type: text().$type<"acompte" | "solde" | "caution">().notNull(),
    montant: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    // Statut côté prestataire (valeurs à figer en Phase 3).
    statut: text().notNull(),
    // Prestataire (ex. stripe, swikly).
    prestataire: text(),
    // Identifiant du paiement chez le prestataire.
    reference_externe: text(),
    date_paiement: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("paiements_reservation_id_idx").on(t.reservation_id),
    check("paiements_type_check", sql`${t.type} in ('acompte', 'solde', 'caution')`),
  ],
);
