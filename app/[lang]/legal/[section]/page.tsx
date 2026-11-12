import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_SECTIONS, isLegalSection, type LegalSection } from "@/lib/data/legal";
import { LANGUES, langueDe, lien, type Bilingue } from "@/lib/i18n/langues";
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

export function generateStaticParams(): Params[] {
  return LANGUES.flatMap((lang) => LEGAL_SECTIONS.map((section) => ({ lang, section })));
}

export const dynamicParams = false;

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
                {/* Contenu légal statique rédigé en dur (lib/data/legal.ts) — aucune donnée externe. */}
                <div dangerouslySetInnerHTML={{ __html: doc.body }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
