// Seed des trois gîtes du hameau de Samoyas.
//
// CRÉATION SEULE (Phase 5, lot 4, réponse 11 A du cadrage de la phase) : un
// gîte absent est créé avec les valeurs de ce fichier ; un gîte déjà en base
// n'est JAMAIS touché. Capacité, ménage, caution, équipements, téléphone,
// spa, sauna et chiffres Gîtes de France (Phase 6, D-40 : ceux du site au
// 12 novembre 2026) se modifient dans le back-office (fiche du gîte) : un seed rejoué ne
// doit pas écraser ce que les propriétaires y ont saisi. La clé naturelle est
// ref_gdf (référence Gîtes de France).
//
// Ce n'est pas une restauration : pour revenir à un état passé, on restaure
// une sauvegarde (db/README.md).
//
// Lancer : npm run db:seed
import "./env";

import { numericDepuisCentimes } from "../lib/centimes";
import { closeDb, getDb } from "./index";
import { gites } from "./schema";

const ADRESSE = "Hameau de Samoyas, 07430 Savas";
const CONTACT_ARRIVEE_TEL = "06 79 33 23 51";
const FORFAIT_MENAGE = 8000; // centimes (80,00 €)

type GiteSeed = typeof gites.$inferInsert;

// Dans ce fichier, les MONTANTS sont saisis en CENTIMES ENTIERS (comme partout
// en mémoire) ; ils sont convertis en texte numeric par numericDepuisCentimes
// au moment de l'insertion (frontière mémoire → base, lib/centimes.ts).
type GiteSeedCentimes = Omit<GiteSeed, "forfait_menage" | "caution"> & {
  forfait_menage: number; // centimes
  caution: number; // centimes
};

const communs = {
  adresse: ADRESSE,
  forfait_menage: FORFAIT_MENAGE,
  contact_arrivee_tel: CONTACT_ARRIVEE_TEL,
  a_spa: true,
  a_sauna: false,
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
    equipements_specifiques: null,
    gdf_note_centiemes: 500,
    gdf_avis_nombre: 16,
    gdf_recommandation_pct: 100,
  },
  {
    ...communs,
    nom: "L'Armu",
    ref_gdf: "07G310700",
    slug: "armu",
    capacite_max: 2,
    caution: 40000, // centimes (400,00 €)
    equipements_specifiques: null,
    gdf_note_centiemes: 500,
    gdf_avis_nombre: 22,
    gdf_recommandation_pct: 100,
  },
  {
    ...communs,
    nom: "La Maison Vieille",
    ref_gdf: "07G310702",
    slug: "maison-vieille",
    capacite_max: 4,
    caution: 50000, // centimes (500,00 €)
    equipements_specifiques: "Sauna privatif",
    a_sauna: true,
    gdf_note_centiemes: 490,
    gdf_avis_nombre: 8,
    gdf_recommandation_pct: 100,
  },
];

/** Frontière mémoire → base : centimes entiers → texte numeric attendu par Drizzle. */
function versBase(g: GiteSeedCentimes): GiteSeed {
  return {
    ...g,
    forfait_menage: numericDepuisCentimes(g.forfait_menage),
    caution: numericDepuisCentimes(g.caution),
  };
}

async function main(): Promise<void> {
  const db = getDb();

  const crees = await db
    .insert(gites)
    .values(GITES_SEED.map(versBase))
    .onConflictDoNothing({ target: gites.ref_gdf })
    .returning({ ref_gdf: gites.ref_gdf });
  const nouveaux = new Set(crees.map((c) => c.ref_gdf));

  for (const g of GITES_SEED) {
    console.log(
      nouveaux.has(g.ref_gdf)
        ? `Créé : ${g.nom} (${g.ref_gdf}).`
        : `Déjà en base, laissé tel quel : ${g.nom} (${g.ref_gdf}).`,
    );
  }

  const lignes = await db
    .select({
      nom: gites.nom,
      ref_gdf: gites.ref_gdf,
      slug: gites.slug,
      capacite_max: gites.capacite_max,
      forfait_menage: gites.forfait_menage,
      caution: gites.caution,
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
