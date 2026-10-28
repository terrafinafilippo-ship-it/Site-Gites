"use client";

// Formulaire « Retrouver ma réservation » (D-25) : l'adresse saisie part à
// POST /api/suivi/lien, qui répond la même chose que l'adresse ait réservé ou
// non. L'écran ne dit donc jamais si une réservation existe.
import { useState, type FormEvent } from "react";

import type { Bilingue, Langue } from "@/lib/i18n/langues";
import styles from "./page.module.css";

const TEXTES: Bilingue<{
  titre: string;
  intro: string;
  email: string;
  exemple: string;
  envoyer: string;
  envoi: string;
  invalide: string;
  panne: string;
  recu: string;
}> = {
  fr: {
    titre: "Retrouver ma réservation",
    intro: "Indiquez l'adresse e-mail utilisée pour réserver : nous vous renvoyons le lien de votre réservation.",
    email: "Adresse e-mail",
    exemple: "vous@exemple.fr",
    envoyer: "Recevoir mon lien",
    envoi: "Envoi…",
    invalide: "Adresse e-mail invalide.",
    panne: "La demande n'a pas pu être traitée. Réessayez dans quelques minutes.",
    recu: "Si une réservation correspond à cette adresse, vous allez recevoir un courriel.",
  },
  en: {
    titre: "Find my booking",
    intro: "Enter the email address used to book: we will send you the link to your booking again.",
    email: "Email address",
    exemple: "you@example.com",
    envoyer: "Get my link",
    envoi: "Sending…",
    invalide: "Invalid email address.",
    panne: "Your request could not be processed. Please try again in a few minutes.",
    recu: "If a booking matches this address, you will receive an email.",
  },
};

export default function FormulaireLien({ langue }: { langue: Langue }) {
  const t = TEXTES[langue];
  const [etat, setEtat] = useState<"saisie" | "envoi" | "recu" | "invalide" | "panne">("saisie");

  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEtat("invalide");
      return;
    }
    setEtat("envoi");
    try {
      const reponse = await fetch("/api/suivi/lien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEtat(reponse.ok ? "recu" : reponse.status === 400 ? "invalide" : "panne");
    } catch {
      setEtat("panne");
    }
  }

  return (
    <div className={styles.bloc}>
      <h2>{t.titre}</h2>
      {etat === "recu" ? (
        <p className={styles.recu} role="status">{t.recu}</p>
      ) : (
        <form className={styles.formulaire} onSubmit={envoyer} noValidate>
          <p className={styles.sous}>{t.intro}</p>
          <label htmlFor="suivi-email">{t.email}</label>
          <input id="suivi-email" name="email" type="email" autoComplete="email" placeholder={t.exemple} required />
          {etat === "invalide" && <p className={styles.erreur}>{t.invalide}</p>}
          {etat === "panne" && <p className={styles.erreur}>{t.panne}</p>}
          <div>
            <button className="btn btn-primary" type="submit" disabled={etat === "envoi"}>
              {etat === "envoi" ? t.envoi : t.envoyer}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
