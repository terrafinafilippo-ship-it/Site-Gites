#!/bin/bash
# Parcours complet d'une réservation de test : contrat, page de signature,
# signature, facture d'acompte, facture de solde, idempotence, refus attendus.
#
#   bash scripts/parcours/parcours.sh TEST-2026-ARMU-001
#   bash scripts/parcours/parcours.sh TEST-2026-LAPHINE-002 --cas-b
#
# --cas-b : entre l'acompte et le solde, modifie le prix de la réservation et
#           vérifie que la facture de solde est REFUSÉE (409) sans consommer de
#           numéro, puis rétablit le prix de référence.
#
# Le serveur doit tourner (voir README.md). Le secret service-à-service est lu
# dans .env.local et n'est jamais affiché.
set -u

REFERENCE="${1:-}"
CAS_B="${2:-}"
if [ -z "$REFERENCE" ]; then
  echo "Usage : parcours.sh <reference> [--cas-b]" >&2
  exit 2
fi

BASE_URL="${PARCOURS_BASE_URL:-http://localhost:3001}"
SORTIE="${PARCOURS_SORTIE:-.parcours}/$REFERENCE"
mkdir -p "$SORTIE"

if [ ! -f .env.local ]; then
  echo "ERREUR : .env.local introuvable. Lancez ce script depuis la racine du dépôt." >&2
  exit 2
fi
SECRET=$(grep '^DOCUMENT_SERVICE_SECRET=' .env.local | cut -d= -f2- | tr -d '\r')
if [ -z "$SECRET" ]; then
  echo "ERREUR : DOCUMENT_SERVICE_SECRET absent de .env.local." >&2
  exit 2
fi

RESA=$(DB_CIBLE=test npx tsx scripts/parcours/id-reservation.ts "$REFERENCE") || exit 1

ECHECS=0
CODE=""

# appel <nom> <methode> <url> [corps json] — réponse dans $SORTIE/<nom>.json, code dans $CODE
appel() {
  local nom="$1" methode="$2" url="$3" corps="${4:-}"
  CODE=$(curl -s -o "$SORTIE/$nom.json" -w '%{http_code}' -X "$methode" "$url" \
    -H "content-type: application/json" -H "x-service-secret: $SECRET" \
    ${corps:+-d "$corps"})
  echo "  réponse : $(head -c 300 "$SORTIE/$nom.json" | tr -d '\n')"
}

# attendre <code attendu> <libellé> — compare au $CODE du dernier appel
attendre() {
  if [ "$1" = "$CODE" ]; then
    echo "  [OK] $2 (HTTP $CODE)"
  else
    echo "  [KO] $2 : HTTP $CODE, attendu $1"
    ECHECS=$((ECHECS + 1))
  fi
}

# verifier <condition vraie/fausse en code retour> <libellé>
verifier() {
  if [ "$1" = "0" ]; then
    echo "  [OK] $2"
  else
    echo "  [KO] $2"
    ECHECS=$((ECHECS + 1))
  fi
}

numero_de() {
  python -c "import json,sys; print(json.load(open(sys.argv[1])).get('numero',''))" "$SORTIE/$1.json"
}

echo "===== Parcours $REFERENCE ($RESA) sur $BASE_URL"

echo "-- c. POST /api/contrats (émission du contrat)"
appel c_contrat POST "$BASE_URL/api/contrats" "{\"reservation_id\":\"$RESA\"}"
attendre 200 "contrat émis"
TOKEN=$(python -c "import json,sys; print(json.load(open(sys.argv[1]))['signing_url'].rsplit('/',1)[-1])" "$SORTIE/c_contrat.json")

echo "-- d. GET /signer/{token} (page de signature)"
CODE=$(curl -s -o "$SORTIE/d_signer.html" -w '%{http_code}' "$BASE_URL/signer/$TOKEN")
attendre 200 "page de signature affichée"
echo "  récapitulatif : $(grep -o 'Montant total du séjour[^€]*€\|Dont options[^€]*€' "$SORTIE/d_signer.html" | sed 's/<[^>]*>//g' | tr '\n' ' ')"

echo "-- e. POST /api/contrats/signer (signature électronique simple)"
CODE=$(curl -s -o "$SORTIE/e_signer.json" -w '%{http_code}' -X POST "$BASE_URL/api/contrats/signer" \
  -H "content-type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"signataire_nom\":\"Signataire Test\",\"accepte\":true}")
echo "  réponse : $(head -c 200 "$SORTIE/e_signer.json" | tr -d '\n')"
attendre 200 "signature enregistrée"

echo "-- f. POST /api/factures (acompte)"
appel f_acompte POST "$BASE_URL/api/factures" "{\"reservationId\":\"$RESA\",\"type\":\"acompte\"}"
attendre 200 "facture d'acompte émise"

if [ "$CAS_B" = "--cas-b" ]; then
  echo "-- f bis. cas B : réservation modifiée APRÈS l'émission de la facture d'acompte"
  DB_CIBLE=test npx tsx scripts/parcours/prix-location.ts "$REFERENCE" 70000 || exit 1
  appel casB_solde POST "$BASE_URL/api/factures" "{\"reservationId\":\"$RESA\",\"type\":\"solde\"}"
  attendre 409 "facture de solde REFUSÉE (situation métier, pas un bug)"
  echo "  rétablissement du prix de référence :"
  DB_CIBLE=test npx tsx scripts/parcours/prix-location.ts "$REFERENCE" --reference || exit 1
fi

echo "-- g. POST /api/factures (solde)"
appel g_solde POST "$BASE_URL/api/factures" "{\"reservationId\":\"$RESA\",\"type\":\"solde\"}"
attendre 200 "facture de solde émise"

echo "-- h. idempotence : re-POST du contrat et des deux factures"
NUM_CONTRAT=$(numero_de c_contrat)
NUM_ACOMPTE=$(numero_de f_acompte)
NUM_SOLDE=$(numero_de g_solde)
appel h_contrat POST "$BASE_URL/api/contrats" "{\"reservation_id\":\"$RESA\"}" > /dev/null
appel h_acompte POST "$BASE_URL/api/factures" "{\"reservationId\":\"$RESA\",\"type\":\"acompte\"}" > /dev/null
appel h_solde POST "$BASE_URL/api/factures" "{\"reservationId\":\"$RESA\",\"type\":\"solde\"}" > /dev/null
for paire in "h_contrat:$NUM_CONTRAT" "h_acompte:$NUM_ACOMPTE" "h_solde:$NUM_SOLDE"; do
  fichier="${paire%%:*}"
  attendu="${paire##*:}"
  obtenu=$(numero_de "$fichier")
  [ "$obtenu" = "$attendu" ]
  verifier $? "$fichier : même numéro $attendu (aucun numéro consommé)"
done

echo "-- i. refus attendus"
CODE=$(curl -s -o "$SORTIE/i_signer_409.json" -w '%{http_code}' -X POST "$BASE_URL/api/contrats/signer" \
  -H "content-type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"signataire_nom\":\"Signataire Test\",\"accepte\":true}")
attendre 409 "seconde signature du même contrat refusée"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/factures" \
  -H "content-type: application/json" -d "{\"reservationId\":\"$RESA\",\"type\":\"acompte\"}")
attendre 401 "appel sans en-tête x-service-secret refusé"
curl -s "$BASE_URL/signer/$TOKEN" | grep -q "Contrat déjà signé"
verifier $? "page /signer d'un contrat déjà signé : message « Contrat déjà signé »"
curl -s "$BASE_URL/signer/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" | grep -q "Lien invalide"
verifier $? "page /signer d'un jeton inconnu : message « Lien invalide »"

echo "$TOKEN" > "$SORTIE/token.txt"
echo "===== Parcours $REFERENCE : $ECHECS échec(s) — sorties dans $SORTIE"
[ "$ECHECS" -eq 0 ]
