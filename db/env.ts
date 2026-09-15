// Charge .env.local (et .env) pour les scripts en ligne de commande (seed,
// verify), exactement comme Next.js le fait pour l'application. À importer en
// PREMIER dans chaque script : les imports s'exécutent dans l'ordre.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
