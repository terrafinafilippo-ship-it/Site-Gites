-- Phase 5, lot 3 : les tarifs dans le back-office (cadrage du 7 novembre 2026).
--
-- - réglages : une nuit sans tarif dans les 12 prochains mois apparaît dans
--   « À traiter » (réponse 6 A). Le jour de début des périodes (samedi) existe
--   depuis la migration 0003.
ALTER TABLE "reglages" ADD COLUMN "tarifs_horizon_mois" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_tarifs_horizon_check" CHECK ("reglages"."tarifs_horizon_mois" between 1 and 36);