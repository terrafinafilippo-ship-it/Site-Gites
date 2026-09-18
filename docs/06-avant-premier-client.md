# Avant le premier client réel — checklist bloquante

> Ce fichier est mis à jour dès qu'un point est levé ou découvert. C'est le
> **seul** domicile de cette liste : elle ne doit être recopiée nulle part
> ailleurs (voir `docs/05-protocole-phase.md`, règle 1).

Dix points à traiter **avant qu'un vrai client signe un vrai contrat**. Aucun
n'empêche le logiciel de fonctionner : ils empêchent qu'il fonctionne
**correctement le jour où il compte**.

## Qui peut lever un point

Quatre des dix points **ne se résolvent pas dans le dépôt**. Sans cette
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
| 3 | Swikly : en service, ou retiré de **toutes** ses mentions | **Arbitrage**, puis développement | Phase 4 |
| 4 | Passer la base en configuration de production | Développement | Phase 4 |
| 5 | Vérifier le logo sur un PDF généré **après** déploiement | Développement | Au déploiement |
| 6 | Qui est le bailleur juridique des trois gîtes | **Le comptable** | Phase 6 |
| 7 | Médiateur de la consommation : lequel, et adhésion en cours | **Les propriétaires** | Phase 6 |
| 8 | Écrire les règles sauna à l'article 12 du contrat | Développement | Phase 6 |
| 9 | Sauvegarder le volume des PDF, et tester une restauration | **Phase de déploiement** | Au déploiement — échéance **à arbitrer à l'ouverture de la Phase 3** |
| 10 | Taxe de séjour : régime, taux et assiette exacts | **Les propriétaires + la commune** | Phase 3 |

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

## 3. Swikly : en service, ou retiré de toutes ses mentions

**Qui peut lever :** **arbitrage** (les deux issues sont acceptables), puis
développement · **Phase 4**

**La raison.** Le contrat engage la SARL DE LA VOUTE sur un dépôt de garantie
constitué par empreinte bancaire chez **Swikly**, avec une clause en encadré
affirmant que l'empreinte ne constitue pas un encaissement, et un délai de
mainlevée de 7 jours. Le site l'annonce au client. **Aucune intégration Swikly
n'existe dans le code.** Signer ce contrat sans le service, c'est promettre par
écrit un mécanisme qui n'existe pas — pratique commerciale trompeuse
(art. L.121-2 C. conso.).

**L'action.** Deux issues, l'une ou l'autre :

- **Mettre Swikly en service** (Phase 4, cycle de paiement) ; ou
- **retirer toute mention de Swikly** et décrire le mécanisme de caution
  réellement appliqué.

**La liste exhaustive des emplacements**, plus longue que celle tenue jusqu'ici —
le journal de Phase 1 parlait de « trois pages du site », il y en a **cinq** :

| Emplacement | Nature |
|---|---|
| `components/pdf/ContratPDF.tsx` art. **6.2, 6.3, 6.5** | Clause contractuelle |
| `components/pdf/ContratPDF.tsx` ligne « Caution (Swikly) » du **récapitulatif** | Récapitulatif |
| `components/pdf/ContratPDF.tsx` art. **14.4** | Destinataire RGPD |
| `app/gites/[slug]/page.tsx` | Page publique |
| `app/reserver/ReserverFunnel.tsx` (**4 endroits**) | Page publique |
| `app/suivi/[ref]/page.tsx` | Page publique |
| **`lib/data/legal.ts` — CGV** (`/legal/cgv`) | **Page publique** |
| **`lib/data/legal.ts` — cookies** (`/legal/cookies`) | **Page publique** |
| `docs/contrat-template.md` | Document de rédaction |
| `docs/facture-template.md` | Document de rédaction |

Les fichiers `.html` de la racine et `admin/` en contenaient aussi : ils ont été
**supprimés en Phase 2** (commit `e341c01`), il n'y a donc plus rien à y faire.

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

**Qui peut lever :** **phase de déploiement** · **échéance à arbitrer à
l'ouverture de la Phase 3**

> **À traiter avant la Phase 3, pas avant le go-live.** Le premier contrat réel
> peut apparaître dès qu'un paiement fonctionne. Attendre la mise en ligne
> officielle, c'est laisser des PDF signés sans sauvegarde.
>
> **Mais ce point dépend du déploiement, qui n'a pas eu lieu** : le volume des
> PDF n'existe pas encore, il n'y a donc ni sauvegarde à configurer ni
> restauration à tester. Le prérequis ne peut pas être levé tel quel. Deux
> issues — déployer d'abord, ou décaler l'échéance au déploiement effectif — sont
> à trancher **à l'ouverture de la Phase 3**, et le choix retenu s'inscrit ici
> avec sa date. Il ne doit pas se lever par oubli. Voir
> `docs/phases/phase-3.md`.

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

## Points levés

Conservés pour mémoire : ils ont figuré dans cette liste et n'y figurent plus.

| Point | Levé le | Comment |
|---|---|---|
| Refermer le port PostgreSQL public | 16 septembre 2026 | Port fermé ; `DATABASE_URL` vise l'hôte interne du réseau Coolify ; accès de développement par tunnel SSH. `?sslmode=require` reste inutilisable, le serveur tournant avec `ssl = off`. Voir `docs/02-decisions.md`, D-10. |
