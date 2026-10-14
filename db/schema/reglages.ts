// Table `reglages` : les réglages GÉNÉRAUX de la réservation, en UNE seule
// ligne (id = 1, imposé par la base). La ligne est créée par la migration 0003 :
// le code ne la crée jamais et la considère comme une panne si elle manque.
//
// Contenu, phase par phase :
//   - règle générale de réservation (décision D-17) : minimum de nuits, jours
//     d'arrivée et de départ autorisés. Valeurs initiales : arrivée et départ
//     tous les jours, une nuit minimum — réponse donnée au cadrage le
//     10 octobre 2026 (« complètement libre »). Un tarif ou une période peut
//     s'en écarter ;
//   - barème général de dégressivité. NULL = aucun barème : le calcul REFUSE
//     de chiffrer un séjour plutôt que d'appliquer un plein tarif implicite ;
//   - jour de début attendu des périodes (6 = samedi, décision du cadrage) :
//     contrôlé à la saisie (back-office), signalé à la lecture. NULL = libre.
//
// Les colonnes des lots suivants (délai de blocage pendant le paiement,
// délai du solde…) s'y ajouteront par de nouvelles migrations.
import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { baremes } from "./baremes";
import { joursIsoValides, nuitsMinimumValide } from "./regles";

export const reglages = pgTable(
  "reglages",
  {
    id: integer().primaryKey().default(1),
    nuits_minimum: integer().notNull().default(1),
    jours_arrivee: integer()
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'::integer[]`),
    jours_depart: integer()
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'::integer[]`),
    bareme_general_id: uuid().references(() => baremes.id),
    periodes_jour_debut: integer(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reglages_ligne_unique_check", sql`${t.id} = 1`),
    check("reglages_nuits_minimum_check", nuitsMinimumValide(t.nuits_minimum, false)),
    check("reglages_jours_arrivee_check", joursIsoValides(t.jours_arrivee, false)),
    check("reglages_jours_depart_check", joursIsoValides(t.jours_depart, false)),
    check(
      "reglages_periodes_jour_debut_check",
      sql`${t.periodes_jour_debut} is null or ${t.periodes_jour_debut} between 1 and 7`,
    ),
  ],
);
