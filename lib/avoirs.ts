// ÉMISSION D'UN AVOIR (Phase 5, lot 5, D-41 et D-42) : la ligne légale, puis
// son PDF — le pendant de lib/factures.ts pour une réservation annulée.
//
// Un avoir n'existe que si :
//   - la réservation a été annulée depuis le back-office (table `annulations`)
//     et quelque chose a été rendu ;
//   - tout est remboursé (table `remboursements`, tout « fait ») : l'avoir
//     imprime le mode et la date de chaque remboursement ;
//   - une facture a été faite pour le séjour (D-41 : sans facture, pas d'avoir).
// Son montant est celui qui a été rendu.
//
//   1. L'avoir EXISTE dès que la ligne SQL est validée (fonction creer_avoir,
//      qui frappe le numéro dans la même transaction, dans la suite des
//      factures FAC depuis la migration 0024).
//   2. Le PDF est un simple rendu de cette ligne ; en cas d'échec on ré-émet
//      pour le MÊME numéro (idempotent).
//   3. Un seul avoir par réservation (index unique) : deux émissions
//      simultanées ne frappent pas deux numéros.
//
// Charge le moteur PDF : les scripts de contrôle (tsx) le remplacent
// (lib/courriels-envoi.ts, remplacerEmetteurAvoir).
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { annulations, avoirs, documents, factures, remboursements } from '@/db/schema';
import { AvoirPDF, type AvoirData, type LigneRemboursementAvoir } from '@/components/pdf/AvoirPDF';
import { centimesDepuisNumeric, numericDepuisCentimes } from '@/lib/centimes';
import { aujourdhuiParis } from '@/lib/dates-civiles';
import { fmtDateFr } from '@/lib/format';
import { chargerLogo } from '@/lib/logo';
import {
  ARTICLE_ANNULATION,
  INSTANTANE_FORMAT_VERSION,
  MODE_PAIEMENT_VIREMENT,
  MOTIF_ANNULATION,
  type InitiativeAnnulation,
  type Reservation,
} from '@/lib/montants';
import { chargerReservationAvecGite, type Executeur } from '@/lib/reservations';
import { isDuplicateError, isUniqueViolation, isUuid, messageErreur } from '@/lib/route-helpers';
import { getStorage } from '@/lib/storage';

type AvoirRow = typeof avoirs.$inferSelect;
type FactureRow = typeof factures.$inferSelect;

export interface AvoirEmis {
  numero: string;
  /** Centimes. */
  montant: number;
  /** Chemin relatif dans le stockage (avoirs/{numero}.pdf). */
  chemin: string;
}

/** `status` : 409 pour un refus métier, 5xx pour une erreur passagère (à retenter). */
export type ResultatAvoir = { ok: true; avoir: AvoirEmis } | { ok: false; status: number; message: string };

const refus = (status: number, message: string): ResultatAvoir => ({ ok: false, status, message });

const MODE_REMBOURSEMENT: Record<'carte' | 'virement', string> = {
  carte: 'Carte bancaire',
  virement: MODE_PAIEMENT_VIREMENT,
};

/** Émet (ou ré-émet) l'avoir de la réservation annulée. Ne lève pas. */
export async function emettreAvoir(reservationId: string): Promise<ResultatAvoir> {
  if (!isUuid(reservationId)) return refus(400, `Identifiant de réservation invalide : ${reservationId}`);
  const db = getDb();

  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return refus(404, `Réservation introuvable : ${reservationId}`);
  const [annulation] = await db.select().from(annulations).where(eq(annulations.reservation_id, reservationId));
  if (!annulation || resa.statut !== 'annulee') return refus(409, "La réservation n'est pas annulée : pas d'avoir.");
  // FRONTIÈRE BASE → MÉMOIRE : texte numeric → centimes.
  const rembourse = centimesDepuisNumeric(annulation.rembourse);
  if (rembourse <= 0) return refus(409, "Rien n'a été remboursé : pas d'avoir.");

  const mouvements = await db
    .select()
    .from(remboursements)
    .where(eq(remboursements.reservation_id, reservationId))
    .orderBy(asc(remboursements.fait_at), asc(remboursements.created_at));
  if (mouvements.length === 0 || mouvements.some((m) => m.statut !== 'fait')) {
    return refus(409, "Le remboursement n'est pas terminé : l'avoir part quand tout est rendu.");
  }
  const sommeMouvements = mouvements.reduce((s, m) => s + centimesDepuisNumeric(m.montant), 0);
  if (sommeMouvements !== rembourse) {
    return refus(500, `Remboursements (${sommeMouvements}) ≠ montant rendu (${rembourse}) : avoir non émis.`);
  }

  const facs = await db
    .select()
    .from(factures)
    .where(and(eq(factures.reservation_id, reservationId), inArray(factures.type, ['acompte', 'solde', 'total'])))
    .orderBy(asc(factures.date_emission), asc(factures.numero));
  const derniere = facs[facs.length - 1];
  if (!derniere) return refus(409, "Aucune facture n'a été faite pour ce séjour : pas d'avoir.");

  let existante = await trouverAvoir(db, reservationId);
  if (existante?.pdf_url) return { ok: true, avoir: emis(existante) };

  const base = {
    resa,
    factures: facs,
    initiative: annulation.initiative,
    conserve: centimesDepuisNumeric(annulation.conserve),
    rembourse,
    taxeRemboursee: centimesDepuisNumeric(annulation.taxe_remboursee),
    remboursements: lignesRemboursement(mouvements),
  };

  let avoir: AvoirRow;
  if (existante) {
    avoir = existante;
  } else {
    // Instantané PROVISOIRE : le numéro est frappé par creer_avoir, puis
    // complété avec le numéro et la date réels, avec pdf_url.
    const donnees = instantane(donneesAvoir(base, '', fmtDateFr(new Date().toISOString())));
    let id: unknown;
    try {
      const cree = await db.execute<{ id: unknown }>(sql`
        select * from creer_avoir(
          ${reservationId}::uuid,
          ${derniere.id}::uuid,
          ${numericDepuisCentimes(rembourse)}::numeric,
          ${JSON.stringify(donnees)}::jsonb
        )
      `);
      id = cree.rows[0]?.id;
    } catch (e) {
      // Émis au même instant par un autre appel : son numéro fait foi.
      if (isUniqueViolation(e)) existante = await trouverAvoir(db, reservationId);
      if (!existante) return refus(500, `Création de l'avoir échouée : ${messageErreur(e)}`);
      id = existante.id;
    }
    if (!isUuid(id)) return refus(500, "Création de l'avoir échouée : identifiant inattendu.");
    const [relu] = await db.select().from(avoirs).where(eq(avoirs.id, id)).limit(1);
    if (!relu) return refus(500, `Avoir ${id} créé mais introuvable en relecture.`);
    if (relu.pdf_url) return { ok: true, avoir: emis(relu) };
    avoir = relu;
  }

  const data = donneesAvoir(base, avoir.numero, fmtDateFr(avoir.date_emission));
  let pdf: Buffer;
  try {
    const element = createElement(AvoirPDF, { data, logo: chargerLogo() });
    pdf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  } catch (e) {
    return refus(502, `Rendu PDF échoué (l'avoir ${avoir.numero} reste émis, ré-essayez) : ${messageErreur(e)}`);
  }

  const chemin = cheminAvoir(avoir.numero);
  try {
    await getStorage().upload(chemin, pdf, { contentType: 'application/pdf' });
  } catch (e) {
    if (!isDuplicateError(e)) return refus(502, `Écriture du PDF échouée : ${messageErreur(e)}`);
  }
  try {
    await db.update(avoirs).set({ pdf_url: chemin, donnees: instantane(data) }).where(eq(avoirs.id, avoir.id));
  } catch (e) {
    return refus(500, `Mise à jour pdf_url / donnees échouée : ${messageErreur(e)}`);
  }
  try {
    await db.insert(documents).values({
      reservation_id: reservationId,
      type: 'avoir',
      numero: avoir.numero,
      url_pdf: chemin,
      statut: 'genere',
    });
  } catch (e) {
    if (!isUniqueViolation(e)) return refus(500, `Enregistrement du document échoué : ${messageErreur(e)}`);
  }
  return { ok: true, avoir: { ...emis(avoir), chemin } };
}

/** Le PDF d'un avoir émis (pièce jointe du courriel). */
export async function lirePdfAvoir(chemin: string): Promise<Buffer> {
  return getStorage().read(chemin);
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function cheminAvoir(numero: string): string {
  return `avoirs/${numero}.pdf`;
}

function emis(a: AvoirRow): AvoirEmis {
  return { numero: a.numero, montant: centimesDepuisNumeric(a.montant), chemin: a.pdf_url ?? cheminAvoir(a.numero) };
}

async function trouverAvoir(ex: Executeur, reservationId: string): Promise<AvoirRow | null> {
  const [a] = await ex.select().from(avoirs).where(eq(avoirs.reservation_id, reservationId)).limit(1);
  return a ?? null;
}

function instantane(data: AvoirData): Record<string, unknown> {
  return { ...data, unite: 'centimes', formatVersion: INSTANTANE_FORMAT_VERSION };
}

/** Les remboursements faits, un par mode et par jour (deux paiements par carte le même jour : une ligne). */
function lignesRemboursement(mouvements: (typeof remboursements.$inferSelect)[]): LigneRemboursementAvoir[] {
  const lignes: LigneRemboursementAvoir[] = [];
  for (const m of mouvements) {
    const mode = MODE_REMBOURSEMENT[m.mode];
    const date = fmtDateFr(aujourdhuiParis(m.fait_at ?? new Date()));
    const montant = centimesDepuisNumeric(m.montant);
    const meme = lignes.find((l) => l.mode === mode && l.date === date);
    if (meme) meme.montant += montant;
    else lignes.push({ mode, date, montant });
  }
  return lignes;
}

function donneesAvoir(
  b: {
    resa: Reservation;
    factures: FactureRow[];
    initiative: InitiativeAnnulation;
    conserve: number;
    rembourse: number;
    taxeRemboursee: number;
    remboursements: LigneRemboursementAvoir[];
  },
  numero: string,
  dateEmission: string,
): AvoirData {
  const { resa } = b;
  // Le destinataire est celui de la facture corrigée (le client, ou l'entreprise demandée, D-41).
  const d = b.factures[b.factures.length - 1]?.donnees ?? {};
  const texte = (cle: string, defaut: string) => (typeof d[cle] === 'string' && d[cle] ? (d[cle] as string) : defaut);
  const facultatif = (cle: string) => (typeof d[cle] === 'string' && d[cle] ? (d[cle] as string) : undefined);
  return {
    numeroAvoir: numero,
    numeroContrat: resa.numero_contrat ?? '',
    dateEmission,
    factures: b.factures.map((f) => ({
      numero: f.numero,
      date: fmtDateFr(f.date_emission),
      montant: centimesDepuisNumeric(f.montant_ttc),
    })),
    clientRaisonSociale: facultatif('clientRaisonSociale'),
    clientSiren: facultatif('clientSiren'),
    clientCivilite: texte('clientCivilite', resa.client_civilite ?? ''),
    clientNom: texte('clientNom', (resa.client_nom ?? '').toUpperCase()),
    clientPrenom: texte('clientPrenom', resa.client_prenom ?? ''),
    clientCiviliteDeux: facultatif('clientCiviliteDeux'),
    clientNomDeux: facultatif('clientNomDeux'),
    clientPrenomDeux: facultatif('clientPrenomDeux'),
    clientAdresse: texte('clientAdresse', resa.client_adresse ?? ''),
    clientCodePostal: texte('clientCodePostal', resa.client_code_postal ?? ''),
    clientVille: texte('clientVille', resa.client_ville ?? ''),
    clientPays: texte('clientPays', resa.client_pays ?? 'France'),
    clientEmail: resa.client_email ?? '',
    giteNom: resa.gites?.nom ?? '',
    giteRefGdf: resa.gites?.ref_gdf ?? '',
    giteAdresse: resa.gites?.adresse ?? '',
    dateArrivee: fmtDateFr(resa.date_arrivee),
    dateDepart: fmtDateFr(resa.date_depart),
    motifAnnulation: MOTIF_ANNULATION[b.initiative],
    article: ARTICLE_ANNULATION[b.initiative],
    montantConserve: b.conserve,
    montantRembourse: b.rembourse,
    taxeRemboursee: b.taxeRemboursee,
    remboursements: b.remboursements,
  };
}
