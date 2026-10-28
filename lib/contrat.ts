// ÉMISSION DU CONTRAT de location : numéro, ligne `documents` avec son jeton de
// signature, PDF non signé, numéro recopié sur la réservation.
//
// Appelée par POST /api/contrats (back-office, avec le secret de service) et,
// depuis le lot 4 de la Phase 3, par le site lui-même juste après le paiement
// (lib/courriels.ts). Sortie de la route sans changement de comportement.
//
// Idempotent : un contrat déjà émis pour la réservation est renvoyé tel quel
// (même numéro, même jeton), sans nouveau fichier ni nouveau numéro.
//
// Numéro, ligne documents et numero_contrat sont écrits dans UNE transaction :
// un échec entre deux écritures ne peut pas laisser un numéro légal consommé
// sur un contrat que la réservation ignore (règle 1 de CLAUDE.md).
import { createElement } from "react";
import { randomBytes } from "crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { documents, reservations } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { calculerMontants, mapContratData } from "@/lib/montants";
import { chargerReservationAvecGite, type Executeur } from "@/lib/reservations";
import { fmtDateFr } from "@/lib/format";
import { isDuplicateError, isUniqueViolation, messageErreur } from "@/lib/route-helpers";
import { chargerLogo } from "@/lib/logo";
import { ContratPDF } from "@/components/pdf/ContratPDF";

const DOCUMENT_TYPE = "contrat_location";
// v2 (octobre 2026) : dépôt de garantie par préautorisation Stripe (art. 6),
// solde au choix du Locataire (art. 5.1), destinataires RGPD (art. 14).
const TEMPLATE_VERSION = "v2";
// Le lien de signature reste valable 30 jours.
const TOKEN_TTL_JOURS = 30;

/** Le contrat émis (ou déjà émis), tel que renvoyé à l'appelant. */
export interface ContratEmis {
  id: string;
  numero: string;
  token: string | null;
}

export type ResultatEmission =
  | { ok: true; contrat: ContratEmis }
  | { ok: false; status: number; message: string };

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
    this.name = "EchecEmission";
  }
}

export async function emettreContrat(reservationId: string): Promise<ResultatEmission> {
  const db = getDb();

  // Idempotence : contrat déjà émis ?
  const existant = await trouverContratExistant(db, reservationId);
  if (existant) return { ok: true, contrat: existant };

  // Réservation (source de vérité ; gîte joint par lib/reservations).
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return { ok: false, status: 404, message: `Réservation introuvable : ${reservationId}` };
  // Paiement intégral (D-20) : le contrat ne prévoit pas ce cas (art. 5.1, 5.2,
  // 5.3, 7.2). Les clauses sont à rédiger au lot 5 de la Phase 3 ; d'ici là,
  // aucun contrat n'est émis, plutôt qu'un contrat faux et déjà numéroté.
  if (resa.paiement_integral) {
    return {
      ok: false,
      status: 409,
      message:
        "Réservation payée en totalité : le contrat ne prévoit pas encore ce cas " +
        "(articles 5.1, 5.2, 5.3 et 7.2, à rédiger au lot 5). Aucun contrat n'est émis.",
    };
  }

  const logo = chargerLogo(); // null si illisible : le contrat sort sans logo
  const token = randomBytes(24).toString("base64url"); // 32 caractères URL-safe
  const tokenExpireAt = new Date(Date.now() + TOKEN_TTL_JOURS * 24 * 60 * 60 * 1000);
  const dateEmission = fmtDateFr(new Date().toISOString());

  try {
    const contrat = await db.transaction(async (tx) => {
      // Numéro de contrat (la ligne compteur reste verrouillée jusqu'au
      // commit : deux émissions simultanées se sérialisent ici).
      const numero = await prochainNumeroContrat(tx);
      const cheminStorage = `contrats/${reservationId}/${numero}.pdf`;

      // Ligne documents AVANT le fichier : l'index unique (reservation_id,
      // type) arrête une émission concurrente ici, avant qu'un fichier ne
      // soit écrit, et son numéro est rendu au compteur par le rollback.
      const [insere] = await tx
        .insert(documents)
        .values({
          reservation_id: reservationId,
          type: DOCUMENT_TYPE,
          numero,
          url_pdf: cheminStorage,
          statut: "genere",
          template_version: TEMPLATE_VERSION,
          token,
          token_expire_at: tokenExpireAt,
        })
        .returning({ id: documents.id, numero: documents.numero, token: documents.token });

      // Rendu du PDF NON signé.
      const montants = calculerMontants(resa);
      const data = mapContratData(resa, montants, { numeroContrat: numero, dateEmission });

      let pdfBuffer: Buffer;
      try {
        const element = createElement(ContratPDF, { data, logo });
        pdfBuffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
      } catch (e) {
        throw new EchecEmission(502, `Rendu PDF échoué : ${messageErreur(e)}`);
      }

      // Écriture du fichier (jamais écrasé). Un fichier déjà présent est le
      // reliquat d'une tentative annulée après l'écriture (son numéro avait
      // été rendu au compteur, il est donc réattribué ici) : il fait foi.
      try {
        await getStorage().upload(cheminStorage, pdfBuffer, { contentType: "application/pdf" });
      } catch (e) {
        if (!isDuplicateError(e)) {
          throw new EchecEmission(502, `Écriture du PDF échouée : ${messageErreur(e)}`);
        }
      }

      // Numéro recopié sur la réservation, dans la MÊME transaction.
      const maj = await tx
        .update(reservations)
        .set({ numero_contrat: numero })
        .where(eq(reservations.id, reservationId))
        .returning({ id: reservations.id });
      if (maj.length !== 1) {
        throw new EchecEmission(500, "Réservation introuvable au moment de l'écriture du numéro de contrat.");
      }

      return insere;
    });
    return { ok: true, contrat };
  } catch (e) {
    if (e instanceof EchecEmission) return { ok: false, status: e.status, message: e.message };
    // Course (paiement constaté deux fois, appel en double) : un autre appel a
    // inséré le contrat entre notre contrôle d'idempotence et notre insert →
    // on renvoie l'existant.
    if (isUniqueViolation(e)) {
      const dejaLa = await trouverContratExistant(db, reservationId);
      if (dejaLa) return { ok: true, contrat: dejaLa };
    }
    return { ok: false, status: 500, message: `Émission du contrat échouée : ${messageErreur(e)}` };
  }
}

/** Le contrat de la réservation, s'il a déjà été émis. */
export async function trouverContratExistant(
  executeur: Executeur,
  reservationId: string,
): Promise<ContratEmis | null> {
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
  const resultat = await tx.execute<{ numero: unknown }>(sql`select prochain_numero('CTR', ${annee}::int) as numero`);
  const numero = resultat.rows[0]?.numero;
  if (typeof numero !== "string" || !/^CTR-\d{4}-\d{3,}$/.test(numero)) {
    throw new EchecEmission(500, `Numérotation contrat échouée : valeur inattendue (${String(numero)}).`);
  }
  return numero;
}

function anneeParis(): number {
  return Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(new Date()),
  );
}
