"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { GITES, GITE_IDS, type GiteId } from "@/lib/data/gites";
import styles from "./page.module.css";

type FieldName = "firstname" | "lastname" | "email" | "phone" | "message";

export interface ContactFormProps {
  /** Capacités lues en base par la page (composant serveur). Un gîte absent
   *  garde son option, sans le « (N pers.) » : mieux vaut une option sans
   *  chiffre qu'un chiffre faux. */
  capacites: Partial<Record<GiteId, number>>;
}

/** Suffixe « (4 pers.) » d'une option, plus la mention sauna de la Maison Vieille. */
function libelleOption(slug: GiteId, capacite: number | undefined): string {
  const details = [
    capacite !== undefined ? `${capacite} pers.` : null,
    slug === "maison-vieille" ? "sauna" : null,
  ].filter(Boolean);
  return details.length > 0 ? `${GITES[slug].name} (${details.join(" + ")})` : GITES[slug].name;
}

const ErrorIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/** Formulaire de contact — validation client uniquement, aucun appel réseau
 *  (reproduit le script inline de contact.html). */
export default function ContactForm({ capacites }: ContactFormProps) {
  const [errors, setErrors] = useState<Set<FieldName>>(new Set());
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bad = new Set<FieldName>();
    if (!String(fd.get("firstname") ?? "").trim()) bad.add("firstname");
    if (!String(fd.get("lastname") ?? "").trim()) bad.add("lastname");
    const em = String(fd.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) bad.add("email");
    if (!String(fd.get("message") ?? "").trim()) bad.add("message");
    setErrors(bad);
    if (bad.size > 0) return;
    setSent(true);
  };

  const fieldClass = (name: FieldName) =>
    `${styles.formField}${errors.has(name) ? ` ${styles.fieldError}` : ""}`;

  if (sent) {
    return (
      <div className={styles.form}>
        <div className={styles.formSuccess} role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 11 15 16 9" />
          </svg>
          <h3>Votre message a bien été envoyé.</h3>
          <p>Patricia ou Nicolas vous répondra sous 24 heures, sur l&apos;adresse que vous avez indiquée.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <h2>Écrivez-nous</h2>
      <p>Précisez vos dates et le gîte qui vous intéresse — nous vous répondrons avec une disponibilité ferme.</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formRow}>
          <div className={fieldClass("firstname")}>
            <label>Prénom <span>*</span></label>
            <input type="text" name="firstname" placeholder="Patricia" />
            <div className={styles.formError}>{ErrorIcon}Veuillez indiquer votre prénom.</div>
          </div>
          <div className={fieldClass("lastname")}>
            <label>Nom <span>*</span></label>
            <input type="text" name="lastname" placeholder="Terrafina" />
            <div className={styles.formError}>{ErrorIcon}Veuillez indiquer votre nom.</div>
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={fieldClass("email")}>
            <label>Email <span>*</span></label>
            <input type="email" name="email" placeholder="patricia@exemple.fr" />
            <div className={styles.formError}>{ErrorIcon}Adresse email invalide.</div>
          </div>
          <div className={fieldClass("phone")}>
            <label>Téléphone</label>
            <input type="tel" name="phone" placeholder="+33 6 12 34 56 78" />
            <div className={styles.formError}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
              </svg>
              Format invalide.
            </div>
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label>Gîte qui vous intéresse</label>
            <select name="gite" defaultValue="">
              <option value="">— Tous les gîtes —</option>
              {GITE_IDS.map((slug) => (
                <option value={slug} key={slug}>
                  {libelleOption(slug, capacites[slug])}
                </option>
              ))}
              <option value="multi">Plusieurs gîtes / séjour groupé</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label>Période envisagée</label>
            <input type="text" name="period" placeholder="ex. 12 → 19 juillet 2026" />
          </div>
        </div>
        <div className={`${styles.formRow} ${styles.full}`}>
          <div className={fieldClass("message")}>
            <label>Votre message <span>*</span></label>
            <textarea name="message" rows={5} placeholder="Quelques mots sur votre séjour, vos voyageurs, vos envies…" />
            <div className={styles.formError}>{ErrorIcon}Merci d&apos;écrire un court message.</div>
          </div>
        </div>

        <label className={styles.consent}>
          <input type="checkbox" name="consent" />
          <span>
            J&apos;accepte que mes données soient utilisées pour répondre à ma demande. Aucun envoi
            commercial — voir notre <Link href="/legal/privacy">politique de confidentialité</Link>.
          </span>
        </label>

        <button className="btn btn-primary btn-block" type="submit" style={{ padding: 16 }}>
          Envoyer le message
        </button>
      </form>
    </div>
  );
}
