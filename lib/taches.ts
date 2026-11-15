// LES TÂCHES AUTOMATIQUES du site (Phase 4, D-28) : ce qui doit se faire à
// une date, sans que personne ne visite le site.
//
// Le « réveil » est une tâche programmée de Coolify qui appelle
// POST /api/taches toutes les 15 minutes (choix du gérant du 1er novembre
// 2026) ; une minuterie dans le site s'arrêterait à chaque redémarrage. Un
// passage manqué n'est pas grave : chaque tâche regarde où en est chaque
// réservation, pas l'heure qu'il est, et le passage suivant rattrape.
//
// UN SEUL PASSAGE À LA FOIS : un verrou de la base (pg_try_advisory_xact_lock)
// est pris pour toute la durée du passage ; un second appel simultané repart
// sans rien faire.
//
// Lot 1 : le solde (lib/solde.ts). Lot 2 : la caution par carte
// (lib/caution.ts). Lot 3 : la caution par virement (lib/virement.ts, avant
// la caution : l'alerte « à rendre » précède la fin du séjour), l'effacement
// des tentatives abandonnées (lib/abandons.ts). Phase 6 (D-40) : l'invitation
// à donner son avis et l'effacement des avis trop anciens (lib/avis.ts).
// Phase 5, lot 5 (D-42) : les remboursements par carte d'une annulation
// restés à faire après une panne de Stripe (lib/annulation.ts).
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { effacerAbandons, type BilanAbandons } from "@/lib/abandons";
import { traiterRemboursements, type BilanRemboursements } from "@/lib/annulation";
import { traiterAvis, type BilanAvis } from "@/lib/avis";
import { traiterCautions, type BilanCautions } from "@/lib/caution";
import { traiterSoldes, type BilanSoldes } from "@/lib/solde";
import { prestataire, type Prestataire } from "@/lib/stripe";
import { traiterVirements, type BilanVirements } from "@/lib/virement";

export interface BilanTaches {
  soldes: BilanSoldes;
  virements: BilanVirements;
  cautions: BilanCautions;
  abandons: BilanAbandons;
  avis: BilanAvis;
  remboursements: BilanRemboursements;
}

/** Un passage des tâches, ou `null` si un autre passage est déjà en cours. */
export async function executerTaches(
  maintenant: Date = new Date(),
  p: Prestataire = prestataire(),
): Promise<BilanTaches | null> {
  return getDb().transaction(async (tx) => {
    const verrou = await tx.execute<{ pris: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('taches')) as pris`);
    if (!verrou.rows[0]?.pris) return null;
    // Le travail se fait sur d'autres connexions ; le verrou tient tant que
    // cette transaction reste ouverte.
    return {
      soldes: await traiterSoldes(maintenant, p),
      virements: await traiterVirements(maintenant),
      cautions: await traiterCautions(maintenant, p),
      abandons: await effacerAbandons(maintenant, p),
      avis: await traiterAvis(maintenant),
      remboursements: await traiterRemboursements(p),
    };
  });
}
