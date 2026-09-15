import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, factures } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import { verifierSecret } from '@/lib/auth';
import {
  calculerMontants,
  mapFactureData,
  type Reservation,
  type FactureContext,
} from '@/lib/montants';
import { chargerReservationAvecGite } from '@/lib/reservations';
import { fmtDateFr } from '@/lib/format';
import {
  isDuplicateError,
  isUniqueViolation,
  isUuid,
  messageErreur,
  resolveLogoUrl,
} from '@/lib/route-helpers';
import {
  FactureAcomptePDF,
  type FactureAcompteData,
} from '@/components/pdf/FactureAcomptePDF';
import {
  FactureSoldePDF,
  type FactureSoldeData,
} from '@/components/pdf/FactureSoldePDF';

// react-pdf utilise fontkit/zlib → runtime Node obligatoire (pas Edge).
export const runtime = 'nodejs';
// Émission de facture = effet de bord à numérotation légale : jamais mis en cache.
export const dynamic = 'force-dynamic';

// Durée de validité de l'URL signée renvoyée pour test/affichage (1 h).
const SIGNED_URL_TTL = 60 * 60;

type FactureType = 'acompte' | 'solde';

// Type enregistré dans la table `documents` (registre back-office).
const docType = (t: FactureType) => (t === 'acompte' ? 'facture_acompte' : 'facture_solde');

// Ligne `factures` telle que lue par Drizzle : montant_ttc en nombre (numeric
// mode "number"), date_emission en chaîne yyyy-mm-dd (date mode "string").
type FactureRow = typeof factures.$inferSelect;

/**
 * POST /api/factures
 * En-tête : x-service-secret = DOCUMENT_SERVICE_SECRET
 * Body : { reservationId: string, type: 'acompte' | 'solde' }
 *
 * Émet (ou ré-émet) la facture correspondante :
 *   1. La facture EXISTE dès que la ligne SQL est validée (fonction creer_facture).
 *   2. Le PDF est un simple rendu de cette ligne ; en cas d'échec on ré-émet
 *      pour le MÊME numéro (idempotent), aucun numéro construit côté JS.
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

  if (!isUuid(reservationId) || (type !== 'acompte' && type !== 'solde')) {
    return NextResponse.json(
      { error: "Paramètres requis : reservationId (uuid) et type ('acompte' | 'solde')." },
      { status: 400 },
    );
  }

  const db = getDb();
  const storage = getStorage();
  const logoUrl = resolveLogoUrl(request);

  // ── 2. Réservation (+ gîte joint) ───────────────────────────────────────
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) {
    return NextResponse.json(
      { error: `Réservation introuvable : ${reservationId}` },
      { status: 404 },
    );
  }

  // ── 3. Facture d'acompte de référence (obligatoire pour un solde) ────────
  let factureAcompte: FactureRow | null = null;
  if (type === 'solde') {
    factureAcompte = await trouverFacture(db, reservationId, 'acompte');
    if (!factureAcompte) {
      return NextResponse.json(
        { error: "Aucune facture d'acompte pour cette réservation : émettez l'acompte avant le solde." },
        { status: 409 },
      );
    }
  }

  // ── 4. Idempotence : réutiliser une facture déjà émise ──────────────────
  // Une facture de ce type peut déjà exister (PDF échoué → pdf_url null, ou
  // déjà généré → pdf_url présent). Dans les deux cas on NE frappe PAS un
  // nouveau numéro.
  const existante = await trouverFacture(db, reservationId, type);

  if (existante?.pdf_url) {
    // Déjà émise ET rendue : rien à refaire. On renvoie le chemin de stockage et
    // une URL signée fraîche (les fichiers ne sont jamais servis directement).
    const chemin = `factures/${existante.numero}.pdf`;
    return NextResponse.json({
      numero: existante.numero,
      type,
      chemin_storage: chemin,
      url: await storage.getSignedUrl(chemin, SIGNED_URL_TTL),
    });
  }

  const montants = calculerMontants(resa);
  const montantTtc = type === 'acompte' ? montants.acompte : montants.solde;

  // ── 5. Obtenir la ligne facture (existante ou nouvelle via creer_facture) ─
  let facture: FactureRow;

  if (existante) {
    // Ré-émission pour le MÊME numéro (le PDF avait échoué).
    facture = existante;
  } else {
    const ctxProvisoire = buildContext(type, resa, montants, factureAcompte, {
      numeroFacture: '', // connu seulement après creer_facture
      dateEmission: fmtDateFr(new Date().toISOString()),
    });
    const donnees = mapFactureData(resa, montants, ctxProvisoire);

    // FRONTIÈRE SQL BRUT : creer_facture renvoie un type composite (une ligne
    // `factures` entière), lu avec `select * from creer_facture(...)`. Par ce
    // chemin, le driver pg renvoie montant_ttc en TEXTE et date_emission en
    // objet Date : on ne prend ici que l'id, et la ligne est relue juste après
    // par Drizzle, qui applique les conversions déclarées dans db/schema
    // (numeric → number, date → chaîne). Aucune conversion de montant n'est
    // faite dans cette route.
    let idFacture: unknown;
    try {
      const cree = await db.execute<{ id: unknown }>(sql`
        select * from creer_facture(
          ${reservationId}::uuid,
          ${type}::text,
          ${montantTtc}::numeric,
          ${JSON.stringify(donnees)}::jsonb,
          ${factureAcompte?.id ?? null}::uuid
        )
      `);
      idFacture = cree.rows[0]?.id;
    } catch (e) {
      return NextResponse.json(
        { error: `Création de la facture échouée : ${messageErreur(e)}` },
        { status: 500 },
      );
    }
    if (!isUuid(idFacture)) {
      return NextResponse.json(
        { error: 'Création de la facture échouée : identifiant inattendu.' },
        { status: 500 },
      );
    }

    const [relue] = await db.select().from(factures).where(eq(factures.id, idFacture)).limit(1);
    if (!relue) {
      return NextResponse.json(
        { error: `Facture ${idFacture} créée mais introuvable en relecture.` },
        { status: 500 },
      );
    }
    facture = relue;
  }

  // ── 6. Rendu du PDF (numéro/date AUTORITAIRES = colonnes de la ligne) ────
  const ctx = buildContext(type, resa, montants, factureAcompte, {
    numeroFacture: facture.numero,
    dateEmission: fmtDateFr(facture.date_emission),
  });
  const data = mapFactureData(resa, montants, ctx);

  let pdfBuffer: Buffer;
  try {
    const element =
      type === 'acompte'
        ? createElement(FactureAcomptePDF, {
            data: data as FactureAcompteData,
            logoUrl,
          })
        : createElement(FactureSoldePDF, {
            data: data as FactureSoldeData,
            logoUrl,
          });
    // Les deux composants renvoient un <Document> ; createElement perd cette
    // information de type, on caste vers la signature attendue par renderToBuffer.
    pdfBuffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  } catch (e) {
    // La facture EXISTE déjà en base ; un POST ultérieur ré-émettra le même numéro.
    return NextResponse.json(
      {
        error: `Rendu PDF échoué (la facture ${facture.numero} reste émise, ré-essayez) : ${messageErreur(e)}`,
      },
      { status: 502 },
    );
  }

  // ── 7. Écriture du fichier (une facture émise ne s'écrase jamais) ────────
  const cheminStorage = `factures/${facture.numero}.pdf`;
  try {
    await storage.upload(cheminStorage, pdfBuffer, { contentType: 'application/pdf' });
  } catch (e) {
    // Fichier déjà présent (ré-émission après écriture réussie mais étape
    // suivante ratée) : on tolère le doublon, le fichier émis fait foi.
    if (!isDuplicateError(e)) {
      return NextResponse.json(
        { error: `Écriture du PDF échouée : ${messageErreur(e)}` },
        { status: 502 },
      );
    }
  }

  // ── 8. Mémoriser le chemin de stockage sur la ligne facture ──────────────
  // (On stocke le CHEMIN relatif, pas une URL : les URL signées sont générées
  //  à la demande.)
  try {
    await db.update(factures).set({ pdf_url: cheminStorage }).where(eq(factures.id, facture.id));
  } catch (e) {
    return NextResponse.json(
      { error: `Mise à jour pdf_url échouée : ${messageErreur(e)}` },
      { status: 500 },
    );
  }

  // ── 9. Enregistrer dans le registre `documents` (back-office) ────────────
  try {
    await db.insert(documents).values({
      reservation_id: reservationId,
      type: docType(type),
      numero: facture.numero,
      url_pdf: cheminStorage,
      statut: 'genere',
    });
  } catch (e) {
    // Doublon (ré-émission idempotente ou course webhook) → toléré.
    if (!isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Enregistrement du document échoué : ${messageErreur(e)}` },
        { status: 500 },
      );
    }
  }

  // ── 10. URL signée courte pour test/affichage immédiat ───────────────────
  return NextResponse.json({
    numero: facture.numero,
    type,
    chemin_storage: cheminStorage,
    url: await storage.getSignedUrl(cheminStorage, SIGNED_URL_TTL),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function trouverFacture(
  db: ReturnType<typeof getDb>,
  reservationId: string,
  type: FactureType,
): Promise<FactureRow | null> {
  const lignes = await db
    .select()
    .from(factures)
    .where(and(eq(factures.reservation_id, reservationId), eq(factures.type, type)))
    .limit(1);
  return lignes[0] ?? null;
}

function buildContext(
  type: FactureType,
  resa: Reservation,
  montants: ReturnType<typeof calculerMontants>,
  factureAcompte: FactureRow | null,
  override: { numeroFacture: string; dateEmission: string },
): FactureContext {
  // Date d'encaissement affichée : faute de timestamp PSP distinct, on utilise
  // la date d'émission (les deux coïncident pour un encaissement immédiat).
  return {
    type,
    numeroFacture: override.numeroFacture,
    dateEmission: override.dateEmission,
    datePaiement: override.dateEmission,
    factureAcompte:
      type === 'solde' && factureAcompte
        ? {
            numero: factureAcompte.numero,
            // date_paiement_acompte est un timestamptz (objet Date côté JS).
            datePaiement: resa.date_paiement_acompte
              ? fmtDateFr(resa.date_paiement_acompte.toISOString())
              : fmtDateFr(factureAcompte.date_emission),
            montant: factureAcompte.montant_ttc,
          }
        : undefined,
  };
}
