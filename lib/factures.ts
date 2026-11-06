// ÉMISSION D'UNE FACTURE (acompte, solde, ou total d'un séjour payé en une
// fois) : la ligne légale, puis son PDF.
//
// Déplacée de app/api/factures/route.ts en Phase 4 (lot 1) pour que le
// paiement constaté puisse émettre sa facture tout seul (courriel « facture »,
// lib/courriels-envoi.ts) ; la route l'appelle toujours, inchangée pour ses
// appelants.
//
//   1. La facture EXISTE dès que la ligne SQL est validée (fonction
//      creer_facture, qui frappe le numéro dans la même transaction).
//   2. Le PDF est un simple rendu de cette ligne ; en cas d'échec on ré-émet
//      pour le MÊME numéro (idempotent), aucun numéro construit côté JS.
//   3. Une seule facture de chaque type par réservation (index unique,
//      migration 0009) : deux émissions simultanées ne frappent pas deux
//      numéros ; la seconde relit la facture de la première.
//
// Charge le moteur PDF : les scripts de contrôle (tsx) ne savent pas le
// charger, ils remplacent l'émetteur (lib/courriels-envoi.ts).
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, factures, paiements, type TypeFacture } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import {
  calculerMontants,
  instantaneFacture,
  mapFactureData,
  paiementImprime,
  type Reservation,
  type FactureContext,
} from '@/lib/montants';
import { chargerReservationAvecGite, type Executeur } from '@/lib/reservations';
import { aujourdhuiParis } from '@/lib/dates-civiles';
import { fmtDateFr, fmtEuro } from '@/lib/format';
import { centimesDepuisNumeric, numericDepuisCentimes } from '@/lib/centimes';
import { isDuplicateError, isUniqueViolation, isUuid, messageErreur } from '@/lib/route-helpers';
import { chargerLogo } from '@/lib/logo';
import { FactureAcomptePDF, type FactureAcompteData } from '@/components/pdf/FactureAcomptePDF';
import { FactureSoldePDF, type FactureSoldeData } from '@/components/pdf/FactureSoldePDF';
import { FactureTotalPDF, type FactureTotalData } from '@/components/pdf/FactureTotalPDF';

// Type enregistré dans la table `documents` (registre back-office).
const DOC_TYPE: Record<TypeFacture, string> = {
  acompte: 'facture_acompte',
  solde: 'facture_solde',
  total: 'facture_total',
};

// Ligne `factures` telle que lue par Drizzle : montant_ttc en TEXTE ("173.00",
// numeric mode "string", converti en centimes par centimesDepuisNumeric au seul
// endroit où il est lu), date_emission en chaîne yyyy-mm-dd (date mode "string").
type FactureRow = typeof factures.$inferSelect;

export interface FactureEmise {
  numero: string;
  type: TypeFacture;
  /** Centimes. */
  montant: number;
  /** Chemin relatif dans le stockage (factures/{numero}.pdf). */
  chemin: string;
}

/** `status` : le code HTTP que la route renvoie. */
export type ResultatFacture = { ok: true; facture: FactureEmise } | { ok: false; status: number; message: string };

const refus = (status: number, message: string): ResultatFacture => ({ ok: false, status, message });

/** Émet (ou ré-émet) la facture `type` de la réservation. Ne lève pas : les erreurs sont dans le résultat. */
export async function emettreFacture(reservationId: string, type: TypeFacture): Promise<ResultatFacture> {
  if (!isUuid(reservationId)) return refus(400, `Identifiant de réservation invalide : ${reservationId}`);
  const db = getDb();
  const storage = getStorage();

  // ── 1. Réservation (+ gîte joint) ───────────────────────────────────────
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return refus(404, `Réservation introuvable : ${reservationId}`);

  // Séjour payé en une fois (D-20, D-27) : une seule facture, « total »
  // (D-29). Sinon : acompte, puis solde.
  if (resa.paiement_integral && type !== 'total') {
    return refus(
      409,
      "Réservation payée en totalité : ni facture d'acompte ni facture de solde, mais une facture unique (type 'total'). Aucune facture n'est émise.",
    );
  }
  if (!resa.paiement_integral && type === 'total') {
    return refus(
      409,
      "Réservation payée en deux fois : facture d'acompte puis facture de solde, pas de facture 'total'. Aucune facture n'est émise.",
    );
  }

  // ── 2. Facture d'acompte de référence (obligatoire pour un solde) ────────
  let factureAcompte: FactureRow | null = null;
  if (type === 'solde') {
    factureAcompte = await trouverFacture(db, reservationId, 'acompte');
    if (!factureAcompte) {
      return refus(409, "Aucune facture d'acompte pour cette réservation : émettez l'acompte avant le solde.");
    }
  }

  // ── 3. Idempotence : réutiliser une facture déjà émise ──────────────────
  // Une facture de ce type peut déjà exister (PDF échoué → pdf_url null, ou
  // déjà généré → pdf_url présent). Dans les deux cas on NE frappe PAS un
  // nouveau numéro.
  let existante = await trouverFacture(db, reservationId, type);
  if (existante?.pdf_url) return { ok: true, facture: emise(existante) };

  const montants = calculerMontants(resa);
  // Paiement intégral : calculerMontants donne acompte = total, solde = 0.
  const montantTtc = type === 'solde' ? montants.solde : type === 'total' ? montants.totalTtc : montants.acompte;

  // ── 3 bis. Garde : acompte + solde = total, sinon aucune facture n'est émise ─
  // En centimes entiers cette égalité est exacte par construction ; la garde
  // protège contre une modification future du calcul.
  //
  // Cas A — incohérence de calcul interne sur des montants fraîchement
  // calculés : c'est un bug du code. 500, message technique.
  if (montants.acompte + montants.solde !== montants.totalTtc) {
    return refus(
      500,
      `Incohérence de calcul interne : acompte ${montants.acompte} + solde ${montants.solde} ` +
        `≠ total ${montants.totalTtc} (centimes). Facture non émise.`,
    );
  }
  // Cas B — la facture de solde rappelle l'acompte DÉJÀ FACTURÉ (ligne
  // `factures` de l'acompte). Si la réservation a été modifiée depuis, les
  // lignes de la facture de solde ne s'additionneraient plus : ce n'est pas un
  // bug mais une situation métier. 409, avec la marche à suivre.
  if (type === 'solde' && factureAcompte) {
    const acompteFacture = centimesDepuisNumeric(factureAcompte.montant_ttc);
    if (acompteFacture + montants.solde !== montants.totalTtc) {
      return refus(
        409,
        `Le montant de la réservation a changé depuis l'émission de la facture d'acompte ` +
          `${factureAcompte.numero} (acompte facturé ${fmtEuro(acompteFacture)}, ` +
          `acompte recalculé ${fmtEuro(montants.acompte)}). Émettez un avoir ou ` +
          `rétablissez le montant d'origine avant de facturer le solde.`,
      );
    }
  }

  const paiement = await paiementFacture(db, reservationId, type);

  // ── 4. Obtenir la ligne facture (existante ou nouvelle via creer_facture) ─
  let facture: FactureRow;
  if (existante) {
    // Ré-émission pour le MÊME numéro (le PDF avait échoué).
    facture = existante;
  } else {
    // Instantané PROVISOIRE : le numéro n'existe pas encore (il est frappé par
    // creer_facture) ; il est complété à l'étape 7 avec le numéro et la date
    // réels, dans la même opération que pdf_url.
    const ctxProvisoire = contexte(type, resa, factureAcompte, paiement, {
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
      // Émise au même instant par un autre appel (index unique) : son
      // numéro fait foi, et l'incrément du compteur s'est annulé ici.
      if (isUniqueViolation(e)) existante = await trouverFacture(db, reservationId, type);
      if (!existante) return refus(500, `Création de la facture échouée : ${messageErreur(e)}`);
      idFacture = existante.id;
    }
    if (!isUuid(idFacture)) return refus(500, 'Création de la facture échouée : identifiant inattendu.');

    const [relue] = await db.select().from(factures).where(eq(factures.id, idFacture)).limit(1);
    if (!relue) return refus(500, `Facture ${idFacture} créée mais introuvable en relecture.`);
    if (relue.pdf_url) return { ok: true, facture: emise(relue) };
    facture = relue;
  }

  // ── 5. Rendu du PDF (numéro/date AUTORITAIRES = colonnes de la ligne) ────
  const ctx = contexte(type, resa, factureAcompte, paiement, {
    numeroFacture: facture.numero,
    dateEmission: fmtDateFr(facture.date_emission),
  });
  const data = mapFactureData(resa, montants, ctx);

  let pdf: Buffer;
  try {
    const logo = chargerLogo(); // null si illisible : la facture sort sans logo
    const element =
      type === 'acompte'
        ? createElement(FactureAcomptePDF, { data: data as FactureAcompteData, logo })
        : type === 'total'
          ? createElement(FactureTotalPDF, { data: data as FactureTotalData, logo })
          : createElement(FactureSoldePDF, { data: data as FactureSoldeData, logo });
    // Les composants renvoient un <Document> ; createElement perd cette
    // information de type, on caste vers la signature attendue par renderToBuffer.
    pdf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  } catch (e) {
    // La facture EXISTE déjà en base ; un nouvel appel ré-émettra le même numéro.
    return refus(502, `Rendu PDF échoué (la facture ${facture.numero} reste émise, ré-essayez) : ${messageErreur(e)}`);
  }

  // ── 6. Écriture du fichier (une facture émise ne s'écrase jamais) ────────
  const chemin = cheminFacture(facture.numero);
  try {
    await storage.upload(chemin, pdf, { contentType: 'application/pdf' });
  } catch (e) {
    // Fichier déjà présent (ré-émission après écriture réussie mais étape
    // suivante ratée) : on tolère le doublon, le fichier émis fait foi.
    if (!isDuplicateError(e)) return refus(502, `Écriture du PDF échouée : ${messageErreur(e)}`);
  }

  // ── 7. Chemin de stockage + instantané définitif sur la ligne facture ────
  // (On stocke le CHEMIN relatif, pas une URL : les URL signées sont générées
  //  à la demande.) L'instantané `donnees` est mis à jour dans la MÊME
  // opération avec les données exactement rendues : numéro et date d'émission
  // réels (issus de la ligne), montants en centimes, marqueur d'unité.
  try {
    await db
      .update(factures)
      .set({ pdf_url: chemin, donnees: instantaneFacture(data) })
      .where(eq(factures.id, facture.id));
  } catch (e) {
    return refus(500, `Mise à jour pdf_url / donnees échouée : ${messageErreur(e)}`);
  }

  // ── 8. Enregistrer dans le registre `documents` (back-office) ────────────
  try {
    await db.insert(documents).values({
      reservation_id: reservationId,
      type: DOC_TYPE[type],
      numero: facture.numero,
      url_pdf: chemin,
      statut: 'genere',
    });
  } catch (e) {
    // Doublon (ré-émission idempotente ou émission simultanée) → toléré.
    if (!isUniqueViolation(e)) return refus(500, `Enregistrement du document échoué : ${messageErreur(e)}`);
  }

  return { ok: true, facture: { ...emise(facture), chemin } };
}

/** Le PDF d'une facture émise (pièce jointe du courriel). */
export async function lirePdfFacture(chemin: string): Promise<Buffer> {
  return getStorage().read(chemin);
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function cheminFacture(numero: string): string {
  return `factures/${numero}.pdf`;
}

function emise(f: FactureRow): FactureEmise {
  return {
    numero: f.numero,
    type: f.type,
    montant: centimesDepuisNumeric(f.montant_ttc),
    chemin: f.pdf_url ?? cheminFacture(f.numero),
  };
}

async function trouverFacture(ex: Executeur, reservationId: string, type: TypeFacture): Promise<FactureRow | null> {
  const lignes = await ex
    .select()
    .from(factures)
    .where(and(eq(factures.reservation_id, reservationId), eq(factures.type, type)))
    .limit(1);
  return lignes[0] ?? null;
}

interface PaiementFacture {
  reference: string | null;
  date: Date | null;
  /** « stripe », ou « virement » pour un solde reçu par virement (Phase 5, lot 2). */
  prestataire: string | null;
}

/**
 * Le paiement reçu que la facture constate (ligne `paiements` réussie) :
 * l'acompte ou le total pour la facture de la réservation, le solde pour la
 * facture de solde. `null` pour une réservation saisie sans ligne `paiements`
 * (parcours de non-régression, back-office) : la date d'émission et la
 * référence inscrite sur la réservation sont alors imprimées, comme avant.
 */
async function paiementFacture(
  ex: Executeur,
  reservationId: string,
  type: TypeFacture,
): Promise<PaiementFacture | null> {
  const types = type === 'solde' ? (['solde'] as const) : (['acompte', 'total'] as const);
  const [p] = await ex
    .select({ reference: paiements.reference_externe, date: paiements.date_paiement, prestataire: paiements.prestataire })
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        inArray(paiements.type, [...types]),
        eq(paiements.statut, 'reussi'),
      ),
    )
    .orderBy(desc(paiements.date_paiement))
    .limit(1);
  return p ?? null;
}

function contexte(
  type: TypeFacture,
  resa: Reservation,
  factureAcompte: FactureRow | null,
  paiement: PaiementFacture | null,
  override: { numeroFacture: string; dateEmission: string },
): FactureContext {
  const imprime = paiementImprime(paiement);
  return {
    type,
    numeroFacture: override.numeroFacture,
    dateEmission: override.dateEmission,
    // Date d'encaissement : celle du paiement constaté, au jour de Paris ; à
    // défaut, la date d'émission (les deux coïncident pour un encaissement immédiat).
    datePaiement: paiement?.date ? fmtDateFr(aujourdhuiParis(paiement.date)) : override.dateEmission,
    referenceTransaction: imprime.referenceTransaction,
    modePaiement: imprime.modePaiement,
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
