// Table `options_sejour` : les OPTIONS posées par téléphone (Phase 5, lot 4,
// migration 0015, réponse 1 B du cadrage du 7 novembre 2026).
//
// Un client appelle pour LaPhine du 10 au 17 juillet : les propriétaires
// posent une option. Ses nuits sont fermées à tout le monde (lignes 'option'
// de `disponibilites`, avec la même échéance que l'option), sauf à ce client,
// qui reçoit par courriel un lien personnel vers le tunnel (`jeton`). Sans
// paiement à l'échéance, les nuits redeviennent libres d'elles-mêmes : une
// ligne échue vaut libre, comme un verrou expiré (lib/disponibilites.ts).
//
// États (lus, jamais stockés en un seul champ) :
//   - utilisée : `utilisee_at` posé au paiement (lib/paiement.ts) ;
//   - levée    : `levee_at` posé par les propriétaires (back-office) ;
//   - échue    : `expire_at` passé ;
//   - en cours : sinon.
//
// Le jeton est en clair, comme le jeton de suivi d'une réservation et celui
// de la signature d'un contrat : le courriel est préparé après la
// transaction (lib/courriels-envoi.ts) et doit pouvoir écrire le lien.
import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { gites } from "./gites";

export const options_sejour = pgTable(
  "options_sejour",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    // Première nuit et jour du départ (exclu), comme une réservation.
    date_arrivee: date({ mode: "string" }).notNull(),
    date_depart: date({ mode: "string" }).notNull(),
    // Tel que saisi par les propriétaires (« M. Durand ») : il ouvre le courriel.
    client_nom: text().notNull(),
    client_email: text().notNull(),
    langue: text().$type<"fr" | "en">().notNull().default("fr"),
    jeton: text()
      .notNull()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    expire_at: timestamp({ withTimezone: true }).notNull(),
    levee_at: timestamp({ withTimezone: true }),
    utilisee_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("options_sejour_jeton_key").on(t.jeton),
    index("options_sejour_gite_id_idx").on(t.gite_id),
    check("options_sejour_dates_check", sql`${t.date_depart} > ${t.date_arrivee}`),
    check("options_sejour_langue_check", sql`${t.langue} in ('fr', 'en')`),
  ],
);
