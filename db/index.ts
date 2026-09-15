// Client Drizzle partagé par toute l'application (côté serveur uniquement).
//
// Le pool node-postgres (max 10 connexions) est instancié UNE seule fois et
// mis en cache sur globalThis : en développement, Next.js recharge les modules
// à chaque modification de fichier, et sans ce cache chaque rechargement
// ouvrirait un nouveau pool jusqu'à épuiser les connexions du serveur.
//
// Création paresseuse : rien n'est ouvert avant le premier appel à getDb(),
// ce qui permet à `next build` de réussir sans DATABASE_URL.
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };

const POOL_MAX = 10;

const globalCache = globalThis as unknown as {
  __siteGitesDb?: { pool: Pool; db: Db };
};

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL manquante : renseignez-la dans .env.local (voir .env.example).",
    );
  }
  return new Pool({
    connectionString: url,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Client Drizzle typé sur le schéma, adossé au pool partagé. */
export function getDb(): Db {
  if (!globalCache.__siteGitesDb) {
    const pool = createPool();
    globalCache.__siteGitesDb = { pool, db: drizzle({ client: pool, schema }) };
  }
  return globalCache.__siteGitesDb.db;
}

/** Pool brut, pour les scripts qui ont besoin de transactions SQL manuelles. */
export function getPool(): Pool {
  return getDb().$client;
}

/** Ferme le pool (scripts en ligne de commande uniquement, jamais dans Next). */
export async function closeDb(): Promise<void> {
  const cached = globalCache.__siteGitesDb;
  if (!cached) return;
  globalCache.__siteGitesDb = undefined;
  await cached.pool.end();
}

export { schema };
