# Le projet — contexte métier

> Ce fichier est mis à jour quand l'activité change (un gîte, une offre, un
> canal de vente), pas à chaque phase technique.

Ce document existe parce qu'une décision techniquement correcte peut être
commercialement fausse. Il est écrit pour quelqu'un qui n'a aucun contexte :
aucun terme n'y est supposé connu.

---

## 1. L'activité

Les Gîtes de Samoyas louent **trois gîtes** dans le hameau de Samoyas, sur la
commune de **Savas** (Ardèche, département 07), à des vacanciers, à la semaine
ou au week-end.

L'exploitation est portée par une société, la **SARL DE LA VOUTE**. C'est elle
qui encaisse, facture et signe les contrats. « Les Gîtes de Samoyas » est une
**enseigne** : un nom commercial, pas une entité juridique. Le gérant est
Nicolas Terrafina (`lib/constantes.ts`, `EMETTEUR`).

Deux adresses coexistent, et ce n'est pas une erreur :

- **Adresse des gîtes** (celle qui figure dans le contrat de location) :
  Hameau de Samoyas, 07430 Savas (`db/seed.ts`).
- **Adresse du siège de la société** (celle qui figure sur les factures) :
  176 Route de Samoyas, 07100 Boulieu-lès-Annonay (`lib/constantes.ts`).

Les trois gîtes sont **labellisés Gîtes de France** et portent chacun une
référence de ce label, utilisée comme identifiant stable en base.

---

## 2. Les trois gîtes

Valeurs telles qu'elles existent réellement en base de données (`db/seed.ts`,
table `gites`). Ce sont ces valeurs qui remplissent les contrats et les
factures — pas les constantes du code, pas les textes du site.

| | LaPhine | L'Armu | La Maison Vieille |
|---|---|---|---|
| Référence Gîtes de France | 07G310701 | 07G310700 | 07G310702 |
| Segment d'URL (`slug`) | `laphine` | `armu` | `maison-vieille` |
| Capacité maximale | 4 personnes | 2 personnes | 4 personnes |
| Caution | 500,00 € | **400,00 €** | 500,00 € |
| Forfait ménage | 80,00 € | 80,00 € | 80,00 € |
| Taux de taxe de séjour | 5,5 % | 5,5 % | 5,5 % |
| Tarif semaine de base | 670,00 € | 450,00 € | 690,00 € |
| Tarif week-end | 300,00 € | 200,00 € | 320,00 € |
| Équipement spécifique | — | — | Sauna privatif |
| Spa | oui | oui | oui |

**Les trois gîtes ont un spa** (`a_spa` vaut `true` pour les trois). Seule La
Maison Vieille a en plus un **sauna**.

**La caution de L'Armu est de 400 €, pas 500 €.** Le site affiche aujourd'hui
« Caution 500 € » sur les trois fiches, en dur dans le code
(`app/gites/[slug]/page.tsx`). C'est exactement ce que la Phase 2 corrige en
branchant les fiches sur la base.

Descriptions éditoriales (surfaces, nombre de chambres, récits, notes et
nombre d'avis) : elles vivent dans `lib/data/gites.ts` et `lib/data/stories.ts`,
en code, **sans source en base**. Les notes (5,0 · 16 avis, etc.) n'ont aucune
origine vérifiable dans le dépôt — **À COMPLÉTER** : d'où viennent-elles, et
peut-on les afficher en l'état ?

**Grille tarifaire saisonnière.** Le site affiche quatre saisons par gîte
(basse, moyenne, haute, fêtes) dans `lib/data/pricing.ts`. La base ne connaît
que deux tarifs par gîte (`tarif_semaine_base`, `tarif_weekend`) : **il n'existe
aucun modèle de saisons en base**. C'est un manque à traiter en Phase 5
(back-office tarifs), pas un oubli de la Phase 0.

---

## 3. Le positionnement

Bien-être et nature. L'argument central n'est pas le nombre de chambres mais
l'expérience : spa privatif dans chaque gîte, sauna à La Maison Vieille, calme
d'un hameau ardéchois. Le vocabulaire du site est celui du refuge et du
protocole bien-être, jamais celui du volume.

Les trois gîtes sont **complémentaires, pas interchangeables** : L'Armu pour un
couple (2 personnes), LaPhine et La Maison Vieille pour une famille
(4 personnes). Réunis, ils accueillent **jusqu'à dix personnes** — c'est
l'argument des séjours de groupe ou de famille élargie, et il n'existe que
parce que les trois sont au même endroit.

Conséquence pratique : une décision qui uniformise les trois gîtes (un tarif
unique, une caution unique, une fiche unique) détruit cet argument. Les
différences entre gîtes sont le produit.

---

## 4. L'objectif : la réservation en direct

Aujourd'hui, une part des séjours est vendue par des **intermédiaires** :
Gîtes de France et Airbnb notamment. Un intermédiaire apporte des clients mais
prélève une **commission** — un pourcentage du prix du séjour — et impose ses
règles (calendrier, conditions d'annulation, relation client).

L'objet de ce site est la **désintermédiation** : amener le client à réserver
directement, sur le site des propriétaires, sans passer par la plateforme. Un
séjour vendu en direct rapporte la commission en plus, et la relation client
en propre.

Ce que cela implique techniquement, et qui justifie la complexité du projet :

- **Le site doit savoir encaisser** (acompte, solde, caution), donc tenir un
  cycle de paiement complet (Phase 3 et 4).
- **Le site doit produire les documents légaux** que la plateforme produisait
  jusque-là : contrat de location signé, factures numérotées (déjà fait, Phase 1).
- **Le site doit connaître les disponibilités réelles**, sinon deux clients
  réservent la même nuit — l'un sur Airbnb, l'autre en direct. D'où la
  synchronisation des calendriers en Phase 7.

**À COMPLÉTER** : quelle part du chiffre passe aujourd'hui par les plateformes,
et quel taux de commission ? Sans ces deux chiffres, on ne peut pas mesurer si
le projet est rentable, ni arbitrer combien il mérite d'effort.

---

## 5. Patricia et Nicolas

Patricia et Nicolas Terrafina exploitent les gîtes. Nicolas est **gérant de la
SARL DE LA VOUTE** : c'est son nom qui signe les contrats côté bailleur
(`components/pdf/ContratPDF.tsx`).

**À COMPLÉTER** : le rôle opérationnel de Patricia (accueil, ménage, gestion
des réservations, tarification ?). Cette information n'existe nulle part dans
le dépôt, et elle décide de qui utilise quel écran du back-office.

### Ce qu'ils feront du back-office (Phase 5)

Le principe : **ils doivent pouvoir exploiter sans toucher au code, ni à la
base.** Toute valeur qu'ils ont besoin de changer doit être un champ de
formulaire, pas une constante dans un fichier.

Concrètement, le back-office doit leur permettre de :

- consulter et modifier les **réservations** (coordonnées, dates, montants) ;
- voir le **calendrier** des trois gîtes et bloquer des nuits à la main ;
- changer les **tarifs** et les saisons ;
- modifier les **fiches des gîtes** (textes, photos, équipements) ;
- retrouver et renvoyer les **documents** (contrats, factures) ;
- gérer les **bons cadeaux** ;
- **nommer les options** facturées — aujourd'hui les documents affichent
  l'intitulé générique « Options », ce qui n'est pas conforme (voir
  `docs/06-avant-premier-client.md`).

Le critère d'acceptation de la Phase 5 tient en une phrase : *Patricia modifie
un tarif sans toucher au code.*

---

## 6. Le canal de vente avant, et ce qui reste

Le projet est né du besoin de remplacer une chaîne d'outils dispersés par une
seule application. Deux traces subsistent dans le dépôt et seront traitées :

- **L'ancien site statique** (fichiers `.html` à la racine, `assets/`) : il a
  été refait en Next.js et n'est plus servi. Supprimé en Phase 2.
- **L'ancien back-office statique** (`admin/`) : jamais connecté à quoi que ce
  soit. Archivé en Phase 2, reconstruit en Phase 5.

**Beds24** (logiciel de gestion de locations saisonnières, capable de
synchroniser les calendriers de plusieurs plateformes en temps réel) a été
envisagé puis **reporté en V2** : voir `docs/02-decisions.md`.
