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
2. **Système d'avis** — la table `avis` existe en version provisoire. Les notes
   et nombres d'avis affichés aujourd'hui (`lib/data/gites.ts`) n'ont **aucune
   source vérifiable** : leur origine est à établir avant publication
   (`docs/00-projet.md` § 2).
3. **Habillage graphique de la page de signature**, reporté depuis la Phase 1.
4. **L'anglais** (D-22, point 13) : le site existe en anglais depuis le
   16 octobre 2026, traduit par une session. Relecture par les propriétaires ;
   réponse du juriste sur des CGV disponibles en français seulement ;
   traductions juridiques s'il les demande.

### Légal — les trois points bloquants
5. **Identité du bailleur** (point 6) : question au **comptable**, dans ses trois
   volets — qui exploite, comment les revenus sont déclarés, l'exonération de TVA
   de l'art. 261 D 4° CGI tient-elle. Puis alignement des mentions légales, des
   CGV, du contrat, des deux factures et de `lib/constantes.ts`. Traiter au
   passage l'**écart E-7** (`EMETTEUR` et `MENTIONS` déclarés mais jamais
   importés : les PDF recopient leurs valeurs).
6. **Médiateur de la consommation** (point 7) : question aux **propriétaires** —
   existe-t-il une adhésion en cours, à qui. Puis un seul organisme partout.
7. **Article 12 du contrat — règles sauna** (point 8). Ce n'est **pas** une
   décision ouverte : le principe est arrêté (spa interdit aux moins de 6 ans,
   sauna aux moins de 12 ans). Il manque l'écriture, et une décision technique
   sur le déclenchement de la section (colonne `a_sauna` ou lecture du texte
   libre `equipements_specifiques`).

### Légal — le reste
8. **Mentions légales LCEN, CGV, RGPD et cookies** : les textes existent
   (`lib/data/legal.ts`) mais datent de l'ancien site et contredisent les
   documents contractuels. À reprendre après la réponse du point 5.
9. **Médiation de la consommation** affichée conformément à l'art. L.612-1
   C. conso.

### SEO
10. Balises, métadonnées, données structurées. Les balises hreflang des deux
    langues existent déjà (`lib/i18n/metadonnees.ts`) ; elles donnent des
    adresses relatives tant que `NEXT_PUBLIC_SITE_URL` n'est pas réglée.

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
