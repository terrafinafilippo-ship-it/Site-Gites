-- Les avis des clients (Phase 6, D-40), seconde étape (la 0020 a retiré la
-- table provisoire).
--
-- avis : un avis par réservation, déposé par le lien personnel reçu après le
-- départ ; note de 1 à 5, commentaire facultatif, signature « Camille D. »
-- figée au dépôt ; publié tout de suite, retiré seulement pour un motif de la
-- politique des avis (retire_at et motif_retrait vont ensemble).
--
-- gites.gdf_* : les chiffres Gîtes de France de chaque gîte, jusqu'ici écrits
-- en dur dans lib/data/gites.ts, passent sur la fiche du back-office. La
-- migration y recopie les valeurs du site au 12 novembre 2026 (confirmées par
-- le gérant : ce sont celles de Gîtes de France) ; la page Gîtes de France
-- (gdf_lien) reste vide, le lien « Lire les avis » ne s'affiche pas tant
-- qu'elle n'est pas saisie.
--
-- reglages.avis_courriel_jours, avis_lien_jours : le courriel d'invitation
-- part le lendemain du départ (1), son lien reste ouvert jusqu'au 30e jour
-- après le départ.
--
-- courriels : l'invitation, le retrait, l'alerte « nouvel avis ».
-- alertes : 'avis', créée active avec les destinataires de 'probleme'.
CREATE TABLE "avis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"gite_id" uuid NOT NULL,
	"note" integer NOT NULL,
	"commentaire" text,
	"signature" text NOT NULL,
	"langue" text NOT NULL,
	"date_sejour" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retire_at" timestamp with time zone,
	"motif_retrait" text,
	CONSTRAINT "avis_note_check" CHECK ("avis"."note" between 1 and 5),
	CONSTRAINT "avis_commentaire_check" CHECK ("avis"."commentaire" is null or char_length("avis"."commentaire") between 1 and 2000),
	CONSTRAINT "avis_signature_check" CHECK (char_length(trim("avis"."signature")) between 1 and 80),
	CONSTRAINT "avis_langue_check" CHECK ("avis"."langue" in ('fr', 'en')),
	CONSTRAINT "avis_retrait_check" CHECK (("avis"."retire_at" is null) = ("avis"."motif_retrait" is null)
          and ("avis"."motif_retrait" is null or "avis"."motif_retrait" in ('injurieux', 'hors_sujet', 'donnees_personnelles', 'demande_auteur')))
);
--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "alertes" DROP CONSTRAINT "alertes_type_check";--> statement-breakpoint
ALTER TABLE "gites" ADD COLUMN "gdf_note_centiemes" integer;--> statement-breakpoint
ALTER TABLE "gites" ADD COLUMN "gdf_avis_nombre" integer;--> statement-breakpoint
ALTER TABLE "gites" ADD COLUMN "gdf_recommandation_pct" integer;--> statement-breakpoint
ALTER TABLE "gites" ADD COLUMN "gdf_lien" text;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "avis_courriel_jours" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "avis_lien_jours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "avis" ADD CONSTRAINT "avis_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avis" ADD CONSTRAINT "avis_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avis_reservation_id_uidx" ON "avis" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "avis_gite_id_idx" ON "avis" USING btree ("gite_id","created_at");--> statement-breakpoint
ALTER TABLE "gites" ADD CONSTRAINT "gites_gdf_check" CHECK (("gites"."gdf_note_centiemes" is null) = ("gites"."gdf_avis_nombre" is null)
          and ("gites"."gdf_note_centiemes" is null or "gites"."gdf_note_centiemes" between 0 and 500)
          and ("gites"."gdf_avis_nombre" is null or "gites"."gdf_avis_nombre" >= 0)
          and ("gites"."gdf_recommandation_pct" is null or "gites"."gdf_recommandation_pct" between 0 and 100)
          and ("gites"."gdf_lien" is null or "gites"."gdf_lien" ~ '^https://[^[:space:]]+$'));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_avis_delais_check" CHECK ("reglages"."avis_courriel_jours" between 0 and 60 and "reglages"."avis_lien_jours" between 1 and 365
          and "reglages"."avis_lien_jours" >= "reglages"."avis_courriel_jours");--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'caution_retenue', 'caution_recue', 'caution_rendue',
          'option', 'contrat_signe', 'avis_invitation', 'avis_retrait',
          'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution', 'alerte_avis'));--> statement-breakpoint
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_type_check" CHECK ("alertes"."type" in ('reservation', 'signature', 'probleme', 'caution', 'avis'));--> statement-breakpoint
UPDATE "gites" SET "gdf_note_centiemes" = 500, "gdf_avis_nombre" = 16, "gdf_recommandation_pct" = 100 WHERE "slug" = 'laphine';--> statement-breakpoint
UPDATE "gites" SET "gdf_note_centiemes" = 500, "gdf_avis_nombre" = 22, "gdf_recommandation_pct" = 100 WHERE "slug" = 'armu';--> statement-breakpoint
UPDATE "gites" SET "gdf_note_centiemes" = 490, "gdf_avis_nombre" = 8, "gdf_recommandation_pct" = 100 WHERE "slug" = 'maison-vieille';--> statement-breakpoint
INSERT INTO "alertes" ("type", "active", "destinataires")
SELECT 'avis', "active", "destinataires" FROM "alertes" WHERE "type" = 'probleme';
