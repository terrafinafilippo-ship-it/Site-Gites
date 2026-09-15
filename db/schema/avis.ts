// Table `avis` — VERSION PROVISOIRE (Phase 0).
//
// Avis clients affichés sur le site, importés ou saisis en back-office.
// Structure minimale, à affiner en Phase 3 (modération, réponse du
// propriétaire, import Gîtes de France).
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";

export const avis = pgTable(
  "avis",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    // Origine de l'avis (ex. gdf, google, direct).
    source: text().notNull(),
    // Note sur 5, une décimale.
    note: numeric({ precision: 2, scale: 1, mode: "number" }).notNull(),
    commentaire: text(),
    auteur: text(),
    date_sejour: date({ mode: "string" }),
    publie: boolean().notNull().default(false),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("avis_gite_id_idx").on(t.gite_id)],
);
