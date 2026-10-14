// Table `tarifs_prix` : le prix d'UNE NUIT d'un tarif, pour un gîte.
//
// Pas de ligne pour un gîte = ce tarif n'a pas de prix pour lui : ses dates
// sont alors invendables pour ce gîte, et le calcul REFUSE (aucun prix n'est
// déduit d'un autre gîte ou d'un autre tarif).
import { sql } from "drizzle-orm";
import { check, numeric, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { gites } from "./gites";
import { tarifs } from "./tarifs";

export const tarifs_prix = pgTable(
  "tarifs_prix",
  {
    tarif_id: uuid()
      .notNull()
      .references(() => tarifs.id, { onDelete: "cascade" }),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    // Montant : numeric(10,2) en euros côté SQL, lu en TEXTE et converti en
    // centimes entiers par lib/tarifs.ts (centimesDepuisNumeric).
    prix_nuit: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
  },
  (t) => [
    primaryKey({ name: "tarifs_prix_pkey", columns: [t.tarif_id, t.gite_id] }),
    check("tarifs_prix_prix_nuit_check", sql`${t.prix_nuit} > 0`),
  ],
);
