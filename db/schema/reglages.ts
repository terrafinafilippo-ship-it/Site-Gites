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
//
//   - annulation et accueil (lot 5, migration 0008, D-26) : le solde est
//     remboursé si le client annule plus de 48 heures avant l'heure d'arrivée
//     (choix du gérant, 29 octobre 2026, à confirmer avant le premier client),
//     recopié sur chaque réservation comme le délai de virement de la caution ;
//     note des avis affichée à l'accueil (4,97/5, 46 avis, 100 % de
//     recommandation, valeurs du site au 29 octobre 2026). Note NULL = les
//     chiffres des avis sont masqués.
//
//   - solde (Phase 4, lot 1, migration 0009, D-28) : en jours avant la date
//     limite du solde, le courriel de préavis d'un prélèvement (7) et le
//     courriel portant le lien de paiement (7), le rappel du lien (1, la
//     veille ; 0 = aucun rappel) ; en jours après le premier impayé, la
//     seconde alerte aux propriétaires (3). Choix du gérant du 1er novembre
//     2026. Lus à chaque passage des tâches automatiques : ce sont des
//     délais de courriel, pas des conditions du contrat (la date limite du
//     solde, elle, est figée sur la réservation).
//
//   - caution par carte (Phase 4, lot 2, migration 0010, D-16) : heure de la
//     préautorisation la veille du départ (18 h), heure de l'alerte aux
//     propriétaires la veille de la levée (8 h), heure de la levée
//     automatique le troisième jour après le départ (8 h, le matin : une
//     préautorisation Visa peut expirer vers midi ce jour-là). Choix du gérant
//     du 2 novembre 2026. Les JOURS (veille du départ, levée à 3 jours,
//     données de carte effacées à 7 jours) ne sont pas des réglages : ils sont
//     écrits dans le contrat (art. 6.2, 6.4, 6.5) et le texte d'accord.
//
//   - caution par virement (Phase 4, lot 3, migration 0011, D-31) : le compte
//     de la SARL DE LA VOUTE qui reçoit la caution (titulaire, IBAN sans
//     espaces, BIC facultatif), VIDE jusqu'à la saisie par les propriétaires :
//     sans lui, le courriel n'est pas envoyé et une alerte « À TRAITER » le
//     signale ; le courriel portant ces coordonnées part 10 jours avant la
//     date limite du virement (choix du gérant du 2 novembre 2026). La date
//     limite elle-même est figée sur la réservation (`delai_virement_caution_jours`).
//
//   - tentatives abandonnées (Phase 4, lot 3, migration 0011, D-31) : une
//     réservation restée « en attente de paiement » est effacée ce nombre de
//     jours après sa création. NULL : rien n'est effacé — la durée attend la
//     réponse du juriste (docs/06-avant-premier-client.md, point 12).
//
//   - connexion au back-office (Phase 5, lot 1, migration 0012, D-32) : un
//     appareil reste reconnu tant qu'il s'est connecté dans les 30 derniers
//     jours (chaque connexion relance le délai), une session se ferme après
//     8 heures sans activité ; après 5 échecs depuis une même adresse IP,
//     15 minutes d'attente ; le code d'un appareil inconnu vaut 10 minutes et
//     5 essais, le lien pour choisir le mot de passe 60 minutes (choix du
//     gérant du 3 novembre 2026).
//
//   - back-office, lot 2 (Phase 5, migration 0013) : un contrat non signé
//     apparaît dans « À traiter » 3 jours après le paiement (réponse b du
//     cadrage du 6 novembre 2026).
//
//   - tarifs (Phase 5, lot 3, migration 0014, D-34) : une nuit sans tarif dans
//     les 12 prochains mois apparaît dans « À traiter » (réponse 6 A du cadrage
//     du 7 novembre 2026).
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
    // Annulation (lot 5, migration 0008, D-26) : en heures avant l'heure d'arrivée.
    delai_remboursement_solde_heures: integer().notNull().default(48),
    // Avis (lot 5) : note en CENTIÈMES (497 = 4,97/5), comme un taux de lib/decimaux.ts.
    avis_note_centiemes: integer(),
    avis_nombre: integer(),
    avis_recommandation_pct: integer(),
    // Solde (Phase 4, lot 1, migration 0009, D-28), en jours.
    solde_preavis_jours: integer().notNull().default(7),
    solde_lien_jours: integer().notNull().default(7),
    solde_rappel_jours: integer().notNull().default(1),
    solde_relance_jours: integer().notNull().default(3),
    // Caution par carte (Phase 4, lot 2, migration 0010), heures de Paris.
    caution_heure_blocage: time().notNull().default("18:00"),
    caution_heure_alerte: time().notNull().default("08:00"),
    caution_heure_liberation: time().notNull().default("08:00"),
    // Caution par virement (Phase 4, lot 3, migration 0011).
    virement_titulaire: text(),
    virement_iban: text(),
    virement_bic: text(),
    virement_courriel_jours: integer().notNull().default(10),
    // Tentatives abandonnées (Phase 4, lot 3, migration 0011), en jours ; NULL = rien n'est effacé.
    abandon_conservation_jours: integer(),
    // Connexion au back-office (Phase 5, lot 1, migration 0012).
    gestion_appareil_jours: integer().notNull().default(30),
    gestion_inactivite_heures: integer().notNull().default(8),
    gestion_essais_max: integer().notNull().default(5),
    gestion_attente_minutes: integer().notNull().default(15),
    gestion_code_minutes: integer().notNull().default(10),
    gestion_lien_minutes: integer().notNull().default(60),
    // « À traiter » (Phase 5, lot 2, migration 0013), en jours après le paiement.
    contrat_non_signe_jours: integer().notNull().default(3),
    // Tarifs (Phase 5, lot 3, migration 0014), en mois à partir d'aujourd'hui.
    tarifs_horizon_mois: integer().notNull().default(12),
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
    check("reglages_annulation_check", sql`${t.delai_remboursement_solde_heures} between 0 and 8760`),
    // La note et le nombre d'avis vont ensemble : l'un sans l'autre ne s'affiche pas.
    check(
      "reglages_avis_check",
      sql`(${t.avis_note_centiemes} is null) = (${t.avis_nombre} is null)
          and (${t.avis_note_centiemes} is null or ${t.avis_note_centiemes} between 0 and 500)
          and (${t.avis_nombre} is null or ${t.avis_nombre} >= 0)
          and (${t.avis_recommandation_pct} is null or ${t.avis_recommandation_pct} between 0 and 100)`,
    ),
    check(
      "reglages_solde_check",
      sql`${t.solde_preavis_jours} between 0 and 60 and ${t.solde_lien_jours} between 0 and 60
          and ${t.solde_rappel_jours} between 0 and 60 and ${t.solde_relance_jours} between 1 and 60`,
    ),
    // Levée avant midi : au-delà, une préautorisation Visa peut avoir expiré (D-16).
    check("reglages_caution_check", sql`${t.caution_heure_liberation} < '12:00'`),
    // Titulaire et IBAN vont ensemble ; l'IBAN est écrit sans espaces, en
    // majuscules (sa clé de contrôle est vérifiée par le site, lib/virement.ts).
    check(
      "reglages_virement_check",
      sql`(${t.virement_titulaire} is null) = (${t.virement_iban} is null)
          and (${t.virement_titulaire} is null or length(trim(${t.virement_titulaire})) > 0)
          and (${t.virement_iban} is null or ${t.virement_iban} ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$')
          and (${t.virement_bic} is null or ${t.virement_bic} ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$')
          and ${t.virement_courriel_jours} between 0 and 60`,
    ),
    check(
      "reglages_abandon_check",
      sql`${t.abandon_conservation_jours} is null or ${t.abandon_conservation_jours} between 1 and 365`,
    ),
    check(
      "reglages_gestion_check",
      sql`${t.gestion_appareil_jours} between 1 and 365 and ${t.gestion_inactivite_heures} between 1 and 168
          and ${t.gestion_essais_max} between 1 and 20 and ${t.gestion_attente_minutes} between 1 and 1440
          and ${t.gestion_code_minutes} between 1 and 60 and ${t.gestion_lien_minutes} between 5 and 1440`,
    ),
    check("reglages_contrat_non_signe_check", sql`${t.contrat_non_signe_jours} between 0 and 60`),
    check("reglages_tarifs_horizon_check", sql`${t.tarifs_horizon_mois} between 1 and 36`),
  ],
);
