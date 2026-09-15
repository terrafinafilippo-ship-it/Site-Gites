// Modifie le prix de location d'une réservation de test, en CENTIMES.
// Sert à éprouver la garde du « cas B » : une réservation modifiée après
// l'émission de sa facture d'acompte doit faire refuser la facture de solde
// (HTTP 409), sans consommer de numéro.
//
//   DB_CIBLE=test npx tsx scripts/parcours/prix-location.ts TEST-2026-LAPHINE-002 70000
//   DB_CIBLE=test npx tsx scripts/parcours/prix-location.ts TEST-2026-LAPHINE-002 --reference
//
// --reference : rétablit le prix de référence du jeu de test (reference.ts).
import "../../db/env";

import { Pool } from "pg";

import { numericDepuisCentimes } from "../../lib/centimes";
import { reservationReference } from "./reference";

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error("DB_CIBLE doit valoir \"test\" : ce script modifie une réservation.");
  }
  const reference = process.argv[2];
  const valeur = process.argv[3];
  if (!reference || !valeur) {
    throw new Error("Usage : prix-location.ts <reference> <centimes entiers | --reference>");
  }
  const resa = reservationReference(reference); // refuse une référence hors jeu de test
  const centimes = valeur === "--reference" ? resa.attendu.prixLocation : Number(valeur);
  if (!Number.isSafeInteger(centimes)) {
    throw new Error(`Centimes entiers attendus, reçu « ${valeur} ».`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
  try {
    const { rows } = await pool.query<{ prix: string; fac: number | null }>(
      `update reservations set prix_location = $1 where reference = $2
       returning prix_location::text as prix,
                 (select dernier_numero from compteurs_documents where serie = 'FAC') as fac`,
      [numericDepuisCentimes(centimes), reference],
    );
    if (rows.length !== 1) throw new Error(`Réservation ${reference} introuvable.`);
    console.log(`${reference} : prix_location = ${rows[0].prix} € ; compteur FAC = ${rows[0].fac}`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
