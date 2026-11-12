import type { Metadata } from "next";

import { lien, LANGUE_DEFAUT, LANGUES, type Bilingue, type Langue } from "./langues";

export const NOM_SITE = "Les Gîtes de Samoyas";

/** Titre et description du site, ceux de l'accueil (app/[lang]/layout.tsx). */
export const PRESENTATION_SITE: Bilingue<{ titre: string; description: string }> = {
  fr: {
    titre: `${NOM_SITE} — Trois écrins de détente en Ardèche verte`,
    description:
      "Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas, en Ardèche verte. Spa privatif, linge fourni — le calme de la campagne, sans s'éloigner du nécessaire.",
  },
  en: {
    titre: `${NOM_SITE} — Three relaxing retreats in green Ardèche`,
    description:
      "Three characterful gîtes with the Gîtes de France label, tucked away in the hamlet of Samoyas, in green Ardèche. Private spa, linen provided — the calm of the countryside, without being far from everyday essentials.",
  },
};

/** Langue de l'aperçu de partage (Open Graph), à l'image de ATTRIBUT_LANG. */
export const LOCALE_OG: Bilingue<string> = { fr: "fr_FR", en: "en_GB" };

/**
 * Titre et adresses d'une page. `alternates` dit à Google que la page existe
 * dans les deux langues (balises hreflang) et laquelle montrer par défaut :
 * c'est ce qui permet aux pages anglaises d'apparaître dans les recherches en
 * anglais, raison du choix de /en (D-22).
 *
 * `chemin` est l'adresse française, sans préfixe (« /gites/laphine »).
 * `titre` à `null` : la page garde le titre général de app/[lang]/layout.tsx.
 * `description` : un texte déjà affiché sur la page (son chapeau), jamais un
 * texte écrit pour les moteurs de recherche.
 *
 * `openGraph` : l'aperçu d'un lien partagé (messageries, réseaux sociaux).
 * Les adresses relatives deviennent absolues par `metadataBase`
 * (NEXT_PUBLIC_SITE_URL, app/[lang]/layout.tsx).
 */
export function metadonnees(
  langue: Langue,
  chemin: string,
  titre: string | null,
  description?: string,
): Metadata {
  const languages: Record<string, string> = {};
  for (const l of LANGUES) languages[l] = lien(l, chemin);
  languages["x-default"] = lien(LANGUE_DEFAUT, chemin);
  return {
    ...(titre ? { title: `${titre} — ${NOM_SITE}` } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: lien(langue, chemin), languages },
    openGraph: {
      type: "website",
      siteName: NOM_SITE,
      locale: LOCALE_OG[langue],
      url: lien(langue, chemin),
      title: titre ? `${titre} — ${NOM_SITE}` : PRESENTATION_SITE[langue].titre,
      description: description ?? (titre ? undefined : PRESENTATION_SITE[langue].description),
    },
  };
}

/** Adresse publique du site, sans barre finale (NEXT_PUBLIC_SITE_URL), ou null si elle manque. */
export function origineSite(): string | null {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || null;
}
