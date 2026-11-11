-- Taxe de séjour : un bébé ne compte pas parmi les occupants qui se partagent
-- le prix de la nuit (réponse du gérant du 11 novembre 2026, docs/06, point 10).
--
-- Seule la valeur par défaut change : une nouvelle ligne de taxe naît « bébés
-- non comptés ». Les lignes existantes ne sont pas réécrites (une ligne
-- commencée est figée, D-34) ; la base réelle n'en a aucune à cette date.
ALTER TABLE "taxes_sejour" ALTER COLUMN "bebes_parmi_occupants" SET DEFAULT false;
