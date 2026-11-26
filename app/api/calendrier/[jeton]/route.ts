// GET /api/calendrier/{jeton}.ics — LE LIEN DU SITE donné à une plateforme
// (Phase 7, D-44 ; lib/synchronisation.ts).
//
// Les nuits prises du gîte, au format iCal, sans aucun nom : « Indisponible ».
// Le jeton est secret (le lien dit quand le gîte est vide) ; il se lit dans la
// fiche du gîte, au back-office. Jeton inconnu : 404, sans dire pourquoi.
// Jamais mis en cache : une plateforme doit lire l'état du moment.
import { messageErreur } from "@/lib/route-helpers";
import { calendrierExporte } from "@/lib/synchronisation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexte: { params: Promise<{ jeton: string }> }): Promise<Response> {
  const { jeton } = await contexte.params;
  try {
    const ical = await calendrierExporte(jeton.replace(/\.ics$/, ""));
    if (ical === null) return new Response("Calendrier introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="calendrier.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (erreur) {
    console.error("[api/calendrier] lecture impossible :", messageErreur(erreur));
    return new Response("Calendrier indisponible.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
