-- Phase 5, lot 4 : calendrier, fiches des gîtes, documents (cadrage du
-- 7 novembre 2026).
--
-- - options_sejour : l'option posée au téléphone (réponse 1 B). Ses nuits sont
--   des lignes 'option' de disponibilites, avec la même échéance ; une ligne
--   échue vaut libre, comme un verrou expiré. La réservation faite par le lien
--   de l'option la désigne (reservations.option_id).
-- - réglages : nuits gardées 3 jours par une option.
-- - courriels : le lien de l'option, le contrat signé renvoyé.
-- - gîtes : tarif_semaine_base, tarif_weekend et taux_taxe_sejour sont retirés
--   (réponse 7 A) ; les prix et la taxe ont leurs tables depuis la Phase 3.
CREATE TABLE "options_sejour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"date_arrivee" date NOT NULL,
	"date_depart" date NOT NULL,
	"client_nom" text NOT NULL,
	"client_email" text NOT NULL,
	"langue" text DEFAULT 'fr' NOT NULL,
	"jeton" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"levee_at" timestamp with time zone,
	"utilisee_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "options_sejour_jeton_key" UNIQUE("jeton"),
	CONSTRAINT "options_sejour_dates_check" CHECK ("options_sejour"."date_depart" > "options_sejour"."date_arrivee"),
	CONSTRAINT "options_sejour_langue_check" CHECK ("options_sejour"."langue" in ('fr', 'en'))
);
--> statement-breakpoint
ALTER TABLE "disponibilites" DROP CONSTRAINT "disponibilites_statut_check";--> statement-breakpoint
ALTER TABLE "disponibilites" DROP CONSTRAINT "disponibilites_verrou_echeance_check";--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "option_id" uuid;--> statement-breakpoint
ALTER TABLE "disponibilites" ADD COLUMN "option_id" uuid;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "option_duree_jours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "options_sejour" ADD CONSTRAINT "options_sejour_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "options_sejour_gite_id_idx" ON "options_sejour" USING btree ("gite_id");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_option_id_options_sejour_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options_sejour"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_option_id_options_sejour_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options_sejour"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disponibilites_option_id_idx" ON "disponibilites" USING btree ("option_id");--> statement-breakpoint
ALTER TABLE "gites" DROP COLUMN "tarif_semaine_base";--> statement-breakpoint
ALTER TABLE "gites" DROP COLUMN "tarif_weekend";--> statement-breakpoint
ALTER TABLE "gites" DROP COLUMN "taux_taxe_sejour";--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_option_check" CHECK (("disponibilites"."statut" = 'option') = ("disponibilites"."option_id" is not null));--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_statut_check" CHECK ("disponibilites"."statut" in ('verrou', 'reserve', 'bloque', 'option'));--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_verrou_echeance_check" CHECK (("disponibilites"."statut" in ('verrou', 'option')) = ("disponibilites"."verrou_expire_at" is not null));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_option_duree_check" CHECK ("reglages"."option_duree_jours" between 1 and 30);--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'caution_retenue', 'caution_recue', 'caution_rendue',
          'option', 'contrat_signe', 'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution'));