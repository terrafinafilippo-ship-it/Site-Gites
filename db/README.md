# Base de données — Les Gîtes de Samoyas

Ce dossier contient **tout ce qui décrit la base** : le schéma (tables), les
migrations SQL, le seed des gîtes et le script de vérification. La base est un
PostgreSQL 17 hébergé sur le VPS et administré par Coolify. Le schéma vit ici,
dans le dépôt, et **nulle part ailleurs** : on ne modifie jamais une table à la
main dans un outil graphique.

## Vue d'ensemble

| Dossier / fichier | Rôle |
|---|---|
| `schema/` | Le schéma en TypeScript (Drizzle). Un fichier par table. C'est la source de vérité. |
| `migrations/` | Les fichiers SQL générés à partir du schéma, numérotés et appliqués dans l'ordre. `meta/` est le journal de Drizzle : ne pas le modifier à la main. |
| `migrations/0001_fonctions_triggers.sql` | Migration écrite à la main : fonctions de numérotation et triggers, que Drizzle ne sait pas décrire. |
| `migrations/0002_tarification.sql` | Les sept tables de tarification et de taxe de séjour (Phase 3, D-17 et D-18). Générée. |
| `migrations/0003_tarification_contraintes.sql` | Écrite à la main : interdiction du chevauchement de deux périodes, et création de la ligne unique de `reglages`. |
| `migrations/0004_tunnel.sql` | Phase 3, lot 2 : réglages du tunnel dans `reglages`, forme définitive de `disponibilites` (les lignes « libre » sont effacées : une nuit sans ligne est libre), `reservations.detail_calcul`, `taxes_sejour.bebes_parmi_occupants`. Générée, plus un effacement écrit à la main. |
| `migrations/0005_paiement.sql` | Phase 3, lot 3 : réglages du paiement, conditions figées et choix du client sur `reservations` (les réservations existantes reçoivent 30 % et 30 jours, puis la valeur par défaut est retirée), forme définitive de `paiements`, table `textes_accord` immuable avec ses deux premières versions (français, anglais). Générée, plus les triggers, l'insertion des textes et le retrait des valeurs par défaut écrits à la main. |
| `migrations/0006_courriels.sql` | Phase 3, lot 4 : journal `courriels`, table `alertes` (trois alertes vers contact@), adresses d'expédition et de réponse dans `reglages` (reservation@ et contact@, valeurs du gérant, sans valeur par défaut ensuite). |
| `index.ts` | Le client de base de données partagé par le site (pool de 10 connexions maximum). |
| `seed.ts` | Insère ou remet à jour les trois gîtes. |
| `verify.ts` | Auto-vérification complète, sans rien laisser en base. |
| `migrate.ts` | Applique les migrations en attente. |
| `env.ts` | Charge `.env.local` pour les scripts. |

La connexion se fait par la variable `DATABASE_URL` (voir `.env.example` à la
racine). Cette variable contient le mot de passe : elle ne doit **jamais** être
commitée.

## Les tables

**Cœur métier**

- **gites** : les trois gîtes (LaPhine, L'Armu, La Maison Vieille). Nom,
  référence Gîtes de France, adresse, capacité, forfait ménage, caution, tarifs,
  taux de taxe de séjour. Les routes de documents (`app/api/contrats`,
  `app/api/factures`) lisent ces valeurs pour remplir les PDF : la base prime
  sur toute constante du code.
- **reservations** : une ligne par séjour. Coordonnées du client (et de son
  conjoint), dates et heures, nombre d'occupants, montants, informations de
  paiement de l'acompte, statut (`brouillon`, `en_attente_paiement`,
  `confirmee`, `annulee`, `terminee`) et une référence publique courte affichée
  au client (page de suivi).
- **documents** : le registre des PDF émis pour une réservation : contrat,
  facture d'acompte, facture de solde. Contient le chemin du fichier
  (`url_pdf`), le numéro, le statut (`genere` puis `signe`) et, pour les
  contrats, le jeton du lien de signature. **Un seul document par type et par
  réservation** : c'est ce qui empêche un double clic ou un webhook en double
  de créer deux contrats.
- **signatures** : la preuve de signature électronique d'un contrat : qui a
  signé, quand, depuis quelle adresse, avec quel texte de consentement, et
  l'empreinte du PDF signé. **Cette table ne se modifie ni ne se vide** : un
  trigger refuse toute modification ou suppression. Une seule signature par
  document.
- **factures** : les factures d'acompte et de solde, avec leur numéro légal, le
  montant, la date d'émission et une copie des données du PDF. Les lignes sont
  créées uniquement par la fonction `creer_facture` (voir plus bas).
- **compteurs_documents** : le compteur de numérotation, une ligne par série
  (`FAC`, `CTR`) et par année.

**Tarification** (Phase 3, lot 1 — le détail et le pourquoi sont dans
`docs/04-architecture.md` § 3 et `docs/02-decisions.md`, D-17 et D-18)

- **tarifs**, **tarifs_prix** : les tarifs nommés librement et le prix d'une
  nuit de chacun, par gîte.
- **periodes** : les plages de dates de chaque tarif. Deux périodes ne peuvent
  pas se chevaucher (contrainte posée par la migration 0003).
- **baremes**, **baremes_coefficients** : la dégressivité, un coefficient par
  rang de nuit.
- **reglages** : une seule ligne, créée par la migration 0003 — règle générale
  de réservation, barème général, jour de début des périodes ; depuis la
  migration 0004, les réglages du tunnel (durée du blocage, délai avant
  l'arrivée, horaires, bébés) ; depuis la migration 0005, ceux du paiement
  (taux d'acompte, délai du solde, délai du virement de caution).
- **taxes_sejour** : les réglages de taxe de séjour, par gîte et datés.

**Calendrier** (forme définitive en Phase 3, lot 2 — décision D-21)

- **disponibilites** : les **nuits prises**, une ligne par gîte et par nuit :
  `verrou` (blocage pendant le paiement, avec échéance), `reserve`, `bloque`.
  Une nuit sans ligne est libre ; un verrou expiré aussi. L'index unique
  `(gite_id, date)` interdit la double vente. Origine `directe`, `airbnb`,
  `booking`, `gdf` (synchronisation en Phase 7).

Ces tables sont **vides en base réelle** tant que les propriétaires n'ont rien
saisi : les fiches masquent alors leurs prix. Sur la base de test, la remise à
zéro du parcours (`scripts/parcours/reinitialiser.ts`) charge une tarification
d'essai, marquée « (essai) ». **`npm run db:seed` ne touche pas à ces tables.**

**Paiement** (forme définitive en Phase 3, lot 3 — décision D-23)

- **paiements** : chaque paiement chez le prestataire (PaymentIntent Stripe),
  avec son statut et, s'il y a lieu, son remboursement. Une ligne par paiement
  Stripe (index unique `reference_externe`).
- **textes_accord** : le texte d'accord pour l'enregistrement de la carte, une
  version datée par langue, **immuable** (trigger) : des réservations le citent
  comme preuve.

**Courriels** (Phase 3, lot 4 — décision D-24)

- **courriels** : le journal des courriels du site, une ligne par courriel et
  par destinataire, inscrite avec l'événement puis envoyée (ou retentée).
  Clé unique : un événement constaté deux fois n'inscrit qu'un courriel.
- **alertes** : les trois alertes aux propriétaires, chacune active ou non,
  avec ses destinataires. Dans la base de test, la remise à zéro les dirige
  vers `proprietaires@example.invalid`, jamais envoyée.

**Tables provisoires** (structure minimale)

- **avis** : les avis clients affichés sur le site.
- **audit_logs** : le journal des actions sensibles.

## Génération des documents et signature (fusion du module de contrat)

Depuis la Phase 1, le site contient lui-même la génération des contrats et des
factures ainsi que la page de signature ; l'ancien dépôt `Logiciel-contrat-`
n'est plus utilisé.

| Point d'entrée | Rôle |
|---|---|
| `POST /api/contrats` | Émet le contrat d'une réservation : numéro `CTR-AAAA-NNN`, PDF non signé dans `contrats/{reservation_id}/{numero}.pdf`, ligne `documents` avec jeton de signature, recopie du numéro dans `reservations.numero_contrat`, le tout dans une transaction. Idempotent. En-tête `x-service-secret`. |
| `GET /signer/{token}` | Page de signature : affiche le PDF, recueille nom et consentement. |
| `POST /api/contrats/signer` | Enregistre la preuve de signature (`signatures`), écrit le PDF signé `{numero}-signe.pdf`, passe le document en `signe`. Publique : le jeton authentifie le signataire. |
| `POST /api/factures` | Émet la facture d'acompte ou de solde via `creer_facture`, PDF dans `factures/{numero}.pdf`. En-tête `x-service-secret`. |
| `GET /api/documents/{chemin}?token=…&expires=…` | Seul accès aux PDF, par lien signé à durée limitée. |

Code correspondant : `app/api/contrats/`, `app/api/factures/`,
`app/signer/[token]/`, `components/pdf/` (rendu @react-pdf/renderer),
`lib/montants.ts` (calculs), `lib/reservations.ts` (réservation + gîte joint),
`lib/storage.ts` (fichiers). Variables : `DOCUMENT_SERVICE_SECRET`,
`STORAGE_PATH`, `STORAGE_SIGNING_SECRET`, `NEXT_PUBLIC_SITE_URL` (voir
`.env.example`).

### Base de test

Chaque contrat, facture ou signature consomme un numéro légal irrécupérable,
et une signature ne se supprime pas. Les parcours de test se font donc sur la
base `gites_test` (même serveur) : renseigner `DATABASE_URL_TEST` dans
`.env.local` et positionner `DB_CIBLE=test` dans le shell le temps des
commandes (`npm run db:migrate`, `npm run db:seed`, `npm run dev`). Sans
cette variable, tout s'exécute sur la base réelle.

## Appliquer les migrations

Toutes les commandes se lancent **depuis le dossier Site-Gites**.

```bash
npm run db:migrate
```

Le script lit `DATABASE_URL`, compare le journal avec la table
`drizzle.__drizzle_migrations` de la base, et applique les migrations
manquantes dans l'ordre, dans une seule transaction : soit tout passe, soit
rien n'est modifié. Relancer la commande quand tout est déjà appliqué ne fait
rien.

En production, la même commande s'exécute avec la `DATABASE_URL` de Coolify
(par exemple dans le terminal du conteneur du site, ou comme commande de
pré-déploiement).

### Modifier le schéma

1. Modifier ou ajouter un fichier dans `schema/` (et l'exporter dans
   `schema/index.ts` si c'est une nouvelle table).
2. Générer la migration : `npm run db:generate`. Un nouveau fichier SQL apparaît
   dans `migrations/`. **Le relire avant de l'appliquer.**
3. Appliquer : `npm run db:migrate`.
4. Commiter le schéma, la migration et le dossier `meta/` ensemble.

Pour une fonction, un trigger ou toute instruction que Drizzle ne génère pas :
`npx drizzle-kit generate --custom --name=mon_sujet` crée un fichier SQL vide
enregistré dans le journal, à remplir à la main.

Ne jamais modifier une migration déjà appliquée : en écrire une nouvelle.

## Relancer le seed

```bash
npm run db:seed
```

Le seed insère les trois gîtes. Il peut être relancé autant de fois que
nécessaire : il ne crée jamais de doublon (la clé est la référence Gîtes de
France). Si un gîte existe déjà, ses paramètres descriptifs sont **remis aux
valeurs du fichier** `seed.ts` (nom, adresse, capacité, ménage, caution,
tarifs, taux de taxe). Le drapeau `actif` n'est pas touché. Attention donc : une
valeur modifiée en back-office sera écrasée au prochain seed si elle n'est pas
reportée dans `seed.ts`.

## Vérifier

```bash
npm run db:verify
```

Contrôle les tables et colonnes, le seed, les fonctions de numérotation, les
triggers, les index uniques, les contraintes de tarification (chevauchement de
périodes, ligne unique des réglages, valeurs refusées) et le stockage des PDF.
Toutes les écritures de test
se font dans une transaction annulée : **aucun numéro n'est consommé, aucune
ligne ne reste**. Le code de sortie vaut 1 si un contrôle échoue.

## Pourquoi la numérotation ne doit jamais avoir de trou

Une facture est un document fiscal. Le Code général des impôts (article 289)
impose une numérotation **unique, chronologique et continue** : deux factures
ne peuvent pas porter le même numéro, et il ne peut pas manquer de numéro dans
la suite. Un trou (FAC-2026-004 puis FAC-2026-006) est interprété lors d'un
contrôle comme une facture disparue.

C'est pourquoi la base ne se sert **pas** d'une séquence PostgreSQL : une
séquence avance même quand l'opération échoue, et laisse des trous. À la place :

- la table `compteurs_documents` garde le dernier numéro attribué par série et
  par année ;
- la fonction `prochain_numero('FAC', 2026)` incrémente ce compteur en une seule
  instruction qui verrouille la ligne, et renvoie le numéro déjà formaté
  (`FAC-2026-001`). Deux émissions simultanées attendent leur tour, aucune ne
  reçoit le même numéro ;
- la fonction `creer_facture(...)` appelle `prochain_numero` **dans la même
  transaction** que la création de la ligne : si la création échoue, le
  compteur revient en arrière avec elle.

Règles à respecter :

- **ne jamais** insérer une ligne dans `factures` autrement que par
  `creer_facture` ;
- **ne jamais** modifier `compteurs_documents` à la main ;
- **ne jamais** supprimer une facture : une erreur se corrige par un nouveau
  document (avoir), jamais par effacement ;
- le formatage du numéro existe à un seul endroit (`prochain_numero`) : ne pas
  le reconstruire ailleurs.

Les contrats suivent le même mécanisme avec la série `CTR`.

## Restaurer la base depuis une sauvegarde (Coolify / Cloudflare R2)

Les sauvegardes sont faites chaque jour par Coolify et envoyées sur Cloudflare
R2. Elles contiennent la base, **pas les fichiers PDF** : ceux-ci vivent sur le
volume persistant du VPS et doivent être sauvegardés à part.

1. **Arrêter le site** depuis Coolify (il contient la génération des documents
   et la page de signature), pour qu'aucune écriture n'arrive pendant la
   restauration.
2. **Récupérer la sauvegarde.** Dans Coolify, ouvrir la base de données, onglet
   *Backups* : la liste des sauvegardes apparaît avec leur date. Si un bouton de
   restauration est proposé, l'utiliser et passer à l'étape 4. Sinon,
   télécharger le fichier depuis le bucket R2 (via le tableau de bord
   Cloudflare).
3. **Restaurer.** Le fichier est produit par `pg_dump`. Selon son extension :
   - format personnalisé (`.dmp`, `.dump`, éventuellement `.gz` à décompresser
     d'abord) :
     ```bash
     pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" sauvegarde.dmp
     ```
   - format SQL brut (`.sql` ou `.sql.gz`) :
     ```bash
     gunzip -c sauvegarde.sql.gz | psql "$DATABASE_URL"
     ```
   Les commandes se lancent depuis une machine qui a `pg_restore` / `psql` et
   qui atteint la base — **le conteneur PostgreSQL du projet** en dispose.
   Attention : deux conteneurs PostgreSQL tournent sur ce serveur, et
   `coolify-db` n'est **pas** le nôtre. Voir `docs/04-architecture.md` § 1 pour
   les distinguer, et § 9 pour l'accès par tunnel.
4. **Remettre le schéma à niveau** : `npm run db:migrate` applique les
   migrations publiées après la date de la sauvegarde, s'il y en a.
5. **Contrôler** : `npm run db:verify`, puis vérifier à la main que le dernier
   numéro de `compteurs_documents` correspond bien au dernier numéro présent
   dans `factures` et dans `documents` (série `CTR`). Si des factures ont été
   émises entre la sauvegarde et la panne, elles doivent être ressaisies
   **avant** toute nouvelle émission, sinon la numérotation reprendrait sur des
   numéros déjà utilisés.
6. **Redémarrer le site.**

## Sécurité et bonnes pratiques

- `.env.local` est ignoré par git ; `DATABASE_URL` ne se partage qu'en privé.
- Le rôle utilisé par les applications a aujourd'hui tous les droits : une
  séparation des rôles (lecture seule pour le site vitrine, par exemple) pourra
  être décidée en Phase 3.
- Les fichiers PDF sont servis uniquement par des liens signés à durée limitée
  (voir `lib/storage.ts`), jamais directement.
