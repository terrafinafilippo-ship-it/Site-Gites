-- Phase 3, lot 4, étape 3 : page « Ma réservation » par lien secret (D-25).
--
-- - Jeton secret sur chaque réservation : la valeur par défaut est tirée PAR
--   LIGNE (fonction volatile), donc les réservations existantes reçoivent
--   chacune un jeton différent à l'ajout de la colonne ;
-- - réglages, choix du gérant du 28 octobre 2026 : lien valable jusqu'à
--   30 jours après le départ ; au plus 3 demandes de lien par adresse et par
--   60 minutes ;
-- - nouveau courriel « lien_suivi » (lien redemandé par le formulaire).
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "jeton_suivi" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "suivi_validite_jours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "suivi_demandes_max" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "suivi_demandes_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_jeton_suivi_key" UNIQUE("jeton_suivi");--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_suivi_check" CHECK ("reglages"."suivi_validite_jours" between 0 and 3650 and "reglages"."suivi_demandes_max" between 1 and 100
          and "reglages"."suivi_demandes_minutes" between 1 and 10080);--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'alerte_reservation', 'alerte_signature', 'alerte_probleme'));