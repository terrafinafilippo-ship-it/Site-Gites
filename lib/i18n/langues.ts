// LANGUES DU SITE (décision D-22) : le français, langue par défaut, à
// l'adresse sans préfixe ; l'anglais sous /en.
//
//   /gites/laphine      → français
//   /en/gites/laphine   → anglais
//
// middleware.ts aiguille chaque adresse vers app/[lang]/ ; ce module fabrique
// les liens dans la bonne langue. Les textes vivent à côté de ce qui les
// affiche, français et anglais côte à côte (`Bilingue<T>`) : une phrase
// oubliée dans une langue est une erreur de compilation, pas une page à moitié
// traduite.
//
// Les pages JURIDIQUES (CGV, mentions légales, confidentialité, cookies), le
// contrat et les factures restent en français : en anglais, ces pages
// affichent le texte français avec la mention « Available in French only ».

/** Ordre d'affichage du sélecteur. */
export const LANGUES = ["fr", "en"] as const;
export type Langue = (typeof LANGUES)[number];

export const LANGUE_DEFAUT: Langue = "fr";

/** Un texte (ou toute valeur) dans chaque langue. */
export type Bilingue<T> = Record<Langue, T>;

/** Locale des dates et des nombres. Anglais britannique (« 17 October 2026 »). */
export const LOCALE: Bilingue<string> = { fr: "fr-FR", en: "en-GB" };

/** Valeur de l'attribut `lang` de la page. */
export const ATTRIBUT_LANG: Bilingue<string> = { fr: "fr", en: "en-GB" };

export function estLangue(v: unknown): v is Langue {
  return v === "fr" || v === "en";
}

/** Langue d'une page à partir du segment `[lang]` (toujours « fr » ou « en » : app/[lang]/layout.tsx refuse le reste). */
export function langueDe(lang: string): Langue {
  return estLangue(lang) ? lang : LANGUE_DEFAUT;
}

/** En-tête posé par middleware.ts : la langue de la requête, pour les pages qui n'ont pas `params` (page introuvable). */
export const ENTETE_LANGUE = "x-langue";

/**
 * Lien vers `chemin` (« /gites/laphine », éventuellement suivi de « ?… » ou
 * « #… ») dans la langue voulue. Le français n'a pas de préfixe.
 */
export function lien(langue: Langue, chemin: string): string {
  if (langue === LANGUE_DEFAUT) return chemin;
  if (chemin === "/") return `/${langue}`;
  if (chemin.startsWith("/?") || chemin.startsWith("/#")) return `/${langue}${chemin.slice(1)}`;
  return `/${langue}${chemin}`;
}

/**
 * Chemin d'une adresse sans son préfixe de langue : « /en/gites » → « /gites »,
 * « /en » → « / ». Le préfixe interne « /fr » (adresse réécrite par
 * middleware.ts) est retiré de la même façon.
 */
export function cheminSansLangue(pathname: string): string {
  for (const l of LANGUES) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

/** Libellé du bouton du sélecteur, et nom de la langue pour les lecteurs d'écran. */
export const NOM_LANGUE: Bilingue<{ court: string; long: string }> = {
  fr: { court: "FR", long: "Français" },
  en: { court: "EN", long: "English" },
};
