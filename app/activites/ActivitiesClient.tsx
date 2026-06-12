"use client";

import { useState, type CSSProperties } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { ACTIVITIES, SEASON_ACCENTS, type Season } from "@/lib/data/activities";
import styles from "./page.module.css";

const CHIPS: { season: Season; label: string }[] = [
  { season: "all",    label: "Toute l'année" },
  { season: "spring", label: "Printemps" },
  { season: "summer", label: "Été" },
  { season: "autumn", label: "Automne" },
  { season: "winter", label: "Hiver" },
];

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Page Activités — le filtre saison re-teinte la page via [data-season]
 *  et les vars --tw-season-* posées sur le wrapper (état React, cf. décision B). */
export default function ActivitiesClient() {
  const [season, setSeason] = useState<Season>("all");
  const accents = SEASON_ACCENTS[season];

  const seasonVars = {
    "--tw-season-accent": accents.accent,
    "--tw-season-tint": accents.tint,
  } as CSSProperties;

  return (
    <div data-season={season} style={seasonVars}>
      <section className={styles.pageHero}>
        <div className="wrap">
          <div className={styles.pageHeroGrid}>
            <div>
              <span className="eyebrow">Activités &amp; découverte</span>
              <h1 style={{ marginTop: 16 }}>
                L&apos;Ardèche verte<br />
                <em>{accents.em}</em>
              </h1>
            </div>
            <p>
              Une douzaine d&apos;idées à la porte des gîtes — à pied, à vélo, en voiture, ou en ne
              bougeant pas. Le hameau de Samoyas se vit comme une parenthèse rurale, sans pour autant
              vous couper du monde : tout le nécessaire reste à cinq minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Spa carte héros — TOUJOURS visible */}
      <section className={styles.spaHero}>
        <div className="wrap">
          <article className={styles.spaHeroCard}>
            <div className={styles.spaHeroBody}>
              <span className={styles.spaHeroTag}>L&apos;instant bien-être · à demeure</span>
              <h2>L&apos;activité que vous ne quitterez pas — votre spa privatif.</h2>
              <p>
                Chacun des trois gîtes en possède un. Eau chauffée toute l&apos;année, jets
                multiples, jamais à partager. Et pour La Maison Vieille, ajoutez le sauna.
              </p>
              <div className={styles.spaHeroFeatures}>
                <span>{CheckIcon}Spa privatif</span>
                <span>{CheckIcon}Véranda chauffée</span>
                <span>{CheckIcon}Accès illimité</span>
                <span>{CheckIcon}Sauna · Maison Vieille</span>
              </div>
            </div>
            <div className={styles.spaHeroMedia}>
              <ImageSlot placeholder="Spa privatif sous la véranda, fin de journée" />
            </div>
          </article>
        </div>
      </section>

      {/* Season filter */}
      <section className={styles.seasonFilter}>
        <div className="wrap">
          <div className={styles.seasonFilterRow}>
            <span className={styles.seasonFilterLabel}>Saison</span>
            {CHIPS.map((chip) => (
              <button
                key={chip.season}
                className={`${styles.seasonChip}${season === chip.season ? ` ${styles.isActive}` : ""}`}
                onClick={() => setSeason(chip.season)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Activities grid — filtre visuel, le contenu reste dans le DOM */}
      <section className={styles.acts}>
        <div className="wrap">
          <div className={styles.actsGrid}>
            {ACTIVITIES.map((a) => {
              const dimmed = !(season === "all" || a.season === "all" || a.season === season);
              return (
                <article
                  key={a.id}
                  id={a.id}
                  className={`${styles.actCard}${dimmed ? ` ${styles.isDimmed}` : ""}`}
                >
                  <div className={styles.actCardMedia} data-act-img={a.img}>
                    <div className={styles.photo} />
                    <div className={styles.grain} />
                    <span className={styles.actCardSeason}>{a.label}</span>
                  </div>
                  <div className={styles.actCardBody}>
                    <div className={styles.actCardDist}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {a.dist}
                    </div>
                    <div className={styles.actCardTitle}>{a.title}</div>
                    <p className={styles.actCardOne}>{a.one}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Practical info */}
      <section className={styles.practical}>
        <div className="wrap">
          <div style={{ marginBottom: 28 }}>
            <span className="eyebrow">Calme rural, mais pas isolé</span>
            <h2 style={{ marginTop: 10, fontSize: "clamp(28px,3vw,36px)", maxWidth: "22ch" }}>
              Tout le nécessaire à quelques minutes.
            </h2>
            <p style={{ marginTop: 10, color: "var(--color-gray-medium)", maxWidth: "52ch", fontSize: 15, lineHeight: 1.6 }}>
              Le hameau est paisible — mais commerces, restaurants et services de santé sont à portée
              de voiture. Vous profitez du calme sans subir l&apos;isolement.
            </p>
          </div>
          <div className={styles.practicalGrid}>
            <div className={styles.practicalItem}>
              <span>Commerces &amp; boulangerie</span>
              <strong>5 min</strong>
              <p>Pain frais, épicerie et tabac à Boulieu et Savas. Supermarché à Annonay.</p>
            </div>
            <div className={styles.practicalItem}>
              <span>Restaurants</span>
              <strong>5 min</strong>
              <p>Bistrot de Boulieu, table d&apos;hôtes de la vallée du Rhône, étoilé à Annonay.</p>
            </div>
            <div className={styles.practicalItem}>
              <span>Marchés de producteurs</span>
              <strong>10 min</strong>
              <p>Annonay le mercredi et samedi, Saint-Désirat le dimanche — producteurs locaux.</p>
            </div>
            <div className={styles.practicalItem}>
              <span>Médecin &amp; pharmacie</span>
              <strong>10 min</strong>
              <p>Cabinet médical et pharmacie de garde à Annonay. Hôpital à 20 minutes.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
