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

**Réseau.** Le port PostgreSQL public est **refermé** (voir
`docs/02-decisions.md`, D-10). `DATABASE_URL` vise l'hôte **interne** du réseau
Coolify. `?sslmode=require` est inutilisable : le serveur tourne avec
`ssl = off`. Un accès depuis un poste de développement passe par un **tunnel
SSH**.

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
  api/          Routes serveur : contrats, contrats/signer, factures, documents
  gites/        Liste et fiche d'un gîte
  reserver/     Tunnel de réservation (visuel seulement à ce jour)
  signer/       Page publique de signature d'un contrat
  suivi/        Page de suivi côté client (contenu de démonstration à ce jour)
  legal/        Mentions, CGV, confidentialité, cookies
components/
  pdf/          Les trois documents PDF (contrat, facture d'acompte, de solde)
  layout/       En-tête, pied de page, bandeau cookies
  ui/           Composants réutilisables
lib/
  centimes.ts   Les DEUX fonctions de frontière du modèle monétaire
  montants.ts   Le SEUL calcul de montants
  format.ts     Le SEUL formatage calcul -> affichage (fmtEuro)
  constantes.ts Identité légale et valeurs par défaut
  storage.ts    Stockage des PDF et signature des URL
  reservations.ts  Chargement réservation + gîte joint, avec conversion en centimes
  auth.ts       Vérification du secret service-à-service
  data/         Contenu éditorial du site, en code (gîtes, récits, tarifs, légal)
db/
  schema/       Le schéma Drizzle : un fichier par table. SOURCE DE VÉRITÉ.
  migrations/   Les SQL générés, numérotés. meta/ est le journal de Drizzle.
  seed.ts       Les trois gîtes. Idempotent.
  verify.ts     Auto-vérification complète, tout annulé par ROLLBACK.
scripts/parcours/  Non-régression bout en bout (voir § 8)
docs/           Le référentiel (ce dossier)
public/         Servi tel quel par Next.js — dont public/logo.png
```

**Legs à supprimer en Phase 2** : les fichiers `.html` à la racine, le dossier
`assets/` (dupliqué dans `public/assets/`, et dont `tokens.css` + `site.css` ont
déjà été fusionnés dans `app/globals.css`), et le dossier `admin/`.

---

## 3. Modèle de données — les dix tables

**Cœur métier — six tables exercées par le code**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `gites` | Les trois gîtes : nom, référence Gîtes de France, slug, adresse, capacité, forfait ménage, caution, tarifs, taux de taxe. **La base prime sur toute constante du code.** | `ref_gdf` et `slug` uniques |
| `reservations` | Une ligne par séjour, quel que soit son statut (`brouillon`, `en_attente_paiement`, `confirmee`, `annulee`, `terminee`). Client, conjoint, dates, occupants, montants, paiement de l'acompte. | `reference` unique · `updated_at` tenu par trigger |
| `documents` | Le registre des PDF émis : contrat, facture d'acompte, facture de solde. Chemin (`url_pdf`), numéro, statut (`genere` puis `signe`), jeton de signature pour les contrats. | **Index unique `(reservation_id, type)`** : un double clic ou un webhook en double ne peut pas créer deux contrats · `token` unique quand non nul |
| `signatures` | La preuve de signature : qui, quand, depuis quelle adresse, avec quel texte de consentement, et l'empreinte SHA-256 du PDF signé. | **Trigger d'immutabilité** (UPDATE et DELETE refusés) · une seule signature par document |
| `factures` | Les factures d'acompte et de solde : numéro légal, montant, date d'émission, instantané des données du PDF. | `numero` unique · créées **exclusivement** par `creer_facture` |
| `compteurs_documents` | Le compteur de numérotation, une ligne par série et par année. | Clé primaire `(serie, annee)` · **jamais une SEQUENCE** |

**Tables provisoires — structure minimale, aucun code ne les exerce encore**

| Table | Rôle prévu | Affinée en |
|---|---|---|
| `paiements` | Chaque mouvement d'argent (acompte, solde, caution) et sa référence chez le prestataire. `montant` est déjà en mode texte, sans appelant. | Phase 3 |
| `disponibilites` | Le calendrier : une ligne par gîte et par nuit, avec son état (`libre`, `reserve`, `bloque`, **`verrou`**) et son origine (`directe`, `airbnb`, `booking`, `gdf`). `verrou_expire_at` porte le verrou temporaire du tunnel de paiement. | Phase 3, puis 7 |
| `avis` | Les avis clients affichés sur le site. | Phase 6 |
| `audit_logs` | Le journal des actions sensibles. Aucun trigger ne l'alimente. | Phase 3 |

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

**`lib/montants.ts` est le seul fichier qui calcule.** Il ne construit **aucun**
numéro de document.

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
| Base | `npm run db:verify` | Tables, colonnes, seed, fonctions de numérotation, triggers, index uniques, stockage. **Tout est annulé par ROLLBACK** : aucun numéro consommé |
| Bout en bout | `bash scripts/parcours/lancer.sh` | Le parcours complet : contrat, signature, factures, idempotence, refus attendus, accès aux PDF, contrôles en base **et** sur les PDF produits |

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
