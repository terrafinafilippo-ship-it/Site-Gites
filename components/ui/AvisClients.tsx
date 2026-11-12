// Les avis des clients du site sur la fiche d'un gîte (Phase 6, D-40).
//
// À côté des avis, ce que la loi demande d'afficher (art. L.111-7-2 et
// D.111-17 C. conso.) : qu'ils sont contrôlés et comment, la date de chaque
// avis et celle du séjour, l'ordre de classement ; le détail est dans la
// politique des avis (/legal/avis). Sans avis publié, la section n'apparaît pas.
import Link from "next/link";

import type { AvisPublie } from "@/lib/avis";
import { resumer } from "@/lib/avis";
import { fmtDateLongue, fmtMoisAnnee, fmtNoteDixiemes } from "@/lib/format";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";

import styles from "./AvisClients.module.css";

/** Avis montrés d'emblée ; les suivants s'ouvrent sous « Voir les autres avis ». */
const VISIBLES = 6;

const TEXTES: Bilingue<{
  surtitre: string;
  titre: string;
  nombre: (n: number) => string;
  controle: string;
  politique: string;
  sejour: (mois: string) => string;
  publie: (date: string) => string;
  note: (n: number) => string;
  autres: (n: number) => string;
}> = {
  fr: {
    surtitre: "Avis de nos clients",
    titre: "Ce qu'en disent nos clients",
    nombre: (n) => `${n} avis`,
    controle:
      "Avis vérifiés : chacun a été déposé par un client qui a séjourné dans ce gîte, avec le lien personnel reçu après son départ. Classés du plus récent au plus ancien.",
    politique: "Notre politique des avis",
    sejour: (mois) => `Séjour en ${mois}`,
    publie: (date) => `avis du ${date}`,
    note: (n) => `${n} sur 5`,
    autres: (n) => (n === 1 ? "Voir l'autre avis" : `Voir les ${n} autres avis`),
  },
  en: {
    surtitre: "Guest reviews",
    titre: "What our guests say",
    nombre: (n) => (n === 1 ? "1 review" : `${n} reviews`),
    controle:
      "Verified reviews: each one was left by a guest who stayed in this gîte, using the personal link received after their departure. Sorted from newest to oldest.",
    politique: "Our review policy",
    sejour: (mois) => `Stayed in ${mois}`,
    publie: (date) => `reviewed on ${date}`,
    note: (n) => `${n} out of 5`,
    autres: (n) => (n === 1 ? "See the other review" : `See the other ${n} reviews`),
  },
};

function Etoiles({ note, libelle }: { note: number; libelle: string }) {
  return (
    <span className={styles.etoiles} role="img" aria-label={libelle}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" className={i <= note ? styles.pleine : styles.vide} aria-hidden="true">
          <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
        </svg>
      ))}
    </span>
  );
}

function Avis({ a, langue }: { a: AvisPublie; langue: Langue }) {
  const t = TEXTES[langue];
  return (
    <article className={styles.avis}>
      <div className={styles.tete}>
        <Etoiles note={a.note} libelle={t.note(a.note)} />
        <strong>{a.signature}</strong>
      </div>
      <p className={styles.dates}>
        {t.sejour(fmtMoisAnnee(a.dateSejour, langue))} · {t.publie(fmtDateLongue(a.publieLe, langue))}
      </p>
      {a.commentaire && <p className={styles.commentaire}>{a.commentaire}</p>}
    </article>
  );
}

export default function AvisClients({ langue, avis }: { langue: Langue; avis: readonly AvisPublie[] }) {
  if (avis.length === 0) return null;
  const t = TEXTES[langue];
  const { nombre, moyenneCentiemes } = resumer(avis.map((a) => a.note));
  const visibles = avis.slice(0, VISIBLES);
  const suivants = avis.slice(VISIBLES);
  return (
    <section className="section" id="avis">
      <div className="wrap">
        <span className="eyebrow">{t.surtitre}</span>
        <div className={styles.entete}>
          <h2>{t.titre}</h2>
          {moyenneCentiemes !== null && (
            <p className={styles.resume}>
              <strong>{fmtNoteDixiemes(moyenneCentiemes, langue)}</strong>/5 · {t.nombre(nombre)}
            </p>
          )}
        </div>
        <p className={styles.controle}>
          {t.controle}{" "}
          <Link href={lien(langue, "/legal/avis")}>{t.politique}</Link>
        </p>
        <div className={styles.liste}>
          {visibles.map((a) => (
            <Avis key={a.id} a={a} langue={langue} />
          ))}
        </div>
        {suivants.length > 0 && (
          <details className={styles.suite}>
            <summary>{t.autres(suivants.length)}</summary>
            <div className={styles.liste}>
              {suivants.map((a) => (
                <Avis key={a.id} a={a} langue={langue} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
