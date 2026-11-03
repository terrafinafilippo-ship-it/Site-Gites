-- Phase 4, lot 3 : la caution par virement et l'effacement des tentatives
-- abandonnées (D-31, choix du gérant des 1er et 3 novembre 2026).
--
-- - réglages : le compte de la SARL DE LA VOUTE qui reçoit la caution
--   (titulaire, IBAN, BIC facultatif), VIDE : les propriétaires le saisissent ;
--   le courriel des coordonnées part 10 jours avant la date limite du virement ;
-- - réglages : durée de conservation d'une tentative abandonnée, VIDE : rien
--   n'est effacé tant que le juriste n'a pas donné la durée ;
-- - courriels : « caution_virement », les coordonnées et la demande du RIB.
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "virement_titulaire" text;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "virement_iban" text;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "virement_bic" text;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "virement_courriel_jours" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "abandon_conservation_jours" integer;--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_virement_check" CHECK (("reglages"."virement_titulaire" is null) = ("reglages"."virement_iban" is null)
          and ("reglages"."virement_titulaire" is null or length(trim("reglages"."virement_titulaire")) > 0)
          and ("reglages"."virement_iban" is null or "reglages"."virement_iban" ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$')
          and ("reglages"."virement_bic" is null or "reglages"."virement_bic" ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$')
          and "reglages"."virement_courriel_jours" between 0 and 60);--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_abandon_check" CHECK ("reglages"."abandon_conservation_jours" is null or "reglages"."abandon_conservation_jours" between 1 and 365);--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution'));