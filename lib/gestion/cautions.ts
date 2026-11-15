// LES GESTES DU BACK-OFFICE SUR LA CAUTION (Phase 5, lot 2), cadrage du
// 6 novembre 2026, sur l'exemple de Camille (L'Armu, départ le samedi 27 mars
// 2027, caution de 500 € par carte, levée automatique le mardi 30 à 8 h) :
//
//   - LIBÉRER MAINTENANT (réponse 2 A) : la préautorisation est levée tout de
//     suite, à partir du jour du départ. Définitif : plus aucun débit possible
//     (art. 6.5). Le séjour passe « terminé ».
//   - RETENIR (réponses 1 A, 3 A, 7 A) : un montant au plus égal à la caution,
//     un motif obligatoire, des justificatifs (10 Mo au plus, gardés sur le
//     serveur, joints au courriel). Une seule retenue par réservation. Par
//     carte, la préautorisation est encaissée pour ce montant ; le reste est
//     libéré par la banque. Par chèque ou virement, le site note ce que les
//     propriétaires gardent et que le reste est rendu. Le séjour passe
//     « terminé ». La confirmation (second écran) est dans la page.
//   - CHÈQUE OU VIREMENT (réponse 5 A) : « caution reçue » (avec sa date), puis
//     « rendue » entière ; un court courriel au client à chaque fois.
//   - LIEN DE CAUTION (art. 6.6) : le client arrivé sans caution reçoit le lien
//     pour enregistrer une carte (lib/caution.ts, demanderCarteCaution).
//
// Chaque geste est noté dans `audit_logs` (lib/gestion/journal.ts). Les
// refus sont des phrases pour l'écran, jamais des exceptions ; une exception
// est une panne (base, Stripe injoignable).
//
// MONTANTS EN CENTIMES ENTIERS.
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements, reservations, retenues, type PieceJustificative } from "@/db/schema";
import { constaterSousVerrou, demanderCarteCaution } from "@/lib/caution";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { inscrireCautionRecue, inscrireCautionRendue, inscrireCautionRetenue } from "@/lib/courriels";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { fmtDateLongue, fmtEuro } from "@/lib/format";
import type { Executeur } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { getStorage } from "@/lib/storage";
import { PaiementIndisponible, prestataire, type Prestataire } from "@/lib/stripe";

import { journaliser, libelleActeur, type Acteur } from "./journal";

export type IssueGeste = { ok: true; message: string } | { ok: false; message: string };

const refus = (message: string): IssueGeste => ({ ok: false, message });

/** Justificatifs : 10 Mo au plus en tout (réponse 7 A du cadrage), 10 fichiers au plus. */
export const PIECES_OCTETS_MAX = 10 * 1024 * 1024;
export const PIECES_NOMBRE_MAX = 10;
/** Types acceptés : ce qu'un téléphone ou un scanner produit, et ce qu'une boîte de courriel affiche. */
export const TYPES_PIECES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const MOTIF_MAX = 1000;

export interface Fichier {
  nom: string;
  type: string;
  contenu: Uint8Array;
}

async function chargerResa(ex: Executeur, id: string) {
  const [r] = await ex.select().from(reservations).where(eq(reservations.id, id));
  return r ?? null;
}

async function ligneCaution(ex: Executeur, reservationId: string) {
  const [l] = await ex
    .select()
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.type, "caution")));
  return l ?? null;
}

/** Le séjour est fini, sa caution réglée (comme la levée automatique, lib/caution.ts). */
async function terminer(ex: Executeur, reservationId: string): Promise<void> {
  await ex
    .update(reservations)
    .set({ statut: "terminee" })
    .where(and(eq(reservations.id, reservationId), eq(reservations.statut, "confirmee")));
}

// ─── Libérer maintenant ──────────────────────────────────────────────────────

export async function libererCaution(
  reservationId: string,
  acteur: Acteur,
  p: Prestataire = prestataire(),
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const db = getDb();
  const resa = await chargerResa(db, reservationId);
  if (!resa) return refus("Réservation introuvable.");
  const ligne = await ligneCaution(db, reservationId);
  if (!ligne || ligne.statut !== "bloque" || !ligne.reference_externe) return refus("La caution n'est pas bloquée sur la carte.");
  if (aujourdhuiParis(maintenant) < resa.date_depart) {
    return refus(`La caution se libère à partir du jour du départ, le ${fmtDateLongue(resa.date_depart)}.`);
  }
  const etat = await p.annulerPaiement(ligne.reference_externe);
  const issue = await constaterSousVerrou(ligne.id, etat);
  if (issue?.statut === "retenu") return refus("La caution a déjà été encaissée (dans le tableau de bord Stripe) : elle ne peut plus être libérée.");
  if (issue?.statut !== "libere") return refus("Stripe n'a pas levé la préautorisation : réessayez dans un instant.");
  await db.transaction(async (tx) => {
    await terminer(tx, reservationId);
    await journaliser(tx, {
      table: "reservations",
      ligne: reservationId,
      action: "caution_liberee",
      acteur,
      details: { montant: centimesDepuisNumeric(ligne.montant), paiement: ligne.reference_externe },
    });
  });
  return { ok: true, message: `Caution de ${fmtEuro(centimesDepuisNumeric(ligne.montant))} libérée. Le client reçoit un courriel.` };
}

// ─── Retenir ─────────────────────────────────────────────────────────────────

/** Nom de fichier sûr pour le stockage (lib/storage.ts, validerChemin) et lisible en pièce jointe. */
export function nomSur(nom: string, extension: string): string {
  const base = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 60);
  return `${base || "justificatif"}.${extension}`;
}

/** Ce qui ne va pas dans la saisie d'une retenue, ou null. */
export function defautRetenue(montant: number, caution: number, motif: string, fichiers: Fichier[]): string | null {
  if (!Number.isInteger(montant) || montant <= 0) return "Le montant retenu doit être supérieur à 0 €.";
  if (montant > caution) return `Le montant retenu ne peut pas dépasser la caution (${fmtEuro(caution)}).`;
  const m = motif.trim();
  if (!m) return "Le motif est obligatoire : il part au client avec les justificatifs.";
  if (m.length > MOTIF_MAX) return `Le motif fait au plus ${MOTIF_MAX} caractères.`;
  if (fichiers.length > PIECES_NOMBRE_MAX) return `${PIECES_NOMBRE_MAX} justificatifs au plus.`;
  const total = fichiers.reduce((s, f) => s + f.contenu.byteLength, 0);
  if (total > PIECES_OCTETS_MAX) return "Les justificatifs dépassent 10 Mo en tout : réduisez la taille des photos.";
  const mauvais = fichiers.find((f) => !TYPES_PIECES[f.type]);
  if (mauvais) return `« ${mauvais.nom} » : seuls les PDF et les photos (JPEG, PNG, WebP, HEIC) sont acceptés.`;
  return null;
}

async function deposer(reservationId: string, fichiers: Fichier[], maintenant: Date): Promise<PieceJustificative[]> {
  const stockage = getStorage();
  const lot = maintenant.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const pieces: PieceJustificative[] = [];
  for (const [i, f] of fichiers.entries()) {
    const nom = nomSur(f.nom, TYPES_PIECES[f.type]);
    const chemin = `retenues/${reservationId}/${lot}-${i + 1}-${nom}`;
    await stockage.upload(chemin, f.contenu, { contentType: f.type });
    pieces.push({ nom, chemin, taille: f.contenu.byteLength, type: f.type });
  }
  return pieces;
}

async function effacerPieces(pieces: PieceJustificative[]): Promise<void> {
  const stockage = getStorage();
  for (const piece of pieces) await stockage.delete(piece.chemin).catch(() => undefined);
}

export async function retenirCaution(
  reservationId: string,
  saisie: { montant: number; motif: string; fichiers: Fichier[] },
  acteur: Acteur,
  p: Prestataire = prestataire(),
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const db = getDb();
  const resa = await chargerResa(db, reservationId);
  if (!resa) return refus("Réservation introuvable.");
  if (resa.statut !== "confirmee" && resa.statut !== "terminee") return refus("Cette réservation n'a pas de caution à retenir.");
  if (aujourdhuiParis(maintenant) < resa.date_depart) {
    return refus(`Une retenue se fait à partir du jour du départ, le ${fmtDateLongue(resa.date_depart)}.`);
  }
  const [deja] = await db.select().from(retenues).where(eq(retenues.reservation_id, reservationId));
  if (deja?.faite_at) return refus("Une retenue a déjà été faite sur cette caution : une seule est possible.");
  const motif = saisie.motif.trim();

  if (resa.moyen_caution === "carte") {
    const ligne = await ligneCaution(db, reservationId);
    if (!ligne || ligne.statut !== "bloque" || !ligne.reference_externe) {
      return refus("La caution n'est pas bloquée sur la carte : il n'y a rien à retenir.");
    }
    const caution = centimesDepuisNumeric(ligne.montant);
    const defaut = defautRetenue(saisie.montant, caution, motif, saisie.fichiers);
    if (defaut) return refus(defaut);
    // Une tentative interrompue (panne entre deux étapes) est reprise de zéro.
    if (deja) {
      await db.delete(retenues).where(and(eq(retenues.id, deja.id), isNull(retenues.faite_at)));
      await effacerPieces(deja.pieces);
    }
    const pieces = await deposer(reservationId, saisie.fichiers, maintenant);
    // La trace AVANT l'encaissement : le motif et les justificatifs survivent à une panne.
    const [r] = await db
      .insert(retenues)
      .values({
        reservation_id: reservationId,
        montant: numericDepuisCentimes(saisie.montant),
        motif,
        moyen: "carte",
        pieces,
        acteur: libelleActeur(acteur),
      })
      .returning({ id: retenues.id });
    const abandonner = async () => {
      await db.delete(retenues).where(eq(retenues.id, r.id));
      await effacerPieces(pieces);
    };

    let etat;
    try {
      etat = await p.encaisserCaution(ligne.reference_externe, saisie.montant);
    } catch (erreur) {
      await abandonner();
      console.error(`[gestion] retenue de ${resa.reference} : ${messageErreur(erreur)}`);
      if (erreur instanceof PaiementIndisponible) return refus("Stripe n'est pas joignable : rien n'a été encaissé. Réessayez dans un instant.");
      throw erreur;
    }
    const issue = await constaterSousVerrou(ligne.id, etat);
    if (issue?.statut !== "retenu") {
      await abandonner();
      return refus(
        issue?.statut === "libere"
          ? "La caution venait d'être levée : rien n'a été encaissé."
          : "Stripe n'a pas encaissé la caution : rien n'a été retenu. Réessayez dans un instant.",
      );
    }
    if (etat.montantEncaisse !== saisie.montant) {
      // Encaissée entre-temps pour un autre montant (tableau de bord Stripe) : on garde ce qui a été fait.
      console.warn(`[gestion] retenue de ${resa.reference} : ${etat.montantEncaisse} centimes encaissés, ${saisie.montant} demandés`);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(retenues)
        .set({ faite_at: new Date(), montant: numericDepuisCentimes(etat.montantEncaisse) })
        .where(eq(retenues.id, r.id));
      await inscrireCautionRetenue(tx, reservationId);
      await terminer(tx, reservationId);
      await journaliser(tx, {
        table: "reservations",
        ligne: reservationId,
        action: "caution_retenue",
        acteur,
        details: { moyen: "carte", montant: etat.montantEncaisse, caution, motif, pieces: pieces.length },
      });
    });
    return {
      ok: true,
      message: `${fmtEuro(etat.montantEncaisse)} retenus sur la caution de ${fmtEuro(caution)}. Le client reçoit le motif et les justificatifs.`,
    };
  }

  if (resa.moyen_caution === "cheque" || resa.moyen_caution === "virement") {
    if (!resa.caution_recue_at) return refus("La caution n'est pas notée reçue : notez-la reçue d'abord.");
    if (resa.caution_rendue_at) return refus("La caution est déjà notée rendue.");
    const caution = resa.caution === null ? 0 : centimesDepuisNumeric(resa.caution);
    const defaut = defautRetenue(saisie.montant, caution, motif, saisie.fichiers);
    if (defaut) return refus(defaut);
    if (deja) {
      await db.delete(retenues).where(and(eq(retenues.id, deja.id), isNull(retenues.faite_at)));
      await effacerPieces(deja.pieces);
    }
    const pieces = await deposer(reservationId, saisie.fichiers, maintenant);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(retenues).values({
          reservation_id: reservationId,
          montant: numericDepuisCentimes(saisie.montant),
          motif,
          moyen: resa.moyen_caution as "cheque" | "virement",
          pieces,
          acteur: libelleActeur(acteur),
          faite_at: new Date(),
        });
        // Le reste est rendu en même temps (le site ne touche pas à l'argent).
        await tx.update(reservations).set({ caution_rendue_at: new Date() }).where(eq(reservations.id, reservationId));
        await inscrireCautionRetenue(tx, reservationId);
        await terminer(tx, reservationId);
        await journaliser(tx, {
          table: "reservations",
          ligne: reservationId,
          action: "caution_retenue",
          acteur,
          details: { moyen: resa.moyen_caution, montant: saisie.montant, caution, motif, pieces: pieces.length },
        });
      });
    } catch (erreur) {
      await effacerPieces(pieces);
      throw erreur;
    }
    const reste = caution - saisie.montant;
    return {
      ok: true,
      message:
        `${fmtEuro(saisie.montant)} retenus sur la caution de ${fmtEuro(caution)}` +
        (reste > 0 ? ` : rendez le reste, ${fmtEuro(reste)}, au client.` : ".") +
        " Le client reçoit le motif et les justificatifs.",
    };
  }
  return refus("Cette réservation n'a pas de caution enregistrée.");
}

// ─── Chèque ou virement : reçue, rendue ──────────────────────────────────────

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function noterCautionRecue(
  reservationId: string,
  date: string,
  acteur: Acteur,
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  if (!FORME_DATE.test(date)) return refus("Indiquez la date de réception.");
  if (date > aujourdhuiParis(maintenant)) return refus("La date de réception ne peut pas être dans le futur.");
  return getDb().transaction(async (tx) => {
    const [resa] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!resa) return refus("Réservation introuvable.");
    if (resa.moyen_caution !== "cheque" && resa.moyen_caution !== "virement") return refus("La caution n'est ni par chèque ni par virement.");
    if (resa.statut !== "confirmee") return refus("Seule une réservation confirmée attend sa caution.");
    if (resa.caution_recue_at) return refus("La caution est déjà notée reçue.");
    if (date < aujourdhuiParis(resa.created_at)) return refus("La date de réception précède la réservation.");
    await tx
      .update(reservations)
      // Midi, heure de Paris, le jour indiqué : la date seule compte.
      .set({ caution_recue_at: sql`(${date}::date + time '12:00') at time zone 'Europe/Paris'` })
      .where(eq(reservations.id, reservationId));
    await inscrireCautionRecue(tx, reservationId);
    await journaliser(tx, {
      table: "reservations",
      ligne: reservationId,
      action: "caution_recue",
      acteur,
      details: { moyen: resa.moyen_caution, date },
    });
    return { ok: true, message: "Caution notée reçue. Le client reçoit un courriel." };
  });
}

export async function noterCautionRendue(reservationId: string, acteur: Acteur, maintenant: Date = new Date()): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    const [resa] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!resa) return refus("Réservation introuvable.");
    if (!resa.caution_recue_at) return refus("La caution n'est pas notée reçue.");
    if (resa.caution_rendue_at) return refus("La caution est déjà notée rendue.");
    // Réservation annulée (Phase 5, lot 5) : la caution reçue se rend tout de suite.
    if (resa.statut !== "annulee" && aujourdhuiParis(maintenant) < resa.date_depart) {
      return refus(`La caution se rend à partir du jour du départ, le ${fmtDateLongue(resa.date_depart)}.`);
    }
    const [r] = await tx.select({ id: retenues.id }).from(retenues).where(eq(retenues.reservation_id, reservationId));
    if (r) return refus("Une retenue est en cours ou faite sur cette caution.");
    await tx.update(reservations).set({ caution_rendue_at: new Date() }).where(eq(reservations.id, reservationId));
    await inscrireCautionRendue(tx, reservationId);
    await terminer(tx, reservationId);
    await journaliser(tx, { table: "reservations", ligne: reservationId, action: "caution_rendue", acteur, details: { moyen: resa.moyen_caution } });
    return { ok: true, message: "Caution notée rendue. Le client reçoit un courriel." };
  });
}

// ─── Lien de caution (art. 6.6) ──────────────────────────────────────────────

const RAISONS_CARTE: Record<string, string> = {
  introuvable: "Réservation introuvable.",
  non_confirmee: "La réservation n'est pas confirmée.",
  carte_deja_enregistree: "Une carte est déjà enregistrée pour cette réservation.",
  sans_caution: "Cette réservation n'a pas de caution.",
  depart_passe: "Le séjour est fini : il est trop tard pour demander une carte.",
};

export async function envoyerLienCaution(reservationId: string, acteur: Acteur, maintenant: Date = new Date()): Promise<IssueGeste> {
  const r = await demanderCarteCaution(reservationId, maintenant);
  if (!r.ok) return refus(RAISONS_CARTE[r.raison] ?? "Le lien n'a pas pu être envoyé.");
  await journaliser(getDb(), { table: "reservations", ligne: reservationId, action: "lien_caution_envoye", acteur });
  return { ok: true, message: "Le client reçoit le lien pour enregistrer une carte (article 6.6 du contrat)." };
}
