"use client";

// VALIDER LA CAUTION depuis « Ma réservation » (Phase 4, lot 2, D-16) : le
// bouton ouvre la validation (POST /api/suivi/caution), puis le champ de carte
// de Stripe (reserver/PaiementStripe.tsx). Deux cas :
//   - préautorisation refusée ou authentification exigée : le client confirme
//     la MÊME préautorisation, avec la même carte ou une autre ;
//   - caution non constituée à l'arrivée (art. 6.6) : il enregistre une
//     carte, sous le texte d'accord affiché par la page.
// Après validation, retour sur cette page, qui revérifie chez Stripe avant
// d'afficher quoi que ce soit.
import { useState } from "react";

import { fmtEuro } from "@/lib/format";
import type { Bilingue, Langue } from "@/lib/i18n/langues";
import PaiementStripe, { type EssaiPaiement } from "../../reserver/PaiementStripe";
import styles from "../page.module.css";

const TEXTES: Bilingue<{
  ouvrirValider: (montant: string) => string;
  ouvrirEnregistrer: string;
  ouverture: string;
  valider: (montant: string) => string;
  enregistrer: string;
  enCours: string;
  refus: string;
  authentification: string;
  erreur: string;
  indisponible: string;
  rienAValider: string;
}> = {
  fr: {
    ouvrirValider: (m) => `Valider ma caution (${m})`,
    ouvrirEnregistrer: "Enregistrer ma carte",
    ouverture: "Ouverture…",
    valider: (m) => `Valider la préautorisation de ${m}`,
    enregistrer: "Enregistrer la carte",
    enCours: "Validation en cours…",
    refus: "Votre banque a refusé la carte. Essayez une autre carte.",
    authentification: "La validation par votre banque n'a pas abouti. Réessayez.",
    erreur: "La validation n'a pas pu être faite. Vérifiez la carte et réessayez.",
    indisponible: "La validation en ligne est momentanément indisponible. Réessayez dans quelques minutes, ou appelez-nous.",
    rienAValider: "Il n'y a rien à valider pour le moment : rechargez la page.",
  },
  en: {
    ouvrirValider: (m) => `Confirm my deposit (${m})`,
    ouvrirEnregistrer: "Save my card",
    ouverture: "Opening…",
    valider: (m) => `Confirm the ${m} pre-authorisation`,
    enregistrer: "Save the card",
    enCours: "Confirming…",
    refus: "Your bank declined the card. Try another card.",
    authentification: "Your bank's verification did not succeed. Please try again.",
    erreur: "This could not be confirmed. Check the card and try again.",
    indisponible: "Online confirmation is temporarily unavailable. Please try again in a few minutes, or call us.",
    rienAValider: "There is nothing to confirm at the moment: please reload the page.",
  },
};

type Etat =
  | { etape: "bouton"; message: string | null }
  | { etape: "ouverture" }
  | {
      etape: "carte";
      mode: "paiement" | "enregistrement";
      clientSecret: string;
      clePublique: string;
      message: string | null;
    };

export default function ValiderCaution({
  langue,
  jeton,
  montant,
  enregistrement,
}: {
  langue: Langue;
  jeton: string;
  montant: number;
  /** Caution non constituée à l'arrivée : une carte à enregistrer (art. 6.6). */
  enregistrement: boolean;
}) {
  const t = TEXTES[langue];
  const somme = fmtEuro(montant, langue);
  const [etat, setEtat] = useState<Etat>({ etape: "bouton", message: null });

  async function ouvrir(): Promise<void> {
    setEtat({ etape: "ouverture" });
    try {
      const reponse = await fetch("/api/suivi/caution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        mode?: "paiement" | "enregistrement";
        clientSecret?: string;
        clePublique?: string;
      };
      if (reponse.ok && corps.clientSecret && corps.clePublique && corps.mode) {
        setEtat({ etape: "carte", mode: corps.mode, clientSecret: corps.clientSecret, clePublique: corps.clePublique, message: null });
      } else {
        setEtat({ etape: "bouton", message: reponse.status === 409 ? t.rienAValider : t.indisponible });
      }
    } catch {
      setEtat({ etape: "bouton", message: t.indisponible });
    }
  }

  function essai(e: EssaiPaiement): void {
    if (e.type === "abouti") {
      window.location.assign(e.urlConfirmation);
      return;
    }
    if (etat.etape !== "carte") return;
    const message = e.type === "refus" ? t.refus : e.type === "authentification" ? t.authentification : t.erreur;
    setEtat({ ...etat, message });
  }

  if (etat.etape !== "carte") {
    return (
      <>
        {etat.etape === "bouton" && etat.message && <p className={styles.erreur}>{etat.message}</p>}
        <div className={styles.actions}>
          <button className="btn btn-primary" type="button" onClick={ouvrir} disabled={etat.etape === "ouverture"}>
            {etat.etape === "ouverture" ? t.ouverture : enregistrement ? t.ouvrirEnregistrer : t.ouvrirValider(somme)}
          </button>
        </div>
      </>
    );
  }

  return (
    <PaiementStripe
      clePublique={etat.clePublique}
      clientSecret={etat.clientSecret}
      langue={langue}
      mode={etat.mode}
      // Retour sur cette même page (redirection éventuelle de la banque comprise).
      urlRetour={`${window.location.origin}${window.location.pathname}`}
      onEssai={essai}
      rendu={({ champ, payer, pret, enCours }) => (
        <div className={styles.formulaire}>
          {champ}
          {etat.message && <p className={styles.erreur}>{etat.message}</p>}
          <div className={styles.actions}>
            <button className="btn btn-primary" type="button" onClick={payer} disabled={!pret || enCours}>
              {enCours ? t.enCours : etat.mode === "enregistrement" ? t.enregistrer : t.valider(somme)}
            </button>
          </div>
        </div>
      )}
    />
  );
}
