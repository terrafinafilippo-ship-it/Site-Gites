CREATE TABLE "gites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ref_gdf" text NOT NULL,
	"slug" text NOT NULL,
	"adresse" text NOT NULL,
	"capacite_max" integer NOT NULL,
	"forfait_menage" numeric(10, 2) NOT NULL,
	"caution" numeric(10, 2) NOT NULL,
	"equipements_specifiques" text,
	"a_spa" boolean DEFAULT false NOT NULL,
	"contact_arrivee_tel" text,
	"tarif_semaine_base" numeric(10, 2),
	"tarif_weekend" numeric(10, 2),
	"taux_taxe_sejour" numeric(5, 2),
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gites_ref_gdf_key" UNIQUE("ref_gdf"),
	CONSTRAINT "gites_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"numero_contrat" text,
	"client_civilite" text,
	"client_nom" text,
	"client_prenom" text,
	"client_adresse" text,
	"client_code_postal" text,
	"client_ville" text,
	"client_pays" text DEFAULT 'France',
	"client_email" text,
	"client_telephone" text,
	"client_civilite_conjoint" text,
	"client_nom_conjoint" text,
	"client_prenom_conjoint" text,
	"date_arrivee" date NOT NULL,
	"date_depart" date NOT NULL,
	"heure_arrivee" time,
	"heure_depart" time,
	"heure_limite_arrivee" time,
	"nb_adultes" integer DEFAULT 0 NOT NULL,
	"nb_enfants" integer DEFAULT 0 NOT NULL,
	"nb_bebes" integer DEFAULT 0 NOT NULL,
	"occupants_majeurs" text,
	"prix_location" numeric(10, 2),
	"forfait_menage" numeric(10, 2),
	"options" numeric(10, 2),
	"taxe_sejour" numeric(10, 2),
	"taux_taxe_sejour" numeric(5, 2),
	"mode_paiement" text,
	"reference_transaction" text,
	"date_paiement_acompte" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_reference_key" UNIQUE("reference"),
	CONSTRAINT "reservations_statut_check" CHECK ("reservations"."statut" in ('brouillon', 'en_attente_paiement', 'confirmee', 'annulee', 'terminee'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"numero" text NOT NULL,
	"url_pdf" text NOT NULL,
	"statut" text DEFAULT 'genere' NOT NULL,
	"token" text,
	"token_expire_at" timestamp with time zone,
	"template_version" text,
	"date_signature" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"signataire_nom" text NOT NULL,
	"signataire_email" text,
	"token" text NOT NULL,
	"consentement_texte" text NOT NULL,
	"document_hash" text NOT NULL,
	"document_storage_path" text NOT NULL,
	"ip_signataire" "inet",
	"user_agent" text NOT NULL,
	"signe_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"type" text NOT NULL,
	"reservation_id" uuid NOT NULL,
	"facture_acompte_id" uuid,
	"montant_ttc" numeric(10, 2) NOT NULL,
	"date_emission" date DEFAULT current_date NOT NULL,
	"pdf_url" text,
	"donnees" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factures_numero_key" UNIQUE("numero"),
	CONSTRAINT "factures_type_check" CHECK ("factures"."type" in ('acompte', 'solde'))
);
--> statement-breakpoint
CREATE TABLE "compteurs_documents" (
	"serie" text NOT NULL,
	"annee" integer NOT NULL,
	"dernier_numero" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "compteurs_documents_serie_annee_pk" PRIMARY KEY("serie","annee")
);
--> statement-breakpoint
CREATE TABLE "paiements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"statut" text NOT NULL,
	"prestataire" text,
	"reference_externe" text,
	"date_paiement" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paiements_type_check" CHECK ("paiements"."type" in ('acompte', 'solde', 'caution'))
);
--> statement-breakpoint
CREATE TABLE "disponibilites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"date" date NOT NULL,
	"statut" text DEFAULT 'libre' NOT NULL,
	"source" text DEFAULT 'directe' NOT NULL,
	"reservation_id" uuid,
	"verrou_expire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disponibilites_statut_check" CHECK ("disponibilites"."statut" in ('libre', 'reserve', 'bloque', 'verrou')),
	CONSTRAINT "disponibilites_source_check" CHECK ("disponibilites"."source" in ('directe', 'airbnb', 'booking', 'gdf'))
);
--> statement-breakpoint
CREATE TABLE "avis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gite_id" uuid NOT NULL,
	"source" text NOT NULL,
	"note" numeric(2, 1) NOT NULL,
	"commentaire" text,
	"auteur" text,
	"date_sejour" date,
	"publie" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_cible" text NOT NULL,
	"ligne_id" text,
	"action" text NOT NULL,
	"acteur" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_facture_acompte_id_factures_id_fk" FOREIGN KEY ("facture_acompte_id") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilites" ADD CONSTRAINT "disponibilites_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avis" ADD CONSTRAINT "avis_gite_id_gites_id_fk" FOREIGN KEY ("gite_id") REFERENCES "public"."gites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_gite_id_idx" ON "reservations" USING btree ("gite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_resa_type_uidx" ON "documents" USING btree ("reservation_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_token_uidx" ON "documents" USING btree ("token") WHERE "documents"."token" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "signatures_document_id_uidx" ON "signatures" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "signatures_reservation_id_idx" ON "signatures" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "factures_reservation_id_idx" ON "factures" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "paiements_reservation_id_idx" ON "paiements" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disponibilites_gite_date_uidx" ON "disponibilites" USING btree ("gite_id","date");--> statement-breakpoint
CREATE INDEX "avis_gite_id_idx" ON "avis" USING btree ("gite_id");