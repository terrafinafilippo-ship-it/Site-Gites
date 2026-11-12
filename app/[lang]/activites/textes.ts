// Le chapeau de la page Activités : affiché par la page (ActivitiesClient) et
// repris tel quel comme sa description pour les moteurs de recherche (page.tsx).
// Hors du composant client, pour que la page serveur puisse le lire.
import type { Bilingue } from "@/lib/i18n/langues";

export const INTRO_ACTIVITES: Bilingue<string> = {
  fr: "Une douzaine d'idées à la porte des gîtes — à pied, à vélo, en voiture, ou en ne bougeant pas. Le hameau de Samoyas se vit comme une parenthèse rurale, sans pour autant vous couper du monde : tout le nécessaire reste à cinq minutes.",
  en: "A dozen ideas right on the gîtes' doorstep — on foot, by bike, by car, or without moving at all. The hamlet of Samoyas is a rural interlude, without cutting you off from the world: all the essentials are five minutes away.",
};
