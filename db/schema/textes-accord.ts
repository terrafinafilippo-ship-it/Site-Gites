// Table `textes_accord` : les TEXTES D'ACCORD que le client accepte en payant,
// en versions datées, une par langue (Phase 3, lot 3, migration 0005).
//
// Aujourd'hui un seul objet : 'carte', l'accord pour l'enregistrement de la
// carte (caution par carte, et solde si le client choisit le prélèvement).
// Texte des propriétaires, validé par le gérant le 14 octobre 2026 (français)
// et le 20 octobre 2026 (anglais) — jamais rédigé par une session
// (docs/phases/phase-3.md).
//
// Deux modèles, avec des repères remplacés par les valeurs de la réservation :
//   - `modele` : {caution} (montant), {ligne_solde} (vide, ou `modele_solde`) ;
//   - `modele_solde` : la ligne du prélèvement du solde, {montant} et {date}.
// Le texte obtenu est recopié MOT POUR MOT sur la réservation
// (reservations.accord_carte_texte) avec l'identifiant de la version.
//
// UNE VERSION NE SE MODIFIE NI NE SE SUPPRIME (trigger de la migration 0005) :
// des réservations la citent comme preuve d'accord. Un nouveau texte est une
// nouvelle ligne, avec sa date d'entrée en vigueur.
import { sql } from "drizzle-orm";
import { check, date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const textes_accord = pgTable(
  "textes_accord",
  {
    id: uuid().primaryKey().defaultRandom(),
    objet: text().$type<"carte">().notNull(),
    langue: text().$type<"fr" | "en">().notNull(),
    en_vigueur_depuis: date({ mode: "string" }).notNull(),
    modele: text().notNull(),
    modele_solde: text().notNull(),
    // Qui a validé ce texte, et quand : la provenance fait partie de la preuve.
    valide_par: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("textes_accord_version_key").on(t.objet, t.langue, t.en_vigueur_depuis),
    check("textes_accord_objet_check", sql`${t.objet} in ('carte')`),
    check("textes_accord_langue_check", sql`${t.langue} in ('fr', 'en')`),
  ],
);
