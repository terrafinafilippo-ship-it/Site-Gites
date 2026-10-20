import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { ENTETE_LANGUE, langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { NOM_SITE } from "@/lib/i18n/metadonnees";
import NotFoundSearch from "./NotFoundSearch";
import styles from "./not-found.module.css";

const TEXTES: Bilingue<{
  titrePage: string;
  surtitre: string;
  titre: ReactNode;
  texte: string;
  accueil: string;
  gites: string;
  photo: string;
  citation: string;
}> = {
  fr: {
    titrePage: "Page introuvable",
    surtitre: "Vous avez pris un sentier de traverse",
    titre: <>Cette page<br />s&apos;est égarée dans les collines.</>,
    texte:
      "Le lien que vous avez suivi ne mène plus à rien — ou pas encore. Pas d'inquiétude, on vous remet sur le bon chemin.",
    accueil: "Retour à l'accueil",
    gites: "Voir les gîtes",
    photo: "Paysage Ardèche verte — chemin qui s'éloigne",
    citation: "« Tous les chemins de Samoyas mènent au spa. »",
  },
  en: {
    titrePage: "Page not found",
    surtitre: "You have taken a side path",
    titre: <>This page<br />has wandered off into the hills.</>,
    texte:
      "The link you followed no longer leads anywhere — or not yet. Don't worry, we'll put you back on the right path.",
    accueil: "Back to the home page",
    gites: "See the gîtes",
    photo: "Green Ardèche landscape — a path winding away",
    citation: "“All the paths of Samoyas lead to the spa.”",
  },
};

// La page introuvable ne reçoit pas `params` : la langue vient de l'en-tête
// posé par middleware.ts.
async function langueRequete(): Promise<Langue> {
  return langueDe((await headers()).get(ENTETE_LANGUE) ?? "");
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${TEXTES[await langueRequete()].titrePage} — ${NOM_SITE}` };
}

export default async function NotFound() {
  const langue = await langueRequete();
  const t = TEXTES[langue];
  return (
    <section>
      <div className="wrap">
        <div className={styles.nf}>
          <div>
            <div className={styles.big}>404</div>
            <span className="eyebrow">{t.surtitre}</span>
            <h1 style={{ marginTop: 16 }}>{t.titre}</h1>
            <p>{t.texte}</p>
            <NotFoundSearch langue={langue} />
            <div className={styles.actions}>
              <Link className="btn btn-primary" href={lien(langue, "/")}>{t.accueil}</Link>
              <Link className="btn btn-secondary" href={lien(langue, "/gites")}>{t.gites}</Link>
            </div>
          </div>
          <div className={styles.media}>
            <ImageSlot placeholder={t.photo} />
            <div className={styles.mediaOverlay}>{t.citation}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
