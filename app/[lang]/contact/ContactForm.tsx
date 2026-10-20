"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { GITES, GITE_IDS, type GiteId } from "@/lib/data/gites";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import styles from "./page.module.css";

type FieldName = "firstname" | "lastname" | "email" | "phone" | "message";

const TEXTES: Bilingue<{
  pers: (n: number) => string;
  envoye: string;
  reponse: string;
  ecrivez: string;
  intro: string;
  prenom: string;
  prenomErreur: string;
  nom: string;
  nomErreur: string;
  email: string;
  emailExemple: string;
  emailErreur: string;
  telephone: string;
  telephoneErreur: string;
  gite: string;
  tous: string;
  plusieurs: string;
  periode: string;
  periodeExemple: string;
  message: string;
  messageExemple: string;
  messageErreur: string;
  consentementAvant: string;
  confidentialite: string;
  envoyer: string;
}> = {
  fr: {
    pers: (n) => `${n} pers.`,
    envoye: "Votre message a bien été envoyé.",
    reponse: "Patricia ou Nicolas vous répondra sous 24 heures, sur l'adresse que vous avez indiquée.",
    ecrivez: "Écrivez-nous",
    intro: "Précisez vos dates et le gîte qui vous intéresse — nous vous répondrons avec une disponibilité ferme.",
    prenom: "Prénom",
    prenomErreur: "Veuillez indiquer votre prénom.",
    nom: "Nom",
    nomErreur: "Veuillez indiquer votre nom.",
    email: "Email",
    emailExemple: "patricia@exemple.fr",
    emailErreur: "Adresse email invalide.",
    telephone: "Téléphone",
    telephoneErreur: "Format invalide.",
    gite: "Gîte qui vous intéresse",
    tous: "— Tous les gîtes —",
    plusieurs: "Plusieurs gîtes / séjour groupé",
    periode: "Période envisagée",
    periodeExemple: "ex. 12 → 19 juillet 2026",
    message: "Votre message",
    messageExemple: "Quelques mots sur votre séjour, vos voyageurs, vos envies…",
    messageErreur: "Merci d'écrire un court message.",
    consentementAvant:
      "J'accepte que mes données soient utilisées pour répondre à ma demande. Aucun envoi commercial — voir notre ",
    confidentialite: "politique de confidentialité",
    envoyer: "Envoyer le message",
  },
  en: {
    pers: (n) => `${n} people`,
    envoye: "Your message has been sent.",
    reponse: "Patricia or Nicolas will reply within 24 hours, to the address you gave.",
    ecrivez: "Write to us",
    intro: "Tell us your dates and the gîte you are interested in — we will reply with firm availability.",
    prenom: "First name",
    prenomErreur: "Please enter your first name.",
    nom: "Last name",
    nomErreur: "Please enter your last name.",
    email: "Email",
    emailExemple: "patricia@example.com",
    emailErreur: "Invalid email address.",
    telephone: "Phone",
    telephoneErreur: "Invalid format.",
    gite: "Gîte you are interested in",
    tous: "— All gîtes —",
    plusieurs: "Several gîtes / group stay",
    periode: "Planned dates",
    periodeExemple: "e.g. 12 → 19 July 2026",
    message: "Your message",
    messageExemple: "A few words about your stay, your guests, your wishes…",
    messageErreur: "Please write a short message.",
    consentementAvant:
      "I agree that my data may be used to answer my request. No marketing messages — see our ",
    confidentialite: "privacy policy",
    envoyer: "Send the message",
  },
};

export interface ContactFormProps {
  langue: Langue;
  /** Capacités lues en base par la page (composant serveur). Un gîte absent
   *  garde son option, sans le « (N pers.) » : mieux vaut une option sans
   *  chiffre qu'un chiffre faux. */
  capacites: Partial<Record<GiteId, number>>;
}

/** Suffixe « (4 pers.) » d'une option, plus la mention sauna de la Maison Vieille. */
function libelleOption(slug: GiteId, capacite: number | undefined, langue: Langue): string {
  const details = [
    capacite !== undefined ? TEXTES[langue].pers(capacite) : null,
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
export default function ContactForm({ langue, capacites }: ContactFormProps) {
  const t = TEXTES[langue];
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
          <h3>{t.envoye}</h3>
          <p>{t.reponse}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <h2>{t.ecrivez}</h2>
      <p>{t.intro}</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formRow}>
          <div className={fieldClass("firstname")}>
            <label>{t.prenom} <span>*</span></label>
            <input type="text" name="firstname" placeholder="Patricia" />
            <div className={styles.formError}>{ErrorIcon}{t.prenomErreur}</div>
          </div>
          <div className={fieldClass("lastname")}>
            <label>{t.nom} <span>*</span></label>
            <input type="text" name="lastname" placeholder="Terrafina" />
            <div className={styles.formError}>{ErrorIcon}{t.nomErreur}</div>
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={fieldClass("email")}>
            <label>{t.email} <span>*</span></label>
            <input type="email" name="email" placeholder={t.emailExemple} />
            <div className={styles.formError}>{ErrorIcon}{t.emailErreur}</div>
          </div>
          <div className={fieldClass("phone")}>
            <label>{t.telephone}</label>
            <input type="tel" name="phone" placeholder="+33 6 12 34 56 78" />
            <div className={styles.formError}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
              </svg>
              {t.telephoneErreur}
            </div>
          </div>
        </div>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label>{t.gite}</label>
            <select name="gite" defaultValue="">
              <option value="">{t.tous}</option>
              {GITE_IDS.map((slug) => (
                <option value={slug} key={slug}>
                  {libelleOption(slug, capacites[slug], langue)}
                </option>
              ))}
              <option value="multi">{t.plusieurs}</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label>{t.periode}</label>
            <input type="text" name="period" placeholder={t.periodeExemple} />
          </div>
        </div>
        <div className={`${styles.formRow} ${styles.full}`}>
          <div className={fieldClass("message")}>
            <label>{t.message} <span>*</span></label>
            <textarea name="message" rows={5} placeholder={t.messageExemple} />
            <div className={styles.formError}>{ErrorIcon}{t.messageErreur}</div>
          </div>
        </div>

        <label className={styles.consent}>
          <input type="checkbox" name="consent" />
          <span>
            {t.consentementAvant}<Link href={lien(langue, "/legal/privacy")}>{t.confidentialite}</Link>.
          </span>
        </label>

        <button className="btn btn-primary btn-block" type="submit" style={{ padding: 16 }}>
          {t.envoyer}
        </button>
      </form>
    </div>
  );
}
