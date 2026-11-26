-- Synchronisation des calendriers avec Gîtes de France, Airbnb et Booking
-- (Phase 7, D-44, choix du gérant du 26 novembre 2026) :
--
-- 1. `calendriers` : par gîte et par plateforme, le lien secret du site donné
--    à la plateforme, et le lien de calendrier de la plateforme collé par les
--    propriétaires. Aucune ligne n'est créée ici : le site les crée à la
--    première ouverture de la fiche du gîte (les gîtes eux-mêmes peuvent
--    naître après cette migration, par db:seed).
-- 2. `sejours_plateformes` : les séjours annoncés par chaque plateforme ;
--    leurs nuits vont dans `disponibilites` (statut 'reserve', source de la
--    plateforme, sans réservation), ce que les contraintes acceptent déjà.
-- 3. Réglage `doublon_delai_heures` (24) : le délai annoncé au client pour
--    être prévenu d'un doublon avec une plateforme.
CREATE TABLE "calendriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"plateforme" text NOT NULL,
	"jeton_export" text NOT NULL,
	"lien_import" text,
	"lu_at" timestamp with time zone,
	"erreur" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendriers_plateforme_check" CHECK ("calendriers"."plateforme" in ('gdf', 'airbnb', 'booking')),
	CONSTRAINT "calendriers_jeton_check" CHECK ("calendriers"."jeton_export" ~ '^[0-9a-f]{48}$'),
	CONSTRAINT "calendriers_lien_check" CHECK ("calendriers"."lien_import" is null or "calendriers"."lien_import" ~ '^https://[^[:space:]]+$')
);
--> statement-breakpoint
CREATE TABLE "sejours_plateformes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendrier_id" uuid NOT NULL,
	"arrivee" date NOT NULL,
	"depart" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sejours_plateformes_dates_check" CHECK ("sejours_plateformes"."depart" > "sejours_plateformes"."arrivee")
);
--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "doublon_delai_heures" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendriers" ADD CONSTRAINT "calendriers_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sejours_plateformes" ADD CONSTRAINT "sejours_plateformes_calendrier_id_calendriers_id_fk" FOREIGN KEY ("calendrier_id") REFERENCES "public"."calendriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendriers_gite_plateforme_uidx" ON "calendriers" USING btree ("gite_id","plateforme");--> statement-breakpoint
CREATE UNIQUE INDEX "calendriers_jeton_export_uidx" ON "calendriers" USING btree ("jeton_export");--> statement-breakpoint
CREATE UNIQUE INDEX "sejours_plateformes_calendrier_dates_uidx" ON "sejours_plateformes" USING btree ("calendrier_id","arrivee","depart");--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_doublon_delai_check" CHECK ("reglages"."doublon_delai_heures" between 1 and 168);