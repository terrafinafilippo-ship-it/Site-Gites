// POST /api/stripe/webhook — AVIS DE STRIPE sur un paiement (réussi, refusé,
// annulé, en traitement).
//
// C'est le filet du retour client : il confirme la réservation même si le
// client a fermé sa page après avoir payé. Le traitement est celui de la page
// de retour (constaterPaiement, lib/paiement.ts), idempotent : l'avis et le
// retour peuvent arriver dans n'importe quel ordre, autant de fois que Stripe
// réessaie.
//
// La signature de l'avis est vérifiée avec STRIPE_WEBHOOK_SECRET sur le corps
// BRUT : un avis non signé ou falsifié est refusé (400) sans rien lire.
//
// Réponses : 200 traité ou ignoré · 400 signature invalide · 500 traitement à
// reprendre (Stripe renverra l'avis) · 503 secret absent.
import { NextResponse } from "next/server";

import { constaterPaiement } from "@/lib/paiement";
import { messageErreur } from "@/lib/route-helpers";
import { PaiementIndisponible, prestataire } from "@/lib/stripe";

export async function POST(request: Request) {
  const corps = await request.text();
  let avis;
  try {
    avis = prestataire().lireAvis(corps, request.headers.get("stripe-signature"));
  } catch (erreur) {
    if (erreur instanceof PaiementIndisponible) {
      console.error("[stripe/webhook] avis refusé :", erreur.message);
      return NextResponse.json({ error: "Avis non configuré." }, { status: 503 });
    }
    console.warn("[stripe/webhook] signature invalide :", messageErreur(erreur));
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }
  if (!avis) return NextResponse.json({ ok: true, ignore: true });

  try {
    const issue = await constaterPaiement(avis.paiementId);
    return NextResponse.json({ ok: true, issue: issue.issue });
  } catch (erreur) {
    console.error(`[stripe/webhook] ${avis.evenement} ${avis.paiementId} à reprendre :`, messageErreur(erreur));
    return NextResponse.json({ error: "Traitement à reprendre." }, { status: 500 });
  }
}
