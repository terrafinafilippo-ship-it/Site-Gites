// Table `signatures` : preuve de signature électronique simple (SES) d'un
// contrat. Une ligne = une preuve, écrite une seule fois.
//
// LE CODE DE Logiciel-contrat- FAIT FOI (app/api/contrats/signer/route.ts) :
// la clé vers le document s'appelle `document_id` (pas contrat_id).
//
// - Immutabilité : un trigger BEFORE UPDATE OR DELETE (migration 0001) lève
//   une exception. Une preuve modifiable n'a aucune valeur juridique.
// - Un seul enregistrement par document (index unique) : le code attend qu'un
//   second INSERT échoue en cas de double clic.
// - ip_signataire est un `inet` nullable : le code doit écrire NULL quand
//   l'adresse est inconnue (jamais une chaîne comme 'inconnue').
import { index, inet, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { documents } from "./documents";
import { reservations } from "./reservations";

export const signatures = pgTable(
  "signatures",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    document_id: uuid()
      .notNull()
      .references(() => documents.id),
    signataire_nom: text().notNull(),
    signataire_email: text(),
    // Jeton de signature utilisé, recopié depuis documents.token.
    token: text().notNull(),
    // Texte de consentement affiché et accepté, mot pour mot.
    consentement_texte: text().notNull(),
    // SHA-256 hexadécimal des octets exacts du PDF non signé.
    document_hash: text().notNull(),
    // Chemin de stockage du PDF non signé au moment de la signature.
    document_storage_path: text().notNull(),
    ip_signataire: inet(),
    user_agent: text().notNull(),
    signe_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signatures_document_id_uidx").on(t.document_id),
    index("signatures_reservation_id_idx").on(t.reservation_id),
  ],
);
