// Le JOURNAL des gestes sensibles du back-office (Phase 5, lot 1, D-32), dans
// `audit_logs`. Choix du gérant (3 novembre 2026) : on le garde, invisible,
// réservé aux gestes sensibles — connexion d'un nouvel appareil, mot de passe,
// appareil retiré, réglage modifié (valeur avant et après). Le compte étant
// partagé, il ne dit pas QUI a agi, mais quoi, quand, et depuis quel appareil :
// si le compte de virement change un jour, on sait depuis quand et quel était
// l'ancien.
//
// L'écriture se fait dans la transaction du geste : pas de geste sans trace.
import { audit_logs } from "@/db/schema";
import type { Executeur } from "@/lib/reservations";

/** Qui agit : un appareil connecté au back-office, ou la commande `gestion:compte`. */
export type Acteur = { appareilId: string; description: string; ip: string } | "commande" | "visiteur";

export function libelleActeur(a: Acteur): string {
  return typeof a === "string" ? a : `gestion (${a.description})`;
}

export async function journaliser(
  ex: Executeur,
  e: { table: string; ligne?: string | null; action: string; acteur: Acteur; details?: Record<string, unknown> },
): Promise<void> {
  await ex.insert(audit_logs).values({
    table_cible: e.table,
    ligne_id: e.ligne ?? null,
    action: e.action,
    acteur: libelleActeur(e.acteur),
    details: {
      ...(typeof e.acteur === "string" ? {} : { appareil_id: e.acteur.appareilId, ip: e.acteur.ip }),
      ...(e.details ?? {}),
    },
  });
}
