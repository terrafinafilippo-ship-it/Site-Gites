"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { ACTIVITIES, SEASON_ACCENTS, SEASON_LABELS, type Season } from "@/lib/data/activities";
import type { Bilingue, Langue } from "@/lib/i18n/langues";
import styles from "./page.module.css";

const SAISONS: Season[] = ["all", "spring", "summer", "autumn", "winter"];

const TEXTES: Bilingue<{
  surtitre: string;
  titre: ReactNode;
  intro: string;
  tagSpa: string;
  titreSpa: string;
  texteSpa: string;
  puces: string[];
  photoSpa: string;
  saison: string;
  surtitrePratique: string;
  titrePratique: string;
  introPratique: string;
  pratique: { titre: string; duree: string; texte: string }[];
}> = {
  fr: {
    surtitre: "Activités & découverte",
    titre: <>L&apos;Ardèche verte<br /></>,
    intro:
      "Une douzaine d'idées à la porte des gîtes — à pied, à vélo, en voiture, ou en ne bougeant pas. Le hameau de Samoyas se vit comme une parenthèse rurale, sans pour autant vous couper du monde : tout le nécessaire reste à cinq minutes.",
    tagSpa: "L'instant bien-être · à demeure",
    titreSpa: "L'activité que vous ne quitterez pas — votre spa privatif.",
    texteSpa:
      "Chacun des trois gîtes en possède un. Eau chauffée toute l'année, jets multiples, jamais à partager. Et pour La Maison Vieille, ajoutez le sauna.",
    puces: ["Spa privatif", "Véranda chauffée", "Accès illimité", "Sauna · Maison Vieille"],
    photoSpa: "Spa privatif sous la véranda, fin de journée",
    saison: "Saison",
    surtitrePratique: "Calme rural, mais pas isolé",
    titrePratique: "Tout le nécessaire à quelques minutes.",
    introPratique:
      "Le hameau est paisible — mais commerces, restaurants et services de santé sont à portée de voiture. Vous profitez du calme sans subir l'isolement.",
    pratique: [
      { titre: "Commerces & boulangerie", duree: "5 min", texte: "Pain frais, épicerie et tabac à Boulieu et Savas. Supermarché à Annonay." },
      { titre: "Restaurants", duree: "5 min", texte: "Bistrot de Boulieu, table d'hôtes de la vallée du Rhône, étoilé à Annonay." },
      { titre: "Marchés de producteurs", duree: "10 min", texte: "Annonay le mercredi et samedi, Saint-Désirat le dimanche — producteurs locaux." },
      { titre: "Médecin & pharmacie", duree: "10 min", texte: "Cabinet médical et pharmacie de garde à Annonay. Hôpital à 20 minutes." },
    ],
  },
  en: {
    surtitre: "Activities & discovery",
    titre: <>Green Ardèche<br /></>,
    intro:
      "A dozen ideas right on the gîtes' doorstep — on foot, by bike, by car, or without moving at all. The hamlet of Samoyas is a rural interlude, without cutting you off from the world: all the essentials are five minutes away.",
    tagSpa: "A moment of wellbeing · at home",
    titreSpa: "The activity you won't want to leave — your private spa.",
    texteSpa:
      "Each of the three gîtes has one. Water heated all year round, multiple jets, never shared. And at La Maison Vieille, add the sauna.",
    puces: ["Private spa", "Heated veranda", "Unlimited access", "Sauna · Maison Vieille"],
    photoSpa: "Private spa under the veranda, end of the day",
    saison: "Season",
    surtitrePratique: "Rural calm, but not isolated",
    titrePratique: "All the essentials a few minutes away.",
    introPratique:
      "The hamlet is peaceful — but shops, restaurants and health services are within easy driving distance. You enjoy the calm without the isolation.",
    pratique: [
      { titre: "Shops & bakery", duree: "5 min", texte: "Fresh bread, grocery and tobacconist in Boulieu and Savas. Supermarket in Annonay." },
      { titre: "Restaurants", duree: "5 min", texte: "Boulieu bistro, a table d'hôtes in the Rhône valley, a Michelin-starred restaurant in Annonay." },
      { titre: "Farmers' markets", duree: "10 min", texte: "Annonay on Wednesdays and Saturdays, Saint-Désirat on Sundays — local producers." },
      { titre: "Doctor & pharmacy", duree: "10 min", texte: "Medical practice and on-duty pharmacy in Annonay. Hospital 20 minutes away." },
    ],
  },
};

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Page Activités — le filtre saison re-teinte la page via [data-season]
 *  et les vars --tw-season-* posées sur le wrapper (état React, cf. décision B). */
export default function ActivitiesClient({ langue }: { langue: Langue }) {
  const t = TEXTES[langue];
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
              <span className="eyebrow">{t.surtitre}</span>
              <h1 style={{ marginTop: 16 }}>
                {t.titre}
                <em>{accents.em[langue]}</em>
              </h1>
            </div>
            <p>{t.intro}</p>
          </div>
        </div>
      </section>

      {/* Spa carte héros — TOUJOURS visible */}
      <section className={styles.spaHero}>
        <div className="wrap">
          <article className={styles.spaHeroCard}>
            <div className={styles.spaHeroBody}>
              <span className={styles.spaHeroTag}>{t.tagSpa}</span>
              <h2>{t.titreSpa}</h2>
              <p>{t.texteSpa}</p>
              <div className={styles.spaHeroFeatures}>
                {t.puces.map((p) => (
                  <span key={p}>{CheckIcon}{p}</span>
                ))}
              </div>
            </div>
            <div className={styles.spaHeroMedia}>
              <ImageSlot placeholder={t.photoSpa} />
            </div>
          </article>
        </div>
      </section>

      {/* Season filter */}
      <section className={styles.seasonFilter}>
        <div className="wrap">
          <div className={styles.seasonFilterRow}>
            <span className={styles.seasonFilterLabel}>{t.saison}</span>
            {SAISONS.map((s) => (
              <button
                key={s}
                className={`${styles.seasonChip}${season === s ? ` ${styles.isActive}` : ""}`}
                onClick={() => setSeason(s)}
              >
                {SEASON_LABELS[s][langue]}
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
                    <span className={styles.actCardSeason}>{SEASON_LABELS[a.season][langue]}</span>
                  </div>
                  <div className={styles.actCardBody}>
                    <div className={styles.actCardDist}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {a.dist}
                    </div>
                    <div className={styles.actCardTitle}>{a.title[langue]}</div>
                    <p className={styles.actCardOne}>{a.one[langue]}</p>
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
            <span className="eyebrow">{t.surtitrePratique}</span>
            <h2 style={{ marginTop: 10, fontSize: "clamp(28px,3vw,36px)", maxWidth: "22ch" }}>
              {t.titrePratique}
            </h2>
            <p style={{ marginTop: 10, color: "var(--color-gray-medium)", maxWidth: "52ch", fontSize: 15, lineHeight: 1.6 }}>
              {t.introPratique}
            </p>
          </div>
          <div className={styles.practicalGrid}>
            {t.pratique.map((p) => (
              <div className={styles.practicalItem} key={p.titre}>
                <span>{p.titre}</span>
                <strong>{p.duree}</strong>
                <p>{p.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
