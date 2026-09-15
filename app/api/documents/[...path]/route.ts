// GET /api/documents/{chemin}?token=...&expires=...
//
// Seule porte d'accès aux PDF stockés (voir lib/storage.ts). Les fichiers ne
// sont jamais exposés directement : cette route
//   1. refuse tout chemin contenant ".." ou un segment hors motif autorisé
//      (protection contre la traversée de répertoire, qui permettrait de lire
//      n'importe quel fichier du serveur) ;
//   2. vérifie l'expiration puis la signature HMAC du lien ;
//   3. renvoie le fichier en flux avec le bon Content-Type.
//
// Codes de retour : 400 chemin invalide, 403 lien expiré ou falsifié,
// 404 fichier absent, 500 configuration manquante.
import { NextResponse } from "next/server";

import { getStorage, isStorageError, validerChemin, verifierSignature } from "@/lib/storage";

// Lecture du disque et crypto Node : runtime Node obligatoire, jamais mis en cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
};

function refus(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: Request,
  contexte: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await contexte.params;

  // ── 1. Chemin ────────────────────────────────────────────────────────────
  let chemin: string;
  try {
    chemin = validerChemin((segments ?? []).join("/"));
  } catch {
    return refus(400, "Chemin de document invalide.");
  }

  // ── 2. Expiration puis signature ─────────────────────────────────────────
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const expiresBrut = url.searchParams.get("expires") ?? "";
  const expires = /^\d{1,12}$/.test(expiresBrut) ? Number(expiresBrut) : Number.NaN;

  if (!token || !Number.isSafeInteger(expires)) {
    return refus(403, "Lien invalide.");
  }
  if (expires < Math.floor(Date.now() / 1000)) {
    return refus(403, "Lien expiré.");
  }

  let signatureValide: boolean;
  try {
    signatureValide = verifierSignature(chemin, expires, token);
  } catch (erreur) {
    if (isStorageError(erreur, "CONFIGURATION")) {
      return refus(500, "Configuration du stockage incomplète.");
    }
    throw erreur;
  }
  if (!signatureValide) {
    return refus(403, "Lien invalide.");
  }

  // ── 3. Fichier en flux ───────────────────────────────────────────────────
  let flux: ReadableStream<Uint8Array>;
  try {
    flux = await getStorage().readStream(chemin);
  } catch (erreur) {
    if (isStorageError(erreur, "INTROUVABLE")) {
      return refus(404, "Document introuvable.");
    }
    throw erreur;
  }

  const nomFichier = chemin.slice(chemin.lastIndexOf("/") + 1);
  const extension = nomFichier.slice(nomFichier.lastIndexOf(".")).toLowerCase();

  return new Response(flux, {
    status: 200,
    headers: {
      "Content-Type": TYPES_MIME[extension] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${nomFichier}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
