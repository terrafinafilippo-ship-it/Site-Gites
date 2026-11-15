// Tables `annulations` et `remboursements` : l'ANNULATION d'une réservation
// par les propriétaires, depuis le back-office (Phase 5, lot 5, migration
// 0023, D-42).
//
// `annulations` : une ligne par réservation annulée, écrite dans la même
// transaction que le passage au statut « annulee ». Elle garde la règle de
// l'article 7 appliquée et son résultat, figés au moment de l'annulation :
//   - `initiative` : 'client' (art. 7.2), 'bailleur' (le Bailleur ou la force
//     majeure, 7.3 et 7.4 : tout est rendu), 'absence' (7.5 : tout est gardé
//     sauf la taxe de séjour) ;
//   - `prevenu_le` : quand le client a prévenu, heure civile de Paris
//     (réponse 6 A) — c'est elle, pas le jour du clic, qui choisit la règle ;
//     seulement pour 'client' ;
//   - `paye`, `conserve`, `rembourse` (dont `taxe_remboursee`) :
//     paye = conserve + rembourse. `conserve` est toujours hors taxe de séjour
//     (la taxe payée est rendue dans tous les cas) : les statistiques le
//     comptent dans les séjours, au mois de l'arrivée (réponse 5 A).
//
// `remboursements` : les mouvements qui rendent `rembourse` au client, écrits
// dans la même transaction (« a_faire ») AVANT tout appel à Stripe :
//   - 'carte' : sur un paiement par carte (`paiement_id`), le plus récent
//     d'abord, jusqu'à ce qu'il a payé (réponse 2 A) ; le site rembourse chez
//     Stripe avec une clé d'idempotence, puis passe la ligne à « fait ». Une
//     panne entre les deux se rattrape au passage suivant des tâches ; un
//     refus de Stripe la change en 'virement' (`erreur` garde la raison) ;
//   - 'virement' : le reste, que les propriétaires virent depuis la banque,
//     puis « Remboursement fait » (`fait_par`).
// Quand tout est « fait », l'avoir part au client s'il existe une facture.
import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { paiements } from "./paiements";
import { reservations } from "./reservations";

export const INITIATIVES_ANNULATION = ["client", "bailleur", "absence"] as const;
export type InitiativeAnnulationEnBase = (typeof INITIATIVES_ANNULATION)[number];

export const annulations = pgTable(
  "annulations",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    initiative: text().$type<InitiativeAnnulationEnBase>().notNull(),
    // Heure civile de Paris, sans fuseau (« 2027-02-15 14:30 »).
    prevenu_le: timestamp({ mode: "string" }),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    paye: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    conserve: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    rembourse: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    taxe_remboursee: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    // Le jour de l'arrivée, recopié : les statistiques rangent `conserve` à ce mois.
    date_arrivee: date({ mode: "string" }).notNull(),
    // Qui a agi (« gestion (Chrome sur Windows) »), comme audit_logs.
    acteur: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("annulations_reservation_uidx").on(t.reservation_id),
    check("annulations_initiative_check", sql`${t.initiative} in ('client', 'bailleur', 'absence')`),
    check("annulations_prevenu_check", sql`(${t.initiative} = 'client') = (${t.prevenu_le} is not null)`),
    check(
      "annulations_montants_check",
      sql`${t.conserve} >= 0 and ${t.rembourse} >= 0 and ${t.paye} = ${t.conserve} + ${t.rembourse}
          and ${t.taxe_remboursee} >= 0 and ${t.taxe_remboursee} <= ${t.rembourse}`,
    ),
  ],
);

export const MODES_REMBOURSEMENT = ["carte", "virement"] as const;
export type ModeRemboursement = (typeof MODES_REMBOURSEMENT)[number];

export const remboursements = pgTable(
  "remboursements",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // Le paiement par carte remboursé ; NULL pour un virement.
    paiement_id: uuid().references(() => paiements.id),
    mode: text().$type<ModeRemboursement>().notNull(),
    montant: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    statut: text().$type<"a_faire" | "fait">().notNull().default("a_faire"),
    // Remboursement chez Stripe (« re_… »).
    reference_externe: text(),
    // Pourquoi un remboursement par carte est devenu un virement (refus de Stripe).
    erreur: text(),
    fait_at: timestamp({ withTimezone: true }),
    // Virement : qui a cliqué « Remboursement fait ».
    fait_par: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("remboursements_reservation_idx").on(t.reservation_id),
    uniqueIndex("remboursements_paiement_uidx").on(t.paiement_id).where(sql`${t.paiement_id} is not null`),
    check("remboursements_mode_check", sql`${t.mode} in ('carte', 'virement')`),
    check("remboursements_statut_check", sql`${t.statut} in ('a_faire', 'fait')`),
    check("remboursements_montant_check", sql`${t.montant} > 0`),
    check("remboursements_carte_check", sql`${t.mode} <> 'carte' or ${t.paiement_id} is not null`),
    check("remboursements_fait_check", sql`(${t.statut} = 'fait') = (${t.fait_at} is not null)`),
  ],
);
