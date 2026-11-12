-- Le sauna à l'article 12 du contrat (point 8 de docs/06-avant-premier-client.md).
--
-- gites.a_sauna : comme a_spa, une case de la fiche du gîte ; elle déclenche
-- les règles du sauna à l'article 12. Seule La Maison Vieille en a un : la
-- migration coche sa case (slug 'maison-vieille').
--
-- reservations.contrat_a_sauna : figé à l'émission du contrat, comme
-- contrat_a_spa (écart E-9, migration 0016). Un contrat déjà émis n'a imprimé
-- aucune règle sauna : il reçoit faux, pour que sa copie signée reste celle
-- qu'il a envoyée.
ALTER TABLE "gites" ADD COLUMN "a_sauna" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "contrat_a_sauna" boolean;--> statement-breakpoint
UPDATE "gites" SET "a_sauna" = true WHERE "slug" = 'maison-vieille';--> statement-breakpoint
UPDATE "reservations" SET "contrat_a_sauna" = false WHERE "numero_contrat" IS NOT NULL;
