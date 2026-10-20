import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GITE_IDS, type GiteId } from "@/lib/data/gites";
import { lireChiffresPublics } from "@/lib/gites-publics";
import { langueDe, type Bilingue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import ContactForm from "./ContactForm";
import styles from "./page.module.css";

// Rendu à la demande : les capacités des options du formulaire viennent de la
// base (cache de 60 s).
export const dynamic = "force-dynamic";

interface Params {
  lang: string;
}

const TEXTES: Bilingue<{
  titrePage: string;
  titre: ReactNode;
  intro: string;
  joindre: string;
  horaires: string;
  adresse: string;
  email: string;
  carte: string;
  itineraire: string;
}> = {
  fr: {
    titrePage: "Contact",
    titre: <>Une question ?<br />Patricia &amp; Nicolas vous répondent.</>,
    intro:
      "Décrochez-nous, ou écrivez-nous. Nous parlons français et anglais — et nous répondons toujours sous 24 heures.",
    joindre: "Nous joindre",
    horaires: "FR · EN — 9h → 20h",
    adresse: "Adresse",
    email: "Email",
    carte: "Carte de Samoyas",
    itineraire: "Itinéraire vers Samoyas",
  },
  en: {
    titrePage: "Contact",
    titre: <>A question?<br />Patricia &amp; Nicolas will answer.</>,
    intro:
      "Give us a call, or write to us. We speak French and English — and we always reply within 24 hours.",
    joindre: "Reach us",
    horaires: "FR · EN — 9 am → 8 pm",
    adresse: "Address",
    email: "Email",
    carte: "Map of Samoyas",
    itineraire: "Directions to Samoyas",
  },
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return metadonnees(langue, "/contact", TEXTES[langue].titrePage);
}

export default async function ContactPage({ params }: { params: Promise<Params> }) {
  const langue = langueDe((await params).lang);
  const t = TEXTES[langue];
  const publics = await lireChiffresPublics();
  const capacites: Partial<Record<GiteId, number>> = {};
  for (const slug of GITE_IDS) {
    const chiffres = publics.parGite[slug];
    if (chiffres) capacites[slug] = chiffres.capaciteMax;
  }

  return (
    <>
      <section className={styles.pageHero}>
        <div className="wrap">
          <span className="eyebrow">{t.titrePage}</span>
          <h1 style={{ marginTop: 16 }}>{t.titre}</h1>
          <p>{t.intro}</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className={styles.contactGrid}>
            <div className={styles.coords}>
              <h2>{t.joindre}</h2>

              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Patricia Terrafina</div>
                <div className={styles.coordsValue}>+33 6 79 33 23 51</div>
                <div className={styles.coordsSub}>{t.horaires}</div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Nicolas Terrafina</div>
                <div className={styles.coordsValue}>+33 6 66 89 96 24</div>
                <div className={styles.coordsSub}>{t.horaires}</div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>{t.adresse}</div>
                <div className={styles.coordsValue}>
                  Hameau de Samoyas<br />07430 Savas, Ardèche
                </div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>{t.email}</div>
                <div className={styles.coordsValue} style={{ fontSize: 17, fontFamily: "var(--font-sans)" }}>
                  contact@gites-samoyas.fr
                </div>
              </div>

              <div className={styles.coordsMap} aria-label={t.carte}>
                <div className={styles.coordsPulse} />
                <div className={styles.coordsPin}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" />
                    <circle cx="12" cy="10" r="2.5" fill="#fbfaf6" />
                  </svg>
                </div>
                <span className={styles.coordsMapAttr}>© OpenStreetMap</span>
              </div>
              <a className={`btn btn-secondary ${styles.coordsRouteBtn}`} href="#">
                {t.itineraire}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
            </div>

            <ContactForm langue={langue} capacites={capacites} />
          </div>
        </div>
      </section>
    </>
  );
}
