# Phase 4 — Cycle de paiement complet

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

**Dépendances :** Phase 3 close — sans acompte réel, il n'y a pas de carte
enregistrée sur laquelle prélever le solde.

---

## Objectif

Mener un séjour de bout en bout sans intervention manuelle : acompte à la
réservation (Phase 3), **solde à J-30**, **caution à J-7**, factures émises
automatiquement.

---

## Périmètre inclus

1. **Solde prélevé à J-30, hors session**, sur la carte enregistrée lors de
   l'acompte. *Hors session* : le client n'est pas devant son écran, donc le
   prélèvement doit avoir été autorisé à l'avance et le cas d'échec (carte
   expirée, refus) doit être traité.
2. **Pré-autorisation de caution Swikly à J-7** — sous réserve de l'arbitrage du
   point 3 de `docs/06-avant-premier-client.md` : soit Swikly est mis en service
   ici, soit il est retiré des **dix emplacements recensés** et le mécanisme réellement
   appliqué est décrit. **Cet arbitrage est un préalable à la phase, pas un
   livrable de la phase.**
3. **Émission automatique des factures** — la facture de solde en particulier,
   dont la garde du cas B (réservation modifiée depuis l'acompte → `409`) est
   déjà implémentée et testée.
4. **Tâches planifiées** : le mécanisme qui déclenche J-30 et J-7 sans qu'un
   humain y pense.
5. **Passage de la base en configuration de production** — point 4 de
   `docs/06-avant-premier-client.md`, avec sa liste.

---

## Périmètre EXCLU

Le back-office (Phase 5), les contenus et le légal (Phase 6), la synchronisation
des calendriers (Phase 7).

---

## Critères d'acceptation

1. **Un cycle complet simulé sur des dates rapprochées** : acompte, solde à J-30,
   caution à J-7, les deux factures émises avec des numéros continus.
2. Un prélèvement de solde refusé produit un état exploitable — pas un silence.
3. Le point de contrôle Swikly est tranché et appliqué **partout**, documents et
   pages comprises.
4. `bash scripts/parcours/lancer.sh` passe toujours.
