# Phase 3 — Moteur de réservation

> Fiche à **compléter à l'ouverture de la phase** : décisions ouvertes et
> risques se construiront à ce moment-là, après lecture du code réel
> (`docs/05-protocole-phase.md`, étape 2). Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. Bloque la Phase 4.
**Prérequis à lever avant l'ouverture :** `docs/06-avant-premier-client.md`, point 9 (sauvegarde du volume des PDF) — **tranché le 24 septembre 2026, voir ci-dessous**.
**Volume estimé :** 2 à 3 sessions au départ ; **5 à 6** depuis le cadrage
d'octobre 2026, qui a fait entrer les saisons, la taxe de séjour et trois
moyens de caution dans la phase. Découpage en cinq lots plus bas.
**État :** cadrage clos le 14 octobre 2026 ; **lot 1 (prix) livré et commité
le même jour** ; **lot 2 (calendrier et réservation) livré le 15 octobre
2026** ; **lot 3 (paiement, Stripe en mode test) livré le 20 octobre 2026**.
Lots 4 et 5 à faire.

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

## Décisions arrêtées au cadrage (9 au 14 octobre 2026)

Prises une par une avec le gérant. Celles qui sont structurantes ont leur
entrée, avec le pourquoi, dans `docs/02-decisions.md` (renvoi entre
parenthèses) ; les autres n'existent qu'ici jusqu'à leur mise en œuvre.

**Prix et saisons — livrés au lot 1 (D-17).** Le modèle de saisons est fait
dans cette phase, et non en Phase 5 : le tunnel ne peut pas chiffrer un séjour
sans lui. Tarifs nommés librement, prix d'une nuit par gîte, périodes datées
commençant le samedi, barème de coefficients par rang de nuit (au-delà de sa
dernière case : la moyenne des cases), règles d'arrivée, de départ et de durée
générales avec exceptions par tarif et par période. Tout est réglable ; aucune
valeur commerciale n'est écrite dans le code. Le contenu réel (tarifs, dates,
coefficients) sera saisi par les propriétaires au back-office, **une fois le
site en activité** : aucun calendrier réel n'a été préparé.

**Taxe de séjour — calcul livré au lot 1 (D-18).** Gîtes **non classés**
(réponse du 11 octobre 2026) : tarif proportionnel de Savas, vérifié sur la
délibération et le guide officiel (`docs/03-conformite.md` § 7 bis).

**Occupants — livré au lot 2.** Trois catégories dans le tunnel : adultes
(18 ans et plus), enfants, bébés (validé le 14 octobre 2026). **Le premier bébé
de moins de 2 ans ne compte pas dans la capacité du gîte ; un second bébé
prend une place, et un seul lit bébé est fourni** (15 octobre 2026). Exemple :
LaPhine (4 places) accepte 4 personnes et 1 bébé, ou 3 personnes et 2 bébés,
pas 4 personnes et 2 bébés. Trois réglages généraux : l'âge (2 ans), le nombre
de bébés hors capacité (1), le nombre de lits bébé (1). Au-delà des lits, le
tunnel prévient sans refuser.

**Horaires — livrés au lot 2.** Arrivée 18 h, départ 9 h, arrivée au plus tard
20 h (valeurs du contrat, validées le 14 octobre 2026), **communes aux trois
gîtes** (15 octobre 2026). Réglables ; recopiées sur chaque réservation. Un
autre horaire s'arrange avec les propriétaires, sans être promis.

**Délai avant l'arrivée — livré au lot 2.** Une arrivée se réserve **au plus
tard la veille** : pour la nuit du vendredi 16 octobre, jusqu'au jeudi 15 à
23 h 59 (15 octobre 2026). Réglable en jours ; 0 rouvre le jour même.

**Civilité facultative — livrée au lot 2** (15 octobre 2026). Exiger « M. » ou
« Mme » n'est pas nécessaire à la vente (CJUE, 9 janvier 2025, aff. C-394/23,
Mousse) : le client peut la laisser vide, et le contrat imprime alors son nom
seul. À confirmer par le juriste avec le reste du contrat.

**Accueil et départ en personne. Il n'y a pas de boîte à clés.** Les trois
mentions du prototype (« code de la boîte à clés ») sont à retirer : tableau
« Phrases du site devenues inexactes » plus bas.

**Page de suivi.** Accès par un **lien secret envoyé par courriel** (code long,
impossible à deviner). La référence courte (« SAM-… ») ne sert qu'à se parler ;
elle n'ouvre rien. Un client qui a perdu son courriel redemande son lien en
saisissant son adresse. Durée de validité du lien réglable.

**Blocage des dates pendant le paiement — livré au lot 2 (D-21).** Les dates
sont bloquées **à l'arrivée sur l'écran de paiement**, pas au choix des dates.
Durée réglable, **20 minutes** au départ, avec un compte à rebours affiché. Le
client qui revient en arrière lève le blocage, et sa tentative est supprimée
avec ses coordonnées. Paiement arrivé après la fin du blocage (lot 3) :
- dates encore libres → réservation confirmée normalement ;
- dates prises entre-temps → **remboursement intégral automatique**, courriel
  au client, alerte aux propriétaires, et proposition des autres gîtes libres
  sur toutes ses dates et de capacité suffisante, au prix recalculé et avec un
  nouveau paiement (jamais une réservation d'office).

**Règlement du solde.** Le client choisit entre prélèvement automatique et
paiement par lien ; **rien n'est pré-coché**, le bouton de paiement reste
grisé tant qu'il n'a pas choisi (13 octobre 2026). Sans carte enregistrée
(caution par chèque ou virement), seul le paiement par lien est proposé.

**Réservation à moins de 30 jours de l'arrivée : paiement intégral immédiat**
(D-20). Seuil réglable, égal au délai du solde.

**Caution : carte, chèque ou virement, au choix du client** (D-19, qui
complète D-16). Paramètres : chèque gardé, jamais encaissé ; virement reçu au
plus tard **3 jours avant l'arrivée** (réglable), sinon alerte et lien de
carte ; restitution au plus tard **3 jours après le départ** pour les trois
moyens ; client arrivé sans rien → courriel avec un lien pour donner sa carte,
envoyé depuis le back-office.

**Texte d'accord pour l'enregistrement de la carte**, sous le formulaire de
paiement, pour le client qui choisit la caution par carte. **Validé par le
gérant le 14 octobre 2026, à faire relire par un juriste** (point 3 de
`docs/06-avant-premier-client.md`). Il sera enregistré mot pour mot avec chaque
réservation, versions datées. Les crochets sont remplacés par les valeurs de la
réservation :

> En validant ce paiement, j'accepte que la carte utilisée soit conservée par
> Stripe, prestataire de paiement de la SARL DE LA VOUTE, pour les opérations
> suivantes :
> – une préautorisation de [montant de la caution] au titre du dépôt de
> garantie, effectuée la veille de mon départ. Elle n'est pas débitée, sauf
> dégât constaté, et elle est levée au plus tard 3 jours après mon départ ;
> – [si le client l'a choisi] le prélèvement du solde de [montant], le [date].
> Les données de ma carte sont supprimées au plus tard 7 jours après mon départ.

Tant que ce texte n'est pas en base, le tunnel refuse de s'ouvrir hors de la
base de test.

**Courriels aux propriétaires.** Trois types : réservation confirmée (acompte
ou total payé), contrat signé, problème à traiter (paiement tardif remboursé,
courriel client non parti). Chacun activable séparément, avec sa liste de
destinataires réglable. Aucun courriel pour une réservation abandonnée. Un
courriel qui ne part pas n'annule rien : il est retenté et l'échec est
enregistré.

**Mise en ligne.** Le site ne sera pas mis en ligne tant que tout n'est pas
fonctionnel et terminé (13 octobre 2026), back-office compris.

---

## Découpage en cinq lots

| Lot | Contenu | État |
|---|---|---|
| **1. Prix** | Tables de tarification et de taxe, calcul du prix d'un séjour et de la taxe, fiches gîtes lues en base, contrôles | **Livré le 14 octobre 2026** — voir `docs/journal-phases.md` |
| **2. Calendrier et réservation** | Disponibilités réelles, blocage de 20 minutes, refus si un prix manque, erreur sur un gîte inconnu, tunnel branché sur les vrais chiffres (âges, horaires, prix, taxe) | **Livré le 15 octobre 2026** — voir `docs/journal-phases.md` |
| **3. Paiement** | Stripe en mode test : acompte ou total, carte conservée seulement si choisie, choix de la caution et du solde, paiement tardif, autres gîtes proposés | **Livré le 20 octobre 2026** (D-23) — voir `docs/journal-phases.md` ; parcours rejoué par Stripe en mode test le 22 octobre 2026 (11 étapes sur 11) ; restent la validation 3-D Secure à l'écran et l'avis signé |
| **4. Courriels et suivi** | Brevo, contrat généré, lien de signature, page de suivi à lien secret, courriels aux propriétaires (dont le paiement remboursé, journalisé seulement au lot 3) ; **libellé de la taxe dans les PDF** (une réservation du tunnel n'a plus de taux unique : `taux_taxe_sejour` est vide, et les PDF impriment encore « (… %) ») ; **documents d'un paiement intégral** (`paiement_integral` : ni acompte ni solde, alors que `calculerMontants` applique le taux d'acompte) ; phrase « contrat à signer par courriel » sur la page de confirmation | À faire |
| **5. Contrat et pages** | Articles 5.1 et 6 du contrat, pages qui décrivent la caution, horaires, boîte à clés retirée, documentation | À faire |

**Points ouverts après le lot 2**, hors code :
- les bébés comptent-ils parmi les **occupants** de la taxe de séjour, et le
  forfait ménage entre-t-il dans le prix retenu — deux questions au service
  taxe de séjour d'Ardèche Grand Air (`docs/06-avant-premier-client.md`,
  point 10). Le calcul suit les deux réponses sans modification : ce sont deux
  réglages datés de `taxes_sejour` (bébés comptés et ménage exclu par défaut).
- combien de temps garder les coordonnées d'une tentative **abandonnée sans
  retour en arrière** (blocage expiré, page fermée) : question au juriste,
  effacement automatique en Phase 4 (`docs/06-avant-premier-client.md`,
  point 12).

**Deux langues depuis le 16 octobre 2026 (D-22), entre les lots 2 et 3.** Le
site et le tunnel existent en français et en anglais (`/en`). Conséquences pour
les lots restants :
- **chaque écran ajouté** (paiement, confirmation, suivi) s'écrit dans les deux
  langues, à côté des textes existants (`Bilingue<T>`) ;
- **lot 4** : les courriels partent dans la langue du client (accord du gérant
  le 18 octobre 2026), **enregistrée sur la réservation depuis le lot 3**
  (`reservations.langue`) ; le contrat et les factures restent en français ;
- ~~**lot 3** : le retour de paiement par redirection (3-D Secure) reprend la
  tentative en cours~~ → fait : il arrive sur `/reserver/confirmation`, qui
  revérifie le paiement chez Stripe.

**Décisions du lot 3 (20 octobre 2026, D-23).** Le client paie **sur le site**
(champ de carte Stripe intégré, pas de page Stripe). Le **texte d'accord en
anglais** est la traduction fidèle validée par le gérant :

> By confirming this payment, I agree that the card used will be stored by
> Stripe, payment provider of SARL DE LA VOUTE, for the following operations:
> – a pre-authorisation of [security deposit amount] as a security deposit,
> made the day before my departure. It is not charged unless damage is found,
> and it is released no later than 3 days after my departure;
> – [if chosen by the client] the charge of the balance of [amount] on [date].
> My card details are deleted no later than 7 days after my departure.

Les deux textes sont en base (`textes_accord`, migration 0005). Sans la ligne
du solde, la phrase de la caution finit par un point au lieu d'un
point-virgule. **L'écran après paiement** n'affiche que des faits (référence,
séjour, montant payé, solde et son règlement, caution et son moyen, téléphones
des propriétaires) ; la phrase sur le contrat à signer par courriel n'y
apparaîtra qu'au lot 4. **Écran « paiement refusé »** : « Souvent ça passe au
second essai… » est retiré ; « dates non bloquées », devenu faux, est remplacé
par « vos dates restent bloquées jusqu'à la fin du délai ». Les autres phrases
du prototype de ces deux écrans restent sur la liste du lot 5.

**22 octobre 2026, après le premier affichage avec les clés de test.** Le champ
de Stripe ne montre que la carte : ni **Link** (compte Stripe proposé au
client), ni la **phrase d'autorisation de Stripe**, doublon du texte d'accord
(D-23).

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
7. **Ajouté au cadrage : la tarification (saisons, barème, règles) et le calcul
   de la taxe de séjour**, prévus jusque-là en Phase 5 pour la première et non
   prévus pour le second. Livrés au lot 1 ; le back-office qui les modifie
   reste en Phase 5.

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

### 1. Le tunnel ne doit JAMAIS dégrader en silence — traité au lot 2

`lib/tunnel.ts` lève au lieu de compléter ; la page affiche « La réservation en
ligne est momentanément indisponible » et l'enregistrement répond 503.
Vérifié en rendant la table `reglages` illisible.

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

### 2. Un `?gite=` inconnu réserve LaPhine en silence — traité au lot 2

`/reserver` sans gîte affiche un écran de choix ; un gîte inconnu (dont
l'ancien `larmu`) répond 404.

`app/reserver/page.tsx` : un slug absent ou périmé retombe sur `GITES.laphine`
sans rien signaler. Le client croit réserver L'Armu et engage LaPhine. Il faut
une **erreur explicite** (404, ou retour à la liste des gîtes), pas un repli.

Le risque est réel depuis la Phase 2 : les slugs ont changé (`larmu` →
`armu`, D-14). Les redirections 301 couvrent `/gites/larmu`, **pas**
`/reserver?gite=larmu`.

### 3. Les chiffres du tunnel sont encore écrits en dur — traité au lot 2

La constante `BOOKING` et les fausses propositions ont disparu : prix, ménage,
taxe, caution et capacité viennent de la base, l'acompte du calcul des
documents (`lib/montants.ts`). Le taux d'acompte (30 %) et le délai du solde
(30 jours) sont devenus des réglages au lot 3, recopiés sur chaque réservation
(D-23).

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
| `ReserverFunnel.tsx`, récapitulatif latéral | ~~« Solde de … prélevé J-30 »~~ → « Solde de … à régler au plus tard le … » (lot 2) |
| `ReserverFunnel.tsx`, étape 3 | ~~« Le solde sera prélevé J-30 sur la même carte. »~~ → idem (lot 2) |
| `ReserverFunnel.tsx`, étape 4 | ~~« le solde J-30 sera prélevé sur la même carte »~~ → retirée (lot 2) |
| `ReserverFunnel.tsx`, écran de succès | ~~« Prélèvement automatique du solde… »~~ → reconstruit au lot 3 (`reserver/confirmation`) : le règlement choisi par le client |
| `app/suivi/[ref]/page.tsx` | « prélevés automatiquement sur la même carte » |
| `lib/data/legal.ts`, CGV § 02 | « Le solde du séjour est prélevé automatiquement à J-30 » — Phase 6 |

### Phrases du site qui décrivent ce qui n'existe pas (cadrage du 13 octobre 2026)

Il n'y a **pas de boîte à clés** : l'accueil et le départ se font en personne.
Les horaires de référence sont **18 h et 9 h** (contrat), pas 16 h et 10 h.

| Endroit | Phrase |
|---|---|
| `app/suivi/[ref]/ArrivalInfo.tsx` | « Le code de la boîte à clés… vous seront communiqués dès la signature », et un faux code affiché |
| `app/reserver/ReserverFunnel.tsx`, écran de succès | ~~« Adresse précise, code de la boîte à clés… »~~ → écran retiré (lot 2) |
| `app/reserver/ReserverFunnel.tsx`, étape 1 | ~~« À partir de 16h », « Avant 10h »~~ → horaires lus en base (lot 2) |
| `app/suivi/[ref]/ArrivalInfo.tsx` | « entre 16h et 19h », « avant 10h » |

D'autres formules du prototype engagent le vendeur sans avoir été validées
(« réponse sous 24 h », « modifiable jusqu'à J-31 », « contrat eIDAS »,
« télécharger le récap PDF », « avis vérifié Gîtes de France », « souvent ça
passe au second essai ») : leur liste exhaustive sera soumise aux
propriétaires au lot 5. Ce qui n'est pas confirmé est retiré, pas reformulé
(règle 3 du protocole).
