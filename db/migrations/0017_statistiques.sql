-- Phase 5, lot 6 : les statistiques (choix du gérant du 8 novembre 2026).
--
-- reglages.commission_taux : taux de commission d'une plateforme, en pour cent
-- entiers (de 1 à 50), qui chiffre les commissions évitées par les
-- réservations en direct. Vide au départ (réponse 4 A) : les propriétaires le
-- saisissent dans Réglages ; tant qu'il est vide, la page le demande.
ALTER TABLE "reglages" ADD COLUMN "commission_taux" integer;--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_commission_check" CHECK ("reglages"."commission_taux" is null or "reglages"."commission_taux" between 1 and 50);