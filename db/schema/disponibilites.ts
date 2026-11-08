// Table `disponibilites` : le calendrier des NUITS PRISES, une ligne par gîte
// et par nuit (forme définitive, Phase 3 lot 2, migration 0004).
//
// UNE NUIT SANS LIGNE EST LIBRE. L'état « libre » stocké a disparu : deux
// façons de dire « libre » (pas de ligne, ou une ligne 'libre') auraient
// obligé chaque lecteur à penser aux deux.
//
// Quatre états :
//   - 'verrou'  : nuit bloquée pendant le paiement d'une réservation directe,
//                 jusqu'à `verrou_expire_at`. UN VERROU EXPIRÉ VAUT LIBRE : il
//                 n'est pas effacé par une tâche, il est ignoré à la lecture et
//                 repris par le client suivant (lib/disponibilites.ts) ;
//   - 'reserve' : nuit vendue (réservation directe payée, ou nuit vendue sur
//                 une plateforme, synchronisée en Phase 7) ;
//   - 'bloque'  : nuit fermée par les propriétaires (back-office, Phase 5) ;
//   - 'option'  : nuit gardée pour un client par une option posée au
//                 téléphone (Phase 5, lot 4, migration 0015), jusqu'à
//                 l'échéance de l'option, écrite dans `verrou_expire_at`.
//                 Comme un verrou, UNE OPTION ÉCHUE VAUT LIBRE.
//
// `verrou_expire_at` est donc l'ÉCHÉANCE d'une ligne provisoire (verrou ou
// option) : une ligne qui en a une et dont l'échéance est passée est libre.
//
// L'index unique (gite_id, date) est la garantie contre la double vente :
// deux clients qui bloquent la même nuit au même instant, la base en refuse un.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";
import { options_sejour } from "./options-sejour";
import { reservations } from "./reservations";

export const STATUTS_NUIT = ["verrou", "reserve", "bloque", "option"] as const;
export type StatutNuit = (typeof STATUTS_NUIT)[number];

export const disponibilites = pgTable(
  "disponibilites",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    date: date({ mode: "string" }).notNull(),
    statut: text().$type<StatutNuit>().notNull(),
    // 'directe' | 'airbnb' | 'booking' | 'gdf'
    source: text()
      .$type<"directe" | "airbnb" | "booking" | "gdf">()
      .notNull()
      .default("directe"),
    reservation_id: uuid().references(() => reservations.id),
    // Échéance d'un verrou ou d'une option ; NULL pour tout autre état.
    verrou_expire_at: timestamp({ withTimezone: true }),
    // L'option qui garde la nuit (statut 'option' seulement).
    option_id: uuid().references(() => options_sejour.id),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("disponibilites_gite_date_uidx").on(t.gite_id, t.date),
    index("disponibilites_reservation_id_idx").on(t.reservation_id),
    check("disponibilites_statut_check", sql`${t.statut} in ('verrou', 'reserve', 'bloque', 'option')`),
    check(
      "disponibilites_source_check",
      sql`${t.source} in ('directe', 'airbnb', 'booking', 'gdf')`,
    ),
    // Un verrou ou une option a toujours une échéance, et eux seuls en ont une.
    check(
      "disponibilites_verrou_echeance_check",
      sql`(${t.statut} in ('verrou', 'option')) = (${t.verrou_expire_at} is not null)`,
    ),
    // Une nuit en option désigne son option, et elle seule en désigne une.
    check("disponibilites_option_check", sql`(${t.statut} = 'option') = (${t.option_id} is not null)`),
    index("disponibilites_option_id_idx").on(t.option_id),
    // Un verrou appartient à une réservation directe, et à une seule.
    check(
      "disponibilites_verrou_reservation_check",
      sql`${t.statut} <> 'verrou' or (${t.source} = 'directe' and ${t.reservation_id} is not null)`,
    ),
    // Une nuit vendue en direct désigne sa réservation.
    check(
      "disponibilites_reserve_directe_check",
      sql`${t.statut} <> 'reserve' or ${t.source} <> 'directe' or ${t.reservation_id} is not null`,
    ),
  ],
);
