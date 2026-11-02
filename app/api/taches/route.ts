// POST /api/taches — LE RÉVEIL des tâches automatiques (Phase 4, D-28).
//
// Appelée toutes les 15 minutes par une tâche programmée de Coolify, jamais
// par un navigateur. En-tête `x-taches-secret` = TACHES_SECRET (secret
// serveur, jamais préfixé NEXT_PUBLIC_). Sans secret configuré, la route
// refuse tout (503) plutôt que de s'ouvrir.
//
// Le passage (lib/taches.ts) inscrit les courriels dus ; ils partent ensuite,
// dans le même appel (lib/courriels-envoi.ts), avec les liens construits sur
// NEXT_PUBLIC_SITE_URL : appelée par l'adresse interne du serveur, la route
// ne doit pas fabriquer des liens vers « localhost ».
//
// Réponses : 200 bilan · 200 { occupe: true } si un passage est déjà en cours
// · 401 secret faux · 503 secret ou adresse du site absents.
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import { messageErreur } from "@/lib/route-helpers";
import { executerTaches } from "@/lib/taches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Courriels envoyés au plus par passage ; le reste part au passage suivant. */
const COURRIELS_PAR_PASSAGE = 50;

function memeSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const attendu = process.env.TACHES_SECRET ?? "";
  if (!attendu) {
    console.error("[taches] TACHES_SECRET absente : tâches refusées");
    return NextResponse.json({ error: "Tâches non configurées." }, { status: 503 });
  }
  if (!memeSecret(request.headers.get("x-taches-secret") ?? "", attendu)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const origine = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  if (!origine) {
    console.error("[taches] NEXT_PUBLIC_SITE_URL absente : les liens des courriels seraient faux, tâches refusées");
    return NextResponse.json({ error: "Adresse du site non configurée." }, { status: 503 });
  }

  try {
    const bilan = await executerTaches();
    if (!bilan) return NextResponse.json({ ok: true, occupe: true });
    const courriels = await traiterCourriels(origine, COURRIELS_PAR_PASSAGE);
    return NextResponse.json({ ok: true, ...bilan, courriels });
  } catch (erreur) {
    console.error("[taches] passage interrompu :", messageErreur(erreur));
    return NextResponse.json({ error: "Passage interrompu." }, { status: 500 });
  }
}
