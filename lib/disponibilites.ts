// Le calendrier en base (table `disponibilites`) : lire les nuits prises,
// poser et lever le BLOCAGE des dates pendant le paiement.
//
// Une nuit est PRISE si elle a une ligne 'reserve' ou 'bloque', ou une ligne
// provisoire ('verrou' pendant un paiement, 'option' posée au téléphone,
// Phase 5 lot 4) dont l'échéance n'est pas passée. Une ligne échue vaut
// libre : elle n'est effacée par aucune tâche, elle est reprise par le client
// suivant (ou par les propriétaires qui ferment la nuit).
//
// Une OPTION garde ses nuits pour un seul client : celui qui arrive par son
// lien (reservations.option_id). Pour lui, ces nuits sont libres ; il ne les
// verrouille pas pendant son paiement (l'option les garde déjà, et un retour
// en arrière dans le tunnel ne doit pas les rendre aux autres), et le
// paiement les lui vend.
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

/**
 * Nuits prises d'un gîte sur [du, au[, au format aaaa-mm-jj, triées. Avec
 * `optionId` : les nuits que cette option garde sont libres (le client de
 * l'option, arrivé par son lien).
 */
export async function lireNuitsPrises(
  executeur: Executeur,
  giteId: string,
  du: string,
  au: string,
  optionId: string | null = null,
): Promise<string[]> {
  const resultat = await executeur.execute<{ date: string }>(sql`
    select date::text as date
      from disponibilites
     where gite_id = ${giteId}::uuid
       and date >= ${du}::date and date < ${au}::date
       and (verrou_expire_at is null or verrou_expire_at > now())
       ${optionId ? sql`and option_id is distinct from ${optionId}::uuid` : sql``}
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
           option_id = null,
           created_at = now()
     where disponibilites.verrou_expire_at <= now()
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

export type ResultatVente = { ok: true } | { ok: false; nuitsPrises: string[] };

/**
 * Le paiement a abouti : les nuits [arrivee, depart[ passent de « bloquées »
 * à « vendues » pour la réservation. UNE requête, comme le blocage :
 *   - une nuit encore bloquée pour ELLE (même après l'échéance) est vendue ;
 *   - une nuit gardée par SON option (`optionId`, même échue) est vendue ;
 *   - une nuit libre (sans ligne, ou ligne provisoire échue) est reprise ;
 *   - une nuit prise par un autre (verrou ou option en cours, vendue, fermée)
 *     ne l'est pas.
 * C'est le cas du paiement arrivé après la fin du blocage (D-21) : le résultat
 * dit si TOUTES les nuits sont à elle. Sinon, l'appelant DOIT annuler la
 * transaction (des nuits libres viennent d'être écrites) et rembourser.
 */
export async function vendreNuits(
  tx: Executeur,
  bloc: { giteId: string; reservationId: string; arrivee: string; depart: string; optionId?: string | null },
): Promise<ResultatVente> {
  const nbNuits = nombreDeNuits(bloc.arrivee, bloc.depart);
  if (nbNuits < 1) throw new Error(`vendreNuits : séjour sans nuit (${bloc.arrivee} → ${bloc.depart})`);

  const resultat = await tx.execute<{ date: string }>(sql`
    insert into disponibilites (gite_id, date, statut, source, reservation_id, verrou_expire_at)
    select ${bloc.giteId}::uuid, nuit::date, 'reserve', 'directe', ${bloc.reservationId}::uuid, null
      from generate_series(${bloc.arrivee}::date, ${bloc.depart}::date - 1, interval '1 day') as nuit
    on conflict (gite_id, date) do update
       set statut = 'reserve',
           source = 'directe',
           reservation_id = excluded.reservation_id,
           verrou_expire_at = null,
           option_id = null
     where (disponibilites.statut = 'verrou' and disponibilites.reservation_id = excluded.reservation_id)
        or (disponibilites.statut = 'option' and disponibilites.option_id = ${bloc.optionId ?? null}::uuid)
        or disponibilites.verrou_expire_at <= now()
    returning date::text as date`);

  if (resultat.rows.length === nbNuits) return { ok: true };
  const obtenues = new Set(resultat.rows.map((r) => r.date));
  const nuitsPrises: string[] = [];
  for (let i = 0; i < nbNuits; i += 1) {
    const nuit = ajouterJours(bloc.arrivee, i);
    if (!obtenues.has(nuit)) nuitsPrises.push(nuit);
  }
  return { ok: false, nuitsPrises };
}

/**
 * Rend libres TOUTES les nuits d'une réservation, vendues ou bloquées pour
 * elle : la réservation est annulée par les propriétaires (Phase 5, lot 5).
 * Renvoie le nombre de nuits libérées.
 */
export async function libererNuits(executeur: Executeur, reservationId: string): Promise<number> {
  const resultat = await executeur.execute(sql`
    delete from disponibilites
     where reservation_id = ${reservationId}::uuid and statut in ('reserve', 'verrou')`);
  return resultat.rowCount ?? 0;
}

/** Lève le blocage d'une réservation. Renvoie le nombre de nuits libérées. */
export async function leverBlocage(executeur: Executeur, reservationId: string): Promise<number> {
  const resultat = await executeur.execute(sql`
    delete from disponibilites
     where reservation_id = ${reservationId}::uuid and statut = 'verrou'`);
  return resultat.rowCount ?? 0;
}
