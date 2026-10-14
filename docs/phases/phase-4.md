# Phase 4 — Cycle de paiement complet

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

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
    et le troisième jour après, sans qu'un humain y pense.
11. **Passage de la base en configuration de production** — point 4 de
    `docs/06-avant-premier-client.md`, avec sa liste.

---

## Décisions ouvertes, à trancher à l'ouverture

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
