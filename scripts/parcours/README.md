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
| Prix, taxe et devis | Prix de location d'un séjour, taxe de séjour, devis du tunnel, contrôle des coordonnées, règlement (caution, solde, texte d'accord), anglais, taxe affichée, paiement intégral (imposé ou choisi), annulation (partage de l'article 7, carte puis virement) et virement refusé après sa date limite : 209 cas calculés à la main, dont les deux exemples officiels (`npm run verify:tarification`) |
| Blocage des dates | Deux clients qui bloquent les mêmes nuits au même instant : un seul gagne ; blocage expiré repris ; tentative, seconde tentative refusée avec les autres gîtes, abandon ; puis par le serveur : codes de réponse, deux POST simultanés, limite anti-abus (`scripts/verifier-blocage.ts --http`) |
| Paiement | Stripe simulé : ouverture, refus, paiement confirmé une seule fois, paiement arrivé après le blocage (confirmé ou remboursé), remboursement rattrapé, retour en arrière qui annule le paiement ; puis **Stripe en mode test** par le serveur : carte de test, page de confirmation, page « Ma réservation », carte refusée, avis signé (`scripts/verifier-paiement.ts --http`) |
| Courriels | Envoi simulé : une confirmation et une alerte par paiement, aucune facture (D-41), lien de signature, faits, adresses, anglais, pannes et nouvel essai, échec définitif et alerte, contrat impossible, paiement intégral, remboursements, alerte coupée, adresses de test jamais envoyées (`verify:courriels`) ; puis le serveur crée le vrai contrat et « envoie » la confirmation après un paiement par Stripe en mode test (`verify:paiement --http`), dans des fichiers |
| Ma réservation | Page par lien secret : fermée (jeton inconnu, non payée, expirée), ouverte, remboursée ; validité de 30 jours après le départ ; formulaire et limite de 3 demandes par heure ; courriel du lien (`verify:suivi`) ; puis la vraie page, par le serveur, ouverte par le lien de la confirmation (`verify:paiement --http`) |
| Solde | Temps simulé, Stripe, messagerie et factures simulés : préavis, prélèvement une seule fois, aucune facture automatique (D-41), refus, impayé et seconde alerte, lien, rappel, paiement par le lien, avis de Stripe en avance, prélèvement sans réponse, solde reçu pour une réservation annulée, courriel « facture » refusé à l'émission, anglais (`verify:solde --http`, 61 cas) |
| Factures sur demande | Simulé : saisie de l'entreprise, refus avant le solde, récapitulatif en deux temps, courriel inscrit, journal, retenue sans facture ; puis les **vraies** factures par le serveur : deux paiements listés, entreprise et SIREN, texte des PDF lu, idempotence, refus sans numéro consommé, type « retenue » refusé, numéros sans trou (`verify:factures --http`, 38 cas) |
| Annulation | Simulé : refus, récapitulatif exact, nuits libérées, solde ouvert annulé, carte remboursée une fois, courriel, « Ma réservation », carte puis virement, « Remboursement fait », avoir, refus et panne de Stripe, absence, statistiques, caution ; puis le **vrai** avoir par le serveur (numéro dans la suite FAC, texte du PDF lu, idempotence) et les pages, le lien de signature d'une réservation annulée refusé (`verify:annulation --http`, 47 cas) |
| Caution par carte | Temps simulé : préautorisation la veille à 18 h, alerte la veille de la levée, levée au troisième jour, carte effacée, refus et validation sur le même paiement, montant absent, réponse perdue, retenue, article 6.6 (`verify:caution`, 67 cas) ; puis **Stripe en mode test, trois cartes** (normale, 3184, refusée) et la page par le serveur (`--stripe --http`) |
| Caution par virement | Temps simulé, messagerie simulée : courriel des coordonnées 10 jours avant la date limite (compte, référence, mise en garde contre les faux RIB, RIB demandé), coordonnées sur « Ma réservation », alertes « à vérifier » et « à rendre », séjour terminé au troisième jour (virement et chèque), compte absent ou IBAN faux, passage manqué, anglais, tunnel qui refuse le virement trop tard (`verify:virement`, 47 cas) |
| Tentatives abandonnées | Prestataire simulé : durée vide (rien n'est effacé), effacement après la durée avec la fiche client et une trace sans nom ni courriel, tentatives engagées ou remboursées jamais touchées, fiche client impossible à supprimer, retour en arrière (`verify:abandons`, 22 cas) |
| Avis des clients | Messagerie simulée, temps fixé : invitation le lendemain du départ (une seule, rattrapée jusqu'à la fin du lien), lien ouvert du départ à D + 30, dépôt contrôlé et unique, alerte aux propriétaires, retrait en deux temps avec le motif au client, effacement après 3 ans ; avec le serveur : page de l'avis, `POST /api/avis`, fiche du gîte, politique, back-office (`verify:avis --http`, 59 cas) |
| Back-office | Messagerie simulée : secrets (scrypt, codes), création du compte et lien, mot de passe choisi, connexion et code par courriel, appareil reconnu 30 jours glissants, 8 heures d'inactivité, échecs par adresse IP, appareils retirés, mot de passe oublié, réglages (bornes, IBAN, journal avant/après, alerte « compte de virement modifié »), alertes ; puis par le serveur : `/gestion` fermé sans session et non indexé, pages ouvertes avec une session (`verify:gestion --http`, 107 cas) |
| Back-office, réservations | Prestataire et messagerie simulés : liste et fiche, coordonnées et journal, caution par carte (libérer, retenir, bornes, motif, justificatifs, Stripe en panne, courriel et pièce jointe), chèque et virement (reçue, rendue, retenue, alertes arrêtées), lien de caution, solde par virement (montant exact, paiement en ligne annulé, facture « Virement bancaire »), « À traiter » (chaque ligne apparaît puis disparaît, « C'est fait »), arrivées et départs ; puis les pages par le serveur (`verify:gestion-reservations --http`, 86 cas) |
| Back-office, tarifs | Règles pures (saisies, découpage des périodes, jour de début, passé figé, copie d'une année, trous, état), puis sur la base : prix en deux temps (rien d'écrit avant la confirmation, empreinte périmée), périodes (découpage, période en cours, suppression, copie), barèmes, règles générales, taxe de séjour, « À traiter » (nuits sans tarif, tarif sans prix) ; puis les cinq pages par le serveur (`verify:gestion-tarifs --http`, 93 cas) ; la tarification d'essai est rechargée à la fin |
| Back-office, calendrier | Le seed laisse un gîte existant tel quel ; la fiche d'un gîte en deux temps (bornes, récapitulatif, empreinte périmée, nouvelle caution dans le tunnel) ; bloquer des nuits (passé refusé, nuits prises et par qui, verrou expiré repris, calendrier du mois, débloquer) ; l'option posée au téléphone (nuits fermées aux autres et libres pour son client, courriel et lien, tunnel par le lien, retour en arrière, paiement, échéance, levée, anglais) ; les documents (liste, recherche, année, PDF, renvoi d'une facture, du lien de signature, du contrat signé) ; puis les pages, le PDF, la page du lien et le refus du tunnel par le serveur (`verify:gestion-calendrier --http`, 105 cas) |
| Back-office, statistiques | Nuits louées par mois, séjours hors taxe au mois de l'arrivée, réservations (nombre, durée, délai), provenance (langue, pays, départements), cautions retenues, commissions évitées et leur réglage, registre de la taxe de séjour ; puis la page (`verify:gestion-statistiques --http`, 28 cas) |
| Synchronisation des calendriers | Plateformes simulées : format iCal, lien collé (refusé ou lu), lien du site (ce qu'il montre et cache), « dates prises » à l'écran de paiement, plateforme muette qui ne bloque pas, annulation, paiement en cours remboursé, doublons et leur alerte, lien en panne, accueil, CGV ; puis le lien du site et les CGV par le serveur (`verify:synchronisation --http`, 65 cas) |
| Remise à zéro | Avant les parcours : les contrats et les factures créés par le paiement ne comptent pas dans la numérotation contrôlée |
| Contrat | Émission, numéro `CTR-AAAA-NNN`, PDF, recopie du numéro sur la réservation |
| Signature | Page publique, preuve enregistrée, PDF signé, statut `signe` |
| Factures | Acompte puis solde, numéros `FAC-AAAA-NNN` continus, montants exacts |
| Idempotence | Re-POST des trois documents : mêmes numéros, aucun numéro consommé |
| Refus | Seconde signature (409), appel sans secret (401), jeton inconnu, lien expiré |
| Garde métier | Réservation modifiée après l'acompte → facture de solde refusée (409) |
| Accès aux PDF | URL signée valide (200) ; jeton falsifié, date prolongée, URL expirée, URL nue (403) |
| Base | Montants en centimes, instantané `donnees` (numéro, date, unité), numérotation sans trou |
| PDF | Montants imprimés, addition des lignes jusqu'au sous-total, ligne « Options » présente ou absente selon le séjour, nombre de pages (11 depuis le contrat v3), logo ; contrat v3 : contact@ à la place de wanadoo, Annonay Rhône Agglo (4.4), trois moyens de caution (6.2), somme conservée en cas d'annulation (7.2) |

## Prérequis

1. **Dépendances Python** (lecture des PDF) :
   ```bash
   python -m pip install --user pypdf pymupdf
   ```
2. **Base de test** renseignée dans `.env.local` : `DATABASE_URL_TEST`,
   `DOCUMENT_SERVICE_SECRET`, `STORAGE_SIGNING_SECRET` (voir `.env.example`),
   et les **clés Stripe de test** (`STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) : sans elles,
   le tunnel ne s'ouvre pas et les étapes « blocage » et « paiement » échouent
   en le disant.
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
npm run verify:tarification
DB_CIBLE=test npx tsx scripts/parcours/reinitialiser.ts
DB_CIBLE=test npx tsx scripts/verifier-blocage.ts --http
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
| `DB_CIBLE` | (vide) | **Doit valoir `test`.** `reinitialiser.ts`, `prix-location.ts` et `scripts/verifier-blocage.ts` refusent de s'exécuter sinon. |
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
| `reinitialiser.ts` | Vide la base de test, remet les compteurs à zéro, purge le stockage, recrée les deux réservations, charge la tarification d'essai. |
| `tarifs-fictifs.ts` | La tarification d'essai de la base de test : 5 tarifs « (essai) », 16 périodes d'octobre 2026 à fin 2027, un barème, et la taxe de séjour **réelle** de Savas. Aucun prix réel. |
| `parcours.sh` | Parcours HTTP complet d'une réservation, avec les refus attendus. |
| `urls-signees.sh` | Accès aux PDF : une URL valide, quatre refus. |
| `controler.ts` | Contrôles en base (la ligne en base est le document légal) ; la fiche du gîte recopiée sur la réservation à l'émission du contrat (écart E-9). |
| `controler-pdf.py` | Contrôles sur les PDF produits, et PNG de contrôle visuel. |
| `id-reservation.ts` | Résout une référence en identifiant, pour les scripts shell. |
| `prix-location.ts` | Modifie ou rétablit le prix d'une réservation (garde du cas B). |
| `lancer.sh` | Enchaîne tout (vingt-sept étapes). |
| `../verifier-blocage.ts` | Le blocage des dates et le tunnel, sur la base de test ; `--http` ajoute les contrôles par le serveur. Hors de ce dossier : il se lance aussi seul (`npm run verify:blocage`). |
