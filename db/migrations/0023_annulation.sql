-- Annulation et avoir (Phase 5, lot 5, D-42, 15 novembre 2026) : la table
-- des annulations faites depuis le back-office (règle de l'article 7 et son
-- résultat), celle des remboursements (carte chez Stripe, ou virement fait
-- par les propriétaires), celle des avoirs (suite AV à part, D-41), et deux
-- objets de courriel (« annulation », « avoir »). Aucune donnée existante ne
-- change.
--
-- creer_avoir est, pour les avoirs, ce que creer_facture est pour les
-- factures : le SEUL point d'entrée, qui obtient le numéro par
-- prochain_numero('AV', année de Paris) dans la même transaction que l'INSERT.
-- Un INSERT refusé (index unique, CHECK) annule l'incrément : aucun trou.

CREATE TABLE "annulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"initiative" text NOT NULL,
	"prevenu_le" timestamp,
	"paye" numeric(10, 2) NOT NULL,
	"conserve" numeric(10, 2) NOT NULL,
	"rembourse" numeric(10, 2) NOT NULL,
	"taxe_remboursee" numeric(10, 2) NOT NULL,
	"date_arrivee" date NOT NULL,
	"acteur" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annulations_initiative_check" CHECK ("annulations"."initiative" in ('client', 'bailleur', 'absence')),
	CONSTRAINT "annulations_prevenu_check" CHECK (("annulations"."initiative" = 'client') = ("annulations"."prevenu_le" is not null)),
	CONSTRAINT "annulations_montants_check" CHECK ("annulations"."conserve" >= 0 and "annulations"."rembourse" >= 0 and "annulations"."paye" = "annulations"."conserve" + "annulations"."rembourse"
          and "annulations"."taxe_remboursee" >= 0 and "annulations"."taxe_remboursee" <= "annulations"."rembourse")
);
--> statement-breakpoint
CREATE TABLE "remboursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"paiement_id" uuid,
	"mode" text NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"statut" text DEFAULT 'a_faire' NOT NULL,
	"reference_externe" text,
	"erreur" text,
	"fait_at" timestamp with time zone,
	"fait_par" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remboursements_mode_check" CHECK ("remboursements"."mode" in ('carte', 'virement')),
	CONSTRAINT "remboursements_statut_check" CHECK ("remboursements"."statut" in ('a_faire', 'fait')),
	CONSTRAINT "remboursements_montant_check" CHECK ("remboursements"."montant" > 0),
	CONSTRAINT "remboursements_carte_check" CHECK ("remboursements"."mode" <> 'carte' or "remboursements"."paiement_id" is not null),
	CONSTRAINT "remboursements_fait_check" CHECK (("remboursements"."statut" = 'fait') = ("remboursements"."fait_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "avoirs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"reservation_id" uuid NOT NULL,
	"facture_id" uuid NOT NULL,
	"montant" numeric(10, 2) NOT NULL,
	"date_emission" date DEFAULT current_date NOT NULL,
	"pdf_url" text,
	"donnees" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avoirs_numero_key" UNIQUE("numero"),
	CONSTRAINT "avoirs_montant_check" CHECK ("avoirs"."montant" > 0)
);
--> statement-breakpoint
ALTER TABLE "courriels" DROP CONSTRAINT "courriels_objet_check";--> statement-breakpoint
ALTER TABLE "annulations" ADD CONSTRAINT "annulations_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remboursements" ADD CONSTRAINT "remboursements_paiement_id_paiements_id_fk" FOREIGN KEY ("paiement_id") REFERENCES "public"."paiements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avoirs" ADD CONSTRAINT "avoirs_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "annulations_reservation_uidx" ON "annulations" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "remboursements_reservation_idx" ON "remboursements" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remboursements_paiement_uidx" ON "remboursements" USING btree ("paiement_id") WHERE "remboursements"."paiement_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "avoirs_reservation_uidx" ON "avoirs" USING btree ("reservation_id");--> statement-breakpoint
ALTER TABLE "courriels" ADD CONSTRAINT "courriels_objet_check" CHECK ("courriels"."objet" in ('confirmation', 'contrat', 'remboursement', 'lien_suivi', 'facture', 'solde_preavis',
          'solde_lien', 'solde_rappel', 'solde_impaye', 'caution_bloquee', 'caution_a_valider', 'caution_liberee',
          'caution_carte', 'caution_virement', 'caution_retenue', 'caution_recue', 'caution_rendue',
          'option', 'contrat_signe', 'avis_invitation', 'avis_retrait', 'annulation', 'avoir',
          'alerte_reservation', 'alerte_signature', 'alerte_probleme', 'alerte_caution', 'alerte_avis'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION creer_avoir(
  p_reservation_id uuid,
  p_facture_id uuid,
  p_montant numeric,
  p_donnees jsonb
)
RETURNS avoirs
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_emission date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_avoir avoirs;
BEGIN
  INSERT INTO avoirs (numero, reservation_id, facture_id, montant, date_emission, donnees)
  VALUES (
    prochain_numero('AV', extract(year FROM v_date_emission)::int),
    p_reservation_id,
    p_facture_id,
    p_montant,
    v_date_emission,
    p_donnees
  )
  RETURNING * INTO v_avoir;

  RETURN v_avoir;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION creer_avoir(uuid, uuid, numeric, jsonb) IS
  'Crée un avoir avec le prochain numéro de la série AV (D-41). Renvoie la ligne avoirs complète.';
