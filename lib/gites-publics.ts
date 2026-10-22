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
//
// LA GRILLE TARIFAIRE vient des tables de tarification (D-17, lib/tarifs.ts) :
// une ligne par tarif ayant une période à venir, avec le prix d'une nuit et
// celui d'une semaine calculé par le même code que le tunnel
// (lib/tarification.ts). Une troisième panne s'ajoute donc aux deux premières,
// journalisée à part : « TARIFICATION ILLISIBLE » (tables absentes, réglages
// manquants). Les fiches gardent alors capacité, ménage et caution, et ne
// masquent que les prix.
//
// LE CALENDRIER des fiches (trois mois à partir du mois en cours) vient de la
// table `disponibilites` (lib/disponibilites.ts) et des périodes tarifaires :
// une nuit sans tarif est « non réservable en ligne ». Il disparaît si l'une
// des deux lectures échoue (« CALENDRIER ILLISIBLE ») : un calendrier tout
// blanc annoncerait libres des nuits qu'on ne sait pas lire.
import { unstable_cache } from "next/cache";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { gites, reglages } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { GITES, isGiteId, type GiteId } from "@/lib/data/gites";
import { ajouterJours, aujourdhuiParis, nombreDeNuits, premierJourDuMois } from "@/lib/dates-civiles";
import { lireNuitsPrises } from "@/lib/disponibilites";
import { chargerTarification, type TarificationLue } from "@/lib/tarifs";
import {
  construireGrille,
  plancherSemaine,
  resoudrePeriodes,
  type LigneGrille,
  type PeriodeResolue,
} from "@/lib/tarification";
import { reglageEnVigueur, type ReglageTaxe } from "@/lib/taxe-sejour";

/** Mois affichés par le calendrier d'une fiche, mois en cours compris. */
const MOIS_CALENDRIER = 3;

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
  forfaitMenage: number;
  caution: number;
  /** Grille tarifaire à venir, une ligne par tarif. `null` = rien d'exploitable : grille masquée. */
  grille: LigneGrille[] | null;
  /** « À partir de … la semaine » : minimum des prix de semaine de la grille. `null` si masquée. */
  plancherSemaine: number | null;
  /** Réglage de taxe de séjour en vigueur aujourd'hui. `null` = non renseigné. */
  taxe: ReglageTaxe | null;
  /** Calendrier des mois affichés ; `null` = illisible, calendrier masqué. */
  calendrier: JourCalendrier[] | null;
  /** Taux d'acompte (%) et délai du solde (jours), réglages communs ; `null` = illisibles, masqués. */
  conditions: ConditionsPaiement | null;
}

export interface ConditionsPaiement {
  tauxAcompte: number;
  delaiSoldeJours: number;
}

/** Conditions de paiement des réglages, ou `null` (panne journalisée) : la fiche les masque. */
async function lireConditions(): Promise<ConditionsPaiement | null> {
  try {
    const [r] = await getDb()
      .select({ taux: reglages.taux_acompte, delai: reglages.delai_solde_jours })
      .from(reglages)
      .where(eq(reglages.id, 1));
    if (!r) {
      console.warn("[gites-publics] VALEUR ABSENTE EN BASE : réglages généraux (reglages, id = 1) — acompte et solde masqués.");
      return null;
    }
    return { tauxAcompte: r.taux, delaiSoldeJours: r.delai };
  } catch (erreur) {
    console.error(
      "[gites-publics] RÉGLAGES ILLISIBLES : acompte et solde masqués.",
      erreur instanceof Error ? erreur.message : erreur,
    );
    return null;
  }
}

/**
 * État d'un jour du calendrier public. « changement » : la nuit de la veille
 * ou celle du jour est prise, pas les deux (jour d'arrivée ou de départ d'un
 * séjour). « ferme » : nuit sans tarif, non réservable en ligne.
 */
export type EtatCalendrier = "passe" | "libre" | "occupe" | "changement" | "ferme";

export interface JourCalendrier {
  date: string;
  etat: EtatCalendrier;
}

function construireCalendrier(
  periodes: readonly PeriodeResolue[],
  prises: ReadonlySet<string>,
  aujourdhui: string,
  du: string,
  au: string,
): JourCalendrier[] {
  const jours: JourCalendrier[] = [];
  for (let i = 0; i < nombreDeNuits(du, au); i += 1) {
    const date = ajouterJours(du, i);
    const prise = prises.has(date);
    const veillePrise = prises.has(ajouterJours(date, -1));
    const periode = periodes.find((p) => p.debut <= date && date < p.fin);
    const ferme = !periode || periode.prixNuit === null || periode.bareme === null;
    const etat: EtatCalendrier =
      date < aujourdhui ? "passe"
      : prise && veillePrise ? "occupe"
      : prise || veillePrise ? "changement"
      : ferme ? "ferme"
      : "libre";
    jours.push({ date, etat });
  }
  return jours;
}

/** Calendrier d'un gîte, ou `null` (panne journalisée) si les nuits sont illisibles. */
async function lireCalendrier(
  giteId: string,
  slug: GiteId,
  tarification: TarificationLue | null,
  aujourdhui: string,
): Promise<JourCalendrier[] | null> {
  if (!tarification) return null; // TARIFICATION ILLISIBLE, déjà journalisée.
  const du = premierJourDuMois(aujourdhui);
  const au = premierJourDuMois(aujourdhui, MOIS_CALENDRIER);
  try {
    // La veille du premier jour est lue aussi : elle décide si ce jour est un changement.
    const prises = await lireNuitsPrises(getDb(), giteId, ajouterJours(du, -1), au);
    return construireCalendrier(
      resoudrePeriodes(tarification.tarification, slug),
      new Set(prises),
      aujourdhui,
      du,
      au,
    );
  } catch (erreur) {
    console.error(
      `[gites-publics] CALENDRIER ILLISIBLE pour "${slug}" : calendrier masqué.`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return null;
  }
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

/** Tarification de toutes les fiches, ou `null` si elle est illisible (panne journalisée). */
async function lireTarification(): Promise<TarificationLue | null> {
  try {
    const lue = await chargerTarification(getDb());
    for (const anomalie of lue.anomalies) {
      console.warn(`[gites-publics] ${anomalie}`);
    }
    return lue;
  } catch (erreur) {
    console.error(
      "[gites-publics] TARIFICATION ILLISIBLE : grilles tarifaires masquées.",
      erreur instanceof Error ? erreur.message : erreur,
    );
    return null;
  }
}

async function chargerDepuisBase(): Promise<Partial<Record<GiteId, ChiffresGite>>> {
  const lignes = await getDb()
    .select({
      id: gites.id,
      slug: gites.slug,
      nom: gites.nom,
      ref_gdf: gites.ref_gdf,
      capacite_max: gites.capacite_max,
      forfait_menage: gites.forfait_menage,
      caution: gites.caution,
    })
    .from(gites);

  const tarification = await lireTarification();
  const conditions = await lireConditions();
  const aujourdhui = aujourdhuiParis();

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
    // Grille et taxe : seulement si la tarification a pu être lue. Sinon, la
    // panne a déjà été journalisée (TARIFICATION ILLISIBLE) et les prix sont
    // masqués sans autre message.
    let grille: LigneGrille[] | null = null;
    let taxe: ReglageTaxe | null = null;
    if (tarification) {
      const { lignes: lignesGrille, anomalies } = construireGrille(
        tarification.tarification,
        ligne.slug,
        aujourdhui,
      );
      for (const anomalie of anomalies) {
        console.warn(`[gites-publics] TARIF ÉCARTÉ de la grille de "${ligne.slug}" : ${anomalie}.`);
      }
      if (lignesGrille.length === 0) {
        console.warn(
          `[gites-publics] VALEUR ABSENTE EN BASE : aucun tarif à venir pour "${ligne.slug}" — grille tarifaire masquée.`,
        );
      } else {
        grille = lignesGrille;
      }
      taxe = reglageEnVigueur(tarification.taxes[ligne.slug] ?? [], aujourdhui);
      if (taxe === null) {
        console.warn(
          `[gites-publics] VALEUR ABSENTE EN BASE : aucun réglage de taxe de séjour en vigueur pour "${ligne.slug}" — taxe masquée.`,
        );
      }
    }

    parGite[ligne.slug] = {
      capaciteMax: ligne.capacite_max,
      forfaitMenage: centimesDepuisNumeric(ligne.forfait_menage),
      caution: centimesDepuisNumeric(ligne.caution),
      grille,
      plancherSemaine: grille ? plancherSemaine(grille) : null,
      taxe,
      calendrier: await lireCalendrier(ligne.id, ligne.slug, tarification, aujourdhui),
      conditions,
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
