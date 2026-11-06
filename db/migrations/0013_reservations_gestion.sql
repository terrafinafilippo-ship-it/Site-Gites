-- Phase 5, lot 2 : les réservations et les cautions dans le back-office
-- (cadrage du 6 novembre 2026).
--
-- - réservations : caution par chèque ou virement reçue puis rendue (le site
--   n'en garde que la trace), note interne des propriétaires ;
-- - retenues : une retenue par réservation, motif obligatoire, justificatifs ;
-- - a_traiter_faits : les lignes « À traiter » retirées par « C'est fait » ;
-- - réglages : un contrat non signé apparaît 3 jours après le paiement ;
-- - courriels : retenue sur la caution, caution reçue, caution rendue.
CREATE TABLE "a_traiter_faits" (
	"cle" text PRIMARY KEY NOT NULL,
	"acteur" text NOT NULL,
	"fait_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"motif" text NOT NULL,
	"moyen" text NOT NULL,
	"pieces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acteur" text NOT NULL,
	"faite_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retenues_montant_check" CHECK ("retenues"."montant" > 0),
	CONSTRAINT "retenues_motif_check" CHECK (length(trim("retenues"."motif")) > 0),
	CONSTRAINT "retenues_moyen_check" CHECK ("retenues"."moyen" in ('carte', 'cheque', 'virement'))
);
--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "caution_recue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "caution_rendue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "note_interne" text;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "contrat_non_signe_jours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "retenues" ADD CONSTRAINT "retenues_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retenues_reservation_uidx" ON "retenues" USING btree ("reservation_id");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_caution_recue_check" CHECK (("reservations"."caution_recue_at" is null or "reservations"."moyen_caution" in ('cheque', 'virement'))
          and ("reservations"."caution_rendue_at" is null or "reservations"."caution_recue_at" is not null));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_contrat_non_signe_check" CHECK ("reglages"."contrat_non_signe_jours" between 0 and 60);--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'caution_retenue', 'caution_recue', 'caution_rendue',
          'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution'));