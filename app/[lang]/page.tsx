import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import GiteCard from "@/components/ui/GiteCard";
import { GITES, GITE_IDS, type GiteId } from "@/lib/data/gites";
import { fmtNoteCentiemes, fmtPrix, fmtTaux } from "@/lib/format";
import { capaciteTotale, chiffresDuGite, lireChiffresPublics } from "@/lib/gites-publics";
import { langueDe, lien, type Bilingue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import styles from "./page.module.css";

// Rendu à la demande : les prix et les capacités viennent de la base, avec un
// cache de 60 s dans lib/gites-publics.ts. Une page figée au build afficherait
// les valeurs du jour du déploiement (voir docs/02-decisions.md, D-13).
export const dynamic = "force-dynamic";

const ArrowRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);

interface CarteGite {
  chambres: string;
  photo: string;
  description: ReactNode;
}

interface CarteActivite {
  ancre: string;
  saison: "year" | "summer" | "spring" | "winter";
  distance: string;
  titre: string;
}

const TEXTES: Bilingue<{
  photoHero: string;
  coinHero: string;
  surtitreHero: string;
  titreHero: ReactNode;
  sousTitreHero: string;
  reserver: string;
  decouvrirGites: string;
  noteAvis: (note: string, nombre: number) => ReactNode;
  lieu: string;
  fourchette: (mini: string, maxi: string) => string;
  defiler: string;
  surtitreGites: string;
  titreGites: ReactNode;
  introGites: (total: number | null) => string;
  cartes: Record<GiteId, CarteGite>;
  surtitreArrivee: string;
  titreArrivee: ReactNode;
  introArrivee: string;
  spa: string;
  lits: string;
  accueil: string;
  surtitreConfiance: string;
  avisVerifies: string;
  recommandation: string;
  labellises: string;
  surtitreActivites: string;
  titreActivites: ReactNode;
  introActivites: string;
  activites: CarteActivite[];
  toutesActivites: string;
  ambiance: string;
  carte: string;
  surtitreTrouver: string;
  titreTrouver: string;
  langues: string;
  contacter: string;
  itineraire: string;
}> = {
  fr: {
    photoHero: "Photo hero — vue d'ensemble du hameau de Samoyas, lumière dorée, fin d'après-midi",
    coinHero: "Ardèche verte · hameau de Samoyas",
    surtitreHero: "Hameau de Samoyas · Savas",
    titreHero: (
      <>
        Trois écrins de détente,<br />
        <em>au calme de l&apos;Ardèche.</em>
      </>
    ),
    sousTitreHero:
      "Patricia & Nicolas vous accueillent dans trois gîtes labellisés Gîtes de France. Spa privatif, linge fourni — le calme de la campagne, sans s'éloigner du nécessaire.",
    reserver: "Réserver un séjour",
    decouvrirGites: "Découvrir les gîtes",
    noteAvis: (note, nombre) => <><strong>{note}/5</strong> sur {nombre} avis vérifiés Gîtes de France</>,
    lieu: "Savas, 07430 — Ardèche verte",
    fourchette: (mini, maxi) => `De ${mini} à ${maxi} la semaine — selon le gîte`,
    defiler: "↓ Découvrir",
    surtitreGites: "Nos gîtes",
    titreGites: <>Trois caractères,<br />une même promesse.</>,
    introGites: (total) =>
      `Chaque gîte a son atmosphère — pour un couple, une famille, ou les deux ensemble.${
        total !== null ? ` Regroupables jusqu'à ${total} personnes, ils` : " Regroupables, ils"
      } partagent la même attention : la pierre, le linge, le spa, et l'équilibre rare entre vrai calme et tout-à-portée.`,
    cartes: {
      laphine: {
        chambres: "2 chambres",
        photo: "LaPhine — véranda spa, vue Ardèche",
        description: "Spa encastré en véranda chauffée, garage privatif, deux chambres pour la tribu.",
      },
      armu: {
        chambres: "1 chambre mansardée",
        photo: "L'Armu — jacuzzi véranda, cheminée",
        description: "Jacuzzi sous la véranda, cheminée d'ambiance, chambre mansardée — l'intime pour deux.",
      },
      "maison-vieille": {
        chambres: "2 chambres",
        photo: "La Maison Vieille — spa et sauna, pierre ancienne",
        description: <>Le seul gîte avec spa <em>et</em> sauna privatifs. Pierre apparente, volumes nobles.</>,
      },
    },
    surtitreArrivee: "À votre arrivée",
    titreArrivee: <>Ce qui vous attend<br /><em>en passant la porte.</em></>,
    introArrivee:
      "Vous arrivez, vous déposez les sacs, et c'est tout. Les lits sont faits, le spa chauffe. Aucune corvée d'installation — juste l'envie d'ouvrir une bouteille et de souffler.",
    spa: "Le spa déjà chauffé",
    lits: "Les lits faits, le linge de toilette fourni",
    accueil: "L'accueil chaleureux de Patricia & Nicolas",
    surtitreConfiance: "La confiance de nos hôtes",
    avisVerifies: "Avis vérifiés Gîtes de France",
    recommandation: "de recommandation",
    labellises: "Labellisés depuis",
    surtitreActivites: "Activités & découverte",
    titreActivites: <>À cinq minutes,<br />ou à cinq pas.</>,
    introActivites:
      "L'Ardèche verte se découvre au gré de vos envies — parcs animaliers, villages médiévaux, sentiers du Pilat, vignerons et marchés. Les gîtes ne sont qu'un point de départ.",
    activites: [
      { ancre: "peaugres", saison: "year", distance: "10 min · Toute l'année", titre: "Safari de Peaugres" },
      { ancre: "golf", saison: "summer", distance: "5 min · Été", titre: "Golf 18 trous de Gourdan" },
      { ancre: "viafluvia", saison: "spring", distance: "3 km · Printemps", titre: "Via Fluvia à vélo" },
      { ancre: "pilat", saison: "winter", distance: "25 min · Hiver", titre: "Ski au Mont Pilat" },
    ],
    toutesActivites: "Voir toutes les activités",
    ambiance:
      "Au cœur de l'Ardèche verte, dans le calme d'un hameau préservé, trois gîtes de pierre vous attendent à Samoyas.",
    carte: "Carte de Samoyas",
    surtitreTrouver: "Nous trouver",
    titreTrouver: "Le hameau de Samoyas, en Ardèche verte.",
    langues: "Accueil en français · anglais",
    contacter: "Nous contacter",
    itineraire: "Itinéraire",
  },
  en: {
    photoHero: "Hero photo — overview of the hamlet of Samoyas, golden light, late afternoon",
    coinHero: "Green Ardèche · hamlet of Samoyas",
    surtitreHero: "Hamlet of Samoyas · Savas",
    titreHero: (
      <>
        Three relaxing retreats,<br />
        <em>in the calm of the Ardèche.</em>
      </>
    ),
    sousTitreHero:
      "Patricia & Nicolas welcome you to three gîtes with the Gîtes de France label. Private spa, linen provided — the calm of the countryside, without being far from everyday essentials.",
    reserver: "Book a stay",
    decouvrirGites: "Discover the gîtes",
    noteAvis: (note, nombre) => <><strong>{note}/5</strong> from {nombre} verified Gîtes de France reviews</>,
    lieu: "Savas, 07430 — green Ardèche",
    fourchette: (mini, maxi) => `From ${mini} to ${maxi} per week — depending on the gîte`,
    defiler: "↓ Discover",
    surtitreGites: "Our gîtes",
    titreGites: <>Three characters,<br />one same promise.</>,
    introGites: (total) =>
      `Each gîte has its own atmosphere — for a couple, a family, or both together.${
        total !== null ? ` They can be combined for up to ${total} people, and` : " They can be combined, and"
      } share the same care: the stone, the linen, the spa, and the rare balance between true calm and everything within reach.`,
    cartes: {
      laphine: {
        chambres: "2 bedrooms",
        photo: "LaPhine — spa veranda, Ardèche view",
        description: "Built-in spa in a heated veranda, private garage, two bedrooms for the whole tribe.",
      },
      armu: {
        chambres: "1 attic bedroom",
        photo: "L'Armu — veranda jacuzzi, fireplace",
        description: "Jacuzzi under the veranda, decorative fireplace, attic bedroom — intimacy for two.",
      },
      "maison-vieille": {
        chambres: "2 bedrooms",
        photo: "La Maison Vieille — spa and sauna, old stone",
        description: <>The only gîte with a private spa <em>and</em> sauna. Exposed stone, generous spaces.</>,
      },
    },
    surtitreArrivee: "On arrival",
    titreArrivee: <>What awaits you<br /><em>as you walk through the door.</em></>,
    introArrivee:
      "You arrive, you put down your bags, and that's it. The beds are made, the spa is warming up. No setting-up chores — just the urge to open a bottle and unwind.",
    spa: "The spa already heated",
    lits: "Beds made, towels provided",
    accueil: "A warm welcome from Patricia & Nicolas",
    surtitreConfiance: "Our guests' trust",
    avisVerifies: "Verified Gîtes de France reviews",
    recommandation: "recommend us",
    labellises: "Labelled since",
    surtitreActivites: "Activities & discovery",
    titreActivites: <>Five minutes away,<br />or five steps.</>,
    introActivites:
      "Green Ardèche reveals itself as you please — wildlife parks, medieval villages, Pilat trails, winemakers and markets. The gîtes are just a starting point.",
    activites: [
      { ancre: "peaugres", saison: "year", distance: "10 min · All year", titre: "Peaugres Safari" },
      { ancre: "golf", saison: "summer", distance: "5 min · Summer", titre: "Gourdan 18-hole golf course" },
      { ancre: "viafluvia", saison: "spring", distance: "3 km · Spring", titre: "Via Fluvia by bike" },
      { ancre: "pilat", saison: "winter", distance: "25 min · Winter", titre: "Skiing on Mont Pilat" },
    ],
    toutesActivites: "See all activities",
    ambiance:
      "In the heart of green Ardèche, in the calm of an unspoilt hamlet, three stone gîtes await you in Samoyas.",
    carte: "Map of Samoyas",
    surtitreTrouver: "Find us",
    titreTrouver: "The hamlet of Samoyas, in green Ardèche.",
    langues: "Welcome in French · English",
    contacter: "Contact us",
    itineraire: "Directions",
  },
};

interface Params {
  lang: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { lang } = await params;
  return metadonnees(langueDe(lang), "/", null);
}

export default async function HomePage({ params }: { params: Promise<Params> }) {
  const langue = langueDe((await params).lang);
  const t = TEXTES[langue];
  const l = (chemin: string) => lien(langue, chemin);

  const publics = await lireChiffresPublics();
  // Note des avis : réglages (lot 5), masquée si elle n'est pas renseignée.
  const avis = publics.avis;
  const total = capaciteTotale(publics);
  // Fourchette « De X à Y € » : les deux bornes viennent des mêmes planchers que
  // les cartes, donc le hero ne peut pas annoncer un prix qu'aucune carte ne
  // montre. Masquée si un seul gîte manque — une fourchette sur deux gîtes est
  // fausse, pas incomplète.
  const planchers = GITE_IDS.map(
    (slug) => chiffresDuGite(publics, slug)?.plancherSemaine ?? null,
  ).filter((p): p is number => p !== null);
  const fourchette =
    planchers.length === GITE_IDS.length
      ? { mini: Math.min(...planchers), maxi: Math.max(...planchers) }
      : null;

  return (
    <>
      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroMedia}>
          <ImageSlot placeholder={t.photoHero} />
        </div>
        <div className={styles.heroCorner}>
          <span className="dot" />
          <span>{t.coinHero}</span>
        </div>
        <div className={`${styles.heroInner} wrap`}>
          <div className={styles.heroLockup}>
            <div>
              <span className="eyebrow on-dark" style={{ color: "rgba(239,228,200,0.85)" }}>
                {t.surtitreHero}
              </span>
              <h1>{t.titreHero}</h1>
              <p className={styles.heroSub}>{t.sousTitreHero}</p>
              <div className={styles.heroActions}>
                <Link className="btn btn-on-dark" href={l("/reserver")}>{t.reserver}</Link>
                <Link className="btn btn-outline-light" href={l("/gites")}>
                  {t.decouvrirGites}
                  {ArrowRight}
                </Link>
              </div>
            </div>
            <div className={styles.heroMeta}>
              {avis && (
                <div className={styles.heroMetaRow}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
                  </svg>
                  <span>{t.noteAvis(fmtNoteCentiemes(avis.noteCentiemes, langue), avis.nombre)}</span>
                </div>
              )}
              <div className={styles.heroMetaRow}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>{t.lieu}</span>
              </div>
              {fourchette && (
                <div className={styles.heroMetaRow}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="5" width="18" height="16" rx="1" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="3" x2="8" y2="7" />
                    <line x1="16" y1="3" x2="16" y2="7" />
                  </svg>
                  <span>
                    {t.fourchette(fmtPrix(fourchette.mini, langue), fmtPrix(fourchette.maxi, langue))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.heroScroll}>{t.defiler}</div>
      </section>

      {/* LES TROIS GÎTES */}
      <section className="section" id="gites">
        <div className="wrap">
          <div className={styles.gitesIntro}>
            <div>
              <span className="eyebrow">{t.surtitreGites}</span>
              <h2 style={{ marginTop: 14 }}>{t.titreGites}</h2>
            </div>
            <p>{t.introGites(total)}</p>
          </div>

          <div className={styles.gitesGrid}>
            {GITE_IDS.map((slug) => (
              <GiteCard
                key={slug}
                langue={langue}
                gite={GITES[slug]}
                chiffres={chiffresDuGite(publics, slug)}
                bedroomsLabel={t.cartes[slug].chambres}
                placeholder={t.cartes[slug].photo}
                description={t.cartes[slug].description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CE QUI VOUS ATTEND À L'ARRIVÉE */}
      <section className={styles.arrival}>
        <div className="wrap">
          <div className={styles.arrivalHead}>
            <div>
              <span className="eyebrow">{t.surtitreArrivee}</span>
              <h2 style={{ marginTop: 14 }}>{t.titreArrivee}</h2>
            </div>
            <p>{t.introArrivee}</p>
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
              <h3 className={styles.arrivalLabel}>{t.spa}</h3>
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
              <h3 className={styles.arrivalLabel}>{t.lits}</h3>
            </div>

            <div className={styles.arrivalItem}>
              <span className={styles.arrivalIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </span>
              <h3 className={styles.arrivalLabel}>{t.accueil}</h3>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF DARK */}
      <section className={styles.socialProof}>
        <div className={`wrap ${styles.socialProofInner}`}>
          <span className="eyebrow">{t.surtitreConfiance}</span>
          {avis && (
            <div className={styles.socialProofBig}>
              {fmtNoteCentiemes(avis.noteCentiemes, langue)}<sup>/5</sup>
            </div>
          )}
          <div className={styles.socialProofStats}>
            {avis && (
              <div className={styles.socialProofStat}>
                <strong>{avis.nombre}</strong>
                <span>{t.avisVerifies}</span>
              </div>
            )}
            {avis && avis.recommandationPct !== null && (
              <div className={styles.socialProofStat}>
                <strong>{fmtTaux(avis.recommandationPct, langue)}</strong>
                <span>{t.recommandation}</span>
              </div>
            )}
            <div className={styles.socialProofStat}>
              <strong>2018</strong>
              <span>{t.labellises}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ACTIVITÉS APERÇU */}
      <section className="section">
        <div className="wrap">
          <div className={styles.gitesIntro}>
            <div>
              <span className="eyebrow">{t.surtitreActivites}</span>
              <h2 style={{ marginTop: 14 }}>{t.titreActivites}</h2>
            </div>
            <p>{t.introActivites}</p>
          </div>
          <div className={styles.actsPreview}>
            {t.activites.map((a) => (
              <Link href={l(`/activites#${a.ancre}`)} className={styles.actCard} key={a.ancre}>
                <div className={`${styles.actCardMedia} ${styles[a.saison]}`} />
                <div className={styles.actCardBody}>
                  <div className={styles.actCardDist}>{a.distance}</div>
                  <div className={styles.actCardTitle}>{a.titre}</div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link className="btn btn-secondary" href={l("/activites")}>
              {t.toutesActivites}
              {ArrowRight}
            </Link>
          </div>
        </div>
      </section>

      {/* AMBIANCE BAND */}
      <section className={styles.ambiance}>
        <div className="wrap-narrow">
          <p className={styles.ambianceQuote}>{t.ambiance}</p>
        </div>
      </section>

      {/* CONTACT / LOCALISATION */}
      <section className="section">
        <div className="wrap">
          <div className={styles.contactLoc}>
            <div className={styles.contactLocMap} aria-label={t.carte}>
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
              <span className="eyebrow">{t.surtitreTrouver}</span>
              <h2 style={{ marginTop: 14 }}>{t.titreTrouver}</h2>
              <p className={styles.contactLocAddress}>
                Hameau de Samoyas<br />07430 Savas, Ardèche
              </p>
              <div className={styles.contactLocCoords}>
                <span><strong>Patricia Terrafina</strong> · +33 6 79 33 23 51</span>
                <span><strong>Nicolas Terrafina</strong> · +33 6 66 89 96 24</span>
                <span>{t.langues}</span>
              </div>
              <div className={styles.contactLocActions}>
                <Link href={l("/contact")} className="btn btn-primary">{t.contacter}</Link>
                <a href="#" className="btn btn-ghost">{t.itineraire}</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
