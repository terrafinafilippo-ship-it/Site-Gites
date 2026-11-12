// sitemap.xml : les pages publiques, dans les deux langues (D-22). Chaque
// adresse annonce son équivalent dans l'autre langue, comme les balises
// hreflang des pages (lib/i18n/metadonnees.ts).
//
// Un plan du site n'accepte que des adresses complètes : il se construit sur
// NEXT_PUBLIC_SITE_URL. Absente, le plan sort vide et le dit au journal,
// plutôt que de publier des adresses fausses.
import type { MetadataRoute } from "next";

import { GITE_IDS } from "@/lib/data/gites";
import { LEGAL_SECTIONS } from "@/lib/data/legal";
import { lien, LANGUES } from "@/lib/i18n/langues";
import { origineSite } from "@/lib/i18n/metadonnees";

const PAGES = ["/", "/gites", ...GITE_IDS.map((id) => `/gites/${id}`), "/activites", "/contact", ...LEGAL_SECTIONS.map((s) => `/legal/${s}`)];

export default function sitemap(): MetadataRoute.Sitemap {
  const origine = origineSite();
  if (!origine) {
    console.error("[sitemap] NEXT_PUBLIC_SITE_URL absente : plan du site vide");
    return [];
  }
  return PAGES.flatMap((chemin) => {
    const languages = Object.fromEntries(LANGUES.map((l) => [l, `${origine}${lien(l, chemin)}`]));
    return LANGUES.map((l) => ({ url: `${origine}${lien(l, chemin)}`, alternates: { languages } }));
  });
}
