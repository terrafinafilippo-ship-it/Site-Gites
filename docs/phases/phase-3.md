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
