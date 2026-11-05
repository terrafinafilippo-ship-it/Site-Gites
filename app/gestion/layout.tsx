// Le BACK-OFFICE (Phase 5, D-32) : à l'adresse /gestion, hors de
// l'aiguillage des langues (middleware.ts), en français seulement, invisible
// des moteurs de recherche (balise robots ici, en-tête X-Robots-Tag dans le
// middleware). Mise en page à part du site public : aucun en-tête, aucun pied
// de page, aucun bandeau de témoins (les témoins d'ici sont indispensables).
import type { Metadata } from "next";

import styles from "./gestion.module.css";

export const metadata: Metadata = {
  title: "Gestion — Les Gîtes de Samoyas",
  robots: { index: false, follow: false },
  // Le lien du mot de passe porte son jeton dans l'adresse : il ne part jamais vers un autre site.
  referrer: "no-referrer",
};

export default function GestionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={styles.corps}>{children}</body>
    </html>
  );
}
