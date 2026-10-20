import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { GITES, GITE_IDS, type GiteData, type GiteId } from "@/lib/data/gites";
import { fmtNote, fmtPrix } from "@/lib/format";
import {
  capaciteTotale,
  chiffresDuGite,
  lireChiffresPublics,
  type ChiffresGite,
} from "@/lib/gites-publics";
import { langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import styles from "./page.module.css";

// Rendu à la demande : capacités et prix viennent de la base (cache de 60 s).
export const dynamic = "force-dynamic";

interface Params {
  lang: string;
}

interface RowContent {
  placeholder: string;
  /** Caractéristiques rédactionnelles. La CAPACITÉ n'en fait plus partie : elle
   *  est lue en base et insérée en tête à l'affichage. */
  caps: string[];
  lead: string;
}

const ORDRE: { slug: GiteId; reverse?: boolean }[] = [
  { slug: "laphine" },
  { slug: "armu", reverse: true },
  { slug: "maison-vieille" },
];

const TEXTES: Bilingue<{
  titrePage: string;
  rangees: Record<GiteId, RowContent>;
  personnes: (n: number) => string;
  avis: (n: number) => string;
  reco: (n: number) => string;
  des: (prix: string) => string;
  laSemaine: string;
  voir: string;
  reserver: string;
  surtitre: string;
  titre: ReactNode;
  intro: (total: number | null) => string;
  surtitreGroupe: string;
  titreGroupe: (total: number | null) => ReactNode;
  introGroupe: string;
  ecrireGroupe: string;
}> = {
  fr: {
    titrePage: "Nos gîtes",
    rangees: {
      laphine: {
        placeholder: "LaPhine — extérieur, fin de journée",
        caps: ["2 chambres", "70 m²", "Spa encastré · garage"],
        lead: "L'écrin familial — un spa encastré sous la véranda chauffée, deux chambres calmes, et le garage qui vous épargne les averses.",
      },
      armu: {
        placeholder: "L'Armu — jacuzzi véranda, cheminée",
        caps: ["1 chambre mansardée", "45 m²", "Jacuzzi · cheminée"],
        lead: "Un refuge pour deux — chambre mansardée à hauteur de toits, jacuzzi sous la véranda, cheminée d'ambiance pour les soirs frais.",
      },
      "maison-vieille": {
        placeholder: "La Maison Vieille — pierre ancienne, sauna",
        caps: ["2 chambres", "85 m²", "Spa + sauna privatifs"],
        lead: "La plus ancienne du hameau — pierre apparente, volumes nobles, et la seule à conjuguer spa et sauna privatifs.",
      },
    },
    personnes: (n) => `${n} personnes`,
    avis: (n) => `${n} avis`,
    reco: (n) => `${n} % reco`,
    des: (prix) => `Dès ${prix}`,
    laSemaine: "la semaine TTC",
    voir: "Voir le gîte",
    reserver: "Réserver un séjour",
    surtitre: "Nos trois écrins",
    titre: <>Trois gîtes,<br />un même hameau.</>,
    intro: (total) =>
      `Choisissez le gîte qui vous ressemble — l'intime pour deux, l'écrin familial, ou le plus ancien avec sauna. Et si vous êtes nombreux, regroupez-les${
        total !== null ? ` jusqu'à ${total} personnes` : ""
      }. Un hameau à vous, sans pour autant être coupés du monde : commerces et services restent à cinq minutes.`,
    surtitreGroupe: "Tribu ou retrouvailles",
    titreGroupe: (total) =>
      total !== null ? <>Regroupez les trois gîtes,<br />jusqu&apos;à {total} personnes.</> : <>Regroupez les trois gîtes.</>,
    introGroupe:
      "Les trois gîtes se touchent. Vous pouvez les louer ensemble pour un mariage, un anniversaire, ou simplement parce qu'il fait bon se retrouver entre amis sans se gêner.",
    ecrireGroupe: "Nous écrire pour un séjour groupé",
  },
  en: {
    titrePage: "Our gîtes",
    rangees: {
      laphine: {
        placeholder: "LaPhine — exterior, end of the day",
        caps: ["2 bedrooms", "70 m²", "Built-in spa · garage"],
        lead: "The family retreat — a built-in spa under the heated veranda, two quiet bedrooms, and a garage that spares you the showers.",
      },
      armu: {
        placeholder: "L'Armu — veranda jacuzzi, fireplace",
        caps: ["1 attic bedroom", "45 m²", "Jacuzzi · fireplace"],
        lead: "A hideaway for two — an attic bedroom at rooftop height, a jacuzzi under the veranda, a decorative fireplace for cool evenings.",
      },
      "maison-vieille": {
        placeholder: "La Maison Vieille — old stone, sauna",
        caps: ["2 bedrooms", "85 m²", "Private spa + sauna"],
        lead: "The oldest in the hamlet — exposed stone, generous spaces, and the only one with both a private spa and a private sauna.",
      },
    },
    personnes: (n) => `${n} people`,
    avis: (n) => `${n} reviews`,
    reco: (n) => `${n}% recommend`,
    des: (prix) => `From ${prix}`,
    laSemaine: "per week, incl. tax",
    voir: "View the gîte",
    reserver: "Book a stay",
    surtitre: "Our three retreats",
    titre: <>Three gîtes,<br />one hamlet.</>,
    intro: (total) =>
      `Choose the gîte that suits you — intimacy for two, the family retreat, or the oldest one with a sauna. And if there are many of you, combine them${
        total !== null ? ` for up to ${total} people` : ""
      }. A hamlet of your own, without being cut off from the world: shops and services are five minutes away.`,
    surtitreGroupe: "Tribe or reunion",
    titreGroupe: (total) =>
      total !== null ? <>Combine all three gîtes,<br />for up to {total} people.</> : <>Combine all three gîtes.</>,
    introGroupe:
      "The three gîtes stand side by side. You can rent them together for a wedding, a birthday, or simply because it is good to get together with friends without getting in each other's way.",
    ecrireGroupe: "Write to us about a group stay",
  },
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return metadonnees(langue, "/gites", TEXTES[langue].titrePage);
}

function GiteRow({
  langue,
  gite,
  contenu,
  reverse,
  chiffres,
}: {
  langue: Langue;
  gite: GiteData;
  contenu: RowContent;
  reverse?: boolean;
  chiffres: ChiffresGite | null;
}) {
  const t = TEXTES[langue];
  const rating = fmtNote(gite.rating, langue);
  const plancher = chiffres?.plancherSemaine ?? null;
  const toutesCaps =
    chiffres !== null ? [t.personnes(chiffres.capaciteMax), ...contenu.caps] : contenu.caps;
  return (
    <section className={`${styles.giteRow}${reverse ? ` ${styles.reverse}` : ""}`}>
      <div className="wrap">
        <div className={styles.giteRowGrid}>
          <div className={styles.giteRowMedia}>
            <ImageSlot placeholder={contenu.placeholder} />
            <span className={styles.target}>{gite.short[langue]}</span>
          </div>
          <div className={styles.giteRowBody}>
            <div className={styles.giteRowHead}>
              <h2>{gite.name}</h2>
              <span className={styles.giteRowCode}>{gite.code}</span>
            </div>
            <div className={styles.giteRowCaps}>
              {toutesCaps.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <p className={styles.giteRowLead}>{contenu.lead}</p>
            <div className={styles.giteRowProof}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
              </svg>
              <strong>{rating}/5</strong>
              <span className={styles.sep} />
              <span>{t.avis(gite.reviews)}</span>
              <span className={styles.sep} />
              <span>{t.reco(gite.reco)}</span>
            </div>
            <div className={styles.giteRowFoot}>
              <div className={styles.giteRowPrice}>
                {plancher !== null && (
                  <>
                    <strong>{t.des(fmtPrix(plancher, langue))}</strong> <small>{t.laSemaine}</small>
                  </>
                )}
              </div>
              <div className={styles.giteRowActions}>
                <Link className="btn btn-secondary" href={lien(langue, `/gites/${gite.id}`)}>{t.voir}</Link>
                <Link className="btn btn-primary" href={lien(langue, `/reserver?gite=${gite.id}`)}>{t.reserver}</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function GitesPage({ params }: { params: Promise<Params> }) {
  const langue = langueDe((await params).lang);
  const t = TEXTES[langue];
  const publics = await lireChiffresPublics();
  const total = capaciteTotale(publics);

  return (
    <>
      <section className={styles.pageHero}>
        <div className="wrap">
          <div className={styles.pageHeroGrid}>
            <div>
              <span className="eyebrow">{t.surtitre}</span>
              <h1 style={{ marginTop: 16 }}>{t.titre}</h1>
            </div>
            <p>{t.intro(total)}</p>
          </div>
        </div>
      </section>

      {ORDRE.map(({ slug, reverse }) => (
        <GiteRow
          key={slug}
          langue={langue}
          gite={GITES[slug]}
          contenu={t.rangees[slug]}
          reverse={reverse}
          chiffres={chiffresDuGite(publics, slug)}
        />
      ))}

      {/* Combine block */}
      <section className={styles.combine}>
        <div className="wrap">
          <div className={styles.combineGrid}>
            <div>
              <span className="eyebrow">{t.surtitreGroupe}</span>
              <h2 style={{ marginTop: 14 }}>{t.titreGroupe(total)}</h2>
              <p>{t.introGroupe}</p>
              <p style={{ marginTop: 14 }}>
                <Link href={lien(langue, "/contact")} className="btn btn-secondary">
                  {t.ecrireGroupe}
                </Link>
              </p>
            </div>
            {total !== null && (
              <div className={styles.combineDiagram}>
                {GITE_IDS.map((slug) => (
                  <div key={slug}>
                    <strong>{chiffresDuGite(publics, slug)?.capaciteMax}</strong>
                    <small>{GITES[slug].name}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
