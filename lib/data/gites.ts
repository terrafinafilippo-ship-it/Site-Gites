// Identifiant d'un gîte = son SLUG EN BASE (colonne gites.slug, contrainte
// unique gites_slug_key). C'est aussi le segment d'URL public /gites/<slug> et
// la valeur de ?gite= du tunnel : la base est la seule source de ces valeurs.
// Les renommer ici sans migration ferait échouer la lecture publique (le gîte
// serait introuvable en base) — voir docs/02-decisions.md, D-14.
export type GiteId = "laphine" | "armu" | "maison-vieille";

// CE QUI VIT ICI, ET CE QUI N'Y VIT PLUS.
//
// Ici : le rédactionnel et le descriptif de bâti (nom, accroche, surface, nombre
// de chambres), plus le nom et la référence Gîtes de France. Ces deux derniers
// sont volontairement dupliqués avec la base : ce sont eux qui permettent
// d'afficher la fiche quand la base ne répond pas. lib/gites-publics.ts
// journalise une INCOHÉRENCE si les valeurs divergent.
//
// Plus ici : la CAPACITÉ (gites.capacite_max) et le PRIX (gites.tarif_semaine_base).
// Ils étaient recopiés en dur — `sleeps` et `price` — et affichaient donc des
// chiffres que les propriétaires ne pouvaient pas corriger. Ils se lisent
// désormais par lib/gites-publics.ts (voir docs/02-decisions.md, D-13).
//
// `profil` remplace `target` : « Famille — 4 personnes » mélangeait un fait
// commercial (le profil visé, qui est du rédactionnel) et un fait de la base
// (la capacité). Les pages les recomposent à l'affichage.
export interface GiteData {
  id: GiteId;
  name: string;
  code: string;
  /** Profil visé, sans chiffre : « Couple », « Famille ». */
  profil: string;
  short: string;
  bedrooms: number;
  surface: string;
  rating: number;
  reviews: number;
  reco: number;
  tagline: string;
  highlight: string;
}

export const GITES: Record<GiteId, GiteData> = {
  laphine: {
    id: "laphine",
    name: "LaPhine",
    code: "07G310701",
    profil: "Famille",
    short: "Famille",
    bedrooms: 2,
    surface: "70 m²",
    rating: 5.0,
    reviews: 16,
    reco: 100,
    tagline: "L'écrin familial — spa encastré, véranda chauffée, garage privatif.",
    highlight: "Spa encastré · véranda · garage",
  },
  armu: {
    id: "armu",
    name: "L'Armu",
    code: "07G310700",
    profil: "Couple",
    short: "Couple",
    bedrooms: 1,
    surface: "45 m²",
    rating: 5.0,
    reviews: 22,
    reco: 100,
    tagline: "Un refuge pour deux — chambre mansardée, jacuzzi sous la véranda, cheminée d'ambiance.",
    highlight: "Jacuzzi véranda · cheminée",
  },
  "maison-vieille": {
    id: "maison-vieille",
    name: "La Maison Vieille",
    code: "07G310702",
    profil: "Famille",
    short: "Famille + sauna",
    bedrooms: 2,
    surface: "85 m²",
    rating: 4.9,
    reviews: 8,
    reco: 100,
    tagline: "La seule à conjuguer spa et sauna — pierre ancienne, volumes nobles.",
    highlight: "Spa + sauna privatif",
  },
};

export const GITE_IDS = Object.keys(GITES) as GiteId[];

export function isGiteId(id: string): id is GiteId {
  return id in GITES;
}

/** Plages occupées du calendrier de la fiche gîte —
 *  [offset mois (0-2), jour début, jour fin], déterministes par gîte. */
export const BUSY_SETS: Record<GiteId, [number, number, number][]> = {
  laphine:          [[1, 5, 12],  [1, 19, 26], [2, 8, 15]],
  armu:             [[0, 7, 14],  [1, 1, 8],   [2, 15, 22]],
  "maison-vieille": [[0, 22, 29], [2, 5, 12],  [2, 19, 26]],
};

/** Date "aujourd'hui" ancrée pour un rendu calendrier prévisible (cf. gite.html). */
export const CALENDAR_ANCHOR = { year: 2026, month: 4, day: 19 };
