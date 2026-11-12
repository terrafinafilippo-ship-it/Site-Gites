// robots.txt : ce que les moteurs de recherche peuvent parcourir. Le
// back-office, les routes techniques et les pages personnelles d'un client
// (réservation, signature, suivi) restent hors des résultats ; ces pages
// portent aussi `robots: noindex`.
import type { MetadataRoute } from "next";

import { origineSite } from "@/lib/i18n/metadonnees";

const PRIVEES = ["/gestion", "/api/", "/reserver", "/signer/", "/suivi"];

export default function robots(): MetadataRoute.Robots {
  const origine = origineSite();
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVEES, ...PRIVEES.map((c) => `/en${c}`)] },
    ...(origine ? { sitemap: `${origine}/sitemap.xml` } : {}),
  };
}
