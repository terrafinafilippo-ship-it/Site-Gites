-- Phase 3, lot 5 : annulation, caution et avis (D-26).
--
-- - Réglage : le solde est remboursé si le client annule plus de 48 heures
--   avant l'heure d'arrivée (choix du gérant du 29 octobre 2026, à confirmer
--   avant le premier client) ;
-- - ce délai et celui de réception d'une caution par virement (D-19) sont
--   RECOPIÉS sur chaque réservation, comme le taux de l'acompte : sans valeur
--   par défaut une fois la colonne créée. Les réservations existantes reçoivent
--   48 heures et 3 jours (valeurs des réglages à cette date) ;
-- - avis affichés à l'accueil : 4,97/5, 46 avis, 100 % de recommandation
--   (valeurs écrites en dur sur le site au 29 octobre 2026, gardées par le gérant).
ALTER TABLE "reservations" ADD COLUMN "delai_remboursement_solde_heures" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "delai_remboursement_solde_heures" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "delai_virement_caution_jours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "delai_virement_caution_jours" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "delai_remboursement_solde_heures" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "avis_note_centiemes" integer;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "avis_nombre" integer;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "avis_recommandation_pct" integer;--> statement-breakpoint
UPDATE "reglages" SET "avis_note_centiemes" = 497, "avis_nombre" = 46, "avis_recommandation_pct" = 100 WHERE "id" = 1;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_annulation_check" CHECK ("reservations"."delai_remboursement_solde_heures" between 0 and 8760 and "reservations"."delai_virement_caution_jours" between 0 and 60);--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_annulation_check" CHECK ("reglages"."delai_remboursement_solde_heures" between 0 and 8760);--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_avis_check" CHECK (("reglages"."avis_note_centiemes" is null) = ("reglages"."avis_nombre" is null)
          and ("reglages"."avis_note_centiemes" is null or "reglages"."avis_note_centiemes" between 0 and 500)
          and ("reglages"."avis_nombre" is null or "reglages"."avis_nombre" >= 0)
          and ("reglages"."avis_recommandation_pct" is null or "reglages"."avis_recommandation_pct" between 0 and 100));
