# Phase 6 — Contenus, légal, SEO

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. **Parallélisable** avec les phases 4 et 5.

**Cette phase porte trois des dix points bloquants** de
`docs/06-avant-premier-client.md` (6, 7 et 8), dont deux dépendent de réponses
**extérieures au dépôt**. Les questions doivent être posées **dès l'ouverture de
la phase**, pas à la fin : une réponse de comptable ne s'obtient pas en une
heure.

---

## Objectif

Rendre le site publiable : contenus complets, documents légaux exacts,
référencement en place.

---

## Périmètre inclus

### Contenus
1. **Page Activités** — l'existant (`app/activites/`) est à compléter.
2. **Système d'avis** — la table `avis` existe en version provisoire. Les notes
   et nombres d'avis affichés aujourd'hui (`lib/data/gites.ts`) n'ont **aucune
   source vérifiable** : leur origine est à établir avant publication
   (`docs/00-projet.md` § 2).
3. **Habillage graphique de la page de signature**, reporté depuis la Phase 1.

### Légal — les trois points bloquants
4. **Identité du bailleur** (point 6) : question au **comptable**, dans ses trois
   volets — qui exploite, comment les revenus sont déclarés, l'exonération de TVA
   de l'art. 261 D 4° CGI tient-elle. Puis alignement des mentions légales, des
   CGV, du contrat, des deux factures et de `lib/constantes.ts`. Traiter au
   passage l'**écart E-7** (`EMETTEUR` et `MENTIONS` déclarés mais jamais
   importés : les PDF recopient leurs valeurs).
5. **Médiateur de la consommation** (point 7) : question aux **propriétaires** —
   existe-t-il une adhésion en cours, à qui. Puis un seul organisme partout.
6. **Article 12 du contrat — règles sauna** (point 8). Ce n'est **pas** une
   décision ouverte : le principe est arrêté (spa interdit aux moins de 6 ans,
   sauna aux moins de 12 ans). Il manque l'écriture, et une décision technique
   sur le déclenchement de la section (colonne `a_sauna` ou lecture du texte
   libre `equipements_specifiques`).

### Légal — le reste
7. **Mentions légales LCEN, CGV, RGPD et cookies** : les textes existent
   (`lib/data/legal.ts`) mais datent de l'ancien site et contredisent les
   documents contractuels. À reprendre après la réponse du point 4.
8. **Médiation de la consommation** affichée conformément à l'art. L.612-1
   C. conso.

### SEO
9. Balises, métadonnées, données structurées.

---

## Périmètre EXCLU

Le paiement (Phases 3 et 4), le back-office (Phase 5), la synchronisation des
calendriers (Phase 7).

**Les mentions Swikly** relèvent de la Phase 4 : ne pas les traiter ici, sauf si
l'arbitrage a déjà été rendu et que les pages légales en portent encore
(`lib/data/legal.ts`, CGV et cookies).

---

## Critères d'acceptation

1. Les mentions légales, les CGV, le contrat et les deux factures désignent **la
   même entité**, avec un SIRET réel.
2. Un **seul** médiateur est annoncé, et l'adhésion correspondante est
   confirmée.
3. Un contrat généré pour **La Maison Vieille** contient les règles sauna ; un
   contrat généré pour L'Armu ne les contient pas. Le texte de consentement et
   le contenu de l'article 12 **concordent**.
4. Aucune page publique n'affiche de valeur factice.
5. `bash scripts/parcours/lancer.sh` passe toujours — à étendre pour couvrir un
   troisième gîte si le critère 3 l'exige.
