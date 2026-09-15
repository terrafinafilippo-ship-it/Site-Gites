// Chargement d'une réservation avec son gîte joint.
//
// L'ancien client REST imbriquait automatiquement le gîte dans `resa.gites`.
// Drizzle n'a pas d'équivalent : la jointure est écrite explicitement ici et
// l'objet est reconstruit sous la forme exacte qu'attendent calculerMontants
// et mapContratData (lib/montants.ts). Sans le gîte joint, `gite?.caution`
// vaudrait undefined et le contrat sortirait avec la caution par défaut au
// lieu de celle de la base : un échec SILENCIEUX, testé explicitement.
//
// FRONTIÈRE BASE → MÉMOIRE DES MONTANTS : les colonnes numeric arrivent en
// TEXTE ("457.30", mode "string" du schéma) et sont converties ICI en centimes
// entiers (45730) par centimesDepuisNumeric (lib/centimes.ts). Au-delà de ce
// fichier, aucun montant n'est une chaîne ni un flottant.
//
// Les types dérivent du schéma db/schema : une colonne renommée ou retirée
// fait échouer la compilation au lieu de produire un document faux.
import { eq } from 'drizzle-orm';

import { getDb, type Db } from '@/db';
import { gites, reservations } from '@/db/schema';
import { centimesDepuisNumeric } from '@/lib/centimes';

type ReservationRowDb = typeof reservations.$inferSelect;
type GiteRowDb = typeof gites.$inferSelect;

// Colonnes de MONTANT (pas les taux) converties en centimes à la lecture.
const MONTANTS_RESERVATION = ['prix_location', 'forfait_menage', 'options', 'taxe_sejour'] as const;
const MONTANTS_GITE = ['forfait_menage', 'caution', 'tarif_semaine_base', 'tarif_weekend'] as const;

/** Colonnes K passées du texte numeric aux centimes entiers, nullabilité conservée. */
type EnCentimes<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] extends string ? number : number | null;
};

/** Ligne `reservations` avec ses montants en centimes. */
export type ReservationRow = EnCentimes<ReservationRowDb, (typeof MONTANTS_RESERVATION)[number]>;
/** Ligne `gites` avec ses montants en centimes. */
export type GiteRow = EnCentimes<GiteRowDb, (typeof MONTANTS_GITE)[number]>;

/** Réservation + gîte joint. `gites` est null si la clé étrangère ne résout pas (jamais en pratique). */
export type ReservationAvecGite = ReservationRow & { gites: GiteRow | null };

/** Client Drizzle ou transaction en cours : les deux exposent `select`. */
export type Executeur = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

function enCentimes<T extends object, K extends keyof T & string>(
  ligne: T,
  colonnes: readonly K[],
): EnCentimes<T, K> {
  const copie = { ...ligne } as Record<string, unknown>;
  for (const colonne of colonnes) {
    copie[colonne] = centimesDepuisNumeric(ligne[colonne] as unknown as string | null);
  }
  return copie as unknown as EnCentimes<T, K>;
}

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
  return {
    ...enCentimes(ligne.resa, MONTANTS_RESERVATION),
    gites: ligne.gite ? enCentimes(ligne.gite, MONTANTS_GITE) : null,
  };
}
