import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ImageSlot from "@/components/ui/ImageSlot";
import Badge from "@/components/ui/Badge";
import {
  BUSY_SETS,
  CALENDAR_ANCHOR,
  GITES,
  GITE_IDS,
  isGiteId,
  type GiteId,
} from "@/lib/data/gites";
import { STORIES } from "@/lib/data/stories";
import { construireGrille, plancherDuGite } from "@/lib/data/pricing";
import { DELAI_SOLDE_DEFAUT, TAUX_ACOMPTE } from "@/lib/constantes";
import { fmtPrix, fmtTaux } from "@/lib/format";
import { chiffresDuGite, lireChiffresPublics } from "@/lib/gites-publics";
import styles from "./page.module.css";

interface Params {
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
  const { slug } = await params;
  if (!isGiteId(slug)) return {};
  return { title: `${GITES[slug].name} — Les Gîtes de Samoyas` };
}

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

/* ===== Calendrier — 3 mois à partir du mois suivant la date ancrée ===== */
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const DAY_NAMES = ["L", "M", "M", "J", "V", "S", "D"];

type DayClass = "" | "past" | "busy" | "changeover";

interface CalMonth {
  title: string;
  firstDow: number;
  days: { day: number; cls: DayClass }[];
}

function buildMonths(id: GiteId): CalMonth[] {
  const today = new Date(CALENDAR_ANCHOR.year, CALENDAR_ANCHOR.month, CALENDAR_ANCHOR.day);
  const busy = BUSY_SETS[id].map(([monthIdx, start, end]) => ({ monthIdx, start, end }));

  return Array.from({ length: 3 }, (_, i) => {
    const m = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    // Décalage du premier jour (lundi = 0)
    const firstDow = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
    const days = Array.from({ length: daysInMonth }, (_, d0) => {
      const day = d0 + 1;
      const dt = new Date(m.getFullYear(), m.getMonth(), day);
      let cls: DayClass = "";
      if (dt < today) cls = "past";
      for (const b of busy) {
        if (b.monthIdx === i) {
          if (day === b.start || day === b.end) cls = "changeover";
          else if (day > b.start && day < b.end) cls = "busy";
        }
      }
      return { day, cls };
    });
    return { title: `${MONTH_NAMES[m.getMonth()]} ${m.getFullYear()}`, firstDow, days };
  });
}

export default async function GitePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isGiteId(slug)) notFound();

  const gite = GITES[slug];
  const story = STORIES[slug];
  const others = GITE_IDS.filter((g) => g !== slug).map((g) => GITES[g]);
  const months = buildMonths(slug);
  const rating = gite.rating.toFixed(1).replace(".", ",");
  const reserveHref = `/reserver?gite=${slug}`;

  // Chiffres de la base. Tout ce qui en dépend disparaît si elle ne répond pas :
  // la fiche continue de vendre (récit, photos, équipements, bouton de
  // réservation), elle ne montre simplement aucun chiffre qu'on ne sait plus
  // garantir. Une erreur 500 dirait au visiteur que l'entreprise ne tourne pas.
  const publics = await lireChiffresPublics();
  const chiffres = chiffresDuGite(publics, slug);
  const capacite = chiffres?.capaciteMax ?? null;
  const grille = chiffres ? construireGrille(slug, chiffres.tarifSemaineBase) : null;
  const plancher = chiffres ? plancherDuGite(slug, chiffres.tarifSemaineBase) : null;

  const dayClass = (cls: DayClass) =>
    `${styles.calDay}${cls ? ` ${styles[cls]}` : ""}`;

  return (
    <div className={styles.pageWithMobileBar}>
      {/* Breadcrumb */}
      <div className={styles.crumb}>
        <div className="wrap">
          <Link href="/">Accueil</Link>
          <span className={styles.crumbSep}>›</span>
          <Link href="/gites">Nos gîtes</Link>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>{gite.name}</span>
        </div>
      </div>

      {/* Gallery */}
      <section className={styles.gallery}>
        <div className="wrap">
          <div className={styles.galleryGrid}>
            <div className={`${styles.galleryCell} ${styles.dominant}`}>
              <ImageSlot placeholder="Photo dominante : véranda spa au crépuscule" />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder="Salon — pierre, lin, lumière oblique" />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder="Cuisine ouverte sur la véranda" />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder="Chambre principale, draps fournis" />
            </div>
            <div className={styles.galleryCell}>
              <ImageSlot placeholder="Extérieur — vue collines" />
              <span className={styles.galleryMore}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Voir les 18 photos
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
                {capacite !== null ? `${gite.profil} — ${capacite} personnes` : gite.profil}
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
                    {capacite} personnes
                  </span>
                )}
                <span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 18v-6h18v6" /><path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
                  </svg>
                  {gite.bedrooms} chambres
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
                  Animaux non admis
                </span>
              </div>
              <p className={styles.identityLead}>{gite.tagline}</p>
            </div>
            <aside className={styles.gdfCard}>
              <div className={styles.gdfCardHead}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
                </svg>
                <div>
                  <div className={styles.gdfCardLabel}>Avis vérifiés</div>
                  <div className={styles.gdfCardBrand}>Gîtes de France</div>
                </div>
              </div>
              <div className={styles.gdfCardScore}>
                {rating}<sup>/5</sup>
              </div>
              <div className={styles.gdfCardStats}>
                <div><strong>{gite.reviews}</strong>avis publiés</div>
                <div><strong>{gite.reco} %</strong>de recommandation</div>
              </div>
              <a href="#" className={styles.gdfCardLink}>
                Lire les avis sur Gîtes de France
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </a>
              <div className={styles.gdfCardNote}>
                Tous nos avis sont collectés et vérifiés par Gîtes de France après le séjour.
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Storytelling */}
      <section>
        <div className="wrap">
          <div className={styles.story}>
            <div>
              <span className="eyebrow">L&apos;esprit du lieu</span>
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
            <h2>Tout ce qu&apos;il faut, rien de superflu.</h2>
            <span className="text-secondary" style={{ fontSize: 14 }}>
              Linge fourni · chauffage compris · Wi-Fi · animaux non admis
            </span>
          </div>
          <div className={styles.equipGrid}>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>Bien-être</div>
              <ul>
                <li>{Check}Spa encastré 4 places</li>
                <li>{Check}Véranda chauffée &amp; climatisée</li>
                {slug === "maison-vieille" && <li>{Check}Sauna privatif</li>}
                {slug === "armu" && <li>{Check}Cheminée d&apos;ambiance</li>}
                <li>{Check}Linge &amp; draps fournis</li>
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>Cuisine</div>
              <ul>
                <li>{Check}Cuisine équipée</li>
                <li>{Check}Lave-vaisselle</li>
                <li>{Check}Four &amp; micro-ondes</li>
                <li>{Check}Machine à café</li>
                {capacite !== null && <li>{Check}Vaisselle pour {capacite}</li>}
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>Confort</div>
              <ul>
                <li>{Check}Wi-Fi fibre</li>
                <li>{Check}Chauffage compris</li>
                <li>{Check}Lave-linge</li>
                <li>{Check}Sèche-cheveux</li>
                <li>{Check}Lit bébé sur demande</li>
              </ul>
            </div>
            <div className={styles.equipCat}>
              <div className={styles.equipCatLabel}>Extérieur</div>
              <ul>
                {slug !== "armu" && <li>{Check}Garage privatif</li>}
                <li>{Check}Terrasse ombragée</li>
                <li>{Check}Salon de jardin</li>
                <li>{Check}Barbecue</li>
                <li>{Check}Vue dégagée collines</li>
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
                Le bien-être à demeure
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
              <ImageSlot placeholder="Spa privatif sous la véranda — lumière chaude, vapeur" />
            </div>
          </div>
        </div>
      </section>

      {/* Calendar */}
      <section className={styles.calendar}>
        <div className="wrap">
          <div className={styles.calendarHead}>
            <div>
              <span className="eyebrow">Disponibilités</span>
              <h2 style={{ marginTop: 10, fontSize: "clamp(28px,3vw,36px)" }}>
                Quand venir nous rejoindre ?
              </h2>
            </div>
            <div className={styles.calendarLegend}>
              <span><i className={styles.legendFree} />Libre</span>
              <span><i className={styles.legendBusy} />Occupé</span>
              <span><i className={styles.legendChangeover} />Changement de séjour</span>
              <span><i className={styles.legendPast} />Passé</span>
            </div>
          </div>
          <div className={styles.calendarMonths}>
            {months.map((month) => (
              <div className={styles.calMonth} key={month.title}>
                <h3>{month.title}</h3>
                <div className={styles.calMonthGrid}>
                  {DAY_NAMES.map((d, i) => (
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

      {/* Pricing + conditions */}
      <section className={styles.pricing}>
        <div className="wrap">
          <div className={styles.pricingGrid}>
            <div>
              <span className="eyebrow">Tarifs par saison</span>
              <h2 style={{ marginTop: 14 }}>
                {plancher !== null ? (
                  <>
                    À partir de {fmtPrix(plancher)}<br />la semaine, tout compris.
                  </>
                ) : (
                  <>
                    La semaine,<br />tout compris.
                  </>
                )}
              </h2>
              {grille && (
                <div className={styles.priceTable}>
                  <div className={`${styles.priceRow} ${styles.hd}`}>
                    <span>Saison</span><span>Semaine</span><span>Période</span>
                  </div>
                  {grille.map((ligne) => (
                    <div className={styles.priceRow} key={ligne.saison}>
                      <strong>{ligne.saison}</strong>
                      <span>{fmtPrix(ligne.semaineCentimes)} / semaine</span>
                      <span className={styles.period}>{ligne.periode}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <aside className={styles.conditions}>
              <h4>Conditions &amp; bon à savoir</h4>
              <ul>
                {chiffres && (
                  <>
                    <li><span>Caution Swikly</span><strong>{fmtPrix(chiffres.caution)}</strong></li>
                    <li><span>Forfait ménage</span><strong>{fmtPrix(chiffres.forfaitMenage)}</strong></li>
                    {chiffres.tauxTaxeSejour !== null && (
                      <li><span>Taxe de séjour</span><strong>{fmtTaux(chiffres.tauxTaxeSejour)} TTC</strong></li>
                    )}
                  </>
                )}
                <li><span>Acompte à la réservation</span><strong>{fmtTaux(TAUX_ACOMPTE)}</strong></li>
                <li><span>Solde</span><strong>J−{DELAI_SOLDE_DEFAUT}</strong></li>
                <li><span>Animaux</span><strong>Non admis</strong></li>
                <li><span>Linge &amp; draps</span><strong>Fournis</strong></li>
                <li><span>Chauffage</span><strong>Compris</strong></li>
              </ul>
              <div className={styles.conditionsNote}>
                La caution Swikly est une empreinte bancaire, non débitée sauf dégât constaté à votre départ.
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Cross-sell */}
      <section className={styles.crosssell}>
        <div className="wrap">
          <span className="eyebrow">Et les deux autres ?</span>
          <h2 style={{ marginTop: 14 }}>Ce séjour ne vous va pas tout à fait ?</h2>
          <div className={styles.crosssellGrid}>
            {others.map((g) => {
              const chiffresAutre = chiffresDuGite(publics, g.id);
              const plancherAutre = chiffresAutre
                ? plancherDuGite(g.id, chiffresAutre.tarifSemaineBase)
                : null;
              return (
              <Link className={styles.crosssellCard} href={`/gites/${g.id}`} key={g.id}>
                <div className={styles.crosssellCardMedia}>
                  <ImageSlot placeholder={`${g.name} — extérieur`} />
                </div>
                <div className={styles.crosssellCardBody}>
                  <div className={styles.crosssellCardName}>{g.name}</div>
                  <div className={styles.crosssellCardMeta}>
                    {chiffresAutre !== null
                      ? `${g.profil} — ${chiffresAutre.capaciteMax} personnes`
                      : g.profil}{" "}
                    · {g.surface} · {g.highlight}
                  </div>
                  {plancherAutre !== null && (
                    <div className={styles.crosssellCardPrice}>
                      Dès {fmtPrix(plancherAutre)} / sem.
                    </div>
                  )}
                  <span className={styles.crosssellCardCta}>
                    Voir le gîte
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
              {plancher !== null && ` · à partir de ${fmtPrix(plancher)}/sem.`}
            </strong>
            <span>
              Spa privatif · linge fourni
              {chiffres?.tauxTaxeSejour != null &&
                ` · taxe de séjour ${fmtTaux(chiffres.tauxTaxeSejour)} visible au paiement`}
            </span>
          </div>
          <Link className="btn btn-primary" href={reserveHref}>
            Réserver ce gîte
            {ArrowRight}
          </Link>
        </div>
      </section>

      {/* Booking bar mobile sticky */}
      <div className={styles.bookingBarMob}>
        {plancher !== null ? (
          <div className={styles.bookingBarMobPrice}>
            <strong>Dès {fmtPrix(plancher)}</strong>
            <small>la semaine TTC</small>
          </div>
        ) : (
          <div className={styles.bookingBarMobPrice}>
            <strong>{gite.name}</strong>
          </div>
        )}
        <Link className="btn btn-primary" href={reserveHref}>Réserver ce gîte</Link>
      </div>
    </div>
  );
}
