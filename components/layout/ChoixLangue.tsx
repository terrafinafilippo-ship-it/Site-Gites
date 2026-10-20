"use client";

import { usePathname } from "next/navigation";
import {
  ATTRIBUT_LANG,
  cheminSansLangue,
  LANGUES,
  lien,
  NOM_LANGUE,
  type Langue,
} from "@/lib/i18n/langues";

/**
 * Sélecteur FR / EN : mène à la MÊME page dans l'autre langue, avec ses
 * paramètres (dates du tunnel) et son ancre. Ce sont de vrais liens : un moteur
 * de recherche les suit, et ils fonctionnent sans JavaScript.
 *
 * `avantChangement` : appelé avant de quitter la page. Le tunnel y lève le
 * blocage de ses dates, sans quoi le client retrouverait ses propres dates
 * « déjà prises » en revenant dans l'autre langue.
 */
export default function ChoixLangue({
  langue,
  className,
  avantChangement,
}: {
  langue: Langue;
  className?: string;
  avantChangement?: () => void | Promise<void>;
}) {
  const chemin = cheminSansLangue(usePathname() ?? "/");
  return (
    <div className={className} role="group" aria-label={langue === "fr" ? "Langue" : "Language"}>
      {LANGUES.map((l) => (
        <a
          key={l}
          href={lien(l, chemin)}
          hrefLang={ATTRIBUT_LANG[l]}
          lang={ATTRIBUT_LANG[l]}
          title={NOM_LANGUE[l].long}
          className={l === langue ? "is-active" : undefined}
          aria-current={l === langue ? "true" : undefined}
          onClick={async (e) => {
            e.preventDefault();
            if (l === langue) return;
            await avantChangement?.();
            window.location.assign(`${lien(l, chemin)}${window.location.search}${window.location.hash}`);
          }}
        >
          {NOM_LANGUE[l].court}
        </a>
      ))}
    </div>
  );
}
