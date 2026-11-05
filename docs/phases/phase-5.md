# Phase 5 — Back-office Patricia et Nicolas

> **État au 4 novembre 2026 :** phase **ouverte** le 3 novembre ; **lot 1
> construit** (connexion et réglages, D-32). Lots 2 à 6 à faire. Le cadrage est
> en fin de fiche ; il prime sur le cadre initial là où ils diffèrent.

**Dépendances :** Phase 2 close. **Parallélisable** avec les phases 3 et 4 : ne
dépend que de la lecture en base, pas du paiement.

---

## Objectif

Rendre l'exploitation autonome. Toute valeur que Patricia et Nicolas ont besoin
de changer doit être un **champ de formulaire**, pas une constante dans un
fichier. Voir `docs/00-projet.md` § 5.

Le back-office statique `admin/` a été **supprimé en Phase 2** (commit
`e341c01`). Ses neuf maquettes restent lisibles dans l'historique et servent de
référence d'intention, pas de code à reprendre :

```bash
git show e341c01^:admin/tarifs.html
```

---

## Périmètre inclus

Une application Next.js protégée par **authentification** :

1. **Réservations** — liste, fiche, modification.
2. **Calendrier** des trois gîtes, avec blocage manuel de nuits. La table
   existe depuis la Phase 3 (lot 2, D-21) : fermer une nuit, c'est écrire une
   ligne `bloque` dans `disponibilites` ; une nuit sans ligne est libre.
3. **Tarifs.** Le modèle **existe depuis la Phase 3** (lot 1, décision D-17) :
   tarifs nommés et prix d'une nuit par gîte, périodes datées, barème de
   coefficients par rang de nuit, règles générales et exceptions par tarif et
   par période, réglages de taxe de séjour datés par gîte (D-18). La question
   « plancher ou base à coefficients » a reçu sa réponse au cadrage : un prix à
   la nuit, dégressif par barème. Reste à construire **les écrans** :
   - les tarifs et leur prix par gîte ;
   - le calendrier des périodes, qui doit **montrer les trous** (une nuit sans
     période n'est pas réservable) et refuser une période qui ne commence pas
     le jour attendu (`reglages.periodes_jour_debut`, samedi) ;
   - le barème général, et ceux propres à un tarif ou à une période ;
   - la règle générale et ses exceptions ;
   - les réglages de taxe de séjour, chaque délibération étant une nouvelle
     ligne datée.

   Tout enregistrement appelle `revalidateTag('gites')`. **La saisie des vrais
   tarifs est un point bloquant avant l'ouverture : point 11 de
   `docs/06-avant-premier-client.md`.**
4. **Fiches des gîtes** — les scalaires métier (voir l'architecture hybride de
   la fiche Phase 2).
5. **Documents** — retrouver et renvoyer contrats et factures.
6. **Bons cadeaux.**
7. **Libellé des options**, reporté depuis la Phase 1 : point 1 de
   `docs/06-avant-premier-client.md`. Ajouter le libellé en base **et**
   l'afficher dans les trois composants PDF et sur la page de signature — la
   moitié du travail ne lève pas le point.
8. **Cautions à décider** (décision D-16, mécanisme construit en Phase 4) : la
   liste des cautions bloquées, avec pour chacune l'échéance de libération
   automatique, et deux boutons :
   - **« Libérer »** — définitif : la carte est supprimée, plus aucun débit
     n'est possible. L'écran doit le dire avant le clic ;
   - **« Retenir »** — saisie du montant (au plus celui de la caution, une
     seule retenue possible) et dépôt des pièces justificatives (état des
     lieux, photographies, devis ou facture), qui partent au client avec le
     courriel récapitulatif.

   Ce point **dépend de la Phase 4** : sans elle, il n'y a rien à décider. Le
   reste de la phase reste parallélisable.
9. **Cautions par chèque ou virement** (décision D-19) : pour chaque
   réservation concernée, noter la caution reçue puis rendue ; une alerte quand
   un virement n'est pas arrivé 3 jours avant l'arrivée ; et un bouton
   **« Envoyer le lien de caution »** pour le client arrivé sans caution, qui
   donne alors sa carte sur la page « valider ma caution » de la Phase 4.
10. **Réglages des lots de la Phase 3** : durée du blocage des dates pendant le
    paiement, délai minimum avant l'arrivée, horaires d'arrivée et de départ,
    bébés (âge, nombre hors capacité, lits) — ces cinq-là existent en base
    depuis le lot 2 (`reglages`, migration 0004) — durée de validité du lien de
    suivi, coordonnées bancaires
    affichées pour le virement de caution, courriels aux propriétaires (types
    activés, destinataires), texte d'accord pour l'enregistrement de la carte
    (versions datées).

---

## Périmètre EXCLU

Les contenus publics et le légal (Phase 6), la synchronisation des calendriers
avec les plateformes (Phase 7), tout ce qui touche au paiement (Phases 3 et 4).

---

## Critères d'acceptation

1. **Patricia modifie un tarif sans toucher au code**, et la modification
   apparaît sur le site dans les 60 secondes — délai du cache de
   `lib/gites-publics.ts` (Phase 2, D-13). L'enregistrement devrait appeler
   `revalidateTag('gites')`, qui rend la modification visible **immédiatement**
   au lieu d'attendre l'expiration : l'étiquette est déjà posée.
2. Le back-office est inaccessible sans authentification — vérifié en appelant
   directement une URL d'administration.
3. Une option nommée en back-office apparaît sous son libellé réel sur le
   contrat, les deux factures et la page de signature.
4. `bash scripts/parcours/lancer.sh` passe toujours.

---

## Point de vigilance

`npm run db:seed` **remet les paramètres descriptifs des gîtes aux valeurs de
`db/seed.ts`** (nom, adresse, capacité, ménage, caution, tarifs, taux de taxe).
Une valeur modifiée en back-office sera **écrasée** au prochain seed si elle
n'est pas reportée dans le fichier. À traiter explicitement dans cette phase :
c'est un piège silencieux, et il vise précisément le geste que la phase rend
possible. Les tables de tarification, elles, ne sont **pas** touchées par le
seed.

---

## Deux points hérités de la Phase 2

**Le drapeau `actif` de la table `gites` n'a aucun effet sur le site.** Les trois
gîtes s'affichent qu'il soit vrai ou faux. Décider ce qu'il doit produire —
masquer la fiche, la laisser visible mais non réservable, la retirer du
formulaire de contact — est un choix commercial, à trancher ici avec les
propriétaires. Tant qu'il ne fait rien, personne ne doit croire qu'il retire un
gîte de la vente.

**Le nom et la référence Gîtes de France vivent à deux endroits**, en base et
dans `lib/data/gites.ts`. C'est volontaire : ce sont eux qui permettent
d'afficher une fiche quand la base ne répond pas. `lib/gites-publics.ts`
journalise une ligne `INCOHÉRENCE` si les valeurs divergent. Si le back-office
rend ces champs modifiables, il faudra reporter la modification dans le code —
ou décider que la fiche dégradée n'affiche plus de nom.

---

## Cadrage du 3 novembre 2026

Réponses du gérant, sur l'exemple de Camille (L'Armu, du 20 au 27 mars 2027,
contrat signé, facture d'acompte émise).

| # | Question | Réponse |
|---|---|---|
| 1 | Ordre des lots | **A** : connexion et réglages d'abord |
| 2 | Connexion | **C** : mot de passe, plus un code par courriel sur un appareil inconnu |
| 3 | Comptes | **Un seul compte, partagé** ; le journal est gardé (invisible) |
| 4 | Adresse | **A** : `/gestion`, français, non indexé |
| 5 | Modifier une réservation | **A** : seulement ce qui n'est pas sur un document émis (téléphone, courriel, note interne) ; dates ou prix : annuler et refaire |
| 6 | Annulation | **A** : construite dans cette phase, lot à part, après la réponse du comptable sur l'avoir ; point à ajouter à la liste avant le premier client |
| 7 | Retenue de caution | **A** : justificatifs en pièces jointes (10 Mo au plus), gardés sur le serveur ; facture ou non : question au comptable |
| 8 | Options | **Rien n'est vendu aujourd'hui** ; une session dédiée le jour où ce sera le cas |
| 9 | Bons cadeaux | **A** : reportés après l'ouverture |
| 10 | Gîte fermé (travaux) | **On bloque les nuits des travaux dans le calendrier**, d'un geste, du premier au dernier jour ; les dates suivantes restent réservables, un retard se gère à la main. L'interrupteur « ouvert à la vente » n'est pas proposé |
| 11 | Le seed | **A** : `db:seed` ne crée que les gîtes absents, ne touche jamais un gîte existant |
| 12 | Fiche d'un gîte | **A** : capacité, ménage, caution, équipements, téléphone d'arrivée, spa ; nom et référence GdF fixes ; textes et photos en Phase 6 |
| 13 | Réservation par téléphone | **A** : bloquer les nuits, puis envoyer réserver en ligne |
| 14 | Solde payé autrement | **A** : un bouton « solde reçu par virement ou chèque », qui émet la facture de solde |
| 15 | Accueil | **A**, plus une **page de statistiques à part** |
| S | Statistiques | **Toutes** : nuits louées par gîte et par mois ; encaissé par mois et par gîte (hors taxe) ; taxe de séjour sur une période ; nombre, durée moyenne, délai de réservation ; provenance ; cautions retenues ; commissions évitées (un seul taux, en réglage) |
| D | Durées de connexion | 30 jours **glissants** depuis la dernière connexion ; 8 heures d'inactivité |
| V | Alerte quand le compte de virement change | **Oui** |
| P | Conditions du contrat en réglage | **A** : affichées, pas modifiables |
| T | Texte d'accord | **A** : affiché avec ses versions, pas modifiable |
| E | Limites | 5 échecs puis 15 minutes ; code de 6 chiffres, 10 minutes ; lien 1 heure, une fois |

**Ce que le cadrage change au cadre initial :**
- point 6 (bons cadeaux) : **reporté** ;
- point 7 (libellé des options) : **sans objet** tant que rien n'est vendu — la
  ligne « Options » ne s'imprime que si elle vaut plus de 0 €, le tunnel écrit
  toujours 0 et le back-office n'en propose pas ; le parcours garde sa
  réservation d'essai à 25,50 € pour le jour où ;
- point 9 : l'alerte « virement pas arrivé » existe depuis la Phase 4 (lot 3) ;
- le drapeau `actif` refuse déjà la réservation en ligne (`lib/tunnel.ts`) ; il
  n'est pas exposé (réponse 10) ;
- **ajout** : l'annulation par les propriétaires, le remboursement et l'avoir
  (réponse 6), absents de toutes les phases.

**Les lots :**

| Lot | Contenu | État |
|---|---|---|
| 1 | Connexion (D-32) et réglages | **construit le 4 novembre 2026** |
| 2 | Réservations, cautions (libérer, retenir, chèque et virement reçus et rendus, lien de caution), solde reçu autrement, accueil « à traiter » | à faire |
| 3 | Tarifs (lève le point 11) | à faire |
| 4 | Calendrier (blocage par période), fiches des gîtes, documents, seed « création seule » | à faire |
| 5 | Annulation et avoir | après la réponse du comptable |
| 6 | Statistiques | à faire |

**Questions au comptable** (le lot 5 en dépend) :
1. quand un client annule et que sa facture d'acompte est déjà émise, quelle
   forme doit avoir l'avoir (montant, mentions, suite de numéros à part ou
   commune) ?
2. une retenue sur la caution donne-t-elle lieu à une facture ?
