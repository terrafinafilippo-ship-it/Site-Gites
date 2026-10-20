"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ajouterJours, jourSemaineIso, nombreDeNuits, premierJourDuMois } from "@/lib/dates-civiles";
import { datesPossibles, joursDuCalendrier, type ContexteDevis } from "@/lib/devis";
import { fmtDateLongue, fmtMois, INITIALES_JOURS } from "@/lib/format";
import type { Bilingue } from "@/lib/i18n/langues";
import styles from "./page.module.css";

const TEXTES: Bilingue<{
  precedent: string;
  suivant: string;
  choisirDepart: string;
  choisirArrivee: string;
  libre: string;
  pris: string;
  ferme: string;
  departPossible: string;
}> = {
  fr: {
    precedent: "Mois précédent",
    suivant: "Mois suivant",
    choisirDepart: "Choisissez votre jour de départ.",
    choisirArrivee: "Choisissez votre jour d'arrivée.",
    libre: "Libre",
    pris: "Pris",
    ferme: "Non réservable en ligne",
    departPossible: "Départ possible",
  },
  en: {
    precedent: "Previous month",
    suivant: "Next month",
    choisirDepart: "Choose your departure day.",
    choisirArrivee: "Choose your arrival day.",
    libre: "Available",
    pris: "Taken",
    ferme: "Not bookable online",
    departPossible: "Possible departure",
  },
};

const Precedent = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="15 6 9 12 15 18" />
  </svg>
);
const Suivant = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

/**
 * Calendrier du tunnel, un mois à la fois. Les états viennent du devis
 * (lib/devis.ts) : nuits prises, nuits sans tarif, jours d'arrivée possibles
 * et, une arrivée choisie, jours de départ possibles.
 *
 * Un jour qui ne respecte pas une règle (« arrivée le samedi ») reste
 * cliquable : le devis affiche alors la règle en clair, ce qui en dit plus
 * qu'une case grisée. Seuls les jours passés, pris ou sans tarif ne se
 * choisissent pas comme arrivée.
 */
export default function Calendrier({
  ctx,
  horizon,
  arrivee,
  depart,
  onChange,
}: {
  ctx: ContexteDevis;
  /** Jour suivant la dernière nuit tarifée ; `null` : aucun tarif, un an affiché. */
  horizon: string | null;
  arrivee: string | null;
  depart: string | null;
  onChange: (arrivee: string | null, depart: string | null) => void;
}) {
  const { aujourdhui } = ctx.donnees;
  const langue = ctx.langue;
  const t = TEXTES[langue];
  const derniereNuit = ajouterJours(horizon ?? ajouterJours(aujourdhui, 366), -1);
  const premierMois = premierJourDuMois(aujourdhui);
  const dernierMois = premierJourDuMois(derniereNuit < aujourdhui ? aujourdhui : derniereNuit);
  const [mois, setMois] = useState(() => premierJourDuMois(arrivee ?? aujourdhui));

  const choixDepart = arrivee !== null && depart === null;
  const nbJours = nombreDeNuits(mois, premierJourDuMois(mois, 1));
  const jours = useMemo(() => joursDuCalendrier(ctx, mois, nbJours), [ctx, mois, nbJours]);
  const departsPossibles = useMemo(() => {
    if (!choixDepart || arrivee === null) return new Set<string>();
    return new Set(jours.filter((j) => datesPossibles(ctx, arrivee, j.date)).map((j) => j.date));
  }, [ctx, jours, arrivee, choixDepart]);

  function cliquer(date: string, peutArriver: boolean) {
    if (choixDepart && arrivee !== null && date > arrivee) {
      onChange(arrivee, date);
      return;
    }
    if (peutArriver) onChange(date, null);
  }

  const cellules: ReactNode[] = INITIALES_JOURS[langue].map((n, i) => (
    <div className={`${styles.mcDay} ${styles.dayname}`} key={`n-${i}`}>{n}</div>
  ));
  for (let i = 1; i < jourSemaineIso(mois); i += 1) {
    cellules.push(<div className={`${styles.mcDay} ${styles.empty}`} key={`v-${i}`} />);
  }
  for (const j of jours) {
    const passe = j.date < aujourdhui;
    const dansSejour = arrivee !== null && depart !== null && j.date > arrivee && j.date < depart;
    const estArrivee = j.date === arrivee;
    const estDepart = j.date === depart;
    const departPossible = departsPossibles.has(j.date);
    // Comme arrivée : ni passé, ni pris, ni sans tarif. Comme départ : tout jour après l'arrivée.
    const peutArriver = !passe && !j.prise && !j.sansTarif;
    const cliquable = peutArriver || (choixDepart && arrivee !== null && j.date > arrivee);

    const classes = [styles.mcDay];
    if (estArrivee) classes.push(styles.start);
    else if (estDepart) classes.push(styles.end);
    else if (dansSejour) classes.push(styles.inRange);
    else if (passe) classes.push(styles.past);
    else if (choixDepart && departPossible) classes.push(styles.possible);
    else if (j.prise) classes.push(styles.busy);
    else if (j.sansTarif) classes.push(styles.closed);
    if (!cliquable) classes.push(styles.disabled);

    cellules.push(
      <button
        type="button"
        className={classes.join(" ")}
        key={j.date}
        disabled={!cliquable}
        aria-pressed={estArrivee || estDepart}
        aria-label={fmtDateLongue(j.date, langue)}
        onClick={() => cliquer(j.date, peutArriver)}
      >
        {Number(j.date.slice(8, 10))}
      </button>,
    );
  }

  return (
    <div className={styles.miniCal}>
      <div className={styles.miniCalNav}>
        <button
          aria-label={t.precedent}
          type="button"
          disabled={mois <= premierMois}
          onClick={() => setMois(premierJourDuMois(mois, -1))}
        >
          {Precedent}
        </button>
        <span className={styles.miniCalTitle}>
          {fmtMois(mois, langue)}
        </span>
        <button
          aria-label={t.suivant}
          type="button"
          disabled={mois >= dernierMois}
          onClick={() => setMois(premierJourDuMois(mois, 1))}
        >
          {Suivant}
        </button>
      </div>
      <div className={styles.miniCalGrid}>{cellules}</div>
      <p className={styles.miniCalAide}>
        {choixDepart ? t.choisirDepart : t.choisirArrivee}
      </p>
      <div className={styles.miniCalLegende}>
        <span><i className={styles.legendeLibre} />{t.libre}</span>
        <span><i className={styles.legendePris} />{t.pris}</span>
        <span><i className={styles.legendeFerme} />{t.ferme}</span>
        {choixDepart && <span><i className={styles.legendePossible} />{t.departPossible}</span>}
      </div>
    </div>
  );
}
