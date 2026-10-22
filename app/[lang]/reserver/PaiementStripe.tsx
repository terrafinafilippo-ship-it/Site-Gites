"use client";

// Le FORMULAIRE DE CARTE de l'étape 4 : le champ de Stripe (Payment Element)
// intégré à la page, et le paiement lui-même (décision du 20 octobre 2026 :
// payer sur le site, pas sur une page Stripe).
//
// Les numéros de carte ne passent jamais par le serveur du site : le champ est
// servi par Stripe, dans la page. Le site ne reçoit que le résultat, qu'il
// revérifie chez Stripe avant de confirmer quoi que ce soit
// (/reserver/confirmation, lib/paiement.ts).
//
// Validation par la banque (3-D Secure) : le plus souvent une fenêtre
// par-dessus la page ; si la banque impose une redirection, le client revient
// sur /reserver/confirmation, qui reprend le paiement en cours (et non la
// saisie des coordonnées).
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState, type ReactNode } from "react";
import type { Langue } from "@/lib/i18n/langues";

/** Issue d'un essai de paiement, vue du navigateur (le serveur revérifie). */
export type EssaiPaiement =
  /** Payé, ou en traitement par la banque : direction la page de confirmation. */
  | { type: "abouti"; urlConfirmation: string }
  /** La banque refuse la carte. */
  | { type: "refus"; message: string | null }
  /** L'authentification 3-D Secure n'a pas abouti. */
  | { type: "authentification"; message: string | null }
  /** Champs incomplets, réseau : le client corrige et réessaie sur place. */
  | { type: "erreur"; message: string | null };

export type Rendu = (p: {
  champ: ReactNode;
  payer: () => Promise<void>;
  /** Le champ de carte est affiché et Stripe.js chargé. */
  pret: boolean;
  enCours: boolean;
}) => ReactNode;

// Un seul chargement de Stripe.js par clé, pour toute la page.
const chargements = new Map<string, Promise<Stripe | null>>();
function chargerStripe(clePublique: string): Promise<Stripe | null> {
  let promesse = chargements.get(clePublique);
  if (!promesse) {
    promesse = loadStripe(clePublique);
    chargements.set(clePublique, promesse);
  }
  return promesse;
}

/** Couleurs et police du site, pour que le champ de carte ne dépareille pas. */
const APPARENCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#14683d",
    colorText: "#2b2a26",
    colorDanger: "#8a4f2e",
    borderRadius: "4px",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

export default function PaiementStripe({
  clePublique,
  clientSecret,
  langue,
  urlRetour,
  rendu,
  onEssai,
}: {
  clePublique: string;
  clientSecret: string;
  langue: Langue;
  /** Adresse absolue de /reserver/confirmation dans la langue du client. */
  urlRetour: string;
  /** Mise en page de l'étape : le champ de carte où il doit aller, et les boutons qui paient. */
  rendu: Rendu;
  onEssai: (essai: EssaiPaiement) => void;
}) {
  return (
    <Elements
      stripe={chargerStripe(clePublique)}
      options={{ clientSecret, locale: langue, appearance: APPARENCE }}
    >
      <Formulaire clientSecret={clientSecret} urlRetour={urlRetour} rendu={rendu} onEssai={onEssai} />
    </Elements>
  );
}

function Formulaire({
  clientSecret,
  urlRetour,
  rendu,
  onEssai,
}: {
  clientSecret: string;
  urlRetour: string;
  rendu: Rendu;
  onEssai: (essai: EssaiPaiement) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [champPret, setChampPret] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function payer(): Promise<void> {
    if (!stripe || !elements || enCours) return;
    setEnCours(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: urlRetour },
        redirect: "if_required",
      });
      if (error) {
        const message = error.message ?? null;
        if (error.code === "payment_intent_authentication_failure") onEssai({ type: "authentification", message });
        else if (error.type === "card_error") onEssai({ type: "refus", message });
        else onEssai({ type: "erreur", message });
        return;
      }
      if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
        // Même adresse que le retour d'une redirection bancaire : un seul chemin de confirmation.
        const p = new URLSearchParams({ payment_intent: paymentIntent.id, payment_intent_client_secret: clientSecret });
        onEssai({ type: "abouti", urlConfirmation: `${urlRetour}${urlRetour.includes("?") ? "&" : "?"}${p.toString()}` });
        return;
      }
      onEssai({ type: "erreur", message: null });
    } finally {
      setEnCours(false);
    }
  }

  const champ = (
    // Décision du 22 octobre 2026 : ni Link (le compte Stripe proposé au client,
    // pris pour une demande du site), ni la phrase d'autorisation de Stripe
    // (doublon, moins précis, du texte d'accord des propriétaires affiché
    // juste en dessous, seul engagement du client).
    <PaymentElement
      options={{
        layout: "tabs",
        wallets: { applePay: "never", googlePay: "never", link: "never" },
        terms: { card: "never" },
      }}
      onReady={() => setChampPret(true)}
    />
  );
  return <>{rendu({ champ, payer, pret: champPret && stripe !== null && elements !== null, enCours })}</>;
}
