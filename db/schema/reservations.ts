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
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { gites } from "./gites";

export const STATUTS_RESERVATION = [
  "brouillon",
  "en_attente_paiement",
  "confirmee",
  "annulee",
  "terminee",
] as const;
export type StatutReservation = (typeof STATUTS_RESERVATION)[number];

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
  ],
);
