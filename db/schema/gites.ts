// Table `gites` : les trois gîtes du hameau de Samoyas.
//
// Les noms de colonnes sont ceux lus par lib/montants.ts (type Gite, dérivé
// de cette table via lib/reservations.ts) : id, nom, ref_gdf, adresse, forfait_menage, capacite_max,
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
    // Montants : numeric(10,2) en euros côté SQL, lus en TEXTE (mode "string")
    // et convertis en centimes entiers par lib/reservations.ts (centimesDepuisNumeric).
    forfait_menage: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    caution: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    // Texte libre repris dans le contrat (ex. "sauna privatif").
    equipements_specifiques: text(),
    a_spa: boolean().notNull().default(false),
    contact_arrivee_tel: text(),
    // DÉFINITION (décidée en Phase 2, voir docs/02-decisions.md, D-15) :
    // tarif_semaine_base est le tarif d'une semaine en BASSE SAISON, c'est-à-dire
    // le prix plancher — celui qu'annoncent les « Dès … » du site. Ce N'EST PAS
    // un tarif de référence dont les autres saisons se déduiraient : les saisons
    // du site ne s'obtiennent ni par un coefficient ni par un écart constant.
    // La colonne n'avait aucune définition écrite et deux lectures possibles ;
    // sans trancher, la fiche gîte affichait le même prix depuis deux sources.
    // La Phase 5 la remplacera par un vrai modèle de saisons.
    tarif_semaine_base: numeric({ precision: 10, scale: 2, mode: "string" }),
    // Tarif d'un week-end. Aucun écran ne l'affiche à ce jour.
    tarif_weekend: numeric({ precision: 10, scale: 2, mode: "string" }),
    // Taux en pourcentage (5.50 = 5,5 %) : pas un montant, reste un nombre décimal.
    taux_taxe_sejour: numeric({ precision: 5, scale: 2, mode: "number" }),
    actif: boolean().notNull().default(true),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gites_ref_gdf_key").on(t.ref_gdf),
    unique("gites_slug_key").on(t.slug),
  ],
);
