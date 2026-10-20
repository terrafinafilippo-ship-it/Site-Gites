import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import Badge from "@/components/ui/Badge";
import { GITES, GITE_IDS, isGiteId } from "@/lib/data/gites";
import { STORIES } from "@/lib/data/stories";
import { DELAI_SOLDE_DEFAUT, TAUX_ACOMPTE } from "@/lib/constantes";
import { jourSemaineIso } from "@/lib/dates-civiles";
import { fmtMois, fmtNote, fmtPlage, fmtPrix, fmtTaux, fmtTaxeSejour, INITIALES_JOURS } from "@/lib/format";
import {
  chiffresDuGite,
  lireChiffresPublics,
  type EtatCalendrier,
  type JourCalendrier,
} from "@/lib/gites-publics";
import { langueDe, lien, type Bilingue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import styles from "./page.module.css";

interface Params {
  lang: string;
  slug: string;
}

// RENDU À LA DEMANDE, et non figé au build.
//
// La fiche affiche des prix et une capacité qui vivent en base. Avec
// generateStaticParams + ISR, deux défauts se cumulaient : `next build` devait
// joindre la base (un déploiement échouait dès que la base était momentanément
// injoignable), et la page servie restait celle du jour du déploiement. Le
// cache de 60 s de lib/gites-publics.ts remplace l'ISR sans rien figer au build.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isGiteId(slug)) return {};
  return metadonnees(langueDe(lang), `/gites/${slug}`, GITES[slug].name);
}

const TEXTES: Bilingue<{
  accueil: string;
  nosGites: string;
  photos: { dominante: string; salon: string; cuisine: string; chambre: string; exterieur: string };
  voirPhotos: string;
  personnes: (n: number) => string;
  chambres: (n: number) => string;
  animauxNonAdmis: string;
  avisVerifies: string;
  avisPublies: string;
  deRecommandation: string;
  lireAvis: string;
  noteAvis: string;
  espritDuLieu: string;
  titreEquipements: string;
  resumeEquipements: string;
  bienEtre: string;
  spa4: string;
  veranda: string;
  sauna: string;
  cheminee: string;
  linge: string;
  cuisine: string;
  cuisineEquipee: string;
  laveVaisselle: string;
  four: string;
  cafe: string;
  vaisselle: (n: number) => string;
  confort: string;
  wifi: string;
  chauffage: string;
  laveLinge: string;
  secheCheveux: string;
  litBebe: string;
  exterieur: string;
  garage: string;
  terrasse: string;
  salonJardin: string;
  barbecue: string;
  vue: string;
  bienEtreDemeure: string;
  photoSpa: string;
  disponibilites: string;
  quandVenir: string;
  libre: string;
  occupe: string;
  changement: string;
  ferme: string;
  passe: string;
  tarifsSaison: string;
  aPartirDeSemaine: (prix: string) => ReactNode;
  tarifsSemaine: string;
  saison: string;
  laNuit: string;
  laSemaine: string;
  dates: string;
  conditions: string;
  caution: string;
  menage: string;
  taxe: string;
  acompte: string;
  solde: string;
  soldeDelai: (jours: number) => string;
  animaux: string;
  nonAdmis: string;
  lingeDraps: string;
  fournis: string;
  chauffageLib: string;
  compris: string;
  noteCaution: string;
  deuxAutres: string;
  titreAutres: string;
  exterieurPhoto: (nom: string) => string;
  desSemaine: (prix: string) => string;
  voir: string;
  aPartirDe: (prix: string) => string;
  spaLinge: string;
  reserver: string;
  des: (prix: string) => string;
  laSemaineTtc: string;
}> = {
  fr: {
    accueil: "Accueil",
    nosGites: "Nos gîtes",
    photos: {
      dominante: "Photo dominante : véranda spa au crépuscule",
      salon: "Salon — pierre, lin, lumière oblique",
      cuisine: "Cuisine ouverte sur la véranda",
      chambre: "Chambre principale, draps fournis",
      exterieur: "Extérieur — vue collines",
    },
    voirPhotos: "Voir les 18 photos",
    personnes: (n) => `${n} personnes`,
    chambres: (n) => `${n} chambres`,
    animauxNonAdmis: "Animaux non admis",
    avisVerifies: "Avis vérifiés",
    avisPublies: "avis publiés",
    deRecommandation: "de recommandation",
    lireAvis: "Lire les avis sur Gîtes de France",
    noteAvis: "Tous nos avis sont collectés et vérifiés par Gîtes de France après le séjour.",
    espritDuLieu: "L'esprit du lieu",
    titreEquipements: "Tout ce qu'il faut, rien de superflu.",
    resumeEquipements: "Linge fourni · chauffage compris · Wi-Fi · animaux non admis",
    bienEtre: "Bien-être",
    spa4: "Spa encastré 4 places",
    veranda: "Véranda chauffée & climatisée",
    sauna: "Sauna privatif",
    cheminee: "Cheminée d'ambiance",
    linge: "Linge & draps fournis",
    cuisine: "Cuisine",
    cuisineEquipee: "Cuisine équipée",
    laveVaisselle: "Lave-vaisselle",
    four: "Four & micro-ondes",
    cafe: "Machine à café",
    vaisselle: (n) => `Vaisselle pour ${n}`,
    confort: "Confort",
    wifi: "Wi-Fi fibre",
    chauffage: "Chauffage compris",
    laveLinge: "Lave-linge",
    secheCheveux: "Sèche-cheveux",
    litBebe: "Lit bébé sur demande",
    exterieur: "Extérieur",
    garage: "Garage privatif",
    terrasse: "Terrasse ombragée",
    salonJardin: "Salon de jardin",
    barbecue: "Barbecue",
    vue: "Vue dégagée collines",
    bienEtreDemeure: "Le bien-être à demeure",
    photoSpa: "Spa privatif sous la véranda — lumière chaude, vapeur",
    disponibilites: "Disponibilités",
    quandVenir: "Quand venir nous rejoindre ?",
    libre: "Libre",
    occupe: "Occupé",
    changement: "Changement de séjour",
    ferme: "Non réservable en ligne",
    passe: "Passé",
    tarifsSaison: "Tarifs par saison",
    aPartirDeSemaine: (prix) => <>À partir de {prix}<br />la semaine, tout compris.</>,
    tarifsSemaine: "Tarifs à la semaine",
    saison: "Saison",
    laNuit: "La nuit",
    laSemaine: "La semaine",
    dates: "Dates",
    conditions: "Conditions & bon à savoir",
    caution: "Caution",
    menage: "Forfait ménage",
    taxe: "Taxe de séjour",
    acompte: "Acompte à la réservation",
    solde: "Solde",
    soldeDelai: (jours) => `J−${jours}`,
    animaux: "Animaux",
    nonAdmis: "Non admis",
    lingeDraps: "Linge & draps",
    fournis: "Fournis",
    chauffageLib: "Chauffage",
    compris: "Compris",
    noteCaution:
      "La caution est une préautorisation sur votre carte bancaire, faite la veille de votre départ. Aucune somme n'est débitée, sauf dégât constaté à l'état des lieux de sortie.",
    deuxAutres: "Et les deux autres ?",
    titreAutres: "Ce séjour ne vous va pas tout à fait ?",
    exterieurPhoto: (nom) => `${nom} — extérieur`,
    desSemaine: (prix) => `Dès ${prix} / sem.`,
    voir: "Voir le gîte",
    aPartirDe: (prix) => ` · à partir de ${prix}/sem.`,
    spaLinge: "Spa privatif · linge fourni",
    reserver: "Réserver ce gîte",
    des: (prix) => `Dès ${prix}`,
    laSemaineTtc: "la semaine TTC",
  },
  en: {
    accueil: "Home",
    nosGites: "Our gîtes",
    photos: {
      dominante: "Main photo: spa veranda at dusk",
      salon: "Living room — stone, linen, slanting light",
      cuisine: "Kitchen opening onto the veranda",
      chambre: "Main bedroom, sheets provided",
      exterieur: "Exterior — view of the hills",
    },
    voirPhotos: "See all 18 photos",
    personnes: (n) => `${n} people`,
    chambres: (n) => `${n} bedrooms`,
    animauxNonAdmis: "No pets",
    avisVerifies: "Verified reviews",
    avisPublies: "published reviews",
    deRecommandation: "recommend us",
    lireAvis: "Read the reviews on Gîtes de France",
    noteAvis: "All our reviews are collected and verified by Gîtes de France after the stay.",
    espritDuLieu: "The spirit of the place",
    titreEquipements: "Everything you need, nothing superfluous.",
    resumeEquipements: "Linen provided · heating included · Wi-Fi · no pets",
    bienEtre: "Wellbeing",
    spa4: "Built-in spa for 4",
    veranda: "Heated & air-conditioned veranda",
    sauna: "Private sauna",
    cheminee: "Decorative fireplace",
    linge: "Linen & sheets provided",
    cuisine: "Kitchen",
    cuisineEquipee: "Equipped kitchen",
    laveVaisselle: "Dishwasher",
    four: "Oven & microwave",
    cafe: "Coffee machine",
    vaisselle: (n) => `Tableware for ${n}`,
    confort: "Comfort",
    wifi: "Fibre Wi-Fi",
    chauffage: "Heating included",
    laveLinge: "Washing machine",
    secheCheveux: "Hairdryer",
    litBebe: "Baby cot on request",
    exterieur: "Outdoors",
    garage: "Private garage",
    terrasse: "Shaded terrace",
    salonJardin: "Garden furniture",
    barbecue: "Barbecue",
    vue: "Open view of the hills",
    bienEtreDemeure: "Wellbeing at home",
    photoSpa: "Private spa under the veranda — warm light, steam",
    disponibilites: "Availability",
    quandVenir: "When will you join us?",
    libre: "Available",
    occupe: "Booked",
    changement: "Changeover day",
    ferme: "Not bookable online",
    passe: "Past",
    tarifsSaison: "Seasonal rates",
    aPartirDeSemaine: (prix) => <>From {prix}<br />per week, all included.</>,
    tarifsSemaine: "Weekly rates",
    saison: "Season",
    laNuit: "Per night",
    laSemaine: "Per week",
    dates: "Dates",
    conditions: "Conditions & good to know",
    caution: "Security deposit",
    menage: "Cleaning fee",
    taxe: "Tourist tax",
    acompte: "Down payment on booking",
    solde: "Balance",
    soldeDelai: (jours) => `${jours} days before arrival`,
    animaux: "Pets",
    nonAdmis: "Not allowed",
    lingeDraps: "Linen & sheets",
    fournis: "Provided",
    chauffageLib: "Heating",
    compris: "Included",
    noteCaution:
      "The security deposit is a pre-authorisation on your bank card, made the day before you leave. No money is taken, unless damage is found at the check-out inspection.",
    deuxAutres: "And the other two?",
    titreAutres: "Not quite the right stay for you?",
    exterieurPhoto: (nom) => `${nom} — exterior`,
    desSemaine: (prix) => `From ${prix} / week`,
    voir: "View the gîte",
    aPartirDe: (prix) => ` · from ${prix}/week`,
    spaLinge: "Private spa · linen provided",
    reserver: "Book this gîte",
    des: (prix) => `From ${prix}`,
    laSemaineTtc: "per week, incl. tax",
  },
};

const Check = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);

/* ===== Calendrier — mois lus en base (lib/gites-publics.ts) ===== */
const CLASSE_ETAT: Record<EtatCalendrier, "" | "past" | "busy" | "changeover" | "closed"> = {
  passe: "past",
  libre: "",
  occupe: "busy",
  changement: "changeover",
  ferme: "closed",
};

interface CalMonth {
  /** Premier jour du mois (aaaa-mm-jj), titre et clé. */
  debut: string;
  /** Décalage du premier jour (lundi = 0). */
  firstDow: number;
  days: { day: number; cls: (typeof CLASSE_ETAT)[EtatCalendrier] }[];
}

/** Regroupe les jours par mois. Dates civiles « aaaa-mm-jj » : aucun fuseau en jeu. */
function buildMonths(jours: readonly JourCalendrier[]): CalMonth[] {
  const mois: CalMonth[] = [];
  for (const { date, etat } of jours) {
    const jour = Number(date.slice(8, 10));
    if (jour === 1 || mois.length === 0) {
      mois.push({ debut: date, firstDow: jourSemaineIso(date) - 1, days: [] });
    }
    mois[mois.length - 1].days.push({ day: jour, cls: CLASSE_ETAT[etat] });
  }
  return mois;
}

export default async function GitePage({ params }: { params: Promise<Params> }) {
  const { lang, slug } = await params;
  if (!isGiteId(slug)) notFound();
  const langue = langueDe(lang);
  const t = TEXTES[langue];
  const l = (chemin: string) => lien(langue, chemin);

  const gite = GITES[slug];
  const story = STORIES[slug][langue];
  const others = GITE_IDS.filter((g) => g !== slug).map((g) => GITES[g]);
  const rating = fmtNote(gite.rating, langue);
  const reserveHref = l(`/reserver?gite=${slug}`);

  // Chiffres de la base. Tout ce qui en dépend disparaît si elle ne répond pas :
  // la fiche continue de vendre (récit, photos, équipements, bouton de
  // réservation), elle ne montre simplement aucun chiffre qu'on ne sait plus
  // garantir. Une erreur 500 dirait au visiteur que l'entreprise ne tourne pas.
  const publics = await lireChiffresPublics();
  const chiffres = chiffresDuGite(publics, slug);
  const capacite = chiffres?.capaciteMax ?? null;
  // Grille et plancher viennent des tables de tarification (D-17) : le prix de
  // la semaine y est calculé par le même code que le tunnel de réservation.
  const grille = chiffres?.grille ?? null;
  const plancher = chiffres?.plancherSemaine ?? null;
  // Calendrier réel (table disponibilites) ; masqué s'il est illisible.
  const months = chiffres?.calendrier ? buildMonths(chiffres.calendrier) : null;

  const dayClass = (cls: CalMonth["days"][number]["cls"]) =>
    `${styles.calDay}${cls ? ` ${styles[cls]}` : ""}`;

  return (
    <div className={styles.pageWithMobileBar}>
      {/* Breadcrumb */}
      <div className={styles.crumb}>
        <div className="wrap">
          <Link href={l("/")}>{t.accueil}</Link>
          <span className={styles.crumbSep}>›</span>
          <Link href={l("/gites")}>{t.nosGites}</Link>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>{gite.name}</span>
        </div>
      </div>

      {/* Gallery */}
      <section className={styles.gallery}>
        <div className="wrap">
          <div className={styles.galleryGrid}>
            <div className={`${styles.galleryCell} ${styles.dominant}`}>
              <ImageSlot placeholder={t.photos.dominante} />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder={t.photos.salon} />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder={t.photos.cuisine} />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder={t.photos.chambre} />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder={t.photos.exterieur} />
              <span className={styles.galleryMore}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                {t.voirPhotos}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Identity / GdF */}
      <section>
        <div className="wrap">
          <div className={styles.identity}>
            <div>
              <Badge variant="target">
                {capacite !== null ? `${gite.profil[langue]} — ${t.personnes(capacite)}` : gite.profil[langue]}
              </Badge>
              <Badge style={{ marginLeft: 6 }}>{gite.code}</Badge>
              <h1 style={{ marginTop: 18 }}>{gite.name}</h1>
              <div className={styles.identityCaps}>
                {capacite !== null && (
                  <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" />
                      <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
                      <path d="M21 21v-1a3 3 0 0 0-3-3" />
                    </svg>
                    {t.personnes(capacite)}
                  </span>
                )}
                <span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 18v-6h18v6" /><path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
                  </svg>
                  {t.chambres(gite.bedrooms)}
                </span>
                <span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M9 3v18" />
                  </svg>
                  {gite.surface}
                </span>
                <span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 12s-3-7-9-7-9 7-9 7 3 7 9 7 9-7 9-7Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  {t.animauxNonAdmis}
                </span>
              </div>
              <p className={styles.identityLead}>{gite.tagline[langue]}</p>
            </div>
            <aside className={styles.gdfCard}>
              <div className={styles.gdfCardHead}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
                </svg>
                <div>
                  <div className={styles.gdfCardLabel}>{t.avisVerifies}</div>
                  <div className={styles.gdfCardBrand}>Gîtes de France</div>
                </div>
              </div>
              <div className={styles.gdfCardScore}>
                {rating}<sup>/5</sup>
              </div>
              <div className={styles.gdfCardStats}>
                <div><strong>{gite.reviews}</strong>{t.avisPublies}</div>
                <div><strong>{langue === "en" ? `${gite.reco}%` : `${gite.reco} %`}</strong>{t.deRecommandation}</div>
              </div>
              <a href="#" className={styles.gdfCardLink}>
                {t.lireAvis}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
              <div className={styles.gdfCardNote}>{t.noteAvis}</div>
            </aside>
          </div>
        </div>
      </section>

      {/* Storytelling */}
      <section>
        <div className="wrap">
          <div className={styles.story}>
            <div>
              <span className="eyebrow">{t.espritDuLieu}</span>
              <h2 style={{ marginTop: 14, fontFamily: "var(--tw-font-serif)" }}>{story.h2}</h2>
            </div>
            <div>
              <p className={styles.lead}>{story.intro}</p>
              <p>{story.body}</p>
              <p>{story.foot}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Equipments */}
      <section className={styles.equip}>
        <div className="wrap">
          <div className={styles.equipHead}>
            <h2>{t.titreEquipements}</h2>
            <span className="text-secondary" style={{ fontSize: 14 }}>{t.resumeEquipements}</span>
          </div>
          <div className={styles.equipGrid}>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>{t.bienEtre}</div>
              <ul>
                <li>{Check}{t.spa4}</li>
                <li>{Check}{t.veranda}</li>
                {slug === "maison-vieille" && <li>{Check}{t.sauna}</li>}
                {slug === "armu" && <li>{Check}{t.cheminee}</li>}
                <li>{Check}{t.linge}</li>
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>{t.cuisine}</div>
              <ul>
                <li>{Check}{t.cuisineEquipee}</li>
                <li>{Check}{t.laveVaisselle}</li>
                <li>{Check}{t.four}</li>
                <li>{Check}{t.cafe}</li>
                {capacite !== null && <li>{Check}{t.vaisselle(capacite)}</li>}
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>{t.confort}</div>
              <ul>
                <li>{Check}{t.wifi}</li>
                <li>{Check}{t.chauffage}</li>
                <li>{Check}{t.laveLinge}</li>
                <li>{Check}{t.secheCheveux}</li>
                <li>{Check}{t.litBebe}</li>
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>{t.exterieur}</div>
              <ul>
                {slug !== "armu" && <li>{Check}{t.garage}</li>}
                <li>{Check}{t.terrasse}</li>
                <li>{Check}{t.salonJardin}</li>
                <li>{Check}{t.barbecue}</li>
                <li>{Check}{t.vue}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Spa block dark */}
      <section className={styles.spaBlock}>
        <div className="wrap">
          <div className={styles.spaBlockGrid}>
            <div>
              <span className="eyebrow on-dark" style={{ color: "var(--color-gold-taupe)" }}>
                {t.bienEtreDemeure}
              </span>
              <h2>{story.spaTitle}</h2>
              <p>{story.spaBody}</p>
              <div className={styles.spaBlockChips}>
                {story.spaChips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </div>
            <div className={styles.spaBlockMedia}>
              <ImageSlot placeholder={t.photoSpa} />
            </div>
          </div>
        </div>
      </section>

      {/* Calendar — réel, masqué entièrement s'il est illisible (D-13). */}
      {months && (
      <section className={styles.calendar}>
        <div className="wrap">
          <div className={styles.calendarHead}>
            <div>
              <span className="eyebrow">{t.disponibilites}</span>
              <h2 style={{ marginTop: 10, fontSize: "clamp(28px,3vw,36px)" }}>{t.quandVenir}</h2>
            </div>
            <div className={styles.calendarLegend}>
              <span><i className={styles.legendFree} />{t.libre}</span>
              <span><i className={styles.legendBusy} />{t.occupe}</span>
              <span><i className={styles.legendChangeover} />{t.changement}</span>
              <span><i className={styles.legendClosed} />{t.ferme}</span>
              <span><i className={styles.legendPast} />{t.passe}</span>
            </div>
          </div>
          <div className={styles.calendarMonths}>
            {months.map((month) => (
              <div className={styles.calMonth} key={month.debut}>
                <h3>{fmtMois(month.debut, langue)}</h3>
                <div className={styles.calMonthGrid}>
                  {INITIALES_JOURS[langue].map((d, i) => (
                    <div className={styles.calDayname} key={`${d}-${i}`}>{d}</div>
                  ))}
                  {Array.from({ length: month.firstDow }, (_, i) => (
                    <div className={`${styles.calDay} ${styles.empty}`} key={`empty-${i}`} />
                  ))}
                  {month.days.map(({ day, cls }) => (
                    <div className={dayClass(cls)} key={day}>{day}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Pricing + conditions */}
      <section className={styles.pricing}>
        <div className="wrap">
          <div className={styles.pricingGrid}>
            <div>
              <span className="eyebrow">{t.tarifsSaison}</span>
              <h2 style={{ marginTop: 14 }}>
                {/* Le titre de repli est DESCRIPTIF, jamais promissoire : une
                    session n'invente pas de formulation commerciale (voir
                    docs/05-protocole-phase.md, règle 3). « Tout compris » de la
                    variante ci-dessus est une allégation héritée du site
                    d'origine, à faire valider par les propriétaires — le séjour
                    comporte un forfait ménage, une taxe de séjour et une
                    caution (voir docs/03-conformite.md § 5). La traduction
                    anglaise (« all included ») porte la même réserve. */}
                {plancher !== null ? t.aPartirDeSemaine(fmtPrix(plancher, langue)) : <>{t.tarifsSemaine}</>}
              </h2>
              {grille && (
                <div className={styles.priceTable}>
                  <div className={`${styles.priceRow} ${styles.hd}`}>
                    <span>{t.saison}</span><span>{t.laNuit}</span><span>{t.laSemaine}</span><span>{t.dates}</span>
                  </div>
                  {grille.map((ligne) => (
                    <div className={styles.priceRow} key={ligne.tarifId}>
                      {/* Nom du tarif tel que saisi par les propriétaires (en français). */}
                      <strong>{ligne.tarifNom}</strong>
                      <span>{fmtPrix(ligne.prixNuit, langue)}</span>
                      <span>{fmtPrix(ligne.prixSemaine, langue)}</span>
                      <span className={styles.period}>
                        {ligne.plages.map((plage) => (
                          <span className={styles.plage} key={plage.debut}>
                            {fmtPlage(plage.debut, plage.fin, langue)}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <aside className={styles.conditions}>
              <h4>{t.conditions}</h4>
              <ul>
                {chiffres && (
                  <>
                    <li><span>{t.caution}</span><strong>{fmtPrix(chiffres.caution, langue)}</strong></li>
                    <li><span>{t.menage}</span><strong>{fmtPrix(chiffres.forfaitMenage, langue)}</strong></li>
                    {chiffres.taxe !== null && (
                      <li><span>{t.taxe}</span><strong>{fmtTaxeSejour(chiffres.taxe, langue)}</strong></li>
                    )}
                  </>
                )}
                <li><span>{t.acompte}</span><strong>{fmtTaux(TAUX_ACOMPTE, langue)}</strong></li>
                <li><span>{t.solde}</span><strong>{t.soldeDelai(DELAI_SOLDE_DEFAUT)}</strong></li>
                <li><span>{t.animaux}</span><strong>{t.nonAdmis}</strong></li>
                <li><span>{t.lingeDraps}</span><strong>{t.fournis}</strong></li>
                <li><span>{t.chauffageLib}</span><strong>{t.compris}</strong></li>
              </ul>
              <div className={styles.conditionsNote}>{t.noteCaution}</div>
            </aside>
          </div>
        </div>
      </section>

      {/* Cross-sell */}
      <section className={styles.crosssell}>
        <div className="wrap">
          <span className="eyebrow">{t.deuxAutres}</span>
          <h2 style={{ marginTop: 14 }}>{t.titreAutres}</h2>
          <div className={styles.crosssellGrid}>
            {others.map((g) => {
              const chiffresAutre = chiffresDuGite(publics, g.id);
              const plancherAutre = chiffresAutre?.plancherSemaine ?? null;
              return (
              <Link className={styles.crosssellCard} href={l(`/gites/${g.id}`)} key={g.id}>
                <div className={styles.crosssellCardMedia}>
                  <ImageSlot placeholder={t.exterieurPhoto(g.name)} />
                </div>
                <div className={styles.crosssellCardBody}>
                  <div className={styles.crosssellCardName}>{g.name}</div>
                  <div className={styles.crosssellCardMeta}>
                    {chiffresAutre !== null
                      ? `${g.profil[langue]} — ${t.personnes(chiffresAutre.capaciteMax)}`
                      : g.profil[langue]}{" "}
                    · {g.surface} · {g.highlight[langue]}
                  </div>
                  {plancherAutre !== null && (
                    <div className={styles.crosssellCardPrice}>
                      {t.desSemaine(fmtPrix(plancherAutre, langue))}
                    </div>
                  )}
                  <span className={styles.crosssellCardCta}>
                    {t.voir}
                    {ArrowRight}
                  </span>
                </div>
              </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Booking bar desktop */}
      <section className={styles.bookingBarDesk}>
        <div className="wrap">
          <div className={styles.bookingBarDeskTxt}>
            <strong>
              {gite.name}
              {plancher !== null && t.aPartirDe(fmtPrix(plancher, langue))}
            </strong>
            {/* La mention du taux de taxe de séjour a disparu de ce bandeau : la
                taxe n'est plus un taux unique (5 %, plafond, + 10 %, par
                personne) et sa règle complète est dans les conditions. */}
            <span>{t.spaLinge}</span>
          </div>
          <Link className="btn btn-primary" href={reserveHref}>
            {t.reserver}
            {ArrowRight}
          </Link>
        </div>
      </section>

      {/* Booking bar mobile sticky */}
      <div className={styles.bookingBarMob}>
        {plancher !== null ? (
          <div className={styles.bookingBarMobPrice}>
            <strong>{t.des(fmtPrix(plancher, langue))}</strong>
            <small>{t.laSemaineTtc}</small>
          </div>
        ) : (
          <div className={styles.bookingBarMobPrice}>
            <strong>{gite.name}</strong>
          </div>
        )}
        <Link className="btn btn-primary" href={reserveHref}>{t.reserver}</Link>
      </div>
    </div>
  );
}
