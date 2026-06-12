import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Contact — Les Gîtes de Samoyas",
};

export default function ContactPage() {
  return (
    <>
      <section className={styles.pageHero}>
        <div className="wrap">
          <span className="eyebrow">Contact</span>
          <h1 style={{ marginTop: 16 }}>
            Une question ?<br />Patricia &amp; Nicolas vous répondent.
          </h1>
          <p>
            Décrochez-nous, ou écrivez-nous. Nous parlons français, anglais et italien — et nous
            répondons toujours sous 24 heures.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className={styles.contactGrid}>
            <div className={styles.coords}>
              <h2>Nous joindre</h2>

              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Patricia Terrafina</div>
                <div className={styles.coordsValue}>+33 6 79 33 23 51</div>
                <div className={styles.coordsSub}>FR · EN · IT — 9h → 20h</div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Nicolas Terrafina</div>
                <div className={styles.coordsValue}>+33 6 66 89 96 24</div>
                <div className={styles.coordsSub}>FR · EN · IT — 9h → 20h</div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Adresse</div>
                <div className={styles.coordsValue}>
                  Hameau de Samoyas<br />07430 Savas, Ardèche
                </div>
              </div>
              <div className={styles.coordsBlock}>
                <div className={styles.coordsLabel}>Email</div>
                <div className={styles.coordsValue} style={{ fontSize: 17, fontFamily: "var(--font-sans)" }}>
                  contact@gites-samoyas.fr
                </div>
              </div>

              <div className={styles.coordsMap} aria-label="Carte de Samoyas">
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
                Itinéraire vers Samoyas
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
            </div>

            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
