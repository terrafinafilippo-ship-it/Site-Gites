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
