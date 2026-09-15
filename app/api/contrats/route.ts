import { createElement } from 'react';
import { randomBytes } from 'crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, reservations } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import { verifierSecret } from '@/lib/auth';
import { calculerMontants, mapContratData } from '@/lib/montants';
import { chargerReservationAvecGite, type Executeur } from '@/lib/reservations';
import { fmtDateFr } from '@/lib/format';
import {
  buildSigningUrl,
  isDuplicateError,
  isUniqueViolation,
  isUuid,
  messageErreur,
} from '@/lib/route-helpers';
import { chargerLogo } from '@/lib/logo';
import { ContratPDF } from '@/components/pdf/ContratPDF';

// react-pdf utilise fontkit/zlib → runtime Node obligatoire (pas Edge).
export const runtime = 'nodejs';
// Émission de contrat = effet de bord (frappe d'un numéro) : jamais mis en cache.
export const dynamic = 'force-dynamic';

const DOCUMENT_TYPE = 'contrat_location';
const TEMPLATE_VERSION = 'v1';
// Le lien de signature reste valable 30 jours.
const TOKEN_TTL_JOURS = 30;

// Sous-ensemble de la ligne `documents` renvoyé à l'appelant.
interface DocumentRow {
  id: string;
  numero: string;
  token: string | null;
}

/**
 * Échec d'une étape À L'INTÉRIEUR de la transaction : la lever annule tout
 * (ligne documents, numéro rendu au compteur, numero_contrat non écrit) et
 * l'appelant reçoit le statut HTTP indiqué.
 */
class EchecEmission extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EchecEmission';
  }
}

/**
 * POST /api/contrats
 * En-tête : x-service-secret = DOCUMENT_SERVICE_SECRET
 * Body : { reservation_id: string }
 *
 * Génère le contrat PDF NON signé, l'écrit dans le stockage, enregistre une
 * ligne `documents` (statut 'genere') avec un jeton de signature, recopie le
 * numéro sur `reservations.numero_contrat` et renvoie le signing_url.
 *
 * Idempotent : un contrat déjà émis pour la réservation est renvoyé tel quel
 * (même numéro, même jeton), sans nouveau fichier ni nouveau numéro.
 *
 * Numéro, ligne documents et numero_contrat sont écrits dans UNE transaction :
 * un échec entre deux écritures ne peut pas laisser un numéro légal consommé
 * sur un contrat que la réservation ignore.
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

  const db = getDb();

  // ── 3. Idempotence : contrat déjà émis ? ─────────────────────────────────
  const existant = await trouverContratExistant(db, reservationId);
  if (existant) return reponseContrat(request, existant);

  // ── 4. Réservation (source de vérité ; gîte joint par lib/reservations) ──
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) {
    return NextResponse.json(
      { error: `Réservation introuvable : ${reservationId}` },
      { status: 404 },
    );
  }

  const logo = chargerLogo(); // null si illisible : le contrat sort sans logo
  const token = randomBytes(24).toString('base64url'); // 32 caractères URL-safe
  const tokenExpireAt = new Date(Date.now() + TOKEN_TTL_JOURS * 24 * 60 * 60 * 1000);
  const dateEmission = fmtDateFr(new Date().toISOString());

  // ── 5 → 9. Transaction : numéro, ligne documents, PDF, numero_contrat ────
  try {
    const doc = await db.transaction(async (tx) => {
      // 5. Numéro de contrat (la ligne compteur reste verrouillée jusqu'au
      //    commit : deux émissions simultanées se sérialisent ici).
      const numero = await prochainNumeroContrat(tx);
      const cheminStorage = `contrats/${reservationId}/${numero}.pdf`;

      // 6. Ligne documents AVANT le fichier : l'index unique (reservation_id,
      //    type) arrête une émission concurrente ici, avant qu'un fichier ne
      //    soit écrit, et son numéro est rendu au compteur par le rollback.
      const [insere] = await tx
        .insert(documents)
        .values({
          reservation_id: reservationId,
          type: DOCUMENT_TYPE,
          numero,
          url_pdf: cheminStorage,
          statut: 'genere',
          template_version: TEMPLATE_VERSION,
          token,
          token_expire_at: tokenExpireAt,
        })
        .returning({ id: documents.id, numero: documents.numero, token: documents.token });

      // 7. Rendu du PDF NON signé
      const montants = calculerMontants(resa);
      const data = mapContratData(resa, montants, { numeroContrat: numero, dateEmission });

      let pdfBuffer: Buffer;
      try {
        const element = createElement(ContratPDF, { data, logo });
        pdfBuffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
      } catch (e) {
        throw new EchecEmission(502, `Rendu PDF échoué : ${messageErreur(e)}`);
      }

      // 8. Écriture du fichier (jamais écrasé). Un fichier déjà présent est le
      //    reliquat d'une tentative annulée après l'écriture (son numéro avait
      //    été rendu au compteur, il est donc réattribué ici) : il fait foi.
      try {
        await getStorage().upload(cheminStorage, pdfBuffer, { contentType: 'application/pdf' });
      } catch (e) {
        if (!isDuplicateError(e)) {
          throw new EchecEmission(502, `Écriture du PDF échouée : ${messageErreur(e)}`);
        }
      }

      // 9. Numéro recopié sur la réservation, dans la MÊME transaction.
      const maj = await tx
        .update(reservations)
        .set({ numero_contrat: numero })
        .where(eq(reservations.id, reservationId))
        .returning({ id: reservations.id });
      if (maj.length !== 1) {
        throw new EchecEmission(
          500,
          "Réservation introuvable au moment de l'écriture du numéro de contrat.",
        );
      }

      return insere;
    });

    return reponseContrat(request, doc);
  } catch (e) {
    if (e instanceof EchecEmission) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // Course (webhook en double) : un autre appel a inséré le contrat entre
    // notre contrôle d'idempotence et notre insert → on renvoie l'existant.
    if (isUniqueViolation(e)) {
      const dejaLa = await trouverContratExistant(db, reservationId);
      if (dejaLa) return reponseContrat(request, dejaLa);
    }
    return NextResponse.json(
      { error: `Émission du contrat échouée : ${messageErreur(e)}` },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function trouverContratExistant(
  executeur: Executeur,
  reservationId: string,
): Promise<DocumentRow | null> {
  const lignes = await executeur
    .select({ id: documents.id, numero: documents.numero, token: documents.token })
    .from(documents)
    .where(and(eq(documents.reservation_id, reservationId), eq(documents.type, DOCUMENT_TYPE)))
    .limit(1);
  return lignes[0] ?? null;
}

/**
 * prochain_numero('CTR', année) renvoie la CHAÎNE formatée 'CTR-AAAA-NNN'
 * (migration 0001). L'année est celle de Paris, comme pour les factures.
 */
async function prochainNumeroContrat(tx: Executeur): Promise<string> {
  const annee = anneeParis();
  const resultat = await tx.execute<{ numero: unknown }>(
    sql`select prochain_numero('CTR', ${annee}::int) as numero`,
  );
  const numero = resultat.rows[0]?.numero;
  if (typeof numero !== 'string' || !/^CTR-\d{4}-\d{3,}$/.test(numero)) {
    throw new EchecEmission(
      500,
      `Numérotation contrat échouée : valeur inattendue (${String(numero)}).`,
    );
  }
  return numero;
}

function anneeParis(): number {
  return Number(
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(
      new Date(),
    ),
  );
}

function reponseContrat(request: Request, doc: DocumentRow) {
  return NextResponse.json({
    document_id: doc.id,
    numero: doc.numero,
    signing_url: doc.token ? buildSigningUrl(request, doc.token) : null,
  });
}
