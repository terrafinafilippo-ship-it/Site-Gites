// Table `courriels` : le JOURNAL des courriels du site (Phase 3, lot 4,
// migration 0006). Une ligne par courriel et par destinataire.
//
// LA LIGNE NAÎT DANS LA TRANSACTION QUI EN EST LA CAUSE (paiement constaté,
// remboursement décidé, contrat signé) : si la transaction est annulée, le
// courriel n'existe pas ; si elle est validée, il ne peut plus se perdre, même
// si le serveur s'arrête avant de l'envoyer. L'envoi se fait ensuite
// (lib/courriels.ts, traiterCourriels), et se retente :
//   - 'a_envoyer' : en attente, ou à retenter à partir de `prochain_essai_at` ;
//   - 'envoye'    : accepté par Brevo, ou écrit dans un fichier (`voie`) ;
//   - 'echec'     : abandonné après plusieurs essais ; une alerte « À TRAITER »
//                   prévient les propriétaires quand c'était un courriel client.
//
// `cle` rend l'inscription IDEMPOTENTE : un même événement constaté deux fois
// (retour du client et avis de Stripe) n'inscrit qu'un courriel.
//
// `sujet` et `corps_texte` gardent ce qui a été envoyé (preuve de ce que le
// client a reçu). Ce sont des données personnelles : durée de conservation à
// fixer avec le juriste (docs/06-avant-premier-client.md, point 12).
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { reservations } from "./reservations";

export const OBJETS_COURRIEL = [
  // Au client, dans sa langue.
  "confirmation",
  "contrat",
  "remboursement",
  // Lien « Ma réservation » redemandé par le formulaire (D-25).
  "lien_suivi",
  // Phase 4, lot 1 (migration 0009, D-28) : la facture en PDF (acompte,
  // total ou solde), le préavis d'un prélèvement du solde, le lien pour payer
  // le solde, son rappel, le solde impayé.
  "facture",
  "solde_preavis",
  "solde_lien",
  "solde_rappel",
  "solde_impaye",
  // Phase 4, lot 2 (migration 0010, D-16) : caution bloquée sur la carte, à
  // valider (préautorisation refusée), levée ; lien pour enregistrer une
  // carte quand la caution n'a pas été constituée à l'arrivée (art. 6.6).
  "caution_bloquee",
  "caution_a_valider",
  "caution_liberee",
  "caution_carte",
  // Phase 4, lot 3 (migration 0011, D-31) : caution par virement — les
  // coordonnées bancaires et la demande du RIB du client.
  "caution_virement",
  // Phase 5, lot 2 (migration 0013) : retenue sur la caution (motif et
  // justificatifs joints) ; caution par chèque ou virement reçue, rendue.
  "caution_retenue",
  "caution_recue",
  "caution_rendue",
  // Aux propriétaires, en français.
  "alerte_reservation",
  "alerte_signature",
  "alerte_probleme",
  "alerte_caution",
] as const;
export type ObjetCourriel = (typeof OBJETS_COURRIEL)[number];

export const STATUTS_COURRIEL = ["a_envoyer", "envoye", "echec"] as const;
export type StatutCourriel = (typeof STATUTS_COURRIEL)[number];

export const courriels = pgTable(
  "courriels",
  {
    id: uuid().primaryKey().defaultRandom(),
    // NULL pour une alerte sans réservation (paiement inconnu du site).
    reservation_id: uuid().references(() => reservations.id),
    objet: text().$type<ObjetCourriel>().notNull(),
    cle: text().notNull(),
    destinataire: text().notNull(),
    langue: text().$type<"fr" | "en">().notNull(),
    // Ce que le texte ne peut pas relire en base au moment de l'envoi (motif
    // d'un problème, paiement concerné…).
    donnees: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    statut: text().$type<StatutCourriel>().notNull().default("a_envoyer"),
    tentatives: integer().notNull().default(0),
    prochain_essai_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    derniere_erreur: text(),
    // Ce qui est parti, et par où : 'brevo' ou 'fichier' (essais, adresses de test).
    sujet: text(),
    corps_texte: text(),
    voie: text(),
    reference_externe: text(),
    envoye_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Entretenu par le trigger courriels_set_updated_at (migration 0006).
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("courriels_cle_uidx").on(t.cle),
    index("courriels_reservation_id_idx").on(t.reservation_id),
    index("courriels_a_envoyer_idx").on(t.prochain_essai_at).where(sql`${t.statut} = 'a_envoyer'`),
    check(
      "courriels_objet_check",
      sql`${t.objet} in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'caution_retenue', 'caution_recue', 'caution_rendue',
          'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution')`,
    ),
    check("courriels_statut_check", sql`${t.statut} in ('a_envoyer', 'envoye', 'echec')`),
    check("courriels_langue_check", sql`${t.langue} in ('fr', 'en')`),
    check("courriels_voie_check", sql`${t.voie} is null or ${t.voie} in ('brevo', 'fichier')`),
    check(
      "courriels_envoye_check",
      sql`${t.statut} <> 'envoye' or (${t.envoye_at} is not null and ${t.voie} is not null and ${t.sujet} is not null)`,
    ),
  ],
);
