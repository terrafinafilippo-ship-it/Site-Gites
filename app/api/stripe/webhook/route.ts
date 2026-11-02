// POST /api/stripe/webhook — AVIS DE STRIPE sur un paiement (réussi, refusé,
// annulé, en traitement ; caution bloquée), sur une carte enregistrée pour la
// caution (art. 6.6), et sur un paiement contesté par un client auprès de sa
// banque (alerte « À TRAITER » aux propriétaires, Phase 4, lot 2).
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
// Les courriels inscrits par le constat (lib/courriels.ts) partent APRÈS la
// réponse : Stripe n'attend pas Brevo.
//
// Réponses : 200 traité ou ignoré · 400 signature invalide · 500 traitement à
// reprendre (Stripe renverra l'avis) · 503 secret absent.
import { after, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements } from "@/db/schema";
import { constaterEnregistrement } from "@/lib/caution";
import { inscrireProbleme } from "@/lib/courriels";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { constaterPaiement } from "@/lib/paiement";
import { messageErreur, resolveSiteOrigin } from "@/lib/route-helpers";
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

  const objet = avis.genre === "enregistrement" ? avis.enregistrementId : avis.genre === "contestation" ? avis.contestationId : avis.paiementId;
  try {
    let issue: string;
    if (avis.genre === "paiement") {
      issue = (await constaterPaiement(avis.paiementId)).issue;
    } else if (avis.genre === "enregistrement") {
      issue = (await constaterEnregistrement(avis.enregistrementId)).issue;
    } else {
      // Contestation : le site ne répond pas à la place des propriétaires ; il les prévient.
      const [p] = avis.paiementId
        ? await getDb()
            .select({ reservationId: paiements.reservation_id, type: paiements.type })
            .from(paiements)
            .where(eq(paiements.reference_externe, avis.paiementId))
        : [];
      await inscrireProbleme(getDb(), "contestation", avis.contestationId, p?.reservationId ?? null, {
        paiementId: avis.paiementId,
        type: p?.type ?? null,
        montant: avis.montant,
        motif: avis.motif,
      });
      issue = "CONTESTATION";
    }
    after(() => traiterCourriels(resolveSiteOrigin(request)));
    return NextResponse.json({ ok: true, issue });
  } catch (erreur) {
    console.error(`[stripe/webhook] ${avis.evenement} ${objet} à reprendre :`, messageErreur(erreur));
    return NextResponse.json({ error: "Traitement à reprendre." }, { status: 500 });
  }
}
