import type { CSSProperties } from "react";
import styles from "./ImageSlot.module.css";

export interface ImageSlotProps {
  /** Légende affichée dans l'état vide. */
  placeholder?: string;
  /** URL d'image optionnelle — si fournie, une <img> est rendue.
   *  Conçu pour basculer vers next/image en Phase 2 sans toucher aux pages. */
  src?: string;
  alt?: string;
  shape?: "rect" | "rounded" | "circle" | "pill";
  /** Rayon en px pour shape="rounded". */
  radius?: number;
  fit?: "cover" | "contain" | "fill";
  /** object-position (ex. "50% 50%"). */
  position?: string;
  className?: string;
  style?: CSSProperties;
}

/** Slot d'image statique — remplace le composant design-time <image-slot>.
 *  Rend le gradient de remplissage + légende tant qu'aucune photo n'est
 *  fournie ; sinon l'image, avec les mêmes attributs utiles. */
export default function ImageSlot({
  placeholder = "Photo à venir",
  src,
  alt = "",
  shape = "rect",
  radius = 12,
  fit = "cover",
  position = "50% 50%",
  className,
  style,
}: ImageSlotProps) {
  const borderRadius =
    shape === "circle" ? "50%" :
    shape === "pill" ? "9999px" :
    shape === "rounded" ? `${radius}px` :
    undefined;

  return (
    <div
      className={`${styles.slot}${className ? ` ${className}` : ""}`}
      style={{ borderRadius, ...style }}
      role={src ? undefined : "img"}
      aria-label={src ? undefined : placeholder}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.img}
          src={src}
          alt={alt || placeholder}
          style={{ objectFit: fit, objectPosition: position }}
        />
      ) : (
        <div className={styles.empty} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <div className={styles.caption}>{placeholder}</div>
        </div>
      )}
    </div>
  );
}
