// Tables `calendriers` et `sejours_plateformes` : la SYNCHRONISATION DES
// CALENDRIERS avec les plateformes (Phase 7, D-44, migration 0025).
//
// `calendriers` : une ligne par gîte et par plateforme (Gîtes de France,
// Airbnb, Booking), créée par le site la première fois que la fiche du gîte
// s'affiche (lib/synchronisation.ts, calendriersDuGite). Elle porte :
//   - le LIEN DU SITE donné à cette plateforme : /api/calendrier/<jeton>.ics.
//     Un lien par plateforme (et non un seul) : celui d'Airbnb ne montre pas
//     à Airbnb ses propres séjours. Si une plateforme renvoyait les nuits
//     qu'elle a reçues de nous, elles ne resteraient pas bloquées après une
//     annulation. Le jeton est SECRET (le lien dit quand le gîte est vide) ;
//   - le LIEN DE LA PLATEFORME, collé par les propriétaires, lu à chaque
//     passage des tâches et quand un client arrive sur l'écran de paiement.
//     NULL : le gîte n'est pas relié à cette plateforme ;
//   - la dernière lecture réussie (`lu_at`) et la dernière erreur : un lien
//     qui ne se lit plus depuis 2 heures apparaît dans « À traiter ».
//
// `sejours_plateformes` : ce que la plateforme annonce, un séjour par ligne,
// reconnu à ses dates (les identifiants des plateformes ne sont pas garantis
// stables). Les NUITS correspondantes sont dans `disponibilites` (statut
// 'reserve', source = la plateforme, sans réservation) : c'est là que le
// tunnel et le paiement les voient. Un séjour qui disparaît du lien de la
// plateforme (annulé) est effacé, et ses nuits libérées, à la lecture suivante.
// Aucun nom de client : les plateformes n'en donnent pas, et le site n'en garde pas.
import { sql } from "drizzle-orm";
import { check, date, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { gites } from "./gites";

export const PLATEFORMES = ["gdf", "airbnb", "booking"] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export const calendriers = pgTable(
  "calendriers",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    plateforme: text().$type<Plateforme>().notNull(),
    jeton_export: text().notNull(),
    lien_import: text(),
    lu_at: timestamp({ withTimezone: true }),
    erreur: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("calendriers_gite_plateforme_uidx").on(t.gite_id, t.plateforme),
    uniqueIndex("calendriers_jeton_export_uidx").on(t.jeton_export),
    check("calendriers_plateforme_check", sql`${t.plateforme} in ('gdf', 'airbnb', 'booking')`),
    check("calendriers_jeton_check", sql`${t.jeton_export} ~ '^[0-9a-f]{48}$'`),
    check("calendriers_lien_check", sql`${t.lien_import} is null or ${t.lien_import} ~ '^https://[^[:space:]]+$'`),
  ],
);

export const sejours_plateformes = pgTable(
  "sejours_plateformes",
  {
    id: uuid().primaryKey().defaultRandom(),
    calendrier_id: uuid()
      .notNull()
      .references(() => calendriers.id),
    arrivee: date({ mode: "string" }).notNull(),
    depart: date({ mode: "string" }).notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sejours_plateformes_calendrier_dates_uidx").on(t.calendrier_id, t.arrivee, t.depart),
    check("sejours_plateformes_dates_check", sql`${t.depart} > ${t.arrivee}`),
  ],
);
