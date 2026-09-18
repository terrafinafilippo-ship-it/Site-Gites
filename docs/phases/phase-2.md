# Phase 2 — Assainissement et connexion du site

> Fiche à compléter à l'ouverture de la phase, puis à tenir à jour jusqu'à sa
> clôture. État de la phase : `docs/01-plan-execution.md`. Méthode :
> `docs/05-protocole-phase.md`.

**Dépendances :** Phase A close. Bloque les phases 3, 5 et 6.

---

## Objectif

Le dépôt porte aujourd'hui **deux sites** : l'ancien, en HTML statique, et le
nouveau, en Next.js. Seul le second est servi. Le premier survit, se lit comme
du code actif, et sera tôt ou tard modifié par erreur.

Par ailleurs, les fiches des gîtes affichent des valeurs **écrites en dur dans
le code** — dont une **fausse** : « Caution 500 € » sur les trois fiches, alors
que L'Armu est à 400 € en base. Un client lit 500 €, signe un contrat à 400 €.

Cette phase fait deux choses : **supprimer ce qui est mort**, et **brancher sur
la base ce qui doit en venir**.

---

## Périmètre inclus

### 1. Supprimer l'ancien site statique

Les fichiers `.html` de la racine (`index`, `gites`, `gite`, `activites`,
`reserver`, `suivi`, `contact`, `legal`, `404`) et le dossier `assets/`.

Vérifications préalables, à faire **avant** de supprimer :
- `assets/tokens.css` et `assets/site.css` ont déjà été **fusionnés** dans
  `app/globals.css` (son en-tête le dit) ;
- `assets/Logo-*.png` sont **dupliqués** dans `public/assets/`, d'où Next.js les
  sert (`components/layout/Header.tsx`, `Footer.tsx`,
  `app/reserver/ReserverFunnel.tsx` référencent `/assets/Logo-header.png`) ;
- `assets/image-slot.js` est remplacé par `components/ui/ImageSlot.tsx` ;
- `assets/admin.css` et `assets/admin-shell.js` ne servent qu'à `admin/`.

Git conserve l'historique : rien n'est perdu.

### 2. Archiver le dossier `admin/`

L'ancien back-office statique (neuf pages HTML) sera **reconstruit en Next.js en
Phase 5**. Il ne doit pas vivre en parallèle : deux back-offices, c'est deux
sources de vérité et une session future qui corrige le mauvais.

**Décision ouverte** sur ce que « archiver » veut dire exactement — voir
plus bas.

### 3. Réécrire le `README.md` de la racine

Le README actuel décrit un **site statique HTML/CSS/JS sans build**, lancé par
`npx serve .`. C'est faux depuis la migration Next.js. Quelqu'un qui découvre le
dépôt par son README part dans la mauvaise direction dès la première minute.

Le nouveau README : ce qu'est le projet, comment l'installer et le lancer, la
carte du dépôt, et un renvoi vers `CLAUDE.md` et `docs/`. Il ne recopie pas
`docs/` (règle 1).

### 4. Brancher les pages gîtes sur la base

Lecture Drizzle depuis la table `gites`, par `lib/gites-publics.ts`, avec un
**cache de 60 secondes** (`unstable_cache`, étiquette `gites`) et des pages en
**rendu à la demande**.

*Ce qui a été retenu, et pourquoi pas l'ISR.* L'ISR figeait la page au build,
donc faisait lire la base **pendant le build** (voir R-2, levé). Le cache de
`lib/gites-publics.ts` donne la même propriété au visiteur — il ne paie jamais
l'attente d'une requête en base, et une modification apparaît au plus tard
**60 secondes** après — sans rien exiger au build.

**Architecture hybride — actée, à ne pas rediscuter :**

| Nature | Origine | Exemples |
|---|---|---|
| **Scalaires métier** | **La base** (`gites`) | Tarifs, capacité, caution, forfait ménage, taux de taxe de séjour |
| **Éditorial** | **Le code** (`lib/data/`) | Récits, photos, formulations, arguments de vente |

**Pourquoi.** Un scalaire métier doit être modifiable par Patricia sans
développeur (Phase 5) et doit être **le même** sur le site et sur le contrat —
sinon on annonce un prix et on en facture un autre. Un texte de vente, lui, se
travaille dans la durée, se relit en revue, et n'a aucune raison de transiter
par un formulaire.

Pages concernées : `app/gites/page.tsx` (liste) et `app/gites/[slug]/page.tsx`
(fiche). La ligne fautive à corriger en priorité :
`app/gites/[slug]/page.tsx`, « Caution Swikly — 500 € ».

---

## Périmètre EXCLU

- **Toute logique de réservation ou de paiement.** Le tunnel
  (`app/reserver/ReserverFunnel.tsx`, ~910 lignes) reste visuel, le paiement
  reste simulé par `setTimeout`. C'est la Phase 3.
- **Tout back-office.** Aucune interface d'administration n'est reconstruite ici.
  C'est la Phase 5.
- **Les mentions Swikly, l'identité de l'éditeur, le médiateur, l'article 12.**
  Ce sont les points 3, 6, 7 et 8 de `docs/06-avant-premier-client.md`, traités
  en Phases 4 et 6. Ne pas les entamer ici : ils dépendent d'arbitrages non
  rendus.
- **La page `/suivi/[ref]`**, dont le contenu est entièrement de démonstration.
  C'est la Phase 3.
- **La grille tarifaire saisonnière** (`lib/data/pricing.ts`, quatre saisons par
  gîte) : la base ne connaît que `tarif_semaine_base` et `tarif_weekend`, il
  n'existe **aucun modèle de saisons**. Le créer est un sujet de Phase 5. Ici,
  la grille reste en code.

---

## Décisions rendues (17 septembre 2026)

Les décisions structurantes sont consignées dans `docs/02-decisions.md` : **D-13**
(rendu à la demande, cache de 60 s, dégradation sans erreur 500), **D-14** (slugs
de la base), **D-15** (définition de `tarif_semaine_base`). Ce qui suit est le
relevé d'arbitrage, décision par décision.

| # | Sujet | Arbitrage |
|---|---|---|
| DO-2.1 | Slugs divergents | Le site adopte ceux de la base (`armu`, `maison-vieille`), plus deux redirections 301. |
| DO-2.2 | Archiver `admin/` | Suppression pure et simple. Point de récupération : commit `e341c01`. |
| DO-2.3 | Rendu des pages | Rendu à la demande + cache de 60 s. **Correction apportée à la proposition initiale :** une base injoignable ne doit jamais produire une erreur 500 sur une fiche gîte ; elle emprunte le chemin de dégradation de DO-2.4. Les deux pannes se journalisent **distinctement**. |
| DO-2.4 | Valeur absente en base | Masquer le chiffre. Pas de « tarif sur demande » : une formulation commerciale doit venir des propriétaires. |
| DO-2.5 | Étendue du branchement | Accueil et carte gîte incluses, plus forfait ménage, taux de taxe de séjour, taux d'acompte et délai de solde sur leur source respective. |
| DO-2.6 | Démonstration du critère 3 | **Refusée sur la base réelle.** Aucune écriture, même temporaire : le mécanisme est identique sur `gites_test`, et `db:seed` n'est pas un outil de restauration. |
| DO-2.7 | Sens de `tarif_semaine_base` | Tarif de **basse saison** (prix plancher). Le code ne permettait pas de trancher ; la lecture la plus probable a été retenue et écrite (D-15). |
| DO-2.8 | Adresses de l'ancien site en ligne | La liste se relève sur le site réel (plan du site, Search Console) au moment de la mise en ligne : voir `phase-7.md`. |
| DO-2.9 | Capacités écrites en toutes lettres | Branchées sur la base, y compris le total des trois gîtes. « dix » devient « 10 ». |
| DO-2.10 | Adresse du VPS dans la documentation | Écrite avec des marques de remplacement (`<utilisateur>@<ip du VPS>`), voir `docs/04-architecture.md` § 9. |

### DO-2.1 · Les slugs divergent entre le site et la base

Le site utilise `larmu` et `maisonvieille` (`lib/data/gites.ts`, type `GiteId`).
La base utilise `armu` et `maison-vieille` (`db/seed.ts`). Brancher les pages sur
la base **force** à trancher : les deux systèmes doivent se rejoindre sur une
seule clé.

Enjeu : les slugs sont dans les **URL publiques** (`/gites/maisonvieille`).
Les changer casse les liens existants et les éventuels référencements. Ne pas les
changer impose une table de correspondance, donc un endroit de plus où se
tromper. Le journal de Phase 0 avait déjà inscrit ce point comme « à aligner ».

### DO-2.2 · Ce que « archiver `admin/` » veut dire

Supprimer purement et simplement (git garde tout, et c'est le plus honnête pour
une session future) ou déplacer dans un dossier explicitement inerte. Les deux
sont défendables ; l'essentiel est que rien ne puisse le confondre avec du code
vivant.

### DO-2.3 · Comment `generateStaticParams` obtient la liste des gîtes

Voir le risque R-2 ci-dessous : c'est une décision d'architecture, pas un détail
d'implémentation.

---

## Critères d'acceptation

1. `npm run lint`, `npx tsc --noEmit` et `npm run build` passent. ✔ le build
   passe **tunnel fermé**, donc sans base joignable.
2. Les fiches gîtes affichent les **données de la base** — en particulier la
   caution réelle de chaque gîte : **400 € pour L'Armu**, 500 € pour les deux
   autres. ✔ vérifié à l'écran.
3. Un changement de prix **en base** apparaît sur le site en **60 secondes au
   plus**, sans redéploiement. ✔ démontré sur `gites_test` (DO-2.6) : tarif
   passé de 450,00 à 451,00 par `UPDATE`, ancienne valeur encore servie juste
   après (preuve du cache), nouvelle valeur affichée **24 secondes** plus tard,
   puis valeur d'origine rétablie par `UPDATE`.
4. `bash scripts/parcours/lancer.sh` passe **toujours** — la phase ne touche pas
   à la facturation, aucun montant ne doit bouger. ✔ les **8 étapes** passent,
   0 échec (dont 81 contrôles en base et 74 pour `db:verify` ; le détail par
   étape est dans `docs/journal-phases.md`).
5. Plus aucun fichier `.html` servi ni aucun `assets/` mort à la racine. ✔
6. Le `README.md` décrit le projet tel qu'il est. ✔
7. **Une base injoignable ne produit pas d'erreur 500.** ✔ les quatre pages
   publiques répondent 200 en mode dégradé, en moins de 3,2 secondes même quand
   la base ne répond pas du tout.

---

## Risques identifiés

### R-1 · Le port PostgreSQL public est refermé

**Le fait.** Le développement local ne joint plus la base directement (voir
`docs/02-decisions.md`, D-10). Cette phase est la **première** à avoir besoin de
lire la base depuis un poste de développement.

**La parade.** Monter un **tunnel SSH** vers le VPS, ou rouvrir le port
temporairement — en le refermant **dans la même session**, pas « plus tard ».
Le tunnel est préférable : il ne laisse rien d'ouvert derrière lui.

### R-2 · Le build risque d'exiger une base joignable

**Le fait.** `next build` réussit aujourd'hui **sans** `DATABASE_URL` : le client
Drizzle est créé paresseusement (`db/index.ts`, création au premier `getDb()`).
Or `app/gites/[slug]/page.tsx` déclare `generateStaticParams` et
`dynamicParams = false` : la liste des slugs est figée **au build**. Si elle
vient désormais de la base, **le build appelle la base**.

**Conséquence si on l'ignore.** Le déploiement Coolify échoue dès que la base
n'est pas joignable au moment du build — c'est-à-dire précisément dans les
situations où l'on redéploie en urgence.

**Levé.** `generateStaticParams` et `dynamicParams` ont été retirés : les pages
passent en rendu à la demande (`dynamic = "force-dynamic"`) et le cache de 60 s
tient le rôle de l'ISR. La liste des slugs reste en code, où elle sert aussi au
mode dégradé. Contrôle de non-régression : `npm run build` **doit** réussir
tunnel fermé — c'est ce qui prouve qu'aucun déploiement ne dépend de la base.

### R-3 · Supprimer un fichier encore référencé

`assets/` est référencé par les `.html` supprimés, mais `/assets/Logo-header.png`
est servi depuis `public/assets/`. Une erreur de raisonnement ici casse le logo
de **toutes** les pages, silencieusement (une image absente ne fait pas échouer
un build).

**La parade.** Après suppression : `npm run build`, puis ouvrir l'accueil, une
fiche gîte et le tunnel, et **regarder** l'en-tête et le pied de page.

### R-4 · Une valeur de la base absente ou nulle

`tarif_semaine_base`, `tarif_weekend` et `taux_taxe_sejour` sont **nullables**
dans le schéma. Une page qui suppose leur présence affichera `null €` ou
plantera au rendu.

**Levé (DO-2.4).** Le chiffre absent est **masqué**, jamais remplacé par une
formule. Masquer un prix est une omission ; écrire « tarif sur demande » est une
promesse commerciale, qui doit venir des propriétaires.

Vérifié en mettant `tarif_semaine_base` à `NULL` sur `gites_test` : la fiche
répond 200, la grille tarifaire **entière** et tous les « Dès » du gîte
disparaissent (une grille amputée de sa basse saison ferait passer la moyenne
saison pour le prix plancher), le reste de la fiche est intact, et le journal
écrit une ligne `VALEUR ABSENTE EN BASE` par rafraîchissement du cache.

### R-5 · Confondre le contenu de la base de test et celui de la base réelle

`DB_CIBLE=test` fait lire `gites_test`. Développer avec cette variable en place
et conclure que « le site affiche bien les données de la base » ne prouve rien
sur la production.

**La parade retenue, différente de celle envisagée d'abord.** Écrire sur la base
réelle pour démontrer le critère 3 a été **refusé** (DO-2.6) : le mécanisme est
identique sur `gites_test`, la base réelle n'apporte qu'un risque et un
précédent, et la restauration serait passée par `db:seed`, qui écrase les
valeurs du back-office.

À la place, le risque est traité **techniquement** : la clé du cache de
`lib/gites-publics.ts` contient la base visée. Un cache rempli en développement
sur `gites_test` ne peut donc pas être resservi sous la base réelle. Sans cela,
la confusion serait silencieuse : mêmes pages, mêmes URL, chiffres faux.

Garde-fou complémentaire de session : ne basculer sur le tunnel que
`DATABASE_URL_TEST`, en laissant `DATABASE_URL` sur l'adresse publique fermée.
Une commande lancée sans `DB_CIBLE=test` échoue alors au lieu d'atteindre la
base réelle (voir `docs/04-architecture.md` § 9).
