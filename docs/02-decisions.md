# Registre des décisions

> Ce fichier est mis à jour **à la clôture d'une phase**, et uniquement quand
> une décision structurante a été prise ou revue. On n'efface jamais une
> entrée : une décision abandonnée est marquée comme telle, avec la date et la
> raison.

Dans quatre mois, personne ne se souviendra pourquoi les montants sont en
centimes ni pourquoi les routes sont au pluriel — et quelqu'un « corrigera »
l'un des deux en croyant bien faire. C'est la raison d'être de ce fichier : le
**pourquoi** est la partie importante, pas le **quoi**.

Format de chaque entrée : ce qui a été décidé · pourquoi · ce qu'on casse en
revenant dessus.

---

## D-01 · Abandon de Supabase, reconstruction sur VPS OVH + Coolify

**Date :** avant le 14 septembre 2026 (Phase 0).

**Décision.** La base de données n'est plus hébergée chez Supabase. Elle est
reconstruite depuis zéro sur un **VPS OVH** (un serveur loué, administré par
nous) piloté par **Coolify** (une interface web qui installe et surveille les
conteneurs : base, site, sauvegardes). Le moteur est **PostgreSQL 17**. Le
schéma vit dans `db/schema/` et les **migrations SQL sont versionnées dans git**
(`db/migrations/`).

**Pourquoi.** La base précédente a été **perdue** : le fournisseur a fermé le
projet et les données sont parties avec. Le schéma n'existait alors que dans
l'interface du fournisseur — il n'y avait rien à restaurer. Versionner les
migrations dans git veut dire que le schéma existe **en dehors** de
l'hébergeur : quel que soit ce qui arrive au serveur, `npm run db:migrate`
reconstruit la structure à l'identique sur n'importe quelle base PostgreSQL.

**Si on revient dessus.** Repasser à une base managée où le schéma est modifié
par une interface graphique, c'est reproduire exactement la panne qui a coûté la
base. Le schéma redeviendrait invérifiable, et une restauration ne serait plus
possible.

---

## D-02 · Fusion des deux dépôts en une seule application

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** L'ancien dépôt `Logiciel-contrat-` (génération des contrats et
factures, signature) est absorbé dans le dépôt du site. Une seule application
Next.js porte désormais le vitrine, les documents et la signature. L'ancien
dépôt n'est plus utilisé.

**Pourquoi.** Les deux applications lisaient la même base et partageaient les
mêmes règles de calcul. Séparées, chaque règle existait en deux exemplaires :
une correction appliquée d'un côté ne l'était pas de l'autre, et rien ne le
signalait. Un seul dépôt veut dire un seul calcul, un seul schéma typé, une
seule compilation qui échoue quand une colonne change.

**Si on revient dessus.** Deux calculs de montants dans deux dépôts finissent
par diverger, et la divergence se découvre sur la facture d'un client.

---

## D-03 · Signature électronique simple maison, sans prestataire tiers

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** La signature du contrat est une **signature électronique simple
(SES)** recueillie directement par le bailleur : lien unique `/signer/{token}`,
case de consentement, enregistrement d'une preuve dans la table `signatures`.
Aucun prestataire tiers (ni Yousign, ni équivalent).

**Pourquoi.** Trois textes fondent cette possibilité :
- l'**article 3 point 10 du règlement eIDAS** (règlement européen n° 910/2014)
  définit la signature électronique simple : des données sous forme
  électronique, jointes à d'autres données électroniques, que le signataire
  utilise pour signer ;
- l'**article 25 d'eIDAS** interdit de refuser à une signature électronique sa
  valeur juridique **au seul motif** qu'elle est simple et non qualifiée ;
- l'**article 1367 du Code civil** donne à la signature électronique la même
  valeur qu'une signature manuscrite, dès lors que l'identité du signataire est
  identifiée et l'intégrité de l'acte garantie.

La preuve enregistrée couvre ces deux exigences : nom saisi, courriel de la
réservation, jeton unique reçu par courriel, texte de consentement **mot pour
mot**, horodatage, adresse IP, et **empreinte SHA-256 du PDF exact signé**. La
table est rendue **immuable** par un trigger : une preuve modifiable n'a aucune
valeur.

Un prestataire tiers apporte une signature *avancée* et une valeur probante
supérieure — au prix d'un abonnement et d'une dépendance. Pour un contrat de
location saisonnière entre un professionnel et un particulier, le risque
contentieux ne le justifie pas.

**Si on revient dessus.** Passer à un prestataire est faisable (le contrat ne
décrit rien d'autre que ce qui existe). L'inverse — prétendre offrir mieux
qu'une signature simple sans le faire — est une **mention trompeuse** : c'est
précisément l'erreur corrigée en Phase 1, où les documents annonçaient une
signature « avancée » qui n'existait pas.

---

## D-04 · Compteur de numérotation en table dédiée, jamais une SEQUENCE

**Date :** avant le 14 septembre 2026 (Phase 0).

**Décision.** Les numéros de documents (`FAC-2026-001`, `CTR-2026-001`) sont
délivrés par la table `compteurs_documents` et la fonction SQL
`prochain_numero(série, année)`, appelée **dans la transaction** qui crée la
ligne. **Jamais une `SEQUENCE` PostgreSQL.**

**Pourquoi.** Une `SEQUENCE` est un compteur qui **ne revient pas en arrière**
quand la transaction échoue : c'est sa raison d'être, elle est conçue pour être
rapide et non transactionnelle. Si une émission de facture prend le numéro 5
puis échoue, le numéro 5 est perdu et la facture suivante prend le 6. La suite
devient 4, 6, 7 — un **trou**.

L'**article 289 du Code général des impôts** impose une numérotation
**continue, chronologique et sans rupture**. Un trou est interprété en contrôle
comme une facture émise puis dissimulée, et c'est à l'entreprise de prouver le
contraire.

Le compteur en table est incrémenté par un `UPSERT` qui **verrouille la ligne**
jusqu'à la fin de la transaction : deux émissions simultanées attendent leur
tour, et une transaction annulée rend son numéro.

**Si on revient dessus.** Le premier `ROLLBACK` produit un trou définitif. On ne
peut pas « reboucher » une numérotation légale après coup sans antidater des
documents, ce qui est un faux.

---

## D-05 · La ligne en base est le document légal, le PDF n'en est qu'une représentation

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** Une facture **existe** dès que la ligne `factures` est validée en
base, numéro compris. Le PDF est un rendu de cette ligne. Si le rendu échoue,
la facture reste émise et on ré-émet le PDF **pour le même numéro**
(`pdf_url` reste `NULL` tant qu'il n'est pas produit, et la route s'appuie sur
ce `NULL`). Même principe pour les contrats et les signatures.

**Pourquoi.** Si le PDF était le document, un échec de rendu obligerait soit à
annuler le numéro (trou, voir D-04), soit à en frapper un nouveau (doublon
fonctionnel). En faisant de la ligne le document, un échec de rendu devient un
incident **sans conséquence légale** : on réessaie.

C'est aussi ce qui permet à l'instantané `factures.donnees` d'être conservé :
il contient toutes les données exactes du PDF, en centimes, avec son numéro et
sa date réels. La facture est reconstituable même si le fichier disparaît.

**Si on revient dessus.** Faire du PDF le document, c'est faire dépendre la
conformité fiscale d'une écriture de fichier.

---

## D-06 · Montants en centimes entiers, conversion par découpage de chaîne

**Date :** 16 septembre 2026 (Phase 1, session B).

**Décision.** En mémoire et dans tous les calculs, un montant est un **entier de
centimes** : 576,66 € vaut `57666`. Les colonnes `numeric` de PostgreSQL sont
lues en **texte** (`"576.66"`) et converties par **deux fonctions et deux
seulement** (`lib/centimes.ts`) :
- `centimesDepuisNumeric` — texte → centimes ;
- `numericDepuisCentimes` — centimes → texte à deux décimales.

Ces fonctions **découpent la chaîne** au point décimal et concatènent les
chiffres. Elles ne multiplient ni ne divisent jamais par 100.

Les **taux** (taux d'acompte, taux de taxe de séjour) restent des nombres
décimaux : un taux n'est pas de l'argent.

**Pourquoi.** Un nombre à virgule en informatique (« flottant ») ne représente
pas exactement les décimales : `457.30 * 100` vaut `45729.999999999993`. Arrondi
au hasard des opérations, cela produit des écarts d'un centime. Sur une facture,
un centime d'écart signifie que les lignes ne s'additionnent plus — et une
facture fausse ne se corrige que par un avoir, jamais par modification.

Le texte renvoyé par PostgreSQL est la **seule forme exacte** disponible : le
découper est la seule conversion qui ne perd rien. Partir d'un nombre
JavaScript, c'est partir d'une valeur déjà approchée.

En centimes entiers, `acompte + solde = total` est **exact par construction**,
pas par chance.

**Si on revient dessus.** Le jour où un montant redevient un flottant, les
erreurs d'arrondi réapparaissent, silencieusement, sur des documents déjà
envoyés. Le script `npm run verify:centimes` (51 cas) existe pour que la
régression se voie immédiatement.

---

## D-07 · Règle de calcul : l'acompte porte sur le total TTC, taxe incluse

**Date :** 12 juin 2026 (validée), réaffirmée en Phase 1.

**Décision.**
```
sous-total = prix de location + forfait ménage + options
total TTC  = sous-total + taxe de séjour
acompte    = 30 % du TOTAL TTC (taxe de séjour comprise)
solde      = total TTC − acompte
```
La taxe de séjour est **fournie par la réservation**, jamais recalculée.
Le solde est dérivé par soustraction, jamais par un second pourcentage.

**Pourquoi.** Deux points, chacun délibéré :
- **L'acompte inclut la taxe de séjour** parce que le client paie un montant
  unique, pas une ventilation. Calculer l'acompte hors taxe compliquerait le
  message sans rien apporter.
- **Le solde est `total − acompte`, pas « 70 % »** : en centimes entiers, la
  soustraction garantit que les deux montants se réadditionnent exactement au
  total. Deux arrondis indépendants (30 % puis 70 %) peuvent différer d'un
  centime du total.

Le **seul arrondi** du modèle est la conversion du taux d'acompte en montant
(`Math.round(totalTtc * 0,3)`) — voir `lib/montants.ts`.

**Si on revient dessus.** Changer l'assiette de l'acompte change ce que le
client paie et ce que disent les contrats déjà signés. C'est une décision
commerciale, pas technique : elle ne se prend pas dans le code.

---

## D-08 · Routes API au pluriel

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** Les routes sont `/api/contrats`, `/api/factures`,
`/api/documents/…`, `/api/contrats/signer`. Au **pluriel**.

**Pourquoi.** Une route au pluriel désigne une **collection** de ressources :
`POST /api/contrats` crée un contrat *dans* la collection des contrats. C'est la
convention REST usuelle, et surtout c'est celle déjà en place. Le singulier
existait dans l'ancien dépôt (`/api/contrat`) : le renommage a été fait une fois,
volontairement, à la fusion.

**Si on revient dessus.** Renommer une route casse tous les appelants
(back-office, webhooks de paiement, scripts de test) sans qu'aucune compilation
ne le signale — une URL est une chaîne de caractères. Le gain est nul, le coût
est une panne silencieuse en production. **Ne pas « corriger » ce pluriel.**

---

## D-09 · Stockage des PDF sur volume disque, R2 pour les seules sauvegardes

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** Les PDF sont écrits sur un **volume disque persistant** du VPS,
monté par Coolify (`STORAGE_PATH`, défaut `/data/documents`). Ils ne sont
**jamais servis directement** : seul `GET /api/documents/{chemin}` les délivre,
et uniquement sur présentation d'une URL signée à durée limitée.
**Cloudflare R2** (un stockage objet distant) ne sert qu'aux **sauvegardes**
de la base, envoyées chaque jour par Coolify.

**Pourquoi.** Les documents sont des pièces nominatives : un contrat porte
l'adresse, le téléphone et la composition du foyer d'un client. Un fichier posé
dans un dossier public est indexable et devinable. L'accès par lien signé
(HMAC-SHA256 sur chemin + date d'expiration) rend chaque lien inutilisable après
expiration et infalsifiable sans la clé.

Le disque plutôt qu'un stockage objet : moins de pièces mobiles, aucune latence
réseau au rendu, et une interface (`lib/storage.ts`) qui isole complètement le
choix — changer de stockage ne touche aucune route.

**Point de vigilance permanent.** Les conteneurs Docker sont **recréés à chaque
déploiement**. Tout fichier écrit hors du volume monté est perdu. Les
sauvegardes R2 contiennent la **base, pas les PDF** : le volume doit être
sauvegardé à part. **Constat du 17 septembre 2026 :** cette sauvegarde n'existe
pas, et il n'y a encore rien à sauvegarder — le volume appartient à
l'application, qui n'est pas déployée ; il n'existe donc pas encore. Sa
sauvegarde planifiée vers R2 se configure au déploiement, dans le même geste
que sa création, suivie d'un test de restauration : voir
`docs/06-avant-premier-client.md`, point 9.

**Si on revient dessus.** Servir les PDF en statique expose des données
personnelles ; les écrire hors volume les détruit au prochain déploiement.

---

## D-10 · Port PostgreSQL public refermé ; `sslmode=require` impossible

**Date :** 16 septembre 2026 (Phase A).

**Décision.** Le port PostgreSQL du VPS **n'est plus ouvert sur Internet**.
L'accès depuis un poste de développement passe par le réseau interne de Coolify
ou par un **tunnel SSH** (une connexion chiffrée qui fait apparaître le port
distant comme local). `DATABASE_URL` vise l'hôte **interne** du réseau Coolify.

**`?sslmode=require` n'est pas utilisable** : le serveur PostgreSQL tourne avec
`ssl = off`, il ne présente aucun certificat. Exiger TLS ferait échouer toute
connexion.

**Pourquoi.** La base contient les coordonnées des clients et les preuves de
signature. Exposée sans TLS, chaque connexion transporte le mot de passe et les
données **en clair**. Le tunnel SSH chiffre le transport sans rien changer à la
configuration du serveur : c'est le compromis retenu.

**Si on revient dessus.** Rouvrir le port pour se simplifier la vie en
développement, c'est exposer en permanence une base de données personnelle pour
un confort ponctuel. Si un accès externe redevient nécessaire, il faut
**d'abord** activer TLS côté serveur, puis seulement ouvrir.

**Conséquence opérationnelle (Phase 2) :** le développement local qui lit la
base réelle exige de monter le tunnel. C'est un risque identifié de la Phase 2,
inscrit dans sa fiche.

---

## D-11 · Base de test `gites_test`, distincte de la base réelle

**Date :** 15 septembre 2026 (Phase 1, session A).

**Décision.** Les parcours de test s'exécutent sur une base séparée,
`gites_test`, sur le même serveur. Elle est activée par la variable
`DB_CIBLE=test`, qui fait lire `DATABASE_URL_TEST` au lieu de `DATABASE_URL`.
Sans cette variable, **tout s'exécute sur la base réelle**.

**Pourquoi.** Chaque contrat, facture ou signature de test **consomme un numéro
légal irrécupérable** (voir D-04), et une signature **ne se supprime pas**
(trigger d'immutabilité, voir D-03). Un seul parcours de test lancé par erreur
sur la base réelle laisse des numéros consommés sur des documents fictifs et des
preuves de signature qu'on ne peut plus effacer.

Le script `reinitialiser.ts` **refuse de s'exécuter** si `DB_CIBLE` ne vaut pas
`test` : c'est la seule protection contre l'erreur de frappe.

**Si on revient dessus.** Tester sur la base réelle pollue la numérotation
légale de façon définitive.

---

## D-12 · Beds24 reporté en V2, périmètre limité à la synchronisation temps réel

**Date :** 16 septembre 2026 (Phase A).

**Décision.** **Beds24** (un service payant de gestion de locations
saisonnières, qui synchronise les calendriers de plusieurs plateformes en temps
réel) **n'est pas intégré dans la V1**. La Phase 7 se limite à la
synchronisation **iCal** : export des réservations vers les plateformes, import
des réservations des plateformes avec **relecture au moment du paiement**.

**Pourquoi.** iCal est un format de calendrier standard, gratuit, accepté par
toutes les plateformes. Son défaut est la **latence** : les plateformes
rafraîchissent leur import toutes les quelques heures. Il existe donc une
fenêtre pendant laquelle une nuit vendue ailleurs apparaît encore libre chez
nous. La relecture des disponibilités **au moment du paiement** réduit cette
fenêtre à quelques secondes — elle ne l'annule pas.

Beds24 supprimerait la latence, contre un abonnement et une intégration à
construire. Le surbooking est un risque réel mais rare ; l'affronter en V1
retarderait la mise en ligne pour un problème qui n'existe pas encore, faute de
volume.

**Si on revient dessus.** Intégrer Beds24 en V1, c'est ajouter une dépendance
payante et un mode de défaillance supplémentaire avant d'avoir le premier
client en direct.

---

## D-13 · Pages publiques en rendu à la demande, avec dégradation au lieu d'une erreur

**Date :** 17 septembre 2026 (Phase 2).

**Décision.** Les chiffres des gîtes (capacité, tarifs, forfait ménage, caution,
taux de taxe de séjour) sont lus en base par `lib/gites-publics.ts`. Les pages
qui les affichent — accueil, `/gites`, `/gites/[slug]`, `/contact` — sont en
**rendu à la demande**, avec un **cache de 60 secondes** portant l'étiquette
`gites`. Trois propriétés sont volontaires et ne doivent pas être « simplifiées » :

1. **Une base injoignable n'est pas une erreur 500.** Les chiffres
   disparaissent, la page reste : récit, photos, coordonnées, bouton de
   réservation. Une fiche sans prix est une page qui vend encore ; une erreur 500
   dit au visiteur que l'entreprise ne fonctionne pas.
2. **Les deux pannes se journalisent séparément.** `VALEUR ABSENTE EN BASE` est
   une donnée à saisir, `BASE INJOIGNABLE` est une panne à traiter. L'affichage
   est le même, la réaction est opposée : confondues dans les journaux, une
   panne passerait pour un oubli de saisie pendant des jours.
3. **La clé du cache contient la base visée, et la lecture abandonne après 3
   secondes.** Sans la clé, un cache rempli sur `gites_test` resservirait des
   prix de test sous la base réelle, sans aucun signal. Sans le délai, une base
   muette ferait attendre chaque visiteur les 10 secondes du pool
   (`db/index.ts`).

**Pourquoi pas l'ISR**, envisagé dans la fiche de phase : `generateStaticParams`
faisait lire la base **pendant `next build`**. Un déploiement aurait alors
échoué exactement quand la base est indisponible, c'est-à-dire au pire moment.
Le build doit rester autonome ; c'est un critère de non-régression.

**Si on revient dessus.** Rétablir une erreur au lieu de la dégradation, c'est
faire dépendre la visibilité commerciale du site de la disponibilité de la base.
Retirer la cible de la clé de cache, c'est risquer d'afficher des prix de test
en production. Rendre le cache plus long, c'est allonger d'autant le délai entre
une correction de prix par les propriétaires et ce que voit le client.

**Le tunnel de réservation, lui, ne dégrade pas** : afficher un gîte sans prix
est acceptable, laisser réserver sans prix ne l'est pas. Voir
`docs/phases/phase-3.md`.

---

## D-14 · Les slugs des gîtes sont ceux de la base

**Date :** 17 septembre 2026 (Phase 2).

**Décision.** L'identifiant public d'un gîte est la colonne `gites.slug` :
`laphine`, `armu`, `maison-vieille`. Le code utilisait `larmu` et
`maisonvieille` ; il s'aligne. Deux redirections **301** couvrent les anciennes
adresses (`next.config.ts`).

**Pourquoi la base gagne.** Le slug est la clé de la ligne, déjà référencée par
`db/seed.ts`, `db/verify.ts` et `scripts/parcours/reference.ts`. Le renommer en
SQL aurait demandé une migration et cassé ces trois références, pour un simple
confort d'écriture. Et une table de correspondance code ↔ base aurait créé un
endroit de plus où se tromper.

**Ce que ça ne coûte pas.** Le site Next n'a **jamais été déployé** :
`/gites/larmu` n'a jamais existé publiquement. Les redirections ne servent qu'un
lien resté dans un mail, un favori ou une capture d'écran.

**Attention en Phase 3.** `app/reserver/page.tsx` remplace en silence un
`?gite=` inconnu par LaPhine. Un lien périmé ne produirait donc pas une erreur,
mais une réservation sur le mauvais gîte.

**Si on revient dessus.** Changer un slug après la mise en ligne casse les liens
partagés et le référencement acquis ; il faudra alors une redirection de plus,
et non un renommage.

---

## D-15 · `tarif_semaine_base` est le tarif de BASSE SAISON

> **Remplacée le 14 octobre 2026 par D-17.** Plus aucune page ne lit
> `tarif_semaine_base` : la grille et le « À partir de » viennent des tables de
> tarification. La colonne reste en base, avec `tarif_weekend` et
> `gites.taux_taxe_sejour`, jusqu'à ce que plus rien ne la lise (contrôles de
> la base, seed) ; elle sera alors retirée par une migration.

**Date :** 17 septembre 2026 (Phase 2).

**Décision.** La colonne `gites.tarif_semaine_base` désigne le tarif d'une
semaine en **basse saison** — le prix plancher, celui qu'annoncent les
« Dès … » du site. Ce n'est **pas** un tarif de référence dont les autres
saisons se déduiraient. La cellule « Basse » de la grille vient donc de la base ;
les trois autres saisons restent en code jusqu'à la Phase 5.

**Pourquoi il a fallu trancher.** La fiche gîte affichait le même prix depuis
deux sources : « Dès 450 € » lu en base et « Basse saison 450 € » figé en code.
Les valeurs coïncidaient, mais une coïncidence n'est pas une définition : à la
première modification, la même page aurait montré deux prix différents. Un
visiteur n'en conclut pas que la grille est périmée, il en conclut qu'on lui
cache quelque chose.

**Sur quoi repose la lecture retenue.** Le code ne permettait pas de trancher :
aucune définition écrite, aucun lecteur de la colonne, aucune formule reliant
les saisons entre elles (ni coefficient, ni écart constant). Trois indices
convergent vers la basse saison : la colonne a été créée trois mois après la
grille, ses valeurs recopient le « À partir de » du site — qui est par
construction la ligne basse —, et sa jumelle `tarif_weekend` n'a aucun
équivalent saisonnier (le couple suit un modèle semaine / week-end, pas un
modèle de saisons). La décision est réversible en quelques minutes, et la
colonne disparaîtra en Phase 5.

**Conséquence de conception.** Le « Dès … » n'est pas lu directement : c'est le
**minimum de la grille affichée**, calculé par une seule fonction
(`plancherDuGite`). La page est ainsi cohérente **par construction** — elle ne
peut pas annoncer un plancher supérieur à une cellule de sa propre grille — au
même titre que `solde = total − acompte` en Phase 1. Si la basse saison cessait
d'être ce minimum, l'affichage resterait juste et le journal écrirait
`INCOHÉRENCE GRILLE`.

**Reste à demander aux propriétaires** (inscrit dans `docs/phases/phase-5.md`) :
pensent-ils leurs prix comme « un plancher en basse saison » ou comme « une base
majorée par saison » ? La réponse détermine le modèle de saisons, pas cette
cellule.

**Si on revient dessus.** Redéfinir la colonne sans reprendre les écrans qui la
lisent, c'est réintroduire exactement la divergence que cette décision supprime.

---

## D-16 · Caution par préautorisation Stripe en deux temps, sans prestataire tiers

> **Complétée le 13 octobre 2026 par D-19** : la préautorisation sur carte
> devient l'un des trois moyens de caution, au choix du client, avec le chèque
> et le virement. Tout ce qui suit reste vrai pour le client qui choisit la
> carte.

**Date :** 9 octobre 2026 (cadrage de la Phase 3). Le mécanisme se **développe
en Phase 4** ; seuls le contrat, les pages et le référentiel ont été alignés à
cette date.

**Décision.** Le dépôt de garantie ne passe par aucun prestataire spécialisé. Il
est géré directement avec Stripe, sur la carte que le client a utilisée pour
l'acompte :

1. **À la réservation**, la carte est enregistrée pendant le paiement de
   l'acompte (`setup_future_usage: 'off_session'` sur le PaymentIntent de
   l'acompte, rattaché à un Customer Stripe). C'est **un seul** enregistrement,
   qui sert à la caution et, si le client l'a choisi, au solde. Le client n'a
   aucune étape en plus ; son 3D Secure vaut accord.
2. **La veille du départ, vers 18 h** (heure de Paris), une tâche planifiée crée
   une préautorisation du montant de la caution : PaymentIntent avec
   `capture_method: 'manual'`, `off_session: true`, `confirm: true`, métadonnée
   `type: caution`. Aucun débit, les fonds sont bloqués. Le client reçoit le
   même jour un courriel l'en informant.
3. **Après l'état des lieux de sortie**, les propriétaires choisissent :
   « Libérer » (`paymentIntents.cancel`, le client ne paie rien) ou « Retenir »
   (`paymentIntents.capture` avec `amount_to_capture`, le reste étant libéré
   automatiquement — **une seule capture possible**). Le moyen de paiement est
   ensuite détaché (`paymentMethods.detach`) et le client reçoit un courriel
   récapitulatif.

**Paramètres arrêtés** (le texte opposable au client est celui de l'article 6
du contrat, `docs/contrat-template.md`) :

| Paramètre | Valeur | Raison |
|---|---|---|
| Mainlevée | Au plus tard **3 jours** après le départ | Sept jours de fonds bloqués sont une mauvaise expérience pour le client. Le départ est toujours fait en présence des propriétaires et le ménage a lieu au plus tard le lendemain : un dégât est vu avant. |
| Sans décision au bout de 3 jours | Le site **libère tout seul**, après une alerte la veille | Le délai contractuel doit tenir même en cas d'oubli. Un oubli vaut donc libération. |
| Débit après la mainlevée | **Aucun** | « Libérer » est définitif. Débiter un client à qui l'on a écrit que tout allait bien serait contestable, et le cas ne s'est jamais présenté. |
| Suppression des données de carte | Dès la mainlevée ou l'encaissement, au plus tard **7 jours** après le départ | Rien ne justifie de les garder plus longtemps. |
| Justificatifs d'une retenue | Remis au client, **sans délai contractuel** | Traité à la main, au cas par cas. |
| Règlement du solde | **Au choix du client** à la réservation : prélèvement automatique à J-30, ou paiement par lui-même via un lien | La carte reste enregistrée dans les deux cas, pour la caution. |

**Ces durées sont compatibles avec la validité d'une préautorisation.** Pour une
transaction initiée par le marchand, Stripe annonce 5 jours pour Visa (fenêtre
exacte : 4 jours 18 h) et 7 jours pour Mastercard. Une préautorisation créée la
veille du départ à 18 h tient donc jusqu'au troisième jour après le départ, vers
midi, pour une Visa. La date réelle se lit sur la charge
(`latest_charge.payment_method_details.card.capture_before`) et se stocke : on
ne la recalcule pas.

**Pourquoi.** Un prestataire spécialisé coûte à chaque séjour, y compris quand
rien n'est cassé — ce qui est le cas de presque tous les séjours. Stripe est
déjà nécessaire pour l'acompte et le solde : la caution n'ajoute ni prestataire,
ni compte, ni sous-traitant de données supplémentaire.

**Alternatives écartées.**

| Alternative | Raison du rejet |
|---|---|
| Swikly | 1,99 % + 0,25 € HT par caution émise, soit environ 10 € par séjour même sans dégât |
| Tyllt | 0,25 % + 0,25 € HT par caution, mais pas d'API publique, pièce d'identité exigée, encaissement soumis à validation du client |
| Wannapay | Abonnement de 249 à 399 € HT par an, et préautorisation de 7 jours qui impose la formule Business pour les longs séjours |
| Mandat SEPA | Le client peut se faire rembourser sans condition pendant 8 semaines, contestation définitive : aucune garantie réelle |
| Préautorisation seule dès l'arrivée | Limitée à 7 jours, non viable pour des séjours de 2 semaines |

Swikly figurait dans le contrat, sur cinq pages du site et dans le référentiel
sans avoir jamais été intégré (ancien écart E-4). Toutes ces mentions ont été
retirées le 9 octobre 2026.

**Cas d'échec à traiter en Phase 4.**

- **Préautorisation refusée** (fonds insuffisants, carte bloquée) : alerte
  immédiate aux propriétaires, et lien envoyé au client vers une page « valider
  ma caution » pour donner une autre carte. Le client est encore sur place.
  Repli : chèque ou espèces avant le départ (article 6.2 du contrat).
- **`authentication_required`** : même page, sur laquelle le client confirme son
  3D Secure.
- **Aucune décision à l'approche de l'échéance** : alerte aux propriétaires la
  veille, puis libération automatique.

**Ce que cette décision ne règle pas.**

- Deux confirmations écrites du support Stripe, **préalables à tout
  développement** — voir `docs/phases/phase-4.md`.
- La relecture de l'article 6 par un juriste — point 3 de
  `docs/06-avant-premier-client.md`.
- Hors code : ce que couvre l'assurance des propriétaires pour un dégât
  dépassant le montant de la caution. À vérifier auprès de l'assureur.

**Si on revient dessus.** Le mécanisme est décrit au client à trois niveaux qui
doivent rester d'accord : l'article 6 du contrat (avec 5.1, 14.2, 14.4, 14.5 et
le récapitulatif), les pages publiques (fiche gîte, tunnel, suivi, CGV, cookies)
et les courriels. En changer un seul, c'est annoncer un dispositif qui n'est pas
celui qu'on applique — pratique commerciale trompeuse (art. L.121-2 C. conso.).
Allonger le délai de mainlevée au-delà de la validité de la préautorisation
rendrait par ailleurs la retenue impossible pour une carte Visa.

---

## D-17 · Tarification : tarifs nommés, prix à la nuit, barème par rang de nuit

**Date :** 10 au 14 octobre 2026 (cadrage de la Phase 3, lot 1). Remplace
D-15.

**Décision.** Le prix de location d'un séjour se calcule à partir de quatre
notions, toutes en base et toutes modifiables sans développeur :

1. **Un tarif** (`tarifs`) porte un nom libre — « Basse saison », « Été » — et
   le **prix d'une nuit** pour chaque gîte (`tarifs_prix`).
2. **Des périodes datées** (`periodes`) associent un tarif au calendrier. Elles
   commencent le samedi (réglage), **ne se chevauchent jamais** (contrainte
   d'exclusion en base) et valent pour les trois gîtes. Une nuit sans période
   n'est pas réservable.
3. **Un barème** (`baremes`, `baremes_coefficients`) donne un coefficient par
   **rang de nuit** dans le séjour : 1re nuit, 2e nuit… Au-delà de sa dernière
   case, chaque nuit vaut la **moyenne des cases** : le prix moyen par nuit cesse
   de baisser et deux semaines coûtent exactement deux fois une semaine. La
   longueur du barème est libre : la dégressivité s'arrête où on le décide.
4. **Des règles** — minimum de nuits, jours d'arrivée, jours de départ — et le
   barème se résolvent dans l'ordre **période → tarif → réglage général**
   (`reglages`, une seule ligne). Une année calme, l'été redevient libre en
   réglant sa période, sans créer de second tarif.

Prix d'une nuit = prix de la nuit **dans sa propre période** × coefficient de
son rang. Le total est calculé en fractions exactes et **arrondi une seule
fois** ; les montants par nuit et par ligne sont obtenus par arrondi cumulé, de
sorte qu'ils s'additionnent exactement au total.

Le calcul vit dans `lib/tarification.ts` (pur, vérifié par
`npm run verify:tarification`), la lecture dans `lib/tarifs.ts`. Les fiches
gîtes et, au lot 2, le tunnel appellent **le même code** : la page ne peut pas
annoncer un prix que le tunnel calculerait autrement. `lib/montants.ts` reste le
seul calcul des montants d'une réservation **déjà faite** (acompte, solde,
documents) ; il ne recalcule ni le prix ni la taxe, qu'il reçoit.

**Pourquoi.** Chaque élément répond à une réponse du gérant :

- **Les saisons dès la Phase 3** : le tunnel ne peut pas chiffrer un séjour
  sans elles, et des prix en dur auraient obligé à écrire deux fois les dates
  et la priorité des saisons (code, puis base en Phase 5).
- **Le prix à la nuit avec un coefficient par rang** est la façon dont les
  propriétaires pensent leurs prix (« une base d'une nuit, dégressive jusqu'à
  une semaine »). Un séjour à cheval sur deux saisons ne pose alors aucune
  question : chaque nuit garde le prix de sa saison.
- **La moyenne au-delà du barème**, proposée par le gérant : une dégressivité
  prolongée finit à zéro ; la moyenne la stabilise. Conséquence assumée : la
  nuit qui suit la dernière case coûte plus que celle qui la précède (0,857
  contre 0,70 avec le barème d'exemple) — « ça a une justification ».
- **Le tarif séparé des dates** : le prix n'est saisi qu'une fois, même si le
  tarif revient quatre fois dans l'année. Un prix recopié sur chaque période
  finit par diverger (règle 1 du protocole).
- **Les périodes datées année par année** : les règles et les prix « dépendent
  des périodes et même des années ».

**Proposés par la session, confirmés par le gérant le 14 octobre 2026.**
Trois points n'avaient pas été demandés tels quels :
- une **période** peut porter ses propres règles et son propre barème (« ça
  dépend des périodes et même des années ») ;
- un **jour de départ** autorisé s'ajoute au jour d'arrivée : sans lui,
  « samedi → samedi » ne s'exprime pas ;
- pour un séjour à cheval sur plusieurs périodes, le jour d'arrivée obéit à la
  période de la première nuit, le jour de départ à celle de la dernière nuit,
  et le minimum de nuits est le plus exigeant des périodes traversées. C'est la
  lecture la plus protectrice : elle empêche d'entamer une semaine d'été
  « samedi → samedi » par un séjour arrivé un jeudi.

La colonne « la semaine » de la grille publique applique le barème du tarif,
pas celui qu'une période porterait en propre.

**Ce qui pourrait mal tourner.** Une période oubliée rend des dates
invendables sans bruit côté client (le tunnel dit « pas de tarif ») ; seul le
journal le signale. Le back-office (Phase 5) devra montrer les trous du
calendrier tarifaire.

**Ce qui rendrait l'inverse préférable.** Si les propriétaires revenaient à un
prix unique à la semaine sans courts séjours, un tableau « semaine par
saison » suffirait — mais le modèle actuel le représente déjà (barème plat,
séjours samedi → samedi de 7 nuits minimum).

**Si on revient dessus.** Revenir à des prix en code, c'est rendre chaque
changement de prix dépendant d'un développeur. Supprimer la contrainte
d'exclusion, c'est rendre le prix d'une nuit dépendant de l'ordre de lecture
des lignes. Arrondir nuit par nuit au lieu du total, c'est des lignes qui ne
s'additionnent plus au centime.

---

## D-18 · Taxe de séjour : réglages datés par gîte, arrondi à chaque étape

**Date :** 11 au 14 octobre 2026 (cadrage de la Phase 3, lot 1).

**Décision.** La taxe de séjour se **calcule**, par `lib/taxe-sejour.ts`, selon
la règle officielle vérifiée le 14 octobre 2026 (texte, sources et exemples :
`docs/03-conformite.md` § 7 bis). Ses paramètres sont des **réglages datés,
par gîte** (`taxes_sejour`) : mode (proportionnel pour un gîte non classé, fixe
pour un gîte classé), taux, plafond, tarif fixe, taxe additionnelle, et un
drapeau « le ménage entre dans le calcul ». Une nouvelle délibération s'ajoute
par une ligne datée, sans toucher au code. **Chaque étape est arrondie au
centime**, comme l'exige le guide officiel. Une nuit sans réglage applicable
est un **refus**, jamais une taxe nulle.

**Pourquoi.** L'ancienne formule (5,5 % du séjour et du ménage) n'était aucune
des deux règles légales : elle surfacturait environ 19 € sur un séjour type.
L'arrondi à chaque étape n'est pas un détail : arrondir seulement à la fin
donne 15,59 € au lieu de 15,75 € sur l'exemple officiel n° 1. Les réglages sont
par gîte parce qu'un gîte peut être classé sans que les autres le soient, et
datés parce que les tarifs se votent chaque année pour le 1er janvier suivant.

**Ce qui reste ouvert** (point 10 de `docs/06-avant-premier-client.md`) : le
forfait ménage entre-t-il dans le prix retenu, et les bébés comptent-ils parmi
les occupants ? Le calcul accepte les deux réponses ; elles se demandent au
service taxe de séjour d'Ardèche Grand Air.

**Si on revient dessus.** Un taux unique appliqué au total, c'est collecter une
taxe qui n'est pas due ou laisser la société payer la différence. Un arrondi
unique final, c'est un écart de quelques centimes par séjour avec le calcul de
la collectivité, sur un argent qui n'est pas le nôtre.

---

## D-19 · Caution : carte, chèque ou virement, au choix du client

**Date :** 13 octobre 2026 (cadrage de la Phase 3). Complète D-16. Mise en
œuvre : choix enregistré au lot 3 de la Phase 3, circuits en Phase 4, suivi
manuel au back-office en Phase 5.

**Décision.** À la réservation, le client choisit le moyen de sa caution :

| Moyen | Fonctionnement |
|---|---|
| **Carte** | Préautorisation la veille du départ, décrite par D-16. La carte de l'acompte est enregistrée. |
| **Chèque** | Remis à l'arrivée, **gardé, jamais encaissé**, rendu au plus tard 3 jours après le départ. |
| **Virement** | Reçu au plus tard **3 jours avant l'arrivée** (réglable), restitué par un virement au plus tard 3 jours après le départ. |

Les espèces ne sont pas proposées. Un client qui choisit le chèque ou le
virement n'a **pas de carte enregistrée** : son solde se règle forcément par
lien. Un client qui arrive sans sa caution reçoit, envoyé depuis le
back-office, un lien pour donner sa carte ; la caution repasse alors par la
carte.

**Pourquoi.** L'accueil et le départ se font toujours en personne, ce qui rend
le chèque praticable ; certains clients refusent qu'une carte soit conservée.
Le délai unique de 3 jours garde le contrat simple et laisse voir un dégât
après le ménage.

**Ce qui pourrait mal tourner.** Un samedi soir, un client arrive sans chèque
ni virement reçu, et sans carte enregistrée. Parade : le lien de carte, et
l'article 6 du contrat qui doit dire ce qui se passe ensuite.

**Ce que cette décision ne règle pas.** La rédaction de l'article 6 du contrat
(trois moyens, client arrivé sans caution) et sa relecture par un juriste ;
l'enregistrement comptable d'une caution reçue par virement, qui arrive
réellement sur le compte de la société (question au comptable) ; la collecte
de l'IBAN du client pour la restitution.

**Si on revient dessus.** Les trois moyens seront décrits dans le contrat et
sur les pages publiques : en retirer un sans les reprendre, c'est annoncer un
dispositif qu'on n'applique pas (art. L.121-2 C. conso.).

---

## D-20 · Réservation à moins de 30 jours de l'arrivée : paiement intégral

**Date :** 13 octobre 2026 (cadrage de la Phase 3). Mise en œuvre au lot 3.

**Décision.** Quand la date limite du solde (30 jours avant l'arrivée, réglage
du délai de solde) est déjà passée au moment de réserver, le client paie **le
total** tout de suite. Il n'y a ni acompte, ni solde, ni choix du mode de
règlement du solde.

**Pourquoi.** Le contrat (article 5.1) fixe le solde à J-30 et ne prévoit pas
le cas où cette date est dépassée. Payer le total évite un séjour imminent dont
le solde n'arriverait pas.

**Ce que cette décision ne règle pas.** L'article 5.1 doit prévoir ce cas, et
le juriste le relire. Le comptable doit dire quelle facture on émet pour un
paiement intégral à la réservation (Phase 4, factures automatiques) → réponse
(a) du gérant le 1er novembre 2026, facture unique, à confirmer par le
comptable : D-29.

**Si on revient dessus.** Accepter un acompte avec un solde « sous 48 heures »
crée une relance et un risque d'impayé à quelques jours de l'arrivée ; refuser
la réservation en ligne fait perdre les séjours de dernière minute.

**Mise en œuvre (lot 2, 15 octobre 2026).** Le devis du tunnel (`lib/devis.ts`)
annonce le total à régler dès que la date limite du solde est **atteinte**, jour
limite compris : un client qui réserve le 10 décembre pour le 9 janvier paie
tout, plutôt qu'un acompte le matin et un solde le soir. Le seuil reste le
délai du solde (`DELAI_SOLDE_DEFAUT`), qui deviendra un réglage au lot 3.

**Documents (lot 4, 23 octobre 2026, choix du gérant).** Le contrat ne prévoit
pas ce cas (articles 5.1, 5.2, 5.3 et 7.2) : la rédaction est reportée au
lot 5, avec la réécriture de l'article 5.1. D'ici là, `POST /api/contrats` et
`POST /api/factures` **refusent** une réservation payée en totalité (409),
plutôt que d'émettre un document faux et déjà numéroté. `calculerMontants`
donne acompte = total et solde = 0.

**Contrat (lot 5, 29 octobre 2026, D-26).** Le contrat v3 prévoit ce cas
(articles 5.1, 5.2, 5.3 et 7.2) : il est émis et envoyé comme les autres. Les
factures restent refusées, en attendant le comptable.

---

## D-21 · Blocage des dates pendant le paiement : une ligne par nuit, sans tâche de nettoyage

**Date :** 15 octobre 2026 (Phase 3, lot 2). Durée et moment du blocage : cadrage
du 13 octobre 2026.

**Décision.** À l'arrivée sur l'écran de paiement, le serveur recalcule le
devis, enregistre la réservation « en attente de paiement » et **bloque chacune
de ses nuits** (table `disponibilites`, statut `verrou`, échéance
`verrou_expire_at`), dans une seule transaction (`lib/tunnel.ts`).

- **La double vente est impossible par construction.** Le blocage est UNE
  requête « insérer, ou reprendre un verrou expiré », appuyée sur l'index
  unique (gîte, nuit) (`lib/disponibilites.ts`). Deux clients au même instant :
  PostgreSQL fait attendre le second, puis lui refuse la nuit.
- **Un verrou expiré n'est effacé par aucune tâche** : il est ignoré à la
  lecture et repris par le client suivant.
- **Revenir en arrière lève le blocage**, et la tentative est supprimée avec
  les coordonnées du client : rien n'a été payé ni émis.
- **Une nuit sans ligne est libre.** L'état « libre » stocké est supprimé
  (migration 0004) : deux façons de dire « libre » obligeaient chaque lecteur à
  penser aux deux.

**Pourquoi.** Une ligne par nuit est la forme que la Phase 7 (calendriers des
plateformes, nuit par nuit) et le back-office (fermer une nuit isolée)
utiliseront aussi ; une seule table répond à « cette nuit est-elle prise ? ».

**Ce qui pourrait mal tourner.**
- Un client paie (lot 3) après l'échéance, quand un autre a repris ses nuits :
  c'est le cas prévu au cadrage (remboursement intégral automatique). Le retour
  de paiement devra donc vérifier que les nuits sont **toujours au nom de sa
  réservation**, pas seulement que le paiement a abouti.
- Les tentatives abandonnées sans retour en arrière (page fermée) gardent leurs
  coordonnées : durée de conservation à fixer, effacement en Phase 4
  (`docs/06-avant-premier-client.md`, point 12).
- La limite anti-abus (5 blocages par adresse en 10 minutes) lit l'adresse
  écrite par le proxy. Si le proxy cessait de l'écrire, tous les clients
  partageraient une adresse et la limite deviendrait globale : à vérifier au
  déploiement (`docs/04-architecture.md`).

**Ce qui rendrait l'inverse préférable.** Une tâche de nettoyage, s'il fallait
agir à l'expiration (prévenir quelqu'un) — exclu au cadrage : « aucun courriel
pour une réservation abandonnée ». Un blocage par plage de dates (contrainte
d'exclusion, comme les périodes tarifaires), si les nuits ne devaient jamais
être lues une par une — ce que la Phase 7 contredit.

**Si on revient dessus.** Vérifier la disponibilité puis écrire, en deux
requêtes, laisse passer deux clients simultanés : c'est la double vente.

---

## D-22 · Deux langues, le français sans préfixe et l'anglais sous `/en`

**Date :** 16 octobre 2026 (entre les lots 2 et 3 de la Phase 3). Choix des
propriétaires : site entier sauf le juridique (option B), une adresse par
langue (option A). L'italien est retiré du site, sélecteur et mentions
(réponse du 18 octobre 2026). Les courriels partiront dans la langue du
client (accord du 18 octobre 2026, lot 4).

**Décision.**
- **Le français garde ses adresses** (`/gites/laphine`) ; l'anglais vit sous
  `/en` (`/en/gites/laphine`), mêmes mots dans l'adresse. Toutes les pages sont
  sous `app/[lang]/` ; `middleware.ts` réécrit les adresses sans préfixe vers
  le français et redirige `/fr/…` vers l'adresse sans préfixe (301).
- **Chaque texte est écrit dans les deux langues, côte à côte**, près de ce qui
  l'affiche (`Bilingue<T>`, `lib/i18n/langues.ts`). Une phrase oubliée dans une
  langue est une erreur de compilation.
- **Les calculs ne connaissent pas la langue.** Seuls l'affichage
  (`lib/format.ts` : « €1,234.56 », « 12 January 2027 ») et les messages
  montrés au client (refus du devis, erreurs de coordonnées, réponses de
  `/api/reservations`) en dépendent. Le journal du serveur reste en français.
- **Restent en français :** les pages juridiques (affichées en anglais avec
  « Available in French only »), le contrat, les factures, la page de
  signature et la page de suivi (`/en/signer/…` et `/en/suivi/…` sont des pages
  introuvables), les noms de tarifs saisis par les propriétaires.
- **Le changement de langue dans le tunnel lève d'abord le blocage des dates**
  (D-21), puis rouvre le tunnel dans l'autre langue, dates et voyageurs
  conservés par l'adresse de la page ; les coordonnées, jamais mises dans
  l'adresse, sont à ressaisir.
- **Le site ne bascule jamais seul** selon la langue de l'ordinateur.

**Pourquoi.** Le site existe pour faire réserver en direct (`docs/00-projet.md`).
Une adresse par langue permet à Google de montrer les pages anglaises aux
recherches en anglais (balises hreflang), et un lien partagé s'ouvre dans la
langue où il a été copié. Un cookie de langue sur une adresse unique aurait
caché l'anglais aux moteurs de recherche, et le référencement de la Phase 6
aurait obligé à tout refaire.

**Ce qui pourrait mal tourner.**
- Une traduction juridique faite par une session pourrait être opposée par le
  client : elle viendra d'un traducteur ou du juriste
  (`docs/06-avant-premier-client.md`, point 13).
- Le texte anglais est une traduction fidèle du français, non relue : les
  propriétaires la relisent avant l'ouverture (même point).
- Les courriels du lot 4 devront connaître la langue du client : la
  réservation l'enregistre depuis le lot 3 (`reservations.langue`).

**Si on revient dessus.** Changer une adresse publiée casse les liens partagés
et le référencement : traduire plus tard les mots de l'adresse
(`/en/cottages/…`) imposerait des redirections 301 pour chaque ancienne adresse.

---

## D-23 · Paiement : la carte se saisit sur le site, seul Stripe fait foi

**Date :** 20 octobre 2026 (Phase 3, lot 3). Choix du gérant : payer **sur le
site** plutôt que sur une page Stripe (« ça fait plus pro et ça donne plus
confiance ») ; texte d'accord pour la carte en anglais validé ; écran de
confirmation limité aux faits, et la phrase « Souvent ça passe au second
essai » retirée de l'écran de refus.

**Décision.**
- **Le champ de carte de Stripe est intégré à l'étape 4** (Payment Element,
  `app/[lang]/reserver/PaiementStripe.tsx`), cartes seulement. Les numéros de
  carte ne passent jamais par le serveur du site. Le texte d'accord s'affiche
  sous le champ, le compte à rebours du blocage reste visible.
- **Le champ ne montre que la carte** (choix du gérant, 22 octobre 2026) :
  ni Link (le compte Stripe que Stripe propose d'ouvrir, avec e-mail,
  téléphone et nom, que le client prendrait pour une demande du site), ni la
  phrase d'autorisation de Stripe sous le champ (« vous autorisez … à débiter
  votre carte pour les paiements futurs »), doublon moins précis du texte
  d'accord des propriétaires, qui reste le seul engagement affiché.
- **Le paiement s'ouvre avec le blocage des dates** (`POST /api/reservations`),
  au montant du devis **du serveur**. Revenir en arrière **annule le paiement
  chez Stripe avant** de supprimer la tentative ; un paiement déjà abouti rend
  la réservation engagée.
- **Le serveur ne croit que Stripe.** Deux chemins constatent le paiement : la
  page de retour du client (`/reserver/confirmation`, qui exige le secret du
  paiement) et l'avis signé de Stripe (`/api/stripe/webhook`). Le constat
  (`lib/paiement.ts`) est **idempotent** : ligne `paiements` verrouillée, un
  paiement n'est traité qu'une fois, quel que soit l'ordre d'arrivée.
- **Payé = nuits vendues, ou remboursé.** Les nuits passent de « bloquées » à
  « vendues » en une requête (`vendreNuits`), même après l'échéance si
  personne ne les a reprises. Sinon — ou si le montant reçu diffère d'un
  centime, ou si la réservation est inconnue — **remboursement intégral
  automatique** : l'intention est écrite (`a_rembourser`) avant l'appel à
  Stripe, l'appel porte une clé d'idempotence, une panne se rattrape au constat
  suivant.
- **La carte n'est conservée que pour une caution par carte** (client Stripe et
  `setup_future_usage: off_session`, D-16) ; le prélèvement du solde n'est
  proposé qu'avec elle (D-19).
- **Taux d'acompte, délai du solde et délai du virement de caution sont des
  réglages** (`reglages`). Le taux et le délai du solde sont **recopiés sur
  chaque réservation**, sans valeur par défaut : modifier un réglage ne change
  aucun contrat conclu. Les réservations antérieures ont reçu 30 % et 30 jours.
- **Le texte d'accord est une donnée versionnée** (`textes_accord`, une version
  par langue et par date, immuable par trigger). Le texte affiché est recopié
  mot pour mot sur la réservation, avec sa version. Sans texte en vigueur dans
  chaque langue, le tunnel ne s'ouvre pas.
- **Mode test seulement** : une clé réelle est refusée (`lib/stripe.ts`), et le
  tunnel ne s'ouvre pas sans clés de test. Le passage au réel est le point 14
  de `docs/06-avant-premier-client.md`.

**Pourquoi.** Un client qui quitte le site au moment de payer est un client
qu'on perd plus souvent ; le champ intégré garde aussi le texte d'accord à
l'endroit validé. Le navigateur peut mentir ou se fermer : seul ce que Stripe
répond engage, et l'avis de Stripe confirme même quand le client ferme sa page.
Les conditions figées sur la réservation sont celles que porteront le contrat
et les factures : un réglage modifié demain ne peut pas réécrire un contrat
d'hier.

**Ce qui pourrait mal tourner.**
- **Sans avis de Stripe configuré en production**, un client qui paie puis
  ferme sa page avant le retour reste « en attente » : l'avis est obligatoire
  au déploiement (point 14).
- **Un paiement intégral** (D-20) est enregistré comme tel
  (`reservations.paiement_integral`, paiement de type `total`) ; les documents
  du lot 4 devront l'imprimer sans acompte ni solde — `calculerMontants`
  applique le taux d'acompte à toute réservation.
- **Le courriel au client et l'alerte aux propriétaires** pour un paiement
  remboursé arrivent au lot 4 : d'ici là, le cas n'est que journalisé
  (« PROBLÈME À TRAITER »).

**Si on revient dessus.** Passer à une page Stripe (Checkout) déplace le texte
d'accord et le compte à rebours hors du site. Confirmer sur la seule parole du
navigateur, c'est vendre des nuits sans argent reçu. Supprimer la recopie des
conditions sur la réservation, c'est laisser un réglage réécrire les contrats
déjà signés.

---

## D-24 · Courriels : inscrits avec l'événement, envoyés après, par Brevo

**Date :** 24 au 27 octobre 2026 (Phase 3, lot 4, étape 2). Choix du gérant :
- deux adresses sur le domaine : **reservation@gitesdesamoyas.fr** envoie les
  courriels automatiques et ne reçoit rien ; **contact@gitesdesamoyas.fr** est
  la boîte que lisent les propriétaires. Un client qui clique sur
  « Répondre » écrit à contact@ ;
- le courriel de confirmation ne dit **que des faits**, comme l'écran de
  confirmation, dans la langue du client ;
- les trois alertes (réservation payée, contrat signé, problème) vont à
  **contact@** ; l'objet d'un problème commence par « À TRAITER — » ;
- le **contrat est créé tout de suite** après le paiement, et son lien de
  signature est dans le courriel de confirmation.

**Décision.**
- **Brevo** (API « transactional emails »), domaine gitesdesamoyas.fr
  authentifié chez Brevo (signatures DKIM, DMARC « observer seulement ») ; la
  clé `BREVO_API_KEY` ne permet que l'envoi. Les adresses et les alertes sont
  des **réglages** (`reglages`, table `alertes`), pas du code.
- **Le courriel est inscrit dans la transaction de l'événement** qui le cause
  (paiement constaté, remboursement décidé, contrat signé), dans le journal
  `courriels`, avec une clé unique : constater deux fois n'inscrit rien de plus,
  et un arrêt du serveur ne perd aucun courriel.
- **Il part après la réponse** (`after()` de Next), un à la fois, sa ligne
  verrouillée : la page de retour, l'avis de Stripe, la signature et le tunnel
  déclenchent l'envoi des courriels dus. Échec : nouvel essai après 1, 5, 15,
  60 puis 240 minutes ; au sixième, abandon et alerte « À TRAITER — courriel
  non parti » si le client était le destinataire.
- **Contrat** : créé juste avant la confirmation ; trois échecs, et la
  confirmation part sans le lien, les propriétaires sont alertés, un courriel
  « contrat à signer » retente la création. Paiement intégral : aucun contrat
  (D-20), alerte « À TRAITER — contrat à envoyer à la main ».
- **Jamais d'envoi vers une adresse réservée aux essais** (`example.com`,
  `.invalid`, `.test`…) : le courriel est écrit dans un fichier. Sans clé
  Brevo, tout est écrit dans des fichiers. Dans la base de test, les alertes
  vont à `proprietaires@example.invalid`.
- **Le texte envoyé est gardé** sur la ligne du journal : preuve de ce que le
  client a reçu.

**Pourquoi.** Un courriel envoyé avant que la transaction soit validée peut
annoncer une réservation qui n'existe pas ; envoyé après, sans trace, il peut
se perdre. L'inscrire avec l'événement, puis l'envoyer, évite les deux. Les
envoyer après la réponse évite au client et à Stripe d'attendre Brevo.
Envoyer au nom d'une adresse wanadoo par un service tiers est refusé par
Orange : d'où des adresses sur le domaine des gîtes.

**Ce qui pourrait mal tourner.**
- **Pas de minuterie avant la Phase 4** : un envoi en retard part à la
  prochaine activité du site (visite du tunnel, paiement, avis de Stripe).
- **Double envoi possible**, rare : si le serveur s'arrête entre l'acceptation
  par Brevo et l'écriture du statut, le courriel repart une fois (Brevo n'a pas
  de clé d'idempotence).
- **Les liens des courriels** prennent `NEXT_PUBLIC_SITE_URL`, sinon l'adresse
  de la requête : à renseigner au déploiement (point 15 de
  `docs/06-avant-premier-client.md`).
- **Le texte des courriels est une donnée personnelle** conservée : durée à
  fixer avec le juriste (point 12).

**Si on revient dessus.** Envoyer dans la transaction, c'est bloquer la
réservation sur une panne de Brevo. Envoyer sans journal, c'est perdre des
confirmations sans le savoir. Remettre une adresse personnelle en expéditeur,
c'est finir en indésirables.

---

## D-25 · Page « Ma réservation » : un lien secret, sans compte

**Date :** 28 octobre 2026 (Phase 3, lot 4, étape 3). Choix du gérant :
- la page montre **les faits**, comme la confirmation, plus **l'état du
  contrat** (à signer, avec son bouton ; ou signé, avec le PDF à télécharger),
  l'adresse du gîte et les heures **dès le paiement**, et les contacts. Les
  actions de la maquette qui n'existent pas (modifier ses coordonnées, changer
  de carte, annuler) sont retirées ;
- le lien reste valable **jusqu'à 30 jours après le départ** (réglage) ;
- un lien perdu se redemande par un **formulaire** (adresse e-mail seule), qui
  répond toujours la même phrase ; au plus **3 demandes par heure** et par
  adresse (réglage) ; le formulaire n'est proposé que **sur la page d'un lien
  expiré** (et à l'adresse /suivi, que les propriétaires peuvent donner) ;
- le courriel de confirmation porte un **second bouton** « Voir ma réservation » ;
- une réservation remboursée affiche « n'a pas pu être confirmée » et le
  remboursement ;
- la page est dans la langue du lien, celle du client.

**Décision.**
- **Un jeton secret par réservation**, `reservations.jeton_suivi` :
  64 caractères hexadécimaux tirés par la base à la création de la ligne
  (deux UUID aléatoires, 244 bits de hasard). La **référence** de la
  réservation, courte et devinable, ne donne plus accès à rien (la maquette
  ouvrait la page par la référence).
- **Validité calculée à l'affichage** : départ + `reglages.suivi_validite_jours`.
  Changer le réglage vaut aussi pour les réservations déjà faites, à la
  différence des conditions de paiement, figées sur chaque réservation.
- **Une seule réponse** pour un jeton inconnu, une réservation jamais payée et
  un lien expiré : « Ce lien n'est pas valable ou a expiré », avec le
  formulaire.
- **Formulaire** : un courriel « lien_suivi » par réservation encore ouverte
  de l'adresse (payée ou remboursée), dans sa langue, inscrit dans le journal
  des courriels (D-24). La limite compte les demandes dans ce journal : une
  adresse inconnue n'écrit rien.
- **Page ni indexée, ni mise en cache, ni transmise** (en-tête « no-referrer »)
  aux sites vers lesquels elle pointe.

**Pourquoi.** Un client ne crée pas de compte pour un séjour par an ; un lien
dans sa boîte suffit, comme le lien de signature. Une réponse unique et une
limite empêchent de savoir qui a réservé et d'inonder la boîte d'un client.

**Ce qui pourrait mal tourner.**
- **Qui a le lien voit le séjour** (adresse, dates, montants) et **peut signer
  le contrat** : le bouton mène au lien de signature. C'est le niveau de
  protection du courriel de confirmation, qui porte déjà les deux liens.
- **Après la date limite**, la page est fermée même pour le client : une
  question tardive passe par contact@.
- La page est la **Phase 3** : le solde, la caution et une annulation n'y
  apparaissent que comme des faits, sans action, jusqu'aux phases 4 et 5.

**Si on revient dessus.** Ouvrir la page par la référence, c'est livrer
l'adresse et les montants de chaque client à qui devine une référence. Dire
« aucune réservation pour cette adresse », c'est permettre de savoir qui
séjourne aux gîtes.

---

## D-26 · Annulation : la date du solde, puis 48 heures ; la taxe de séjour toujours rendue

**Date :** 29 octobre 2026 (Phase 3, lot 5). Choix du gérant :
- l'acompte est **remboursé** si le client annule **avant la date limite du
  solde** (30 jours avant l'arrivée), donc tant que le solde n'est pas payé ;
  il est **conservé** ensuite ;
- le solde est **remboursé jusqu'à 48 heures avant l'arrivée**. Ce délai
  « reste à voir », le gérant ne décidant pas seul : point 16 de
  `docs/06-avant-premier-client.md` ;
- la date limite de l'acompte **est** celle du solde (pas un réglage à part) ;
- un séjour payé en une fois suit la même règle : la part de l'acompte est
  conservée, le reste remboursé jusqu'à 48 heures avant ;
- la taxe de séjour **s'ajoute au prix du séjour** et se paie avec lui, à
  la réservation (D-07 : l'acompte porte sur le total, taxe incluse) ; elle
  est **remboursée dans tous les cas d'annulation** ;
- une retenue sur une caution par chèque se fait en encaissant le chèque et
  en rendant la différence au client (gérant, 29 octobre 2026).

Même lot : article 6 réécrit pour les trois moyens de caution (D-19), contrat
des séjours payés en une fois (D-20), contact@ des réglages à la place de
l'adresse wanadoo, taxe collectée pour Annonay Rhône Agglo (art. 4.4).

**Décision.**
- **Contrat v3** (`lib/contrat.ts`, `TEMPLATE_VERSION`) : articles 4.4, 5
  (deux variantes : acompte et solde, ou paiement intégral), 6, 7.2, 7.5 et
  10.4. Le contrat d'un séjour payé en une fois est émis et envoyé comme les
  autres : l'alerte « contrat à envoyer à la main » disparaît.
- **Ce que le Bailleur conserve** après la date du solde : le taux d'acompte de
  la réservation appliqué au prix **hors taxe de séjour**, arrondi au centime
  (`retenueAnnulation`, `lib/montants.ts`). L'article 7.2 imprime ce montant.
- **Deux délais recopiés sur chaque réservation**, comme le taux de l'acompte
  (migration 0008) : `delai_remboursement_solde_heures` (48) et
  `delai_virement_caution_jours` (3, D-19). Les changer dans les réglages ne
  modifie aucun contrat déjà conclu.
- **La date limite des 48 heures** se calcule sur les valeurs civiles de
  l'arrivée (jour et heure), sans fuseau : « 18 mars 2027 à 18 h 00 ».
- **Les factures d'un séjour payé en une fois restent refusées** (409) : la
  facture à émettre attend le comptable (D-20, Phase 4).
- **Les CGV du site** (§ 02 à 04) renvoient au contrat pour les dates et
  montants, sans chiffre qui doublerait un réglage.
- **La note des avis de l'accueil** (4,97/5, 46 avis, 100 %) devient un réglage
  (`avis_note_centiemes`, `avis_nombre`, `avis_recommandation_pct`), masquée si
  elle n'est pas renseignée.

**Pourquoi.** Le « 7 jours » imprimé jusque-là contredisait l'échéancier : un
client qui annulait 10 jours avant avait déjà payé le solde, et le contrat ne
disait pas ce qu'il devenait. La taxe de séjour n'est due que si le séjour a
lieu : la garder serait garder un argent qui n'est pas celui de la société.

**Ce qui pourrait mal tourner.** Les textes des articles 5, 6 et 7.2 sont
rédigés par une session, validés par le gérant, **pas encore relus par le
juriste** ; cinq questions précises sont posées au point 3 de
`docs/06-avant-premier-client.md`. Le site n'annule pas encore une réservation
lui-même : un remboursement se fait à la main, depuis Stripe.

**Si on revient dessus.** Changer la règle, c'est un contrat v4 et les CGV
§ 03 dans le même commit. Un contrat déjà signé garde la règle qu'il imprime.

---

## D-27 · Tout régler maintenant, au choix du client

**Date :** 30 octobre 2026 (Phase 3, après le lot 5). Choix du gérant :
- le client qui réserve **avant** la date limite du solde peut tout payer à la
  réservation : troisième possibilité du bloc « Le solde », **« Tout régler
  maintenant »** (« Vous payez … aujourd'hui, il n'y a plus de solde. ») ;
- **aucune réduction** : le même total, payé plus tôt ;
- **l'annulation suit la règle habituelle (D-26)** : tout est remboursé
  jusqu'à la date limite du solde ; ensuite la part de l'acompte, hors taxe de
  séjour, est conservée et le reste remboursé jusqu'à 48 heures avant
  l'arrivée ; passé ce délai, seule la taxe de séjour est remboursée.

**Décision.**
- **Aucune colonne nouvelle.** La réservation porte `paiement_integral = true`
  et `mode_solde` vide, comme un paiement intégral imposé (D-20). Le choix
  « integral » n'existe que dans le tunnel (`ModeReglement`, `lib/reglement.ts`).
- **Choisi ou imposé se déduit des dates** (`integralChoisi`,
  `lib/montants.ts`) : choisi si le jour de réservation (heure de Paris) est
  antérieur à la date limite du solde recopiée sur la réservation ; le tunnel
  impose le paiement intégral exactement à partir de ce jour (`lib/devis.ts`).
- **Le devis du serveur fait foi** : `devisToutRegler` (`lib/devis.ts`) met le
  total à payer et retire la date du solde ; les montants gardent l'acompte,
  dont la part sert à l'annulation. Choisi avec une arrivée trop proche, il est
  ignoré comme tout choix du solde (D-20).
- **Contrat v4** : article 5.1 « Le Locataire a choisi de régler le prix total
  du séjour en une fois, lors de la réservation. Il n'y a pas de solde. » ;
  l'article 7.2 garde ses trois cas (avant la date du solde, jusqu'à
  48 heures, ensuite).
- La carte n'est enregistrée que pour une caution par carte, comme avant. Les
  factures d'un séjour payé en une fois restent refusées (comptable, D-20).

**Pourquoi.** Certains clients préfèrent tout payer d'un coup ; le site savait
déjà encaisser le total et rédiger le contrat d'un séjour sans solde (D-26).

**Ce qui pourrait mal tourner.** Une réservation enregistrée à minuit pile le
jour de la date limite serait lue « imposée » alors que le client a vu
« choisie » : seule la phrase de l'article 5.1 en dépend, pas les montants ni
les dates de l'article 7.2.

**Si on revient dessus.** Retirer le choix, c'est retirer la troisième case
du tunnel ; les contrats déjà émis gardent leur texte. Ajouter une réduction,
c'est un réglage, un calcul dans `lib/montants.ts` et un contrat v5.

---

## D-28 · Le solde, automatique

**Date :** 1er novembre 2026 (Phase 4, lot 1). Choix du gérant au cadrage de la
phase (réponses 1A, 2A, 3A, 7A) :
- **prélèvement** : courriel de préavis 7 jours avant la date limite du solde,
  prélèvement sur la carte enregistrée le jour de la date limite ;
- **lien** : courriel avec le lien de paiement 7 jours avant, rappel la veille ;
- **impayé** (prélèvement refusé, ou lendemain de la date limite pour le
  lien) : courriel au client avec le lien, alerte « À TRAITER » aux
  propriétaires ; seconde alerte 3 jours après si rien n'est payé. **La mise
  en demeure et la résiliation (article 5.3) restent la décision des
  propriétaires : le site ne résilie jamais tout seul** ;
- **le réveil** : une tâche programmée de Coolify appelle le site toutes les
  15 minutes, plutôt qu'une minuterie interne qui s'arrête à chaque redémarrage.

**Décision.**
- **Délais en réglages**, lus à chaque passage (`reglages.solde_preavis_jours`,
  `solde_lien_jours`, `solde_rappel_jours`, `solde_relance_jours`, migration
  0009) : ce sont des délais de courriel, pas des conditions du contrat. La date
  limite du solde, elle, reste figée sur la réservation (`delai_solde_jours`).
- **Le réveil** : `POST /api/taches`, protégée par `TACHES_SECRET` (en-tête
  `x-taches-secret`), refusée sans secret ni `NEXT_PUBLIC_SITE_URL` (les liens
  des courriels). Un seul passage à la fois (verrou de la base). Chaque passage
  regarde **où en est chaque réservation**, pas l'heure : un passage manqué est
  rattrapé par le suivant (`lib/taches.ts`, `lib/solde.ts`).
- **Jamais deux prélèvements** : la ligne `paiements` du prélèvement est écrite
  **avant** l'appel à Stripe, sans référence ; la clé d'idempotence
  `prelevement-{réservation}` fait rejouer le même appel après une panne. Une
  ligne restée sans réponse plus de 20 heures n'est plus rejouée (la clé de
  Stripe dure 24 heures) : alerte « à vérifier dans Stripe ».
- **Le lien mène à « Ma réservation »** (bloc « Votre solde », bouton « Payer
  le solde », `POST /api/suivi/solde`), authentifiée par le jeton secret comme
  la page. Le paiement ouvert est réutilisé à chaque clic ; un prélèvement
  refusé se règle **sur le même paiement**, avec authentification de la banque.
- **Le constat** (`lib/paiement.ts`) reconnaît le solde : inscrit, facturé,
  sans toucher aux nuits ni au statut. Un avis de Stripe arrivé avant que le
  prélèvement ait sa référence est « à reprendre » (500, Stripe renvoie), jamais
  remboursé. Un solde reçu pour une réservation qui n'est plus confirmée est
  remboursé, sans courriel au client (les propriétaires l'appellent) et **sans
  oublier la carte**, qui sert à la caution.
- **Une clé d'idempotence par sorte de paiement** (`paiement-…`, `solde-…-n`,
  `prelevement-…`) : avec une seule clé par réservation, Stripe aurait renvoyé
  l'acompte quand on lui demandait le solde.
- Les courriels du solde relisent son état à l'envoi : payé entre-temps, ils
  ne partent pas.

**Pourquoi.** Un séjour doit se dérouler sans que les propriétaires y pensent
(objectif de la Phase 4), et un impayé ne doit jamais être un silence.

**Ce qui pourrait mal tourner.** Si la tâche programmée n'est pas créée au
déploiement, **rien d'automatique ne se fait** : ni préavis, ni prélèvement, ni
relance (point 18 de `docs/06-avant-premier-client.md`). Une banque qui exige
l'authentification pour un prélèvement hors session le refuse : c'est le cas
prévu, le client reçoit le lien.

**Si on revient dessus.** Changer un délai : un réglage. Supprimer le
prélèvement automatique : le contrat (article 5.1) et le tunnel le proposent ;
il faudrait les modifier aussi.

---

## D-29 · Factures automatiques, et facture unique d'un séjour payé en une fois

**Date :** 1er novembre 2026 (Phase 4, lot 1). Choix du gérant :
- chaque facture est **émise au paiement et envoyée au client en PDF** par
  courriel (réponse 4A) ;
- un séjour payé en une fois à la réservation (D-20, D-27) reçoit **une seule
  facture, émise le jour du paiement** : réponse (a) du gérant à la question
  posée au comptable. **À confirmer par le comptable avant le premier client**
  (point 17 de `docs/06-avant-premier-client.md`).

**Décision.**
- **`lib/factures.ts`** porte l'émission, déplacée de la route
  `POST /api/factures` (qui l'appelle toujours, pour le même résultat). Le
  courriel « facture » l'appelle à l'envoi et joint le PDF : la facture et son
  courriel ne se perdent pas l'un sans l'autre, et une émission qui échoue se
  retente pour **le même numéro**.
- **Type `total`** dans `factures` (migration 0009) et PDF
  `components/pdf/FactureTotalPDF.tsx` : titre « Facture », objet « Location
  saisonnière en meublé de tourisme », montant « Prix total du séjour » ; les
  autres phrases sont celles, validées, de la facture de solde. Textes validés
  par le gérant le 1er novembre 2026.
- **Une seule facture de chaque type par réservation** (index unique
  `(reservation_id, type)`) : deux émissions simultanées ne frappent pas deux
  numéros ; l'incrément du compteur s'annule avec l'insertion refusée.
- La facture imprime **la date et la référence du paiement qu'elle constate**
  (ligne `paiements`) ; avant, la facture de solde aurait repris la référence
  de l'acompte. Sans ligne `paiements` (parcours de non-régression), rien ne
  change.
- Un refus métier à l'émission (aucun numéro frappé) produit l'alerte
  « À TRAITER — facture non émise ».

**Pourquoi.** Une facture se remet au client ; l'émettre à la main à chaque
paiement serait oublié.

**Ce qui pourrait mal tourner.** Si le comptable répond autre chose que (a),
les factures « total » déjà émises restent (une facture ne se supprime pas) :
il faudrait des avoirs. Le site n'étant pas en ligne, aucune facture réelle
n'est émise avant sa réponse.

**Si on revient dessus.** Une autre forme de facture pour le paiement en une
fois : un autre type, un autre composant PDF, et `inscrireApresPaiement`
(`lib/courriels.ts`) qui choisit le type.

---

## D-30 · La caution par carte, construite

**Date :** 2 novembre 2026 (Phase 4, lot 2). Met en œuvre D-16. Choix du
gérant (exemple : Camille quitte L'Armu le samedi 27 mars 2027, caution de
500 €) :
- **préautorisation refusée** le vendredi 26 à 18 h : courriel tout de suite au
  client avec un lien pour la valider (même carte ou une autre), alerte « À
  TRAITER » aux propriétaires ; **le site ne réessaie pas tout seul** (1A) ;
- la validation se fait sur **« Ma réservation »**, bloc « Votre caution » (2A) ;
- **alerte le lundi 29 à 8 h, levée le mardi 30 à 8 h**, heures en réglages (3A) ;
- **caution non constituée à l'arrivée** (art. 6.6) : le lien et la page sont
  construits ; le bouton « envoyer le lien au client » arrive avec l'écran de
  gestion (Phase 5), puisque ce sont les propriétaires qui voient s'il manque
  le chèque (4A) ;
- **un court message aux propriétaires** quand la caution est bloquée (5).

Choix annoncés au cadrage du 1er novembre, sans objection : la caution est
une ligne `paiements` de type `caution` ; son montant est figé sur la
réservation ; plus de `CAUTION_DEFAUT`.

**Décision.**
- **Montant figé** : `reservations.caution` (migration 0010), recopié du gîte
  par le tunnel ; le contrat l'imprime, la carte le bloque. Une réservation
  sans montant n'a **ni contrat** (refusé avant qu'un numéro soit tiré) **ni
  préautorisation** (alerte « À TRAITER »). `CAUTION_DEFAUT` est supprimé.
- **Une préautorisation par réservation** (`paiements`, index unique ; clé
  d'idempotence `caution-{réservation}`), écrite **avant** l'appel à Stripe
  comme le prélèvement du solde (rejouée moins de 20 heures après, alerte
  au-delà). États : `bloque`, `echoue`, `libere`, `retenu`, `annule` ; la
  date limite de la banque (`capture_before`) est lue sur la charge et
  enregistrée (`expire_at`), jamais recalculée.
- **Le calendrier** (`lib/caution.ts`, appelé par le réveil) : préautorisation
  la veille du départ à partir de `caution_heure_blocage` (rattrapée le jour
  du départ si le passage du soir a manqué) ; alerte la veille de la levée à
  `caution_heure_alerte` ; levée au troisième jour à `caution_heure_liberation`
  (avant midi, imposé par la base) ; la réservation passe « terminée » ; la
  carte est supprimée chez Stripe (`detach`) dès la levée ou la retenue, au
  plus tard 7 jours après le départ, tout de suite pour une réservation
  annulée. Les **jours** (veille, 3, 7) sont ceux du contrat et du texte
  d'accord : des constantes, pas des réglages.
- **Valider sa caution** : le client confirme la **même** préautorisation sur
  sa page (`POST /api/suivi/caution`), avec authentification de sa banque.
  **Article 6.6** : la page enregistre une carte sans paiement (SetupIntent),
  sous le texte d'accord du tunnel, recopié sur la réservation ;
  `demanderCarteCaution` (pour le bouton de la Phase 5) envoie le lien.
- **Retenue** : construite en Phase 5. D'ici là, une retenue faite dans le
  tableau de bord Stripe est constatée par l'avis de Stripe et enregistrée
  (`retenu`, `montant_retenu`).
- **Avis de Stripe** : en plus, `payment_intent.amount_capturable_updated`
  (caution bloquée), `setup_intent.succeeded` / `setup_failed` (carte
  enregistrée), `charge.dispute.created` (paiement contesté → alerte « À
  TRAITER »). Une préautorisation n'est **jamais remboursée** par le constat.
- **Alertes** : nouvelle sorte `caution` (bloquée, levée demain, carte
  enregistrée), activable à part ; un refus est un « problème ».

**Pourquoi.** Le délai contractuel de restitution (3 jours) doit tenir même
si personne n'y pense, et un refus de la banque la veille du départ doit
laisser aux propriétaires le temps d'agir (le client est encore sur place).

**Ce qui pourrait mal tourner.** Sans la tâche programmée (point 18), rien
n'est bloqué ni levé. Sans les nouveaux événements déclarés chez Stripe
(point 14), une caution validée par le client ou une contestation ne sont
vues qu'au passage suivant, ou pas du tout pour la contestation. Une carte
dont la banque fixe une date limite antérieure au troisième jour est levée
par la banque elle-même : le site le constate.

**Si on revient dessus.** Changer une heure : un réglage. Changer un nombre
de jours : le contrat (art. 6.2, 6.4, 6.5), le texte d'accord et
`lib/caution.ts`, ensemble (D-16, « Si on revient dessus »).

---

## Décisions ouvertes

Elles ne sont **pas tranchées** et ne doivent pas l'être dans le code.

### DO-01 · Qui est le bailleur juridique des trois gîtes ?

**La question.** Les trois gîtes sont-ils loués par la **SARL DE LA VOUTE**, ou
par Patricia et Nicolas Terrafina **en nom propre** ?

**Pourquoi c'est la même question que la TVA.** De la réponse découlent trois
choses qui doivent être cohérentes entre elles :
1. **l'éditeur du site** dans les mentions légales (art. 6-III LCEN) ;
2. **la déclaration des revenus locatifs** (résultat de la société, ou revenus
   fonciers / BIC des personnes) ;
3. **l'application de l'exemption de TVA de l'article 261 D 4° du CGI**, que les
   factures affichent déjà (`lib/constantes.ts`, `MENTIONS.tva`). Cette
   exemption vise la location de locaux d'habitation meublés ; elle **cesse de
   s'appliquer** quand l'exploitant fournit des prestations de type hôtelier
   (accueil, ménage en cours de séjour, fourniture de linge, petit-déjeuner).
   Le forfait ménage de 80 € facturé systématiquement doit être qualifié.

**État actuel du dépôt, qui est incohérent.** Le contrat et les factures
engagent la **SARL DE LA VOUTE** (RCS Annonay 831 170 782). Les mentions légales
publiées sur le site annoncent Patricia et Nicolas Terrafina « exploitants **en
nom propre** », avec un **SIRET factice** (`000 000 000 00000`). Le SIRET faux
est une **conséquence** de cette incohérence, pas un point distinct : il
disparaîtra quand l'identité sera arrêtée.

**Ce qu'il faut pour trancher.** Une seule question posée **une fois** au
comptable, couvrant les trois volets. Voir `docs/03-conformite.md` § TVA et
§ mentions légales, et `docs/06-avant-premier-client.md`.

**Qui peut lever :** le comptable, avec les propriétaires.

### DO-02 · Quel médiateur de la consommation, et l'adhésion est-elle en cours ?

**La question.** Deux médiateurs différents sont annoncés aux clients :
**MEDICYS** sur les factures (`lib/constantes.ts`) et **MTV — Médiation Tourisme
Voyage** dans les CGV du site (`lib/data/legal.ts`). Lequel est le bon, et
**existe-t-il une adhésion en cours**, à qui, depuis quand ?

**Détail utile sans trancher :** MTV est le médiateur **du secteur du tourisme**
(hébergement, voyage) ; MEDICYS est un médiateur **généraliste**, issu de la
chambre nationale des commissaires de justice. Les deux sont référencés. Le
choix relève du secteur d'activité et du coût d'adhésion, pas de la technique.

**Qui peut lever :** les propriétaires (c'est eux qui adhèrent et paient).

Voir `docs/03-conformite.md` § médiation.
