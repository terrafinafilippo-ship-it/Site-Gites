// Client Drizzle partagé par toute l'application (côté serveur uniquement).
//
// Le pool node-postgres (max 10 connexions) est instancié UNE seule fois et
// mis en cache sur globalThis : en développement, Next.js recharge les modules
// à chaque modification de fichier, et sans ce cache chaque rechargement
// ouvrirait un nouveau pool jusqu'à épuiser les connexions du serveur.
//
// Création paresseuse : rien n'est ouvert avant le premier appel à getDb(),
// ce qui permet à `next build` de réussir sans DATABASE_URL.
//
// BASE DE TEST : quand DB_CIBLE vaut exactement "test", la connexion utilise
// DATABASE_URL_TEST (base gites_test) au lieu de DATABASE_URL. Chaque contrat,
// facture ou signature de test consomme sinon un numéro légal irrécupérable
// sur la base réelle. DATABASE_URL n'est jamais modifiée par le code.
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };

const POOL_MAX = 10;

const globalCache = globalThis as unknown as {
  __siteGitesDb?: { pool: Pool; db: Db };
};

/** Chaîne de connexion effective : base de test si DB_CIBLE=test, sinon base réelle. */
export function resoudreDatabaseUrl(): string {
  if (process.env.DB_CIBLE === "test") {
    const urlTest = process.env.DATABASE_URL_TEST;
    if (!urlTest) {
      throw new Error(
        "DB_CIBLE=test mais DATABASE_URL_TEST manquante : renseignez-la dans .env.local (voir .env.example).",
      );
    }
    console.warn("[db] DB_CIBLE=test : connexion à la BASE DE TEST (DATABASE_URL_TEST).");
    return urlTest;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL manquante : renseignez-la dans .env.local (voir .env.example).",
    );
  }
  return url;
}

function createPool(): Pool {
  return new Pool({
    connectionString: resoudreDatabaseUrl(),
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
