// Contraintes communes aux colonnes de RÈGLES de réservation, portées par
// `reglages` (règle générale), `tarifs` et `periodes` (exceptions).
//
// Les jours sont des jours ISO : 1 = lundi … 6 = samedi, 7 = dimanche. Une liste
// vide interdirait toute arrivée : elle est refusée par la base.
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** `colonne` est NULL, ou une liste non vide de jours ISO. */
export function joursIsoValides(colonne: AnyPgColumn, nullable: boolean): SQL {
  const valide = sql`(cardinality(${colonne}) >= 1 and ${colonne} <@ array[1, 2, 3, 4, 5, 6, 7])`;
  return nullable ? sql`(${colonne} is null or ${valide})` : valide;
}

/** `colonne` est NULL, ou un nombre de nuits d'au moins 1. */
export function nuitsMinimumValide(colonne: AnyPgColumn, nullable: boolean): SQL {
  return nullable ? sql`(${colonne} is null or ${colonne} >= 1)` : sql`${colonne} >= 1`;
}
