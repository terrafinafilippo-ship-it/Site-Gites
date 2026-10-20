/** Activités & accents saisonniers — extraits du script inline de activites.html.
 *  Français et anglais (D-22) ; l'anglais est une traduction fidèle, à relire
 *  par les propriétaires (docs/06-avant-premier-client.md, point 13). */

import type { Bilingue } from "@/lib/i18n/langues";

export type Season = "all" | "spring" | "summer" | "autumn" | "winter";

export interface Activity {
  id: string;
  title: Bilingue<string>;
  one: Bilingue<string>;
  dist: string;
  season: Season;
  img: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: "peaugres", dist: "10 min", season: "all", img: "parc",
    title: { fr: "Safari Parc de Peaugres", en: "Peaugres Safari Park" },
    one: {
      fr: "300 espèces, en voiture ou à pied — un classique en famille.",
      en: "300 species, by car or on foot — a family classic.",
    },
  },
  {
    id: "annonay", dist: "10 min", season: "all", img: "annonay",
    title: { fr: "Annonay & son patrimoine", en: "Annonay & its heritage" },
    one: {
      fr: "Ville natale des Montgolfier, ruelles, musée du tissage.",
      en: "Birthplace of the Montgolfier brothers, narrow streets, weaving museum.",
    },
  },
  {
    id: "golf", dist: "5 min", season: "summer", img: "golf",
    title: { fr: "Golf 18 trous de Gourdan", en: "Gourdan 18-hole golf course" },
    one: {
      fr: "Parcours valloné dans les châtaigniers — à cinq minutes seulement.",
      en: "A hilly course among the chestnut trees — just five minutes away.",
    },
  },
  {
    id: "boulieu", dist: "5 min", season: "all", img: "village",
    title: { fr: "Boulieu, village médiéval", en: "Boulieu, medieval village" },
    one: {
      fr: "Ruelles pavées, place ombragée, fontaine du XIVᵉ.",
      en: "Cobbled lanes, a shaded square, a 14th-century fountain.",
    },
  },
  {
    id: "pilat", dist: "25 min", season: "spring", img: "pilat",
    title: { fr: "Parc régional du Pilat", en: "Pilat Regional Park" },
    one: {
      fr: "Sommets à 1 400 m, forêts profondes, vues sur les Alpes.",
      en: "Summits at 1,400 m, deep forests, views of the Alps.",
    },
  },
  {
    id: "viafluvia", dist: "3 km", season: "spring", img: "velo",
    title: { fr: "Via Fluvia à vélo", en: "Via Fluvia by bike" },
    one: {
      fr: "70 km de voie verte le long du Rhône, départ aux gîtes.",
      en: "70 km of greenway along the Rhône, starting from the gîtes.",
    },
  },
  {
    id: "marche", dist: "10 min", season: "summer", img: "marche",
    title: { fr: "Marché d'Annonay", en: "Annonay market" },
    one: {
      fr: "Mercredi et samedi matin — produits du terroir et bavardages.",
      en: "Wednesday and Saturday mornings — local produce and friendly chatter.",
    },
  },
  {
    id: "chataigne", dist: "5 min", season: "autumn", img: "chataigne",
    title: { fr: "Châtaigneraies en automne", en: "Chestnut groves in autumn" },
    one: {
      fr: "Récolte, balades à l'odeur de feuille mouillée, soupe le soir.",
      en: "Harvest time, walks that smell of wet leaves, soup in the evening.",
    },
  },
  {
    id: "ski", dist: "30 min", season: "winter", img: "ski",
    title: { fr: "Ski au Mont Pilat", en: "Skiing on Mont Pilat" },
    one: {
      fr: "Pistes alpines et nordiques à moins d'une demi-heure.",
      en: "Alpine and cross-country slopes less than half an hour away.",
    },
  },
  {
    id: "riviere", dist: "15 min", season: "summer", img: "riviere",
    title: { fr: "Baignades en rivière", en: "River swimming" },
    one: {
      fr: "Cascade du Saut du Roi, l'Ay, le Doux — eaux fraîches.",
      en: "The Saut du Roi waterfall, the Ay, the Doux — cool waters.",
    },
  },
  {
    id: "sentiers", dist: "0 min", season: "spring", img: "sentier",
    title: { fr: "Sentiers du hameau", en: "Hamlet trails" },
    one: {
      fr: "Boucles de 2 à 12 km au départ direct des gîtes.",
      en: "Loops of 2 to 12 km starting right from the gîtes.",
    },
  },
  {
    id: "vignerons", dist: "20 min", season: "autumn", img: "vignerons",
    title: { fr: "Caves & vignerons", en: "Wineries & winemakers" },
    one: {
      fr: "Saint-Joseph, Cornas, Crozes-Hermitage — la vallée toute proche.",
      en: "Saint-Joseph, Cornas, Crozes-Hermitage — the valley close at hand.",
    },
  },
];

/** Nom d'une saison (puce du filtre et étiquette de la carte). */
export const SEASON_LABELS: Record<Season, Bilingue<string>> = {
  all:    { fr: "Toute l'année", en: "All year" },
  spring: { fr: "Printemps",     en: "Spring" },
  summer: { fr: "Été",           en: "Summer" },
  autumn: { fr: "Automne",       en: "Autumn" },
  winter: { fr: "Hiver",         en: "Winter" },
};

/** Accent + teinte + complément du titre, par saison (filtre de la page Activités). */
export const SEASON_ACCENTS: Record<Season, { accent: string; tint: string; em: Bilingue<string> }> = {
  all:    { accent: "#5a7d67", tint: "rgba(90,125,103,0.06)", em: { fr: "à votre rythme.", en: "at your own pace." } },
  spring: { accent: "#7a9b4f", tint: "rgba(122,155,79,0.07)", em: { fr: "au printemps.",   en: "in spring." } },
  summer: { accent: "#b07735", tint: "rgba(176,119,53,0.07)", em: { fr: "en été.",         en: "in summer." } },
  autumn: { accent: "#a8552a", tint: "rgba(168,85,42,0.07)",  em: { fr: "en automne.",     en: "in autumn." } },
  winter: { accent: "#3d6b78", tint: "rgba(61,107,120,0.06)", em: { fr: "en hiver.",       en: "in winter." } },
};
