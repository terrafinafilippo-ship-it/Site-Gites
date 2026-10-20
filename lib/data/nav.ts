import type { Bilingue } from "@/lib/i18n/langues";

export interface NavItem {
  id: "home" | "gites" | "act" | "contact";
  label: Bilingue<string>;
  /** Adresse française, sans préfixe de langue (lib/i18n/langues.ts, `lien`). */
  href: string;
}

export type NavId = NavItem["id"];

export const SITE_NAV: NavItem[] = [
  { id: "home",    label: { fr: "Accueil",                en: "Home" },                    href: "/" },
  { id: "gites",   label: { fr: "Nos gîtes",              en: "Our gîtes" },               href: "/gites" },
  { id: "act",     label: { fr: "Activités & découverte", en: "Activities & discovery" },  href: "/activites" },
  { id: "contact", label: { fr: "Contact",                en: "Contact" },                 href: "/contact" },
];
