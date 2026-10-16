// Le calendrier en base (table `disponibilites`) : lire les nuits prises,
// poser et lever le BLOCAGE des dates pendant le paiement.
//
// Une nuit est PRISE si elle a une ligne 'reserve' ou 'bloque', ou une ligne
// 'verrou' dont l'échéance n'est pas passée. Un verrou expiré vaut libre : il
// n'est effacé par aucune tâche, il est repris par le client suivant.
//
// LA DOUBLE VENTE EST IMPOSSIBLE PAR CONSTRUCTION. Le blocage est UNE requête
// « insérer, ou reprendre un verrou expiré » sur l'index unique (gite_id,
// date). Deux clients qui bloquent la même nuit au même instant : PostgreSQL
// fait attendre le second jusqu'à la fin de la transaction du premier, puis
// lui refuse la nuit. Aucun « vérifier puis écrire » en deux temps, qui
// laisserait passer les deux. Éprouvé par scripts/verifier-blocage.ts.
import { sql } from "drizzle-orm";

import { ajouterJours, nombreDeNuits } from "@/lib/dates-civiles";
import type { Executeur } from "@/lib/reservations";

/** Nuits prises d'un gîte sur [du, au[, au format aaaa-mm-jj, triées. */
export async function lireNuitsPrises(
  executeur: Executeur,
  giteId: string,
  du: string,
  au: string,
): Promise<string[]> {
  const resultat = await executeur.execute<{ date: string }>(sql`
    select date::text as date
      from disponibilites
     where gite_id = ${giteId}::uuid
       and date >= ${du}::date and date < ${au}::date
       and (statut <> 'verrou' or verrou_expire_at > now())
     order by date`);
  return resultat.rows.map((r) => r.date);
}

export type ResultatBlocage =
  | { ok: true; expireA: Date }
  | { ok: false; nuitsPrises: string[] };

/**
 * Bloque les nuits [arrivee, depart[ pour une réservation, pendant `minutes`.
 *
 * À appeler DANS LA TRANSACTION qui crée la réservation : si une seule nuit est
 * déjà prise, le résultat est un refus et l'appelant DOIT annuler la
 * transaction (les nuits libres viennent d'être écrites).
 */
export async function poserBlocage(
  tx: Executeur,
  bloc: { giteId: string; reservationId: string; arrivee: string; depart: string; minutes: number },
): Promise<ResultatBlocage> {
  const nbNuits = nombreDeNuits(bloc.arrivee, bloc.depart);
  if (nbNuits < 1) throw new Error(`poserBlocage : séjour sans nuit (${bloc.arrivee} → ${bloc.depart})`);

  const resultat = await tx.execute<{ date: string; expire: Date }>(sql`
    insert into disponibilites (gite_id, date, statut, source, reservation_id, verrou_expire_at)
    select ${bloc.giteId}::uuid, nuit::date, 'verrou', 'directe', ${bloc.reservationId}::uuid,
           now() + make_interval(mins => ${bloc.minutes}::int)
      from generate_series(${bloc.arrivee}::date, ${bloc.depart}::date - 1, interval '1 day') as nuit
    on conflict (gite_id, date) do update
       set statut = 'verrou',
           source = 'directe',
           reservation_id = excluded.reservation_id,
           verrou_expire_at = excluded.verrou_expire_at,
           created_at = now()
     where disponibilites.statut = 'verrou'
       and disponibilites.verrou_expire_at <= now()
    returning date::text as date, verrou_expire_at as expire`);

  if (resultat.rows.length === nbNuits) {
    return { ok: true, expireA: new Date(resultat.rows[0].expire) };
  }
  const obtenues = new Set(resultat.rows.map((r) => r.date));
  const nuitsPrises: string[] = [];
  for (let i = 0; i < nbNuits; i += 1) {
    const nuit = ajouterJours(bloc.arrivee, i);
    if (!obtenues.has(nuit)) nuitsPrises.push(nuit);
  }
  return { ok: false, nuitsPrises };
}

/** Lève le blocage d'une réservation. Renvoie le nombre de nuits libérées. */
export async function leverBlocage(executeur: Executeur, reservationId: string): Promise<number> {
  const resultat = await executeur.execute(sql`
    delete from disponibilites
     where reservation_id = ${reservationId}::uuid and statut = 'verrou'`);
  return resultat.rowCount ?? 0;
}
