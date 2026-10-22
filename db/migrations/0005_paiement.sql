-- Phase 3, lot 3 : paiement. Conditions de paiement figées sur la
-- réservation, choix du client (caution, solde, langue), carte enregistrée,
-- texte d'accord versionné, forme définitive de la table paiements.
--
-- Écrit à la main (le reste est généré) :
--   - taux_acompte et delai_solde_jours des réservations existantes reçoivent
--     30 % et 30 jours, les valeurs du contrat jusqu'ici ; la valeur par défaut
--     est ensuite RETIRÉE : toute nouvelle réservation dit les siennes ;
--   - updated_at de paiements entretenu par le trigger commun ;
--   - textes_accord immuable (trigger), et ses deux premières versions : le
--     texte validé par le gérant le 14 octobre 2026 et sa traduction anglaise
--     validée le 20 octobre 2026. Les crochets du texte d'origine sont devenus
--     des repères ; la ligne du solde, présente « si le client l'a choisi »,
--     porte son point-virgule (sans elle, la phrase finit par un point).
CREATE TABLE "textes_accord" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objet" text NOT NULL,
	"langue" text NOT NULL,
	"en_vigueur_depuis" date NOT NULL,
	"modele" text NOT NULL,
	"modele_solde" text NOT NULL,
	"valide_par" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "textes_accord_version_key" UNIQUE("objet","langue","en_vigueur_depuis"),
	CONSTRAINT "textes_accord_objet_check" CHECK ("textes_accord"."objet" in ('carte')),
	CONSTRAINT "textes_accord_langue_check" CHECK ("textes_accord"."langue" in ('fr', 'en'))
);
--> statement-breakpoint
ALTER TABLE "paiements" DROP CONSTRAINT "paiements_type_check";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "taux_acompte" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "taux_acompte" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "delai_solde_jours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "delai_solde_jours" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "paiement_integral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "moyen_caution" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "mode_solde" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "langue" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "stripe_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "accord_carte_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "accord_carte_texte" text;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "motif_remboursement" text;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "reference_remboursement" text;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "date_remboursement" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "paiements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "taux_acompte" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "delai_solde_jours" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reglages" ADD COLUMN "delai_virement_caution_jours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_accord_carte_id_textes_accord_id_fk" FOREIGN KEY ("accord_carte_id") REFERENCES "public"."textes_accord"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paiements_reference_externe_uidx" ON "paiements" USING btree ("reference_externe");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_conditions_check" CHECK ("reservations"."taux_acompte" between 1 and 100 and "reservations"."delai_solde_jours" between 0 and 365);--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_langue_check" CHECK ("reservations"."langue" in ('fr', 'en'));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_moyen_caution_check" CHECK ("reservations"."moyen_caution" is null or "reservations"."moyen_caution" in ('carte', 'cheque', 'virement'));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_mode_solde_check" CHECK ("reservations"."mode_solde" is null or ("reservations"."mode_solde" in ('prelevement', 'lien')
          and not "reservations"."paiement_integral"
          and ("reservations"."mode_solde" = 'lien' or "reservations"."moyen_caution" = 'carte')));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_accord_carte_check" CHECK (("reservations"."accord_carte_id" is null) = ("reservations"."accord_carte_texte" is null));--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_statut_check" CHECK ("paiements"."statut" in ('en_attente', 'reussi', 'echoue', 'annule', 'a_rembourser', 'rembourse'));--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_remboursement_check" CHECK ("paiements"."statut" not in ('a_rembourser', 'rembourse') or "paiements"."motif_remboursement" is not null);--> statement-breakpoint
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_type_check" CHECK ("paiements"."type" in ('acompte', 'total', 'solde', 'caution'));--> statement-breakpoint
ALTER TABLE "reglages" ADD CONSTRAINT "reglages_paiement_check" CHECK ("reglages"."taux_acompte" between 1 and 100 and "reglages"."delai_solde_jours" between 0 and 365
          and "reglages"."delai_virement_caution_jours" between 0 and 60);--> statement-breakpoint
CREATE TRIGGER paiements_set_updated_at
BEFORE UPDATE ON paiements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE OR REPLACE FUNCTION textes_accord_interdire_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La table textes_accord est immuable : % refusé sur la version %',
    TG_OP, OLD.id
    USING HINT = 'Un nouveau texte est une nouvelle version, avec sa date d''entrée en vigueur.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER textes_accord_immuables
BEFORE UPDATE OR DELETE ON textes_accord
FOR EACH ROW
EXECUTE FUNCTION textes_accord_interdire_modification();--> statement-breakpoint
INSERT INTO "textes_accord" ("objet", "langue", "en_vigueur_depuis", "modele", "modele_solde", "valide_par") VALUES
('carte', 'fr', '2026-10-14',
 E'En validant ce paiement, j''accepte que la carte utilisée soit conservée par Stripe, prestataire de paiement de la SARL DE LA VOUTE, pour les opérations suivantes :
– une préautorisation de {caution} au titre du dépôt de garantie, effectuée la veille de mon départ. Elle n''est pas débitée, sauf dégât constaté, et elle est levée au plus tard 3 jours après mon départ{ligne_solde}.
Les données de ma carte sont supprimées au plus tard 7 jours après mon départ.',
 E' ;
– le prélèvement du solde de {montant}, le {date}',
 'Gérant, 14 octobre 2026 (docs/phases/phase-3.md) — relecture par un juriste à faire'),
('carte', 'en', '2026-10-20',
 E'By confirming this payment, I agree that the card used will be stored by Stripe, payment provider of SARL DE LA VOUTE, for the following operations:
– a pre-authorisation of {caution} as a security deposit, made the day before my departure. It is not charged unless damage is found, and it is released no later than 3 days after my departure{ligne_solde}.
My card details are deleted no later than 7 days after my departure.',
 E';
– the charge of the balance of {montant} on {date}',
 'Gérant, 20 octobre 2026 (traduction du texte français) — relecture par un juriste à faire');
