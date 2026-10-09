# Phase 3 — Moteur de réservation

> Fiche à **compléter à l'ouverture de la phase** : décisions ouvertes et
> risques se construiront à ce moment-là, après lecture du code réel
> (`docs/05-protocole-phase.md`, étape 2). Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. Bloque la Phase 4.
**Prérequis à lever avant l'ouverture :** `docs/06-avant-premier-client.md`, point 9 (sauvegarde du volume des PDF) — **tranché le 24 septembre 2026, voir ci-dessous**.
**Volume estimé :** 2 à 3 sessions.

> **Point 9 tranché à l'ouverture (24 septembre 2026) : échéance décalée au
> déploiement effectif.** La Phase 3 va produire des PDF sans sauvegarde de
> volume tant que le déploiement n'a pas eu lieu — sans conséquence tant
> qu'aucun client réel ne signe, intenable dès qu'il y en a un. Le point reste
> ouvert dans `docs/06-avant-premier-client.md`, point 9, à lever impérativement
> avant ou au moment du déploiement, pas après. Ce qui est en jeu : un contrat
> signé est une **preuve**, et une preuve sans sauvegarde disparaît avec le
> premier incident de volume.

---

## Objectif

Le tunnel de réservation **existe déjà visuellement** :
`app/reserver/ReserverFunnel.tsx`, environ 910 lignes, quatre étapes, machine à
états, récapitulatif latéral. **Il n'est branché sur rien.** Le paiement est
simulé par un `setTimeout` de 1,5 seconde suivi d'un second de 1,8 seconde qui
affiche un faux écran 3-D Secure, puis bascule sur la page de succès.

Cette phase le branche sur la réalité : disponibilités, paiement, base,
documents, courriel.

---

## Périmètre inclus

1. **Vérification de disponibilité en base** (table `disponibilites`, une ligne
   par gîte et par nuit).
2. **Verrou temporaire avec expiration** pendant le paiement — le statut
   `verrou` et la colonne `verrou_expire_at` existent déjà dans le schéma.
   Il empêche deux clients de payer le même créneau simultanément, et se libère
   seul si le paiement n'aboutit pas.
3. **Stripe réel** pour l'acompte de 30 %, **avec enregistrement de la carte** :
   la Phase 4 en dépend pour la caution et, si le client l'a choisi, pour le
   solde. Détail dans la section « Carte enregistrée, solde au choix » plus bas.
4. **Création de la ligne `reservations`** au bon statut, avec sa référence
   publique.
5. **Courriel de confirmation** portant le **lien de signature** du contrat.
6. **Page de suivi réelle** — `app/suivi/[ref]/page.tsx` affiche aujourd'hui un
   séjour entièrement fictif, avec une référence de démonstration figée.

Cette phase est aussi celle où les tables provisoires `paiements`,
`disponibilites` et `audit_logs` prennent leur forme définitive, et où la
séparation des rôles PostgreSQL (lecture seule pour le vitrine) était à décider.

---

## Périmètre EXCLU

- **Le solde et la caution** : règlement du solde à J-30, préautorisation de
  caution la veille du départ, factures automatiques, tâches planifiées. C'est
  la Phase 4.
- **Tout back-office** (Phase 5) et **la synchronisation des calendriers avec
  les plateformes** (Phase 7).
- **Le libellé des options** (Phase 5) et **l'habillage de la page de signature**
  (Phase 6).

---

## Critères d'acceptation

1. **Une réservation de test complète**, de la sélection des dates au contrat
   signé reçu par courriel, avec une **carte de test Stripe**.
2. Deux tentatives simultanées sur le même créneau : la seconde est refusée, et
   le verrou de la première se libère seul si son paiement n'aboutit pas.
3. `bash scripts/parcours/lancer.sh` passe toujours : aucun montant n'a bougé.

---

## Hérité de la Phase 2 — à traiter dans cette phase

### 1. Le tunnel ne doit JAMAIS dégrader en silence

La Phase 2 a décidé qu'une base injoignable **masque les chiffres** des pages
publiques au lieu de produire une erreur 500 (D-13). **Cette règle s'arrête à la
porte du tunnel.**

> Afficher un gîte sans prix est acceptable ; laisser réserver sans prix ne
> l'est pas.

Concrètement : si les tarifs, le forfait ménage, la caution ou le taux de taxe
de séjour ne sont pas lisibles en base, le tunnel **refuse d'engager** le client
et le dit — il ne poursuit pas avec une valeur de repli, une valeur par défaut ou
un montant partiel. Une réservation prise sur un prix faux se répare par un
avoir et une conversation pénible ; une page qui dit « réservation
momentanément indisponible, appelez-nous » ne coûte qu'un appel.

### 2. Un `?gite=` inconnu réserve LaPhine en silence

`app/reserver/page.tsx` : un slug absent ou périmé retombe sur `GITES.laphine`
sans rien signaler. Le client croit réserver L'Armu et engage LaPhine. Il faut
une **erreur explicite** (404, ou retour à la liste des gîtes), pas un repli.

Le risque est réel depuis la Phase 2 : les slugs ont changé (`larmu` →
`armu`, D-14). Les redirections 301 couvrent `/gites/larmu`, **pas**
`/reserver?gite=larmu`.

### 3. Les chiffres du tunnel sont encore écrits en dur

`app/reserver/ReserverFunnel.tsx` porte des valeurs de démonstration qui ne
viennent pas de la base — et qui, depuis la Phase 2, **contredisent visiblement
les fiches gîtes** :

| Endroit | Valeur en dur | Réalité en base |
|---|---|---|
| constante `BOOKING` | ménage 80 €, taxe 5,5 %, acompte 30 % | à lire en base / dans `lib/constantes.ts` |
| liens du récapitulatif | « L'Armu — couple, 2 pers. », « La Maison Vieille — 4 pers. + sauna » | `capacite_max` |

**La caution n'est plus dans cette liste** : depuis le 9 octobre 2026, le tunnel
reçoit le montant lu en base (`app/reserver/page.tsx` → `cautionCentimes`) et
n'écrit plus « 500 € ». Si la base ne répond pas, il décrit le mécanisme sans
chiffre — ce qui reste à remplacer par un **refus d'engager** (point 1
ci-dessus) quand le tunnel sera réellement branché. La page de suivi, elle,
affiche encore un séjour fictif : sa phrase de caution ne porte plus de montant,
et affichera celui de la réservation quand la page sera construite.

Le récapitulatif affiche par ailleurs `gite.profil` (« Couple ») là où il
affichait « Couple — 2 personnes » : la capacité viendra de la base, comme sur
les fiches.


---

## Carte enregistrée, solde au choix — ce que la caution impose à cette phase

Décision **D-16** (`docs/02-decisions.md`) : la caution est une préautorisation
Stripe faite la veille du départ sur la carte de l'acompte. Le mécanisme se
développe en Phase 4, mais **quatre choses doivent exister dès l'acompte**,
sinon la Phase 4 n'a pas de carte sur laquelle agir.

1. **Un Customer Stripe par réservation**, et le PaymentIntent de l'acompte créé
   avec `setup_future_usage: 'off_session'`. C'est **un seul** enregistrement de
   carte, pour la caution et pour le solde : ne pas en créer deux.
2. **Le stockage des deux identifiants Stripe** : `stripe_customer_id` et
   `stripe_payment_method_id` (jamais un numéro de carte). Ils demandent une
   **nouvelle migration** dans cette phase. Leur emplacement — colonnes de
   `reservations` ou table `paiements`, qui prend sa forme définitive ici — se
   tranche au moment de l'écrire.
3. **Le choix du mode de règlement du solde**, exprimé par le client dans le
   tunnel : prélèvement automatique à J-30, ou paiement par lui-même via un
   lien. Le contrat le prévoit (article 5.1). Ce choix se **stocke** sur la
   réservation : la Phase 4 le lit pour savoir quoi faire à J-30.
4. **Une phrase d'information sous le formulaire de carte**, qui dit au client
   que sa carte est conservée, pour quoi et jusqu'à quand. **Son texte vient
   des propriétaires**, pas d'une session (règle 3 du protocole) : c'est lui qui
   vaut accord pour les opérations hors session.

### Phrases du site devenues inexactes avec le solde au choix

Elles affirment toutes que le solde est **prélevé automatiquement**, ce qui
n'est plus vrai pour un client qui choisit de payer lui-même. À réécrire quand
l'écran de choix existera :

| Endroit | Phrase |
|---|---|
| `ReserverFunnel.tsx`, récapitulatif latéral | « Solde de … prélevé J-30 » |
| `ReserverFunnel.tsx`, étape 3 | « Le solde sera prélevé J-30 sur la même carte. » |
| `ReserverFunnel.tsx`, étape 4 | « le solde J-30 sera prélevé sur la même carte » |
| `ReserverFunnel.tsx`, écran de succès | « Prélèvement automatique du solde sur la carte utilisée aujourd'hui » |
| `app/suivi/[ref]/page.tsx` | « prélevés automatiquement sur la même carte » |
| `lib/data/legal.ts`, CGV § 02 | « Le solde du séjour est prélevé automatiquement à J-30 » — Phase 6 |
