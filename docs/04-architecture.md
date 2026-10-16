# Architecture — la réalité technique

> Ce fichier est mis à jour **quand le code change**, à la clôture de la phase
> qui l'a changé. Il décrit ce qui **existe**, pas ce qui est prévu : le prévu
> vit dans `docs/phases/`.

---

## 1. Infrastructure

| Élément | Réalité |
|---|---|
| Serveur | VPS **OVH**, loué et administré par nous |
| Orchestration | **Coolify** — interface web qui installe, déploie et surveille les conteneurs (site, base, sauvegardes) |
| Base de données | **PostgreSQL 17**, dans un conteneur Coolify |
| Reverse proxy | **Traefik**, fourni par Coolify — c'est lui qui reçoit les requêtes HTTPS et les transmet au site |
| Stockage des PDF | **Volume disque persistant** monté par Coolify (`STORAGE_PATH`, défaut `/data/documents`) |
| Sauvegardes | Base : export quotidien par Coolify vers **Cloudflare R2**. PDF : **aucune** — le volume n'existe pas avant le déploiement ; sauvegarde vers R2 à configurer à sa création (voir `docs/03-conformite.md` § 6 et `docs/06-avant-premier-client.md`, point 9) |

**Le piège permanent.** Un conteneur Docker est **recréé à chaque
déploiement** : tout fichier écrit ailleurs que sur le volume monté disparaît.
C'est pourquoi `lib/storage.ts` porte un avertissement en tête et pourquoi
`STORAGE_PATH` doit viser le volume, jamais un dossier quelconque.

**DEUX CONTENEURS POSTGRESQL TOURNENT SUR CE SERVEUR. UN SEUL EST LE NÔTRE.**

| Conteneur | Image | Ce que c'est |
|---|---|---|
| `5sn5xve5enj5lcze6buvwuc4` | `postgres:17-alpine` | **La base du projet.** C'est celle-ci, et elle seule, qu'on migre, qu'on seed et qu'on interroge. |
| `coolify-db` | `postgres:15-alpine` | **La base interne de Coolify** : configuration du serveur, secrets de déploiement. **Ne jamais y toucher.** Elle n'a aucun rapport avec le projet. |

Une session qui cherche « le conteneur PostgreSQL » en trouvera donc deux. Se
tromper de cible, c'est écrire dans la configuration de l'hébergeur — pas dans
les données des gîtes.

**Accès administrateur.** L'utilisateur SSH **n'appartient pas au groupe
`docker`**, et c'est délibéré : en faire partie équivaut à un accès root
permanent. Toute commande `docker` passe donc par `sudo`. Ne pas proposer de
changer ce réglage.

**Réseau.** Le port PostgreSQL public est **refermé** (voir
`docs/02-decisions.md`, D-10). `DATABASE_URL` vise l'hôte **interne** du réseau
Coolify. `?sslmode=require` est inutilisable : le serveur tourne avec
`ssl = off`. Un accès depuis un poste de développement passe par un **tunnel
SSH** — la procédure complète est au § 9.

**Variables d'environnement** — les noms, jamais les valeurs. Le fichier de
référence est `.env.example`.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion à la base réelle. Secret. |
| `DATABASE_URL_TEST` | Connexion à `gites_test`. Secret. |
| `DB_CIBLE` | `test` bascule sur la base de test. Vide = base réelle. |
| `STORAGE_PATH` | Racine des PDF sur le volume. |
| `STORAGE_SIGNING_SECRET` | Clé HMAC des URL de documents. Secret, 32 octets. |
| `DOCUMENT_SERVICE_SECRET` | Secret service-à-service des routes d'émission. Secret. |
| `NEXT_PUBLIC_SITE_URL` | URL publique. **Visible du navigateur** : rien de confidentiel. |

Aucun secret ne porte le préfixe `NEXT_PUBLIC_` — ce préfixe expose la valeur au
navigateur.

---

## 2. Organisation du dépôt

```
app/            Pages et routes (Next.js App Router)
  api/          Routes serveur : contrats, contrats/signer, factures, documents, reservations
  gites/        Liste et fiche d'un gîte
  reserver/     Tunnel de réservation : calendrier, devis, coordonnées, blocage (paiement au lot 3)
  signer/       Page publique de signature d'un contrat
  suivi/        Page de suivi côté client (contenu de démonstration à ce jour)
  legal/        Mentions, CGV, confidentialité, cookies
components/
  pdf/          Les trois documents PDF (contrat, facture d'acompte, de solde)
  layout/       En-tête, pied de page, bandeau cookies
  ui/           Composants réutilisables
lib/
  centimes.ts   Les DEUX fonctions de frontière du modèle monétaire
  montants.ts   Le SEUL calcul des montants d'une réservation faite (acompte, solde, documents)
  tarification.ts  Le SEUL calcul du prix de location d'un séjour (pur, D-17)
  taxe-sejour.ts   Le SEUL calcul de la taxe de séjour (pur, D-18)
  devis.ts      Le devis d'un séjour : assemble prix, taxe et acompte (pur, navigateur ET serveur)
  coordonnees.ts   Contrôle des coordonnées du client (pur, navigateur ET serveur)
  tarifs.ts     Lecture en base de la tarification et des réglages de taxe
  disponibilites.ts  Nuits prises ; poser et lever le blocage des dates (D-21)
  tunnel.ts     Le tunnel côté serveur : charger ou refuser, enregistrer, abandonner
  decimaux.ts   Taux et coefficients lus exactement ; division arrondie
  dates-civiles.ts Arithmétique des dates « aaaa-mm-jj », en UTC
  format.ts     Le SEUL formatage calcul -> affichage (fmtEuro, fmtPrix, fmtTaux…)
  constantes.ts Identité légale et valeurs par défaut
  storage.ts    Stockage des PDF et signature des URL
  reservations.ts  Chargement réservation + gîte joint, avec conversion en centimes
  gites-publics.ts Chiffres des gîtes pour les pages publiques (cache, dégradation)
  auth.ts       Vérification du secret service-à-service
  data/         Contenu éditorial du site, en code (gîtes, récits, légal) — plus aucun prix
db/
  schema/       Le schéma Drizzle : un fichier par table. SOURCE DE VÉRITÉ.
  migrations/   Les SQL générés, numérotés. meta/ est le journal de Drizzle.
  seed.ts       Les trois gîtes. Idempotent.
  verify.ts     Auto-vérification complète, tout annulé par ROLLBACK.
scripts/        Contrôles : verifier-centimes, verifier-tarification, verifier-blocage
scripts/parcours/  Non-régression bout en bout (voir § 8)
docs/           Le référentiel (ce dossier)
public/         Servi tel quel par Next.js — dont public/logo.png
```

**Legs supprimés en Phase 2** (commit `e341c01`) : les fichiers `.html` de la
racine, le dossier `assets/` (dupliqué dans `public/assets/`, et dont
`tokens.css` + `site.css` avaient déjà été fusionnés dans `app/globals.css`), et
le dossier `admin/`. Les maquettes du back-office se récupèrent dans ce commit :
`git show e341c01^:admin/tarifs.html`.

---

## 3. Modèle de données — les dix-sept tables

**Cœur métier — sept tables exercées par le code**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `gites` | Les trois gîtes : nom, référence Gîtes de France, slug, adresse, capacité, forfait ménage, caution, tarifs, taux de taxe. **La base prime sur toute constante du code.** | `ref_gdf` et `slug` uniques |
| `reservations` | Une ligne par séjour, quel que soit son statut (`brouillon`, `en_attente_paiement`, `confirmee`, `annulee`, `terminee`). Client, conjoint, dates, occupants, montants, paiement de l'acompte. Depuis le lot 2, le tunnel l'écrit « en attente de paiement » à l'arrivée sur l'écran de paiement, avec `detail_calcul` : le devis figé (prix nuit par nuit, étapes de la taxe). | `reference` unique · `updated_at` tenu par trigger |
| `disponibilites` | Le calendrier des **nuits prises**, une ligne par gîte et par nuit : `verrou` (blocage pendant le paiement, avec échéance), `reserve`, `bloque`. **Une nuit sans ligne est libre** ; un verrou expiré vaut libre (D-21). Origine `directe`, `airbnb`, `booking`, `gdf` (Phase 7). | **Index unique `(gite_id, date)`** : la garantie contre la double vente · un verrou a une échéance et une réservation · une nuit vendue en direct désigne sa réservation |
| `documents` | Le registre des PDF émis : contrat, facture d'acompte, facture de solde. Chemin (`url_pdf`), numéro, statut (`genere` puis `signe`), jeton de signature pour les contrats. | **Index unique `(reservation_id, type)`** : un double clic ou un webhook en double ne peut pas créer deux contrats · `token` unique quand non nul |
| `signatures` | La preuve de signature : qui, quand, depuis quelle adresse, avec quel texte de consentement, et l'empreinte SHA-256 du PDF signé. | **Trigger d'immutabilité** (UPDATE et DELETE refusés) · une seule signature par document |
| `factures` | Les factures d'acompte et de solde : numéro légal, montant, date d'émission, instantané des données du PDF. | `numero` unique · créées **exclusivement** par `creer_facture` |
| `compteurs_documents` | Le compteur de numérotation, une ligne par série et par année. | Clé primaire `(serie, annee)` · **jamais une SEQUENCE** |

**Tables provisoires — structure minimale, aucun code ne les exerce encore**

| Table | Rôle prévu | Affinée en |
|---|---|---|
| `paiements` | Chaque mouvement d'argent (acompte, solde, caution) et sa référence chez le prestataire. `montant` est déjà en mode texte, sans appelant. | Phase 3 |
| `avis` | Les avis clients affichés sur le site. | Phase 6 |
| `audit_logs` | Le journal des actions sensibles. Aucun trigger ne l'alimente. | Phase 3 |

**Tarification — sept tables (Phase 3, lot 1 ; décisions D-17 et D-18)**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `tarifs` | Un tarif nommé librement (« Basse saison »), avec ses règles et son barème propres, ou NULL pour « comme le réglage général ». | `nom` unique · jours ISO 1 à 7, liste non vide |
| `tarifs_prix` | Le prix d'**une nuit** d'un tarif, pour un gîte. Pas de ligne = pas de prix : le calcul refuse. | Clé `(tarif_id, gite_id)` · prix > 0 |
| `periodes` | Les plages de dates d'un tarif : première nuit incluse, jour de fin **exclu**. Règles et barème propres possibles. | **Contrainte d'exclusion `periodes_sans_chevauchement`** (migration 0003) : une nuit relève d'au plus un tarif · fin > début · un tarif utilisé ne se supprime pas |
| `baremes` | Les barèmes de dégressivité. | `nom` unique |
| `baremes_coefficients` | Une case de barème par **rang** de nuit (1 = première). Une ligne par rang plutôt qu'un tableau : le pilote pg lit un tableau de numeric en flottants. | Clé `(bareme_id, rang)` · rang ≥ 1 · coefficient > 0 · rangs consécutifs contrôlés à la lecture |
| `reglages` | **Une seule ligne** (id = 1), créée par la migration 0003 : règle générale (nuits minimum, jours d'arrivée et de départ), barème général, jour de début attendu des périodes ; depuis la migration 0004, les réglages du tunnel : durée du blocage (20 min), délai minimum avant l'arrivée (1 jour), horaires (18 h, 9 h, 20 h), bébés (âge 2 ans, 1 hors capacité, 1 lit). Les lots suivants y ajoutent leurs réglages. | `id = 1` imposé · son absence est une panne, jamais comblée par des valeurs par défaut · bornes sur chaque réglage |
| `taxes_sejour` | Les réglages de taxe de séjour, **par gîte et datés** : mode, taux, plafond, tarif fixe, taxe additionnelle, ménage dans l'assiette, bébés parmi les occupants, source. | Clé `(gite_id, date_debut)` · paramètres requis selon le mode |

En base réelle, ces tables sont **vides** jusqu'à la saisie par les
propriétaires (point 11 de `docs/06-avant-premier-client.md`) ; la ligne
`reglages` existe dès la migration. Les colonnes `gites.tarif_semaine_base`,
`gites.tarif_weekend` et `gites.taux_taxe_sejour` ne sont plus lues par aucune
page (D-15 remplacée par D-17) ; elles seront retirées par une migration.

**Conventions de typage, décidées en Phase 0 et à respecter :**

- dates civiles (arrivée, départ, émission) en `date` — **jamais** un instant ;
- heures en `time` (le code ne lit que `HH:MM`) ;
- instants (paiement, création) en `timestamptz` ;
- `ip_signataire` en `inet` **nullable** : `NULL` si inconnue, jamais une chaîne
  de repli comme `'inconnue'` ;
- `documents.url_pdf` est un **chemin relatif**, jamais une URL.

**Le schéma est la source de vérité.** On ne modifie jamais une table à la main
dans un outil graphique. Procédure : modifier `db/schema/`, générer
(`npm run db:generate`), **relire le SQL**, appliquer (`npm run db:migrate`),
commiter schéma + migration + `meta/` ensemble.

---

## 4. Le modèle monétaire et ses deux frontières

C'est la partie la plus facile à casser par inadvertance. La règle complète et
son pourquoi sont dans `docs/02-decisions.md`, D-06.

```
        BASE                    FRONTIÈRE                  MÉMOIRE
  numeric(10,2)   ──centimesDepuisNumeric──►   entier de centimes
    "576.66"      ◄──numericDepuisCentimes──         57666
```

**Les deux seules fonctions autorisées** vivent dans `lib/centimes.ts`. Elles
travaillent **par découpage de chaîne** et ne multiplient ni ne divisent jamais
par 100. Elles **lèvent une erreur** sur une forme inattendue plutôt que de
tronquer en silence.

**Où les frontières sont franchies, et nulle part ailleurs :**

| Sens | Fichier | Occasion |
|---|---|---|
| base → mémoire | `lib/reservations.ts` | Lecture d'une réservation et de son gîte |
| base → mémoire | `lib/gites-publics.ts` | Forfait ménage et caution des fiches |
| base → mémoire | `lib/tarifs.ts` | Prix d'une nuit, plafond et tarif fixe de taxe ; taux et coefficients par `entierDepuisDecimal` (`lib/decimaux.ts`) |
| base → mémoire | `app/api/factures/route.ts` | Relecture du montant de la facture d'acompte |
| base → mémoire | `db/verify.ts` | Contrôle de `creer_facture` |
| mémoire → base | `app/api/factures/route.ts` | `p_montant_ttc` passé à `creer_facture` |
| mémoire → base | `db/seed.ts` | Montants des gîtes |
| mémoire → affichage | `lib/format.ts` (`fmtEuro`) | Tous les documents et pages |

Les colonnes de montants sont déclarées en `mode: "string"` dans le schéma : le
type SQL ne change pas, seule la façon dont le pilote les remet au code change.
C'est pour cela que le passage en centimes **n'a demandé aucune migration**.

**Un taux n'est pas un montant.** `taux_taxe_sejour` et `TAUX_ACOMPTE` restent
des nombres décimaux. Le seul arrondi du modèle est
`Math.round(totalTtc * (TAUX_ACOMPTE / 100))` dans `lib/montants.ts` : le
`/ 100` y porte sur le **taux**, jamais sur un montant.

**Un calcul, un seul fichier.** `lib/montants.ts` calcule les montants d'une
réservation **faite** (sous-total, total, acompte, solde) et ne construit
**aucun** numéro de document. Le devis du tunnel (`lib/devis.ts`) appelle sa
fonction `montantsDesPostes` : le client voit avant de payer l'acompte exact de
sa facture. Depuis la Phase 3, deux calculs s'y ajoutent,
chacun dans son propre fichier et nulle part ailleurs : le prix de location
d'un séjour à réserver (`lib/tarification.ts`) et sa taxe de séjour
(`lib/taxe-sejour.ts`). Les deux sont **purs** et calculent en entiers exacts :
le prix en fractions BigInt arrondies une seule fois, la taxe arrondie à chaque
étape comme l'exige le guide officiel. Leurs coefficients et taux sont des
entiers à échelle fixe (dix-millièmes, centièmes de pour cent), lus par
découpage de chaîne.

**Le même calcul dans le navigateur et sur le serveur.** Le tunnel reçoit les
données lues en base au chargement de la page et chiffre le séjour **dans le
navigateur** (`lib/devis.ts`), pour un affichage immédiat. À l'écran de
paiement, le serveur recalcule tout avec les données lues à cet instant :
c'est le seul calcul qui engage, et il ne lit jamais un montant envoyé par le
navigateur. Ces modules purs n'importent donc rien du serveur.

---

## 5. Conventions de chemin des PDF

Construites par les routes, lues par tout le reste. **Ne pas les changer** : des
lignes `documents.url_pdf` et `factures.pdf_url` déjà écrites les portent.

```
contrats/{reservation_id}/{numero}.pdf         contrat non signé
contrats/{reservation_id}/{numero}-signe.pdf   contrat signé
factures/{numero}.pdf                          facture (acompte ou solde)
```

**Écriture atomique** (`lib/storage.ts`) : le contenu part dans un fichier
temporaire du même dossier, est synchronisé sur disque, puis publié en une
opération instantanée — lien dur exclusif (refuse d'écraser) ou renommage
(écrasement autorisé). Un plantage en cours d'écriture ne peut donc jamais
laisser un PDF à moitié écrit qui serait ensuite servi à un client.

**Validation des chemins.** `validerChemin` refuse `..`, l'antislash, le
caractère nul, les segments vides et tout segment hors du motif autorisé, puis
`DiskStorage.resoudre` vérifie en plus que le chemin absolu reste sous la racine.
Deux protections successives contre la **traversée de répertoire**, qui
permettrait de lire n'importe quel fichier du serveur.

---

## 6. Les routes et leur authentification

| Route | Auth | Effet |
|---|---|---|
| `POST /api/contrats` | En-tête `x-service-secret` = `DOCUMENT_SERVICE_SECRET` | Émet le contrat : numéro `CTR`, ligne `documents` avec jeton, PDF, recopie du numéro sur la réservation. **Une transaction.** Idempotent. |
| `POST /api/contrats/signer` | **Aucun secret** — le jeton du lien authentifie le signataire | Enregistre la preuve, écrit le PDF signé, passe le document en `signe`. **Une transaction.** |
| `POST /api/factures` | `x-service-secret` | Émet la facture d'acompte ou de solde via `creer_facture`. Ré-émission idempotente pour le même numéro. |
| `GET /api/documents/{chemin}` | **URL signée** (`token` + `expires`) | Seul accès aux PDF. |
| `GET /signer/{token}` | Le jeton | Page publique de signature. |
| `POST /api/reservations` | **Aucun secret** — limite de 5 blocages par adresse en 10 minutes | Recalcule le devis, enregistre la réservation « en attente de paiement » et bloque ses nuits. **Une transaction.** `201` · `400` demande invalide · `404` gîte inconnu · `409` refus métier ou dates prises (avec les autres gîtes libres) · `429` trop de tentatives · `503` tunnel indisponible · `500` erreur inattendue |
| `DELETE /api/reservations/{id}` | L'identifiant tiré au hasard, connu du seul navigateur qui a créé la tentative | Lève le blocage et supprime la tentative. `200` · `404` · `409` réservation engagée (jamais supprimée) |

**Pourquoi trois régimes différents.** Les routes d'émission frappent des
numéros légaux : seul un appelant **serveur** (back-office, webhook de paiement)
doit pouvoir les appeler, d'où un secret partagé. La route de signature est
appelée depuis le navigateur du client, qui n'a ni compte ni mot de passe : le
jeton unique reçu par courriel **est** son authentification. Les fichiers, eux,
ne sont ni publics ni réservés à un compte : d'où le lien signé.

**Tout est `runtime = 'nodejs'` et `dynamic = 'force-dynamic'`.**
`@react-pdf/renderer` a besoin de `fontkit` et `zlib`, indisponibles en runtime
Edge ; et une émission de document est un **effet de bord** qui ne doit jamais
être mis en cache.

**Les pages publiques qui affichent des chiffres sont, elles aussi, en rendu à
la demande** : `/`, `/gites`, `/gites/[slug]` et `/contact` portent
`dynamic = 'force-dynamic'`. Ce n'est pas pour éviter le cache — le cache est
dans `lib/gites-publics.ts`, 60 secondes — mais pour que **`next build` ne lise
jamais la base** : un déploiement ne doit pas échouer parce que la base est
momentanément indisponible (D-13). Contrôle : `npm run build` doit réussir sans
aucune base joignable.

**Ce que garantit la transaction unique.** Dans `POST /api/contrats`, le numéro,
la ligne `documents`, le PDF et la recopie du numéro sur la réservation sont
dans la **même** transaction. Un échec entre deux écritures ne peut donc pas
laisser un numéro légal consommé sur un contrat que la réservation ignore. La
ligne `documents` est insérée **avant** l'écriture du fichier, pour que l'index
unique arrête une émission concurrente avant qu'un fichier ne soit produit.

**Les codes de refus** sont explicites et testés : `401` sans secret,
`404` jeton inconnu, `409` contrat déjà signé ou réservation modifiée depuis la
facture d'acompte, `410` lien expiré, `502` échec de rendu ou d'écriture,
`500` incohérence de calcul interne.

**La limite anti-abus lit la DERNIÈRE adresse de `X-Forwarded-For`**, celle
qu'écrit le proxy (Traefik, via Coolify). Next.js ne remplit cet en-tête que
s'il est absent, avec l'adresse de la connexion ; en local (127.0.0.1, ::1), la
limite ne s'applique pas. **À vérifier au déploiement** : que Traefik écrit
bien l'en-tête. Sinon, tous les clients partagent l'adresse du proxy et la
limite devient globale (5 tentatives en 10 minutes pour tout le site).

**Point connu, non corrigé :** les pages `/signer` d'erreur (lien invalide, déjà
signé, expiré) répondent en **HTTP 200** avec le message à l'écran ; seule l'API
renvoie les codes 404 / 409 / 410.

---

## 7. Le mécanisme des URL signées

Les PDF ne sont **jamais** servis directement par le serveur web.

```
getSignedUrl(chemin, ttl)
   └─► expires = maintenant + ttl (secondes Unix)
   └─► token   = HMAC-SHA256( chemin + "\n" + expires , STORAGE_SIGNING_SECRET )
   └─► /api/documents/{chemin}?token=…&expires=…
```

À la lecture, `app/api/documents/[...path]/route.ts` contrôle, **dans cet
ordre** : le chemin, l'expiration, puis la signature. La comparaison du jeton se
fait en **temps constant** (`timingSafeEqual`), pour qu'un attaquant ne puisse
pas deviner le jeton octet par octet en mesurant le temps de réponse.

Conséquences : un lien expiré ne sert plus (`403`), un chemin modifié invalide
la signature (`403`), et allonger `expires` à la main invalide aussi la
signature — les deux valeurs sont signées **ensemble**. Durée par défaut : une
heure.

**Le logo des PDF** est lu sur le **disque** (`lib/logo.ts`, `public/logo.png`
depuis `process.cwd()`), gardé en mémoire, sans aucune requête réseau. Si la
lecture échoue, le PDF sort **sans logo** et l'erreur est journalisée : la route
ne doit jamais échouer à cause du logo. Un contrat sans logo reste valide ; un
contrat non généré après encaissement est un incident client. Ce repli est
**silencieux par conception** — d'où le point de contrôle après déploiement dans
`docs/06-avant-premier-client.md`.

---

## 8. Stratégie de test

Il n'y a **pas** de tests unitaires au sens habituel. Il y a trois niveaux, tous
exécutables en une commande, et c'est délibéré : ce qui doit être prouvé ici
n'est pas qu'une fonction renvoie la bonne valeur, mais qu'**un parcours client
complet produit les bons montants sur les bons documents**.

| Niveau | Commande | Ce qu'il prouve |
|---|---|---|
| Conversion | `npm run verify:centimes` | L'aller-retour centimes ↔ texte numeric sur 51 cas, dont les valeurs limites |
| Prix, taxe, devis | `npm run verify:tarification` | 137 cas calculés à la main : dégressivité, séjours à cheval sur deux saisons, règles, refus, grille publique, les deux exemples du guide officiel de la taxe de séjour au centime, le devis du tunnel (capacité et bébés, délai, paiement intégral, nuits prises) et le contrôle des coordonnées. Sans base |
| Blocage | `DB_CIBLE=test npm run verify:blocage` | Deux clients qui bloquent les mêmes nuits au même instant : un seul gagne ; verrou expiré repris ; chevauchement refusé sans reste ; tentative, seconde tentative, abandon. Avec `--http` (dans `lancer.sh`) : les mêmes cas par le serveur, et la limite anti-abus |
| Base | `npm run db:verify` | Tables, colonnes, seed, fonctions de numérotation, triggers, index uniques, contraintes de tarification et du calendrier, stockage. **Tout est annulé par ROLLBACK** : aucun numéro consommé |
| Bout en bout | `bash scripts/parcours/lancer.sh` | Les dix étapes : les contrôles ci-dessus, puis le parcours complet — contrat, signature, factures, idempotence, refus attendus, accès aux PDF, contrôles en base **et** sur les PDF produits |

**Les deux réservations de test** (`scripts/parcours/reference.ts`) sont
complémentaires :

- **L'Armu** — `TEST-2026-ARMU-001`, avec options : prouve que les options sont
  itemisées et que les lignes s'additionnent jusqu'au sous-total.
- **LaPhine** — `TEST-2026-LAPHINE-002`, sans option : prouve qu'aucune ligne
  « Options : 0,00 € » n'apparaît, et sert à éprouver la garde du cas B
  (réservation modifiée après émission de la facture d'acompte → `409`).

**Les montants attendus sont le point de vérité.** Ils ne se modifient **que**
sur décision métier explicite — jamais pour faire passer un test.

**Tout s'exécute sur `gites_test`** (`DB_CIBLE=test`). Le script de remise à
zéro **refuse** de s'exécuter autrement.

**Le contrôle visuel reste obligatoire.** `controler-pdf.py --png` écrit la
première page de chaque document dans `.parcours/png/`. Les ouvrir au moins une
fois après toute modification du rendu : un PDF peut passer tous les contrôles
automatiques et être visuellement cassé — logo absent, bloc qui déborde en
page 2, chevauchement. Les contrôles automatiques vérifient le **contenu**, pas
la **mise en page**.

**Un test qui passe doit prouver ce qu'il annonce.** En Phase 1, un test de
péremption de lien passait pour la mauvaise raison : le chemin transmis au calcul
de signature était corrompu par la conversion automatique des chemins de Git
Bash. Le code de retour était bon, la démonstration nulle. Vérifier le **message
d'erreur**, pas seulement le code.

---

## 9. Outillage

**Fins de ligne : LF partout**, imposé par `.gitattributes` (explicitement pour `*.sh`, qu'un CRLF casse sous Git Bash avec `$'\r': command not found`), indépendamment du réglage `core.autocrlf` de chaque poste.

### Procédure de session : atteindre la base depuis un poste

Le port PostgreSQL public est fermé (D-10). Toute session qui doit lire ou
écrire en base monte un **tunnel SSH**. Cette procédure se refait à chaque
phase ; elle n'est pas un détail de confort, ses deux dernières étapes évitent
des pannes qui se diagnostiquent mal.

**1. Ouvrir le tunnel**, en tâche de fond :

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L 127.0.0.1:5433:<ip du conteneur>:5432 <utilisateur>@<ip du VPS>
```

`ExitOnForwardFailure` fait échouer la commande tout de suite si le port local
est déjà pris, au lieu d'ouvrir une session qui ne redirige rien.

**2. Diriger l'application vers le tunnel.** Deux façons, la seconde est
préférable :

- modifier `.env.local` (non suivi par git) pour pointer l'hôte et le port sur
  `127.0.0.1:5433` — **relever l'empreinte du fichier avant** (`sha256sum
  .env.local`) ;
- ou passer la variable **en ligne de commande** pour la durée de la commande :
  rien n'est modifié, donc rien n'est à restaurer.

Dans les deux cas : **ne basculer que `DATABASE_URL_TEST`**, en laissant
`DATABASE_URL` sur l'adresse publique fermée. Une commande lancée sans
`DB_CIBLE=test` échoue alors au lieu d'atteindre la base réelle. C'est une
garde technique, et non une discipline à tenir de tête.

**3. Travailler.** Les essais se font sur `gites_test`, jamais sur la base
réelle — y compris les démonstrations (voir D-11 et la fiche de la Phase 2). Une
valeur modifiée pour un test se restaure par un `UPDATE` vers la valeur relevée
avant, **jamais** par `npm run db:seed`, qui écrase les valeurs saisies au
back-office.

**4. Refermer, et vérifier qu'on a refermé.**

- Remettre `.env.local` à l'identique si l'étape 2 l'a modifié, et **comparer
  l'empreinte** à celle relevée : c'est une preuve de restauration qui n'affiche
  aucun secret. Un `.env.local` laissé sur `127.0.0.1:5433` échoue en silence à
  la session suivante, sans rapport apparent avec la cause.
- Fermer le tunnel et **contrôler** que le port 5433 n'écoute plus. Sous
  Windows, arrêter la tâche ne suffit pas : `ssh.exe` survit et garde le port.

```powershell
$c = Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force }
```

**L'adresse du conteneur change à chaque redémarrage.** Si les connexions
cessent de passer alors que le tunnel tourne, c'est la première hypothèse à
tester — avant toute autre :

```bash
ssh <utilisateur>@<ip du VPS> \
  "sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <conteneur du projet>"
```

Puis rouvrir le tunnel avec la nouvelle adresse. Le conteneur du projet est
celui du § 1 : **jamais `coolify-db`**.

**Une adresse IP versée dans l'historique git est permanente.** Elle ne
disparaît pas si le dépôt devient public plus tard, ni si on la retire dans un
commit ultérieur. D'où les marques de remplacement ci-dessus : les valeurs
réelles vivent dans le gestionnaire de mots de passe des propriétaires.
