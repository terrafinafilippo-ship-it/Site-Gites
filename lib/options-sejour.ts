// LES OPTIONS posées au téléphone, côté site public (Phase 5, lot 4,
// réponse 1 B du cadrage du 7 novembre 2026) : retrouver une option par le
// jeton de son lien, dire si elle garde encore ses dates. La pose et la levée
// sont dans le back-office (lib/gestion/calendrier.ts) ; le tunnel s'en sert
// pour laisser son client réserver les nuits qu'elle garde (lib/tunnel.ts).
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { gites, options_sejour } from "@/db/schema";
import { isGiteId, type GiteId } from "@/lib/data/gites";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import type { Executeur } from "@/lib/reservations";
import { FORME_JETON } from "@/lib/suivi";

export type EtatOption = "en_cours" | "echue" | "levee" | "utilisee";

export interface OptionLue {
  id: string;
  giteId: string;
  slug: GiteId;
  gite: string;
  arrivee: string;
  depart: string;
  clientNom: string;
  clientEmail: string;
  langue: "fr" | "en";
  jeton: string;
  expireAt: Date;
  etat: EtatOption;
}

type LigneOption = Pick<typeof options_sejour.$inferSelect, "expire_at" | "levee_at" | "utilisee_at">;

export function etatOption(o: LigneOption, maintenant: Date = new Date()): EtatOption {
  if (o.utilisee_at) return "utilisee";
  if (o.levee_at) return "levee";
  return o.expire_at.getTime() <= maintenant.getTime() ? "echue" : "en_cours";
}

/**
 * Dernier jour où l'option garde les dates, inclus (aaaa-mm-jj) : l'échéance
 * tombe à minuit, heure de Paris, au début du jour suivant.
 */
export function dernierJourOption(expireAt: Date): string {
  return aujourdhuiParis(new Date(expireAt.getTime() - 1));
}

/** L'option d'un lien, ou `null` (jeton mal formé ou inconnu). */
export async function lireOptionParJeton(jeton: string, ex: Executeur = getDb()): Promise<OptionLue | null> {
  if (!FORME_JETON.test(jeton)) return null;
  const [l] = await ex
    .select({ o: options_sejour, slug: gites.slug, gite: gites.nom })
    .from(options_sejour)
    .innerJoin(gites, eq(gites.id, options_sejour.gite_id))
    .where(eq(options_sejour.jeton, jeton));
  if (!l || !isGiteId(l.slug)) return null;
  return {
    id: l.o.id,
    giteId: l.o.gite_id,
    slug: l.slug,
    gite: l.gite,
    arrivee: l.o.date_arrivee,
    depart: l.o.date_depart,
    clientNom: l.o.client_nom,
    clientEmail: l.o.client_email,
    langue: l.o.langue === "en" ? "en" : "fr",
    jeton: l.o.jeton,
    expireAt: l.o.expire_at,
    etat: etatOption(l.o),
  };
}
