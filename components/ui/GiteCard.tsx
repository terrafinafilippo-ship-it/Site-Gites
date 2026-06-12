import Link from "next/link";
import type { ReactNode } from "react";
import type { GiteData } from "@/lib/data/gites";
import ImageSlot from "./ImageSlot";
import styles from "./GiteCard.module.css";

export interface GiteCardProps {
  gite: GiteData;
  /** Texte descriptif de la carte (peut contenir de l'emphase). */
  description: ReactNode;
  /** Libellé "chambres" (ex. "2 chambres", "1 chambre mansardée"). */
  bedroomsLabel: string;
  /** Légende du slot photo. */
  placeholder: string;
}

/** Carte gîte réutilisée (accueil + /gites) — reproduit .gite-card de index.html. */
export default function GiteCard({ gite, description, bedroomsLabel, placeholder }: GiteCardProps) {
  const rating = String(gite.rating.toFixed(1)).replace(".", ",");
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <ImageSlot placeholder={placeholder} />
        <span className={styles.target}>{gite.short}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <h3 className={styles.name}>{gite.name}</h3>
          <span className={styles.code}>{gite.code}</span>
        </div>
        <div className={styles.caps}>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" />
              <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
              {gite.sleeps >= 4 && <path d="M21 21v-1a3 3 0 0 0-3-3" />}
            </svg>
            {gite.sleeps} personnes
          </span>
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
          <span>{gite.reviews} avis</span>
          <span className={styles.sep} />
          <span>{gite.reco} % reco</span>
        </div>
        <div className={styles.foot}>
          <div className={styles.price}>
            <small>À partir de</small>
            <strong>{gite.price} €</strong>
            <small>la semaine TTC</small>
          </div>
          <Link className={styles.cta} href={`/gites/${gite.id}`}>
            Voir le gîte
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
