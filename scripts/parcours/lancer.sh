#!/bin/bash
# Non-régression complète de la facturation, du contrat et de la signature.
# À rejouer à la fin de chaque phase : si un montant bouge, le script le dit.
#
#   bash scripts/parcours/lancer.sh
#
# Prérequis : base de test migrée et semée, serveur démarré sur PARCOURS_BASE_URL
# (voir README.md). Le script remet la base de TEST à zéro avant de commencer.
set -u

BASE_URL="${PARCOURS_BASE_URL:-http://localhost:3001}"
export PARCOURS_BASE_URL="$BASE_URL"
export STORAGE_PATH="${STORAGE_PATH:-./.data/documents-test}"

if [ ! -f package.json ]; then
  echo "ERREUR : lancez ce script depuis la racine du dépôt." >&2
  exit 2
fi
if ! curl -s -o /dev/null --max-time 5 "$BASE_URL/api/documents/ping"; then
  echo "ERREUR : aucun serveur ne répond sur $BASE_URL." >&2
  echo "Démarrez-le : DB_CIBLE=test STORAGE_PATH=$STORAGE_PATH npx next dev -p 3001" >&2
  exit 2
fi

ETAPES_KO=""
etape() { # <libellé> <commande...>
  local libelle="$1"; shift
  echo ""
  echo "############ $libelle"
  if "$@"; then
    echo "############ $libelle : OK"
  else
    echo "############ $libelle : ÉCHEC"
    ETAPES_KO="$ETAPES_KO\n  - $libelle"
  fi
}

etape "Conversion des montants (aller-retour centimes)" npm run -s verify:centimes
etape "Remise à zéro de la base de test" env DB_CIBLE=test npx tsx scripts/parcours/reinitialiser.ts
etape "Parcours L'Armu (avec options)" bash scripts/parcours/parcours.sh TEST-2026-ARMU-001
etape "Parcours LaPhine (sans option, garde du cas B)" bash scripts/parcours/parcours.sh TEST-2026-LAPHINE-002 --cas-b
etape "Accès aux PDF par URL signée" bash scripts/parcours/urls-signees.sh
etape "Contrôles en base (montants, instantanés, numérotation)" env DB_CIBLE=test npx tsx scripts/parcours/controler.ts
etape "Contrôles sur les PDF produits" python scripts/parcours/controler-pdf.py --png
etape "Auto-vérification de la base" env DB_CIBLE=test npm run -s db:verify

echo ""
if [ -z "$ETAPES_KO" ]; then
  echo "======== Non-régression complète : toutes les étapes passent."
  exit 0
fi
echo "======== ÉCHECS :$(printf "$ETAPES_KO")"
exit 1
