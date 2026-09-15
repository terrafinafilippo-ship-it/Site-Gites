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

**Tables provisoires** (structure minimale, affinée en Phase 3)

- **paiements** : chaque mouvement d'argent (acompte, solde, caution) avec sa
  référence chez le prestataire.
- **disponibilites** : le calendrier, une ligne par gîte et par nuit, avec son
  état (`libre`, `reserve`, `bloque`, `verrou`) et son origine (`directe`,
  `airbnb`, `booking`, `gdf`).
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
triggers, les index uniques et le stockage des PDF. Toutes les écritures de test
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
   Les commandes se lancent depuis une machine qui a `pg_restore` / `psql`
   (le conteneur PostgreSQL de Coolify en dispose) et qui atteint la base.
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
