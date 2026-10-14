// Table `tarifs` : les tarifs nommés librement — « Basse saison », « Été »…
// (décision D-17).
//
// Un tarif porte le prix d'UNE NUIT pour chaque gîte (`tarifs_prix`) et,
// éventuellement, ses propres règles et son propre barème. Il ne porte AUCUNE
// date : ce sont les `periodes` qui l'appliquent au calendrier. Changer le prix
// d'un tarif change donc toutes ses périodes à la fois.
//
// Règles et barème : NULL = « comme le réglage général » (table `reglages`). Une
// période peut encore les remplacer pour ses propres dates.
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { baremes } from "./baremes";
import { joursIsoValides, nuitsMinimumValide } from "./regles";

export const tarifs = pgTable(
  "tarifs",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Libellé PUBLIC, affiché dans la grille des fiches gîtes.
    nom: text().notNull(),
    nuits_minimum: integer(),
    // Jours ISO autorisés (1 = lundi … 7 = dimanche).
    jours_arrivee: integer().array(),
    jours_depart: integer().array(),
    bareme_id: uuid().references(() => baremes.id),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tarifs_nom_key").on(t.nom),
    check("tarifs_nuits_minimum_check", nuitsMinimumValide(t.nuits_minimum, true)),
    check("tarifs_jours_arrivee_check", joursIsoValides(t.jours_arrivee, true)),
    check("tarifs_jours_depart_check", joursIsoValides(t.jours_depart, true)),
    check("tarifs_nom_check", sql`length(trim(${t.nom})) > 0`),
  ],
);
