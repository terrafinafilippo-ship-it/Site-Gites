import { NextResponse } from 'next/server';

import { verifierSecret } from '@/lib/auth';
import { emettreContrat } from '@/lib/contrat';
import { buildSigningUrl, isUuid } from '@/lib/route-helpers';

// react-pdf utilise fontkit/zlib → runtime Node obligatoire (pas Edge).
export const runtime = 'nodejs';
// Émission de contrat = effet de bord (frappe d'un numéro) : jamais mis en cache.
export const dynamic = 'force-dynamic';

/**
 * POST /api/contrats
 * En-tête : x-service-secret = DOCUMENT_SERVICE_SECRET
 * Body : { reservation_id: string }
 *
 * Génère le contrat PDF NON signé, l'écrit dans le stockage, enregistre une
 * ligne `documents` (statut 'genere') avec un jeton de signature, recopie le
 * numéro sur `reservations.numero_contrat` et renvoie le signing_url.
 *
 * L'émission elle-même est dans lib/contrat.ts (le site l'appelle aussi après
 * le paiement) : idempotente, en UNE transaction. Une réservation payée en
 * totalité est refusée (409, D-20).
 */
export async function POST(request: Request) {
  // ── 1. Auth (seul un appelant serveur peut créer un contrat) ─────────────
  const refus = verifierSecret(request);
  if (refus) return refus;

  // ── 2. Validation du corps ───────────────────────────────────────────────
  let body: { reservation_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const reservationId = body.reservation_id;
  if (!isUuid(reservationId)) {
    return NextResponse.json(
      { error: 'Paramètre requis : reservation_id (uuid).' },
      { status: 400 },
    );
  }

  // ── 3. Émission (ou contrat déjà émis) ───────────────────────────────────
  const resultat = await emettreContrat(reservationId);
  if (!resultat.ok) {
    return NextResponse.json({ error: resultat.message }, { status: resultat.status });
  }
  const doc = resultat.contrat;
  return NextResponse.json({
    document_id: doc.id,
    numero: doc.numero,
    signing_url: doc.token ? buildSigningUrl(request, doc.token) : null,
  });
}
