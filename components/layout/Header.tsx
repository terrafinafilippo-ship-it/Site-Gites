"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SITE_NAV, type NavId } from "@/lib/data/nav";
import { cheminSansLangue, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import ChoixLangue from "./ChoixLangue";

function activeIdFromPath(chemin: string): NavId {
  if (chemin.startsWith("/gites")) return "gites";
  if (chemin.startsWith("/activites")) return "act";
  if (chemin.startsWith("/contact")) return "contact";
  return "home";
}

const TEXTES: Bilingue<{
  accueil: string;
  navigation: string;
  reserver: string;
  menu: string;
  fermer: string;
}> = {
  fr: {
    accueil: "Les Gîtes de Samoyas — accueil",
    navigation: "Navigation principale",
    reserver: "Réserver un séjour",
    menu: "Menu",
    fermer: "Fermer le menu",
  },
  en: {
    accueil: "Les Gîtes de Samoyas — home",
    navigation: "Main navigation",
    reserver: "Book a stay",
    menu: "Menu",
    fermer: "Close menu",
  },
};

/** Header sticky + drawer mobile — reproduit renderHeader() de site.js. */
export default function Header({ langue }: { langue: Langue }) {
  const chemin = cheminSansLangue(usePathname() ?? "/");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = TEXTES[langue];

  // La page /reserver utilise son propre header de tunnel (cf. reserver.html
  // qui ne montait pas le header de site).
  if (chemin.startsWith("/reserver")) return null;

  const activeId = activeIdFromPath(chemin);

  const navLinks = (onClick?: () => void) =>
    SITE_NAV.map((n) => (
      <Link
        key={n.id}
        href={lien(langue, n.href)}
        className={n.id === activeId ? "is-active" : ""}
        onClick={onClick}
      >
        {n.label[langue]}
      </Link>
    ));

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Link href={lien(langue, "/")} className="brand" aria-label={t.accueil}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" className="brand__logo" />
          </Link>
          <nav aria-label={t.navigation}>{navLinks()}</nav>
          <div className="hd-actions">
            <ChoixLangue langue={langue} className="hd-lang" />
            <Link href={lien(langue, "/reserver")} className="btn btn-primary">{t.reserver}</Link>
            <button className="burger" aria-label={t.menu} onClick={() => setDrawerOpen(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mob-nav${drawerOpen ? " is-open" : ""}`}
        aria-hidden={!drawerOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDrawerOpen(false);
        }}
      >
        <div className="mob-nav__panel">
          <button className="mob-nav__close" aria-label={t.fermer} onClick={() => setDrawerOpen(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          {navLinks(() => setDrawerOpen(false))}
          <Link href={lien(langue, "/reserver")} className="btn btn-primary btn-block" onClick={() => setDrawerOpen(false)}>
            {t.reserver}
          </Link>
          <ChoixLangue langue={langue} className="lang" />
        </div>
      </div>
    </>
  );
}
