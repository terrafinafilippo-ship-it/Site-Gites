import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dureeConservationAbandons } from "@/lib/abandons";
import { delaiDoublonHeures } from "@/lib/synchronisation";
import { LEGAL_DOCS, LEGAL_SECTIONS, isLegalSection, type LegalSection } from "@/lib/data/legal";
import { langueDe, lien, type Bilingue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import styles from "./page.module.css";

// LES TEXTES JURIDIQUES RESTENT EN FRANÇAIS (décision D-22). Une traduction
// qui dirait autre chose que l'original pourrait être opposée par le client :
// elle viendra d'un traducteur ou du juriste, jamais d'une session. En
// anglais, la page affiche le texte français, précédé d'une mention qui le dit.

interface Params {
  lang: string;
  section: string;
}

// RENDU À LA DEMANDE, comme les fiches des gîtes : la politique de
// confidentialité affiche la durée des tentatives abandonnées, les CGV le
// délai pour prévenir d'un doublon (Phase 7), des réglages en base. Figée au
// build, la page exigerait la base au build et garderait les valeurs du jour
// du déploiement.
export const dynamic = "force-dynamic";

const TEXTES: Bilingue<{
  accueil: string;
  documents: string;
  sommaire: Record<LegalSection, string>;
  francaisSeulement: string | null;
}> = {
  fr: {
    accueil: "Accueil",
    documents: "Documents",
    sommaire: {
      mentions: "Mentions légales",
      cgv: "CGV & annulation",
      privacy: "Confidentialité (RGPD)",
      cookies: "Cookies",
      avis: "Avis clients",
    },
    francaisSeulement: null,
  },
  en: {
    accueil: "Home",
    documents: "Documents",
    sommaire: {
      mentions: "Legal notice",
      cgv: "Terms & cancellation",
      privacy: "Privacy (GDPR)",
      cookies: "Cookies",
      avis: "Guest reviews",
    },
    francaisSeulement: "Available in French only.",
  },
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { lang, section } = await params;
  if (!isLegalSection(section)) return {};
  const langue = langueDe(lang);
  return metadonnees(langue, `/legal/${section}`, TEXTES[langue].sommaire[section]);
}

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { lang, section } = await params;
  if (!isLegalSection(section)) notFound();
  const langue = langueDe(lang);
  const t = TEXTES[langue];
  const doc = LEGAL_DOCS[section];
  const corps =
    typeof doc.body === "string"
      ? doc.body
      : doc.body({ abandonJours: await dureeConservationAbandons(), doublonHeures: await delaiDoublonHeures() });

  return (
    <>
      <div className={styles.crumb}>
        <div className="wrap">
          <Link href={lien(langue, "/")}>{t.accueil}</Link>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>{t.sommaire[section]}</span>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className={styles.legal}>
            <aside className={styles.toc}>
              <div className={styles.tocLabel}>{t.documents}</div>
              <ul>
                {LEGAL_SECTIONS.map((s) => (
                  <li key={s}>
                    <Link
                      href={lien(langue, `/legal/${s}`)}
                      className={s === section ? styles.isActive : undefined}
                    >
                      {t.sommaire[s]}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>

            <div className={styles.doc}>
              {t.francaisSeulement && (
                <p className={styles.docMeta} style={{ fontWeight: 600 }}>{t.francaisSeulement}</p>
              )}
              <div lang="fr">
                <h1>{doc.title}</h1>
                <div className={styles.docMeta}>{doc.meta}</div>
                {/* Contenu légal rédigé en dur (lib/data/legal.ts) ; seules données externes : deux nombres lus en base. */}
                <div dangerouslySetInnerHTML={{ __html: corps }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
