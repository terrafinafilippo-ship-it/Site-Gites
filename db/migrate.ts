// Applique les migrations SQL de db/migrations/ (journal Drizzle) à la base
// DATABASE_URL. Chaque migration non encore appliquée est exécutée dans l'ordre
// du journal, le tout dans UNE transaction : tout ou rien.
//
// Lancer : npm run db:migrate
import "./env";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "./index";

const DOSSIER_MIGRATIONS = "db/migrations";
const TABLE_SUIVI = "__drizzle_migrations";
const SCHEMA_SUIVI = "drizzle";

async function main(): Promise<void> {
  const db = getDb();

  await migrate(db, {
    migrationsFolder: DOSSIER_MIGRATIONS,
    migrationsTable: TABLE_SUIVI,
    migrationsSchema: SCHEMA_SUIVI,
  });

  const appliquees = await db.execute<{ id: number; created_at: string }>(
    sql`select id, created_at from drizzle.__drizzle_migrations order by id`,
  );
  console.log(`Migrations appliquées : ${appliquees.rows.length}`);
  for (const ligne of appliquees.rows) {
    console.log(`  - #${ligne.id} (${new Date(Number(ligne.created_at)).toISOString()})`);
  }
}

main()
  .catch((erreur: unknown) => {
    console.error("Échec de la migration :");
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
