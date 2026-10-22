// Table `reservations` : une ligne par séjour, quel que soit son statut.
//
// Toutes les colonnes client_*, date_*, heure_*, nb_*, montants et paiement
// sont celles lues par lib/montants.ts (type Reservation, dérivé de cette
// table via lib/reservations.ts). Le module lit chaque champ avec une valeur de repli, d'où
// une majorité de colonnes nullables : seules les colonnes structurelles
// (gîte, référence, statut, dates) sont obligatoires.
//
// Types de dates : date_arrivee / date_depart sont des dates civiles (yyyy-mm-dd),
// jamais des instants ; les heures sont des `time` ("18:00:00", le module ne
// lit que HH:MM) ; les instants (paiement, création, mise à jour) sont en
// timestamptz.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";
import { textes_accord } from "./textes-accord";

export const STATUTS_RESERVATION = [
  "brouillon",
  "en_attente_paiement",
  "confirmee",
  "annulee",
  "terminee",
] as const;
export type StatutReservation = (typeof STATUTS_RESERVATION)[number];

/** Moyen de la caution choisi par le client (D-19). */
export const MOYENS_CAUTION = ["carte", "cheque", "virement"] as const;
export type MoyenCaution = (typeof MOYENS_CAUTION)[number];

/** Règlement du solde choisi par le client : prélèvement automatique ou lien (D-16). */
export const MODES_SOLDE = ["prelevement", "lien"] as const;
export type ModeSolde = (typeof MODES_SOLDE)[number];

export const reservations = pgTable(
  "reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    // Référence publique courte, affichée au client et utilisée par /suivi/[ref].
    reference: text().notNull(),
    statut: text().$type<StatutReservation>().notNull().default("brouillon"),
    // Numéro du contrat émis (série CTR), recopié depuis documents.numero.
    numero_contrat: text(),

    // Client principal
    client_civilite: text(),
    client_nom: text(),
    client_prenom: text(),
    client_adresse: text(),
    client_code_postal: text(),
    client_ville: text(),
    client_pays: text().default("France"),
    client_email: text(),
    client_telephone: text(),
    // Conjoint éventuel
    client_civilite_conjoint: text(),
    client_nom_conjoint: text(),
    client_prenom_conjoint: text(),

    // Séjour
    date_arrivee: date({ mode: "string" }).notNull(),
    date_depart: date({ mode: "string" }).notNull(),
    heure_arrivee: time(),
    heure_depart: time(),
    heure_limite_arrivee: time(),
    nb_adultes: integer().notNull().default(0),
    nb_enfants: integer().notNull().default(0),
    nb_bebes: integer().notNull().default(0),
    // Liste libre des occupants majeurs (contrat).
    occupants_majeurs: text(),

    // Montants : numeric(10,2) en euros côté SQL, lus en TEXTE (mode "string",
    // comportement natif du driver pg) et convertis en centimes entiers par
    // lib/reservations.ts via centimesDepuisNumeric (lib/centimes.ts). Aucun
    // montant ne circule en nombre flottant.
    prix_location: numeric({ precision: 10, scale: 2, mode: "string" }),
    forfait_menage: numeric({ precision: 10, scale: 2, mode: "string" }),
    options: numeric({ precision: 10, scale: 2, mode: "string" }),
    taxe_sejour: numeric({ precision: 10, scale: 2, mode: "string" }),
    // Taux en pourcentage (5.50 = 5,5 %) : un taux n'est pas de l'argent, il
    // reste un nombre décimal.
    taux_taxe_sejour: numeric({ precision: 5, scale: 2, mode: "number" }),

    // Comment le prix et la taxe ont été obtenus, figé à l'enregistrement par
    // le tunnel (lib/devis.ts, type DetailCalcul) : prix de chaque nuit et
    // coefficient appliqué, réglage de taxe et ses étapes. Les montants
    // ci-dessus font foi ; ce détail les explique (récapitulatif, déclaration
    // de la taxe de séjour, litige). NULL pour une réservation saisie à la main.
    detail_calcul: jsonb().$type<Record<string, unknown>>(),

    // Conditions de paiement FIGÉES à la réservation (lot 3, migration 0005) :
    // recopiées des réglages, elles ne changent plus si les réglages changent.
    // Pas de valeur par défaut : qui crée une réservation dit lesquelles
    // s'appliquent (les réservations antérieures ont reçu 30 % et 30 jours).
    taux_acompte: integer().notNull(),
    delai_solde_jours: integer().notNull(),
    // Arrivée trop proche (D-20) : le total est réglé à la réservation, sans solde.
    paiement_integral: boolean().notNull().default(false),

    // Choix du client dans le tunnel (NULL pour une réservation saisie à la main).
    moyen_caution: text().$type<MoyenCaution>(),
    // NULL en paiement intégral (pas de solde).
    mode_solde: text().$type<ModeSolde>(),
    // Langue du client (D-22) : celle de ses courriels. Contrat et factures restent en français.
    langue: text().$type<"fr" | "en">().notNull().default("fr"),

    // Carte enregistrée pour la caution et, si choisi, le solde (D-16) : les
    // identifiants Stripe seulement, jamais un numéro de carte. Renseignés au
    // paiement, et seulement si la caution est par carte.
    stripe_customer_id: text(),
    stripe_payment_method_id: text(),
    // Texte d'accord pour l'enregistrement de la carte, tel qu'affiché au
    // client (crochets remplacés), et la version dont il vient. Mot pour mot.
    accord_carte_id: uuid().references(() => textes_accord.id),
    accord_carte_texte: text(),

    // Paiement de l'acompte (données du prestataire)
    mode_paiement: text(),
    reference_transaction: text(),
    date_paiement_acompte: timestamp({ withTimezone: true }),

    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Entretenu par le trigger reservations_set_updated_at (migration 0001).
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reservations_reference_key").on(t.reference),
    index("reservations_gite_id_idx").on(t.gite_id),
    check(
      "reservations_statut_check",
      sql`${t.statut} in ('brouillon', 'en_attente_paiement', 'confirmee', 'annulee', 'terminee')`,
    ),
    check(
      "reservations_conditions_check",
      sql`${t.taux_acompte} between 1 and 100 and ${t.delai_solde_jours} between 0 and 365`,
    ),
    check("reservations_langue_check", sql`${t.langue} in ('fr', 'en')`),
    check(
      "reservations_moyen_caution_check",
      sql`${t.moyen_caution} is null or ${t.moyen_caution} in ('carte', 'cheque', 'virement')`,
    ),
    // Prélèvement automatique : seulement sur une carte enregistrée, donc une
    // caution par carte (D-19). Aucun solde en paiement intégral (D-20).
    check(
      "reservations_mode_solde_check",
      sql`${t.mode_solde} is null or (${t.mode_solde} in ('prelevement', 'lien')
          and not ${t.paiement_integral}
          and (${t.mode_solde} = 'lien' or ${t.moyen_caution} = 'carte'))`,
    ),
    check(
      "reservations_accord_carte_check",
      sql`(${t.accord_carte_id} is null) = (${t.accord_carte_texte} is null)`,
    ),
  ],
);
