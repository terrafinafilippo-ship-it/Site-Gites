"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cheminSansLangue, type Bilingue, type Langue } from "@/lib/i18n/langues";

const STORAGE_KEY = "gites-cookies";

// Un consentement doit être compris par celui qui le donne : la bannière suit
// la langue de la page. La traduction anglaise est à faire valider avec les
// pages juridiques (docs/06-avant-premier-client.md, point 13).
const TEXTES: Bilingue<{
  titre: string;
  texte: string;
  refuser: string;
  personnaliser: string;
  accepter: string;
}> = {
  fr: {
    titre: "Votre confort, votre choix",
    texte:
      "Nous utilisons des cookies pour mesurer l'audience et améliorer votre lecture. Aucune case n'est pré-cochée — votre refus est aussi simple que l'acceptation.",
    refuser: "Tout refuser",
    personnaliser: "Personnaliser",
    accepter: "Tout accepter",
  },
  en: {
    titre: "Your comfort, your choice",
    texte:
      "We use cookies to measure our audience and improve your reading experience. No box is pre-ticked — refusing is as easy as accepting.",
    refuser: "Refuse all",
    personnaliser: "Customise",
    accepter: "Accept all",
  },
};

/** Bannière cookies — reproduit renderCookies() de site.js.
 *  Affichée à la première visite sur l'accueil uniquement (comme l'original
 *  qui passait showCookies: true sur index.html seul). */
export default function CookieBanner({ langue }: { langue: Langue }) {
  const surAccueil = cheminSansLangue(usePathname() ?? "/") === "/";
  const [open, setOpen] = useState(false);
  const t = TEXTES[langue];

  useEffect(() => {
    if (!surAccueil) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* localStorage indisponible — pas de bannière */
    }
  }, [surAccueil]);

  if (!open || !surAccueil) return null;

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
      <h6 id="cookies-title">{t.titre}</h6>
      <p>{t.texte}</p>
      <div className="cookies-actions">
        <button className="btn btn-ghost" onClick={() => choose("refuse")}>{t.refuser}</button>
        <button className="btn btn-ghost" onClick={() => choose("custom")}>{t.personnaliser}</button>
        <button className="btn btn-primary" onClick={() => choose("accept")}>{t.accepter}</button>
      </div>
    </div>
  );
}
