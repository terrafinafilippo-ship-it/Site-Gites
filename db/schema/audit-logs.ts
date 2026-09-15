// Table `audit_logs` — VERSION PROVISOIRE (Phase 0).
//
// Journal des actions sensibles (changement de statut, annulation, émission
// de document...). Aucun trigger ne l'alimente encore ; le mécanisme de
// remplissage sera décidé en Phase 3. ligne_id est en texte pour couvrir
// aussi les tables sans clé uuid (compteurs_documents).
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const audit_logs = pgTable("audit_logs", {
  id: uuid().primaryKey().defaultRandom(),
  table_cible: text().notNull(),
  ligne_id: text(),
  action: text().notNull(),
  // Qui a agi : identifiant d'utilisateur, 'systeme', 'webhook'...
  acteur: text(),
  details: jsonb().$type<Record<string, unknown>>(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
