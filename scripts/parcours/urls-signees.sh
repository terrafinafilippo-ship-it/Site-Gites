#!/bin/bash
# Contrôle de l'accès aux PDF : les fichiers ne sont servis QUE par une URL
# signée à durée limitée (/api/documents/...?token=…&expires=…).
#
#   bash scripts/parcours/urls-signees.sh [reference]
#
# Quatre refus doivent être obtenus : jeton falsifié, paramètre d'expiration
# modifié, URL expirée dont la signature est pourtant correcte, URL sans
# paramètres. Un seul accès doit réussir : l'URL signée fraîche.
#
# Le MESSAGE de refus est vérifié en plus du code HTTP : une URL expirée doit
# être rejetée pour sa DATE (« Lien expiré ») et non pour sa signature, sinon le
# contrôle passerait sans rien prouver de la péremption.
#
# La clé HMAC est lue dans .env.local (STORAGE_SIGNING_SECRET) et n'est jamais
# affichée ; elle sert à forger l'URL expirée mais correctement signée.
#
# MSYS_NO_PATHCONV=1 : sous Git Bash, un argument commençant par « / » est
# converti en chemin Windows (C:/Program Files/...). Sans cette variable, le
# chemin passé au calcul HMAC serait faux et l'URL « expirée » serait en fait
# mal signée.
set -u

BASE_URL="${PARCOURS_BASE_URL:-http://localhost:3001}"
SORTIE="${PARCOURS_SORTIE:-.parcours}/urls-signees"
REFERENCE="${1:-TEST-2026-ARMU-001}"
mkdir -p "$SORTIE"

SOURCE="${PARCOURS_SORTIE:-.parcours}/$REFERENCE/f_acompte.json"
if [ ! -f "$SOURCE" ]; then
  echo "ERREUR : $SOURCE introuvable. Lancez d'abord parcours.sh $REFERENCE." >&2
  exit 2
fi
SECRET=$(grep '^STORAGE_SIGNING_SECRET=' .env.local | cut -d= -f2- | tr -d '\r')
if [ -z "$SECRET" ]; then
  echo "ERREUR : STORAGE_SIGNING_SECRET absent de .env.local." >&2
  exit 2
fi

URL=$(python -c "import json,sys; print(json.load(open(sys.argv[1]))['url'])" "$SOURCE")
CHEMIN_URL="${URL%%\?*}"                 # /api/documents/factures/FAC-....pdf
CHEMIN="${CHEMIN_URL#/api/documents/}"   # factures/FAC-....pdf (chemin de stockage)
TOKEN=$(echo "$URL" | sed -E 's/.*token=([^&]*).*/\1/')
EXPIRES=$(echo "$URL" | sed -E 's/.*expires=([0-9]+).*/\1/')

ECHECS=0
# controler <code attendu> <motif attendu dans le corps, ou -> <libellé> <url>
controler() {
  local attendu="$1" motif="$2" libelle="$3" url="$4" code corps
  code=$(curl -s -o "$SORTIE/reponse.txt" -w '%{http_code}' "$url")
  corps=$(head -c 200 "$SORTIE/reponse.txt" | tr -d '\n')
  if [ "$code" != "$attendu" ]; then
    echo "  [KO] $libelle : HTTP $code, attendu $attendu"
    ECHECS=$((ECHECS + 1))
  elif [ "$motif" != "-" ] && ! grep -q "$motif" "$SORTIE/reponse.txt"; then
    echo "  [KO] $libelle : HTTP $code mais message inattendu — $corps"
    ECHECS=$((ECHECS + 1))
  elif [ "$motif" = "-" ]; then
    echo "  [OK] $libelle (HTTP $code)"
  else
    echo "  [OK] $libelle (HTTP $code, « $motif »)"
  fi
}

echo "===== URL signées — $CHEMIN"
controler 200 - "URL signée fraîche : le PDF est servi" "$BASE_URL$URL"
controler 403 "Lien invalide" "jeton falsifié (4 premiers caractères remplacés)" \
  "$BASE_URL$CHEMIN_URL?token=AAAA${TOKEN:4}&expires=$EXPIRES"
controler 403 "Lien invalide" "paramètre expires prolongé d'une heure" \
  "$BASE_URL$CHEMIN_URL?token=$TOKEN&expires=$((EXPIRES + 3600))"

# Signature CORRECTE sur une date passée : seule la date doit la rejeter, d'où
# le message « Lien expiré » et non « Lien invalide ».
EXPIRE_PASSE=$(( $(date +%s) - 60 ))
TOKEN_PASSE=$(MSYS_NO_PATHCONV=1 python -c "
import base64, hashlib, hmac, sys
cle, chemin, expires = sys.argv[1], sys.argv[2], sys.argv[3]
message = f'{chemin}\n{expires}'.encode()
print(base64.urlsafe_b64encode(hmac.new(cle.encode(), message, hashlib.sha256).digest()).decode().rstrip('='))
" "$SECRET" "$CHEMIN" "$EXPIRE_PASSE")
controler 403 "Lien expiré" "URL expirée dont la signature est correcte" \
  "$BASE_URL$CHEMIN_URL?token=$TOKEN_PASSE&expires=$EXPIRE_PASSE"
controler 403 - "URL sans token ni expires" "$BASE_URL$CHEMIN_URL"

echo "===== URL signées : $ECHECS échec(s)"
[ "$ECHECS" -eq 0 ]
