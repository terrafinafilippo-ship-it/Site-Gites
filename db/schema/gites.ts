// Table `gites` : les trois gîtes du hameau de Samoyas.
//
// Phase 5, lot 4 (migration 0015) : tarif_semaine_base, tarif_weekend et
// taux_taxe_sejour sont retirés — les prix et la taxe ont leurs tables depuis
// la Phase 3 (D-17, D-18), et plus rien ne les lisait.
//
// Les noms de colonnes sont ceux lus par lib/montants.ts (type Gite, dérivé
// de cette table via lib/reservations.ts) : id, nom, ref_gdf, adresse, forfait_menage, capacite_max,
// equipements_specifiques, a_spa, a_sauna, caution, contact_arrivee_tel.
// Les clés de cet objet sont volontairement en snake_case et identiques aux
// colonnes SQL : une ligne lue par Drizzle a exactement la forme attendue.
//
// Phase 6 (migration 0021, D-40) : les chiffres Gîtes de France du gîte (note,
// nombre d'avis, recommandation, adresse de sa page), saisis sur la fiche du
// back-office ; vides, le site ne les affiche pas. Ils étaient écrits en dur
// dans lib/data/gites.ts.
import { sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
    // Montants : numeric(10,2) en euros côté SQL, lus en TEXTE (mode "string")
    // et convertis en centimes entiers par lib/reservations.ts (centimesDepuisNumeric).
    forfait_menage: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    caution: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    // Texte libre repris dans le contrat (ex. "sauna privatif").
    equipements_specifiques: text(),
    a_spa: boolean().notNull().default(false),
    // Sauna : déclenche ses règles à l'article 12 du contrat (point 8,
    // migration 0019). Seule La Maison Vieille en a un.
    a_sauna: boolean().notNull().default(false),
    contact_arrivee_tel: text(),
    actif: boolean().notNull().default(true),
    // Note Gîtes de France en CENTIÈMES (490 = 4,9/5), comme reglages.avis_note_centiemes.
    gdf_note_centiemes: integer(),
    gdf_avis_nombre: integer(),
    gdf_recommandation_pct: integer(),
    // Page du gîte sur le site de Gîtes de France (lien « Lire les avis »).
    gdf_lien: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gites_ref_gdf_key").on(t.ref_gdf),
    unique("gites_slug_key").on(t.slug),
    // La note et le nombre d'avis vont ensemble : l'un sans l'autre ne s'affiche pas.
    check(
      "gites_gdf_check",
      sql`(${t.gdf_note_centiemes} is null) = (${t.gdf_avis_nombre} is null)
          and (${t.gdf_note_centiemes} is null or ${t.gdf_note_centiemes} between 0 and 500)
          and (${t.gdf_avis_nombre} is null or ${t.gdf_avis_nombre} >= 0)
          and (${t.gdf_recommandation_pct} is null or ${t.gdf_recommandation_pct} between 0 and 100)
          and (${t.gdf_lien} is null or ${t.gdf_lien} ~ '^https://[^[:space:]]+$')`,
    ),
  ],
);
