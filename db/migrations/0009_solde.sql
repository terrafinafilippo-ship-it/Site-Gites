-- Phase 4, lot 1 : le solde, les factures automatiques (D-28, D-29).
--
-- - Réglages : délais des courriels du solde, en jours (choix du gérant du
--   1er novembre 2026) : préavis d'un prélèvement 7 jours avant la date
--   limite, lien de paiement 7 jours avant, rappel la veille, seconde alerte
--   d'impayé 3 jours après la première ;
-- - courriels : la facture en PDF, le préavis, le lien, le rappel, l'impayé ;
-- - factures : le type 'total', facture unique d'un séjour payé en une fois
--   (réponse (a) du gérant, à confirmer par le comptable, D-29), et une seule
--   facture de chaque type par réservation. ATTENTION : l'index unique échoue
--   si une base contient déjà deux factures du même type pour une
--   réservation (vérifié vide sur la base de test ; à vérifier sur la base
--   réelle avant d'appliquer : `db/README.md`).
ALTER TABLE "factures" DROP CONSTRAINT "factures_type_check";--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "solde_preavis_jours" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "solde_lien_jours" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "solde_rappel_jours" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "solde_relance_jours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "factures_resa_type_uidx" ON "factures" USING btree ("reservation_id","type");--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_type_check" CHECK ("factures"."type" in ('acompte', 'solde', 'total'));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_solde_check" CHECK ("reglages"."solde_preavis_jours" between 0 and 60 and "reglages"."solde_lien_jours" between 0 and 60
          and "reglages"."solde_rappel_jours" between 0 and 60 and "reglages"."solde_relance_jours" between 1 and 60);--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'alerte_reservation', 'alerte_signature', 'alerte_probleme'));--> statement-breakpoint
COMMENT ON FUNCTION creer_facture(uuid, text, numeric, jsonb, uuid) IS
  'Crée une facture (acompte, solde ou total) avec le prochain numéro de la série FAC. Renvoie la ligne factures complète.';
