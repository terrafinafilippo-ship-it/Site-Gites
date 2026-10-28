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
// Tarification (Phase 3, lot 1 — décisions D-17 et D-18).
export * from "./baremes";
export * from "./baremes-coefficients";
export * from "./tarifs";
export * from "./tarifs-prix";
export * from "./periodes";
export * from "./reglages";
export * from "./taxes-sejour";
// Paiement (Phase 3, lot 3).
export * from "./textes-accord";
// Courriels (Phase 3, lot 4).
export * from "./courriels";
export * from "./alertes";
