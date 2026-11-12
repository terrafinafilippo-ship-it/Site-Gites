"use client";

// Formulaire de l'avis (Phase 6, D-40) : une note de 1 à 5, un commentaire
// facultatif, envoyés à POST /api/avis. Les informations que la loi demande
// au moment du dépôt (publication, durée, motifs de retrait) sont dites avant
// le bouton, avec le lien vers la politique des avis.
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { COMMENTAIRE_MAX, DUREE_AVIS_ANS } from "@/lib/avis-regles";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";

import styles from "./page.module.css";

const TEXTES: Bilingue<{
  note: string;
  sur5: (n: number) => string;
  commentaire: string;
  signature: (s: string) => string;
  information: (ans: number) => string;
  politique: string;
  publier: string;
  envoi: string;
  sansNote: string;
  tropLong: (max: string) => string;
  expire: string;
  deja: string;
  panne: string;
  merci: string;
  voirGite: string;
}> = {
  fr: {
    note: "Votre note",
    sur5: (n) => `${n} sur 5`,
    commentaire: "Votre commentaire (facultatif)",
    signature: (s) => `Votre avis sera signé : ${s}`,
    information: (ans) =>
      `Il est publié tout de suite sur la page du gîte, avec le mois de votre séjour et la date de l'avis, et reste en ligne ${ans} ans. ` +
      "Il ne peut être retiré que pour l'un des motifs de notre politique des avis ; vous en seriez prévenu par courriel.",
    politique: "Notre politique des avis",
    publier: "Publier mon avis",
    envoi: "Envoi…",
    sansNote: "Choisissez une note de 1 à 5.",
    tropLong: (max) => `Le commentaire tient en ${max} caractères au plus.`,
    expire: "Ce lien n'est plus valable.",
    deja: "Un avis a déjà été déposé pour ce séjour.",
    panne: "L'avis n'a pas pu être enregistré. Réessayez dans quelques minutes.",
    merci: "Merci, votre avis est publié.",
    voirGite: "Voir la page du gîte",
  },
  en: {
    note: "Your rating",
    sur5: (n) => `${n} out of 5`,
    commentaire: "Your comment (optional)",
    signature: (s) => `Your review will be signed: ${s}`,
    information: (ans) =>
      `It is published immediately on the gîte's page, with the month of your stay and the date of the review, and stays online for ${ans} years. ` +
      "It can only be removed for one of the reasons set out in our review policy; you would be notified by email.",
    politique: "Our review policy (in French)",
    publier: "Publish my review",
    envoi: "Sending…",
    sansNote: "Choose a rating from 1 to 5.",
    tropLong: (max) => `The comment can be at most ${max} characters long.`,
    expire: "This link is no longer valid.",
    deja: "A review has already been left for this stay.",
    panne: "Your review could not be saved. Please try again in a few minutes.",
    merci: "Thank you, your review is published.",
    voirGite: "See the gîte's page",
  },
};

type Etat = "saisie" | "envoi" | "publie" | "sansNote" | "tropLong" | "expire" | "deja" | "panne";

export default function FormulaireAvis({
  langue,
  jeton,
  signature,
  slug,
}: {
  langue: Langue;
  jeton: string;
  signature: string;
  slug: string;
}) {
  const t = TEXTES[langue];
  const [note, setNote] = useState(0);
  const [etat, setEtat] = useState<Etat>("saisie");
  const max = COMMENTAIRE_MAX.toLocaleString(langue === "en" ? "en-GB" : "fr-FR");

  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (note < 1) {
      setEtat("sansNote");
      return;
    }
    const commentaire = String(new FormData(e.currentTarget).get("commentaire") ?? "");
    if (Array.from(commentaire.trim()).length > COMMENTAIRE_MAX) {
      setEtat("tropLong");
      return;
    }
    setEtat("envoi");
    try {
      const reponse = await fetch("/api/avis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, note, commentaire }),
      });
      if (reponse.ok) setEtat("publie");
      else if (reponse.status === 400) setEtat(((await reponse.json()) as { champ?: string }).champ === "note" ? "sansNote" : "tropLong");
      else if (reponse.status === 404) setEtat("expire");
      else if (reponse.status === 409) setEtat("deja");
      else setEtat("panne");
    } catch {
      setEtat("panne");
    }
  }

  if (etat === "publie" || etat === "deja") {
    return (
      <>
        <p className={styles.recu} role="status">
          {etat === "publie" ? t.merci : t.deja}
        </p>
        <p className={styles.lien}>
          <Link href={lien(langue, `/gites/${slug}#avis`)}>{t.voirGite}</Link>
        </p>
      </>
    );
  }

  const erreur =
    etat === "sansNote" ? t.sansNote : etat === "tropLong" ? t.tropLong(max) : etat === "expire" ? t.expire : etat === "panne" ? t.panne : null;

  return (
    <form className={styles.formulaire} onSubmit={envoyer} noValidate>
      <fieldset className={styles.notes}>
        <legend>{t.note}</legend>
        <div className={styles.etoiles}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= note ? styles.pleine : styles.vide}>
              <input type="radio" name="note" value={n} checked={note === n} onChange={() => setNote(n)} />
              <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
              </svg>
              <span className={styles.masque}>{t.sur5(n)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.champ}>
        <label htmlFor="commentaire">{t.commentaire}</label>
        <textarea id="commentaire" name="commentaire" rows={6} maxLength={COMMENTAIRE_MAX} />
      </div>

      <p className={styles.signature}>{t.signature(signature)}</p>
      <p className={styles.information}>
        {t.information(DUREE_AVIS_ANS)} <Link href={lien(langue, "/legal/avis")}>{t.politique}</Link>
      </p>

      {erreur && (
        <p role="alert" className={styles.erreur}>
          {erreur}
        </p>
      )}

      <button type="submit" className={`btn btn-primary ${styles.publier}`} disabled={etat === "envoi"}>
        {etat === "envoi" ? t.envoi : t.publier}
      </button>
    </form>
  );
}
