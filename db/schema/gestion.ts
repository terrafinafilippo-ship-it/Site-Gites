// Tables de la CONNEXION AU BACK-OFFICE (Phase 5, lot 1, migration 0012, D-32).
//
// Choix du gérant (cadrage du 3 novembre 2026) : UN SEUL COMPTE, partagé par
// Patricia, Nicolas et le gérant ; mot de passe, plus un code envoyé par
// courriel la première fois sur un appareil inconnu. Les tables admettent
// pourtant plusieurs comptes : en ajouter un plus tard (personne extérieure à
// la famille) ne demande pas de tout refaire.
//
// AUCUN SECRET EN CLAIR : le mot de passe est gardé sous forme d'empreinte
// scrypt (lib/gestion/mot-de-passe.ts) ; les jetons des témoins (cookies), des
// liens et les codes sont gardés sous forme d'empreinte SHA-256. Lire la base
// ne permet ni d'entrer ni de rejouer un lien.
//
//   - `comptes_gestion`  : le compte (adresse, empreinte du mot de passe, NULL
//                          tant qu'il n'a pas été choisi par le lien) ;
//   - `appareils_gestion`: les appareils reconnus. Reconnu tant qu'il s'est
//                          connecté dans les `gestion_appareil_jours` derniers
//                          jours (30) ; chaque connexion relance le délai ;
//   - `sessions_gestion` : les connexions ouvertes, fermées après
//                          `gestion_inactivite_heures` (8) sans activité ;
//                          retirer un appareil ferme ses sessions (cascade) ;
//   - `codes_gestion`    : le code à 6 chiffres d'un appareil inconnu, valable
//                          `gestion_code_minutes` (10), au plus
//                          `gestion_essais_max` (5) essais ;
//   - `liens_gestion`    : le lien pour choisir le mot de passe, valable
//                          `gestion_lien_minutes` (60), utilisable une fois ;
//   - `essais_gestion`   : les échecs par adresse IP. Après `gestion_essais_max`
//                          échecs, `gestion_attente_minutes` (15) d'attente :
//                          compter par IP et non par compte, sinon n'importe qui
//                          bloquerait le compte en tapant de faux mots de passe.
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const comptes_gestion = pgTable(
  "comptes_gestion",
  {
    id: uuid().primaryKey().defaultRandom(),
    // En minuscules, sans espaces (lib/gestion/comptes.ts).
    courriel: text().notNull(),
    empreinte_mot_de_passe: text(),
    mot_de_passe_change_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comptes_gestion_courriel_uidx").on(t.courriel),
    check("comptes_gestion_courriel_check", sql`${t.courriel} = lower(trim(${t.courriel})) and ${t.courriel} like '%_@_%'`),
  ],
);

export const appareils_gestion = pgTable(
  "appareils_gestion",
  {
    id: uuid().primaryKey().defaultRandom(),
    compte_id: uuid()
      .notNull()
      .references(() => comptes_gestion.id, { onDelete: "cascade" }),
    empreinte_jeton: text().notNull(),
    // « Chrome sur Windows », tiré du navigateur : pour reconnaître l'appareil dans la liste.
    description: text().notNull(),
    derniere_connexion_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("appareils_gestion_jeton_uidx").on(t.empreinte_jeton),
    index("appareils_gestion_compte_idx").on(t.compte_id),
  ],
);

export const sessions_gestion = pgTable(
  "sessions_gestion",
  {
    id: uuid().primaryKey().defaultRandom(),
    compte_id: uuid()
      .notNull()
      .references(() => comptes_gestion.id, { onDelete: "cascade" }),
    appareil_id: uuid()
      .notNull()
      .references(() => appareils_gestion.id, { onDelete: "cascade" }),
    empreinte_jeton: text().notNull(),
    derniere_activite_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_gestion_jeton_uidx").on(t.empreinte_jeton),
    index("sessions_gestion_appareil_idx").on(t.appareil_id),
  ],
);

export const codes_gestion = pgTable(
  "codes_gestion",
  {
    id: uuid().primaryKey().defaultRandom(),
    compte_id: uuid()
      .notNull()
      .references(() => comptes_gestion.id, { onDelete: "cascade" }),
    // Le témoin de l'étape « code » : seul le navigateur qui a tapé le mot de passe peut finir.
    empreinte_jeton: text().notNull(),
    empreinte_code: text().notNull(),
    description: text().notNull(),
    essais: integer().notNull().default(0),
    expire_at: timestamp({ withTimezone: true }).notNull(),
    utilise_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("codes_gestion_jeton_uidx").on(t.empreinte_jeton),
    check("codes_gestion_essais_check", sql`${t.essais} >= 0`),
  ],
);

export const liens_gestion = pgTable(
  "liens_gestion",
  {
    id: uuid().primaryKey().defaultRandom(),
    compte_id: uuid()
      .notNull()
      .references(() => comptes_gestion.id, { onDelete: "cascade" }),
    empreinte_jeton: text().notNull(),
    expire_at: timestamp({ withTimezone: true }).notNull(),
    utilise_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("liens_gestion_jeton_uidx").on(t.empreinte_jeton)],
);

export const essais_gestion = pgTable(
  "essais_gestion",
  {
    ip: text().primaryKey(),
    echecs: integer().notNull().default(0),
    bloque_jusqu_a: timestamp({ withTimezone: true }),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("essais_gestion_echecs_check", sql`${t.echecs} >= 0`)],
);
