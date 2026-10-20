import type { Metadata } from "next";

import { lien, LANGUE_DEFAUT, LANGUES, type Langue } from "./langues";

export const NOM_SITE = "Les Gîtes de Samoyas";

/**
 * Titre et adresses d'une page. `alternates` dit à Google que la page existe
 * dans les deux langues (balises hreflang) et laquelle montrer par défaut :
 * c'est ce qui permet aux pages anglaises d'apparaître dans les recherches en
 * anglais, raison du choix de /en (D-22).
 *
 * `chemin` est l'adresse française, sans préfixe (« /gites/laphine »).
 * `titre` à `null` : la page garde le titre général de app/[lang]/layout.tsx.
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
  };
}
