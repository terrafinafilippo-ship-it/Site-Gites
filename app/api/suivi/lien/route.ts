// POST /api/suivi/lien — formulaire « Retrouver ma réservation » (Phase 3,
// lot 4, étape 3, D-25). Corps : { email }.
//
// La réponse est LA MÊME que l'adresse ait réservé ou non, qu'elle ait atteint
// la limite de demandes ou non : un curieux ne peut pas savoir qui a réservé.
// Les courriels inscrits (lib/suivi.ts) partent après la réponse.
//
// Réponses : 200 demande reçue · 400 adresse mal formée · 503 base
// indisponible (journalisée comme une panne).
import { after, NextResponse } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import { messageErreur, resolveSiteOrigin } from "@/lib/route-helpers";
import { demanderLien, FORME_EMAIL } from "@/lib/suivi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SANS_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  let email: unknown;
  try {
    email = ((await request.json()) as { email?: unknown } | null)?.email;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: SANS_CACHE });
  }
  if (typeof email !== "string" || email.trim().length > 254 || !FORME_EMAIL.test(email.trim())) {
    return NextResponse.json({ ok: false }, { status: 400, headers: SANS_CACHE });
  }

  try {
    const { inscrits } = await demanderLien(email);
    if (inscrits > 0) after(() => traiterCourriels(resolveSiteOrigin(request)));
  } catch (erreur) {
    console.error("[suivi/lien] demande impossible :", messageErreur(erreur));
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: SANS_CACHE });
}
