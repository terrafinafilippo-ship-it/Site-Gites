-- 0003_tarification_contraintes.sql
-- Ce que Drizzle ne sait pas décrire dans le schéma TypeScript, pour les tables
-- de tarification créées par 0002 (décision D-17). Migration personnalisée
-- (drizzle-kit generate --custom), appliquée par `npm run db:migrate`.
--
-- Chaque instruction est separee par le marqueur de rupture d'instruction de Drizzle (voir 0000).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Deux périodes ne couvrent jamais la même nuit.
--
-- Une période couvre les nuits de date_debut (incluse) à date_fin (exclue) :
-- c'est exactement l'intervalle « [) » de daterange. Deux périodes qui se
-- suivent partagent une date (la fin de l'une est le début de l'autre) sans se
-- chevaucher. Sans cette contrainte, une nuit pourrait relever de deux tarifs,
-- et le prix d'un séjour dépendrait de l'ordre de lecture des lignes.
--
-- Les types intervalle disposent nativement d'une classe d'opérateurs GiST :
-- aucune extension n'est nécessaire.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE periodes
  ADD CONSTRAINT periodes_sans_chevauchement
  EXCLUDE USING gist (daterange(date_debut, date_fin, '[)') WITH &&);
--> statement-breakpoint
COMMENT ON CONSTRAINT periodes_sans_chevauchement ON periodes IS
  'Une nuit relève d''au plus une période, donc d''au plus un tarif. Intervalle [date_debut, date_fin).';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La ligne unique des réglages généraux.
--
-- Le code lit cette ligne et ne la crée jamais : son absence est une panne
-- signalée, pas une situation à combler par des valeurs par défaut. Elle naît
-- donc ici, avec la table, dans toutes les bases (réelle et de test).
--
-- Valeurs initiales, décidées au cadrage de la Phase 3 :
--   - arrivée et départ tous les jours, une nuit minimum (« complètement
--     libre », 10 octobre 2026) : ce sont les valeurs par défaut des colonnes ;
--   - périodes commençant le samedi (6) ;
--   - AUCUN barème général : son contenu est un choix commercial, saisi au
--     back-office. Tant qu'il manque, le calcul refuse de chiffrer un séjour.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO reglages (id, periodes_jour_debut)
VALUES (1, 6)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
COMMENT ON TABLE reglages IS
  'Réglages généraux de la réservation, en une seule ligne (id = 1), créée par la migration 0003.';
