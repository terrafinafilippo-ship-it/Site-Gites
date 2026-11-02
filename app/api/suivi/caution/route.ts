// POST /api/suivi/caution — le client valide sa CAUTION depuis « Ma
// réservation » (Phase 4, lot 2, D-16). Corps : { jeton }.
//
// Deux cas (lib/caution.ts, ouvrirCaution) :
//   - préautorisation refusée la veille du départ, ou authentification
//     exigée : le MÊME paiement chez Stripe est confirmé par le client, avec
//     la même carte ou une autre (mode « paiement ») ;
//   - caution non constituée à l'arrivée (art. 6.6) : une carte est
//     enregistrée, sans paiement (mode « enregistrement ») ; le texte d'accord
//     affiché sur la page est recopié sur la réservation.
//
// Le jeton secret de la page authentifie le client, comme la page elle-même :
// un jeton inconnu ou expiré reçoit 404.
//
// Réponses : 200 { mode, clientSecret, clePublique, montant } · 404 lien non
// valable · 409 { raison } rien à valider (déjà bloquée, plus due) · 503
// paiement indisponible.
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { ouvrirCaution } from "@/lib/caution";
import { messageErreur } from "@/lib/route-helpers";
import { configurationPaiement } from "@/lib/stripe";
import { accordCarteCaution, chargerSuivi } from "@/lib/suivi";

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
    console.error("[suivi/caution] paiement non configuré :", configuration.raison);
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }

  try {
    const suivi = await chargerSuivi(jeton);
    if (suivi.etat !== "ouvert") return NextResponse.json({ ok: false }, { status: 404, headers: SANS_CACHE });
    const accord = suivi.caution?.etat === "carte_a_enregistrer" ? await accordCarteCaution(getDb(), suivi.resa) : null;
    const ouverture = await ouvrirCaution(suivi.resa.id, accord);
    if (!ouverture.ok) {
      return NextResponse.json({ ok: false, raison: ouverture.raison }, { status: 409, headers: SANS_CACHE });
    }
    return NextResponse.json(
      {
        ok: true,
        mode: ouverture.mode,
        clientSecret: ouverture.clientSecret,
        clePublique: configuration.clePublique,
        montant: ouverture.montant,
      },
      { headers: SANS_CACHE },
    );
  } catch (erreur) {
    console.error("[suivi/caution] validation de la caution impossible :", messageErreur(erreur));
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }
}
