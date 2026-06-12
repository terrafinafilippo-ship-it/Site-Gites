"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SITE_NAV, type NavId } from "@/lib/data/nav";

function activeIdFromPath(pathname: string): NavId {
  if (pathname.startsWith("/gites")) return "gites";
  if (pathname.startsWith("/activites")) return "act";
  if (pathname.startsWith("/contact")) return "contact";
  return "home";
}

/** Header sticky + drawer mobile — reproduit renderHeader() de site.js. */
export default function Header() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // La page /reserver utilise son propre header de tunnel (cf. reserver.html
  // qui ne montait pas le header de site).
  if (pathname.startsWith("/reserver")) return null;

  const activeId = activeIdFromPath(pathname);

  const navLinks = (onClick?: () => void) =>
    SITE_NAV.map((n) => (
      <Link
        key={n.id}
        href={n.href}
        className={n.id === activeId ? "is-active" : ""}
        onClick={onClick}
      >
        {n.label}
      </Link>
    ));

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Link href="/" className="brand" aria-label="Les Gîtes de Samoyas — accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" className="brand__logo" />
          </Link>
          <nav aria-label="Navigation principale">{navLinks()}</nav>
          <div className="hd-actions">
            <div className="hd-lang" role="group" aria-label="Langue">
              <button className="is-active" data-lang="fr">FR</button>
              <button data-lang="en">EN</button>
              <button data-lang="it">IT</button>
            </div>
            <Link href="/reserver" className="btn btn-primary">Réserver un séjour</Link>
            <button className="burger" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
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
          <button className="mob-nav__close" aria-label="Fermer le menu" onClick={() => setDrawerOpen(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          {navLinks(() => setDrawerOpen(false))}
          <Link href="/reserver" className="btn btn-primary btn-block" onClick={() => setDrawerOpen(false)}>
            Réserver un séjour
          </Link>
          <div className="lang">
            <button className="is-active">FR</button>
            <button>EN</button>
            <button>IT</button>
          </div>
        </div>
      </div>
    </>
  );
}
