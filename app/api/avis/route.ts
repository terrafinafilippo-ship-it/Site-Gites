// POST /api/avis — dépôt de l'avis d'un client (Phase 6, D-40), depuis la page
// /avis/{jeton}. Corps : { jeton, note, commentaire }.
//
// Le jeton est celui du lien reçu après le départ (lib/avis.ts) : sans lui,
// rien ne s'écrit. L'avis est publié tout de suite (revalidateTag : la fiche
// du gîte le montre au chargement suivant) ; l'alerte aux propriétaires part
// après la réponse.
//
// Réponses : 200 { ok, slug } publié · 400 saisie refusée { champ } ·
// 404 lien non valable ou expiré · 409 avis déjà déposé · 503 base
// indisponible (journalisée comme une panne).
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { deposerAvis } from "@/lib/avis";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { messageErreur, resolveSiteOrigin } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SANS_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  let corps: { jeton?: unknown; note?: unknown; commentaire?: unknown } | null;
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: SANS_CACHE });
  }
  if (!corps || typeof corps.jeton !== "string") {
    return NextResponse.json({ ok: false }, { status: 404, headers: SANS_CACHE });
  }

  try {
    const issue = await deposerAvis(corps.jeton, { note: corps.note, commentaire: corps.commentaire });
    switch (issue.issue) {
      case "publie":
        revalidateTag("gites");
        after(() => traiterCourriels(resolveSiteOrigin(request)));
        return NextResponse.json({ ok: true, slug: issue.slug }, { headers: SANS_CACHE });
      case "refus":
        return NextResponse.json({ ok: false, champ: issue.champ }, { status: 400, headers: SANS_CACHE });
      case "deja":
        return NextResponse.json({ ok: false }, { status: 409, headers: SANS_CACHE });
      case "invalide":
        return NextResponse.json({ ok: false }, { status: 404, headers: SANS_CACHE });
    }
  } catch (erreur) {
    console.error("[avis] dépôt impossible :", messageErreur(erreur));
    return NextResponse.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }
}
