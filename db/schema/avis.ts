// Table `avis` : les avis laissés par les clients du site (Phase 6, D-40,
// migrations 0020 et 0021). Remplace la table provisoire de la Phase 0, qui
// n'a jamais servi.
//
// Choix du gérant (12 novembre 2026) :
//   - seul un client qui a séjourné laisse un avis, par le lien personnel du
//     courriel reçu après son départ (lib/avis.ts) : un avis par réservation ;
//   - une note de 1 à 5, un commentaire facultatif, signé du prénom et de
//     l'initiale du nom (« Camille D. »), figé au dépôt ;
//   - publié tout de suite ; retiré seulement pour l'un des motifs affichés
//     dans la politique des avis (lib/data/legal.ts), l'auteur prévenu ;
//   - pas de réponse publique des propriétaires.
//
// Un avis est effacé `DUREE_AVIS_ANS` après son dépôt (lib/avis.ts, tâches
// automatiques), comme l'annonce la politique des avis.
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { gites } from "./gites";
import { reservations } from "./reservations";

export const MOTIFS_RETRAIT = ["injurieux", "hors_sujet", "donnees_personnelles", "demande_auteur"] as const;
export type MotifRetrait = (typeof MOTIFS_RETRAIT)[number];

export const avis = pgTable(
  "avis",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservation_id: uuid()
      .notNull()
      .references(() => reservations.id),
    gite_id: uuid()
      .notNull()
      .references(() => gites.id),
    note: integer().notNull(),
    commentaire: text(),
    // « Camille D. », tel qu'affiché : figé au dépôt.
    signature: text().notNull(),
    langue: text().$type<"fr" | "en">().notNull(),
    // Date d'arrivée du séjour : le site en affiche le mois.
    date_sejour: date({ mode: "string" }).notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    retire_at: timestamp({ withTimezone: true }),
    motif_retrait: text().$type<MotifRetrait>(),
  },
  (t) => [
    uniqueIndex("avis_reservation_id_uidx").on(t.reservation_id),
    index("avis_gite_id_idx").on(t.gite_id, t.created_at),
    check("avis_note_check", sql`${t.note} between 1 and 5`),
    check("avis_commentaire_check", sql`${t.commentaire} is null or char_length(${t.commentaire}) between 1 and 2000`),
    check("avis_signature_check", sql`char_length(trim(${t.signature})) between 1 and 80`),
    check("avis_langue_check", sql`${t.langue} in ('fr', 'en')`),
    check(
      "avis_retrait_check",
      sql`(${t.retire_at} is null) = (${t.motif_retrait} is null)
          and (${t.motif_retrait} is null or ${t.motif_retrait} in ('injurieux', 'hors_sujet', 'donnees_personnelles', 'demande_auteur'))`,
    ),
  ],
);
