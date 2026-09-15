// Table `documents` : registre des PDF émis (contrat, facture d'acompte,
// facture de solde) pour une réservation.
//
// Lue et écrite par app/api/contrats/route.ts, app/api/contrats/signer/route.ts,
// app/api/factures/route.ts et app/signer/[token]/page.tsx : le chemin de
// stockage est `url_pdf` (chemin relatif dans lib/storage.ts).
//
// - L'index unique (reservation_id, type) est la garantie d'idempotence : un
//   webhook déclenché deux fois ne peut pas créer deux contrats.
// - token / token_expire_at / template_version sont nullables : seuls les
//   contrats portent un jeton de signature, les factures n'en ont pas.
// - Le token est unique quand il existe : la page de signature retrouve le
//   document par ce seul jeton.
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // 'contrat_location' | 'facture_acompte' | 'facture_solde'
    type: text().notNull(),
    // Numéro légal du document (CTR-AAAA-NNN ou FAC-AAAA-NNN).
    numero: text().notNull(),
    // Chemin RELATIF dans le stockage (voir lib/storage.ts), jamais une URL.
    url_pdf: text().notNull(),
    // 'genere' à l'émission, 'signe' après signature électronique.
    statut: text().notNull().default("genere"),
    // Jeton du lien de signature (contrats uniquement).
    token: text(),
    token_expire_at: timestamp({ withTimezone: true }),
    template_version: text(),
    date_signature: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_resa_type_uidx").on(t.reservation_id, t.type),
    uniqueIndex("documents_token_uidx")
      .on(t.token)
      .where(sql`${t.token} is not null`),
  ],
);
