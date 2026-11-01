# Avant le premier client réel — checklist bloquante

> Ce fichier est mis à jour dès qu'un point est levé ou découvert. C'est le
> **seul** domicile de cette liste : elle ne doit être recopiée nulle part
> ailleurs (voir `docs/05-protocole-phase.md`, règle 1).

Seize points à traiter **avant qu'un vrai client signe un vrai contrat**. Aucun
n'empêche le logiciel de fonctionner : ils empêchent qu'il fonctionne
**correctement le jour où il compte**.

## Qui peut lever un point

Onze des seize points **ne se résolvent pas, ou pas entièrement, dans le dépôt**
(3, 6, 7, 9, 10, 11, 12, 13, 14, 15 et 16). Sans cette
précision, une session future les lira comme des tâches techniques et cherchera
la réponse au mauvais endroit — dans le code, où elle n'est pas.

| Rôle | Ce qu'il tranche |
|---|---|
| **Développement** | Ce qui se règle en écrivant du code, dans la phase indiquée |
| **Arbitrage** | Une décision de votre part, entre deux options toutes deux acceptables |
| **Le comptable** | Ce qui relève de la fiscalité et de la forme juridique de l'exploitation |
| **Les propriétaires** | Ce qui engage une dépense ou un contrat avec un tiers |
| **Phase de déploiement** | Ce qui ne peut se faire que sur le serveur, au moment où le site y est installé |

## Vue d'ensemble

| # | Point | Qui peut lever | Quand |
|---|---|---|---|
| 1 | Nommer les options sur les documents | Développement | Phase 5 |
| 2 | Rendre l'adresse IP du signataire non falsifiable | Développement | Au déploiement |
| 3 | Caution (carte, chèque, virement) et paiement : confirmés par Stripe, contrat et texte d'accord relus par un juriste, développés et testés | **Les propriétaires** (Stripe, juriste), puis développement | Phases 3 et 4 |
| 4 | Passer la base en configuration de production | Développement | Phase 4 |
| 5 | Vérifier le logo sur un PDF généré **après** déploiement | Développement | Au déploiement |
| 6 | Qui est le bailleur juridique des trois gîtes | **Le comptable** | Phase 6 |
| 7 | Médiateur de la consommation : lequel, et adhésion en cours | **Les propriétaires** | Phase 6 |
| 8 | Écrire les règles sauna à l'article 12 du contrat | Développement | Phase 6 |
| 9 | Sauvegarder le volume des PDF, et tester une restauration | **Phase de déploiement** | Au déploiement effectif — échéance tranchée le 24 septembre 2026 |
| 10 | Taxe de séjour : régime et taux **vérifiés** ; restent l'assiette (ménage), les bébés et les tarifs 2027 | **Le service taxe de séjour** (Ardèche Grand Air) | Phase 3 |
| 11 | Saisir les vrais tarifs, périodes, barème et réglages de taxe | **Les propriétaires**, au back-office | Avant l'ouverture (Phase 5) |
| 12 | Durée de conservation des tentatives de réservation abandonnées | **Les propriétaires** (juriste), puis développement | Phase 4 |
| 13 | Site en anglais : relire la traduction, faire valider l'anglais du juridique | **Les propriétaires** (relecture), **le juriste** (pages juridiques, bannière cookies) | Avant l'ouverture (Phase 6) |
| 14 | Passer Stripe en mode réel et brancher l'avis de paiement | **Les propriétaires** (compte Stripe activé), puis développement | Au déploiement |
| 15 | Brancher les courriels réels sur le serveur déployé | **Phase de déploiement**, puis les propriétaires (réception) | Au déploiement |
| 16 | Annulation : confirmer le délai de remboursement du solde (48 heures) | **Arbitrage** | Avant l'ouverture |

---

## 1. Nommer les options sur les documents

**Qui peut lever :** développement · **Phase 5**

**La raison.** La table `reservations` porte un **montant** d'options mais aucun
**libellé** : les documents affichent l'intitulé générique « Options ». Une
facture comportant une ligne « Options — 25,50 € » ne désigne pas ce qui a été
vendu. La dénomination précise des prestations facturées est obligatoire
(art. L.441-9 C. com. pour les factures entre professionnels ; note de
prestation de services, arrêté du 3 octobre 1983, pour un particulier).

**L'action.** Ajouter le libellé en base (Phase 5, back-office), puis l'afficher
à la place de l'intitulé générique dans les **trois composants PDF** et sur la
**page de signature**.

---

## 2. Rendre l'adresse IP du signataire non falsifiable

**Qui peut lever :** développement · **au déploiement**

**La raison.** `app/api/contrats/signer/route.ts` lit l'adresse dans les en-têtes
`x-forwarded-for` puis `x-real-ip`. Ces en-têtes sont **écrits par le client**
tant qu'un proxy de confiance ne les réécrit pas : n'importe qui peut
aujourd'hui faire enregistrer l'adresse de son choix dans la preuve de
signature. Une preuve dont un élément est fourni par la personne à qui on
l'oppose ne vaut rien.

**L'action.** Vérifier que le reverse proxy (Traefik, sous Coolify) **écrase**
`x-forwarded-for` au lieu de le transmettre, et ne faire confiance qu'à la
valeur qu'il ajoute.

**Le contrôle.** Envoyer une requête de signature avec un `x-forwarded-for`
fantaisiste. L'adresse enregistrée dans `signatures.ip_signataire` doit être
l'adresse **réelle**, pas celle de l'en-tête.

---

## 3. Caution Stripe : confirmée, relue, développée et testée

**Qui peut lever :** **les propriétaires** pour les deux premières conditions,
puis développement · **Phase 4**

**La raison.** Le contrat (article 6) et cinq pages du site décrivent une
caution par **préautorisation Stripe** sur la carte de l'acompte, faite la
veille du départ et levée au plus tard 3 jours après (`docs/02-decisions.md`,
D-16). **Ce mécanisme n'est pas développé.** Signer un contrat avant qu'il le
soit, c'est promettre par écrit un dispositif qui n'existe pas — pratique
commerciale trompeuse (art. L.121-2 C. conso.).

L'arbitrage prévu ici a été rendu le 9 octobre 2026 : le prestataire spécialisé
annoncé jusque-là est écarté et toutes ses mentions ont été retirées. Le point
ne se ferme pas pour autant : il change d'objet.

**L'action.** Quatre conditions, **toutes** nécessaires :

1. **Stripe confirme par écrit** qu'une préautorisation à capture manuelle,
   hors session, sur carte enregistrée, est autorisée pour une caution de
   location saisonnière.
2. **Stripe confirme par écrit** qu'une préautorisation annulée est gratuite.
3. **Un juriste relit** l'article 6 du contrat, avec les articles 5.1 (b), 14.2,
   14.4 et 14.5 modifiés en même temps (`docs/contrat-template.md`).
4. **Le mécanisme est développé et testé** en mode test, avec les trois cartes
   de `docs/phases/phase-4.md`.

Les conditions 1 et 2 sont un **préalable au développement** : si Stripe refuse
le montage, le contrat et le site sont à reprendre avant d'écrire du code.

**Conditions 1 et 2 : réponses obtenues le 9 octobre 2026**, par le chat du
support Stripe (un agent, pas l'assistant automatique). Réponses rapportées par
le propriétaire :

- le blocage d'un paiement avec encaissement ultérieur « ne présente aucune
  restriction quant aux types d'e-commerçants concernés » ; avec une carte déjà
  enregistrée, le paiement peut être créé plusieurs semaines plus tard, et
  « peut être approuvé ou refusé selon l'émetteur de la carte » ;
- « aucun frais n'est facturé en cas d'annulation d'un paiement non encaissé » ;
- validité habituelle de l'autorisation : 7 jours à compter du lancement.

**Reste à faire :** conserver la trace écrite. La transcription devait être
envoyée par courriel à la clôture du chat ; à la date de cette note, sa
réception n'est pas confirmée. À défaut, captures d'écran de l'historique.

**Ajouts du cadrage de la Phase 3 (13 et 14 octobre 2026)**, à faire relire
dans le même envoi au juriste :

- la caution devient **au choix du client : carte, chèque ou virement**
  (D-19) — l'article 6 est **réécrit** (contrat v3, lot 5, 29 octobre 2026), y
  compris le cas du client arrivé sans caution (6.6) ;
- une réservation faite **à moins de 30 jours** de l'arrivée se paie en totalité
  (D-20) — les articles 5.1, 5.2, 5.3 et 7.2 prévoient ce cas depuis le
  contrat v3, et le site émet ce contrat comme les autres ;
- l'**article 7.2** suit la règle d'annulation du gérant (D-26) : tout est
  remboursé jusqu'à la date limite du solde ; ensuite l'acompte est conservé,
  hors taxe de séjour, et le solde remboursé jusqu'à 48 heures avant
  l'arrivée ; la taxe de séjour est remboursée dans tous les cas (7.2, 7.5) ;
- l'**article 4.4** dit désormais la taxe collectée pour le compte d'Annonay
  Rhône Agglo, taxe additionnelle départementale comprise (vérification par les
  propriétaires : point 10).

**Rédigé par une session le 29 octobre 2026, validé par le gérant avant le
commit, à faire relire au juriste** (`docs/contrat-template.md`, articles 4.4,
5, 6, 7.2, 7.5 et 10.4). Cinq questions précises à lui poser :

1. L'article 7.2 reste qualifié de « geste commercial unilatéral et
   révocable » alors que la règle est désormais écrite au contrat : un bailleur
   professionnel peut-il se réserver de la révoquer (art. R.212-1 C. conso.) ?
2. Retenue sur une caution par **chèque** (6.4) : « encaissement du chèque,
   la différence étant reversée au Locataire » (confirmé par le gérant le
   29 octobre 2026). La rédaction convient-elle ?
3. Client arrivé sans caution qui **refuse** aussi d'enregistrer une carte
   (6.6) : le contrat ne dit pas ce qui se passe ensuite (refus de l'entrée ?).
4. Non-versement du solde (5.3) et départ anticipé (7.6) : l'acompte, ou les
   sommes versées, restent acquis **taxe de séjour comprise**, alors qu'elle est
   remboursée en cas d'annulation. Aligner ?
5. Séjour payé en une fois : la qualification « paiement du prix, à
   l'exclusion des arrhes » (5.2) suffit-elle ? Elle vaut aussi depuis le
   contrat v4 pour le client qui **choisit** de tout régler à la réservation
   (D-27, article 5.1).
- le **texte d'accord pour l'enregistrement de la carte**, validé par le gérant
  le 14 octobre 2026, **et sa traduction anglaise** validée le 20 octobre 2026 :
  les deux textes sont dans `docs/phases/phase-3.md` (et en base, table
  `textes_accord`). Une version corrigée par le juriste s'ajoute en base comme
  une nouvelle version datée ; les réservations déjà faites gardent la leur.

**Le contrôle.** Une réservation de test menée jusqu'au départ : la caution est
bloquée la veille, libérée d'un clic, et la carte n'est plus attachée au client
Stripe ensuite. Puis la même avec une retenue partielle.

**Où le mécanisme est décrit** — à modifier ensemble s'il change : la liste est
tenue dans `docs/03-conformite.md`, § 5, écart E-4.

---

## 4. Passer la base en configuration de production

**Qui peut lever :** développement · **Phase 4**

**La raison.** La base a servi jusqu'ici en configuration de développement.
Avant le premier client, elle doit être en configuration d'exploitation : c'est
là que vivent les coordonnées des clients et les preuves de signature.

**L'action.** À l'ouverture de la Phase 4, établir la liste exacte de ce que
« configuration de production » recouvre, puis l'appliquer. Points connus à y
inclure :

- `DATABASE_URL` vise l'hôte **interne** du réseau Coolify (le port public est
  refermé — voir `docs/02-decisions.md`, D-10) ;
- `STORAGE_PATH` vise le **volume persistant**, jamais un dossier du conteneur ;
- `DB_CIBLE` **absente** en production — sa présence ferait travailler le site
  sur la base de test ;
- **séparation des rôles PostgreSQL** : le rôle applicatif a aujourd'hui tous
  les droits. Un rôle en lecture seule pour le site vitrine était à décider en
  Phase 3 ;
- **sauvegarde du volume de PDF**, distincte de celle de la base — traitée
  au point 9, **plus tôt** que cette phase.

---

## 5. Vérifier le logo sur un PDF généré après déploiement

**Qui peut lever :** développement · **au déploiement**

**La raison.** Le logo est lu sur le disque (`public/logo.png` depuis
`process.cwd()`). Selon le mode de build, ce dossier peut ne **pas** être présent
à côté du code exécuté : avec `output: "standalone"`, Next.js **ne copie pas**
`public/`. Le repli est **silencieux par conception** — un contrat sans logo
reste juridiquement valide, un contrat non généré après encaissement est un
incident client. Rien ne signalera donc le problème en dehors d'une ligne dans
les journaux.

**L'action.** Après le premier déploiement, générer un contrat et une facture de
test et **ouvrir les PDF** pour voir le logo.

**Le contrôle.** Chercher `[logo] Lecture … impossible` dans les journaux du
conteneur.

---

## 6. Qui est le bailleur juridique des trois gîtes

**Qui peut lever :** **le comptable**, avec les propriétaires · **Phase 6**

**La raison.** Les documents contractuels engagent la **SARL DE LA VOUTE**
(RCS Annonay 831 170 782). Les mentions légales publiées sur le site annoncent
Patricia et Nicolas Terrafina « exploitants **en nom propre** », avec un SIRET
factice (`000 000 000 00000`). Un consommateur qui lit le site ne traite pas avec
la personne qui signe son contrat — c'est une incohérence sur l'**identité du
professionnel** (art. L.121-2 C. conso.) et un manquement aux mentions
obligatoires (art. 6-III LCEN).

**La question à poser est plus large que les mentions légales.** Elle porte sur
**qui exploite**, et commande trois choses à la fois :

1. l'**éditeur du site** dans les mentions légales ;
2. la **déclaration des revenus locatifs** (résultat de société, ou revenus des
   personnes) ;
3. l'**exonération de TVA de l'article 261 D 4° du CGI**, déjà imprimée sur les
   deux factures et dans le contrat. Cette exonération tombe si l'exploitant
   fournit des prestations de type hôtelier — **le forfait ménage de 80 €
   facturé systématiquement** et **la fourniture du linge** annoncée sur le site
   en sont deux.

**Une seule question, posée une seule fois au comptable, dans ses trois volets.**
Le SIRET factice est une **conséquence** : il disparaît quand l'identité est
arrêtée. Voir `docs/02-decisions.md` DO-01 et `docs/03-conformite.md` § 7 et § 9.

**L'action, une fois la réponse obtenue.** Aligner en Phase 6 : mentions légales
du site, CGV, contrat, deux factures, et `lib/constantes.ts` — en traitant au
passage l'écart E-7 (les PDF n'importent pas `EMETTEUR`, ils recopient ses
valeurs).

---

## 7. Médiateur de la consommation : lequel, et l'adhésion est-elle en cours

**Qui peut lever :** **les propriétaires** — ce sont eux qui adhèrent et qui
paient · **Phase 6**

**La raison.** Deux médiateurs différents sont annoncés au même client selon le
document qu'il lit : **MEDICYS** sur les factures et dans le contrat,
**MTV — Médiation Tourisme Voyage** dans les CGV du site. Un seul peut être le
bon.

**Le point important n'est pas la cohérence de rédaction.** L'adhésion à un
dispositif de médiation est un **abonnement payant** (art. L.612-1 C. conso.).
Annoncer un médiateur sans y adhérer **prive le client d'une voie de recours
réelle** : il saisit un organisme qui déclarera le dossier irrecevable faute
d'adhésion du professionnel. Un droit affiché et indisponible est plus grave
qu'une incohérence.

**La question à poser, dans cet ordre.**
1. **Existe-t-il une adhésion en cours, à qui, depuis quand ?**
2. Si non, ou si elle porte sur l'autre organisme : lequel retenir ?

**Élément de choix, sans trancher :** **MTV** est le médiateur **du secteur du
tourisme** (hébergement, voyage) ; **MEDICYS** est un médiateur **généraliste**.
Les deux sont référencés. Le choix dépend du secteur et du coût d'adhésion.

**L'action.** Une fois l'organisme arrêté, l'inscrire au même endroit que
l'identité (point 6) et le propager aux mêmes cinq emplacements.

---

## 8. Écrire les règles sauna à l'article 12 du contrat

**Qui peut lever :** développement · **Phase 6**

**Ce point n'est pas une décision ouverte.** Le principe est déjà arrêté dans le
projet (`docs/contrat-template.md`, art. 12) : règles **spa ET sauna** dans
l'article 12, **spa interdit aux moins de 6 ans**, **sauna interdit aux moins de
12 ans**, mineurs de 12 à 17 ans accompagnés. Il ne manque que l'écriture.

**La raison, en deux faces.** L'article 12 du contrat produit
(`components/pdf/ContratPDF.tsx`) est intitulé « Équipements spécifiques :
**spa** » et ne contient **aucune** règle sauna. L'article 12.3 du modèle n'a pas
été repris.

1. **Côté client — un équipement sans règle opposable.** La Maison Vieille est
   louée avec un sauna privatif, annoncé sur cinq pages du site. Aucune règle
   d'usage n'est opposable à son locataire : ni limite d'âge, ni interdiction
   d'alcool, ni consigne de température. En cas d'accident impliquant un enfant,
   le bailleur ne peut opposer aucune clause.

2. **Côté preuve — le consentement référence une clause inexistante.** Le texte
   enregistré mot pour mot dans `signatures.consentement_texte`
   (`lib/constantes.ts`, `texteConsentement`) fait accepter au client
   « *l'article 12 relatif aux équipements **spa et sauna*** ». Le client consent
   formellement à un article qui ne traite pas du sauna : la preuve de
   consentement **décrit un contenu qui n'existe pas**.

**C'est la même classe de problème que la mention « signature avancée »
corrigée en Phase 1** : un document affirme quelque chose que le système ne fait
pas. La correction est de la même nature — faire correspondre le texte et la
réalité.

**L'action.** En Phase 6 : reprendre l'article 12.3 du modèle dans le composant
PDF, rétablir le titre « spa et sauna », et décider comment la section sauna est
déclenchée. Aujourd'hui l'article entier est conditionné au booléen `giteASpa` ;
le sauna n'existe que comme **texte libre** dans `gites.equipements_specifiques`.
Deux options à arbitrer à l'ouverture de la phase : ajouter une colonne
`a_sauna`, ou lire le texte libre.

**Le contrôle.** Générer un contrat pour **La Maison Vieille** (le parcours de
test actuel ne couvre que L'Armu et LaPhine) et vérifier que la section sauna
apparaît ; générer un contrat pour L'Armu et vérifier qu'elle n'apparaît pas.

---

## 9. Sauvegarder le volume des PDF, et tester une restauration

**Qui peut lever :** **déploiement effectif**

> **Décision prise à l'ouverture de la Phase 3 (24 septembre 2026) :** échéance
> décalée au déploiement effectif, plutôt que déployer avant d'ouvrir la phase.
> La Phase 3 va donc produire des PDF (contrats de test, puis de vrais contrats
> si un client signe avant le déploiement en production) **sans sauvegarde de
> volume**. Sans conséquence tant qu'aucun client réel ne signe — **intenable
> dès qu'il y en a un**. Ce point doit être rouvert et levé avant, ou au moment
> du déploiement — pas après. Voir `docs/phases/phase-3.md`.

**Le fait (vérifié le 17 septembre 2026).** La sauvegarde quotidienne de Coolify
vers Cloudflare R2 couvre **la base PostgreSQL, pas les fichiers**. Aucune
sauvegarde des PDF n'existe — et il n'y a encore rien à sauvegarder : le volume
des PDF appartient à l'application, qui n'est pas déployée ; **le volume
n'existe donc pas encore**.

**La raison.** Un PDF signé perdu **n'est pas régénérable** : son empreinte
SHA-256 est figée dans la preuve de signature, et un PDF reconstruit depuis la
base ne la reproduirait pas. Ces pièces doivent être conservées **10 ans**
(art. L123-22 C. com.). Voir `docs/03-conformite.md` § 6 et
`docs/02-decisions.md`, D-09.

**L'action, dans le même geste que la création du volume.**

1. Configurer dans Coolify une **sauvegarde planifiée du volume** vers R2 —
   Coolify le propose nativement pour les volumes d'application
   (<https://coolify.io/docs/core/persistent-storage/storage-mounts/backups>).
2. **Tester une restauration.** Une sauvegarde jamais restaurée est une
   hypothèse, pas une sécurité.

**Le contrôle.** Générer un PDF de test, attendre une sauvegarde, restaurer
l'archive ailleurs que sur le volume en service, et vérifier que le fichier
restauré a la même empreinte SHA-256 que l'original.

---

## 10. Taxe de séjour : régime, taux et assiette exacts

**Qui peut lever :** les propriétaires **et** la commune de Savas (ou son
intercommunalité) · **Phase 3**

> **Avancement au 14 octobre 2026.** Les deux questions ci-dessous ont leur
> réponse : les gîtes **ne sont pas classés** (gérant, 11 octobre), et la règle
> de Savas — 5 %, plafond 4,40 €, + 10 % départementale, arrondi à chaque
> étape — est **vérifiée sur la délibération et le guide officiels**
> (`docs/03-conformite.md` § 7 bis). Le calcul existe et rejoue les exemples
> officiels au centime (D-18).
>
> **Restent trois questions, à poser au service taxe de séjour d'Ardèche Grand
> Air** (04 75 33 24 51, ardechegrandair@taxesejour.fr) :
> 1. le **forfait ménage** facturé à part entre-t-il dans le prix retenu ?
> 2. un **bébé** compte-t-il parmi les occupants qui divisent le prix ?
> 3. quels **tarifs pour 2027** (délibération votée avant le 1er juillet 2026) ?
>
> Le calcul suit les réponses sans modification : le ménage et les bébés sont
> deux réglages, les tarifs une ligne datée.
>
> **Ajout du 29 octobre 2026 (lot 5), à vérifier par les propriétaires.** Le
> contrat (art. 4.4) dit la taxe collectée pour le compte d'**Annonay Rhône
> Agglo**, taxe additionnelle départementale comprise. Recherche du 29 octobre :
> l'agglomération collecte la taxe sur son territoire depuis 2017 et encaisse
> la part du Département de l'Ardèche (10 %) ; aucune page trouvée ne cite
> Savas nommément. Vérification : si les gîtes sont déclarés sur
> `ardechegrandair.taxesejour.fr`, c'est confirmé.

**Pourquoi c'est bloquant.** Cet argent n'est pas le nôtre : il est collecté
pour le compte d'une collectivité. **Sous-collecté**, la différence reste due et
c'est la SARL qui paie. **Sur-collecté**, on facture au client une taxe qui
n'est pas due. La formule appliquée aujourd'hui (5,5 % du séjour **et** du
forfait ménage, sans notion d'occupants) peut produire l'un ou l'autre selon le
séjour.

**Deux questions à poser, et à faire écrire.**

1. **Les gîtes sont-ils classés « meublé de tourisme » par arrêté ?** Attention :
   le label Gîtes de France et ses épis **ne sont pas** un classement — les épis
   sont une marque privée, le classement est une procédure administrative en
   étoiles. La réponse change entièrement la méthode : tarif **fixe** par
   personne et par nuit si classé, **pourcentage** du prix de la nuitée sinon.
2. **Quel régime, quel taux et quel plafond la collectivité a-t-elle votés pour
   Savas**, taxes additionnelles comprises ?

**Source officielle :** <https://taxesejour.impots.gouv.fr> (délibérations et
tarifs en vigueur, commune par commune).

**Le contrôle.** Recalculer à la main la taxe d'un séjour de référence — celui du
parcours, 2 adultes et 1 enfant sur 7 nuits — selon la règle obtenue, et la
comparer au montant que produit le tunnel. Les deux doivent être égaux au
centime.

La règle complète, l'implémentation actuelle et l'écart sont détaillés dans
`docs/03-conformite.md` § 7 bis.

---

## 11. Saisir les vrais tarifs, périodes, barème et réglages de taxe

**Qui peut lever :** **les propriétaires**, au back-office · **avant
l'ouverture** (l'écran de saisie est en Phase 5)

**La raison.** Depuis la Phase 3 (D-17), les prix ne sont plus écrits dans le
code : ils vivent dans les tables de tarification, **vides en base réelle**.
Tant qu'elles le restent, les fiches gîtes masquent leurs prix et le tunnel
refuse de chiffrer un séjour — par conception, il n'invente jamais un prix. La
base de test, elle, porte une tarification d'essai marquée « (essai) ».

**L'action.** Saisir, pour chaque gîte : les tarifs et leur prix à la nuit, les
périodes de l'année (sans trou), le barème général, les règles d'arrivée et de
durée s'il y en a, et les réglages de taxe de séjour (point 10).

**Le contrôle.** Chaque fiche gîte affiche sa grille ; le journal du serveur ne
contient ni « VALEUR ABSENTE EN BASE », ni « TARIF ÉCARTÉ », ni « PÉRIODE NON
CALÉE », ni « BARÈME » ; un séjour de test se chiffre dans le tunnel.

---

## 12. Durée de conservation des tentatives de réservation abandonnées

**Qui peut lever :** **les propriétaires**, avec leur juriste (la durée), puis
développement · **Phase 4**
(l'effacement automatique, avec les tâches planifiées)

**La raison.** Depuis le lot 2 de la Phase 3 (D-21), le tunnel enregistre la
réservation, avec le nom, l'adresse, le courriel et le téléphone du client, **à
l'arrivée sur l'écran de paiement**. Un client qui revient en arrière voit sa
tentative supprimée sur-le-champ. Mais un client qui ferme la page laisse une
réservation « en attente de paiement » dont le blocage expire, et ses
coordonnées restent en base alors qu'il n'a rien acheté. Le RGPD impose une
durée de conservation limitée et justifiée (art. 5.1.e) ; aucune n'est fixée.
Depuis le lot 4 (D-24), le **texte de chaque courriel envoyé** est aussi gardé
(table `courriels`, preuve de ce que le client a reçu) : même question.

**L'action.** Faire fixer la durée par le juriste (quelques jours suffisent
pour traiter un paiement tardif, lot 3), puis effacer automatiquement les
tentatives expirées au-delà (Phase 4), et l'écrire dans la politique de
confidentialité (Phase 6).

**Le contrôle.** Une tentative expirée plus ancienne que la durée fixée
n'existe plus en base ; la politique de confidentialité annonce la même durée.

---

## 13. Site en anglais : relire la traduction, faire valider l'anglais du juridique

**Qui peut lever :** **les propriétaires** (relecture de l'anglais), **le
juriste** (pages juridiques et bannière cookies) · **avant l'ouverture**
(Phase 6)

**La raison.** Depuis le 16 octobre 2026 (D-22), le site existe en anglais sous
`/en`. Tous les textes anglais sont des **traductions fidèles du français faites
par une session**, sans rien ajouter : personne ne les a relus. Ils engagent
pourtant les propriétaires autant que le français (art. L.121-2 C. conso.,
pratiques commerciales trompeuses). Deux formules héritées et non validées en
français le sont aussi en anglais : « tout compris » / « all included » (fiche
gîte, `docs/03-conformite.md` § 5).

Les pages juridiques, elles, ne sont **pas traduites** : en anglais, elles
affichent le texte français avec « Available in French only ». La bannière
cookies est traduite (un consentement doit être compris de celui qui le donne)
mais personne n'a validé cette traduction.

**L'action.**
1. Les propriétaires relisent l'anglais page par page (accueil, gîtes, fiches,
   activités, contact, tunnel). Les textes sont, dans le code, à côté du
   français : une session peut en sortir une liste à relire.
2. Le juriste dit si un client anglophone peut accepter des CGV qu'il n'a qu'en
   français, valide l'anglais de la bannière cookies, et fournit (ou fait
   faire) les traductions juridiques s'il les juge nécessaires.

**Le contrôle.** Chaque page anglaise a été relue et validée par écrit ; la
réponse du juriste sur les CGV est conservée.

---

## 14. Passer Stripe en mode réel et brancher l'avis de paiement

**Qui peut lever :** **les propriétaires** (activer le compte Stripe de la
SARL DE LA VOUTE : identité, compte bancaire), puis développement · **au
déploiement**

**La raison.** Depuis le lot 3 de la Phase 3 (D-23), le tunnel encaisse par
Stripe, **en mode test seulement** : le site refuse toute clé réelle
(`lib/stripe.ts`). Deux choses manquent pour encaisser pour de vrai :
- les **clés réelles**, qui n'existent qu'une fois le compte activé ;
- l'**avis de paiement** (webhook) déclaré chez Stripe vers
  `https://<site>/api/stripe/webhook`, avec son secret. Sans lui, un client qui
  paie puis ferme sa page avant le retour reste « en attente » : son argent est
  pris, sa réservation n'est pas confirmée.

**L'action.**
1. Les propriétaires activent le compte Stripe et créent l'avis de paiement
   (événements `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `payment_intent.processing`). Ils règlent aussi
   le **nom public** du compte et le **libellé sur le relevé bancaire** : le
   compte de test affiche aujourd'hui « LES GITES DE SAMOYAS », que le client
   voit pendant la validation bancaire et sur son relevé.
2. Développement : lever le refus des clés réelles (décision de mise en ligne,
   pas une variable), saisir les trois variables dans Coolify
   (`.env.example`), rejouer le parcours de paiement en mode test sur le
   serveur déployé.

**Le contrôle.** Un paiement réel d'un petit montant, page fermée aussitôt
après la validation bancaire : la réservation passe « confirmée » par l'avis
seul ; puis remboursement depuis le tableau de bord Stripe.

---

## 15. Brancher les courriels réels sur le serveur déployé

**Qui peut lever :** **phase de déploiement**, puis **les propriétaires**
(vérifier la réception) · **au déploiement**

**La raison.** Depuis le lot 4 de la Phase 3 (D-24), le site envoie la
confirmation au client, avec le lien de signature du contrat, et les alertes
aux propriétaires, par Brevo. Le domaine gitesdesamoyas.fr est authentifié
chez Brevo (27 octobre 2026) et l'expéditeur reservation@ déclaré ; la clé
utilisée pour les essais est sur le poste de développement. Sur le serveur :
- sans `BREVO_API_KEY`, aucun courriel ne part : ils sont écrits dans des
  fichiers ;
- sans `NEXT_PUBLIC_SITE_URL`, les liens des courriels prennent l'adresse de
  la requête reçue, qui peut ne pas être l'adresse publique (proxy de Coolify) :
  le client recevrait un lien de signature qui ne s'ouvre pas.

**L'action.**
1. Générer une clé API Brevo propre au serveur (« site-production »,
   permission d'envoi seulement) et la saisir dans Coolify avec
   `NEXT_PUBLIC_SITE_URL` (l'adresse publique, sans barre oblique finale).
2. Vérifier dans la base réelle la table `alertes` : les trois alertes vers
   contact@gitesdesamoyas.fr (valeurs de la migration 0006).
3. Facultatif, quelques semaines après l'ouverture : durcir la règle DMARC du
   domaine (« observer seulement » aujourd'hui) une fois les rapports de Brevo
   propres.

**Le contrôle.** Une réservation réelle (ou de test sur le serveur déployé)
avec une adresse Gmail et une adresse Orange : la confirmation arrive dans la
boîte de réception, pas en indésirables ; son bouton ouvre la page de
signature ; « Répondre » écrit à contact@ ; l'alerte arrive dans contact@.

---

## 16. Annulation : confirmer le délai de remboursement du solde

**Qui peut lever :** **arbitrage** (le gérant et la personne qui décide avec
lui) · **avant l'ouverture**

**La raison.** Le 29 octobre 2026, le gérant a fixé la règle d'annulation
(D-26) : l'acompte est remboursé jusqu'à la date limite du solde, gardé
ensuite ; le solde est remboursé **jusqu'à 48 heures avant l'arrivée**. Il a
précisé que ce délai « reste encore à voir » : il ne décide pas seul. Le contrat
v3 l'écrit déjà (art. 7.2), avec le chiffre lu dans les réglages.

**L'action.** Confirmer 48 heures, ou donner l'autre délai. Un autre délai se
règle sans code : `reglages.delai_remboursement_solde_heures`. Il vaut pour les
réservations faites ensuite ; celles déjà faites gardent le leur, recopié à la
réservation.

**Le contrôle.** Un contrat émis après le changement imprime le nouveau délai
et la date limite qui en découle (art. 7.2).

---

## Points levés

Conservés pour mémoire : ils ont figuré dans cette liste et n'y figurent plus.

| Point | Levé le | Comment |
|---|---|---|
| Refermer le port PostgreSQL public | 16 septembre 2026 | Port fermé ; `DATABASE_URL` vise l'hôte interne du réseau Coolify ; accès de développement par tunnel SSH. `?sslmode=require` reste inutilisable, le serveur tournant avec `ssl = off`. Voir `docs/02-decisions.md`, D-10. |
