-- Phase 3, lot 4 : courriels. Journal des courriels du site (idempotent,
-- retenté), alertes aux propriétaires, adresses d'expédition et de réponse.
--
-- Écrit à la main (le reste est généré) :
--   - adresses des réglages, choix du gérant du 24 octobre 2026 : les
--     courriels automatiques partent de reservation@gitesdesamoyas.fr
--     (« Les Gîtes de Samoyas »), on n'y répond pas ; « Répondre » écrit à
--     contact@gitesdesamoyas.fr. La valeur par défaut sert à remplir la ligne
--     existante, puis elle est RETIRÉE : aucune adresse implicite ;
--   - updated_at de courriels et d'alertes entretenu par le trigger commun ;
--   - les trois alertes, choix du gérant du 27 octobre 2026 : actives,
--     envoyées à contact@gitesdesamoyas.fr.
CREATE TABLE "courriels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid,
	"objet" text NOT NULL,
	"cle" text NOT NULL,
	"destinataire" text NOT NULL,
	"langue" text NOT NULL,
	"donnees" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statut" text DEFAULT 'a_envoyer' NOT NULL,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"prochain_essai_at" timestamp with time zone DEFAULT now() NOT NULL,
	"derniere_erreur" text,
	"sujet" text,
	"corps_texte" text,
	"voie" text,
	"reference_externe" text,
	"envoye_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'alerte_reservation', 'alerte_signature', 'alerte_probleme')),
	CONSTRAINT "courriels_statut_check" CHECK ("courriels"."statut" in ('a_envoyer', 'envoye', 'echec')),
	CONSTRAINT "courriels_langue_check" CHECK ("courriels"."langue" in ('fr', 'en')),
	CONSTRAINT "courriels_voie_check" CHECK ("courriels"."voie" is null or "courriels"."voie" in ('brevo', 'fichier')),
	CONSTRAINT "courriels_envoye_check" CHECK ("courriels"."statut" <> 'envoye' or ("courriels"."envoye_at" is not null and "courriels"."voie" is not null and "courriels"."sujet" is not null))
);
--> statement-breakpoint
CREATE TABLE "alertes" (
	"type" text PRIMARY KEY NOT NULL,
	"active" boolean NOT NULL,
	"destinataires" text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertes_type_check" CHECK ("alertes"."type" in ('reservation', 'signature', 'probleme')),
	CONSTRAINT "alertes_destinataires_check" CHECK (not "alertes"."active" or cardinality("alertes"."destinataires") > 0)
);
--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "courriel_expediteur" text DEFAULT 'reservation@gitesdesamoyas.fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ALTER COLUMN "courriel_expediteur" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "courriel_expediteur_nom" text DEFAULT 'Les Gîtes de Samoyas' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ALTER COLUMN "courriel_expediteur_nom" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "courriel_reponse" text DEFAULT 'contact@gitesdesamoyas.fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ALTER COLUMN "courriel_reponse" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courriels_cle_uidx" ON "courriels" USING btree ("cle");--> statement-breakpoint
CREATE INDEX "courriels_reservation_id_idx" ON "courriels" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "courriels_a_envoyer_idx" ON "courriels" USING btree ("prochain_essai_at") WHERE "courriels"."statut" = 'a_envoyer';--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_courriels_check" CHECK ("reglages"."courriel_expediteur" like '%_@_%' and "reglages"."courriel_reponse" like '%_@_%'
          and length(trim("reglages"."courriel_expediteur_nom")) > 0);--> statement-breakpoint
CREATE TRIGGER courriels_set_updated_at
BEFORE UPDATE ON courriels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER alertes_set_updated_at
BEFORE UPDATE ON alertes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
INSERT INTO "alertes" ("type", "active", "destinataires") VALUES
	('reservation', true, ARRAY['contact@gitesdesamoyas.fr']),
	('signature', true, ARRAY['contact@gitesdesamoyas.fr']),
	('probleme', true, ARRAY['contact@gitesdesamoyas.fr']);
