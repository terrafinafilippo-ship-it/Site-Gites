// Table `audit_logs` — VERSION PROVISOIRE (Phase 0).
//
// Journal des actions sensibles (changement de statut, annulation, émission
// de document...). Aucun trigger ne l'alimente encore ; le mécanisme de
// remplissage sera décidé en Phase 3. ligne_id est en texte pour couvrir
// aussi les tables sans clé uuid (compteurs_documents).
//
// Premier usage (Phase 4, lot 3, D-31) : l'effacement automatique d'une
// tentative abandonnée (lib/tunnel.ts, abandonnerTentative) écrit
// action = 'effacement_tentative', acteur = 'systeme', et dans details la
// référence, la date de création, le motif et l'identifiant de la fiche
// client Stripe — jamais le nom ni le courriel du client.
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
