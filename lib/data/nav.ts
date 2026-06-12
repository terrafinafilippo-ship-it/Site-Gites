export interface NavItem {
  id: "home" | "gites" | "act" | "contact";
  label: string;
  href: string;
}

export type NavId = NavItem["id"];

export const SITE_NAV: NavItem[] = [
  { id: "home",    label: "Accueil",                href: "/" },
  { id: "gites",   label: "Nos gîtes",              href: "/gites" },
  { id: "act",     label: "Activités & découverte", href: "/activites" },
  { id: "contact", label: "Contact",                href: "/contact" },
];
