// Imprime l'identifiant (uuid) d'une réservation de test à partir de sa
// référence, pour que les scripts shell n'aient pas d'uuid en dur.
//
//   DB_CIBLE=test npx tsx scripts/parcours/id-reservation.ts TEST-2026-ARMU-001
import "../../db/env";

import { Pool } from "pg";

import { reservationReference } from "./reference";

async function main(): Promise<void> {
  const reference = process.argv[2];
  if (!reference) throw new Error("Usage : id-reservation.ts <reference>");
  reservationReference(reference); // refuse une référence hors jeu de test

  const url = process.env.DB_CIBLE === "test" ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("Chaîne de connexion absente (DATABASE_URL_TEST avec DB_CIBLE=test).");

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ id: string }>(
      "select id from reservations where reference = $1",
      [reference],
    );
    if (rows.length !== 1) {
      throw new Error(
        `Réservation ${reference} introuvable : lancez d'abord scripts/parcours/reinitialiser.ts.`,
      );
    }
    process.stdout.write(rows[0].id);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
