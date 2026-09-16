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

Lecture Drizzle depuis la table `gites`, avec **ISR `revalidate = 60`**.

*ISR (Incremental Static Regeneration)* : la page est rendue une fois et servie
telle quelle ; passé le délai indiqué, la première visite suivante déclenche un
nouveau rendu en arrière-plan. Le visiteur ne paie jamais l'attente d'une requête
en base, et une modification apparaît au plus tard **60 secondes** après.

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

## Décisions ouvertes connues

À présenter en options numérotées à l'ouverture de la phase, avec recommandation,
et à faire arbitrer (`docs/05-protocole-phase.md`, étape 3).

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

1. `npm run lint`, `npx tsc --noEmit` et `npm run build` passent.
2. Les fiches gîtes affichent les **données de la base** — en particulier la
   caution réelle de chaque gîte : **400 € pour L'Armu**, 500 € pour les deux
   autres.
3. Un changement de prix **en base** apparaît sur le site en **60 secondes au
   plus**, sans redéploiement. À démontrer en conditions réelles, pas en théorie.
4. `bash scripts/parcours/lancer.sh` passe **toujours** — la phase ne touche pas
   à la facturation, aucun montant ne doit bouger.
5. Plus aucun fichier `.html` servi ni aucun `assets/` mort à la racine.
6. Le `README.md` décrit le projet tel qu'il est.

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

**À arbitrer (DO-2.3).** Garder la liste des slugs en code (elle change une fois
tous les dix ans) et ne lire en base que les scalaires, ou accepter la
dépendance de build et la documenter. La première option conserve un build
autonome ; la seconde évite une liste de plus à tenir.

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

**La parade.** Décider explicitement du comportement quand la valeur manque —
masquer la ligne, ou afficher une valeur de repli — et le tester en mettant la
colonne à `NULL` sur la base de test.

### R-5 · Confondre le contenu de la base de test et celui de la base réelle

`DB_CIBLE=test` fait lire `gites_test`. Développer avec cette variable en place
et conclure que « le site affiche bien les données de la base » ne prouve rien
sur la production.

**La parade.** Le critère 3 se démontre sur la base **réelle** (ou sur une copie
fidèle), pas sur `gites_test`.
