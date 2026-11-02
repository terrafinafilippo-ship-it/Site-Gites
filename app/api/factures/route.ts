import { NextResponse } from 'next/server';

import { verifierSecret } from '@/lib/auth';
import { emettreFacture } from '@/lib/factures';
import { getStorage } from '@/lib/storage';
import { isUuid } from '@/lib/route-helpers';
import { TYPES_FACTURE, type TypeFacture } from '@/db/schema';

// react-pdf utilise fontkit/zlib → runtime Node obligatoire (pas Edge).
export const runtime = 'nodejs';
// Émission de facture = effet de bord à numérotation légale : jamais mis en cache.
export const dynamic = 'force-dynamic';

// Durée de validité de l'URL signée renvoyée pour test/affichage (1 h).
const SIGNED_URL_TTL = 60 * 60;

const estTypeFacture = (v: unknown): v is TypeFacture =>
  typeof v === 'string' && (TYPES_FACTURE as readonly string[]).includes(v);

/**
 * POST /api/factures
 * En-tête : x-service-secret = DOCUMENT_SERVICE_SECRET
 * Body : { reservationId: string, type: 'acompte' | 'solde' | 'total' }
 *
 * Émet (ou ré-émet) la facture correspondante (lib/factures.ts) :
 *   1. La facture EXISTE dès que la ligne SQL est validée (fonction creer_facture).
 *   2. Le PDF est un simple rendu de cette ligne ; en cas d'échec on ré-émet
 *      pour le MÊME numéro (idempotent), aucun numéro construit côté JS.
 * Depuis la Phase 4, le paiement constaté émet aussi sa facture tout seul
 * (courriel « facture ») : un appel ici ensuite renvoie la même facture.
 */
export async function POST(request: Request) {
  // ── 0. Auth service-à-service ────────────────────────────────────────────
  const refus = verifierSecret(request);
  if (refus) return refus;

  // ── 1. Validation du corps ──────────────────────────────────────────────
  let body: { reservationId?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const reservationId = body.reservationId;
  const type = body.type;

  if (!isUuid(reservationId) || !estTypeFacture(type)) {
    return NextResponse.json(
      { error: "Paramètres requis : reservationId (uuid) et type ('acompte' | 'solde' | 'total')." },
      { status: 400 },
    );
  }

  // ── 2. Émission ─────────────────────────────────────────────────────────
  const resultat = await emettreFacture(reservationId, type);
  if (!resultat.ok) return NextResponse.json({ error: resultat.message }, { status: resultat.status });

  // ── 3. URL signée courte pour test/affichage immédiat ───────────────────
  // (les fichiers ne sont jamais servis directement)
  const { numero, chemin } = resultat.facture;
  return NextResponse.json({
    numero,
    type,
    chemin_storage: chemin,
    url: await getStorage().getSignedUrl(chemin, SIGNED_URL_TTL),
  });
}
