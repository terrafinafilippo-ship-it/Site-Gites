// DELETE /api/reservations/{id} — le client quitte l'écran de paiement pour
// revenir en arrière : le blocage de ses dates est levé tout de suite, et la
// tentative est supprimée avec ses coordonnées (rien n'a été payé ni émis).
//
// L'identifiant (uuid tiré au hasard, connu du seul navigateur qui a créé la
// tentative) suffit : la seule action permise est d'abandonner SA tentative
// encore en attente. Une réservation engagée n'est jamais supprimée (409).
//
// Réponses : 200 abandonnée · 400 identifiant invalide · 404 inconnue (déjà
// abandonnée, par exemple) · 409 engagée · 500 erreur inattendue.
import { NextResponse } from "next/server";

import { isUuid, messageErreur } from "@/lib/route-helpers";
import { abandonnerTentative } from "@/lib/tunnel";

function reponse(status: number, corps: Record<string, unknown>): NextResponse {
  return NextResponse.json(corps, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, contexte: { params: Promise<{ id: string }> }) {
  const { id } = await contexte.params;
  if (!isUuid(id)) return reponse(400, { code: "ID_INVALIDE", error: "Identifiant invalide." });

  try {
    const resultat = await abandonnerTentative(id);
    if (resultat === "ABSENTE") return reponse(404, { code: "ABSENTE", error: "Réservation introuvable." });
    if (resultat === "ENGAGEE") {
      return reponse(409, { code: "ENGAGEE", error: "Cette réservation est engagée : elle ne peut pas être abandonnée ici." });
    }
    return reponse(200, { ok: true });
  } catch (erreur) {
    console.error(`[api/reservations/${id}] abandon impossible :`, messageErreur(erreur));
    return reponse(500, { code: "ERREUR", error: "Erreur inattendue." });
  }
}
