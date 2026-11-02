// POST /api/suivi/solde — le client paie son SOLDE depuis « Ma réservation »
// (Phase 4, lot 1, D-28). Corps : { jeton }.
//
// Le jeton secret de la page authentifie le client, comme la page elle-même :
// un jeton inconnu, expiré ou d'une réservation jamais payée reçoit la même
// réponse (404). Le paiement ouvert (lib/solde.ts) est réutilisé à chaque
// clic : aucun paiement en double chez Stripe.
//
// Réponses : 200 { clientSecret, clePublique, montant } · 404 lien non
// valable · 409 { raison } rien à payer maintenant (payé, prélèvement prévu,
// en cours) · 503 paiement indisponible.
import { NextResponse } from "next/server";

import { messageErreur } from "@/lib/route-helpers";
import { ouvrirSolde } from "@/lib/solde";
import { configurationPaiement } from "@/lib/stripe";
import { chargerSuivi } from "@/lib/suivi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SANS_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  let jeton: unknown;
  try {
    jeton = ((await request.json()) as { jeton?: unknown } | null)?.jeton;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: SANS_CACHE });
  }
  if (typeof jeton !== "string") return NextResponse.json({ ok: false }, { status: 400, headers: SANS_CACHE });

  const configuration = configurationPaiement();
  if (!configuration.ok) {
    console.error("[suivi/solde] paiement non configuré :", configuration.raison);
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }

  try {
    const suivi = await chargerSuivi(jeton);
    if (suivi.etat !== "ouvert") return NextResponse.json({ ok: false }, { status: 404, headers: SANS_CACHE });
    const ouverture = await ouvrirSolde(suivi.resa.id);
    if (!ouverture.ok) {
      return NextResponse.json({ ok: false, raison: ouverture.raison }, { status: 409, headers: SANS_CACHE });
    }
    return NextResponse.json(
      { ok: true, clientSecret: ouverture.clientSecret, clePublique: configuration.clePublique, montant: ouverture.montant },
      { headers: SANS_CACHE },
    );
  } catch (erreur) {
    console.error("[suivi/solde] paiement du solde impossible :", messageErreur(erreur));
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }
}
