import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_SECTIONS, isLegalSection } from "@/lib/data/legal";
import styles from "./page.module.css";

interface Params {
  section: string;
}

export function generateStaticParams(): Params[] {
  return LEGAL_SECTIONS.map((section) => ({ section }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { section } = await params;
  if (!isLegalSection(section)) return {};
  return { title: `${LEGAL_DOCS[section].title} — Les Gîtes de Samoyas` };
}

const TOC: { section: string; label: string }[] = [
  { section: "mentions", label: "Mentions légales" },
  { section: "cgv", label: "CGV & annulation" },
  { section: "privacy", label: "Confidentialité (RGPD)" },
  { section: "cookies", label: "Cookies" },
];

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { section } = await params;
  if (!isLegalSection(section)) notFound();
  const doc = LEGAL_DOCS[section];

  return (
    <>
      <div className={styles.crumb}>
        <div className="wrap">
          <Link href="/">Accueil</Link>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>{doc.title}</span>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className={styles.legal}>
            <aside className={styles.toc}>
              <div className={styles.tocLabel}>Documents</div>
              <ul>
                {TOC.map((t) => (
                  <li key={t.section}>
                    <Link
                      href={`/legal/${t.section}`}
                      className={t.section === section ? styles.isActive : undefined}
                    >
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>

            <div className={styles.doc}>
              <h1>{doc.title}</h1>
              <div className={styles.docMeta}>{doc.meta}</div>
              {/* Contenu légal statique rédigé en dur (lib/data/legal.ts) — aucune donnée externe. */}
              <div dangerouslySetInnerHTML={{ __html: doc.body }} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
