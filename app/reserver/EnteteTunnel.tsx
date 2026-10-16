import Link from "next/link";
import styles from "./page.module.css";

/**
 * En-tête allégé du tunnel (le header du site est masqué sur /reserver).
 * `onQuitter` est appelé avant de quitter : le tunnel y lève le blocage de ses
 * dates. Sans lui (choix du gîte, tunnel indisponible), le lien suffit.
 */
export default function EnteteTunnel({ onQuitter }: { onQuitter?: () => void }) {
  return (
    <header className={styles.funnelHeader}>
      <div className={`wrap ${styles.funnelHeaderRow}`}>
        <Link href="/" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" style={{ height: 72, width: "auto" }} />
        </Link>
        <Link className={styles.funnelQuit} href="/" onClick={onQuitter}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
          Quitter la réservation
        </Link>
      </div>
    </header>
  );
}
