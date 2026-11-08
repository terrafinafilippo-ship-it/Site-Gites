-- Phase 5, lot 4 : la fiche du gîte figée sur la réservation à l'émission du
-- contrat (écart E-9, choix du gérant du 8 novembre 2026).
--
-- Capacité, équipements, spa et téléphone d'arrivée sont imprimés au contrat
-- et se modifient au back-office depuis le lot 4. Ils sont recopiés sur la
-- réservation dans la transaction qui émet le contrat ; la copie signée les
-- relit là, et non plus sur la fiche du gîte du jour de la signature.
--
-- Les contrats déjà émis reçoivent la fiche actuelle de leur gîte : avant le
-- lot 4, elle ne se modifiait pas, c'est donc celle qu'ils ont imprimée.
ALTER TABLE "reservations" ADD COLUMN "contrat_capacite_max" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "contrat_equipements" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "contrat_a_spa" boolean;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "contrat_contact_arrivee_tel" text;--> statement-breakpoint
UPDATE "reservations" r SET
  "contrat_capacite_max" = g."capacite_max",
  "contrat_equipements" = g."equipements_specifiques",
  "contrat_a_spa" = g."a_spa",
  "contrat_contact_arrivee_tel" = g."contact_arrivee_tel"
FROM "gites" g
WHERE g."id" = r."gite_id" AND r."numero_contrat" IS NOT NULL;
