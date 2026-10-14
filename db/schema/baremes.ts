// Table `baremes` : les barèmes de dégressivité (décision D-17).
//
// Un barème donne un coefficient par RANG de nuit dans le séjour : 1re nuit,
// 2e nuit… (ses cases vivent dans `baremes_coefficients`). Au-delà de la
// dernière case, chaque nuit vaut la MOYENNE des coefficients : c'est une
// règle du calcul (lib/tarification.ts), pas une donnée.
//
// Le barème GÉNÉRAL est désigné par reglages.bareme_general_id ; un tarif ou
// une période peut en désigner un autre.
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const baremes = pgTable(
  "baremes",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Nom libre, pour le back-office : « Barème général », « Été sans remise ».
    nom: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("baremes_nom_key").on(t.nom)],
);
