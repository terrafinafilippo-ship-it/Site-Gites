// L'EFFACEMENT DES TENTATIVES ABANDONNÉES (Phase 4, lot 3, D-21, D-31 ;
// docs/06-avant-premier-client.md, point 12 ; RGPD art. 5.1.e).
//
// Une tentative est une réservation « en attente de paiement » : le client a
// atteint l'écran de paiement (ses coordonnées sont en base), puis a fermé la
// page. Ses dates se libèrent seules au bout de 20 minutes (D-21) ; ses
// coordonnées, elles, restaient. Exemple : Camille ouvre l'écran de paiement
// le 1er mars 2027 à 10 h et ferme la page ; avec une durée de 7 jours, sa
// tentative est effacée au premier passage après le 8 mars à 10 h.
//
// La durée est un réglage (`reglages.abandon_conservation_jours`), compté en
// jours depuis la création de la tentative. VIDE : RIEN N'EST EFFACÉ — elle
// attend la réponse du juriste (choix du gérant du 1er novembre 2026).
//
// L'effacement est celui du retour en arrière (lib/tunnel.ts,
// abandonnerTentative) : paiement ouvert annulé chez Stripe, paiements non
// aboutis, nuits bloquées, réservation, et la fiche client chez Stripe ; une
// réservation engagée (payée, en cours de paiement, contrat émis) n'est
// jamais touchée. Une ligne `audit_logs` (référence et dates, aucun nom) en
// garde la trace. Aucun courriel (cadrage du 13 octobre 2026).
//
// HORS DE CET EFFACEMENT, en attente du juriste : une tentative payée en
// retard puis remboursée (elle reste « en attente de paiement » avec un
// paiement remboursé), et le journal des courriels.
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements, reglages, reservations } from "@/db/schema";
import { messageErreur } from "@/lib/route-helpers";
import { prestataire, type Prestataire } from "@/lib/stripe";
import { abandonnerTentative } from "@/lib/tunnel";

/** Tentatives effacées au plus par passage ; le reste au passage suivant. */
const PAR_PASSAGE = 50;

export interface BilanAbandons {
  /** Durée non réglée : rien n'est effacé. */
  desactive: boolean;
  effacees: number;
  /** Engagées entre-temps (paiement en cours ou reçu) : laissées. */
  engagees: number;
  erreurs: number;
}

/** Un passage des tâches sur les tentatives abandonnées. */
export async function effacerAbandons(maintenant: Date = new Date(), p: Prestataire = prestataire()): Promise<BilanAbandons> {
  const db = getDb();
  const bilan: BilanAbandons = { desactive: false, effacees: 0, engagees: 0, erreurs: 0 };
  const [r] = await db.select({ jours: reglages.abandon_conservation_jours }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  if (r.jours === null) {
    bilan.desactive = true;
    return bilan;
  }

  const limite = new Date(maintenant.getTime() - r.jours * 86_400_000);
  const aEffacer = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.statut, "en_attente_paiement"),
        isNull(reservations.date_paiement_acompte),
        isNull(reservations.numero_contrat),
        sql`${reservations.created_at} < ${limite.toISOString()}::timestamptz`,
        // Payée (ou remboursée) : jamais effacée ici. L'écarter dès la
        // recherche évite qu'elle occupe chaque passage pour rien.
        sql`not exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
              and ${paiements.statut} in ('reussi', 'a_rembourser', 'rembourse'))`,
      ),
    )
    .orderBy(asc(reservations.created_at))
    .limit(PAR_PASSAGE);

  for (const { id } of aEffacer) {
    try {
      const resultat = await abandonnerTentative(id, {
        p,
        trace: { acteur: "systeme", motif: `tentative abandonnée depuis plus de ${r.jours} jours` },
      });
      if (resultat === "ABANDONNEE") bilan.effacees += 1;
      if (resultat === "ENGAGEE") bilan.engagees += 1;
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error(`[abandons] réservation ${id} : ${messageErreur(erreur)}`);
    }
  }
  if (bilan.effacees > 0) console.info(`[abandons] ${bilan.effacees} tentative(s) abandonnée(s) effacée(s)`);
  return bilan;
}
