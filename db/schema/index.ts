// Point d'entrée du schéma : drizzle.config.ts et db/index.ts importent ce
// fichier. Ajouter ici toute nouvelle table.
export * from "./gites";
export * from "./reservations";
export * from "./documents";
export * from "./signatures";
export * from "./factures";
export * from "./compteurs-documents";
export * from "./paiements";
export * from "./disponibilites";
export * from "./avis";
export * from "./audit-logs";
