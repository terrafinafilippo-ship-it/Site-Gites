# Phase 6 — Contenus, légal, SEO

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. **Parallélisable** avec les phases 4 et 5.

**Cette phase porte quatre des seize points bloquants** de
`docs/06-avant-premier-client.md` (6, 7, 8 et 13), dont trois dépendent de
réponses **extérieures au dépôt**. Les questions doivent être posées **dès l'ouverture de
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
2. **Système d'avis** — **fait le 12 novembre 2026** (D-40) : invitation le
   lendemain du départ, avis publié tout de suite, retrait pour un motif
   affiché, politique des avis. Les chiffres Gîtes de France (ceux de
   Gîtes de France, gérant, 12 novembre 2026) passent sur la fiche de chaque
   gîte, avec leur source, jusqu'à ce que les avis du site les remplacent.
3. **Habillage graphique de la page de signature**, reporté depuis la Phase 1 :
   **fait le 12 novembre 2026** (D-39), habillage des pages client du site,
   textes inchangés.
4. **L'anglais** (D-22, point 13) : le site existe en anglais depuis le
   16 octobre 2026, traduit par une session. Relecture par les propriétaires ;
   réponse du juriste sur des CGV disponibles en français seulement ;
   traductions juridiques s'il les demande.

### Légal — les trois points bloquants
5. **Identité du bailleur** (point 6) : **fait le 14 novembre 2026** (D-41) — la
   SARL DE LA VOUTE, factures sans TVA ; mentions légales, CGV, confidentialité
   et pied de page alignés. Pour mémoire : question au **comptable**, dans ses trois
   volets — qui exploite, comment les revenus sont déclarés, l'exonération de TVA
   de l'art. 261 D 4° CGI tient-elle. Puis alignement des mentions légales, des
   CGV, et de `lib/constantes.ts`, que le contrat, les trois factures et la
   page de signature lisent depuis le 9 novembre 2026 (écart E-7 corrigé).
6. **Médiateur de la consommation** (point 7) : question aux **propriétaires** —
   existe-t-il une adhésion en cours, à qui. Puis un seul organisme partout.
7. **Article 12 du contrat — règles sauna** (point 8) : **fait le
   12 novembre 2026** (D-38) — case « Sauna » sur la fiche du gîte, règles du
   sauna à l'article 12, texte d'accord accordé au contenu de l'article.

### Légal — le reste
8. **Mentions légales LCEN, CGV, RGPD et cookies** : les textes existent
   (`lib/data/legal.ts`) mais datent de l'ancien site et contredisent les
   documents contractuels. À reprendre après la réponse du point 5.
9. **Médiation de la consommation** affichée conformément à l'art. L.612-1
   C. conso.

### SEO
10. Balises, métadonnées, données structurées : **fait le 12 novembre 2026**
    (D-39) — description et aperçu de partage par page (textes déjà affichés),
    `robots.txt`, `sitemap.xml` (24 adresses depuis la politique des avis), données structurées de
    l'établissement et de chaque gîte, sans les notes Gîtes de France. Les
    adresses complètes dépendent de `NEXT_PUBLIC_SITE_URL`, réglée avant le
    build.

### Relevé des valeurs sans source (9 novembre 2026)

Ce que les pages publiques affichent sans source vérifiable, pour le critère
d'acceptation 4. Rien n'a été modifié : chaque ligne attend celui qui peut la
lever.

| Où | Ce qui s'affiche | Pourquoi c'est faux ou douteux | Qui |
|---|---|---|---|
| ~~Mentions légales, pied de page~~ | ~~« exploitants en nom propre », SIRET 000 000 000 00000~~ | **Corrigé le 14 novembre 2026** (D-41) : la SARL DE LA VOUTE, ses vrais numéros, lus dans `EMETTEUR` | — |
| ~~Mentions légales, confidentialité, page Contact~~ | ~~contact@gites-samoyas.fr~~ | **Corrigé le 11 novembre 2026** : contact@gitesdesamoyas.fr (réponse du gérant), l'adresse que le contrat imprime depuis les réglages. Les pages l'écrivent en clair : si les réglages changent d'adresse, elles sont à corriger aussi | — |
| ~~Fiches et cartes des gîtes (`lib/data/gites.ts`)~~ | ~~Note, nombre d'avis, % de recommandation par gîte (5,0 · 16 avis…)~~ | **Vrais** : avis Gîtes de France (gérant, 12 novembre 2026). **Sortis du code le 12 novembre 2026** (D-40) : saisis sur la fiche de chaque gîte du back-office, affichés avec leur source à côté des avis des clients du site | — |
| ~~Mentions légales~~ | ~~« Les avis affichés sont collectés et vérifiés par Gîtes de France »~~ | **Vrai** : les chiffres viennent de Gîtes de France (gérant, 12 novembre 2026) | — |
| Accueil | « Labellisés depuis 2018 » | Écrit en dur, aucune source dans le dépôt | Les propriétaires |
| ~~Politique cookies, bannière~~ | ~~Mesure d'audience par Matomo~~ | **Corrigé le 12 novembre 2026** (D-39) : bannière retirée, politique cookies réécrite (aucun traceur ; cookies de Stripe au paiement) | — |
| CGV | Médiateur MTV **retiré le 14 novembre 2026** (aucun médiateur cité jusqu'à l'adhésion) ; contrat et factures : MEDICYS | E-2 | Les propriétaires (point 7) |
| Confidentialité | Conservation 5 ans, rien sur la carte ni sur Brevo | Voir le périmètre exclu ci-dessous | Juriste, Phase 6 |
| ~~Mentions légales~~ | ~~« Conception … avec l'aide d'une agence partenaire »~~ | **Retiré le 12 novembre 2026** (« c'est faux », gérant) | — |

---

## Périmètre EXCLU

Le paiement (Phases 3 et 4), le back-office (Phase 5), la synchronisation des
calendriers (Phase 7).

**Le mécanisme de caution** est arrêté (décision D-16) et sa phrase a déjà été
corrigée dans les CGV et la politique cookies le 9 octobre 2026. Il reste, au
point 8 ci-dessus, à **aligner l'ensemble des CGV et des mentions RGPD sur
l'article 6 et l'article 14 du contrat** : délai de mainlevée, conservation des
données de carte par Stripe, solde au choix du client, envoi des courriels par
Brevo. La politique de confidentialité annonce aujourd'hui une conservation de
5 ans et ne dit rien de la carte.

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
