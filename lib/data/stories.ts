import type { GiteId } from "./gites";

/** Storytelling par gîte — extrait du script inline de gite.html. */
export interface GiteStory {
  intro: string;
  body: string;
  foot: string;
  spaTitle: string;
  spaBody: string;
  spaChips: string[];
  h2: string;
}

export const STORIES: Record<GiteId, GiteStory> = {
  laphine: {
    intro: "Au bout du hameau, LaPhine tourne le dos au monde. Les murs de pierre encadrent une véranda chauffée toute l'année, où le spa attend que le soir tombe sur les collines.",
    body:  "Deux chambres calmes, un garage qui vous épargne les averses, et juste assez de cuisine pour vous croire chez vous. Patricia et Nicolas habitent à trois pas : ils sont là si vous les appelez, invisibles sinon.",
    foot:  "Le linge est fourni, le chauffage compris, le silence en sus.",
    spaTitle: "Un spa privatif, sous la véranda chauffée.",
    spaBody:  "Eau à 36 °C toute l'année, jets multiples, accès direct depuis le salon. C'est un instant de votre séjour, pas une option à réserver.",
    spaChips: ["Spa encastré 4 places", "Véranda chauffée", "Climatisation l'été", "Accès illimité"],
    h2: "Un gîte qui sait se faire oublier.",
  },
  armu: {
    intro: "L'Armu, c'est l'intime — une chambre mansardée qui regarde les toits, un jacuzzi sous la véranda, et un feu qui crépite quand il faut.",
    body:  "Tout est pensé pour deux : la table à manger juste assez grande, le canapé qui s'étire, la baignoire qui prend son temps. La cheminée d'ambiance n'est pas un décor — elle chauffe vraiment.",
    foot:  "Pour un anniversaire de mariage, une parenthèse à deux, ou simplement un week-end qui ressemble à autre chose.",
    spaTitle: "Un jacuzzi pour deux, et la cheminée juste à côté.",
    spaBody:  "Sous la véranda, le jacuzzi rond chauffe à 37 °C en toute saison. À l'intérieur, le feu d'ambiance fait le reste — pour un instant en suspension.",
    spaChips: ["Jacuzzi privatif 2 places", "Cheminée d'ambiance", "Véranda chauffée", "Accès illimité"],
    h2: "Un refuge pour deux, à hauteur de toits.",
  },
  "maison-vieille": {
    intro: "La Maison Vieille est la plus ancienne du hameau, et la seule à conjuguer spa et sauna privatifs. La pierre est apparente, les poutres anciennes, le confort très moderne.",
    body:  "Deux chambres, des volumes nobles, et un protocole bien-être sur place : spa, sauna, douche fraîche, puis le canapé. Tous les jours si vous voulez.",
    // Le total « jusqu'à dix » a quitté cette phrase : c'est une SOMME de trois
    // capacités de la base, qu'un récit figé ne peut pas suivre. Le chiffre est
    // calculé et affiché par l'accueil et /gites (capaciteTotale).
    foot:  "Idéale pour une famille ou pour se regrouper avec les autres gîtes du hameau.",
    spaTitle: "Spa et sauna privatifs, dans la même demeure.",
    spaBody:  "Le seul de nos gîtes à proposer les deux. Cabine sauna en bois clair pour quatre personnes, spa en véranda chauffée — l'expérience bien-être au complet.",
    spaChips: ["Spa privatif", "Sauna 4 places", "Pierre apparente", "Accès illimité"],
    h2: "Pierre ancienne, bien-être complet.",
  },
};
