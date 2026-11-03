# Phase 4 — Cycle de paiement complet

**État :** ouverte le 1er novembre 2026. **Lot 1 (le réveil, le solde, les
factures) livré le 1er novembre 2026** (D-28, D-29). **Lot 2 (la caution par
carte) livré le 2 novembre 2026** (D-30). **Lot 3 (chèque et virement,
tentatives abandonnées, vérification de la base réelle) livré le 3 novembre
2026** (D-31). Bilans : `docs/journal-phases.md`. Reste, avant la clôture :
lancer `verify:production` sur la base réelle avec le gérant (tunnel ouvert
par lui), puis il applique les migrations 0002 à 0011.

**Dépendances :** Phase 3 close — sans acompte réel, il n'y a pas de carte
enregistrée sur laquelle agir.

> **PRÉREQUIS BLOQUANTS — avant tout développement de la caution.**
>
> Deux confirmations **écrites** du support Stripe, à obtenir par les
> propriétaires :
>
> 1. Une préautorisation à capture manuelle, hors session, sur carte
>    enregistrée, est-elle autorisée pour une caution de location saisonnière ?
> 2. Une préautorisation annulée est-elle gratuite ?
>
> Si la première réponse est non, la décision D-16 est à revoir **avant**
> d'écrire une ligne : le contrat et le site décrivent déjà ce mécanisme.
>
> **Réponses obtenues le 9 octobre 2026 (oui aux deux)** — détail et trace
> écrite restant à conserver : point 3 de `docs/06-avant-premier-client.md`.

---

## Objectif

Mener un séjour de bout en bout sans intervention manuelle : acompte à la
réservation (Phase 3), **solde à J-30**, **caution la veille du départ**,
factures émises automatiquement.

Le mécanisme de caution, ses paramètres et les alternatives écartées sont dans
`docs/02-decisions.md`, **D-16** : cette fiche n'en recopie rien, elle liste ce
qu'il y a à construire.

> **Décisions du cadrage de la Phase 3 qui touchent cette phase** (13 octobre
> 2026) :
> - **D-19** : la caution est au choix du client — carte (D-16), chèque ou
>   virement. Un client sans carte enregistrée règle son solde par lien ; le
>   circuit du virement (réception attendue 3 jours avant l'arrivée,
>   restitution par virement sous 3 jours) et la page « valider ma caution »
>   pour le client arrivé sans caution relèvent de cette phase.
> - **D-20** : une réservation faite à moins de 30 jours de l'arrivée est payée
>   en totalité. Il n'y a alors pas de solde : la tâche de J-30 doit l'ignorer,
>   et **le comptable doit dire quelle facture on émet** pour un paiement
>   intégral.

---

## Cadrage du 1er novembre 2026

Réponses du gérant (exemple : Camille arrive le samedi 20 mars 2027, solde de
700 € au plus tard le 18 février, caution de 500 €) :

1. **Préavis du prélèvement** 7 jours avant la date limite, puis reçu (la
   facture) — A.
2. **Prélèvement refusé** : lien au client et alerte aux propriétaires tout de
   suite, seconde alerte 3 jours après ; mise en demeure et résiliation restent
   leur décision — A.
3. **Solde par lien** : lien 7 jours avant, rappel la veille, impayé le
   lendemain de la date limite — A.
4. **Factures** créées au paiement et envoyées en PDF — A. **Séjour payé en une
   fois : une facture unique, le jour du paiement** — réponse (a), à confirmer
   par le comptable.
5. **Retenir une partie de la caution avant l'écran de gestion** : sans objet.
   Le site ne sera pas en ligne avant la fin du travail ; la retenue arrive
   avec le back-office (Phase 5), avant la mise en ligne. Le lot 2 construit le
   blocage et la libération automatique.
6. **Caution par virement** : courriel 10 jours avant la date limite (elle-même
   3 jours avant l'arrivée : le 17 mars pour Camille, courriel le 7 mars) avec
   les coordonnées bancaires des propriétaires et la demande du RIB du client ;
   alerte « vérifiez que le virement est arrivé » à la date limite. Chèque :
   rien d'automatique — A.
7. **Le réveil** : tâche programmée de Coolify toutes les 15 minutes — A.
8. **Effacement des réservations abandonnées** construit, durée en réglage ;
   vide, rien n'est effacé tant que le juriste n'a pas répondu — A.

Choix annoncés sans objection (pour le lot 2) : la caution est enregistrée dans
`paiements` (type `caution`) ; son montant est recopié sur la réservation au
moment de la réservation ; `CAUTION_DEFAUT` n'est plus jamais utilisé (montant
manquant → alerte, rien n'est bloqué).

**Découpage :** lot 1 — le réveil, le solde, les factures ; lot 2 — la caution
par carte ; lot 3 — chèque et virement, réservations abandonnées, base en
production.

## Cadrage du lot 2, 2 novembre 2026

Réponses du gérant (exemple : Camille quitte L'Armu le samedi 27 mars 2027,
caution de 500 € ; préautorisation le vendredi 26 à 18 h, alerte le lundi 29,
levée le mardi 30 au matin) :

1. **Préautorisation refusée** : courriel tout de suite au client avec un lien
   pour la valider, alerte « À TRAITER » aux propriétaires, pas de nouvel
   essai automatique — A.
2. **Validation** sur « Ma réservation », bloc « Votre caution » — A.
3. **Alerte le lundi à 8 h, levée le mardi à 8 h**, heures en réglages — A.
4. **Article 6.6** : le lien et la page construits maintenant ; le bouton
   « envoyer le lien au client » avec l'écran de gestion (Phase 5) — A.
5. **Un court message de validation** aux propriétaires quand la caution est
   bloquée.

Le détail de ce qui est construit : D-30. Les **états** de la caution
(point 9 ci-dessous) sont ceux de `paiements` : `bloque`, `echoue`, `libere`
(expirée comprise), `retenu`, `annule` ; « carte enregistrée » se lit sur la
réservation.

## Cadrage du lot 3, 2 novembre 2026

Réponses du gérant (exemple : Camille, L'Armu, arrivée le samedi 20 mars
2027, départ le samedi 27 mars, caution de 500 € par virement, date limite le
mercredi 17 mars) :

1. **Le compte** qui reçoit le virement : celui de la SARL DE LA VOUTE, saisi
   par le gérant dans les réglages — A.
2. **Le RIB du client**, pour la restitution : il répond au courriel avec son
   RIB ; le site ne stocke rien — A.
3. **Virement trop tard** : le tunnel ne le propose plus une fois sa date
   limite passée — A.
4. **Les coordonnées** : courriel le dimanche 7 mars, et affichées sur « Ma
   réservation » du 7 au 17 mars — C. **DMARC** du domaine en « quarantaine »
   avant l'ouverture — A (point 15 de `docs/06-avant-premier-client.md`).
5. **« Vérifiez le virement »** : alerte le jeudi 18 mars à 8 h, le lendemain
   de la date limite — C. Le gérant précise que c'est un rappel : si rien
   n'est arrivé le 18, on peut vérifier à nouveau le 19. (Le cadrage du 1er
   novembre disait « à la date limite » : remplacé par cette réponse.)
6. **« Rendez la caution »** : alerte le lundi 29 mars à 8 h — A.
7. **Séjour sans caution par carte** (chèque, virement) : « terminé » le mardi
   30 mars à 8 h — A.
8. **Tentatives abandonnées** : fiche client Stripe supprimée aussi (a) ; trace
   `audit_logs` avec la référence seulement (b) ; durée en jours, vide = rien
   n'est effacé (c) — A, A, A. Si la fiche Stripe ne peut pas être supprimée,
   l'effacement se fait quand même et l'échec est journalisé.
9. **Le jour du courriel** (10 jours avant la date limite) : un réglage — oui.
10. **Séparation des rôles de la base** : reportée (« pour l'instant une seule
    clé, quand tout sera fini on s'occupera de ça »).
11. **La base réelle** : le gérant ouvre le tunnel et m'autorise à la **lire**
    (`verify:production`) ; il applique lui-même les migrations — B.
12. **Pas de déploiement** dans ce lot — A.

Texte ajouté à la validation du 3 novembre : la mise en garde contre les faux
RIB dans le courriel des coordonnées. Le détail de ce qui est construit : D-31.

---

## Périmètre inclus

### Le solde

1. **Solde à J-30, selon le choix fait par le client à la réservation**
   (stocké en Phase 3) :
   - *prélèvement automatique* : hors session, sur la carte enregistrée. Le
     client n'est pas devant son écran, donc le cas d'échec (carte expirée,
     refus, authentification exigée) doit produire un état exploitable et un
     lien de paiement ;
   - *paiement par le client* : courriel avec un lien de paiement, relances, et
     application de l'article 5.3 du contrat si le solde n'arrive pas.
2. **Émission automatique des factures** — la facture de solde en particulier,
   dont la garde du cas B (réservation modifiée depuis l'acompte → `409`) est
   déjà implémentée et testée.

### La caution (D-16)

3. **Tâche planifiée la veille du départ, vers 18 h (heure de Paris)** :
   création de la préautorisation, lecture de la date d'expiration réelle sur la
   charge (`latest_charge.payment_method_details.card.capture_before`) et
   stockage de cette date. Courriel au client le jour même.
4. **Page « valider ma caution »**, atteinte par un lien envoyé au client quand
   la préautorisation est refusée ou exige une authentification : il y donne
   une autre carte ou confirme son 3D Secure. Alerte immédiate aux
   propriétaires dans les deux cas.
5. **Libération automatique au troisième jour après le départ** si aucune
   décision n'a été prise, précédée d'une **alerte aux propriétaires la
   veille**. Attention à l'heure : pour une carte Visa, la préautorisation
   expire vers midi ce jour-là. Une retenue se décide donc **avant**, et la
   tâche de libération doit passer le matin.
6. **Suppression de la carte** (`paymentMethods.detach`) dès la libération ou la
   retenue, et au plus tard 7 jours après le départ. À prévoir aussi quand une
   réservation est annulée avant le séjour.
7. **Courriels** (Brevo) : caution mise en attente ; caution libérée ; caution
   retenue, avec le montant et les justificatifs ; échec de préautorisation.
8. **Webhooks Stripe** : `payment_intent.amount_capturable_updated`,
   `payment_intent.payment_failed`, `payment_intent.canceled`,
   `payment_intent.succeeded`, `charge.dispute.created`.
9. **Migration du modèle de données.** Les deux identifiants Stripe existent
   depuis la Phase 3. Restent à créer : l'identifiant de la préautorisation, le
   montant de caution **figé à la réservation**, son état (`carte_enregistree`,
   `bloquee`, `echec`, `liberee`, `retenue`, `expiree`), sa date d'expiration
   (`timestamptz`) et le montant retenu. Montants en `numeric(10,2)`, manipulés
   en centimes entiers par `lib/centimes.ts`.

### Le reste

10. **Tâches planifiées** : le mécanisme qui déclenche J-30, la veille du départ
    et le troisième jour après, sans qu'un humain y pense. Il porte aussi
    l'**effacement des tentatives de réservation abandonnées** (« en attente de
    paiement », blocage expiré depuis plus que la durée fixée par le juriste) :
    point 12 de `docs/06-avant-premier-client.md`, décision D-21.
11. **Passage de la base en configuration de production** — point 4 de
    `docs/06-avant-premier-client.md`, avec sa liste.

---

## Décisions ouvertes, à trancher à l'ouverture

> Tranchées au cadrage du 1er novembre 2026 (ci-dessus) : la caution dans
> `paiements`, le montant figé à la réservation, plus de `CAUTION_DEFAUT`.

- **Où vivent les données de caution** : colonnes de `reservations`, ou lignes
  de la table `paiements`, qui porte déjà un type `caution` ? Ne pas créer deux
  endroits pour le même fait.
- **D'où vient le montant bloqué.** Le contrat imprime `gites.caution` au moment
  où il est généré. Si les propriétaires changent ce montant en back-office
  entre la signature et le départ, la préautorisation doit porter **le montant
  du contrat signé**, pas la valeur du jour : d'où le montant figé du point 9.
- **Le sort de `CAUTION_DEFAUT`** (`lib/constantes.ts`) : aujourd'hui, un contrat
  sortirait à 500 € sans rien signaler si la valeur manquait en base. Un repli
  silencieux n'a pas sa place sur un montant qu'on bloque sur une carte.

---

## Ce que « Libérer » veut dire

**« Libérer » est définitif.** La carte est supprimée aussitôt : aucun débit
n'est possible ensuite, même pour un dégât découvert le lendemain. C'est voulu
(D-16) et c'est ce que dit l'article 6.5 du contrat. La conséquence pratique
pour les propriétaires — ne pas libérer avant d'avoir fait le tour du gîte —
doit apparaître sur l'écran du back-office (Phase 5).

---

## Périmètre EXCLU

Le back-office (Phase 5) — y compris les boutons « Libérer » et « Retenir » —,
les contenus et le légal (Phase 6), la synchronisation des calendriers
(Phase 7).

---

## Critères d'acceptation

1. **Un cycle complet simulé sur des dates rapprochées** : acompte, solde à J-30
   dans ses deux modes, caution la veille du départ, les deux factures émises
   avec des numéros continus.
2. Un prélèvement de solde refusé produit un état exploitable — pas un silence.
3. **Caution, en mode test, avec trois cartes** : une carte normale, la carte
   `4000 0027 6000 3184` (3D Secure toujours exigé) et une carte refusée. Pour
   chacune : l'état enregistré, les courriels partis, et ce que voit le client.
4. Une caution laissée sans décision est libérée seule au troisième jour, après
   l'alerte de la veille.
5. Après libération ou retenue, la carte n'est plus attachée au client Stripe.
6. `bash scripts/parcours/lancer.sh` passe toujours.
