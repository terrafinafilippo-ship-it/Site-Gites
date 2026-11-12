// PAGE DE L'AVIS D'UN CLIENT, par le lien reçu après son départ (Phase 6,
// D-40). Le jeton est celui de « Ma réservation » ; la page ne s'ouvre qu'à
// partir du jour du départ et jusqu'à la fin de validité du lien
// (lib/avis.ts). Jeton inconnu, séjour annulé, lien expiré : la même réponse.
import type { Metadata } from "next";
import Link from "next/link";

import { lireLienAvis } from "@/lib/avis";
import { plageDates } from "@/lib/courriels-textes";
import { lien, langueDe, type Bilingue } from "@/lib/i18n/langues";
import { NOM_SITE } from "@/lib/i18n/metadonnees";

import FormulaireAvis from "./FormulaireAvis";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const TEXTES: Bilingue<{
  titrePage: string;
  surtitre: string;
  titre: (gite: string) => string;
  sejour: (plage: string) => string;
  invalideTitre: string;
  invalide: string;
  deposeTitre: string;
  depose: string;
  voirGite: string;
}> = {
  fr: {
    titrePage: "Votre avis",
    surtitre: "Les Gîtes de Samoyas",
    titre: (gite) => `Votre avis sur ${gite}`,
    sejour: (plage) => `Séjour du ${plage}`,
    invalideTitre: "Lien non valable",
    invalide: "Ce lien n'est pas valable ou a expiré.",
    deposeTitre: "Merci",
    depose: "Vous avez déjà donné votre avis sur ce séjour.",
    voirGite: "Voir la page du gîte",
  },
  en: {
    titrePage: "Your review",
    surtitre: "Les Gîtes de Samoyas",
    titre: (gite) => `Your review of ${gite}`,
    sejour: (plage) => `Stay: ${plage}`,
    invalideTitre: "Invalid link",
    invalide: "This link is not valid or has expired.",
    deposeTitre: "Thank you",
    depose: "You have already reviewed this stay.",
    voirGite: "See the gîte's page",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return {
    title: `${TEXTES[langue].titrePage} — ${NOM_SITE}`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PageAvis({ params }: { params: Promise<{ lang: string; jeton: string }> }) {
  const { lang, jeton } = await params;
  const langue = langueDe(lang);
  const t = TEXTES[langue];
  const l = await lireLienAvis(jeton);

  return (
    <main className={styles.page}>
      <div className={`wrap ${styles.colonne}`}>
        <div className={styles.bloc}>
          <span className="eyebrow">{t.surtitre}</span>
          {l.etat === "invalide" ? (
            <>
              <h1>{t.invalideTitre}</h1>
              <p className={styles.sous}>{t.invalide}</p>
            </>
          ) : l.etat === "depose" ? (
            <>
              <h1>{t.deposeTitre}</h1>
              <p className={styles.sous}>{t.depose}</p>
              <p className={styles.lien}>
                <Link href={lien(langue, `/gites/${l.slug}#avis`)}>{t.voirGite}</Link>
              </p>
            </>
          ) : (
            <>
              <h1>{t.titre(l.gite)}</h1>
              <p className={styles.sous}>{t.sejour(plageDates(l.arrivee, l.depart, langue))}</p>
              <FormulaireAvis langue={langue} jeton={jeton} signature={l.signature} slug={l.slug} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
