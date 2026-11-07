// Le cadre commun des pages des tarifs (Phase 5, lot 3, D-34) : en-tête,
// onglets, et l'état de la tarification en haut de chaque page — jusqu'où
// tout est réservable, et ce qui manque.
import Link from "next/link";
import type { ReactNode } from "react";

import { NOMS_JOURS_ISO } from "@/lib/dates-civiles";
import type { EtatTarifs } from "@/lib/gestion/tarifs-regles";
import { dateLisible, trouLisible } from "@/lib/gestion/tarifs-regles";

import Entete from "../Entete";
import styles from "../gestion.module.css";

const ONGLETS = [
  { href: "/gestion/tarifs", libelle: "Prix" },
  { href: "/gestion/tarifs/periodes", libelle: "Périodes" },
  { href: "/gestion/tarifs/baremes", libelle: "Barèmes" },
  { href: "/gestion/tarifs/regles", libelle: "Règles" },
  { href: "/gestion/tarifs/taxe", libelle: "Taxe de séjour" },
] as const;

export type Onglet = (typeof ONGLETS)[number]["href"];

export function Etat({ etat }: { etat: EtatTarifs }) {
  const rien = etat.reservableJusqua === null;
  const complet = !rien && etat.trous.length === 0 && etat.problemes.length === 0;
  return (
    <section className={`${styles.message} ${complet ? styles.ok : styles.ko}`} aria-label="État des tarifs">
      <p>
        <strong>
          {rien
            ? "Rien n'est réservable aujourd'hui : il manque des tarifs."
            : `Tout est réservable jusqu'au ${dateLisible(etat.reservableJusqua as string)} (dernier jour de départ possible).`}
        </strong>
      </p>
      {(etat.trous.length > 0 || etat.problemes.length > 0) && (
        <ul>
          {etat.trous.map((t) => (
            <li key={t.debut}>{trouLisible(t)}</li>
          ))}
          {etat.problemes.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Cadre({ courant, etat, children }: { courant: Onglet; etat: EtatTarifs; children: ReactNode }) {
  return (
    <>
      <Entete courante="/gestion/tarifs" />
      <main className={styles.page}>
        <h1>Tarifs</h1>
        <nav className={styles.onglets} aria-label="Parties des tarifs">
          {ONGLETS.map((o) => (
            <Link key={o.href} href={o.href} aria-current={o.href === courant ? "page" : undefined}>
              {o.libelle}
            </Link>
          ))}
        </nav>
        <Etat etat={etat} />
        {children}
      </main>
    </>
  );
}

/** Les sept jours, pour les cases à cocher. */
export const JOURS = NOMS_JOURS_ISO.map((nom, i) => ({ valeur: i + 1, nom }));
