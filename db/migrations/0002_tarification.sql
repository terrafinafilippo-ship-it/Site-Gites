CREATE TABLE "baremes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baremes_nom_key" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "baremes_coefficients" (
	"bareme_id" uuid NOT NULL,
	"rang" integer NOT NULL,
	"coefficient" numeric(6, 4) NOT NULL,
	CONSTRAINT "baremes_coefficients_pkey" PRIMARY KEY("bareme_id","rang"),
	CONSTRAINT "baremes_coefficients_rang_check" CHECK ("baremes_coefficients"."rang" >= 1),
	CONSTRAINT "baremes_coefficients_coefficient_check" CHECK ("baremes_coefficients"."coefficient" > 0)
);
--> statement-breakpoint
CREATE TABLE "tarifs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"nuits_minimum" integer,
	"jours_arrivee" integer[],
	"jours_depart" integer[],
	"bareme_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tarifs_nom_key" UNIQUE("nom"),
	CONSTRAINT "tarifs_nuits_minimum_check" CHECK (("tarifs"."nuits_minimum" is null or "tarifs"."nuits_minimum" >= 1)),
	CONSTRAINT "tarifs_jours_arrivee_check" CHECK (("tarifs"."jours_arrivee" is null or (cardinality("tarifs"."jours_arrivee") >= 1 and "tarifs"."jours_arrivee" <@ array[1, 2, 3, 4, 5, 6, 7]))),
	CONSTRAINT "tarifs_jours_depart_check" CHECK (("tarifs"."jours_depart" is null or (cardinality("tarifs"."jours_depart") >= 1 and "tarifs"."jours_depart" <@ array[1, 2, 3, 4, 5, 6, 7]))),
	CONSTRAINT "tarifs_nom_check" CHECK (length(trim("tarifs"."nom")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tarifs_prix" (
	"tarif_id" uuid NOT NULL,
	"gite_id" uuid NOT NULL,
	"prix_nuit" numeric(10, 2) NOT NULL,
	CONSTRAINT "tarifs_prix_pkey" PRIMARY KEY("tarif_id","gite_id"),
	CONSTRAINT "tarifs_prix_prix_nuit_check" CHECK ("tarifs_prix"."prix_nuit" > 0)
);
--> statement-breakpoint
CREATE TABLE "periodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarif_id" uuid NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"nuits_minimum" integer,
	"jours_arrivee" integer[],
	"jours_depart" integer[],
	"bareme_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodes_dates_check" CHECK ("periodes"."date_fin" > "periodes"."date_debut"),
	CONSTRAINT "periodes_nuits_minimum_check" CHECK (("periodes"."nuits_minimum" is null or "periodes"."nuits_minimum" >= 1)),
	CONSTRAINT "periodes_jours_arrivee_check" CHECK (("periodes"."jours_arrivee" is null or (cardinality("periodes"."jours_arrivee") >= 1 and "periodes"."jours_arrivee" <@ array[1, 2, 3, 4, 5, 6, 7]))),
	CONSTRAINT "periodes_jours_depart_check" CHECK (("periodes"."jours_depart" is null or (cardinality("periodes"."jours_depart") >= 1 and "periodes"."jours_depart" <@ array[1, 2, 3, 4, 5, 6, 7])))
);
--> statement-breakpoint
CREATE TABLE "reglages" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"nuits_minimum" integer DEFAULT 1 NOT NULL,
	"jours_arrivee" integer[] DEFAULT '{1,2,3,4,5,6,7}'::integer[] NOT NULL,
	"jours_depart" integer[] DEFAULT '{1,2,3,4,5,6,7}'::integer[] NOT NULL,
	"bareme_general_id" uuid,
	"periodes_jour_debut" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reglages_ligne_unique_check" CHECK ("reglages"."id" = 1),
	CONSTRAINT "reglages_nuits_minimum_check" CHECK ("reglages"."nuits_minimum" >= 1),
	CONSTRAINT "reglages_jours_arrivee_check" CHECK ((cardinality("reglages"."jours_arrivee") >= 1 and "reglages"."jours_arrivee" <@ array[1, 2, 3, 4, 5, 6, 7])),
	CONSTRAINT "reglages_jours_depart_check" CHECK ((cardinality("reglages"."jours_depart") >= 1 and "reglages"."jours_depart" <@ array[1, 2, 3, 4, 5, 6, 7])),
	CONSTRAINT "reglages_periodes_jour_debut_check" CHECK ("reglages"."periodes_jour_debut" is null or "reglages"."periodes_jour_debut" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "taxes_sejour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"date_debut" date NOT NULL,
	"mode" text NOT NULL,
	"taux" numeric(5, 2),
	"plafond" numeric(10, 2),
	"tarif_fixe" numeric(10, 2),
	"taxe_additionnelle" numeric(5, 2) DEFAULT '0' NOT NULL,
	"menage_dans_assiette" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxes_sejour_gite_date_key" UNIQUE("gite_id","date_debut"),
	CONSTRAINT "taxes_sejour_mode_check" CHECK ("taxes_sejour"."mode" in ('proportionnel', 'fixe')),
	CONSTRAINT "taxes_sejour_parametres_check" CHECK (("taxes_sejour"."mode" = 'proportionnel' and "taxes_sejour"."taux" is not null and "taxes_sejour"."plafond" is not null)
          or ("taxes_sejour"."mode" = 'fixe' and "taxes_sejour"."tarif_fixe" is not null)),
	CONSTRAINT "taxes_sejour_valeurs_check" CHECK (("taxes_sejour"."taux" is null or "taxes_sejour"."taux" > 0) and ("taxes_sejour"."plafond" is null or "taxes_sejour"."plafond" > 0)
          and ("taxes_sejour"."tarif_fixe" is null or "taxes_sejour"."tarif_fixe" >= 0) and "taxes_sejour"."taxe_additionnelle" >= 0)
);
--> statement-breakpoint
ALTER TABLE "baremes_coefficients" ADD CONSTRAINT "baremes_coefficients_bareme_id_baremes_id_fk" FOREIGN KEY ("bareme_id") REFERENCES "public"."baremes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifs" ADD CONSTRAINT "tarifs_bareme_id_baremes_id_fk" FOREIGN KEY ("bareme_id") REFERENCES "public"."baremes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifs_prix" ADD CONSTRAINT "tarifs_prix_tarif_id_tarifs_id_fk" FOREIGN KEY ("tarif_id") REFERENCES "public"."tarifs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifs_prix" ADD CONSTRAINT "tarifs_prix_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_tarif_id_tarifs_id_fk" FOREIGN KEY ("tarif_id") REFERENCES "public"."tarifs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_bareme_id_baremes_id_fk" FOREIGN KEY ("bareme_id") REFERENCES "public"."baremes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_bareme_general_id_baremes_id_fk" FOREIGN KEY ("bareme_general_id") REFERENCES "public"."baremes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxes_sejour" ADD CONSTRAINT "taxes_sejour_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "periodes_tarif_id_idx" ON "periodes" USING btree ("tarif_id");