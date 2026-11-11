// Table `taxes_sejour` : les réglages de TAXE DE SÉJOUR, par gîte et datés
// (décision D-18 ; règle et sources : docs/03-conformite.md § 7 bis).
//
// Un réglage s'applique aux nuits à partir de `date_debut`, jusqu'au réglage
// suivant du même gîte : une nouvelle délibération de la collectivité (votée
// avant le 1er juillet pour le 1er janvier suivant) s'ajoute par une ligne,
// sans toucher au code ni aux réservations déjà calculées.
//
// Deux modes, selon le classement « meublé de tourisme » du gîte :
//   - « proportionnel » (gîte SANS classement — cas des trois gîtes, réponse
//     du 11 octobre 2026) : `taux` % du prix de la nuitée par personne, limité à
//     `plafond` par personne et par nuit ;
//   - « fixe » (gîte classé) : `tarif_fixe` par personne et par nuit.
// Dans les deux cas, `taxe_additionnelle` % s'ajoute (10 % départementale).
//
// Une nuit sans réglage applicable n'est pas réservable : le calcul refuse
// plutôt que de compter une taxe nulle (lib/taxe-sejour.ts).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";

export const MODES_TAXE_SEJOUR = ["proportionnel", "fixe"] as const;

export const taxes_sejour = pgTable(
  "taxes_sejour",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    date_debut: date({ mode: "string" }).notNull(),
    mode: text().$type<(typeof MODES_TAXE_SEJOUR)[number]>().notNull(),
    // Taux en pourcentage (5.00 = 5 %) : pas un montant, lu en texte exact et
    // converti en centièmes par lib/decimaux.ts.
    taux: numeric({ precision: 5, scale: 2, mode: "string" }),
    // Montants en euros côté SQL, convertis en centimes par lib/centimes.ts.
    plafond: numeric({ precision: 10, scale: 2, mode: "string" }),
    tarif_fixe: numeric({ precision: 10, scale: 2, mode: "string" }),
    taxe_additionnelle: numeric({ precision: 5, scale: 2, mode: "string" }).notNull().default("0"),
    // Le forfait ménage entre-t-il dans le prix retenu pour le calcul ? Non
    // (réponse du gérant, 11 novembre 2026 ; docs/06, point 10).
    menage_dans_assiette: boolean().notNull().default(false),
    // Un bébé compte-t-il parmi les occupants qui DIVISENT le prix (étape 2) ?
    // Non (réponse du gérant, 11 novembre 2026 : faux par défaut depuis la
    // migration 0018 ; docs/06, point 10). Un bébé ne paie jamais : il est
    // mineur.
    bebes_parmi_occupants: boolean().notNull().default(false),
    // Référence de la délibération : « Annonay Rhône Agglo, CC_2025_119 ».
    source: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("taxes_sejour_gite_date_key").on(t.gite_id, t.date_debut),
    check("taxes_sejour_mode_check", sql`${t.mode} in ('proportionnel', 'fixe')`),
    check(
      "taxes_sejour_parametres_check",
      sql`(${t.mode} = 'proportionnel' and ${t.taux} is not null and ${t.plafond} is not null)
          or (${t.mode} = 'fixe' and ${t.tarif_fixe} is not null)`,
    ),
    check(
      "taxes_sejour_valeurs_check",
      sql`(${t.taux} is null or ${t.taux} > 0) and (${t.plafond} is null or ${t.plafond} > 0)
          and (${t.tarif_fixe} is null or ${t.tarif_fixe} >= 0) and ${t.taxe_additionnelle} >= 0`,
    ),
  ],
);
