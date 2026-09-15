// Table `disponibilites` — VERSION PROVISOIRE (Phase 0).
//
// Une ligne par gîte et par nuit : c'est le calendrier. Le statut 'verrou'
// (avec verrou_expire_at) réserve temporairement les nuits pendant le tunnel
// de paiement ; les sources externes (airbnb, booking, gdf) viendront des
// synchronisations iCal en Phase 3. L'index unique (gite_id, date) interdit
// deux états pour une même nuit.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";
import { reservations } from "./reservations";

export const disponibilites = pgTable(
  "disponibilites",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    date: date({ mode: "string" }).notNull(),
    // 'libre' | 'reserve' | 'bloque' | 'verrou'
    statut: text()
      .$type<"libre" | "reserve" | "bloque" | "verrou">()
      .notNull()
      .default("libre"),
    // 'directe' | 'airbnb' | 'booking' | 'gdf'
    source: text()
      .$type<"directe" | "airbnb" | "booking" | "gdf">()
      .notNull()
      .default("directe"),
    reservation_id: uuid().references(() => reservations.id),
    // Échéance d'un verrou temporaire (tunnel de réservation).
    verrou_expire_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("disponibilites_gite_date_uidx").on(t.gite_id, t.date),
    check(
      "disponibilites_statut_check",
      sql`${t.statut} in ('libre', 'reserve', 'bloque', 'verrou')`,
    ),
    check(
      "disponibilites_source_check",
      sql`${t.source} in ('directe', 'airbnb', 'booking', 'gdf')`,
    ),
  ],
);
