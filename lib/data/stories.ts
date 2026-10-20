import type { Bilingue } from "@/lib/i18n/langues";
import type { GiteId } from "./gites";

/** Storytelling par gîte — extrait du script inline de gite.html.
 *  Français et anglais (D-22) ; l'anglais est une traduction fidèle, à relire
 *  par les propriétaires (docs/06-avant-premier-client.md, point 13). */
export interface GiteStory {
  intro: string;
  body: string;
  foot: string;
  spaTitle: string;
  spaBody: string;
  spaChips: string[];
  h2: string;
}

export const STORIES: Record<GiteId, Bilingue<GiteStory>> = {
  laphine: {
    fr: {
      intro: "Au bout du hameau, LaPhine tourne le dos au monde. Les murs de pierre encadrent une véranda chauffée toute l'année, où le spa attend que le soir tombe sur les collines.",
      body:  "Deux chambres calmes, un garage qui vous épargne les averses, et juste assez de cuisine pour vous croire chez vous. Patricia et Nicolas habitent à trois pas : ils sont là si vous les appelez, invisibles sinon.",
      foot:  "Le linge est fourni, le chauffage compris, le silence en sus.",
      spaTitle: "Un spa privatif, sous la véranda chauffée.",
      spaBody:  "Eau à 36 °C toute l'année, jets multiples, accès direct depuis le salon. C'est un instant de votre séjour, pas une option à réserver.",
      spaChips: ["Spa encastré 4 places", "Véranda chauffée", "Climatisation l'été", "Accès illimité"],
      h2: "Un gîte qui sait se faire oublier.",
    },
    en: {
      intro: "At the end of the hamlet, LaPhine turns its back on the world. Stone walls frame a veranda heated all year round, where the spa waits for evening to fall over the hills.",
      body:  "Two quiet bedrooms, a garage that spares you the showers, and just enough kitchen to feel at home. Patricia and Nicolas live a few steps away: there if you call them, invisible otherwise.",
      foot:  "Linen is provided, heating included, and the silence comes free.",
      spaTitle: "A private spa, under the heated veranda.",
      spaBody:  "Water at 36 °C all year round, multiple jets, direct access from the living room. It is a moment of your stay, not an extra to book.",
      spaChips: ["Built-in spa for 4", "Heated veranda", "Air conditioning in summer", "Unlimited access"],
      h2: "A gîte that knows how to fade into the background.",
    },
  },
  armu: {
    fr: {
      intro: "L'Armu, c'est l'intime — une chambre mansardée qui regarde les toits, un jacuzzi sous la véranda, et un feu qui crépite quand il faut.",
      body:  "Tout est pensé pour deux : la table à manger juste assez grande, le canapé qui s'étire, la baignoire qui prend son temps. La cheminée d'ambiance n'est pas un décor — elle chauffe vraiment.",
      foot:  "Pour un anniversaire de mariage, une parenthèse à deux, ou simplement un week-end qui ressemble à autre chose.",
      spaTitle: "Un jacuzzi pour deux, et la cheminée juste à côté.",
      spaBody:  "Sous la véranda, le jacuzzi rond chauffe à 37 °C en toute saison. À l'intérieur, le feu d'ambiance fait le reste — pour un instant en suspension.",
      spaChips: ["Jacuzzi privatif 2 places", "Cheminée d'ambiance", "Véranda chauffée", "Accès illimité"],
      h2: "Un refuge pour deux, à hauteur de toits.",
    },
    en: {
      intro: "L'Armu is all about intimacy — an attic bedroom looking out over the rooftops, a jacuzzi under the veranda, and a fire that crackles when it should.",
      body:  "Everything is designed for two: a dining table just big enough, a sofa to stretch out on, a bathtub that takes its time. The decorative fireplace is not just for show — it really heats.",
      foot:  "For a wedding anniversary, a break for two, or simply a weekend that feels like something else.",
      spaTitle: "A jacuzzi for two, with the fireplace right beside it.",
      spaBody:  "Under the veranda, the round jacuzzi is heated to 37 °C in every season. Inside, the fire does the rest — for a moment suspended in time.",
      spaChips: ["Private jacuzzi for 2", "Decorative fireplace", "Heated veranda", "Unlimited access"],
      h2: "A hideaway for two, at rooftop height.",
    },
  },
  "maison-vieille": {
    fr: {
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
    en: {
      intro: "La Maison Vieille is the oldest house in the hamlet, and the only one with both a private spa and a private sauna. Exposed stone, old beams, very modern comfort.",
      body:  "Two bedrooms, generous spaces, and a wellness routine on site: spa, sauna, cool shower, then the sofa. Every day if you like.",
      foot:  "Ideal for a family, or for getting together with the other gîtes in the hamlet.",
      spaTitle: "Private spa and sauna, under the same roof.",
      spaBody:  "The only one of our gîtes to offer both. A light-wood sauna cabin for four, a spa in the heated veranda — the complete wellness experience.",
      spaChips: ["Private spa", "Sauna for 4", "Exposed stone", "Unlimited access"],
      h2: "Old stone, complete wellbeing.",
    },
  },
};
