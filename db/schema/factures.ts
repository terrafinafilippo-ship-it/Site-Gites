// Table `factures` : factures d'acompte et de solde, à numérotation légale
// continue (série FAC). Une facture EXISTE dès que la ligne est validée ; le
// PDF n'est qu'un rendu de cette ligne (pdf_url reste NULL tant qu'il n'est
// pas produit, et app/api/factures/route.ts s'appuie sur ce NULL pour
// ré-émettre le même numéro).
//
// Les lignes sont créées EXCLUSIVEMENT par la fonction SQL creer_facture
// (migration 0001), jamais par un INSERT applicatif : c'est elle qui obtient
// le numéro via prochain_numero dans la même transaction.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const factures = pgTable(
  "factures",
  {
    id: uuid().primaryKey().defaultRandom(),
    // FAC-AAAA-NNN, attribué par creer_facture.
    numero: text().notNull(),
    // 'acompte' | 'solde'
    type: text().$type<"acompte" | "solde">().notNull(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // Pour une facture de solde : la facture d'acompte qu'elle rappelle.
    facture_acompte_id: uuid().references((): AnyPgColumn => factures.id),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    montant_ttc: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    date_emission: date({ mode: "string" })
      .notNull()
      .default(sql`current_date`),
    // Chemin de stockage du PDF (factures/{numero}.pdf), NULL tant que non rendu.
    pdf_url: text(),
    // Instantané des données du PDF (forme FactureAcompteData / FactureSoldeData
    // + unite: "centimes" + formatVersion), mis à jour avec le numéro et la
    // date réels par app/api/factures/route.ts, dans la même opération que pdf_url.
    donnees: jsonb().$type<Record<string, unknown>>().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("factures_numero_key").on(t.numero),
    index("factures_reservation_id_idx").on(t.reservation_id),
    check("factures_type_check", sql`${t.type} in ('acompte', 'solde')`),
  ],
);
