// Chargement d'une réservation avec son gîte joint.
//
// L'ancien client REST imbriquait automatiquement le gîte dans `resa.gites`.
// Drizzle n'a pas d'équivalent : la jointure est écrite explicitement ici et
// l'objet est reconstruit sous la forme exacte qu'attendent calculerMontants
// et mapContratData (lib/montants.ts). Sans le gîte joint, `gite?.caution`
// vaudrait undefined et le contrat sortirait avec la caution par défaut au
// lieu de celle de la base : un échec SILENCIEUX, testé explicitement.
//
// Les types dérivent du schéma db/schema : une colonne renommée ou retirée
// fait échouer la compilation au lieu de produire un document faux.
import { eq } from 'drizzle-orm';

import { getDb, type Db } from '@/db';
import { gites, reservations } from '@/db/schema';

export type ReservationRow = typeof reservations.$inferSelect;
export type GiteRow = typeof gites.$inferSelect;

/** Réservation + gîte joint. `gites` est null si la clé étrangère ne résout pas (jamais en pratique). */
export type ReservationAvecGite = ReservationRow & { gites: GiteRow | null };

/** Client Drizzle ou transaction en cours : les deux exposent `select`. */
export type Executeur = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export async function chargerReservationAvecGite(
  reservationId: string,
  executeur: Executeur = getDb(),
): Promise<ReservationAvecGite | null> {
  const lignes = await executeur
    .select({ resa: reservations, gite: gites })
    .from(reservations)
    .leftJoin(gites, eq(gites.id, reservations.gite_id))
    .where(eq(reservations.id, reservationId))
    .limit(1);

  const ligne = lignes[0];
  if (!ligne) return null;
  return { ...ligne.resa, gites: ligne.gite };
}
