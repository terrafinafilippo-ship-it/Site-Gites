// Table `reglages` : les réglages GÉNÉRAUX de la réservation, en UNE seule
// ligne (id = 1, imposé par la base). La ligne est créée par la migration 0003 :
// le code ne la crée jamais et la considère comme une panne si elle manque.
//
// Contenu, phase par phase :
//   - règle générale de réservation (décision D-17) : minimum de nuits, jours
//     d'arrivée et de départ autorisés. Valeurs initiales : arrivée et départ
//     tous les jours, une nuit minimum — réponse donnée au cadrage le
//     10 octobre 2026 (« complètement libre »). Un tarif ou une période peut
//     s'en écarter ;
//   - barème général de dégressivité. NULL = aucun barème : le calcul REFUSE
//     de chiffrer un séjour plutôt que d'appliquer un plein tarif implicite ;
//   - jour de début attendu des périodes (6 = samedi, décision du cadrage) :
//     contrôlé à la saisie (back-office), signalé à la lecture. NULL = libre.
//
//   - tunnel de réservation (lot 2, migration 0004) : durée du blocage des
//     dates pendant le paiement (20 minutes, cadrage du 13 octobre 2026) ;
//     délai minimum entre la réservation et l'arrivée (1 jour : réservable
//     jusqu'à 23 h 59 la veille, réponse du 15 octobre 2026) ; horaires
//     communs aux trois gîtes (arrivée 18 h, départ 9 h, valeurs du contrat
//     validées le 14 octobre ; arrivée au plus tard 20 h, valeur du contrat) ;
//     bébés : âge en dessous duquel un enfant est un bébé (2 ans), nombre de
//     bébés qui ne comptent pas dans la capacité (1 : un second bébé prend une
//     place), lits bébé disponibles (1) — réponses du 15 octobre 2026.
//
//   - paiement (lot 3, migration 0005) : taux de l'acompte (30 %) et délai du
//     solde (30 jours avant l'arrivée), valeurs du contrat ; délai de
//     réception d'une caution par virement (3 jours avant l'arrivée, D-19).
//     Le taux et le délai du solde sont RECOPIÉS sur chaque réservation : les
//     changer ici ne modifie aucun contrat déjà conclu.
//
//   - courriels (lot 4, migration 0006) : expéditeur des courriels
//     automatiques (reservation@gitesdesamoyas.fr, « Les Gîtes de Samoyas »),
//     auquel on ne répond pas, et adresse de réponse (contact@gitesdesamoyas.fr) :
//     un client qui clique sur « Répondre » écrit aux propriétaires (choix du
//     gérant, 24 octobre 2026). Les alertes ont leur table (`alertes`).
//
//   - page « Ma réservation » (lot 4, migration 0007, D-25) : le lien ouvre la
//     page jusqu'à 30 jours après le départ ; le formulaire « Retrouver ma
//     réservation » envoie au plus 3 courriels par adresse et par 60 minutes
//     (choix du gérant, 28 octobre 2026).
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

import { baremes } from "./baremes";
import { joursIsoValides, nuitsMinimumValide } from "./regles";

export const reglages = pgTable(
  "reglages",
  {
    id: integer().primaryKey().default(1),
    nuits_minimum: integer().notNull().default(1),
    jours_arrivee: integer()
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'::integer[]`),
    jours_depart: integer()
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'::integer[]`),
    bareme_general_id: uuid().references(() => baremes.id),
    periodes_jour_debut: integer(),
    duree_blocage_minutes: integer().notNull().default(20),
    delai_reservation_jours: integer().notNull().default(1),
    // Heures `time` ("18:00:00") : le tunnel et le contrat ne lisent que HH:MM.
    heure_arrivee: time().notNull().default("18:00"),
    heure_depart: time().notNull().default("09:00"),
    heure_limite_arrivee: time().notNull().default("20:00"),
    bebe_age_limite: integer().notNull().default(2),
    bebes_hors_capacite: integer().notNull().default(1),
    lits_bebe: integer().notNull().default(1),
    // Taux en pourcentage du total TTC (30 = 30 %) : un taux n'est pas de l'argent.
    taux_acompte: integer().notNull().default(30),
    delai_solde_jours: integer().notNull().default(30),
    delai_virement_caution_jours: integer().notNull().default(3),
    // Sans valeur par défaut : la migration 0006 écrit celles du gérant.
    courriel_expediteur: text().notNull(),
    courriel_expediteur_nom: text().notNull(),
    courriel_reponse: text().notNull(),
    // Page « Ma réservation » (lot 4, migration 0007, D-25). Lus à chaque
    // affichage : un changement vaut aussi pour les réservations déjà faites.
    suivi_validite_jours: integer().notNull().default(30),
    suivi_demandes_max: integer().notNull().default(3),
    suivi_demandes_minutes: integer().notNull().default(60),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reglages_ligne_unique_check", sql`${t.id} = 1`),
    check("reglages_nuits_minimum_check", nuitsMinimumValide(t.nuits_minimum, false)),
    check("reglages_jours_arrivee_check", joursIsoValides(t.jours_arrivee, false)),
    check("reglages_jours_depart_check", joursIsoValides(t.jours_depart, false)),
    check(
      "reglages_periodes_jour_debut_check",
      sql`${t.periodes_jour_debut} is null or ${t.periodes_jour_debut} between 1 and 7`,
    ),
    check("reglages_duree_blocage_check", sql`${t.duree_blocage_minutes} between 1 and 120`),
    check("reglages_delai_reservation_check", sql`${t.delai_reservation_jours} between 0 and 365`),
    check("reglages_heures_check", sql`${t.heure_limite_arrivee} >= ${t.heure_arrivee}`),
    check(
      "reglages_bebes_check",
      sql`${t.bebe_age_limite} between 1 and 17 and ${t.bebes_hors_capacite} between 0 and 10
          and ${t.lits_bebe} between 0 and 10`,
    ),
    check(
      "reglages_paiement_check",
      sql`${t.taux_acompte} between 1 and 100 and ${t.delai_solde_jours} between 0 and 365
          and ${t.delai_virement_caution_jours} between 0 and 60`,
    ),
    check(
      "reglages_courriels_check",
      sql`${t.courriel_expediteur} like '%_@_%' and ${t.courriel_reponse} like '%_@_%'
          and length(trim(${t.courriel_expediteur_nom})) > 0`,
    ),
    check(
      "reglages_suivi_check",
      sql`${t.suivi_validite_jours} between 0 and 3650 and ${t.suivi_demandes_max} between 1 and 100
          and ${t.suivi_demandes_minutes} between 1 and 10080`,
    ),
  ],
);
