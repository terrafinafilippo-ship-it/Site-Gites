# Phase 3 — Moteur de réservation

> Fiche à **compléter à l'ouverture de la phase** : décisions ouvertes et
> risques se construiront à ce moment-là, après lecture du code réel
> (`docs/05-protocole-phase.md`, étape 2). Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. Bloque la Phase 4.
**Prérequis à lever avant l'ouverture :** `docs/06-avant-premier-client.md`, point 9 (sauvegarde du volume des PDF).
**Volume estimé :** 2 à 3 sessions.

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
   la Phase 4 en dépend pour prélever le solde hors session.
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

- **Le solde et la caution** : prélèvement à J-30, empreinte à J-7, factures
  automatiques, tâches planifiées. C'est la Phase 4.
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
| `ReserverFunnel.tsx` (3 occurrences) | « Caution Swikly 500 € » | L'Armu : **400 €** |
| constante `BOOKING` | ménage 80 €, taxe 5,5 %, acompte 30 % | à lire en base / dans `lib/constantes.ts` |
| liens du récapitulatif | « L'Armu — couple, 2 pers. », « La Maison Vieille — 4 pers. + sauna » | `capacite_max` |

Aujourd'hui, la fiche de L'Armu affiche 400 € de caution et le tunnel 500 € : la
contradiction est visible par le même visiteur, sur deux pages qui se suivent.
Le site n'étant pas déployé, personne ne la voit encore — mais elle doit être
levée **avant** la mise en ligne, donc dans cette phase.

Le récapitulatif affiche par ailleurs `gite.profil` (« Couple ») là où il
affichait « Couple — 2 personnes » : la capacité viendra de la base, comme sur
les fiches.

