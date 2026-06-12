"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gites-cookies";

/** Bannière cookies — reproduit renderCookies() de site.js.
 *  Affichée à la première visite sur l'accueil uniquement (comme l'original
 *  qui passait showCookies: true sur index.html seul). */
export default function CookieBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* localStorage indisponible — pas de bannière */
    }
  }, [pathname]);

  if (!open || pathname !== "/") return null;

  const choose = (choice: "refuse" | "custom" | "accept") => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="cookies is-open" role="dialog" aria-labelledby="cookies-title">
      <h6 id="cookies-title">Votre confort, votre choix</h6>
      <p>
        Nous utilisons des cookies pour mesurer l&apos;audience et améliorer votre lecture.
        Aucune case n&apos;est pré-cochée — votre refus est aussi simple que l&apos;acceptation.
      </p>
      <div className="cookies-actions">
        <button className="btn btn-ghost" onClick={() => choose("refuse")}>Tout refuser</button>
        <button className="btn btn-ghost" onClick={() => choose("custom")}>Personnaliser</button>
        <button className="btn btn-primary" onClick={() => choose("accept")}>Tout accepter</button>
      </div>
    </div>
  );
}
