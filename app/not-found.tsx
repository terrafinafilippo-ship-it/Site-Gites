import type { Metadata } from "next";
import Link from "next/link";
import ImageSlot from "@/components/ui/ImageSlot";
import NotFoundSearch from "./NotFoundSearch";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page introuvable — Les Gîtes de Samoyas",
};

export default function NotFound() {
  return (
    <section>
      <div className="wrap">
        <div className={styles.nf}>
          <div>
            <div className={styles.big}>404</div>
            <span className="eyebrow">Vous avez pris un sentier de traverse</span>
            <h1 style={{ marginTop: 16 }}>
              Cette page<br />s&apos;est égarée dans les collines.
            </h1>
            <p>
              Le lien que vous avez suivi ne mène plus à rien — ou pas encore. Pas d&apos;inquiétude,
              on vous remet sur le bon chemin.
            </p>
            <NotFoundSearch />
            <div className={styles.actions}>
              <Link className="btn btn-primary" href="/">Retour à l&apos;accueil</Link>
              <Link className="btn btn-secondary" href="/gites">Voir les gîtes</Link>
            </div>
          </div>
          <div className={styles.media}>
            <ImageSlot placeholder="Paysage Ardèche verte — chemin qui s'éloigne" />
            <div className={styles.mediaOverlay}>« Tous les chemins de Samoyas mènent au spa. »</div>
          </div>
        </div>
      </div>
    </section>
  );
}
