/** Activités & accents saisonniers — extraits du script inline de activites.html. */

export type Season = "all" | "spring" | "summer" | "autumn" | "winter";

export interface Activity {
  id: string;
  title: string;
  one: string;
  dist: string;
  season: Season;
  img: string;
  label: string;
}

export const ACTIVITIES: Activity[] = [
  { id: "peaugres",  title: "Safari Parc de Peaugres",   one: "300 espèces, en voiture ou à pied — un classique en famille.",        dist: "10 min", season: "all",    img: "parc",      label: "Toute l'année" },
  { id: "annonay",   title: "Annonay & son patrimoine",  one: "Ville natale des Montgolfier, ruelles, musée du tissage.",            dist: "10 min", season: "all",    img: "annonay",   label: "Toute l'année" },
  { id: "golf",      title: "Golf 18 trous de Gourdan",  one: "Parcours valloné dans les châtaigniers — à cinq minutes seulement.",  dist: "5 min",  season: "summer", img: "golf",      label: "Été" },
  { id: "boulieu",   title: "Boulieu, village médiéval", one: "Ruelles pavées, place ombragée, fontaine du XIVᵉ.",                   dist: "5 min",  season: "all",    img: "village",   label: "Toute l'année" },
  { id: "pilat",     title: "Parc régional du Pilat",    one: "Sommets à 1 400 m, forêts profondes, vues sur les Alpes.",            dist: "25 min", season: "spring", img: "pilat",     label: "Printemps" },
  { id: "viafluvia", title: "Via Fluvia à vélo",         one: "70 km de voie verte le long du Rhône, départ aux gîtes.",             dist: "3 km",   season: "spring", img: "velo",      label: "Printemps" },
  { id: "marche",    title: "Marché d'Annonay",          one: "Mercredi et samedi matin — produits du terroir et bavardages.",       dist: "10 min", season: "summer", img: "marche",    label: "Été" },
  { id: "chataigne", title: "Châtaigneraies en automne", one: "Récolte, balades à l'odeur de feuille mouillée, soupe le soir.",      dist: "5 min",  season: "autumn", img: "chataigne", label: "Automne" },
  { id: "ski",       title: "Ski au Mont Pilat",         one: "Pistes alpines et nordiques à moins d'une demi-heure.",               dist: "30 min", season: "winter", img: "ski",       label: "Hiver" },
  { id: "riviere",   title: "Baignades en rivière",      one: "Cascade du Saut du Roi, l'Ay, le Doux — eaux fraîches.",              dist: "15 min", season: "summer", img: "riviere",   label: "Été" },
  { id: "sentiers",  title: "Sentiers du hameau",        one: "Boucles de 2 à 12 km au départ direct des gîtes.",                    dist: "0 min",  season: "spring", img: "sentier",   label: "Printemps" },
  { id: "vignerons", title: "Caves & vignerons",         one: "Saint-Joseph, Cornas, Crozes-Hermitage — la vallée toute proche.",    dist: "20 min", season: "autumn", img: "vignerons", label: "Automne" },
];

/** Accent + teinte + complément du titre, par saison (filtre de la page Activités). */
export const SEASON_ACCENTS: Record<Season, { accent: string; tint: string; em: string }> = {
  all:    { accent: "#5a7d67", tint: "rgba(90,125,103,0.06)", em: "à votre rythme." },
  spring: { accent: "#7a9b4f", tint: "rgba(122,155,79,0.07)", em: "au printemps." },
  summer: { accent: "#b07735", tint: "rgba(176,119,53,0.07)", em: "en été." },
  autumn: { accent: "#a8552a", tint: "rgba(168,85,42,0.07)",  em: "en automne." },
  winter: { accent: "#3d6b78", tint: "rgba(61,107,120,0.06)", em: "en hiver." },
};
