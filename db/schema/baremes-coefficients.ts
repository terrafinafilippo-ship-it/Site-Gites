// Table `baremes_coefficients` : les cases d'un barème, une ligne par rang de
// nuit (1 = première nuit du séjour).
//
// Une ligne par rang plutôt qu'un tableau numeric[] : le pilote pg convertit
// les tableaux de numeric en FLOTTANTS, alors qu'un numeric seul arrive en
// texte exact ("0.8500"), converti sans perte par lib/decimaux.ts.
//
// Les rangs d'un barème doivent se suivre (1, 2, 3… sans trou) : la base ne
// sait pas l'imposer simplement, lib/tarifs.ts le contrôle à la lecture et
// écarte un barème troué (le calcul refuse alors plutôt que de deviner).
import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { baremes } from "./baremes";

export const baremes_coefficients = pgTable(
  "baremes_coefficients",
  {
    bareme_id: uuid()
      .notNull()
      .references(() => baremes.id, { onDelete: "cascade" }),
    rang: integer().notNull(),
    // Coefficient appliqué au prix de la nuit : 1.0000 = plein tarif, 0.8500 =
    // 85 %. Un coefficient n'est pas un montant : lu en texte exact, converti
    // en dix-millièmes (lib/decimaux.ts).
    coefficient: numeric({ precision: 6, scale: 4, mode: "string" }).notNull(),
  },
  (t) => [
    primaryKey({ name: "baremes_coefficients_pkey", columns: [t.bareme_id, t.rang] }),
    check("baremes_coefficients_rang_check", sql`${t.rang} >= 1`),
    check("baremes_coefficients_coefficient_check", sql`${t.coefficient} > 0`),
  ],
);
