# Parcours de non-régression — contrat, signature, factures

Ces scripts rejouent **le parcours complet d'un client** sur la base de test et
vérifient, poste par poste, que les montants imprimés sur les documents sont
exacts. Ce sont eux qui prouvent que la facturation est juste.

> **Chaque phase suivante doit les rejouer avant d'être déclarée terminée.**
> Si un montant bouge, ils le disent ; si une ligne disparaît d'un document, ils
> le disent aussi. Les valeurs attendues sont dans `reference.ts` : elles ne se
> modifient que sur décision métier explicite, jamais pour faire passer un test.

Tout s'exécute sur la base **`gites_test`** (`DB_CIBLE=test`) : un contrat, une
facture ou une signature consomme un numéro légal irrécupérable, et une
signature ne se supprime pas. Ne jamais lancer ces scripts sur la base réelle.

## Ce qui est vérifié

| Étape | Contrôle |
|---|---|
| Conversion | Aller-retour centimes ↔ texte numeric sur les valeurs limites (`npm run verify:centimes`) |
| Contrat | Émission, numéro `CTR-AAAA-NNN`, PDF, recopie du numéro sur la réservation |
| Signature | Page publique, preuve enregistrée, PDF signé, statut `signe` |
| Factures | Acompte puis solde, numéros `FAC-AAAA-NNN` continus, montants exacts |
| Idempotence | Re-POST des trois documents : mêmes numéros, aucun numéro consommé |
| Refus | Seconde signature (409), appel sans secret (401), jeton inconnu, lien expiré |
| Garde métier | Réservation modifiée après l'acompte → facture de solde refusée (409) |
| Accès aux PDF | URL signée valide (200) ; jeton falsifié, date prolongée, URL expirée, URL nue (403) |
| Base | Montants en centimes, instantané `donnees` (numéro, date, unité), numérotation sans trou |
| PDF | Montants imprimés, addition des lignes jusqu'au sous-total, ligne « Options » présente ou absente selon le séjour, nombre de pages, logo |

## Prérequis

1. **Dépendances Python** (lecture des PDF) :
   ```bash
   python -m pip install --user pypdf pymupdf
   ```
2. **Base de test** renseignée dans `.env.local` : `DATABASE_URL_TEST`,
   `DOCUMENT_SERVICE_SECRET`, `STORAGE_SIGNING_SECRET` (voir `.env.example`).
   Les scripts lisent ce fichier ; aucun secret n'est écrit ni affiché.
3. **Schéma et gîtes à jour** sur la base de test, une fois pour toutes :
   ```bash
   DB_CIBLE=test npm run db:migrate
   DB_CIBLE=test npm run db:seed
   ```
4. **Serveur démarré** sur la base de test, dans un autre terminal :
   ```bash
   DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx next dev -p 3001
   ```
   Le port 3001 évite de tomber sur un serveur déjà lancé sur 3000.

## Lancer

```bash
bash scripts/parcours/lancer.sh
```

Le script enchaîne toutes les étapes, **remise à zéro comprise**, et sort en
code 1 si l'une d'elles échoue. Compter environ une minute.

Étapes prises séparément, dans cet ordre (la remise à zéro est indispensable :
les numéros de documents attendus par les contrôles supposent une numérotation
repartant de 001) :

```bash
DB_CIBLE=test npx tsx scripts/parcours/reinitialiser.ts
bash scripts/parcours/parcours.sh TEST-2026-ARMU-001
bash scripts/parcours/parcours.sh TEST-2026-LAPHINE-002 --cas-b
bash scripts/parcours/urls-signees.sh
DB_CIBLE=test npx tsx scripts/parcours/controler.ts
python scripts/parcours/controler-pdf.py --png
DB_CIBLE=test npm run db:verify
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `DB_CIBLE` | (vide) | **Doit valoir `test`.** `reinitialiser.ts` et `prix-location.ts` refusent de s'exécuter sinon. |
| `PARCOURS_BASE_URL` | `http://localhost:3001` | Origine du serveur à interroger. |
| `STORAGE_PATH` | `./.data/documents-test` | Dossier des PDF, purgé par la remise à zéro. Doit être **le même** que celui du serveur. |
| `PARCOURS_SORTIE` | `.parcours` | Dossier des réponses HTTP et des PNG de contrôle. Ignoré par git. |

## Les deux réservations de test

Décrites dans `reference.ts`, avec leurs montants attendus en centimes.

| | L'Armu | LaPhine |
|---|---|---|
| Référence | `TEST-2026-ARMU-001` | `TEST-2026-LAPHINE-002` |
| Client | Mme Camille DURAND et M. Julien DURAND | M. Thomas MARTIN |
| Séjour | 17 → 24 octobre 2026 | 7 → 14 novembre 2026 |
| Location | 457,30 € | 620,00 € |
| Forfait ménage | 80,00 € | 80,00 € |
| Options | 25,50 € | — |
| Sous-total | 562,80 € | 700,00 € |
| Taxe de séjour (5,5 %) | 13,86 € | 15,40 € |
| **Total TTC** | **576,66 €** | **715,40 €** |
| Acompte (30 %) | 173,00 € | 214,62 € |
| Solde | 403,66 € | 500,78 € |
| Caution | 400,00 € | 500,00 € |

La première porte des options : elle prouve qu'elles sont itemisées et que les
lignes s'additionnent. La seconde n'en a pas : elle prouve qu'aucune ligne
« Options : 0,00 € » n'apparaît, et sert à éprouver la garde du cas B.

## Le contrôle visuel reste nécessaire

`controler-pdf.py --png` écrit la première page de chaque document dans
`.parcours/png/`. **Les ouvrir au moins une fois** après toute modification du
rendu : un PDF peut passer tous les contrôles automatiques et être visuellement
cassé (logo absent parce que le format n'est pas accepté, bloc qui déborde en
page 2, chevauchement). Les contrôles automatiques vérifient le contenu, pas la
mise en page.

## Fichiers

| Fichier | Rôle |
|---|---|
| `reference.ts` | Les deux réservations et **les montants attendus**. Point de vérité. |
| `reinitialiser.ts` | Vide la base de test, remet les compteurs à zéro, purge le stockage, recrée les deux réservations. |
| `parcours.sh` | Parcours HTTP complet d'une réservation, avec les refus attendus. |
| `urls-signees.sh` | Accès aux PDF : une URL valide, quatre refus. |
| `controler.ts` | Contrôles en base (la ligne en base est le document légal). |
| `controler-pdf.py` | Contrôles sur les PDF produits, et PNG de contrôle visuel. |
| `id-reservation.ts` | Résout une référence en identifiant, pour les scripts shell. |
| `prix-location.ts` | Modifie ou rétablit le prix d'une réservation (garde du cas B). |
| `lancer.sh` | Enchaîne tout. |
