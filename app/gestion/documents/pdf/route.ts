// GET /gestion/documents/pdf?sorte=contrat|facture&id=… (Phase 5, lot 4) :
// « Ouvrir le PDF » depuis le back-office. Session exigée ; le PDF est servi
// par la seule porte des documents (app/api/documents), par un lien signé de
// cinq minutes demandé au moment du clic — une page restée ouverte ne garde
// pas de lien périmé, et aucun lien durable ne traîne dans la page.
import { NextResponse } from "next/server";

import { cheminDocument } from "@/lib/gestion/documents";
import { getStorage } from "@/lib/storage";

import { exigerSession, origine } from "../../outils";

export const dynamic = "force-dynamic";

const DUREE_LIEN_SECONDES = 5 * 60;

export async function GET(request: Request): Promise<Response> {
  await exigerSession();
  const url = new URL(request.url);
  const sorte = url.searchParams.get("sorte");
  const id = url.searchParams.get("id") ?? "";
  if (sorte !== "contrat" && sorte !== "facture") return new NextResponse("Document inconnu.", { status: 404 });
  const chemin = await cheminDocument(sorte, id);
  if (!chemin) return new NextResponse("Ce document n'a pas de PDF.", { status: 404 });
  const lien = await getStorage().getSignedUrl(chemin, DUREE_LIEN_SECONDES);
  return NextResponse.redirect(new URL(lien, await origine()), { status: 303, headers: { "Cache-Control": "no-store" } });
}
