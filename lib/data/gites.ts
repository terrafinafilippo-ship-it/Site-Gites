// Identifiant d'un gîte = son SLUG EN BASE (colonne gites.slug, contrainte
// unique gites_slug_key). C'est aussi le segment d'URL public /gites/<slug> et
// la valeur de ?gite= du tunnel : la base est la seule source de ces valeurs.
// Les renommer ici sans migration ferait échouer la lecture publique (le gîte
// serait introuvable en base) — voir docs/02-decisions.md, D-14.
import type { Bilingue } from "@/lib/i18n/langues";

export type GiteId = "laphine" | "armu" | "maison-vieille";

// CE QUI VIT ICI, ET CE QUI N'Y VIT PLUS.
//
// Ici : le rédactionnel et le descriptif de bâti (nom, accroche, surface, nombre
// de chambres), plus le nom et la référence Gîtes de France. Ces deux derniers
// sont volontairement dupliqués avec la base : ce sont eux qui permettent
// d'afficher la fiche quand la base ne répond pas. lib/gites-publics.ts
// journalise une INCOHÉRENCE si les valeurs divergent.
//
// Plus ici : la CAPACITÉ (gites.capacite_max) et les PRIX (tables de
// tarification, décision D-17). Ils étaient recopiés en dur — `sleeps` et
// `price`, puis la grille de lib/data/pricing.ts, supprimée en Phase 3 — et
// affichaient donc des chiffres que les propriétaires ne pouvaient pas
// corriger. Ils se lisent par lib/gites-publics.ts (docs/02-decisions.md, D-13).
// Le CALENDRIER non plus : ses dates occupées inventées (BUSY_SETS) ont laissé
// la place à la table `disponibilites` en Phase 3.
//
// `profil` remplace `target` : « Famille — 4 personnes » mélangeait un fait
// commercial (le profil visé, qui est du rédactionnel) et un fait de la base
// (la capacité). Les pages les recomposent à l'affichage.
//
// Les textes sont en français et en anglais (D-22). L'anglais est une
// traduction fidèle du français, à relire par les propriétaires avant la mise
// en ligne (docs/06-avant-premier-client.md, point 13).
export interface GiteData {
  id: GiteId;
  name: string;
  code: string;
  /** Profil visé, sans chiffre : « Couple », « Famille ». */
  profil: Bilingue<string>;
  short: Bilingue<string>;
  bedrooms: number;
  surface: string;
  rating: number;
  reviews: number;
  reco: number;
  tagline: Bilingue<string>;
  highlight: Bilingue<string>;
}

export const GITES: Record<GiteId, GiteData> = {
  laphine: {
    id: "laphine",
    name: "LaPhine",
    code: "07G310701",
    profil: { fr: "Famille", en: "Family" },
    short: { fr: "Famille", en: "Family" },
    bedrooms: 2,
    surface: "70 m²",
    rating: 5.0,
    reviews: 16,
    reco: 100,
    tagline: {
      fr: "L'écrin familial — spa encastré, véranda chauffée, garage privatif.",
      en: "The family retreat — built-in spa, heated veranda, private garage.",
    },
    highlight: { fr: "Spa encastré · véranda · garage", en: "Built-in spa · veranda · garage" },
  },
  armu: {
    id: "armu",
    name: "L'Armu",
    code: "07G310700",
    profil: { fr: "Couple", en: "Couple" },
    short: { fr: "Couple", en: "Couple" },
    bedrooms: 1,
    surface: "45 m²",
    rating: 5.0,
    reviews: 22,
    reco: 100,
    tagline: {
      fr: "Un refuge pour deux — chambre mansardée, jacuzzi sous la véranda, cheminée d'ambiance.",
      en: "A hideaway for two — attic bedroom, jacuzzi under the veranda, decorative fireplace.",
    },
    highlight: { fr: "Jacuzzi véranda · cheminée", en: "Veranda jacuzzi · fireplace" },
  },
  "maison-vieille": {
    id: "maison-vieille",
    name: "La Maison Vieille",
    code: "07G310702",
    profil: { fr: "Famille", en: "Family" },
    short: { fr: "Famille + sauna", en: "Family + sauna" },
    bedrooms: 2,
    surface: "85 m²",
    rating: 4.9,
    reviews: 8,
    reco: 100,
    tagline: {
      fr: "La seule à conjuguer spa et sauna — pierre ancienne, volumes nobles.",
      en: "The only one with both spa and sauna — old stone, generous spaces.",
    },
    highlight: { fr: "Spa + sauna privatif", en: "Private spa + sauna" },
  },
};

export const GITE_IDS = Object.keys(GITES) as GiteId[];

export function isGiteId(id: string): id is GiteId {
  return Object.prototype.hasOwnProperty.call(GITES, id);
}
