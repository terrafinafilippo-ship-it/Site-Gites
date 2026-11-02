// Table `paiements` : chaque mouvement d'argent lié à une réservation —
// acompte ou total à la réservation (Phase 3, lot 3), solde et caution
// (Phase 4). Forme définitive depuis la migration 0005.
//
// UNE LIGNE PAR PAIEMENT CHEZ LE PRESTATAIRE (PaymentIntent Stripe). Elle naît
// « en_attente » quand le client arrive sur l'écran de paiement, et suit :
//   - 'reussi'       : argent reçu, la réservation est confirmée ;
//   - 'echoue'       : refus de la banque (le client peut réessayer : même ligne) ;
//   - 'annule'       : paiement annulé avant d'aboutir (le client est revenu en arrière) ;
//   - 'a_rembourser' : argent reçu mais la réservation ne peut pas être honorée
//                      (dates reprises par un autre client après la fin du
//                      blocage) : le remboursement est à faire ou à retenter ;
//   - 'rembourse'    : remboursement intégral accepté par le prestataire.
// Le passage par 'a_rembourser' est écrit AVANT d'appeler le prestataire : une
// panne entre les deux laisse une trace, et le traitement suivant (retour du
// client ou avis de Stripe) termine le remboursement.
//
// SOLDE (Phase 4, lot 1, D-28) : une ligne par paiement du solde chez le
// prestataire. Le PRÉLÈVEMENT automatique naît « en_attente » SANS
// `reference_externe`, AVANT l'appel au prestataire, puis reçoit sa référence
// à la réponse : une panne entre les deux laisse une trace, et le passage
// suivant des tâches rejoue l'appel avec la même clé d'idempotence (jamais
// deux prélèvements). Le paiement par LIEN naît quand le client ouvre le
// formulaire (lib/solde.ts) ; un prélèvement refusé se paie ensuite par le
// lien, sur le MÊME paiement chez le prestataire.
//
// CAUTION PAR CARTE (Phase 4, lot 2, migration 0010, D-16) : UNE ligne par
// réservation (index unique), la préautorisation chez le prestataire. Elle
// naît « en_attente » SANS `reference_externe` avant l'appel, la veille du
// départ (même reprise sans double appel que le prélèvement du solde), puis :
//   - 'bloque'  : fonds bloqués sur la carte, rien n'est débité ; `expire_at`
//                 est la date limite de la banque pour encaisser (lue chez
//                 Stripe, jamais recalculée) ;
//   - 'echoue'  : refusée, ou authentification exigée : le client la valide
//                 en ligne, sur le MÊME paiement (il redevient 'bloque') ;
//   - 'libere'  : préautorisation levée (`date_liberation`), rien n'a été
//                 débité ; aussi quand la banque la laisse expirer ;
//   - 'retenu'  : encaissée en tout ou partie (`montant_retenu`, le reste est
//                 libéré par la banque) — depuis l'écran de gestion (Phase 5)
//                 ou le tableau de bord Stripe ;
//   - 'annule'  : jamais bloquée (refusée puis close au moment de la levée).
// `montant` est celui de la préautorisation, recopié de reservations.caution.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const TYPES_PAIEMENT = ["acompte", "total", "solde", "caution"] as const;
export type TypePaiement = (typeof TYPES_PAIEMENT)[number];

export const STATUTS_PAIEMENT = [
  "en_attente",
  "reussi",
  "echoue",
  "annule",
  "a_rembourser",
  "rembourse",
  // Caution seulement (migration 0010).
  "bloque",
  "libere",
  "retenu",
] as const;
export type StatutPaiement = (typeof STATUTS_PAIEMENT)[number];

export const paiements = pgTable(
  "paiements",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    // 'total' : paiement intégral à la réservation (D-20).
    type: text().$type<TypePaiement>().notNull(),
    // Euros côté SQL, lu en TEXTE ; centimes en mémoire (lib/centimes.ts).
    montant: numeric({ precision: 10, scale: 2, mode: "string" }).notNull(),
    statut: text().$type<StatutPaiement>().notNull(),
    // Prestataire (« stripe »). NULL pour un règlement saisi à la main (Phase 5).
    prestataire: text(),
    // Identifiant du paiement chez le prestataire (PaymentIntent « pi_… »).
    reference_externe: text(),
    date_paiement: timestamp({ withTimezone: true }),
    // Remboursement intégral (paiement arrivé sur des dates reprises).
    motif_remboursement: text(),
    reference_remboursement: text(),
    date_remboursement: timestamp({ withTimezone: true }),
    // Caution (migration 0010) : date limite de la banque pour encaisser la
    // préautorisation (`capture_before` de Stripe) ; montant encaissé sur
    // retenue ; levée de la préautorisation.
    expire_at: timestamp({ withTimezone: true }),
    montant_retenu: numeric({ precision: 10, scale: 2, mode: "string" }),
    date_liberation: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Entretenu par le trigger paiements_set_updated_at (migration 0005).
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("paiements_reservation_id_idx").on(t.reservation_id),
    uniqueIndex("paiements_reference_externe_uidx").on(t.reference_externe),
    check("paiements_type_check", sql`${t.type} in ('acompte', 'total', 'solde', 'caution')`),
    // Une seule caution par réservation : la même préautorisation sert du blocage à la levée.
    uniqueIndex("paiements_caution_uidx").on(t.reservation_id).where(sql`${t.type} = 'caution'`),
    check(
      "paiements_statut_check",
      sql`${t.statut} in ('en_attente', 'reussi', 'echoue', 'annule', 'a_rembourser', 'rembourse', 'bloque', 'libere', 'retenu')`,
    ),
    check(
      "paiements_remboursement_check",
      sql`${t.statut} not in ('a_rembourser', 'rembourse') or ${t.motif_remboursement} is not null`,
    ),
    // États et colonnes de la caution : jamais sur un autre paiement.
    check(
      "paiements_caution_check",
      sql`${t.type} = 'caution' or (${t.statut} not in ('bloque', 'libere', 'retenu')
          and ${t.expire_at} is null and ${t.montant_retenu} is null and ${t.date_liberation} is null)`,
    ),
    check(
      "paiements_retenue_check",
      sql`(${t.statut} = 'retenu') = (${t.montant_retenu} is not null)
          and (${t.montant_retenu} is null or (${t.montant_retenu} > 0 and ${t.montant_retenu} <= ${t.montant}))`,
    ),
  ],
);
