// Seed des trois gîtes du hameau de Samoyas.
//
// IDEMPOTENT : ré-exécutable autant de fois que nécessaire sans créer de
// doublon. La clé naturelle est ref_gdf (référence Gîtes de France) :
//   - gîte absent  → inséré ;
//   - gîte présent → ses paramètres descriptifs sont REMIS aux valeurs de ce
//     fichier (nom, slug, adresse, capacité, tarifs...). Le drapeau `actif`
//     n'est pas touché : une désactivation faite en back-office survit au seed.
//
// Lancer : npm run db:seed
import "./env";

import { sql } from "drizzle-orm";

import { numericDepuisCentimes } from "../lib/centimes";
import { closeDb, getDb } from "./index";
import { gites } from "./schema";

const ADRESSE = "Hameau de Samoyas, 07430 Savas";
const CONTACT_ARRIVEE_TEL = "06 79 33 23 51";
const TAUX_TAXE_SEJOUR = 5.5; // % (taux, nombre décimal)
const FORFAIT_MENAGE = 8000; // centimes (80,00 €)

type GiteSeed = typeof gites.$inferInsert;

// Dans ce fichier, les MONTANTS sont saisis en CENTIMES ENTIERS (comme partout
// en mémoire) ; ils sont convertis en texte numeric par numericDepuisCentimes
// au moment de l'insertion (frontière mémoire → base, lib/centimes.ts).
type ColonnesMontant = "forfait_menage" | "caution" | "tarif_semaine_base" | "tarif_weekend";
type GiteSeedCentimes = Omit<GiteSeed, ColonnesMontant> & {
  forfait_menage: number; // centimes
  caution: number; // centimes
  tarif_semaine_base: number | null; // centimes
  tarif_weekend: number | null; // centimes
};

const communs = {
  adresse: ADRESSE,
  forfait_menage: FORFAIT_MENAGE,
  taux_taxe_sejour: TAUX_TAXE_SEJOUR,
  contact_arrivee_tel: CONTACT_ARRIVEE_TEL,
  a_spa: true,
  actif: true,
} satisfies Partial<GiteSeedCentimes>;

export const GITES_SEED: GiteSeedCentimes[] = [
  {
    ...communs,
    nom: "LaPhine",
    ref_gdf: "07G310701",
    slug: "laphine",
    capacite_max: 4,
    caution: 50000, // centimes (500,00 €)
    tarif_semaine_base: 67000, // centimes (670,00 €)
    tarif_weekend: 30000, // centimes (300,00 €)
    equipements_specifiques: null,
  },
  {
    ...communs,
    nom: "L'Armu",
    ref_gdf: "07G310700",
    slug: "armu",
    capacite_max: 2,
    caution: 40000, // centimes (400,00 €)
    tarif_semaine_base: 45000, // centimes (450,00 €)
    tarif_weekend: 20000, // centimes (200,00 €)
    equipements_specifiques: null,
  },
  {
    ...communs,
    nom: "La Maison Vieille",
    ref_gdf: "07G310702",
    slug: "maison-vieille",
    capacite_max: 4,
    caution: 50000, // centimes (500,00 €)
    tarif_semaine_base: 69000, // centimes (690,00 €)
    tarif_weekend: 32000, // centimes (320,00 €)
    equipements_specifiques: "Sauna privatif",
  },
];

/** Référence la valeur proposée à l'INSERT pour la clause ON CONFLICT DO UPDATE. */
const excluded = (colonne: string) => sql.raw(`excluded."${colonne}"`);

/** Frontière mémoire → base : centimes entiers → texte numeric attendu par Drizzle. */
function versBase(g: GiteSeedCentimes): GiteSeed {
  return {
    ...g,
    forfait_menage: numericDepuisCentimes(g.forfait_menage),
    caution: numericDepuisCentimes(g.caution),
    tarif_semaine_base: g.tarif_semaine_base === null ? null : numericDepuisCentimes(g.tarif_semaine_base),
    tarif_weekend: g.tarif_weekend === null ? null : numericDepuisCentimes(g.tarif_weekend),
  };
}

async function main(): Promise<void> {
  const db = getDb();

  await db
    .insert(gites)
    .values(GITES_SEED.map(versBase))
    .onConflictDoUpdate({
      target: gites.ref_gdf,
      set: {
        nom: excluded("nom"),
        slug: excluded("slug"),
        adresse: excluded("adresse"),
        capacite_max: excluded("capacite_max"),
        forfait_menage: excluded("forfait_menage"),
        caution: excluded("caution"),
        equipements_specifiques: excluded("equipements_specifiques"),
        a_spa: excluded("a_spa"),
        contact_arrivee_tel: excluded("contact_arrivee_tel"),
        tarif_semaine_base: excluded("tarif_semaine_base"),
        tarif_weekend: excluded("tarif_weekend"),
        taux_taxe_sejour: excluded("taux_taxe_sejour"),
      },
    });

  const lignes = await db
    .select({
      nom: gites.nom,
      ref_gdf: gites.ref_gdf,
      slug: gites.slug,
      capacite_max: gites.capacite_max,
      tarif_semaine_base: gites.tarif_semaine_base,
      actif: gites.actif,
    })
    .from(gites)
    .orderBy(gites.ref_gdf);

  console.log(`Seed terminé : ${lignes.length} gîte(s) en base.`);
  console.table(lignes);
}

main()
  .catch((erreur: unknown) => {
    console.error("Échec du seed :", erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
