import Link from "next/link";
import ImageSlot from "@/components/ui/ImageSlot";
import GiteCard from "@/components/ui/GiteCard";
import { GITES } from "@/lib/data/gites";
import styles from "./page.module.css";

const ArrowRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroMedia}>
          <ImageSlot placeholder="Photo hero — vue d'ensemble du hameau de Samoyas, lumière dorée, fin d'après-midi" />
        </div>
        <div className={styles.heroCorner}>
          <span className="dot" />
          <span>Ardèche verte · hameau de Samoyas</span>
        </div>
        <div className={`${styles.heroInner} wrap`}>
          <div className={styles.heroLockup}>
            <div>
              <span className="eyebrow on-dark" style={{ color: "rgba(239,228,200,0.85)" }}>
                Hameau de Samoyas · Savas
              </span>
              <h1>
                Trois écrins de détente,<br />
                <em>au calme de l&apos;Ardèche.</em>
              </h1>
              <p className={styles.heroSub}>
                Patricia &amp; Nicolas vous accueillent dans trois gîtes labellisés Gîtes de France.
                Spa privatif, linge fourni — le calme de la campagne, sans s&apos;éloigner du nécessaire.
              </p>
              <div className={styles.heroActions}>
                <Link className="btn btn-on-dark" href="/reserver">Réserver un séjour</Link>
                <Link className="btn btn-outline-light" href="/gites">
                  Découvrir les gîtes
                  {ArrowRight}
                </Link>
              </div>
            </div>
            <div className={styles.heroMeta}>
              <div className={styles.heroMetaRow}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
                </svg>
                <span><strong>4,97/5</strong> sur 46 avis vérifiés Gîtes de France</span>
              </div>
              <div className={styles.heroMetaRow}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>Savas, 07430 — Ardèche verte</span>
              </div>
              <div className={styles.heroMetaRow}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="16" rx="1" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="8" y1="3" x2="8" y2="7" />
                  <line x1="16" y1="3" x2="16" y2="7" />
                </svg>
                <span>De 450 à 690 € la semaine — selon le gîte</span>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.heroScroll}>↓ Découvrir</div>
      </section>

      {/* LES TROIS GÎTES */}
      <section className="section" id="gites">
        <div className="wrap">
          <div className={styles.gitesIntro}>
            <div>
              <span className="eyebrow">Nos gîtes</span>
              <h2 style={{ marginTop: 14 }}>
                Trois caractères,<br />une même promesse.
              </h2>
            </div>
            <p>
              Chaque gîte a son atmosphère — pour un couple, une famille, ou les deux ensemble.
              Regroupables jusqu&apos;à dix personnes, ils partagent la même attention : la pierre,
              le linge, le spa, et l&apos;équilibre rare entre vrai calme et tout-à-portée.
            </p>
          </div>

          <div className={styles.gitesGrid}>
            <GiteCard
              gite={GITES.laphine}
              bedroomsLabel="2 chambres"
              placeholder="LaPhine — véranda spa, vue Ardèche"
              description="Spa encastré en véranda chauffée, garage privatif, deux chambres pour la tribu."
            />
            <GiteCard
              gite={GITES.armu}
              bedroomsLabel="1 chambre mansardée"
              placeholder="L'Armu — jacuzzi véranda, cheminée"
              description="Jacuzzi sous la véranda, cheminée d'ambiance, chambre mansardée — l'intime pour deux."
            />
            <GiteCard
              gite={GITES["maison-vieille"]}
              bedroomsLabel="2 chambres"
              placeholder="La Maison Vieille — spa et sauna, pierre ancienne"
              description={
                <>Le seul gîte avec spa <em>et</em> sauna privatifs. Pierre apparente, volumes nobles.</>
              }
            />
          </div>
        </div>
      </section>

      {/* CE QUI VOUS ATTEND À L'ARRIVÉE */}
      <section className={styles.arrival}>
        <div className="wrap">
          <div className={styles.arrivalHead}>
            <div>
              <span className="eyebrow">À votre arrivée</span>
              <h2 style={{ marginTop: 14 }}>
                Ce qui vous attend<br /><em>en passant la porte.</em>
              </h2>
            </div>
            <p>
              Vous arrivez, vous déposez les sacs, et c&apos;est tout. Les lits sont faits, le spa
              chauffe. Aucune corvée d&apos;installation — juste l&apos;envie d&apos;ouvrir une
              bouteille et de souffler.
            </p>
          </div>

          <div className={styles.arrivalGrid}>
            <div className={styles.arrivalItem}>
              <span className={styles.arrivalIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12h20" />
                  <path d="M5 12c0-3 2-5 7-5s7 2 7 5" />
                  <path d="M3 18c2 1 4 1.5 6 1.5s4-.5 6-1.5" />
                  <path d="M15 18c2 1 4 1.5 6 1.5" />
                  <path d="M8 7V4" />
                  <path d="M12 7V3" />
                  <path d="M16 7V4" />
                </svg>
              </span>
              <h3 className={styles.arrivalLabel}>Le spa déjà chauffé</h3>
            </div>

            <div className={styles.arrivalItem}>
              <span className={styles.arrivalIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9" />
                  <path d="M3 14h18" />
                  <path d="M3 21v-3M21 21v-3" />
                  <path d="M7 7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" />
                </svg>
              </span>
              <h3 className={styles.arrivalLabel}>Les lits faits, le linge de toilette fourni</h3>
            </div>

            <div className={styles.arrivalItem}>
              <span className={styles.arrivalIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </span>
              <h3 className={styles.arrivalLabel}>L&apos;accueil chaleureux de Patricia &amp; Nicolas</h3>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF DARK */}
      <section className={styles.socialProof}>
        <div className={`wrap ${styles.socialProofInner}`}>
          <span className="eyebrow">La confiance de nos hôtes</span>
          <div className={styles.socialProofBig}>
            4,97<sup>/5</sup>
          </div>
          <div className={styles.socialProofStats}>
            <div className={styles.socialProofStat}>
              <strong>46</strong>
              <span>Avis vérifiés Gîtes de France</span>
            </div>
            <div className={styles.socialProofStat}>
              <strong>100 %</strong>
              <span>de recommandation</span>
            </div>
            <div className={styles.socialProofStat}>
              <strong>2018</strong>
              <span>Labellisés depuis</span>
            </div>
          </div>
        </div>
      </section>

      {/* ACTIVITÉS APERÇU */}
      <section className="section">
        <div className="wrap">
          <div className={styles.gitesIntro}>
            <div>
              <span className="eyebrow">Activités &amp; découverte</span>
              <h2 style={{ marginTop: 14 }}>
                À cinq minutes,<br />ou à cinq pas.
              </h2>
            </div>
            <p>
              L&apos;Ardèche verte se découvre au gré de vos envies — parcs animaliers, villages
              médiévaux, sentiers du Pilat, vignerons et marchés. Les gîtes ne sont qu&apos;un point
              de départ.
            </p>
          </div>
          <div className={styles.actsPreview}>
            <Link href="/activites#peaugres" className={styles.actCard}>
              <div className={`${styles.actCardMedia} ${styles.year}`} />
              <div className={styles.actCardBody}>
                <div className={styles.actCardDist}>10 min · Toute l&apos;année</div>
                <div className={styles.actCardTitle}>Safari de Peaugres</div>
              </div>
            </Link>
            <Link href="/activites#golf" className={styles.actCard}>
              <div className={`${styles.actCardMedia} ${styles.summer}`} />
              <div className={styles.actCardBody}>
                <div className={styles.actCardDist}>5 min · Été</div>
                <div className={styles.actCardTitle}>Golf 18 trous de Gourdan</div>
              </div>
            </Link>
            <Link href="/activites#viafluvia" className={styles.actCard}>
              <div className={`${styles.actCardMedia} ${styles.spring}`} />
              <div className={styles.actCardBody}>
                <div className={styles.actCardDist}>3 km · Printemps</div>
                <div className={styles.actCardTitle}>Via Fluvia à vélo</div>
              </div>
            </Link>
            <Link href="/activites#pilat" className={styles.actCard}>
              <div className={`${styles.actCardMedia} ${styles.winter}`} />
              <div className={styles.actCardBody}>
                <div className={styles.actCardDist}>25 min · Hiver</div>
                <div className={styles.actCardTitle}>Ski au Mont Pilat</div>
              </div>
            </Link>
          </div>
          <div style={{ marginTop: 32 }}>
            <Link className="btn btn-secondary" href="/activites">
              Voir toutes les activités
              {ArrowRight}
            </Link>
          </div>
        </div>
      </section>

      {/* AMBIANCE BAND */}
      <section className={styles.ambiance}>
        <div className="wrap-narrow">
          <p className={styles.ambianceQuote}>
            Au cœur de l&apos;Ardèche verte, dans le calme d&apos;un hameau préservé, trois gîtes de
            pierre vous attendent à Samoyas.
          </p>
        </div>
      </section>

      {/* CONTACT / LOCALISATION */}
      <section className="section">
        <div className="wrap">
          <div className={styles.contactLoc}>
            <div className={styles.contactLocMap} aria-label="Carte de Samoyas">
              <div className={styles.contactLocPinPulse} />
              <div className={styles.contactLocPin}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" fill="currentColor" />
                  <circle cx="12" cy="10" r="2.5" fill="#fbfaf6" />
                </svg>
              </div>
              <span className={styles.contactLocMapAttr}>© OpenStreetMap</span>
            </div>
            <div>
              <span className="eyebrow">Nous trouver</span>
              <h2 style={{ marginTop: 14 }}>Le hameau de Samoyas, en Ardèche verte.</h2>
              <p className={styles.contactLocAddress}>
                Hameau de Samoyas<br />07430 Savas, Ardèche
              </p>
              <div className={styles.contactLocCoords}>
                <span><strong>Patricia Terrafina</strong> · +33 6 79 33 23 51</span>
                <span><strong>Nicolas Terrafina</strong> · +33 6 66 89 96 24</span>
                <span>Accueil en français · anglais · italien</span>
              </div>
              <div className={styles.contactLocActions}>
                <Link href="/contact" className="btn btn-primary">Nous contacter</Link>
                <a href="#" className="btn btn-ghost">Itinéraire</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
