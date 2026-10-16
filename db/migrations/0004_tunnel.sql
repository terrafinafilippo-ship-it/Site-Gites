-- Phase 3, lot 2 : réglages du tunnel, forme définitive du calendrier, détail
-- du calcul enregistré avec la réservation.
--
-- Écrit à la main (le reste est généré) : l'effacement des lignes 'libre'.
-- Une nuit sans ligne est désormais libre ; une ligne 'libre' ne porte aucune
-- information et serait refusée par la nouvelle contrainte d'état. Toute autre
-- ligne incohérente (verrou sans échéance, par exemple) fait ÉCHOUER la
-- migration : elle n'est pas effacée en silence.
ALTER TABLE "disponibilites" DROP CONSTRAINT "disponibilites_statut_check";--> statement-breakpoint
DELETE FROM "disponibilites" WHERE "statut" = 'libre';--> statement-breakpoint
ALTER TABLE "disponibilites" ALTER COLUMN "statut" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "detail_calcul" jsonb;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "duree_blocage_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "delai_reservation_jours" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "heure_arrivee" time DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "heure_depart" time DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "heure_limite_arrivee" time DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "bebe_age_limite" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "bebes_hors_capacite" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "lits_bebe" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "taxes_sejour" ADD COLUMN "bebes_parmi_occupants" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "disponibilites_reservation_id_idx" ON "disponibilites" USING btree ("reservation_id");--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_verrou_echeance_check" CHECK (("disponibilites"."statut" = 'verrou') = ("disponibilites"."verrou_expire_at" is not null));--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_verrou_reservation_check" CHECK ("disponibilites"."statut" <> 'verrou' or ("disponibilites"."source" = 'directe' and "disponibilites"."reservation_id" is not null));--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_reserve_directe_check" CHECK ("disponibilites"."statut" <> 'reserve' or "disponibilites"."source" <> 'directe' or "disponibilites"."reservation_id" is not null);--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_statut_check" CHECK ("disponibilites"."statut" in ('verrou', 'reserve', 'bloque'));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_duree_blocage_check" CHECK ("reglages"."duree_blocage_minutes" between 1 and 120);--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_delai_reservation_check" CHECK ("reglages"."delai_reservation_jours" between 0 and 365);--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_heures_check" CHECK ("reglages"."heure_limite_arrivee" >= "reglages"."heure_arrivee");--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_bebes_check" CHECK ("reglages"."bebe_age_limite" between 1 and 17 and "reglages"."bebes_hors_capacite" between 0 and 10
          and "reglages"."lits_bebe" between 0 and 10);