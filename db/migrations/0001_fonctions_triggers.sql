-- 0001_fonctions_triggers.sql
-- Fonctions et triggers que Drizzle ne sait pas décrire dans le schéma TypeScript.
-- Migration personnalisée (drizzle-kit generate --custom), appliquée par
-- `npm run db:migrate` dans l'ordre du journal, après 0000_schema_initial.
--
-- Chaque instruction est separee par le marqueur de rupture d'instruction de Drizzle (voir 0000).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Numérotation légale continue : prochain_numero(p_prefixe, p_annee)
--
-- Renvoie la CHAÎNE formatée, ex. 'CTR-2026-001' : le code de Logiciel-contrat-
-- (app/api/contrat/route.ts) exige une chaîne et rejette tout autre type.
-- L'ancienne version Supabase renvoyait un entier : incompatible.
--
-- Mécanisme : UPSERT atomique sur compteurs_documents. Une seule instruction
-- insère la ligne la première fois, sinon la verrouille, l'incrémente et
-- renvoie la valeur. Deux transactions simultanées se sérialisent sur le
-- verrou de ligne ; si l'une est annulée, son incrément disparaît avec elle et
-- aucun numéro n'est consommé. Jamais de SEQUENCE : elle ne se rembobine pas
-- et produirait des trous, illégaux au regard du CGI (article 289).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prochain_numero(p_prefixe text, p_annee int)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero int;
BEGIN
  INSERT INTO compteurs_documents (serie, annee, dernier_numero)
  VALUES (p_prefixe, p_annee, 1)
  ON CONFLICT (serie, annee)
  DO UPDATE SET dernier_numero = compteurs_documents.dernier_numero + 1
  RETURNING dernier_numero INTO v_numero;

  -- Séquence sur 3 chiffres MINIMUM, jamais tronquée : lpad coupe à droite
  -- au-delà de la longueur demandée (1000 deviendrait '100', un doublon),
  -- d'où greatest().
  RETURN p_prefixe || '-' || p_annee::text || '-'
         || lpad(v_numero::text, greatest(3, length(v_numero::text)), '0');
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION prochain_numero(text, int) IS
  'Numéro suivant d''une série (ex. CTR, FAC) pour une année, sous forme de chaîne PREFIXE-AAAA-NNN. UPSERT atomique sur compteurs_documents : aucun trou, aucun doublon.';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Création d'une facture : creer_facture(...)
--
-- Seul point d'entrée pour créer une ligne `factures`. Le numéro est la chaîne
-- renvoyée par prochain_numero('FAC', année), utilisée TELLE QUELLE : un seul
-- endroit formate les numéros, aucune seconde logique ne peut diverger.
--
-- L'année et la date d'émission sont prises en heure de Paris : le serveur
-- tourne en UTC, et une facture émise le 1er janvier à 0 h 30 (heure française)
-- serait sinon datée du 31 décembre de l'année précédente.
--
-- Tout se passe dans la transaction de l'appelant : si l'INSERT échoue (clé
-- étrangère, CHECK...), l'incrément du compteur est annulé avec lui.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION creer_facture(
  p_reservation_id uuid,
  p_type text,
  p_montant_ttc numeric,
  p_donnees jsonb,
  p_facture_acompte_id uuid DEFAULT NULL
)
RETURNS factures
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_emission date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_facture factures;
BEGIN
  INSERT INTO factures (
    numero, type, reservation_id, facture_acompte_id, montant_ttc, date_emission, donnees
  )
  VALUES (
    prochain_numero('FAC', extract(year FROM v_date_emission)::int),
    p_type,
    p_reservation_id,
    p_facture_acompte_id,
    p_montant_ttc,
    v_date_emission,
    p_donnees
  )
  RETURNING * INTO v_facture;

  RETURN v_facture;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION creer_facture(uuid, text, numeric, jsonb, uuid) IS
  'Crée une facture (acompte ou solde) avec le prochain numéro de la série FAC. Renvoie la ligne factures complète.';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Immutabilité des signatures
--
-- Une preuve de signature modifiable n'a aucune valeur juridique : toute
-- tentative d'UPDATE ou de DELETE est refusée par une exception. Un effacement
-- légitime (droit à l'effacement RGPD, après décision humaine) exige de
-- désactiver explicitement ce trigger le temps de l'opération.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION signatures_interdire_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La table signatures est immuable : % refusé sur la signature %',
    TG_OP, OLD.id
    USING HINT = 'Une preuve de signature électronique ne se modifie ni ne se supprime.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER signatures_immuables
BEFORE UPDATE OR DELETE ON signatures
FOR EACH ROW
EXECUTE FUNCTION signatures_interdire_modification();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at automatique sur reservations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
