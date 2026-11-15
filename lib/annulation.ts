// LE REMBOURSEMENT d'une réservation annulée (Phase 5, lot 5, D-42) : ce que
// le geste du back-office (lib/gestion/annulation.ts) et les tâches
// automatiques (lib/taches.ts) partagent.
//
//   - `paiementsDuSejour` : ce que le client a payé (acompte, solde, total) ;
//   - `repartirRemboursement` : le montant à rendre, sur les paiements par
//     carte d'abord, le plus récent d'abord, jusqu'à ce que chacun a payé ;
//     le reste par virement (réponse 2 A) ;
//   - `rembourserCartes` : les remboursements par carte encore « à faire »,
//     chez Stripe, avec une clé d'idempotence par ligne (jamais deux fois).
//     Un refus de Stripe change la ligne en virement ; une panne la laisse
//     « à faire », et le passage suivant des tâches la reprend ;
//   - `terminerSiRembourse` : quand tout est rendu, l'avoir part au client si
//     une facture avait été faite (D-41, réponse 3 A).
//
// MONTANTS EN CENTIMES ENTIERS.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { factures, paiements, remboursements, reservations } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { inscrireAvoir } from "@/lib/courriels";
import type { Executeur } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { RemboursementRefuse, prestataire, type Prestataire } from "@/lib/stripe";

export interface PaiementRecu {
  id: string;
  type: string;
  /** Centimes. */
  montant: number;
  /** Payé par carte chez le prestataire : remboursable par lui. */
  carte: boolean;
  date: Date | null;
}

/** Les paiements reçus du séjour (acompte, solde, total), le plus récent d'abord. */
export async function paiementsDuSejour(ex: Executeur, reservationId: string): Promise<PaiementRecu[]> {
  const lignes = await ex
    .select()
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        inArray(paiements.type, ["acompte", "solde", "total"]),
        eq(paiements.statut, "reussi"),
      ),
    )
    .orderBy(desc(paiements.date_paiement), desc(paiements.created_at));
  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    // FRONTIÈRE BASE → MÉMOIRE : texte numeric → centimes.
    montant: centimesDepuisNumeric(l.montant),
    carte: !!l.reference_externe && !!l.prestataire && l.prestataire !== "virement",
    date: l.date_paiement,
  }));
}

export interface PartRemboursement {
  mode: "carte" | "virement";
  /** Le paiement par carte remboursé ; null pour un virement. */
  paiementId: string | null;
  /** Centimes. */
  montant: number;
}

/** Le montant à rendre, sur les cartes d'abord (le paiement le plus récent d'abord), le reste par virement. */
export function repartirRemboursement(recus: PaiementRecu[], rembourse: number): PartRemboursement[] {
  const parts: PartRemboursement[] = [];
  let reste = rembourse;
  for (const p of recus) {
    if (reste <= 0) break;
    if (!p.carte) continue;
    const montant = Math.min(reste, p.montant);
    parts.push({ mode: "carte", paiementId: p.id, montant });
    reste -= montant;
  }
  if (reste > 0) parts.push({ mode: "virement", paiementId: null, montant: reste });
  return parts;
}

export interface BilanRemboursements {
  faits: number;
  /** Refusés par Stripe : passés en virement. */
  refuses: number;
  /** Panne : retentés au passage suivant. */
  reportes: number;
}

/**
 * Rembourse chez le prestataire les lignes « carte » encore à faire — d'une
 * réservation, ou de toutes (tâches). Ne lève pas.
 */
export async function rembourserCartes(
  reservationId: string | null,
  p: Prestataire = prestataire(),
): Promise<BilanRemboursements> {
  const db = getDb();
  const bilan: BilanRemboursements = { faits: 0, refuses: 0, reportes: 0 };
  const aFaire = await db
    .select({ ligne: remboursements, reference: paiements.reference_externe })
    .from(remboursements)
    .innerJoin(paiements, eq(paiements.id, remboursements.paiement_id))
    .where(
      and(
        eq(remboursements.mode, "carte"),
        eq(remboursements.statut, "a_faire"),
        reservationId ? eq(remboursements.reservation_id, reservationId) : sql`true`,
      ),
    )
    .orderBy(asc(remboursements.created_at));

  for (const { ligne, reference } of aFaire) {
    try {
      const r = await p.rembourser(reference!, "annulation de la réservation", {
        montant: centimesDepuisNumeric(ligne.montant),
        cle: `annulation-${ligne.id}`,
      });
      await db
        .update(remboursements)
        .set({ statut: "fait", reference_externe: r.id, fait_at: new Date() })
        .where(and(eq(remboursements.id, ligne.id), eq(remboursements.statut, "a_faire")));
      bilan.faits += 1;
    } catch (erreur) {
      if (erreur instanceof RemboursementRefuse) {
        // Inutile de réessayer : l'argent se rend par virement.
        await db
          .update(remboursements)
          .set({ mode: "virement", erreur: messageErreur(erreur).slice(0, 500) })
          .where(and(eq(remboursements.id, ligne.id), eq(remboursements.statut, "a_faire")));
        console.error(`[annulation] remboursement refusé par la banque, à faire par virement (${ligne.id}) : ${messageErreur(erreur)}`);
        bilan.refuses += 1;
      } else {
        console.error(`[annulation] remboursement à retenter (${ligne.id}) : ${messageErreur(erreur)}`);
        bilan.reportes += 1;
      }
    }
    await terminerSiRembourse(db, ligne.reservation_id);
  }
  return bilan;
}

/**
 * Tout est rendu ? L'avoir part au client s'il existe une facture du séjour
 * (une fois : clé du courriel). Renvoie vrai quand tout est rendu.
 */
export async function terminerSiRembourse(ex: Executeur, reservationId: string): Promise<boolean> {
  const restants = await ex
    .select({ id: remboursements.id })
    .from(remboursements)
    .where(and(eq(remboursements.reservation_id, reservationId), eq(remboursements.statut, "a_faire")))
    .limit(1);
  if (restants.length > 0) return false;
  const [faits] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(remboursements)
    .where(eq(remboursements.reservation_id, reservationId));
  const [facture] = await ex
    .select({ id: factures.id })
    .from(factures)
    .where(and(eq(factures.reservation_id, reservationId), inArray(factures.type, ["acompte", "solde", "total"])))
    .limit(1);
  const [resa] = await ex.select({ statut: reservations.statut }).from(reservations).where(eq(reservations.id, reservationId));
  if (facture && (faits?.n ?? 0) > 0 && resa?.statut === "annulee") await inscrireAvoir(ex, reservationId);
  return true;
}

/** Tâches automatiques : les remboursements par carte restés à faire (panne de Stripe). */
export async function traiterRemboursements(p: Prestataire = prestataire()): Promise<BilanRemboursements> {
  return rembourserCartes(null, p);
}
