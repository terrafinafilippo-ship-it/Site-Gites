-- Réponses du comptable et du gérant (19 novembre 2026) :
--
-- 1. L'avoir a son propre numéro, mais PAS sa propre suite : il prend le
--    prochain numéro de la suite des factures, FAC-AAAA-NNN (choix 1 A), sur
--    un document intitulé « Avoir ». creer_avoir reste le SEUL point d'entrée
--    et obtient le numéro par prochain_numero('FAC', année de Paris) dans la
--    même transaction que l'INSERT : la suite des factures et des avoirs, lue
--    ensemble, reste sans trou ni doublon. Aucun avoir n'existe sur la base
--    réelle à cette date : rien n'est renuméroté.
--
-- 2. Pas de facture pour une retenue sur la caution (choix 2 A) : le type
--    'retenue' de la migration 0022 est retiré. La migration échoue si une
--    facture de retenue existe déjà (aucune sur la base réelle à cette date) :
--    une facture ne se supprime jamais, prévenir le développeur.
--
-- 3. Le solde est remboursé jusqu'à 72 heures avant l'arrivée (point 16),
--    au lieu de 48. Le réglage n'est pas modifiable au back-office (cadrage
--    de la Phase 5, réponse P) : la valeur par défaut et la ligne existante
--    passent à 72, seulement si elle valait encore 48. Les réservations déjà
--    faites gardent le délai recopié à leur création.
ALTER TABLE "factures" DROP CONSTRAINT "factures_type_check";--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_type_check" CHECK ("factures"."type" in ('acompte', 'solde', 'total'));--> statement-breakpoint
COMMENT ON FUNCTION creer_facture(uuid, text, numeric, jsonb, uuid) IS
  'Crée une facture (acompte, solde ou total) avec le prochain numéro de la série FAC. Renvoie la ligne factures complète.';--> statement-breakpoint
ALTER TABLE "reglages" ALTER COLUMN "delai_remboursement_solde_heures" SET DEFAULT 72;--> statement-breakpoint
UPDATE "reglages" SET "delai_remboursement_solde_heures" = 72 WHERE "delai_remboursement_solde_heures" = 48;--> statement-breakpoint
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
    prochain_numero('FAC', extract(year FROM v_date_emission)::int),
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
