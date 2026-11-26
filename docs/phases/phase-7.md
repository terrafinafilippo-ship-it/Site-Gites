# Phase 7 — Synchronisation iCal V1, recette, go-live

> **Ouverte le 26 novembre 2026.** Cadrage et premier lot (synchronisation
> des calendriers) le même jour : D-44.

**Dépendances :** toutes les autres phases closes. C'est la dernière. Ouverte
avant la clôture de la Phase 6 (choix 0 A du gérant, D-44) : elle n'attend
plus que la relecture de l'anglais et le médiateur, que le calendrier ne
touche pas. La recette et la mise en ligne, elles, attendent la Phase 6.

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

   **Points 1 et 2 construits le 26 novembre 2026 (D-44, migration 0025)** :
   un lien du site par gîte et par plateforme ; lecture des plateformes toutes
   les 15 minutes, à l'arrivée sur l'écran de paiement et quand un lien est
   collé ; doublon signalé, jamais réglé par le site ; client prévenu avant de
   payer (délai réglé, 24 heures). Contrôle : `verify:synchronisation`.

   **Mise en service** (gérant, après la migration 0025 sur la base réelle) :
   pour chaque gîte, coller dans le back-office le lien de calendrier de
   chaque plateforme, et dans chaque plateforme le lien du site qui lui est
   destiné ; régler le séjour minimum propre à chaque plateforme dans la
   plateforme ; sur Airbnb, laisser le calendrier ouvert le plus loin possible.

   **À vérifier en recette, avec les vrais liens** (D-44, « ce qui pourrait
   mal tourner ») : une réservation du site bloque bien la nuit sur chaque
   plateforme, et dans quel délai (pour ajuster le réglage de 24 heures) ;
   aucune plateforme ne renvoie les nuits reçues du site (sinon, faux
   doublons) ; les réglages d'Airbnb ne ferment pas de dates sur le site.
3. **Recette complète** : rejouer tous les parcours, sur toutes les phases.
4. **DNS** et **mise en production**. `NEXT_PUBLIC_SITE_URL` doit être réglée
   **avant le build** : le plan du site, les aperçus de partage et les données
   structurées s'y construisent (D-39) ; absente, le plan du site sort vide et
   le build le signale.

   **Rediriger les adresses de l'ancien site.** Le site en ligne sur
   gitesdesamoyas.fr est l'**ancien site statique**, avec ses propres adresses.
   Le remplacer sans rien faire transforme chacune d'elles en 404 : liens
   partagés, favoris, résultats de recherche, et le référencement acquis depuis
   2018 avec.

   La liste se relève **sur le site réel** — plan du site, Search Console,
   journaux du serveur — et **pas** sur les fichiers `.html` supprimés en Phase 2
   (commit `e341c01`) : personne ne sait de quoi le site en ligne est fait
   aujourd'hui. Chaque adresse relevée reçoit une redirection **301** vers son
   équivalent (`next.config.ts`, où deux redirections existent déjà, voir D-14).

   Contrôle : après bascule, aucune adresse de la liste ne doit répondre 404.

   **Relevé du 9 novembre 2026** (lecture seule, en suivant les liens depuis
   l'accueil). L'ancien site est un petit site PHP de sept adresses ; la liste
   et ses redirections vivent dans `next.config.ts`. L'accueil (`/`) reste
   l'accueil ; les six autres sont redirigées : `/index.php`, `/gites.html`, `/activites.php`, `/contact.html` vers leur
   équivalent, et le 11 novembre `/bon.html` et `/images/amour.pdf` (bons
   cadeaux, reportés) vers la page Contact. Les options vendues par l'ancien
   site (apéritif dînatoire…) ne sont pas reprises (gérant, 11 novembre). Reste
   à croiser avec la Search Console, qui peut connaître des pages que plus
   aucun lien ne montre.
5. Vérification finale de `docs/06-avant-premier-client.md` : **les dix points
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
