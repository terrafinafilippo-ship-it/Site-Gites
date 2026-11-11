# Conformité — les obligations légales et ce qui les satisfait

> Ce fichier est mis à jour quand une obligation est ajoutée, ou quand un écart
> est ouvert ou refermé. Chaque écart porte la phase qui doit le traiter.

Pour chaque obligation : **la règle**, **où elle est implémentée**, **comment on
vérifie qu'elle tient**, et **l'écart** s'il y en a un.

Un document qui affirme une conformité qui n'existe pas est pire qu'un document
absent, parce qu'on s'y fie. Les écarts ci-dessous sont donc écrits en toutes
lettres.

**Synthèse des écarts ouverts au 9 octobre 2026 :**

| # | Écart | Gravité | Phase | Qui peut lever |
|---|---|---|---|---|
| E-1 | Identité du bailleur incohérente entre le site et les documents ; SIRET factice publié | Bloquant | 6 | Le comptable |
| E-2 | Deux médiateurs annoncés ; adhésion non prouvée | Bloquant | 6 | Les propriétaires |
| E-3 | Aucune règle sauna dans le contrat, alors que le consentement en fait accepter | Bloquant | 6 | Développement |
| E-4 | Caution par préautorisation Stripe décrite au contrat et sur le site, pas encore développée | Bloquant | 4 | Stripe (deux confirmations) + juriste + développement |
| ~~E-5~~ | ~~Options facturées sous un intitulé générique~~ — **sans objet depuis le 3 novembre 2026** : aucune option vendue | — | — | — |
| E-6 | Adresse IP du signataire falsifiable | Bloquant | Déploiement | Développement |
| ~~E-7~~ | ~~Identité légale recopiée en dur dans les PDF, hors de `lib/constantes.ts`~~ — **corrigé le 9 novembre 2026** | — | — | — |
| E-8 | « La semaine, tout compris » alors que ménage, taxe de séjour et caution s'ajoutent | Faible | 6 | **Les propriétaires** + développement |
| ~~E-9~~ | ~~Une fiche de gîte modifiée entre l'envoi et la signature change la copie signée~~ — **corrigé le 8 novembre 2026** (migration 0016) | — | — | — |

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
- Depuis la Phase 4 (migration 0009) : **une facture de chaque type par
  réservation** (index unique `(reservation_id, type)`). Les factures émises
  automatiquement au paiement (`lib/factures.ts`, D-29) ne peuvent donc pas
  frapper deux numéros si l'émission est lancée deux fois ; la seconde
  insertion échoue et son incrément du compteur s'annule avec elle.

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

**Où c'est implémenté.** `components/pdf/FactureAcomptePDF.tsx`,
`FactureSoldePDF.tsx` et, depuis la Phase 4, `FactureTotalPDF.tsx` (facture
unique d'un séjour payé en une fois, D-29) : identité de l'émetteur (SARL DE LA VOUTE, capital, RCS,
SIRET), identité du client, numéro et date issus de la ligne `factures`,
détail des postes (location, forfait ménage, options, taxe de séjour), total TTC.

**Comment on vérifie.** `scripts/parcours/controler-pdf.py` lit le texte des PDF
produits et contrôle que chaque montant attendu y figure et que **les lignes
s'additionnent jusqu'au sous-total**. Le contrôle visuel (`--png`) reste
nécessaire : un PDF peut être exact et illisible.

**Écart E-5 — sans objet depuis le 3 novembre 2026** (cadrage de la Phase 5,
réponse 8) : les propriétaires ne vendent aucune option ; la ligne ne s'imprime
qu'au-delà de 0 €, le tunnel écrit 0 et le back-office n'en propose pas. Il
redevient bloquant le jour où une option est vendue. Le constat d'origine :

**Écart E-5 (bloquant, Phase 5).** La table `reservations` porte un **montant**
d'options mais **aucun libellé**. Les documents affichent l'intitulé générique
« Options ». Une ligne « Options — 25,50 € » ne désigne pas ce qui a été vendu :
ce n'est pas une dénomination précise. À lever en Phase 5 (ajout du libellé en
base et affichage dans les quatre composants PDF et la page de signature).

**Écart E-7 (faible, Phase 6) — corrigé le 9 novembre 2026.** `lib/constantes.ts`
déclarait `EMETTEUR` et `MENTIONS` (raison sociale, capital, RCS, SIRET,
mention de TVA, médiateur), mais aucun fichier ne les importait : les quatre
composants PDF recopiaient ces valeurs en texte littéral, et corriger
`lib/constantes.ts` ne changeait rien aux documents. Depuis le 9 novembre, le
contrat, les trois factures et la page de signature lisent ces valeurs dans
`lib/constantes.ts`, leur seul domicile. Le texte des PDF est resté identique
mot pour mot (comparaison avant et après sur le parcours, et sur une facture
unique rendue à part). La réponse à E-1 se reportera donc en un seul endroit
pour les documents ; les pages du site (`lib/data/legal.ts`) restent à
reprendre en Phase 6.

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

**Écart E-9 (faible, Phase 5) — corrigé le 8 novembre 2026.** La copie
signée (`…-signe.pdf`) est produite à nouveau au moment de la signature. Depuis
le lot 4, capacité, équipements, spa et téléphone d'arrivée se modifient au
back-office : un changement fait entre l'envoi et la signature serait apparu
dans la copie signée et pas dans le PDF haché. **Correction** (choix du gérant,
migration 0016) : ces quatre valeurs sont recopiées sur la réservation
(`contrat_capacite_max`, `contrat_equipements`, `contrat_a_spa`,
`contrat_contact_arrivee_tel`) dans la transaction qui émet le contrat, et la
copie signée les relit là (`lib/montants.ts`, `ficheContrat`). Vérifié par le
parcours (`controler.ts` : la fiche recopiée à l'émission) et par
`verify:gestion-calendrier` (la fiche figée l'emporte sur celle du gîte).

---

## 4. Données personnelles — RGPD (article 14 du contrat)

**La règle.** Informer la personne du responsable du traitement, des données
collectées, des finalités et de leurs bases légales, des destinataires, des
durées de conservation et de ses droits.

**Où c'est implémenté.** Article 14 du contrat
(`components/pdf/ContratPDF.tsx`, 14.1 à 14.6) :
- **14.1** responsable : SARL DE LA VOUTE, contact : l'adresse des réglages (`courriel_reponse`, contact@gitesdesamoyas.fr) depuis le contrat v3 ;
- **14.2** données, y compris les **données de signature** (identifiant
  technique, horodatage, IP, empreinte SHA-256) — et la précision que les
  **données de carte** ne sont pas conservées par le Bailleur mais **par
  Stripe**, dans les conditions de l'article 6 ;
- **14.3** bases légales : exécution du contrat (art. 6.1.b), obligation légale
  comptable (6.1.c), intérêt légitime (6.1.f), consentement pour la prospection
  (6.1.a) ;
- **14.4** destinataires : hébergeur (OVH SAS, France), **prestataire de
  paiement (Stripe)** pour l'acompte, le solde et le dépôt de garantie,
  **prestataire d'envoi de courriels (Brevo)**, expert-comptable, autorités sur
  réquisition — avec la précision que **la signature est recueillie sans
  prestataire tiers** ;
- **14.5** durées : contrat et pièces comptables 10 ans · registre des occupants
  1 an · prospection 3 ans · signature 10 ans · **données de carte : jusqu'à la
  mainlevée ou l'encaissement du dépôt de garantie, au plus tard 7 jours après
  le départ** ;
- **14.6** droits et réclamation auprès de la CNIL.

**Comment on vérifie.** Lecture de l'article 12/14 sur un PDF réellement produit
(le contrôle automatique ne lit pas la pertinence juridique d'un texte).

**Écart.** Voir E-4 : l'article 14 nomme Stripe et Brevo comme destinataires et
annonce une durée de conservation de la carte, alors qu'aucun des deux n'est
encore branché (Phases 3 et 4). La déclaration est **exacte pour le système
cible**, pas pour le code d'aujourd'hui : aucun contrat réel ne doit être signé
avant que les deux le soient. Une déclaration de destinataire inexacte est un
défaut d'information, dans un sens comme dans l'autre. **Depuis le lot 4 de la
Phase 3 (27 octobre 2026), les deux sont branchés en essai** : Stripe en mode
test (D-23), Brevo pour la confirmation, le lien du contrat et les alertes
(D-24) ; leur passage en réel est aux points 14 et 15 de
`docs/06-avant-premier-client.md`. Le texte de chaque courriel envoyé est gardé
en base (table `courriels`) : durée de conservation à fixer avec celle des
tentatives (point 12).

**Engagement à tenir par le code (Phase 4).** La suppression de la carte au plus
tard 7 jours après le départ est une promesse faite au client : elle doit être
**exécutée par une tâche**, pas laissée à un geste des propriétaires. Stripe est
établi dans l'Union européenne mais appartient à un groupe américain ; la
dernière phrase de 14.4 (« aucune donnée n'est transférée hors UE sans
encadrement juridique approprié ») est à faire confirmer par le juriste en même
temps que l'article 6.

**Minimisation dans le tunnel (Phase 3, lot 2).** Le formulaire ne recueille
que ce que le contrat imprime : identité, adresse, courriel, téléphone, et le
nom de chaque adulte (« occupants majeurs déclarés »). **La civilité est
facultative** (réponse du 15 octobre 2026) : en exiger une pour vendre n'est
pas nécessaire (CJUE, 9 janvier 2025, aff. C-394/23, Mousse, à propos de la
SNCF) ; sans elle, le contrat imprime le nom seul (`lib/coordonnees.ts`). Ces
données entrent en base à l'arrivée sur l'écran de paiement : une tentative
abandonnée par un retour en arrière est **supprimée sur-le-champ** ; une
tentative laissée à l'abandon (page fermée) attend une durée de conservation
— point 12 de `docs/06-avant-premier-client.md`. **L'effacement automatique
est construit depuis le 2 novembre 2026** (Phase 4, lot 3, D-31,
`lib/abandons.ts`) : passé `reglages.abandon_conservation_jours` jours, la
tentative, ses paiements non aboutis, ses nuits et la fiche client chez Stripe
sont effacés ; une ligne `audit_logs` n'en garde que la référence et les dates,
ni nom ni courriel. **La durée est vide : rien n'est effacé** tant que le
juriste ne l'a pas fixée. Contrôle : `verify:abandons`.

**Caution par virement (Phase 4, lot 3, D-31).** Le RIB du client, demandé
pour lui rendre sa caution, arrive en réponse au courriel des coordonnées
bancaires : **le site ne le stocke pas**. Il reste dans la boîte contact@,
dont la durée de conservation relève de la même question (point 12) ; il
n'est pas cité à l'article 14.2 du contrat, à signaler au juriste avec
l'article 6.

**Accès des propriétaires : le back-office (Phase 5, lot 1, D-32).** Les
coordonnées de tous les clients sont lisibles depuis `/gestion` : c'est la
mesure de sécurité de l'article 32 du RGPD qui compte le plus ici. Mot de
passe (empreinte scrypt), plus un code reçu par courriel sur tout appareil
inconnu ; session fermée après 8 heures sans activité ; échecs limités par
adresse IP ; témoins inaccessibles aux scripts et jamais envoyés depuis un
autre site ; pages non indexées et jamais mises en cache. Aucun secret n'est
gardé en clair en base. Les gestes sensibles sont notés dans `audit_logs` (ni
mot de passe, ni code ; l'adresse IP de l'appareil, qui est une donnée
personnelle des propriétaires). Le compte est partagé par trois personnes :
la boîte contact@, qui reçoit le lien et le code, est la vraie clé d'accès.
Contrôle : `verify:gestion`.

**Justificatifs d'une retenue sur la caution (Phase 5, lot 2, D-33).** Les
photos, devis et factures déposés par les propriétaires sont gardés dans le
stockage du serveur (`retenues/…`) et joints au courriel du client. Ils peuvent
montrer des personnes ou des objets personnels : leur durée de conservation est
la même question au juriste que celle des tentatives (point 12). Le motif et
le montant restent dans `retenues`, avec qui les a saisis. Aucune facture n'est
émise pour une retenue tant que le comptable n'a pas répondu (point 19).

**Page « Ma réservation » (Phase 3, lot 4, D-25).** Les données d'un séjour
(adresse du gîte, dates, montants, contrat signé) sont montrées à qui détient
le lien secret de la réservation : un jeton de 64 caractères tirés au hasard,
jamais la référence. La page n'est ni indexée, ni mise en cache, ni transmise
aux sites liés ; elle se ferme 30 jours après le départ (réglage). Le
formulaire qui renvoie un lien perdu répond la même chose que l'adresse ait
réservé ou non : il ne révèle pas qui a séjourné aux gîtes. Les demandes de
lien sont des lignes du journal `courriels` (adresse et texte envoyé) : même
durée de conservation à fixer (point 12).

**Pages publiques en retard sur le contrat.** La politique de confidentialité
(`lib/data/legal.ts`) annonce une conservation de 5 ans et ne dit rien de la
carte ni de Brevo : à aligner en Phase 6.

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

**Écart E-4 (bloquant, Phase 4) — la caution.** Jusqu'au 9 octobre 2026, le
contrat et cinq pages du site annonçaient un dépôt de garantie par empreinte
bancaire chez un prestataire spécialisé qui n'a jamais été intégré. Ce
prestataire est écarté (`docs/02-decisions.md`, D-16) et **toutes ses mentions
ont été retirées**.

Le contrat et le site décrivent désormais le mécanisme retenu : une
**préautorisation Stripe** sur la carte de l'acompte, faite la veille du départ,
levée au plus tard 3 jours après, sans débit sauf dégât constaté. Depuis le
2 novembre 2026 (Phase 4, lot 2, D-30), **ce mécanisme est développé** :
préautorisation la veille du départ, levée automatique au troisième jour,
données de carte supprimées dès la levée et au plus tard 7 jours après le
départ, montant figé à la réservation (celui du contrat), lien de
l'article 6.6. Contrôlé avec Stripe en mode test (`verify:caution --stripe`).
Depuis le lot 3 (D-31), le **virement** (coordonnées envoyées et affichées,
alertes « à vérifier » et « à rendre ») et le **chèque** (séjour terminé au
troisième jour) suivent aussi les délais de l'article 6 ; contrôle :
`verify:virement`.
**L'écart ne se ferme pas pour autant** : la **retenue** (encaissement
partiel, art. 6.4) arrive avec l'écran de gestion (Phase 5), et les autres
conditions du point 3 de `docs/06-avant-premier-client.md` (relecture du
juriste, trace écrite des réponses de Stripe) restent à réunir.

Emplacements qui décrivent le mécanisme, à modifier **ensemble** s'il change :

| Emplacement | Nature |
|---|---|
| `components/pdf/ContratPDF.tsx` art. 5.1, 6.2 à 6.6 (trois moyens depuis le contrat v3, D-19) | Clause contractuelle |
| `components/pdf/ContratPDF.tsx` ligne « Caution » du récapitulatif | Récapitulatif |
| `components/pdf/ContratPDF.tsx` art. 14.2, 14.4, 14.5 | Information RGPD |
| `app/gites/[slug]/page.tsx` | Page publique |
| `app/reserver/ReserverFunnel.tsx` (4 endroits) | Page publique |
| `app/[lang]/suivi/[jeton]/page.tsx` (ligne « Caution » des faits, `lib/recapitulatif.ts` ; bloc « Votre caution » depuis D-30) | Page publique |
| `lib/courriels-textes.ts` — courriels de la caution (bloquée, à valider, levée, carte à enregistrer, coordonnées du virement depuis D-31) | Courriels au client |
| `app/[lang]/suivi/[jeton]/page.tsx` — coordonnées du virement dans « Votre caution » (D-31) ; `app/[lang]/reserver/ReserverFunnel.tsx` — virement grisé après sa date limite | Pages publiques |
| `lib/data/legal.ts` — CGV et politique cookies | Pages publiques `/legal/cgv` et `/legal/cookies` |
| `docs/contrat-template.md`, `docs/facture-template.md` | Documents de rédaction |

Toute modification du texte du contrat s'accompagne d'un changement de
`TEMPLATE_VERSION` (`lib/contrat.ts`), enregistrée sur chaque contrat
émis : c'est elle qui dit quel client a signé quel texte. Version en cours :
`v4` (30 octobre 2026, D-27).

**Écart E-1 (bloquant, Phase 6) — identité du professionnel.** Voir § 9.

**Écart E-8 (non bloquant, Phase 6) — « la semaine, tout compris ».** Le titre du
bloc tarifs de la fiche gîte (`app/gites/[slug]/page.tsx`) annonce un prix
« tout compris ». Or le séjour comporte en plus un **forfait ménage obligatoire
de 80 €**, une **taxe de séjour** et une **caution**. L'allégation porte donc sur
une condition de vente, comme l'écart E-4, en moins grave : ici le mécanisme
existe, c'est sa description qui promet trop.

La formule vient du site d'origine : elle n'a pas été inventée par une session et
n'est pas corrigée d'autorité (règle 3 de `docs/05-protocole-phase.md`). Deux
issues, à trancher avec les propriétaires en Phase 6 : soit la formule disparaît,
soit elle est rendue exacte — par exemple « linge et chauffage compris », qui est
vrai. Repéré en Phase 2.

---

## 6. Conservation des pièces — article L.123-22 du Code de commerce

**La règle.** Les documents comptables et les pièces justificatives sont
conservés **dix ans**.

**Où c'est implémenté.**
- La **ligne en base** est le document légal (voir `docs/02-decisions.md`, D-05) :
  `factures`, `documents`, `signatures` ne sont jamais supprimées, et
  `factures.donnees` contient un instantané complet et auto-décrit
  (`unite: "centimes"`, `formatVersion: 3` depuis le 23 octobre 2026, la taxe
  décrite par son libellé imprimé) suffisant pour reconstituer le PDF.
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
appelaient une vérification : le **forfait ménage de 80 € facturé
systématiquement** — supprimé le 12 novembre 2026 (D-37, forfait à 0 €) — et
la **fourniture du linge** annoncée sur le site (« Linge & draps : fournis »),
qui reste. L'accueil des clients à l'arrivée est potentiellement une autre de
ces prestations.

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

**Les gîtes ne sont PAS classés** (réponse du gérant, 11 octobre 2026) : c'est
la règle des meublés non classés qui s'applique.

**La règle de Savas — vérifiée le 14 octobre 2026 sur deux sources
officielles.** Savas fait partie des 29 communes d'**Annonay Rhône Agglo**, qui
vote la taxe : délibération **n° CC_2025_119** du 26 juin 2025, applicable au
1er janvier 2026
(<https://ardechegrandair.taxesejour.fr/portail/document/27229521/download>),
et guide de facturation d'**Ardèche Grand Air**, édition janvier 2026
(<https://ardechegrandair.taxesejour.fr/portail/284441/download>). Calcul
**par personne et par nuit**, dans cet ordre :

1. prix par nuit = prix HT de la location ÷ nombre de nuits ;
2. prix de la nuitée = prix par nuit ÷ nombre d'**occupants** ;
3. tarif = prix de la nuitée × **5 %** ;
4. **plafond** : le tarif ne dépasse pas **4,40 €** (« le tarif le plus élevé
   adopté par la collectivité », celui des palaces) ;
5. **taxe additionnelle départementale de 10 %** du tarif, qui s'ajoute ;
6. taxe = (tarif + additionnelle) × nombre de nuits × nombre d'**assujettis**.

**« Lors de chaque calcul, procédez à l'arrondi au centième »** (guide) :
chaque étape est arrondie au centime. Les deux exemples du guide — 15,75 € et
9,68 € — sont rejoués au centime par `npm run verify:tarification`. Arrondir
seulement à la fin donnerait 15,59 € au lieu de 15,75 €.

**Les mineurs sont exonérés** (art. L.2333-31 du CGCT). Le mécanisme est
contre-intuitif et mérite d'être écrit en toutes lettres : **on divise par le
nombre TOTAL d'occupants, mineurs compris, mais on ne facture qu'aux majeurs.**
Le séjour de référence du parcours de test comporte 2 adultes et 1 enfant.

**Les frais annexes facturés à part** (forfait ménage, linge) sont **exclus de
l'assiette** dès lors qu'ils sont identifiables et détachables — doctrine DGFiP.
Appliquer le taux au forfait ménage est une **surfacturation**. La délibération
de Savas ne parle que du « prix de la prestation d'hébergement hors taxes » sans
citer le ménage : **à confirmer** auprès du service taxe de séjour. En
attendant, le ménage est exclu par défaut, et c'est un réglage
(`taxes_sejour.menage_dans_assiette`), pas une ligne de code.

**Les bébés.** Le guide compte comme occupants toutes les personnes hébergées.
Qu'un bébé en fasse partie n'est écrit nulle part. Réponse du gérant du
11 novembre 2026 : il **ne compte pas**. C'est un réglage
(`taxes_sejour.bebes_parmi_occupants`, Phase 3 lot 2), faux par défaut depuis
la migration 0018, pas une ligne de code. Un bébé ne paie jamais : il est
mineur.

**Meublé CLASSÉ : méthode entièrement différente** — un **tarif fixe** par
personne et par nuit, voté par la collectivité selon la catégorie. Attention au
piège : **le label Gîtes de France et ses épis ne sont PAS un classement.** Les
épis sont une marque privée ; le classement « meublé de tourisme » est une
procédure administrative, en étoiles, par arrêté. Le mode « fixe » existe dans
les réglages, par gîte, pour le jour où l'un d'eux serait classé.

**La taxe n'est pas soumise à la TVA** et doit figurer **distinctement** sur la
facture.

**Un registre est obligatoire** : date, nombre de personnes, nuitées, montant
collecté, exonérations.

**Où c'est implémenté (14 octobre 2026, Phase 3 lot 1 — décision D-18).**

| Endroit | Ce qui s'y trouve |
|---|---|
| `taxes_sejour` | Les réglages, **par gîte et datés** : mode (proportionnel / fixe), taux, plafond, tarif fixe, taxe additionnelle, ménage dans l'assiette, bébés parmi les occupants, source. **Vide en base réelle** : à saisir (point 11 de `docs/06-avant-premier-client.md`). Les valeurs de Savas ci-dessus sont chargées dans la base de test. |
| `lib/taxe-sejour.ts` | Le calcul, étape par étape, arrondi à chaque étape. Une nuit sans réglage est un refus, jamais une taxe nulle. |
| Fiches gîtes | Affichent la règle en vigueur, lue en base, **taxe additionnelle comprise** : « 5,5 % du prix de la nuit par personne, au plus 4,84 € par adulte et par nuit ; mineurs exonérés » (23 octobre 2026). |
| Tunnel de réservation | Branché au **lot 2** (15 octobre 2026) : le devis (`lib/devis.ts`) appelle `lib/taxe-sejour.ts` ; la taxe et le détail de chaque étape sont figés avec la réservation (`reservations.taxe_sejour`, `reservations.detail_calcul`). Ce détail sert aussi au **registre**. |
| `lib/montants.ts` | **Ne recalcule rien** : la taxe est une valeur **fournie** par la réservation (`reservations.taxe_sejour`) et reprise telle quelle sur le contrat et les factures. |
| `gites.taux_taxe_sejour` et `reservations.taux_taxe_sejour` | **5,50**, l'ancienne forme. Plus lue par les pages ; laissée **vide** sur les réservations du tunnel. Les PDF ne s'en servent plus que pour une réservation calculée à l'ancienne. |
| Contrat et factures | Depuis le 23 octobre 2026 (lot 4) : « Taxe de séjour — 2 adultes × 7 nuits (mineurs exonérés) » (`libelleTaxeSejour`, `lib/montants.ts`). |

**L'écart restant.** Les trois questions au service taxe de séjour (point 10
de `docs/06-avant-premier-client.md`). L'article 4.4 du contrat dit la taxe
collectée pour le compte d'Annonay Rhône Agglo, taxe additionnelle
départementale comprise, depuis le contrat v3 (lot 5) : rattachement de Savas
à vérifier par les propriétaires (point 10), texte à relire par le juriste
(point 3). La taxe est remboursée dans tous les cas d'annulation (art. 7.2,
D-26).

**Exemple.** 780 € de location pour 7 nuits, 2 adultes et 1 enfant : 111,43 €
par nuit, 37,14 € par occupant, 1,86 € de taxe, 0,19 € de taxe additionnelle,
soit 2,05 € × 7 nuits × 2 adultes = **28,70 €**. L'ancienne formule (5,5 % de
la location et du ménage) donnait 47,30 €.

**Qui peut lever ce qui reste :** le service taxe de séjour d'Ardèche Grand Air
(tarifs 2027 : 04 75 33 24 51, ardechegrandair@taxesejour.fr ; ménage et
bébés tranchés par le gérant le 11 novembre 2026) et
les propriétaires (saisie des réglages).

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
- `lib/constantes.ts`, `MENTIONS.mediateur` : **MEDICYS** (73 Bd de Clichy,
  75009 Paris), imprimé par le contrat et les trois factures (E-7 corrigé le
  9 novembre 2026).
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
