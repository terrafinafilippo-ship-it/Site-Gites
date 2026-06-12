export type GiteId = "laphine" | "larmu" | "maisonvieille";

export interface GiteData {
  id: GiteId;
  name: string;
  code: string;
  target: string;
  short: string;
  sleeps: number;
  bedrooms: number;
  surface: string;
  rating: number;
  reviews: number;
  reco: number;
  price: number;
  tagline: string;
  highlight: string;
}

export const GITES: Record<GiteId, GiteData> = {
  laphine: {
    id: "laphine",
    name: "LaPhine",
    code: "07G310701",
    target: "Famille — 4 personnes",
    short: "Famille",
    sleeps: 4,
    bedrooms: 2,
    surface: "70 m²",
    rating: 5.0,
    reviews: 16,
    reco: 100,
    price: 670,
    tagline: "L'écrin familial — spa encastré, véranda chauffée, garage privatif.",
    highlight: "Spa encastré · véranda · garage",
  },
  larmu: {
    id: "larmu",
    name: "L'Armu",
    code: "07G310700",
    target: "Couple — 2 personnes",
    short: "Couple",
    sleeps: 2,
    bedrooms: 1,
    surface: "45 m²",
    rating: 5.0,
    reviews: 22,
    reco: 100,
    price: 450,
    tagline: "Un refuge pour deux — chambre mansardée, jacuzzi sous la véranda, cheminée d'ambiance.",
    highlight: "Jacuzzi véranda · cheminée",
  },
  maisonvieille: {
    id: "maisonvieille",
    name: "La Maison Vieille",
    code: "07G310702",
    target: "Famille — 4 personnes",
    short: "Famille + sauna",
    sleeps: 4,
    bedrooms: 2,
    surface: "85 m²",
    rating: 4.9,
    reviews: 8,
    reco: 100,
    price: 690,
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
  laphine:       [[1, 5, 12], [1, 19, 26], [2, 8, 15]],
  larmu:         [[0, 7, 14], [1, 1, 8],  [2, 15, 22]],
  maisonvieille: [[0, 22, 29], [2, 5, 12], [2, 19, 26]],
};

/** Date "aujourd'hui" ancrée pour un rendu calendrier prévisible (cf. gite.html). */
export const CALENDAR_ANCHOR = { year: 2026, month: 4, day: 19 };
