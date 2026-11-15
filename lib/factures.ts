// ÉMISSION D'UNE FACTURE (acompte, solde, total du séjour, ou retenue sur la
// caution) : la ligne légale, puis son PDF.
//
// Depuis D-41 (14 novembre 2026), le site n'émet plus de facture tout seul :
// les propriétaires la font sur demande du client, depuis le back-office
// (lib/gestion/factures.ts), une fois le séjour entièrement payé (« total »,
// qui liste les paiements reçus) ou la retenue faite (« retenue »), au nom de
// la personne qui a réservé ou d'une entreprise. « acompte » et « solde »
// restent émissibles par la route (parcours de non-régression).
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
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, factures, paiements, retenues, type TypeFacture } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import {
  calculerMontants,
  cautionDe,
  instantaneFacture,
  mapFactureData,
  paiementImprime,
  MODE_PAIEMENT_VIREMENT,
  type EntrepriseFacture,
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
import { FactureTotalPDF, type FactureTotalData, type LignePaiementFacture } from '@/components/pdf/FactureTotalPDF';
import { FactureRetenuePDF, type FactureRetenueData } from '@/components/pdf/FactureRetenuePDF';

// Type enregistré dans la table `documents` (registre back-office).
const DOC_TYPE: Record<TypeFacture, string> = {
  acompte: 'facture_acompte',
  solde: 'facture_solde',
  total: 'facture_total',
  retenue: 'facture_retenue',
};

/** Le moyen de la caution, tel que la facture de retenue l'imprime. */
const MOYEN_CAUTION: Record<'carte' | 'cheque' | 'virement', string> = {
  carte: 'carte bancaire, préautorisation',
  cheque: 'chèque',
  virement: 'virement',
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

/**
 * Émet (ou ré-émet) la facture `type` de la réservation. Ne lève pas : les
 * erreurs sont dans le résultat. `entreprise` (facture unique ou de retenue) :
 * le destinataire imprimé à la place de la personne qui a réservé ; une
 * facture déjà émise garde le sien.
 */
export async function emettreFacture(
  reservationId: string,
  type: TypeFacture,
  entreprise: EntrepriseFacture | null = null,
): Promise<ResultatFacture> {
  if (!isUuid(reservationId)) return refus(400, `Identifiant de réservation invalide : ${reservationId}`);
  const db = getDb();
  const storage = getStorage();

  // ── 1. Réservation (+ gîte joint) ───────────────────────────────────────
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return refus(404, `Réservation introuvable : ${reservationId}`);

  // Séjour payé en une fois (D-20, D-27) : ni acompte ni solde à facturer.
  if (resa.paiement_integral && (type === 'acompte' || type === 'solde')) {
    return refus(
      409,
      "Réservation payée en totalité : ni facture d'acompte ni facture de solde, mais une facture unique (type 'total'). Aucune facture n'est émise.",
    );
  }
  // Facture unique ou de retenue (D-41) : seulement pour un séjour réel.
  if ((type === 'total' || type === 'retenue') && resa.statut !== 'confirmee' && resa.statut !== 'terminee') {
    return refus(409, `Réservation au statut « ${resa.statut} » : aucune facture n'est émise.`);
  }

  // La facture du séjour faite (D-41) : plus de facture d'acompte ni de solde.
  if (type === 'acompte' || type === 'solde') {
    const totale = await trouverFacture(db, reservationId, 'total');
    if (totale) return refus(409, `La facture du séjour ${totale.numero} existe déjà : pas de facture d'acompte ni de solde en plus.`);
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

  // ── 3 ter. Facture unique : le séjour entièrement payé (D-41) ───────────
  let lignesPaiement: LignePaiementFacture[] | undefined;
  if (type === 'total') {
    const [autre] = await db
      .select({ numero: factures.numero })
      .from(factures)
      .where(and(eq(factures.reservation_id, reservationId), inArray(factures.type, ['acompte', 'solde'])))
      .limit(1);
    if (autre) {
      return refus(409, `Une facture d'acompte ou de solde (${autre.numero}) existe déjà pour ce séjour : pas de facture unique en plus.`);
    }
    const recus = await paiementsRecus(db, reservationId);
    if (recus.length === 0 && !resa.paiement_integral) {
      return refus(409, "Le séjour n'est pas entièrement payé : la facture se fait une fois le solde reçu.");
    }
    if (recus.length > 0) {
      if (!resa.paiement_integral && !recus.some((p) => p.type === 'solde')) {
        return refus(409, "Le solde n'est pas encore reçu : la facture se fait une fois le séjour entièrement payé.");
      }
      lignesPaiement = recus.map((p) => lignePaiement(p, resa));
      const somme = lignesPaiement.reduce((s, l) => s + l.montant, 0);
      if (somme !== montants.totalTtc) {
        return refus(
          409,
          `Les paiements reçus (${fmtEuro(somme)}) ne font pas le total du séjour (${fmtEuro(montants.totalTtc)}) : aucune facture n'est émise.`,
        );
      }
    }
  }

  // ── 3 quater. Facture de retenue : la retenue faite (D-41) ──────────────
  let retenue: FactureContext['retenue'];
  if (type === 'retenue') {
    const [r] = await db.select().from(retenues).where(eq(retenues.reservation_id, reservationId)).limit(1);
    if (!r?.faite_at) return refus(409, "Aucune retenue n'a été faite sur la caution de cette réservation : pas de facture de retenue.");
    let montantCaution: number;
    try {
      montantCaution = cautionDe(resa);
    } catch (e) {
      return refus(409, `${messageErreur(e)} : pas de facture de retenue.`);
    }
    retenue = {
      motif: r.motif,
      moyenCaution: MOYEN_CAUTION[r.moyen],
      dateRetenue: fmtDateFr(aujourdhuiParis(r.faite_at)),
      montantCaution,
      montantRetenu: centimesDepuisNumeric(r.montant),
    };
  }

  // Paiement intégral : calculerMontants donne acompte = total, solde = 0.
  const montantTtc =
    type === 'solde'
      ? montants.solde
      : type === 'total'
        ? montants.totalTtc
        : type === 'retenue' && retenue
          ? retenue.montantRetenu
          : montants.acompte;

  // Le destinataire : celui demandé, ou celui d'une facture dont le PDF avait échoué.
  const ent =
    type === 'total' || type === 'retenue' ? (entreprise ?? (existante ? entrepriseDe(existante.donnees) : null)) : null;
  const extras = { entreprise: ent ?? undefined, paiements: lignesPaiement, retenue };

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

  const paiement = type === 'retenue' ? null : await paiementFacture(db, reservationId, type);

  // ── 4. Obtenir la ligne facture (existante ou nouvelle via creer_facture) ─
  let facture: FactureRow;
  if (existante) {
    // Ré-émission pour le MÊME numéro (le PDF avait échoué).
    facture = existante;
  } else {
    // Instantané PROVISOIRE : le numéro n'existe pas encore (il est frappé par
    // creer_facture) ; il est complété à l'étape 7 avec le numéro et la date
    // réels, dans la même opération que pdf_url.
    const ctxProvisoire = contexte(type, resa, factureAcompte, paiement, extras, {
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
  const ctx = contexte(type, resa, factureAcompte, paiement, extras, {
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
          : type === 'retenue'
            ? createElement(FactureRetenuePDF, { data: data as FactureRetenueData, logo })
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

/**
 * Les paiements reçus du séjour : l'acompte (ou le total), puis le solde —
 * dans cet ordre même le même jour (un solde par virement est daté de midi).
 */
async function paiementsRecus(ex: Executeur, reservationId: string) {
  return ex
    .select({
      type: paiements.type,
      montant: paiements.montant,
      reference: paiements.reference_externe,
      date: paiements.date_paiement,
      prestataire: paiements.prestataire,
    })
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        inArray(paiements.type, ['acompte', 'solde', 'total']),
        eq(paiements.statut, 'reussi'),
      ),
    )
    .orderBy(sql`${paiements.type} = 'solde'`, asc(paiements.date_paiement));
}

const OBJET_PAIEMENT: Record<string, string> = { acompte: 'Acompte', solde: 'Solde', total: 'Prix total du séjour' };

/** Un paiement reçu tel que la facture unique l'imprime (mode et référence : paiementImprime). */
function lignePaiement(
  p: Awaited<ReturnType<typeof paiementsRecus>>[number],
  resa: Reservation,
): LignePaiementFacture {
  const imprime = paiementImprime(p);
  return {
    objet: OBJET_PAIEMENT[p.type] ?? p.type,
    mode: imprime.modePaiement ?? (p.prestataire === 'virement' ? MODE_PAIEMENT_VIREMENT : resa.mode_paiement ?? ''),
    date: p.date ? fmtDateFr(aujourdhuiParis(p.date)) : '—',
    reference: imprime.referenceTransaction ?? resa.reference_transaction ?? '—',
    // FRONTIÈRE BASE → MÉMOIRE : texte numeric → centimes.
    montant: centimesDepuisNumeric(p.montant),
  };
}

/** L'entreprise inscrite dans l'instantané d'une facture déjà créée, ou null. */
function entrepriseDe(donnees: Record<string, unknown>): EntrepriseFacture | null {
  const texte = (v: unknown) => (typeof v === 'string' ? v : '');
  if (!texte(donnees.clientRaisonSociale)) return null;
  return {
    raisonSociale: texte(donnees.clientRaisonSociale),
    adresse: texte(donnees.clientAdresse),
    codePostal: texte(donnees.clientCodePostal),
    ville: texte(donnees.clientVille),
    pays: texte(donnees.clientPays),
    siren: texte(donnees.clientSiren) || null,
  };
}

function contexte(
  type: TypeFacture,
  resa: Reservation,
  factureAcompte: FactureRow | null,
  paiement: PaiementFacture | null,
  extras: Pick<FactureContext, 'entreprise' | 'paiements' | 'retenue'>,
  override: { numeroFacture: string; dateEmission: string },
): FactureContext {
  const imprime = paiementImprime(paiement);
  return {
    ...extras,
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
