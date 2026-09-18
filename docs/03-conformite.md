# Conformité — les obligations légales et ce qui les satisfait

> Ce fichier est mis à jour quand une obligation est ajoutée, ou quand un écart
> est ouvert ou refermé. Chaque écart porte la phase qui doit le traiter.

Pour chaque obligation : **la règle**, **où elle est implémentée**, **comment on
vérifie qu'elle tient**, et **l'écart** s'il y en a un.

Un document qui affirme une conformité qui n'existe pas est pire qu'un document
absent, parce qu'on s'y fie. Les écarts ci-dessous sont donc écrits en toutes
lettres.

**Synthèse des écarts ouverts au 16 septembre 2026 :**

| # | Écart | Gravité | Phase | Qui peut lever |
|---|---|---|---|---|
| E-1 | Identité du bailleur incohérente entre le site et les documents ; SIRET factice publié | Bloquant | 6 | Le comptable |
| E-2 | Deux médiateurs annoncés ; adhésion non prouvée | Bloquant | 6 | Les propriétaires |
| E-3 | Aucune règle sauna dans le contrat, alors que le consentement en fait accepter | Bloquant | 6 | Développement |
| E-4 | Swikly engagé par contrat sans intégration existante | Bloquant | 4 | Arbitrage + développement |
| E-5 | Options facturées sous un intitulé générique | Bloquant | 5 | Développement |
| E-6 | Adresse IP du signataire falsifiable | Bloquant | Déploiement | Développement |
| E-7 | Identité légale recopiée en dur dans les PDF, hors de `lib/constantes.ts` | Faible | 6 | Développement |

---

## 1. Numérotation continue des documents — article 289 du CGI

**La règle.** Une facture porte un numéro **unique, chronologique et continu**.
Pas de doublon, pas de trou dans la suite. Un trou est interprété en contrôle
fiscal comme une facture émise puis dissimulée, et c'est à l'entreprise de
prouver le contraire.

**Où c'est implémenté.**
- Table `compteurs_documents` (`db/schema/compteurs-documents.ts`) : une ligne
  par série (`FAC`, `CTR`) et par année.
- Fonction SQL `prochain_numero(série, année)`
  (`db/migrations/0001_fonctions_triggers.sql`) : `UPSERT` qui verrouille la
  ligne du compteur jusqu'à la fin de la transaction. Elle renvoie la **chaîne
  déjà formatée** (`FAC-2026-001`), avec au moins trois chiffres et **sans
  troncature** au-delà de 999.
- Fonction SQL `creer_facture(...)` : **seul** point d'entrée pour créer une
  ligne `factures`. Elle appelle `prochain_numero` dans **sa propre
  transaction** : un échec rend le numéro.
- Côté contrats : `app/api/contrats/route.ts` appelle `prochain_numero('CTR', …)`
  à l'intérieur de la transaction qui insère la ligne `documents`.

**Comment on vérifie.**
- `npm run db:verify` contrôle l'existence des fonctions, l'unicité du numéro et
  compare les compteurs avant et après un `ROLLBACK` — une transaction annulée
  ne doit rien consommer.
- `scripts/parcours/controler.ts` vérifie, après le parcours complet, que les
  numéros émis sont `CTR-2026-001`, `CTR-2026-002`, `FAC-2026-001` à
  `FAC-2026-004`, **sans trou**, et que re-poster les mêmes documents ne
  consomme aucun numéro (idempotence).
- Après toute restauration de sauvegarde : comparer à la main le dernier numéro
  de `compteurs_documents` au dernier numéro présent dans `factures` et
  `documents` (procédure dans `db/README.md`).

**Écart :** aucun.

**Interdits permanents :** insérer dans `factures` sans passer par
`creer_facture` · modifier `compteurs_documents` à la main · supprimer une
facture (une erreur se corrige par un avoir) · reconstruire le format du numéro
ailleurs que dans `prochain_numero`.

---

## 2. Mentions obligatoires des factures — article L.441-9 du Code de commerce

**La règle.** Une facture doit identifier le vendeur et l'acheteur, porter sa
date, son numéro, et la **dénomination précise** des produits ou services
rendus, ainsi que le prix unitaire et la somme due.

*Précision utile :* l'article L.441-9 vise les factures **entre professionnels**.
Les gîtes facturent des particuliers : l'obligation équivalente est la **note de
prestation de services** (arrêté du 3 octobre 1983, obligatoire au-delà de
25 € TTC). L'exigence pratique est **identique** : nommer ce qui a été vendu.

**Où c'est implémenté.** `components/pdf/FactureAcomptePDF.tsx` et
`FactureSoldePDF.tsx` : identité de l'émetteur (SARL DE LA VOUTE, capital, RCS,
SIRET), identité du client, numéro et date issus de la ligne `factures`,
détail des postes (location, forfait ménage, options, taxe de séjour), total TTC.

**Comment on vérifie.** `scripts/parcours/controler-pdf.py` lit le texte des PDF
produits et contrôle que chaque montant attendu y figure et que **les lignes
s'additionnent jusqu'au sous-total**. Le contrôle visuel (`--png`) reste
nécessaire : un PDF peut être exact et illisible.

**Écart E-5 (bloquant, Phase 5).** La table `reservations` porte un **montant**
d'options mais **aucun libellé**. Les documents affichent l'intitulé générique
« Options ». Une ligne « Options — 25,50 € » ne désigne pas ce qui a été vendu :
ce n'est pas une dénomination précise. À lever en Phase 5 (ajout du libellé en
base et affichage dans les trois composants PDF et la page de signature).

**Écart E-7 (faible, Phase 6).** `lib/constantes.ts` déclare `EMETTEUR` et
`MENTIONS` (raison sociale, capital, RCS, SIRET, mention de TVA, médiateur),
mais **aucun fichier ne les importe** : les trois composants PDF recopient ces
valeurs en texte littéral. Conséquence : corriger `lib/constantes.ts` ne change
**rien** aux documents produits. Toute correction d'identité doit aujourd'hui
être faite aux quatre endroits. À traiter en même temps que E-1.

---

## 3. Signature électronique — eIDAS et article 1367 du Code civil

**La règle.**
- **Article 3 point 10 du règlement eIDAS** (n° 910/2014) : définition de la
  signature électronique simple.
- **Article 25 d'eIDAS** : on ne peut pas refuser à une signature électronique
  sa valeur juridique **au seul motif** qu'elle est simple.
- **Article 1367 du Code civil** : la signature électronique a la valeur d'une
  signature manuscrite **si** le signataire est identifié **et** l'intégrité de
  l'acte garantie.

**Où c'est implémenté.**
- Table `signatures` (`db/schema/signatures.ts`) : nom du signataire, courriel,
  jeton utilisé, **texte de consentement mot pour mot**, horodatage, adresse IP,
  **empreinte SHA-256 du PDF exact signé**, chemin du fichier haché.
- `app/api/contrats/signer/route.ts` : le hachage porte sur **les octets stockés
  tels quels**, jamais sur un PDF régénéré (sinon l'empreinte ne prouve plus rien).
- **Immutabilité** : un trigger `BEFORE UPDATE OR DELETE` refuse toute
  modification (`db/migrations/0001_fonctions_triggers.sql`). Index unique : une
  seule preuve par document.
- Texte de consentement : `lib/constantes.ts`, fonction `texteConsentement`.
  **Le modifier change la preuve** : ne pas le reformuler sans décision métier.
- Le contrat décrit la signature **exactement pour ce qu'elle est** : simple
  (SES), recueillie par le bailleur, sans prestataire tiers.

**Comment on vérifie.** Le parcours de test signe un contrat, contrôle que la
preuve existe, que le PDF signé est écrit à un chemin distinct, que le statut
passe à `signe`, et qu'une **seconde signature est refusée (409)**. Un lien
inconnu et un lien expiré sont également éprouvés.

**Écart E-6 (bloquant, au déploiement).** L'adresse IP est lue dans les en-têtes
`x-forwarded-for` puis `x-real-ip` (`app/api/contrats/signer/route.ts`,
fonction `extraireIp`). Ces en-têtes sont **écrits par le client** tant qu'un
proxy de confiance ne les réécrit pas : n'importe qui peut aujourd'hui faire
enregistrer l'adresse de son choix. Une preuve dont un élément est fourni par la
personne à qui on l'oppose ne vaut rien. À lever au déploiement (voir
`docs/06-avant-premier-client.md`).

---

## 4. Données personnelles — RGPD (article 14 du contrat)

**La règle.** Informer la personne du responsable du traitement, des données
collectées, des finalités et de leurs bases légales, des destinataires, des
durées de conservation et de ses droits.

**Où c'est implémenté.** Article 14 du contrat
(`components/pdf/ContratPDF.tsx`, 14.1 à 14.6) :
- **14.1** responsable : SARL DE LA VOUTE, contact `nicolas.terrafina@wanadoo.fr` ;
- **14.2** données, y compris les **données de signature** (identifiant
  technique, horodatage, IP, empreinte SHA-256) ;
- **14.3** bases légales : exécution du contrat (art. 6.1.b), obligation légale
  comptable (6.1.c), intérêt légitime (6.1.f), consentement pour la prospection
  (6.1.a) ;
- **14.4** destinataires : hébergeur (OVH SAS, France), **Swikly**, prestataire
  de paiement, expert-comptable, autorités sur réquisition — avec la précision
  que **la signature est recueillie sans prestataire tiers** ;
- **14.5** durées : contrat et pièces comptables 10 ans · registre des occupants
  1 an · prospection 3 ans · signature 10 ans ;
- **14.6** droits et réclamation auprès de la CNIL.

**Comment on vérifie.** Lecture de l'article 12/14 sur un PDF réellement produit
(le contrôle automatique ne lit pas la pertinence juridique d'un texte).

**Écart.** Voir E-4 : l'article 14.4 déclare Swikly comme destinataire de
données, alors qu'aucune intégration n'existe. Une déclaration de destinataire
inexacte est un défaut d'information, dans un sens comme dans l'autre.

**Point de vigilance.** L'immutabilité de la table `signatures` entre en tension
avec le **droit à l'effacement**. Un effacement légitime exige de désactiver
explicitement le trigger le temps de l'opération, après décision humaine tracée.
C'est documenté dans la migration 0001 et volontaire.

---

## 5. Pratique commerciale trompeuse — article L.121-2 du Code de la consommation

**La règle.** Est trompeuse la pratique qui repose sur des allégations fausses
ou de nature à induire en erreur, portant notamment sur les **caractéristiques
essentielles du service**, les **conditions de vente** ou l'**identité du
professionnel**. Peu importe l'intention : c'est l'effet sur le consommateur qui
compte.

**Où ça se joue ici.** Chaque fois qu'un document ou une page **annonce un
mécanisme qui n'existe pas**. Le précédent est connu : en Phase 1, les documents
annonçaient une signature électronique « avancée » alors qu'elle était simple.
Corrigé en décrivant exactement ce qui existe.

**Écart E-4 (bloquant, Phase 4) — le dossier Swikly.** Le contrat engage la SARL
DE LA VOUTE sur un dépôt de garantie constitué par **empreinte bancaire
pré-autorisée chez Swikly**, avec une clause en encadré affirmant que
l'empreinte **ne constitue pas un encaissement**, et un délai de mainlevée de
7 jours. Le site l'annonce au client sur trois pages. **Aucune intégration
Swikly n'existe dans le code** : aucun appel, aucune clé, aucun webhook. Signer
ce contrat sans le service, c'est promettre par écrit un mécanisme qui n'existe
pas.

Emplacements à traiter **ensemble** — la liste est plus longue que celle du
journal de Phase 1 :

| Emplacement | Nature |
|---|---|
| `components/pdf/ContratPDF.tsx` art. 6.2, 6.3, 6.5 | Clause contractuelle |
| `components/pdf/ContratPDF.tsx` ligne « Caution (Swikly) » du récapitulatif | Récapitulatif |
| `components/pdf/ContratPDF.tsx` art. 14.4 | Destinataire RGPD |
| `app/gites/[slug]/page.tsx` | Page publique |
| `app/reserver/ReserverFunnel.tsx` (4 endroits) | Page publique |
| `app/suivi/[ref]/page.tsx` | Page publique |
| **`lib/data/legal.ts` — CGV et politique cookies** | **Pages publiques `/legal/cgv` et `/legal/cookies`** |
| `docs/contrat-template.md`, `docs/facture-template.md` | Documents de rédaction |

Les deux pages légales **ne figuraient pas** dans la liste de la Phase 1 : le
journal parlait de « trois pages du site ». Il y en a cinq.

Les fichiers `.html` de la racine et `admin/` en contenaient aussi : ils ont été
**supprimés en Phase 2** (commit `e341c01`), il n'y a donc plus rien à y faire.

**Les deux issues sont acceptables ; l'état actuel ne l'est pas.** Soit Swikly
est mis en service (Phase 4), soit toute mention en est retirée et le mécanisme
réellement appliqué est décrit.

**Écart E-1 (bloquant, Phase 6) — identité du professionnel.** Voir § 9.

---

## 6. Conservation des pièces — article L.123-22 du Code de commerce

**La règle.** Les documents comptables et les pièces justificatives sont
conservés **dix ans**.

**Où c'est implémenté.**
- La **ligne en base** est le document légal (voir `docs/02-decisions.md`, D-05) :
  `factures`, `documents`, `signatures` ne sont jamais supprimées, et
  `factures.donnees` contient un instantané complet et auto-décrit
  (`unite: "centimes"`, `formatVersion: 2`) suffisant pour reconstituer le PDF.
- Les PDF vivent sur le **volume persistant** du VPS (`lib/storage.ts`).
- Sauvegardes quotidiennes de la base par Coolify vers Cloudflare R2, avec
  procédure de restauration écrite (`db/README.md`).
- Le contrat annonce cette durée au client (art. 14.5).

**Comment on vérifie.** Restaurer une sauvegarde sur une base vierge, appliquer
les migrations, lancer `npm run db:verify`, et comparer les compteurs aux
derniers numéros présents.

**Écart.** La sauvegarde quotidienne vers R2 couvre **la base, pas les
fichiers**. Aucune sauvegarde des PDF n'existe (constat du 17 septembre 2026) —
et il n'y a encore rien à sauvegarder : le volume de stockage appartient à
l'application, qui n'est pas déployée, et n'existe donc pas encore.

Le risque est réel dès le premier contrat : une perte de volume rend les PDF
irrécupérables. La ligne en base permet de régénérer les documents non signés, mais **pas le
PDF signé** : son empreinte SHA-256 est figée dans la preuve de signature, un PDF
régénéré ne la reproduirait pas et la preuve deviendrait invérifiable. Or ces
pièces doivent être conservées **10 ans** (art. L123-22 C. com.).

**Tâche datée.** Au déploiement du site, dans le même geste que la création du
volume : sauvegarde planifiée du volume vers R2, puis **test de restauration**.
Suivi dans `docs/06-avant-premier-client.md`, point 9.

---

## 7. TVA — article 261 D 4° du Code général des impôts

**La règle.** L'article 261 D 4° exonère de TVA la location de **locaux
d'habitation meublés**. L'exonération **cesse** quand l'exploitant fournit, en
plus de l'hébergement, au moins trois des quatre prestations de type hôtelier :
petit-déjeuner, nettoyage **régulier des locaux en cours de séjour**, fourniture
du linge de maison, réception de la clientèle.

**Où c'est implémenté.** La mention « Exonération de TVA, article 261 D 4° du
CGI » est imprimée sur les **deux factures** et dans le contrat.

**Écart — décision différée (voir `docs/02-decisions.md`, DO-01).** La mention
est affichée **sans que la qualification ait été validée**. Deux éléments
appellent une vérification : le **forfait ménage de 80 € facturé
systématiquement**, et la **fourniture du linge** annoncée sur le site
(« Linge & draps : fournis »). Ce sont deux des quatre prestations. L'accueil
des clients à l'arrivée en est potentiellement une troisième.

Cette question est **la même** que celle de l'identité du bailleur : le régime
de TVA et le régime de déclaration des revenus dépendent tous deux de qui
exploite. **Elle doit être posée une seule fois au comptable, dans les trois
volets** : qui est le bailleur, comment les revenus sont déclarés, l'exonération
tient-elle.

**Qui peut lever :** le comptable.

---

## 7 bis. Taxe de séjour — articles L.2333-26 et suivants du CGCT

**Point BLOQUANT avant le premier client** (voir
`docs/06-avant-premier-client.md`). Cet argent **n'est pas le nôtre** : il est
collecté pour le compte d'une collectivité. Sous-collecté, la différence reste
due et c'est la SARL qui paie. Sur-collecté, on facture au client une taxe qui
n'est pas due. La formule appliquée aujourd'hui peut produire l'un ou l'autre
selon le séjour.

**La règle — meublé NON CLASSÉ.** Le montant se calcule par personne et par
nuit :

1. taux voté par la collectivité, entre **1 % et 5 %**, appliqué au prix
   **hors taxes de la nuitée DIVISÉ PAR LE NOMBRE D'OCCUPANTS** ;
2. multiplié par le nombre d'**occupants assujettis** et par le nombre de nuits ;
3. augmenté des **taxes additionnelles** (départementale, et le cas échéant
   régionale) ;
4. **plafonné** au tarif le plus élevé voté par la collectivité.

**Les mineurs sont exonérés** (art. L.2333-31 du CGCT). Le mécanisme est
contre-intuitif et mérite d'être écrit en toutes lettres : **on divise par le
nombre TOTAL d'occupants, mineurs compris, mais on ne facture qu'aux majeurs.**
Le séjour de référence du parcours de test comporte 2 adultes et 1 enfant.

**Les frais annexes facturés à part** (forfait ménage, linge) sont **exclus de
l'assiette** dès lors qu'ils sont identifiables et détachables — doctrine DGFiP.
Appliquer le taux au forfait ménage est une **surfacturation**.

**Meublé CLASSÉ : méthode entièrement différente** — un **tarif fixe** par
personne et par nuit, voté par la collectivité selon la catégorie. Attention au
piège : **le label Gîtes de France et ses épis ne sont PAS un classement.** Les
épis sont une marque privée ; le classement « meublé de tourisme » est une
procédure administrative, en étoiles, par arrêté. Si les gîtes sont classés, le
taux de 5,5 % stocké en base ne veut rien dire.

**La taxe n'est pas soumise à la TVA** et doit figurer **distinctement** sur la
facture.

**Un registre est obligatoire** : date, nombre de personnes, nuitées, montant
collecté, exonérations.

**Où c'est implémenté aujourd'hui.**

| Endroit | Ce qui s'y trouve |
|---|---|
| `gites.taux_taxe_sejour` | **5,50** pour les trois gîtes (numeric(5,2), un taux en pourcentage). |
| Fiches gîtes | Affichent ce taux, lu en base depuis la Phase 2 (« Taxe de séjour — 5,5 % TTC »). |
| `app/reserver/ReserverFunnel.tsx` | Écran de démonstration : `taxRate: 0.055` appliqué à **hébergement + forfait ménage**, sans notion d'occupants, de mineurs ni de plafond. |
| `lib/montants.ts` | **Ne recalcule rien** : la taxe est une valeur **fournie** par la réservation (`reservations.taxe_sejour`) et reprise telle quelle sur le contrat et les factures. |

**L'écart, nommé.** Le taux de 5,5 % correspond à la forme « 5 % + 10 % de taxe
additionnelle départementale » du régime **non classé**, mais :

- il est appliqué à une **assiette trop large** (le forfait ménage y est inclus) ;
- il ignore la **division par le nombre d'occupants**, l'**exonération des
  mineurs** et le **plafond** ;
- et surtout, **on ne sait pas si les gîtes sont classés**, ce qui déciderait
  d'une méthode entièrement différente.

Comme `lib/montants.ts` reprend la valeur fournie sans la recalculer, l'erreur
naît au moment de la réservation et se propage telle quelle jusqu'à la facture.

**Où cela se corrige.** Le calcul vit dans le tunnel : c'est une **décision
ouverte nommée de la Phase 3** (« méthode de calcul de la taxe de séjour »),
à trancher à son cadrage. La Phase 2 n'a **rien modifié** au calcul : elle a
documenté.

**Qui peut lever :** les propriétaires (le classement) **et la commune de Savas
ou son intercommunalité** (régime, taux, plafond votés). Source officielle :
<https://taxesejour.impots.gouv.fr>.

---

## 8. Spa et sauna — article 12 du contrat

**La règle.** Le bailleur qui met à disposition un équipement à risque doit en
définir les conditions d'usage et les rendre **opposables** au locataire, faute
de quoi sa responsabilité est engagée sans limite en cas d'accident.

**Le principe est arrêté dans le projet** (`docs/contrat-template.md`, art. 12) :
règles **spa ET sauna** dans l'article 12, avec des **limites d'âge strictes** —
**spa interdit aux moins de 6 ans**, **sauna interdit aux moins de 12 ans**
(mineurs de 12 à 17 ans accompagnés). Ce n'est pas une décision ouverte : il
manque l'écriture.

**Où c'est implémenté aujourd'hui.** `components/pdf/ContratPDF.tsx`, article 12,
intitulé « Équipements spécifiques : **spa** », affiché seulement si le gîte
porte `a_spa = true` — ce qui est le cas des trois. Il couvre : température
maximale 38 °C, interdiction d'alcool, tabac, nourriture et substances,
surveillance des mineurs, **moins de 6 ans interdits**, 6-16 ans accompagnés
dans le spa, précaution médicale, décharge de responsabilité, maintenance de
l'eau, sanctions.

**Écart E-3 (bloquant, Phase 6) — deux faces, à documenter ensemble.**

L'article 12 du contrat produit **ne contient aucune règle sauna**. L'article
12.3 du modèle (interdiction aux moins de 12 ans) n'a pas été repris, et le
titre a été réduit à « spa ».

1. **Face client — équipement sans règle opposable.** La Maison Vieille est louée
   avec un sauna privatif (`equipements_specifiques = "Sauna privatif"`,
   annoncé sur cinq pages du site). Aucune règle d'usage n'est opposable à son
   locataire : ni limite d'âge, ni interdiction d'alcool, ni consigne de
   température. En cas d'accident impliquant un enfant, le bailleur ne peut
   opposer aucune clause.

2. **Face preuve — le consentement référence une clause inexistante.** Le texte
   enregistré mot pour mot dans `signatures.consentement_texte`
   (`lib/constantes.ts`, `texteConsentement`) fait accepter au client
   « *l'article 12 relatif aux équipements **spa et sauna*** ». Le client
   consent donc formellement à un article qui ne traite pas du sauna. La preuve
   de consentement **décrit un contenu qui n'existe pas**.

C'est **la même classe de problème** que la mention « signature avancée »
corrigée en Phase 1 : un document affirme quelque chose que le système ne fait
pas. La correction est de la même nature — faire correspondre le texte et la
réalité.

**Sous-point technique.** L'article est conditionné à `giteASpa`, un booléen.
Le sauna n'est pas modélisé : il n'existe que comme **texte libre** dans
`gites.equipements_specifiques`. Écrire la section sauna suppose de décider
comment on la déclenche — un booléen `a_sauna`, ou une lecture du texte libre.
À trancher à l'ouverture de la Phase 6.

---

## 9. Mentions légales du site — article 6-III de la LCEN

**La règle.** Un site professionnel doit indiquer la raison sociale, l'adresse
du siège, le numéro de téléphone, le numéro d'inscription au RCS, le capital
social, et l'identité de l'hébergeur (loi n° 2004-575 du 21 juin 2004 pour la
confiance dans l'économie numérique, art. 6-III).

**Où c'est implémenté.** `lib/data/legal.ts`, section `mentions`, servie par
`app/legal/[section]/page.tsx`.

**Écart E-1 (bloquant, Phase 6).** Les mentions publiées annoncent un éditeur
qui **n'est pas** celui des documents contractuels :

| | Mentions légales du site | Contrat et factures |
|---|---|---|
| Éditeur | Patricia & Nicolas Terrafina, **en nom propre** | **SARL DE LA VOUTE** |
| SIRET | `000 000 000 00000` (**factice**) | 831 170 782 00013 |
| RCS | absent | RCS Annonay 831 170 782 |
| Capital | absent | 500 € |
| Adresse | Hameau de Samoyas, 07430 Savas | 176 Route de Samoyas, 07100 Boulieu-lès-Annonay |

Un consommateur qui lit le site ne traite pas avec la personne qui signe son
contrat. Le SIRET factice est une **conséquence** de cette incohérence, pas un
problème distinct : il disparaît quand l'identité est arrêtée.

La question à trancher n'est pas « que mettre dans les mentions légales » mais
**qui est le bailleur juridique des trois gîtes** — voir `docs/02-decisions.md`,
DO-01, et le § 7 ci-dessus. **Une seule question, un seul interlocuteur.**

**Qui peut lever :** le comptable, avec les propriétaires.

---

## 10. Médiation de la consommation — article L.612-1 du Code de la consommation

**La règle.** Tout professionnel qui vend à des consommateurs doit **adhérer à
un dispositif de médiation** et **communiquer les coordonnées du médiateur** sur
son site, ses conditions générales et ses documents contractuels. L'adhésion est
un **abonnement payant** auprès d'un médiateur référencé.

**Où c'est implémenté.**
- `lib/constantes.ts`, `MENTIONS.mediation` : **MEDICYS** (73 Bd de Clichy,
  75009 Paris) — déclaré mais, comme indiqué en E-7, **jamais importé**.
- Les deux factures et le contrat impriment **MEDICYS** en dur.
- Les CGV du site (`lib/data/legal.ts`) annoncent **MTV — Médiation Tourisme
  Voyage** (BP 80303, 75823 Paris Cedex 17).

**Écart E-2 (bloquant, Phase 6).** Deux médiateurs différents sont annoncés au
même client selon le document qu'il lit. Un seul peut être le bon.

Deux points à établir, dans cet ordre :

1. **Existe-t-il une adhésion en cours, et à qui ?** Annoncer un médiateur sans
   y adhérer **prive le client d'une voie de recours réelle** : il saisit un
   organisme qui déclarera le dossier irrecevable faute d'adhésion du
   professionnel. C'est plus grave qu'une incohérence de rédaction — c'est un
   droit affiché et indisponible.
2. **Lequel retenir ?** Sans trancher : **MTV** est le médiateur **du secteur du
   tourisme** (hébergement, voyage) ; **MEDICYS** est un médiateur
   **généraliste**. Les deux sont référencés auprès de la commission
   d'évaluation. Le choix dépend du secteur et du coût d'adhésion.

**Qui peut lever :** les propriétaires — ce sont eux qui adhèrent et qui paient.
