// Configuration drizzle-kit (génération et application des migrations).
//
// - Le schéma TypeScript vit dans db/schema/ et fait foi.
// - Les migrations SQL générées sont versionnées dans db/migrations/.
// - La connexion vient de DATABASE_URL (fichier .env.local en développement,
//   variable d'environnement injectée par Coolify en production).
//
// @next/env charge .env.local exactement comme le fait Next.js, ce qui évite
// d'avoir deux mécanismes de chargement différents.
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    // `generate` n'a pas besoin de connexion ; `migrate` échouera clairement
    // si la variable est absente.
    url: process.env.DATABASE_URL ?? "",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  strict: true,
  verbose: true,
});
