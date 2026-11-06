// Table `retenues` : la RETENUE sur la caution d'une réservation (Phase 5,
// lot 2, migration 0013, cadrage du 6 novembre 2026). Une seule par
// réservation, quel que soit le moyen de la caution :
//   - carte : la préautorisation est encaissée pour `montant` chez Stripe, le
//     reste est libéré par la banque (paiements.montant_retenu le constate) ;
//   - chèque ou virement : le site ne touche pas à l'argent, il note ce que
//     les propriétaires gardent ; le reste est rendu (reservations.caution_rendue_at).
//
// La ligne naît AVANT l'encaissement par carte (`faite_at` vide) : une panne
// entre la réponse de Stripe et l'écriture laisse le motif et les
// justificatifs ; un échec de l'encaissement efface la ligne. `faite_at`
// renseignée : la retenue est faite, le courriel au client est inscrit.
//
// `motif` est obligatoire (réponse 3 A) : il part au client avec les
// justificatifs (`pieces` : nom, chemin dans le stockage, taille, type),
// 10 Mo au plus en tout, gardés sur le serveur (réponse 7 A du cadrage).
import { sql } from "drizzle-orm";
import { check, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export interface PieceJustificative {
  nom: string;
  chemin: string;
  /** Octets. */
  taille: number;
  type: string;
}

export const retenues = pgTable(
  "retenues",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    montant: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    motif: text().notNull(),
    moyen: text().$type<"carte" | "cheque" | "virement">().notNull(),
    pieces: jsonb().$type<PieceJustificative[]>().notNull().default([]),
    // Qui a agi (« gestion (Chrome sur Windows) »), comme audit_logs.
    acteur: text().notNull(),
    faite_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("retenues_reservation_uidx").on(t.reservation_id),
    check("retenues_montant_check", sql`${t.montant} > 0`),
    check("retenues_motif_check", sql`length(trim(${t.motif})) > 0`),
    check("retenues_moyen_check", sql`${t.moyen} in ('carte', 'cheque', 'virement')`),
  ],
);
