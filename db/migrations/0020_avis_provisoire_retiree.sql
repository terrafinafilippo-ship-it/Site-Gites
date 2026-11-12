-- Les avis des clients (Phase 6, D-40), première étape : la table `avis`
-- provisoire de la Phase 0 est retirée. Aucun code ne l'a jamais écrite ni
-- lue ; la migration 0021 crée la table définitive.
--
-- GARDE-FOU : si la table contient une ligne, la migration s'arrête sans rien
-- toucher. Un avis saisi à la main ne doit pas disparaître en silence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "avis") THEN
    RAISE EXCEPTION 'La table avis contient des lignes : migration 0020 arrêtée, rien n''a été modifié.';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "avis" CASCADE;
