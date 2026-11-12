import Link from "next/link";

import { actionDeconnexion } from "./actions";
import styles from "./gestion.module.css";

const RUBRIQUES = [
  { href: "/gestion", libelle: "Accueil" },
  { href: "/gestion/reservations", libelle: "Réservations" },
  { href: "/gestion/calendrier", libelle: "Calendrier" },
  { href: "/gestion/tarifs", libelle: "Tarifs" },
  { href: "/gestion/gites", libelle: "Gîtes" },
  { href: "/gestion/documents", libelle: "Documents" },
  { href: "/gestion/avis", libelle: "Avis" },
  { href: "/gestion/statistiques", libelle: "Statistiques" },
  { href: "/gestion/reglages", libelle: "Réglages" },
  { href: "/gestion/appareils", libelle: "Appareils" },
] as const;

/** En-tête des pages protégées du back-office. */
export default function Entete({ courante }: { courante: (typeof RUBRIQUES)[number]["href"] }) {
  return (
    <header className={styles.entete}>
      <div className={styles.enteteInterieur}>
        <Link href="/gestion" className={styles.marque}>
          Gestion — Les Gîtes de Samoyas
        </Link>
        <nav className={styles.nav} aria-label="Rubriques">
          {RUBRIQUES.map((r) => (
            <Link key={r.href} href={r.href} aria-current={r.href === courante ? "page" : undefined}>
              {r.libelle}
            </Link>
          ))}
          <form action={actionDeconnexion}>
            <button type="submit" className={styles.lienBouton}>
              Se déconnecter
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
