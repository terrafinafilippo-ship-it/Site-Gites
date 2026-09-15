// Table `gites` : les trois gîtes du hameau de Samoyas.
//
// Les noms de colonnes sont ceux lus par Logiciel-contrat- (lib/montants.ts,
// interface Gite) : id, nom, ref_gdf, adresse, forfait_menage, capacite_max,
// equipements_specifiques, a_spa, caution, contact_arrivee_tel.
// Les clés de cet objet sont volontairement en snake_case et identiques aux
// colonnes SQL : une ligne lue par Drizzle a exactement la forme attendue.
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const gites = pgTable(
  "gites",
  {
    id: uuid().primaryKey().defaultRandom(),
    nom: text().notNull(),
    // Référence Gîtes de France, ex. 07G310701. Clé naturelle du seed.
    ref_gdf: text().notNull(),
    // Segment d'URL public, ex. "laphine".
    slug: text().notNull(),
    adresse: text().notNull(),
    capacite_max: integer().notNull(),
    forfait_menage: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    caution: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    // Texte libre repris dans le contrat (ex. "sauna privatif").
    equipements_specifiques: text(),
    a_spa: boolean().notNull().default(false),
    contact_arrivee_tel: text(),
    tarif_semaine_base: numeric({ precision: 10, scale: 2, mode: "number" }),
    tarif_weekend: numeric({ precision: 10, scale: 2, mode: "number" }),
    // Taux en pourcentage (5.50 = 5,5 %).
    taux_taxe_sejour: numeric({ precision: 5, scale: 2, mode: "number" }),
    actif: boolean().notNull().default(true),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gites_ref_gdf_key").on(t.ref_gdf),
    unique("gites_slug_key").on(t.slug),
  ],
);
