import Link from "next/link";
import type { ReactNode } from "react";
import type { GiteData } from "@/lib/data/gites";
import { fmtNote, fmtPrix } from "@/lib/format";
import type { ChiffresGite } from "@/lib/gites-publics";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import ImageSlot from "./ImageSlot";
import styles from "./GiteCard.module.css";

const TEXTES: Bilingue<{
  personnes: (n: number) => string;
  avis: (n: number) => string;
  reco: (n: number) => string;
  aPartirDe: string;
  laSemaine: string;
  voir: string;
}> = {
  fr: {
    personnes: (n) => `${n} personnes`,
    avis: (n) => `${n} avis`,
    reco: (n) => `${n} % reco`,
    aPartirDe: "À partir de",
    laSemaine: "la semaine TTC",
    voir: "Voir le gîte",
  },
  en: {
    personnes: (n) => `${n} people`,
    avis: (n) => `${n} reviews`,
    reco: (n) => `${n}% recommend`,
    aPartirDe: "From",
    laSemaine: "per week, incl. tax",
    voir: "View the gîte",
  },
};

export interface GiteCardProps {
  langue: Langue;
  gite: GiteData;
  /** Chiffres lus en base. `null` = base injoignable ou gîte absent : la carte
   *  s'affiche sans capacité ni prix plutôt que de montrer des valeurs figées. */
  chiffres: ChiffresGite | null;
  /** Texte descriptif de la carte (peut contenir de l'emphase). */
  description: ReactNode;
  /** Libellé "chambres" (ex. "2 chambres", "1 chambre mansardée"). */
  bedroomsLabel: string;
  /** Légende du slot photo. */
  placeholder: string;
}

/** Carte gîte réutilisée (accueil + /gites) — reproduit .gite-card de index.html. */
export default function GiteCard({
  langue,
  gite,
  chiffres,
  description,
  bedroomsLabel,
  placeholder,
}: GiteCardProps) {
  const t = TEXTES[langue];
  const rating = fmtNote(gite.rating, langue);
  const capacite = chiffres?.capaciteMax ?? null;
  const plancher = chiffres?.plancherSemaine ?? null;
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <ImageSlot placeholder={placeholder} />
        <span className={styles.target}>{gite.short[langue]}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <h3 className={styles.name}>{gite.name}</h3>
          <span className={styles.code}>{gite.code}</span>
        </div>
        <div className={styles.caps}>
          {capacite !== null && (
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" />
                <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
                {capacite >= 4 && <path d="M21 21v-1a3 3 0 0 0-3-3" />}
              </svg>
              {t.personnes(capacite)}
            </span>
          )}
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 18v-6h18v6" /><path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
            </svg>
            {bedroomsLabel}
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 3v18" />
            </svg>
            {gite.surface}
          </span>
        </div>
        <p className={styles.desc}>{description}</p>
        <div className={styles.proof}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
          </svg>
          <strong>{rating}/5</strong>
          <span className={styles.sep} />
          <span>{t.avis(gite.reviews)}</span>
          <span className={styles.sep} />
          <span>{t.reco(gite.reco)}</span>
        </div>
        <div className={styles.foot}>
          {plancher !== null ? (
            <div className={styles.price}>
              <small>{t.aPartirDe}</small>
              <strong>{fmtPrix(plancher, langue)}</strong>
              <small>{t.laSemaine}</small>
            </div>
          ) : (
            <div />
          )}
          <Link className={styles.cta} href={lien(langue, `/gites/${gite.id}`)}>
            {t.voir}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
