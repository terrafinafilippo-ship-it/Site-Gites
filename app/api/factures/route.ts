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
  instantaneFacture,
  mapFactureData,
  type Reservation,
  type FactureContext,
} from '@/lib/montants';
import { chargerReservationAvecGite } from '@/lib/reservations';
import { fmtDateFr, fmtEuro } from '@/lib/format';
import { centimesDepuisNumeric, numericDepuisCentimes } from '@/lib/centimes';
import {
  isDuplicateError,
  isUniqueViolation,
  isUuid,
  messageErreur,
} from '@/lib/route-helpers';
import { chargerLogo } from '@/lib/logo';
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

// Ligne `factures` telle que lue par Drizzle : montant_ttc en TEXTE ("173.00",
// numeric mode "string", converti en centimes par centimesDepuisNumeric au seul
// endroit où il est lu), date_emission en chaîne yyyy-mm-dd (date mode "string").
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
  const logo = chargerLogo(); // null si illisible : la facture sort sans logo

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
  const montantTtc = type === 'acompte' ? montants.acompte : montants.solde; // centimes

  // ── 4 bis. Garde : acompte + solde = total, sinon aucune facture n'est émise ─
  // En centimes entiers cette égalité est exacte par construction ; la garde
  // protège contre une modification future du calcul.
  //
  // Cas A — incohérence de calcul interne sur des montants fraîchement
  // calculés : c'est un bug du code. 500, message technique.
  if (montants.acompte + montants.solde !== montants.totalTtc) {
    return NextResponse.json(
      {
        error:
          `Incohérence de calcul interne : acompte ${montants.acompte} + solde ${montants.solde} ` +
          `≠ total ${montants.totalTtc} (centimes). Facture non émise.`,
      },
      { status: 500 },
    );
  }
  // Cas B — la facture de solde rappelle l'acompte DÉJÀ FACTURÉ (ligne
  // `factures` de l'acompte). Si la réservation a été modifiée depuis, les
  // lignes de la facture de solde ne s'additionneraient plus : ce n'est pas un
  // bug mais une situation métier. 409, avec la marche à suivre.
  if (type === 'solde' && factureAcompte) {
    const acompteFacture = centimesDepuisNumeric(factureAcompte.montant_ttc);
    if (acompteFacture + montants.solde !== montants.totalTtc) {
      return NextResponse.json(
        {
          error:
            `Le montant de la réservation a changé depuis l'émission de la facture d'acompte ` +
            `${factureAcompte.numero} (acompte facturé ${fmtEuro(acompteFacture)}, ` +
            `acompte recalculé ${fmtEuro(montants.acompte)}). Émettez un avoir ou ` +
            `rétablissez le montant d'origine avant de facturer le solde.`,
        },
        { status: 409 },
      );
    }
  }

  // ── 5. Obtenir la ligne facture (existante ou nouvelle via creer_facture) ─
  let facture: FactureRow;

  if (existante) {
    // Ré-émission pour le MÊME numéro (le PDF avait échoué).
    facture = existante;
  } else {
    // Instantané PROVISOIRE : le numéro n'existe pas encore (il est frappé par
    // creer_facture) ; il est complété à l'étape 8 avec le numéro et la date
    // réels, dans la même opération que pdf_url.
    const ctxProvisoire = buildContext(type, resa, montants, factureAcompte, {
      numeroFacture: '', // connu seulement après creer_facture
      dateEmission: fmtDateFr(new Date().toISOString()),
    });
    const donnees = instantaneFacture(mapFactureData(resa, montants, ctxProvisoire));

    // FRONTIÈRE MÉMOIRE → BASE : p_montant_ttc reste un numeric côté SQL (la
    // fonction n'est pas modifiée) ; les centimes sont convertis en texte
    // "173.00" par numericDepuisCentimes.
    // FRONTIÈRE SQL BRUT : creer_facture renvoie un type composite (une ligne
    // `factures` entière), lu avec `select * from creer_facture(...)`. Par ce
    // chemin, date_emission arrive en objet Date : on ne prend ici que l'id,
    // et la ligne est relue juste après par Drizzle, qui applique les
    // conversions déclarées dans db/schema (date → chaîne).
    let idFacture: unknown;
    try {
      const cree = await db.execute<{ id: unknown }>(sql`
        select * from creer_facture(
          ${reservationId}::uuid,
          ${type}::text,
          ${numericDepuisCentimes(montantTtc)}::numeric,
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
            logo,
          })
        : createElement(FactureSoldePDF, {
            data: data as FactureSoldeData,
            logo,
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

  // ── 8. Chemin de stockage + instantané définitif sur la ligne facture ────
  // (On stocke le CHEMIN relatif, pas une URL : les URL signées sont générées
  //  à la demande.) L'instantané `donnees` est mis à jour dans la MÊME
  // opération avec les données exactement rendues : numéro et date d'émission
  // réels (issus de la ligne), montants en centimes, marqueur d'unité.
  try {
    await db
      .update(factures)
      .set({ pdf_url: cheminStorage, donnees: instantaneFacture(data) })
      .where(eq(factures.id, facture.id));
  } catch (e) {
    return NextResponse.json(
      { error: `Mise à jour pdf_url / donnees échouée : ${messageErreur(e)}` },
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
            // FRONTIÈRE BASE → MÉMOIRE : texte numeric → centimes.
            montant: centimesDepuisNumeric(factureAcompte.montant_ttc),
          }
        : undefined,
  };
}
