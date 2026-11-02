"use client";

// PAYER LE SOLDE depuis « Ma réservation » (Phase 4, lot 1, D-28) : le bouton
// ouvre le paiement (POST /api/suivi/solde, qui réutilise le paiement déjà
// ouvert), puis le champ de carte de Stripe, le même que dans le tunnel
// (reserver/PaiementStripe.tsx). Après paiement, retour sur cette page, qui
// revérifie le paiement chez Stripe avant d'afficher quoi que ce soit.
import { useState } from "react";

import { fmtEuro } from "@/lib/format";
import type { Bilingue, Langue } from "@/lib/i18n/langues";
import PaiementStripe, { type EssaiPaiement } from "../../reserver/PaiementStripe";
import styles from "../page.module.css";

const TEXTES: Bilingue<{
  ouvrir: (montant: string) => string;
  ouverture: string;
  payer: (montant: string) => string;
  enCours: string;
  refus: string;
  authentification: string;
  erreur: string;
  indisponible: string;
  rienAPayer: string;
}> = {
  fr: {
    ouvrir: (m) => `Payer le solde (${m})`,
    ouverture: "Ouverture du paiement…",
    payer: (m) => `Payer ${m}`,
    enCours: "Paiement en cours…",
    refus: "Votre banque a refusé la carte. Essayez une autre carte.",
    authentification: "La validation par votre banque n'a pas abouti. Réessayez.",
    erreur: "Le paiement n'a pas pu être fait. Vérifiez la carte et réessayez.",
    indisponible: "Le paiement en ligne est momentanément indisponible. Réessayez dans quelques minutes, ou appelez-nous.",
    rienAPayer: "Il n'y a rien à payer pour le moment : rechargez la page.",
  },
  en: {
    ouvrir: (m) => `Pay the balance (${m})`,
    ouverture: "Opening the payment…",
    payer: (m) => `Pay ${m}`,
    enCours: "Payment in progress…",
    refus: "Your bank declined the card. Try another card.",
    authentification: "Your bank's verification did not succeed. Please try again.",
    erreur: "The payment could not be made. Check the card and try again.",
    indisponible: "Online payment is temporarily unavailable. Please try again in a few minutes, or call us.",
    rienAPayer: "There is nothing to pay at the moment: please reload the page.",
  },
};

type Etat =
  | { etape: "bouton"; message: string | null }
  | { etape: "ouverture" }
  | { etape: "carte"; clientSecret: string; clePublique: string; message: string | null };

export default function PayerSolde({ langue, jeton, montant }: { langue: Langue; jeton: string; montant: number }) {
  const t = TEXTES[langue];
  const somme = fmtEuro(montant, langue);
  const [etat, setEtat] = useState<Etat>({ etape: "bouton", message: null });

  async function ouvrir(): Promise<void> {
    setEtat({ etape: "ouverture" });
    try {
      const reponse = await fetch("/api/suivi/solde", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { clientSecret?: string; clePublique?: string };
      if (reponse.ok && corps.clientSecret && corps.clePublique) {
        setEtat({ etape: "carte", clientSecret: corps.clientSecret, clePublique: corps.clePublique, message: null });
      } else {
        setEtat({ etape: "bouton", message: reponse.status === 409 ? t.rienAPayer : t.indisponible });
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
            {etat.etape === "ouverture" ? t.ouverture : t.ouvrir(somme)}
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
      // Retour sur cette même page (redirection éventuelle de la banque comprise).
      urlRetour={`${window.location.origin}${window.location.pathname}`}
      onEssai={essai}
      rendu={({ champ, payer, pret, enCours }) => (
        <div className={styles.formulaire}>
          {champ}
          {etat.message && <p className={styles.erreur}>{etat.message}</p>}
          <div className={styles.actions}>
            <button className="btn btn-primary" type="button" onClick={payer} disabled={!pret || enCours}>
              {enCours ? t.enCours : t.payer(somme)}
            </button>
          </div>
        </div>
      )}
    />
  );
}
