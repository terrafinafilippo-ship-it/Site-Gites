-- Factures sur demande (D-41, 14 novembre 2026) : la facture d'une retenue
-- sur la caution devient un type de facture ('retenue'), numérotée dans la
-- même suite FAC par creer_facture, au plus une par réservation (index unique
-- factures_resa_type_uidx, inchangé). Aucune donnée existante ne change.

ALTER TABLE "factures" DROP CONSTRAINT "factures_type_check";--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_type_check" CHECK ("factures"."type" in ('acompte', 'solde', 'total', 'retenue'));--> statement-breakpoint
COMMENT ON FUNCTION creer_facture(uuid, text, numeric, jsonb, uuid) IS
  'Crée une facture (acompte, solde, total ou retenue) avec le prochain numéro de la série FAC. Renvoie la ligne factures complète.';
