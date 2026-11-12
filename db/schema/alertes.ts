// Table `alertes` : les courriels d'ALERTE aux propriétaires (Phase 3, lot 4,
// migration 0006). Une ligne par sorte d'alerte, chacune activable à part,
// avec sa liste de destinataires (cadrage de la Phase 3).
//
// Valeurs initiales (choix du gérant, 27 octobre 2026) : les trois alertes
// actives, envoyées à contact@gitesdesamoyas.fr, la boîte que lisent les
// propriétaires ; l'objet d'un problème commence par « À TRAITER — ».
//   - 'reservation' : une réservation vient d'être payée ;
//   - 'signature'   : un client vient de signer son contrat ;
//   - 'probleme'    : il faut intervenir (paiement remboursé, contrat non
//                     créé ou à envoyer à la main, courriel client non parti).
//   - 'caution'     : (Phase 4, lot 2, migration 0010) la caution d'un client
//                     est bloquée sur sa carte (choix du gérant du 2 novembre
//                     2026 : un court message de validation), elle sera levée
//                     demain, ou une carte vient d'être enregistrée pour elle
//                     (art. 6.6). Créée active, avec les destinataires de
//                     'probleme'. Un refus de la banque est un 'probleme'.
//   - 'avis'        : (Phase 6, migration 0021, D-40) un client vient de
//                     laisser un avis, publié tout de suite : les
//                     propriétaires le lisent, et le retirent s'il tombe sous
//                     un motif affiché. Créée active, avec les destinataires
//                     de 'probleme'.
//
// Les lignes sont créées par la migration : le code ne les crée jamais. Une
// alerte absente ou coupée n'est simplement pas envoyée.
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const TYPES_ALERTE = ["reservation", "signature", "probleme", "caution", "avis"] as const;
export type TypeAlerte = (typeof TYPES_ALERTE)[number];

export const alertes = pgTable(
  "alertes",
  {
    type: text().$type<TypeAlerte>().primaryKey(),
    active: boolean().notNull(),
    destinataires: text().array().notNull(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("alertes_type_check", sql`${t.type} in ('reservation', 'signature', 'probleme', 'caution', 'avis')`),
    check("alertes_destinataires_check", sql`not ${t.active} or cardinality(${t.destinataires}) > 0`),
  ],
);
