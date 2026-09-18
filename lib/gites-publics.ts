// Lecture des chiffres des gîtes pour les pages PUBLIQUES (accueil, /gites,
// /gites/<slug>, /contact).
//
// Pourquoi ce fichier existe : capacités, tarifs, forfait ménage, caution et
// taux de taxe de séjour vivent en base. Recopiés en dur dans les pages, ils
// divergent dès la première modification faite par les propriétaires, et le
// site affiche alors un prix que la réservation ne pratique plus.
//
// TROIS GARDE-FOUS, dans cet ordre d'importance :
//
// 1. UNE BASE INJOIGNABLE N'EST PAS UNE ERREUR 500. Les chiffres disparaissent,
//    la fiche reste : récit, photos, téléphone, bouton de réservation. Une fiche
//    sans prix est une page qui vend encore ; une 500 dit au visiteur que
//    l'entreprise ne fonctionne pas. Voir docs/02-decisions.md, D-13.
//
// 2. LES DEUX PANNES SE JOURNALISENT DIFFÉREMMENT. Même affichage, réactions
//    opposées : « VALEUR ABSENTE EN BASE » est une donnée à saisir, « BASE
//    INJOIGNABLE » est une panne à traiter dans l'heure. Confondues dans les
//    journaux, une panne passe pour un oubli de saisie pendant des jours.
//
// 3. LA CLÉ DU CACHE PORTE LA BASE VISÉE. Sans elle, le cache disque rempli en
//    développement sur gites_test resservirait des prix de test sous la base
//    réelle, sans aucun signal (mêmes pages, mêmes URL, chiffres faux).
//
// Le cache tient 60 secondes (revalidate) et porte l'étiquette "gites" : la
// Phase 5 appellera revalidateTag('gites') à l'enregistrement du back-office
// pour rendre la modification visible immédiatement.
import { unstable_cache } from "next/cache";

import { getDb } from "@/db";
import { gites } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { GITES, isGiteId, type GiteId } from "@/lib/data/gites";
import { plancherDuGite } from "@/lib/data/pricing";

/** Délai maximal d'une lecture publique, en millisecondes.
 *
 *  Le pool attend jusqu'à 10 s l'ouverture d'une connexion (db/index.ts,
 *  connectionTimeoutMillis). C'est un réglage sain pour l'émission d'une
 *  facture, pas pour un visiteur : 10 s d'écran blanc, c'est un visiteur perdu.
 *  Passé ce délai, on sert la page dégradée. */
const DELAI_MAX_MS = 3_000;

/** Chiffres d'un gîte tels qu'ils vivent en base. Montants en CENTIMES entiers. */
export interface ChiffresGite {
  capaciteMax: number;
  /** Tarif semaine de BASSE SAISON, en centimes. `null` = non renseigné en base. */
  tarifSemaineBase: number | null;
  forfaitMenage: number;
  caution: number;
  /** Taux en pourcentage (5.5 = 5,5 %), pas un montant. `null` = non renseigné. */
  tauxTaxeSejour: number | null;
}

export interface ChiffresPublics {
  /** `false` = base injoignable : toutes les pages masquent leurs chiffres. */
  disponible: boolean;
  parGite: Partial<Record<GiteId, ChiffresGite>>;
}

const PUBLICS_INDISPONIBLES: ChiffresPublics = { disponible: false, parGite: {} };

/** Base visée, telle qu'elle entre dans la clé du cache (voir garde-fou 3). */
function cibleBase(): string {
  return process.env.DB_CIBLE === "test" ? "test" : "reelle";
}

async function chargerDepuisBase(): Promise<Partial<Record<GiteId, ChiffresGite>>> {
  const lignes = await getDb()
    .select({
      slug: gites.slug,
      nom: gites.nom,
      ref_gdf: gites.ref_gdf,
      capacite_max: gites.capacite_max,
      forfait_menage: gites.forfait_menage,
      caution: gites.caution,
      tarif_semaine_base: gites.tarif_semaine_base,
      taux_taxe_sejour: gites.taux_taxe_sejour,
    })
    .from(gites);

  const parGite: Partial<Record<GiteId, ChiffresGite>> = {};

  for (const ligne of lignes) {
    if (!isGiteId(ligne.slug)) {
      console.warn(
        `[gites-publics] GÎTE INCONNU DU SITE : slug "${ligne.slug}" présent en base, absent de lib/data/gites.ts — non affiché.`,
      );
      continue;
    }
    // Le nom et la référence Gîtes de France restent en code : ce sont eux qui
    // permettent d'afficher la fiche quand la base ne répond pas. Ils doivent
    // donc être surveillés, sinon la divergence ne se voit qu'à l'œil nu.
    const attendu = GITES[ligne.slug];
    if (ligne.nom !== attendu.name || ligne.ref_gdf !== attendu.code) {
      console.warn(
        `[gites-publics] INCOHÉRENCE code/base sur "${ligne.slug}" : base = ${ligne.nom} / ${ligne.ref_gdf}, code = ${attendu.name} / ${attendu.code}.`,
      );
    }
    if (ligne.tarif_semaine_base === null) {
      console.warn(
        `[gites-publics] VALEUR ABSENTE EN BASE : gites.tarif_semaine_base pour "${ligne.slug}" — grille tarifaire masquée.`,
      );
    }
    if (ligne.taux_taxe_sejour === null) {
      console.warn(
        `[gites-publics] VALEUR ABSENTE EN BASE : gites.taux_taxe_sejour pour "${ligne.slug}" — taux masqué.`,
      );
    }
    // Le « Dès … » est le minimum de la grille : si la basse saison lue en base
    // n'est PAS ce minimum, la page reste cohérente mais la donnée est suspecte
    // (saisie dans la mauvaise cellule, ou saisons du code périmées).
    const tarifBase = centimesDepuisNumeric(ligne.tarif_semaine_base);
    if (tarifBase !== null && plancherDuGite(ligne.slug, tarifBase) !== tarifBase) {
      console.warn(
        `[gites-publics] INCOHÉRENCE GRILLE sur "${ligne.slug}" : tarif_semaine_base (${tarifBase} c) n'est pas le minimum de la grille affichée.`,
      );
    }

    parGite[ligne.slug] = {
      capaciteMax: ligne.capacite_max,
      tarifSemaineBase: tarifBase,
      forfaitMenage: centimesDepuisNumeric(ligne.forfait_menage),
      caution: centimesDepuisNumeric(ligne.caution),
      tauxTaxeSejour: ligne.taux_taxe_sejour,
    };
  }

  for (const slug of Object.keys(GITES) as GiteId[]) {
    if (!parGite[slug]) {
      console.warn(
        `[gites-publics] GÎTE ABSENT EN BASE : "${slug}" — fiche affichée sans ses chiffres.`,
      );
    }
  }

  return parGite;
}

/** Abandonne au bout de DELAI_MAX_MS : une base qui ne répond pas ne doit pas
 *  faire attendre le visiteur le délai de connexion du pool. */
async function chargerAvecDelaiMax(): Promise<Partial<Record<GiteId, ChiffresGite>>> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chargerDepuisBase(),
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(
          () => rejeter(new Error(`lecture des gîtes abandonnée après ${DELAI_MAX_MS} ms`)),
          DELAI_MAX_MS,
        );
      }),
    ]);
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
}

// Un lecteur caché PAR BASE VISÉE : la clé du cache contient la cible, donc
// basculer DB_CIBLE ne peut pas resservir l'entrée de l'autre base.
const lecteursParCible = new Map<string, () => Promise<Partial<Record<GiteId, ChiffresGite>>>>();

function lecteurCache(cible: string) {
  let lecteur = lecteursParCible.get(cible);
  if (!lecteur) {
    lecteur = unstable_cache(chargerAvecDelaiMax, ["gites-publics", cible], {
      revalidate: 60,
      tags: ["gites"],
    });
    lecteursParCible.set(cible, lecteur);
  }
  return lecteur;
}

/**
 * Chiffres des gîtes pour les pages publiques. NE LÈVE JAMAIS : en cas de
 * panne, renvoie `{ disponible: false }` et les pages masquent leurs chiffres.
 *
 * L'échec n'est pas mis en cache (il est levé DANS la fonction cachée, donc
 * rien n'est écrit) : le site se rétablit à la première requête qui aboutit,
 * sans attendre l'expiration des 60 secondes.
 */
export async function lireChiffresPublics(): Promise<ChiffresPublics> {
  try {
    return { disponible: true, parGite: await lecteurCache(cibleBase())() };
  } catch (erreur) {
    console.error(
      `[gites-publics] BASE INJOIGNABLE (cible ${cibleBase()}) : chiffres masqués sur les pages publiques.`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return PUBLICS_INDISPONIBLES;
  }
}

/** Chiffres d'un gîte, ou `null` si la base est injoignable ou le gîte absent. */
export function chiffresDuGite(publics: ChiffresPublics, slug: GiteId): ChiffresGite | null {
  return publics.parGite[slug] ?? null;
}

/** Capacité totale du hameau, pour les séjours groupés. `null` si un seul gîte
 *  manque : un total partiel serait un chiffre faux, pas une approximation. */
export function capaciteTotale(publics: ChiffresPublics): number | null {
  const slugs = Object.keys(GITES) as GiteId[];
  let total = 0;
  for (const slug of slugs) {
    const chiffres = publics.parGite[slug];
    if (!chiffres) return null;
    total += chiffres.capaciteMax;
  }
  return total;
}
