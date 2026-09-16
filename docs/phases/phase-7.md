# Phase 7 — Synchronisation iCal V1, recette, go-live

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

**Dépendances :** toutes les autres phases closes. C'est la dernière.

---

## Objectif

Éviter le surbooking entre le site et les plateformes, éprouver l'ensemble, puis
mettre en ligne.

---

## Périmètre inclus

1. **Export iCal** des réservations vers les plateformes — un calendrier au
   format standard, que Gîtes de France, Airbnb et les autres importent pour
   bloquer les nuits vendues en direct.
2. **Import iCal** des réservations venues des plateformes, **avec relecture au
   moment du paiement**. C'est le point critique : les plateformes rafraîchissent
   leur import toutes les quelques heures, donc une nuit vendue ailleurs peut
   apparaître libre chez nous pendant ce délai. Relire les disponibilités juste
   avant l'encaissement réduit la fenêtre à quelques secondes — **elle ne la
   supprime pas**, et le comportement en cas de collision doit être décidé
   explicitement.
   La table `disponibilites` prévoit déjà la colonne `source`
   (`directe`, `airbnb`, `booking`, `gdf`).
3. **Recette complète** : rejouer tous les parcours, sur toutes les phases.
4. **DNS** et **mise en production**.
5. Vérification finale de `docs/06-avant-premier-client.md` : **les huit points
   doivent être levés.**

---

## Périmètre EXCLU

**Beds24** reste en V2 — voir `docs/02-decisions.md`, D-12. Ne pas l'introduire
ici, même si la latence iCal se révèle gênante pendant la recette : ce serait
une décision structurante prise sous pression de calendrier.

---

## Critères d'acceptation

1. Une réservation prise en direct bloque la nuit **chez les plateformes** ; une
   réservation prise sur une plateforme bloque la nuit **sur le site**.
2. Une tentative de paiement sur une nuit devenue indisponible entre la
   sélection et le paiement est **refusée proprement**, avec un message qui
   explique.
3. La recette complète passe, `docs/06-avant-premier-client.md` ne contient plus
   aucun point ouvert, et la documentation reflète l'état réel.
