// Table `avoirs` : l'AVOIR d'une réservation annulée et remboursée (Phase 5,
// lot 5, migration 0023, D-41 et D-42). Seulement si une facture a été faite
// pour le séjour ; du montant remboursé ; au plus un par réservation.
//
// Numéro pris dans la SUITE DES FACTURES, FAC-AAAA-NNN (comptable, migration
// 0024 ; suite AV à part de la 0023 à la 0024), sans trou ni doublon : les
// lignes sont créées EXCLUSIVEMENT par la fonction SQL creer_avoir, qui obtient
// le numéro par prochain_numero('FAC', année) dans la même transaction — jamais par un INSERT applicatif. Comme une facture, un avoir
// EXISTE dès que la ligne est validée ; le PDF n'en est qu'un rendu (pdf_url
// NULL tant qu'il n'est pas produit, ré-émis pour le MÊME numéro).
import { sql } from "drizzle-orm";
import { check, date, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { factures } from "./factures";
import { reservations } from "./reservations";

export const avoirs = pgTable(
  "avoirs",
  {
    id: uuid().primaryKey().defaultRandom(),
    // FAC-AAAA-NNN, attribué par creer_avoir (suite des factures).
    numero: text().notNull(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // La facture que l'avoir corrige (la plus récente du séjour) ; toutes
    // celles qu'il cite sont dans `donnees`.
    facture_id: uuid()
      .notNull()
      .references(() => factures.id),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    montant: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    date_emission: date({ mode: "string" })
      .notNull()
      .default(sql`current_date`),
    // Chemin de stockage du PDF (avoirs/{numero}.pdf), NULL tant que non rendu.
    pdf_url: text(),
    // Instantané des données du PDF (AvoirData + unite + formatVersion).
    donnees: jsonb().$type<Record<string, unknown>>().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("avoirs_numero_key").on(t.numero),
    uniqueIndex("avoirs_reservation_uidx").on(t.reservation_id),
    check("avoirs_montant_check", sql`${t.montant} > 0`),
  ],
);
