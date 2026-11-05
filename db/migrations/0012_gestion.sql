-- Phase 5, lot 1 : la connexion au back-office (D-32, choix du gérant du
-- 3 novembre 2026).
--
-- - un compte partagé (le compte est créé par `npm run gestion:compte`, qui
--   envoie le lien pour choisir le mot de passe : aucune ligne ici) ;
-- - appareils reconnus, sessions, codes d'un appareil inconnu, liens du mot
--   de passe, échecs par adresse IP — jetons et codes en empreinte seulement ;
-- - réglages : durées de reconnaissance (30 jours) et d'inactivité (8 heures),
--   5 échecs puis 15 minutes d'attente, code 10 minutes, lien 60 minutes.
CREATE TABLE "appareils_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"empreinte_jeton" text NOT NULL,
	"description" text NOT NULL,
	"derniere_connexion_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codes_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"empreinte_jeton" text NOT NULL,
	"empreinte_code" text NOT NULL,
	"description" text NOT NULL,
	"essais" integer DEFAULT 0 NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"utilise_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codes_gestion_essais_check" CHECK ("codes_gestion"."essais" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comptes_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courriel" text NOT NULL,
	"empreinte_mot_de_passe" text,
	"mot_de_passe_change_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comptes_gestion_courriel_check" CHECK ("comptes_gestion"."courriel" = lower(trim("comptes_gestion"."courriel")) and "comptes_gestion"."courriel" like '%_@_%')
);
--> statement-breakpoint
CREATE TABLE "essais_gestion" (
	"ip" text PRIMARY KEY NOT NULL,
	"echecs" integer DEFAULT 0 NOT NULL,
	"bloque_jusqu_a" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essais_gestion_echecs_check" CHECK ("essais_gestion"."echecs" >= 0)
);
--> statement-breakpoint
CREATE TABLE "liens_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"empreinte_jeton" text NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"utilise_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_gestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compte_id" uuid NOT NULL,
	"appareil_id" uuid NOT NULL,
	"empreinte_jeton" text NOT NULL,
	"derniere_activite_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_appareil_jours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_inactivite_heures" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_essais_max" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_attente_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_code_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "gestion_lien_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "appareils_gestion" ADD CONSTRAINT "appareils_gestion_compte_id_comptes_gestion_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_gestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes_gestion" ADD CONSTRAINT "codes_gestion_compte_id_comptes_gestion_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_gestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liens_gestion" ADD CONSTRAINT "liens_gestion_compte_id_comptes_gestion_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_gestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_gestion" ADD CONSTRAINT "sessions_gestion_compte_id_comptes_gestion_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_gestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_gestion" ADD CONSTRAINT "sessions_gestion_appareil_id_appareils_gestion_id_fk" FOREIGN KEY ("appareil_id") REFERENCES "public"."appareils_gestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appareils_gestion_jeton_uidx" ON "appareils_gestion" USING btree ("empreinte_jeton");--> statement-breakpoint
CREATE INDEX "appareils_gestion_compte_idx" ON "appareils_gestion" USING btree ("compte_id");--> statement-breakpoint
CREATE UNIQUE INDEX "codes_gestion_jeton_uidx" ON "codes_gestion" USING btree ("empreinte_jeton");--> statement-breakpoint
CREATE UNIQUE INDEX "comptes_gestion_courriel_uidx" ON "comptes_gestion" USING btree ("courriel");--> statement-breakpoint
CREATE UNIQUE INDEX "liens_gestion_jeton_uidx" ON "liens_gestion" USING btree ("empreinte_jeton");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_gestion_jeton_uidx" ON "sessions_gestion" USING btree ("empreinte_jeton");--> statement-breakpoint
CREATE INDEX "sessions_gestion_appareil_idx" ON "sessions_gestion" USING btree ("appareil_id");--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_gestion_check" CHECK ("reglages"."gestion_appareil_jours" between 1 and 365 and "reglages"."gestion_inactivite_heures" between 1 and 168
          and "reglages"."gestion_essais_max" between 1 and 20 and "reglages"."gestion_attente_minutes" between 1 and 1440
          and "reglages"."gestion_code_minutes" between 1 and 60 and "reglages"."gestion_lien_minutes" between 5 and 1440);