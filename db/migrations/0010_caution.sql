-- Phase 4, lot 2 : la caution par carte (D-16, choix du gérant du 2 novembre 2026).
--
-- - reservations.caution : montant FIGÉ à la réservation (imprimé au contrat,
--   bloqué sur la carte). Les réservations existantes reçoivent le montant
--   vu par le client dans le tunnel (detail_calcul.caution, en centimes,
--   divisé en NUMERIC exact par la base) ou, à défaut, celui du gîte
--   aujourd'hui — celui que leur contrat a imprimé, sauf si la caution du
--   gîte a changé depuis (vérifier sur la base réelle avant d'appliquer :
--   db/README.md) ;
-- - reservations.carte_caution_demandee_at : lien « enregistrer une carte »
--   envoyé au client (art. 6.6) ;
-- - paiements : états de la caution (bloque, libere, retenu), date limite de
--   la banque, montant retenu, date de levée ; une caution par réservation ;
-- - réglages : heures de la préautorisation (18 h la veille du départ), de
--   l'alerte la veille de la levée (8 h) et de la levée (8 h, avant midi) ;
-- - alertes : la sorte 'caution', active, avec les destinataires de 'probleme' ;
-- - courriels : caution bloquée, à valider, levée, carte à enregistrer, et
--   l'alerte « caution » aux propriétaires.
ALTER TABLE "paiements" DROP CONSTRAINT "paiements_statut_check";--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "alertes" DROP CONSTRAINT "alertes_type_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "caution" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "carte_caution_demandee_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "expire_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "montant_retenu" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "date_liberation" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "caution_heure_blocage" time DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "caution_heure_alerte" time DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "caution_heure_liberation" time DEFAULT '08:00' NOT NULL;--> statement-breakpoint
UPDATE "reservations" r SET "caution" = coalesce(
  CASE WHEN jsonb_typeof(r."detail_calcul"->'caution') = 'number'
       THEN round((r."detail_calcul"->>'caution')::numeric / 100, 2) END,
  g."caution")
FROM "gites" g WHERE g."id" = r."gite_id";--> statement-breakpoint
INSERT INTO "alertes" ("type", "active", "destinataires")
SELECT 'caution', "active", "destinataires" FROM "alertes" WHERE "type" = 'probleme';--> statement-breakpoint
CREATE UNIQUE INDEX "paiements_caution_uidx" ON "paiements" USING btree ("reservation_id") WHERE "paiements"."type" = 'caution';--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_caution_check" CHECK ("reservations"."caution" is null or "reservations"."caution" >= 0);--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_caution_check" CHECK ("paiements"."type" = 'caution' or ("paiements"."statut" not in ('bloque', 'libere', 'retenu')
          and "paiements"."expire_at" is null and "paiements"."montant_retenu" is null and "paiements"."date_liberation" is null));--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_retenue_check" CHECK (("paiements"."statut" = 'retenu') = ("paiements"."montant_retenu" is not null)
          and ("paiements"."montant_retenu" is null or ("paiements"."montant_retenu" > 0 and "paiements"."montant_retenu" <= "paiements"."montant")));--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_statut_check" CHECK ("paiements"."statut" in ('en_attente', 'reussi', 'echoue', 'annule', 'a_rembourser', 'rembourse', 'bloque', 'libere', 'retenu'));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_caution_check" CHECK ("reglages"."caution_heure_liberation" < '12:00');--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution'));--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_type_check" CHECK ("alertes"."type" in ('reservation', 'signature', 'probleme', 'caution'));
