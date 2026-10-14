// Table `periodes` : les plages de dates auxquelles s'applique un tarif
// (décision D-17).
//
// BORNES : `date_debut` est la PREMIÈRE NUIT de la période (incluse) ;
// `date_fin` est le jour où elle s'arrête (EXCLU), c'est-à-dire la première nuit
// de la période suivante. « Du samedi 3 au samedi 10 juillet » couvre donc les
// nuits du 3 au 9, et deux périodes qui se suivent partagent la même date.
//
// AUCUN CHEVAUCHEMENT : deux périodes ne peuvent pas couvrir la même nuit. La
// contrainte d'exclusion `periodes_sans_chevauchement` est posée par la
// migration 0003 (Drizzle ne sait pas la décrire). Une nuit relève donc d'au
// plus un tarif ; une nuit qui n'en relève d'aucun n'est pas réservable.
//
// Les périodes valent pour les trois gîtes : le prix propre à chacun est sur
// le tarif. Règles et barème : NULL = ceux du tarif (puis du réglage général).
// C'est ce qui permet « l'été 2028 est libre » sans créer un second tarif.
//
// Le jour de début attendu (samedi) est un réglage (`reglages`), contrôlé à la
// saisie et signalé à la lecture, pas imposé par la base.
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { baremes } from "./baremes";
import { joursIsoValides, nuitsMinimumValide } from "./regles";
import { tarifs } from "./tarifs";

export const periodes = pgTable(
  "periodes",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Un tarif encore utilisé par une période ne peut pas être supprimé.
    tarif_id: uuid()
      .notNull()
      .references(() => tarifs.id),
    date_debut: date({ mode: "string" }).notNull(),
    date_fin: date({ mode: "string" }).notNull(),
    nuits_minimum: integer(),
    jours_arrivee: integer().array(),
    jours_depart: integer().array(),
    bareme_id: uuid().references(() => baremes.id),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("periodes_tarif_id_idx").on(t.tarif_id),
    check("periodes_dates_check", sql`${t.date_fin} > ${t.date_debut}`),
    check("periodes_nuits_minimum_check", nuitsMinimumValide(t.nuits_minimum, true)),
    check("periodes_jours_arrivee_check", joursIsoValides(t.jours_arrivee, true)),
    check("periodes_jours_depart_check", joursIsoValides(t.jours_depart, true)),
  ],
);
