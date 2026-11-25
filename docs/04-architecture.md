# Architecture — la réalité technique

> Ce fichier est mis à jour **quand le code change**, à la clôture de la phase
> qui l'a changé. Il décrit ce qui **existe**, pas ce qui est prévu : le prévu
> vit dans `docs/phases/`.

---

## 1. Infrastructure

| Élément | Réalité |
|---|---|
| Serveur | VPS **OVH**, loué et administré par nous |
| Orchestration | **Coolify** — interface web qui installe, déploie et surveille les conteneurs (site, base, sauvegardes) |
| Base de données | **PostgreSQL 17**, dans un conteneur Coolify |
| Reverse proxy | **Traefik**, fourni par Coolify — c'est lui qui reçoit les requêtes HTTPS et les transmet au site |
| Stockage des PDF | **Volume disque persistant** monté par Coolify (`STORAGE_PATH`, défaut `/data/documents`) |
| Sauvegardes | Base : export quotidien par Coolify vers **Cloudflare R2**. PDF : **aucune** — le volume n'existe pas avant le déploiement ; sauvegarde vers R2 à configurer à sa création (voir `docs/03-conformite.md` § 6 et `docs/06-avant-premier-client.md`, point 9) |

**Le piège permanent.** Un conteneur Docker est **recréé à chaque
déploiement** : tout fichier écrit ailleurs que sur le volume monté disparaît.
C'est pourquoi `lib/storage.ts` porte un avertissement en tête et pourquoi
`STORAGE_PATH` doit viser le volume, jamais un dossier quelconque.

**DEUX CONTENEURS POSTGRESQL TOURNENT SUR CE SERVEUR. UN SEUL EST LE NÔTRE.**

| Conteneur | Image | Ce que c'est |
|---|---|---|
| `5sn5xve5enj5lcze6buvwuc4` | `postgres:17-alpine` | **La base du projet.** C'est celle-ci, et elle seule, qu'on migre, qu'on seed et qu'on interroge. |
| `coolify-db` | `postgres:15-alpine` | **La base interne de Coolify** : configuration du serveur, secrets de déploiement. **Ne jamais y toucher.** Elle n'a aucun rapport avec le projet. |

Une session qui cherche « le conteneur PostgreSQL » en trouvera donc deux. Se
tromper de cible, c'est écrire dans la configuration de l'hébergeur — pas dans
les données des gîtes.

**Accès administrateur.** L'utilisateur SSH **n'appartient pas au groupe
`docker`**, et c'est délibéré : en faire partie équivaut à un accès root
permanent. Toute commande `docker` passe donc par `sudo`. Ne pas proposer de
changer ce réglage.

**Réseau.** Le port PostgreSQL public est **refermé** (voir
`docs/02-decisions.md`, D-10). `DATABASE_URL` vise l'hôte **interne** du réseau
Coolify. `?sslmode=require` est inutilisable : le serveur tourne avec
`ssl = off`. Un accès depuis un poste de développement passe par un **tunnel
SSH** — la procédure complète est au § 9.

**Variables d'environnement** — les noms, jamais les valeurs. Le fichier de
référence est `.env.example`.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion à la base réelle. Secret. |
| `DATABASE_URL_TEST` | Connexion à `gites_test`. Secret. |
| `DB_CIBLE` | `test` bascule sur la base de test. Vide = base réelle. |
| `STORAGE_PATH` | Racine des PDF sur le volume. |
| `STORAGE_SIGNING_SECRET` | Clé HMAC des URL de documents. Secret, 32 octets. |
| `DOCUMENT_SERVICE_SECRET` | Secret service-à-service des routes d'émission. Secret. |
| `NEXT_PUBLIC_SITE_URL` | URL publique. **Visible du navigateur** : rien de confidentiel. |

Aucun secret ne porte le préfixe `NEXT_PUBLIC_` — ce préfixe expose la valeur au
navigateur.

---

## 2. Organisation du dépôt

```
middleware.ts   Aiguillage des langues : /… → français, /en/… → anglais (D-22) ; /gestion à part, fermé sans témoin de session (D-32)
app/            Pages et routes (Next.js App Router)
  api/          Routes serveur : contrats, contrats/signer, factures, documents, reservations, suivi/lien, suivi/solde, suivi/caution, taches, stripe/webhook
  [lang]/       TOUTES les pages, une fois par langue (fr, en) ; layout.tsx est la mise en page générale
    gites/        Liste et fiche d'un gîte
    reserver/     Tunnel de réservation : calendrier, devis, coordonnées, blocage (paiement au lot 3)
    signer/       Page publique de signature d'un contrat (français seulement)
    suivi/        Page « Ma réservation » par lien secret (/suivi/{jeton}) et formulaire « Retrouver ma réservation » (/suivi)
    legal/        Mentions, CGV, confidentialité, cookies (texte français dans les deux langues ; rendu à la demande, la confidentialité lit la durée des tentatives abandonnées)
    [...introuvable]/  Toute autre adresse : page introuvable dans la langue de l'adresse
  gestion/      Le BACK-OFFICE (Phase 5, D-32 à D-36, D-41, D-42), hors des langues : connexion, code, mot de passe, accueil « À traiter », réservations (liste, fiche, gestes), calendrier (bloquer des nuits, options), tarifs (prix, périodes, barèmes, règles, taxe de séjour), gîtes (fiches), documents (liste, PDF, renvoi), statistiques (et registre de la taxe de séjour), réglages, appareils ; actions.ts, actions-reservations.ts, actions-tarifs.ts, actions-calendrier.ts, actions-factures.ts et actions-annulation.ts (formulaires), outils.ts (témoins, session)
  globals.css   Styles communs
  robots.ts, sitemap.ts  robots.txt et plan du site (pages publiques, deux langues ; NEXT_PUBLIC_SITE_URL au build, D-39)
  [lang]/avis/[jeton]    Page de l'avis d'un client, par le lien reçu après son départ (D-40) ; POST /api/avis le dépose
  gestion/avis           Les avis dans le back-office : lecture, retrait pour un motif (D-40)
components/
  pdf/          Les cinq documents PDF (contrat, facture d'acompte, de solde, facture unique, avoir, D-42 ; la facture de retenue, D-41, retirée par D-43)
  layout/       En-tête, pied de page, sélecteur de langue (plus de bandeau cookies : aucun traceur, D-39)
  ui/           Composants réutilisables ; DonneesStructurees.tsx : données schema.org de l'accueil et des fiches (D-39) ; AvisClients.tsx : les avis des clients sur la fiche d'un gîte (D-40)
lib/
  centimes.ts   Les DEUX fonctions de frontière du modèle monétaire
  montants.ts   Le SEUL calcul des montants d'une réservation faite (acompte, solde, documents)
  tarification.ts  Le SEUL calcul du prix de location d'un séjour (pur, D-17)
  taxe-sejour.ts   Le SEUL calcul de la taxe de séjour (pur, D-18)
  devis.ts      Le devis d'un séjour : assemble prix, taxe et acompte (pur, navigateur ET serveur)
  coordonnees.ts   Contrôle des coordonnées du client (pur, navigateur ET serveur)
  tarifs.ts     Lecture en base de la tarification et des réglages de taxe
  disponibilites.ts  Nuits prises ; poser et lever le blocage des dates (D-21) ; nuits d'une option libres pour son client (D-35) ; nuits d'une réservation annulée libérées (D-42)
  options-sejour.ts  Une option posée au téléphone, retrouvée par le jeton de son lien ; son état (D-35)
  departements.ts    Les départements français, retrouvés par le code postal (statistiques, D-36)
  tunnel.ts     Le tunnel côté serveur : charger ou refuser, enregistrer, abandonner
  paiement.ts   Ouvrir et constater un paiement (acompte, total, solde), rembourser
  solde.ts      Le solde : préavis, prélèvement, lien, rappel, impayé (D-28)
  avis.ts       Les avis des clients : invitation, lien, dépôt, lecture publique, retrait, effacement (D-40) ; avis-regles.ts : durée, longueur, motifs de retrait (promesses écrites)
  caution.ts    La caution par carte : préautorisation, levée, carte effacée, art. 6.6 (D-30) ; fin des séjours sans carte (D-31)
  virement.ts   La caution par virement : compte des réglages, courriel des coordonnées, alertes « à vérifier » et « à rendre » (D-31)
  iban.ts       Contrôle d'un IBAN (clé ISO 13616) et sa forme lisible (pur)
  abandons.ts   L'effacement des tentatives abandonnées, durée en réglage (D-31)
  taches.ts     Le passage des tâches automatiques (un seul à la fois)
  annulation.ts Le remboursement d'une annulation (D-42) : paiements reçus, répartition carte puis virement, remboursement chez Stripe (repris par les tâches), avoir quand tout est rendu
  avoirs.ts     L'émission d'un avoir, ligne légale (creer_avoir, numéro dans la suite des factures depuis D-43) puis PDF (D-41, D-42)
  factures.ts   L'émission d'une facture, ligne légale puis PDF (D-29) ; depuis D-41, seulement sur demande : facture du séjour entièrement payé (paiements listés, entreprise possible) ou de retenue
  decimaux.ts   Taux et coefficients lus exactement ; division arrondie
  dates-civiles.ts Arithmétique des dates « aaaa-mm-jj », en UTC
  format.ts     Le SEUL formatage calcul -> affichage (fmtEuro, fmtPrix, fmtTaux…)
  constantes.ts Identité légale et valeurs par défaut
  storage.ts    Stockage des PDF et signature des URL
  reservations.ts  Chargement réservation + gîte joint, avec conversion en centimes
  gites-publics.ts Chiffres des gîtes pour les pages publiques (cache, dégradation)
  auth.ts       Vérification du secret service-à-service
  gestion/      Back-office (D-32, D-33) : secrets.ts (scrypt, jetons, codes ; pur), connexion.ts (mot de passe, code, appareils, sessions, échecs par IP), reglages.ts (rubriques, bornes, alertes), journal.ts (audit_logs), reservations.ts (liste, fiche, coordonnées, renvoi du lien de signature), cautions.ts (libérer, retenir, chèque et virement, lien de caution), solde-virement.ts, a-traiter.ts (accueil), tarifs-regles.ts (pur : saisies, découpage des périodes, copie d'une année, trous, état), tarifs.ts (lecture et gestes en deux temps), calendrier.ts (mois, fermer et rouvrir, poser et lever une option, D-35), gites.ts (fiches en deux temps), documents.ts (liste, PDF, renvoi), factures.ts (factures sur demande, en deux temps, D-41), annulation.ts (annuler une réservation, en deux temps ; « Remboursement fait », D-42), statistiques.ts (chiffres d'une année, registre de la taxe de séjour, D-36)
  i18n/         Langues (D-22) : liste, liens dans la bonne langue, balises hreflang
  data/         Contenu éditorial du site, en code et en deux langues (gîtes, récits, activités) — plus aucun prix
db/
  schema/       Le schéma Drizzle : un fichier par table. SOURCE DE VÉRITÉ.
  migrations/   Les SQL générés, numérotés. meta/ est le journal de Drizzle.
  seed.ts       Les trois gîtes. Idempotent.
  verify.ts     Auto-vérification complète, tout annulé par ROLLBACK.
scripts/        Contrôles : verifier-centimes, verifier-tarification, verifier-blocage, verifier-paiement, -courriels, -suivi, -solde, -factures, -annulation, -caution, -virement, -abandons, -avis, -gestion, -gestion-reservations, -gestion-tarifs, -gestion-calendrier, -gestion-statistiques ; simulations.ts (paiement et messagerie simulés, communs à plusieurs contrôles) ; verifier-production (base réelle, lecture seule) ; gestion-compte (crée le compte du back-office)
scripts/parcours/  Non-régression bout en bout (voir § 8)
docs/           Le référentiel (ce dossier)
public/         Servi tel quel par Next.js — dont public/logo.png
```

**Legs supprimés en Phase 2** (commit `e341c01`) : les fichiers `.html` de la
racine, le dossier `assets/` (dupliqué dans `public/assets/`, et dont
`tokens.css` + `site.css` avaient déjà été fusionnés dans `app/globals.css`), et
le dossier `admin/`. Les maquettes du back-office se récupèrent dans ce commit :
`git show e341c01^:admin/tarifs.html`.

---

## 3. Modèle de données — les vingt-huit tables

**Cœur métier — neuf tables exercées par le code**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `gites` | Les trois gîtes : nom, référence Gîtes de France, slug, adresse, capacité, forfait ménage, caution, équipements, téléphone d'arrivée, spa — modifiables au back-office sauf le nom et la référence (D-35) ; les anciennes colonnes de tarif et de taux de taxe sont retirées par la migration 0015. **La base prime sur toute constante du code.** | `ref_gdf` et `slug` uniques |
| `reservations` | Une ligne par séjour, quel que soit son statut (`brouillon`, `en_attente_paiement`, `confirmee`, `annulee`, `terminee`). Client, conjoint, dates, occupants, montants, paiement de l'acompte. Depuis le lot 2, le tunnel l'écrit « en attente de paiement » à l'arrivée sur l'écran de paiement, avec `detail_calcul` : le devis figé (prix nuit par nuit, étapes de la taxe). Depuis le lot 3 : conditions **figées** (`taux_acompte`, `delai_solde_jours`, `paiement_integral`), choix du client (`moyen_caution`, `mode_solde`), `langue`, identifiants Stripe de la carte conservée, texte d'accord recopié mot pour mot avec sa version. Payée, elle passe `confirmee` ; payée trop tard sur des nuits reprises, `annulee` (remboursée). Depuis le lot 4 (migration 0007, D-25) : `jeton_suivi`, le jeton secret de la page « Ma réservation », tiré par la base à la création (64 caractères hexadécimaux). Depuis le lot 5 (migration 0008, D-26) : `delai_remboursement_solde_heures` et `delai_virement_caution_jours`, figés comme le taux de l'acompte. Depuis la Phase 5, lot 2 (migration 0013, D-33) : `caution_recue_at` et `caution_rendue_at` (chèque ou virement, notés par les propriétaires) et `note_interne`. Depuis la Phase 5, lot 4 : `option_id` (réservation faite par le lien d'une option, migration 0015) ; `contrat_capacite_max`, `contrat_equipements`, `contrat_a_spa`, `contrat_contact_arrivee_tel`, la fiche du gîte recopiée à l'émission du contrat et relue par la copie signée (migration 0016, écart E-9). | `reference` unique · `jeton_suivi` unique · `updated_at` tenu par trigger · taux, délai du solde et délais d'annulation et de virement **sans valeur par défaut** · prélèvement du solde seulement avec une caution par carte, jamais en paiement intégral · texte d'accord et version ensemble |
| `disponibilites` | Le calendrier des **nuits prises**, une ligne par gîte et par nuit : `verrou` (blocage pendant le paiement, avec échéance), `reserve`, `bloque`, `option` (option posée au téléphone, avec l'échéance de l'option et `option_id`, D-35). **Une nuit sans ligne est libre** ; une ligne provisoire échue (verrou ou option) vaut libre (D-21, D-35). Origine `directe`, `airbnb`, `booking`, `gdf` (Phase 7). | **Index unique `(gite_id, date)`** : la garantie contre la double vente · un verrou a une échéance et une réservation · une nuit vendue en direct désigne sa réservation |
| `options_sejour` | Les options posées au téléphone (D-35) : gîte, dates, nom et courriel du client, langue, **jeton** du lien personnel, échéance (minuit, heure de Paris, après le dernier jour), levée, utilisée. Ses nuits sont des lignes `option` de `disponibilites` ; la réservation faite par son lien la désigne (`reservations.option_id`). | Départ après l'arrivée · jeton unique · une nuit `option` désigne son option et porte son échéance |
| `documents` | Le registre des PDF émis : contrat, facture d'acompte, facture de solde, facture unique (`facture_total`), avoir (`avoir`, D-42) ; la facture de retenue (`facture_retenue`, D-41) n'est plus émise depuis D-43. Chemin (`url_pdf`), numéro, statut (`genere` puis `signe`), jeton de signature pour les contrats. | **Index unique `(reservation_id, type)`** : un double clic ou un webhook en double ne peut pas créer deux contrats · `token` unique quand non nul |
| `signatures` | La preuve de signature : qui, quand, depuis quelle adresse, avec quel texte de consentement, et l'empreinte SHA-256 du PDF signé. | **Trigger d'immutabilité** (UPDATE et DELETE refusés) · une seule signature par document |
| `factures` | Les factures d'acompte et de solde, depuis la Phase 4 la facture unique (`total`, D-29), de la migration 0022 à la 0024 la facture de retenue (`retenue`, D-41, retirée par D-43) : numéro légal, montant, date d'émission, instantané des données du PDF (format 4 : paiements listés, entreprise). **Depuis D-41, faites seulement sur demande du client** (bouton du back-office, `lib/gestion/factures.ts`), émises à l'envoi du courriel « facture » (`lib/factures.ts`) ; plus aucune après un paiement. | `numero` unique · **index unique `(reservation_id, type)`** (migration 0009) · types `acompte`, `solde`, `total` (migration 0024) · créées **exclusivement** par `creer_facture` |
| `compteurs_documents` | Le compteur de numérotation, une ligne par série et par année. | Clé primaire `(serie, annee)` · **jamais une SEQUENCE** |
| `paiements` | Chaque paiement chez le prestataire (PaymentIntent Stripe), forme définitive depuis le lot 3 : type (`acompte`, `total`, `solde` depuis la Phase 4, `caution` depuis la migration 0010), montant, statut (`en_attente`, `reussi`, `echoue`, `annule`, `a_rembourser`, `rembourse` ; pour la caution `bloque`, `libere`, `retenu`), motif et référence du remboursement ; pour la caution, date limite de la banque (`expire_at`), montant retenu, date de levée. Un prélèvement du solde et une préautorisation naissent **avant** l'appel à Stripe, sans référence (D-28, D-30). | **Index unique `reference_externe`** : un paiement Stripe n'a qu'une ligne · **une caution par réservation** (index unique partiel) · états et colonnes de la caution réservés à la caution · retenue entre 0 et le montant · remboursement toujours motivé · `updated_at` tenu par trigger |
| `textes_accord` | Le texte d'accord pour l'enregistrement de la carte, **une version par langue et par date** d'entrée en vigueur, avec qui l'a validé. Repères `{caution}`, `{ligne_solde}`, `{montant}`, `{date}`. | **Trigger d'immutabilité** · clé `(objet, langue, en_vigueur_depuis)` |

| `courriels` | Le **journal des courriels** du site (lot 4, D-24) : une ligne par courriel et par destinataire, inscrite dans la transaction de l'événement (paiement, remboursement, signature, lien « Ma réservation » redemandé ; depuis la Phase 4, facture jointe en PDF, courriels du solde et de la caution, par carte et par virement), puis envoyée : statut (`a_envoyer`, `envoye`, `echec`), essais, échéance du prochain, voie (`brevo` ou `fichier`), sujet et texte envoyés. | **Index unique `cle`** : un événement constaté deux fois n'inscrit qu'un courriel · `envoye` exige date, voie et sujet |
| `alertes` | Les alertes aux propriétaires (`reservation`, `signature`, `probleme` ; `caution` depuis la migration 0010) : active ou non, destinataires. Créées par les migrations ; modifiables dans le back-office (Réglages) depuis D-32. | Une alerte active a au moins un destinataire |

**Tables provisoires — structure minimale, aucun code ne les exerce encore**

| Table | Rôle prévu | Affinée en |
|---|---|---|
| `avis` | Les avis des clients du site (D-40, migrations 0020 et 0021) : un par réservation, note de 1 à 5, commentaire facultatif, signature figée au dépôt, date du séjour ; retiré seulement avec un motif de la politique des avis ; effacé 3 ans après le dépôt. | Phase 6 |
| `audit_logs` | Le journal des actions sensibles. Aucun trigger ne l'alimente. **Premier usage depuis D-31** : l'effacement automatique d'une tentative abandonnée (`action = 'effacement_tentative'`, référence et dates, ni nom ni courriel). **Depuis D-32**, le back-office (`lib/gestion/journal.ts`) : compte créé, mot de passe changé, lien demandé, nouvel appareil, appareil retiré, adresse IP bloquée, réglage ou alerte modifiés (valeur avant et après) ; `acteur` = « gestion (Chrome sur Windows) », « commande » ou « visiteur ». Aucun écran ne le montre. | Phase 3 |

**Back-office — six tables (Phase 5, lot 1, migration 0012, D-32)**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `comptes_gestion` | Le compte du back-office (un seul, partagé) : adresse, empreinte scrypt du mot de passe (NULL tant qu'il n'est pas choisi par le lien). | `courriel` unique, en minuscules |
| `appareils_gestion` | Les appareils reconnus : empreinte du jeton du témoin, description (« Chrome sur Windows »), dernière connexion. Reconnu tant qu'il s'est connecté dans les 30 derniers jours. | Jeton unique · effacé avec le compte · ses sessions partent avec lui (cascade) |
| `sessions_gestion` | Les connexions ouvertes : empreinte du jeton, dernière activité. | Jeton unique · effacée avec l'appareil |
| `codes_gestion` | Le code à 6 chiffres d'un appareil inconnu : empreinte du code et du jeton de l'étape, essais, échéance. | Jeton unique · essais ≥ 0 |
| `liens_gestion` | Le lien pour choisir le mot de passe : empreinte du jeton, échéance, utilisation. Un nouveau lien annule le précédent. | Jeton unique |
| `essais_gestion` | Les échecs par adresse IP et l'attente en cours. | Clé `ip` · échecs ≥ 0 |
| `annulations` | (Lot 5, migration 0023, D-42) L'annulation d'une réservation depuis le back-office : qui annule (`client`, `bailleur`, `absence`), quand le client a prévenu (heure civile de Paris), payé, gardé (hors taxe de séjour), rendu, dont taxe, jour de l'arrivée (pour les statistiques), qui a agi. | **Une par réservation** · payé = gardé + rendu · date du préavis exactement quand c'est le client |
| `remboursements` | (Lot 5, migration 0023, D-42) Les mouvements qui rendent l'argent : `carte` (un paiement par carte, remboursé chez Stripe, référence `re_…`) ou `virement` (fait par les propriétaires, « Remboursement fait »), `a_faire` puis `fait`. Écrits avant tout appel à Stripe ; un refus de Stripe change la ligne en virement (`erreur`). | Un par paiement par carte (index unique) · montant > 0 · une carte a son paiement · « fait » a sa date |
| `avoirs` | (Lot 5, migration 0023, D-41, D-42) L'avoir d'une réservation annulée et remboursée, s'il existe une facture : numéro légal pris dans la suite des factures, `FAC-AAAA-NNN` (migration 0024, D-43 ; `AV-AAAA-NNN` avant), facture corrigée, montant rendu, date, PDF, instantané. | `numero` unique · **un par réservation** · montant > 0 · créés **exclusivement** par `creer_avoir` |
| `retenues` | (Lot 2, migration 0013, D-33) La retenue sur la caution d'une réservation : montant, motif, moyen, justificatifs (chemins dans le stockage), qui, quand. Écrite avant l'encaissement par carte (`faite_at` vide), complétée après. | **Une par réservation** (index unique) · montant > 0 · motif non vide |
| `a_traiter_faits` | (Lot 2) Les lignes « À traiter » retirées par « C'est fait » : clé de la ligne, qui, quand. | Clé `cle` |

**Aucun secret en clair** dans ces tables : lire la base ne permet ni d'entrer
ni de rejouer un lien.

**Tarification — sept tables (Phase 3, lot 1 ; décisions D-17 et D-18)**

| Table | Rôle | Garanties structurelles |
|---|---|---|
| `tarifs` | Un tarif nommé librement (« Basse saison »), avec ses règles et son barème propres, ou NULL pour « comme le réglage général ». | `nom` unique · jours ISO 1 à 7, liste non vide |
| `tarifs_prix` | Le prix d'**une nuit** d'un tarif, pour un gîte. Pas de ligne = pas de prix : le calcul refuse. | Clé `(tarif_id, gite_id)` · prix > 0 |
| `periodes` | Les plages de dates d'un tarif : première nuit incluse, jour de fin **exclu**. Règles et barème propres possibles. | **Contrainte d'exclusion `periodes_sans_chevauchement`** (migration 0003) : une nuit relève d'au plus un tarif · fin > début · un tarif utilisé ne se supprime pas |
| `baremes` | Les barèmes de dégressivité. | `nom` unique |
| `baremes_coefficients` | Une case de barème par **rang** de nuit (1 = première). Une ligne par rang plutôt qu'un tableau : le pilote pg lit un tableau de numeric en flottants. | Clé `(bareme_id, rang)` · rang ≥ 1 · coefficient > 0 · rangs consécutifs contrôlés à la lecture |
| `reglages` | **Une seule ligne** (id = 1), créée par la migration 0003 : règle générale (nuits minimum, jours d'arrivée et de départ), barème général, jour de début attendu des périodes ; depuis la migration 0004, les réglages du tunnel : durée du blocage (20 min), délai minimum avant l'arrivée (1 jour), horaires (18 h, 9 h, 20 h), bébés (âge 2 ans, 1 hors capacité, 1 lit) ; depuis la migration 0005, le paiement : taux d'acompte (30 %), délai du solde (30 jours), délai du virement de caution (3 jours avant l'arrivée) ; depuis la migration 0006, les adresses des courriels ; depuis la migration 0007, la page « Ma réservation » : validité du lien (30 jours après le départ), demandes de lien (3 par 60 minutes et par adresse), lues à chaque affichage ; depuis la migration 0008 (D-26), le délai de remboursement du solde (48 heures avant l'arrivée, recopié sur la réservation ; 72 heures depuis la migration 0024, D-43) et la note des avis de l'accueil (4,97/5, 46 avis, 100 % ; vide = masquée) ; depuis la migration 0009 (D-28), les délais des courriels du solde : préavis et lien 7 jours avant la date limite, rappel la veille, seconde alerte 3 jours après l'impayé, lus à chaque passage ; depuis la migration 0010 (D-30), les heures de la caution : préautorisation 18 h la veille du départ, alerte et levée 8 h (levée avant midi, imposé) ; depuis la migration 0011 (D-31), le compte qui reçoit la caution par virement (titulaire, IBAN, BIC ; **vide** jusqu'à la saisie), le jour du courriel des coordonnées (10 jours avant la date limite) et la durée de conservation des tentatives abandonnées (**vide** : rien n'est effacé) ; depuis la migration 0012 (D-32), la connexion au back-office : appareil reconnu 30 jours après sa dernière connexion, 8 heures d'inactivité, 5 échecs puis 15 minutes, code 10 minutes, lien 60 minutes ; depuis la migration 0013 (D-33), le délai avant qu'un contrat non signé apparaisse dans « À traiter » (3 jours) ; depuis la migration 0014 (D-34), la durée sur laquelle les nuits sans tarif sont signalées (12 mois) ; depuis la migration 0015 (D-35), les jours pendant lesquels une option posée au téléphone garde ses nuits (3) ; depuis la migration 0017 (D-36), le taux de commission d'une plateforme pour les statistiques (**vide** jusqu'à la saisie) ; depuis la migration 0021 (D-40), l'invitation à donner son avis (le lendemain du départ) et la validité de son lien (30 jours après le départ). | `id = 1` imposé · son absence est une panne, jamais comblée par des valeurs par défaut · bornes sur chaque réglage |
| `taxes_sejour` | Les réglages de taxe de séjour, **par gîte et datés** : mode, taux, plafond, tarif fixe, taxe additionnelle, ménage dans l'assiette, bébés parmi les occupants, source. | Clé `(gite_id, date_debut)` · paramètres requis selon le mode |

En base réelle, ces tables sont **vides** jusqu'à la saisie par les
propriétaires (point 11 de `docs/06-avant-premier-client.md`) ; la ligne
`reglages` existe dès la migration. Les colonnes `gites.tarif_semaine_base`,
`gites.tarif_weekend` et `gites.taux_taxe_sejour` ne sont plus lues par aucune
page (D-15 remplacée par D-17) ; elles seront retirées par une migration.

**Conventions de typage, décidées en Phase 0 et à respecter :**

- dates civiles (arrivée, départ, émission) en `date` — **jamais** un instant ;
- heures en `time` (le code ne lit que `HH:MM`) ;
- instants (paiement, création) en `timestamptz` ;
- `ip_signataire` en `inet` **nullable** : `NULL` si inconnue, jamais une chaîne
  de repli comme `'inconnue'` ;
- `documents.url_pdf` est un **chemin relatif**, jamais une URL.

**Le schéma est la source de vérité.** On ne modifie jamais une table à la main
dans un outil graphique. Procédure : modifier `db/schema/`, générer
(`npm run db:generate`), **relire le SQL**, appliquer (`npm run db:migrate`),
commiter schéma + migration + `meta/` ensemble.

---

## 4. Le modèle monétaire et ses deux frontières

C'est la partie la plus facile à casser par inadvertance. La règle complète et
son pourquoi sont dans `docs/02-decisions.md`, D-06.

```
        BASE                    FRONTIÈRE                  MÉMOIRE
  numeric(10,2)   ──centimesDepuisNumeric──►   entier de centimes
    "576.66"      ◄──numericDepuisCentimes──         57666
```

**Les deux seules fonctions autorisées** vivent dans `lib/centimes.ts`. Elles
travaillent **par découpage de chaîne** et ne multiplient ni ne divisent jamais
par 100. Elles **lèvent une erreur** sur une forme inattendue plutôt que de
tronquer en silence.

**Où les frontières sont franchies, et nulle part ailleurs :**

| Sens | Fichier | Occasion |
|---|---|---|
| base → mémoire | `lib/reservations.ts` | Lecture d'une réservation et de son gîte |
| base → mémoire | `lib/gites-publics.ts` | Forfait ménage et caution des fiches |
| base → mémoire | `lib/tarifs.ts` | Prix d'une nuit, plafond et tarif fixe de taxe ; taux et coefficients par `entierDepuisDecimal` (`lib/decimaux.ts`) |
| base → mémoire | `app/api/factures/route.ts` | Relecture du montant de la facture d'acompte |
| base → mémoire | `db/verify.ts` | Contrôle de `creer_facture` |
| mémoire → base | `app/api/factures/route.ts` | `p_montant_ttc` passé à `creer_facture` |
| mémoire → base | `db/seed.ts` | Montants des gîtes |
| mémoire → affichage | `lib/format.ts` (`fmtEuro`) | Tous les documents et pages |

Les colonnes de montants sont déclarées en `mode: "string"` dans le schéma : le
type SQL ne change pas, seule la façon dont le pilote les remet au code change.
C'est pour cela que le passage en centimes **n'a demandé aucune migration**.

**Un taux n'est pas un montant.** `taux_taxe_sejour` et `TAUX_ACOMPTE` restent
des nombres décimaux. Le seul arrondi du modèle est
`Math.round(totalTtc * (TAUX_ACOMPTE / 100))` dans `lib/montants.ts` : le
`/ 100` y porte sur le **taux**, jamais sur un montant.

**Un calcul, un seul fichier.** `lib/montants.ts` calcule les montants d'une
réservation **faite** (sous-total, total, acompte, solde) et ne construit
**aucun** numéro de document. Le devis du tunnel (`lib/devis.ts`) appelle sa
fonction `montantsDesPostes` : le client voit avant de payer l'acompte exact de
sa facture. Depuis la Phase 3, deux calculs s'y ajoutent,
chacun dans son propre fichier et nulle part ailleurs : le prix de location
d'un séjour à réserver (`lib/tarification.ts`) et sa taxe de séjour
(`lib/taxe-sejour.ts`). Les deux sont **purs** et calculent en entiers exacts :
le prix en fractions BigInt arrondies une seule fois, la taxe arrondie à chaque
étape comme l'exige le guide officiel. Leurs coefficients et taux sont des
entiers à échelle fixe (dix-millièmes, centièmes de pour cent), lus par
découpage de chaîne.

**Le même calcul dans le navigateur et sur le serveur.** Le tunnel reçoit les
données lues en base au chargement de la page et chiffre le séjour **dans le
navigateur** (`lib/devis.ts`), pour un affichage immédiat. À l'écran de
paiement, le serveur recalcule tout avec les données lues à cet instant :
c'est le seul calcul qui engage, et il ne lit jamais un montant envoyé par le
navigateur. Ces modules purs n'importent donc rien du serveur.

---

## 5. Conventions de chemin des PDF

Construites par les routes, lues par tout le reste. **Ne pas les changer** : des
lignes `documents.url_pdf` et `factures.pdf_url` déjà écrites les portent.

```
contrats/{reservation_id}/{numero}.pdf         contrat non signé
contrats/{reservation_id}/{numero}-signe.pdf   contrat signé
factures/{numero}.pdf                          facture (acompte ou solde)
```

**Écriture atomique** (`lib/storage.ts`) : le contenu part dans un fichier
temporaire du même dossier, est synchronisé sur disque, puis publié en une
opération instantanée — lien dur exclusif (refuse d'écraser) ou renommage
(écrasement autorisé). Un plantage en cours d'écriture ne peut donc jamais
laisser un PDF à moitié écrit qui serait ensuite servi à un client.

**Validation des chemins.** `validerChemin` refuse `..`, l'antislash, le
caractère nul, les segments vides et tout segment hors du motif autorisé, puis
`DiskStorage.resoudre` vérifie en plus que le chemin absolu reste sous la racine.
Deux protections successives contre la **traversée de répertoire**, qui
permettrait de lire n'importe quel fichier du serveur.

---

## 6. Les routes et leur authentification

| Route | Auth | Effet |
|---|---|---|
| `POST /api/contrats` | En-tête `x-service-secret` = `DOCUMENT_SERVICE_SECRET` | Émet le contrat : numéro `CTR`, ligne `documents` avec jeton, PDF, recopie du numéro sur la réservation. **Une transaction.** Idempotent. Séjour payé en une fois compris depuis le contrat v3 (D-26). |
| `POST /api/contrats/signer` | **Aucun secret** — le jeton du lien authentifie le signataire | Enregistre la preuve, écrit le PDF signé, passe le document en `signe`, inscrit l'alerte « contrat signé ». **Une transaction.** Courriels envoyés après la réponse. |
| `POST /api/factures` | `x-service-secret` | Émet la facture d'acompte, de solde, unique (`total`) ou de retenue (`retenue`), ou l'avoir (`avoir`, `lib/avoirs.ts`, D-42), au nom d'une `entreprise` facultative, via `creer_facture` (`lib/factures.ts`, la logique que le courriel « facture » appelle aussi). Sert au parcours et aux contrôles : le site ne l'appelle plus. Ré-émission idempotente pour le même numéro. `409` : acompte ou solde demandé pour un séjour payé en une fois ou après la facture du séjour, `total` pour un séjour pas entièrement payé ou des paiements qui ne font pas le total, `retenue` sans retenue faite, réservation ni confirmée ni terminée, solde sans facture d'acompte, réservation modifiée depuis l'acompte. Un refus ne consomme aucun numéro. |
| `GET /api/documents/{chemin}` | **URL signée** (`token` + `expires`) | Seul accès aux PDF. |
| `GET /signer/{token}` | Le jeton | Page publique de signature (français seulement ; `/en/signer/…` est introuvable). |
| `POST /api/reservations` | **Aucun secret** — limite de 5 blocages par adresse en 10 minutes | Recalcule le devis, contrôle le règlement choisi (`reglement` : caution, solde), enregistre la réservation « en attente de paiement » et bloque ses nuits (**une transaction**), puis ouvre le paiement chez Stripe et renvoie son secret (connu de ce seul navigateur). Messages dans la langue reçue (`langue` : `fr` par défaut, ou `en`). `201` · `400` demande ou règlement invalide · `404` gîte inconnu · `409` refus métier ou dates prises (avec les autres gîtes libres) · `429` trop de tentatives · `503` tunnel ou paiement indisponible (Stripe injoignable : la tentative est abandonnée) · `500` erreur inattendue |
| `DELETE /api/reservations/{id}` | L'identifiant tiré au hasard, connu du seul navigateur qui a créé la tentative | Annule le paiement ouvert chez Stripe, lève le blocage et supprime la tentative. `200` · `404` · `409` réservation engagée (payée ou en cours de paiement : jamais supprimée) |
| `GET /reserver/confirmation` | Le secret du paiement (`payment_intent_client_secret`, ajouté par Stripe), comparé en temps constant | Revérifie le paiement chez Stripe et constate : confirmée, remboursée (autres gîtes proposés), en cours, ou non aboutie (tentative abandonnée). Faux secret : `404` |
| `GET /suivi/{jeton}` | Le jeton secret de la réservation (`reservations.jeton_suivi`), jusqu'au départ + 30 jours (réglage) | Page « Ma réservation » (D-25) : faits, état du contrat (lien de signature, ou PDF signé par URL signée d'une heure), adresse et heures, contacts. Réservation remboursée : « n'a pas pu être confirmée ». Jeton inconnu, réservation jamais payée ou lien expiré : une seule réponse, avec le formulaire. Ni cache, ni indexation, ni `Referer`. Depuis la Phase 4 : bloc « Votre solde » (prévu, à régler avec le bouton de paiement, payé) ; au retour d'un paiement, l'identifiant et le secret ajoutés par Stripe sont revérifiés, et seulement pour cette réservation |
| `POST /api/suivi/lien` | **Aucun secret** — 3 demandes par adresse et par heure (réglage), comptées dans le journal des courriels | Formulaire « Retrouver ma réservation » : inscrit un courriel par réservation encore ouverte de l'adresse, envoyé après la réponse. **Même réponse** que l'adresse ait réservé ou non. `200` · `400` adresse mal formée · `503` base indisponible |
| `POST /api/suivi/solde` | Le jeton secret de « Ma réservation » | Ouvre (ou réutilise) le paiement du solde et renvoie son secret au navigateur (D-28). `200` · `400` · `404` lien non valable (même réponse pour tout jeton inconnu) · `409` rien à payer maintenant (payé, prélèvement prévu, en cours) · `503` paiement indisponible |
| `POST /api/suivi/caution` | Le jeton secret de « Ma réservation » | Rouvre la préautorisation refusée pour que le client la valide, ou ouvre l'enregistrement d'une carte (art. 6.6), et renvoie son secret au navigateur (D-30). `200` · `400` · `404` lien non valable · `409` rien à valider (déjà bloquée, plus due) · `503` paiement indisponible |
| `POST /api/taches` | En-tête `x-taches-secret` = `TACHES_SECRET` (tâche programmée de Coolify) | Un passage des tâches automatiques (le solde, D-28 ; la caution, D-30), puis l'envoi des courriels dus. `200` bilan, ou `{ occupe: true }` si un passage est en cours · `401` · `503` secret ou `NEXT_PUBLIC_SITE_URL` absents · `500` passage interrompu |
| `/gestion/…` (pages) | **Témoin de session** `gestion_session` (`httpOnly`, `SameSite=Strict`, chemin /gestion), relu en base par chaque page et chaque action ; sans lui, le middleware renvoie à `/gestion/connexion`. Connexion, code, mot de passe et « mot de passe oublié » sont ouverts | Le back-office (D-32) : connexion par mot de passe, code par courriel sur un appareil inconnu, réglages, appareils. Formulaires par actions serveur : Next refuse une action dont l'en-tête Origin n'est pas celui du site. `X-Robots-Tag: noindex`, `no-store`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. L'adresse IP des échecs est la dernière de `X-Forwarded-For`, comme ci-dessous |
| `POST /api/stripe/webhook` | **Signature Stripe** (`STRIPE_WEBHOOK_SECRET`) sur le corps brut | Même constat que la page de retour, idempotent ; depuis D-30 aussi la caution bloquée, la carte enregistrée (`setup_intent.*`) et le paiement contesté (alerte « À TRAITER »). `200` · `400` signature invalide · `500` à reprendre (Stripe renvoie l'avis) · `503` secret absent |

**Pourquoi trois régimes différents.** Les routes d'émission frappent des
numéros légaux : seul un appelant **serveur** (back-office, webhook de paiement)
doit pouvoir les appeler, d'où un secret partagé. La route de signature est
appelée depuis le navigateur du client, qui n'a ni compte ni mot de passe : le
jeton unique reçu par courriel **est** son authentification. Les fichiers, eux,
ne sont ni publics ni réservés à un compte : d'où le lien signé.

**Tout est `runtime = 'nodejs'` et `dynamic = 'force-dynamic'`.**
`@react-pdf/renderer` a besoin de `fontkit` et `zlib`, indisponibles en runtime
Edge ; et une émission de document est un **effet de bord** qui ne doit jamais
être mis en cache.

**Les pages publiques qui affichent des chiffres sont, elles aussi, en rendu à
la demande** : `/`, `/gites`, `/gites/[slug]`, `/contact` et `/reserver`
(dans les deux langues, sous `app/[lang]/`) portent
`dynamic = 'force-dynamic'`. Le build les liste avec le symbole « ● » à cause
des deux langues déclarées par `app/[lang]/layout.tsx`, mais n'en
pré-génère aucune : `.next/prerender-manifest.json` ne contient que
`/_not-found`. Ce n'est pas pour éviter le cache — le cache est
dans `lib/gites-publics.ts`, 60 secondes — mais pour que **`next build` ne lise
jamais la base** : un déploiement ne doit pas échouer parce que la base est
momentanément indisponible (D-13). Contrôle : `npm run build` doit réussir sans
aucune base joignable.

**Ce que garantit la transaction unique.** Dans `POST /api/contrats`, le numéro,
la ligne `documents`, le PDF et la recopie du numéro sur la réservation sont
dans la **même** transaction. Un échec entre deux écritures ne peut donc pas
laisser un numéro légal consommé sur un contrat que la réservation ignore. La
ligne `documents` est insérée **avant** l'écriture du fichier, pour que l'index
unique arrête une émission concurrente avant qu'un fichier ne soit produit.

**Les codes de refus** sont explicites et testés : `401` sans secret,
`404` jeton inconnu, `409` contrat déjà signé ou réservation modifiée depuis la
facture d'acompte, `410` lien expiré, `502` échec de rendu ou d'écriture,
`500` incohérence de calcul interne.

**La limite anti-abus lit la DERNIÈRE adresse de `X-Forwarded-For`**, celle
qu'écrit le proxy (Traefik, via Coolify). Next.js ne remplit cet en-tête que
s'il est absent, avec l'adresse de la connexion ; en local (127.0.0.1, ::1), la
limite ne s'applique pas. **À vérifier au déploiement** : que Traefik écrit
bien l'en-tête. Sinon, tous les clients partagent l'adresse du proxy et la
limite devient globale (5 tentatives en 10 minutes pour tout le site).

**Point connu, non corrigé :** les pages `/signer` d'erreur (lien invalide, déjà
signé, expiré) répondent en **HTTP 200** avec le message à l'écran ; seule l'API
renvoie les codes 404 / 409 / 410.

---

## 7. Le mécanisme des URL signées

Les PDF ne sont **jamais** servis directement par le serveur web.

```
getSignedUrl(chemin, ttl)
   └─► expires = maintenant + ttl (secondes Unix)
   └─► token   = HMAC-SHA256( chemin + "\n" + expires , STORAGE_SIGNING_SECRET )
   └─► /api/documents/{chemin}?token=…&expires=…
```

À la lecture, `app/api/documents/[...path]/route.ts` contrôle, **dans cet
ordre** : le chemin, l'expiration, puis la signature. La comparaison du jeton se
fait en **temps constant** (`timingSafeEqual`), pour qu'un attaquant ne puisse
pas deviner le jeton octet par octet en mesurant le temps de réponse.

Conséquences : un lien expiré ne sert plus (`403`), un chemin modifié invalide
la signature (`403`), et allonger `expires` à la main invalide aussi la
signature — les deux valeurs sont signées **ensemble**. Durée par défaut : une
heure.

**Le logo des PDF** est lu sur le **disque** (`lib/logo.ts`, `public/logo.png`
depuis `process.cwd()`), gardé en mémoire, sans aucune requête réseau. Si la
lecture échoue, le PDF sort **sans logo** et l'erreur est journalisée : la route
ne doit jamais échouer à cause du logo. Un contrat sans logo reste valide ; un
contrat non généré après encaissement est un incident client. Ce repli est
**silencieux par conception** — d'où le point de contrôle après déploiement dans
`docs/06-avant-premier-client.md`.

---

## 8. Stratégie de test

Il n'y a **pas** de tests unitaires au sens habituel. Il y a trois niveaux, tous
exécutables en une commande, et c'est délibéré : ce qui doit être prouvé ici
n'est pas qu'une fonction renvoie la bonne valeur, mais qu'**un parcours client
complet produit les bons montants sur les bons documents**.

| Niveau | Commande | Ce qu'il prouve |
|---|---|---|
| Conversion | `npm run verify:centimes` | L'aller-retour centimes ↔ texte numeric sur 51 cas, dont les valeurs limites |
| Prix, taxe, devis | `npm run verify:tarification` | 209 cas calculés à la main : dégressivité, séjours à cheval sur deux saisons, règles, refus, grille publique, les deux exemples du guide officiel de la taxe de séjour au centime, le devis du tunnel (capacité et bébés, délai, paiement intégral, nuits prises, taux et délais lus dans les réglages), le contrôle des coordonnées, le règlement (choix de la caution et du solde, texte d'accord identique au mot près à celui de la migration), l'anglais (formats, messages, liens ; devis identique dans les deux langues), la taxe affichée (phrase de la fiche, ligne des PDF), les montants d'un paiement intégral, la somme conservée en cas d'annulation, le partage de l'article 7 (date du solde et limite des heures comprises, solde impayé, paiement intégral imposé ou choisi, Bailleur, absence) et la répartition carte puis virement, la date limite des 48 heures, la note des avis, « tout régler maintenant » (choix, devis, choisi ou imposé) et le virement refusé après sa date limite. Sans base |
| Blocage | `DB_CIBLE=test npm run verify:blocage` | Deux clients qui bloquent les mêmes nuits au même instant : un seul gagne ; verrou expiré repris ; chevauchement refusé sans reste ; tentative, seconde tentative, abandon. Avec `--http` (dans `lancer.sh`) : les mêmes cas par le serveur, et la limite anti-abus |
| Paiement | `DB_CIBLE=test npm run verify:paiement` | Avec un **prestataire simulé** (sans réseau ni clé) : ouverture, « tout régler maintenant » 40 jours avant (paiement total, aucun solde en base), refus puis paiement, constat répété et simultané (retour et avis), paiement arrivé après le blocage (nuits libres : confirmé ; reprises : remboursé une seule fois), remboursement en panne puis rattrapé, montant inattendu, paiement inconnu, retour en arrière, faux secret. Avec `--http` (dans `lancer.sh`) : **Stripe en mode test** — vraie carte de test, page de confirmation, contrat et courriels créés par le serveur, aucune facture (D-41), page « Ma réservation » ouverte par le lien de la confirmation (français, anglais, lien inconnu, formulaire), carte refusée, avis signé. **Sans clés de test, `--http` échoue en le disant** |
| Courriels | `DB_CIBLE=test npm run verify:courriels` | Paiement, messagerie, contrat et facture **simulés** : une confirmation et une alerte par paiement même constaté plusieurs fois, aucune facture (D-41) ; lien de signature, lien « Ma réservation », faits, expéditeur et adresse de réponse ; anglais ; panne puis nouvel essai, échec définitif et alerte ; contrat impossible à créer ; paiement intégral ; remboursements ; alerte coupée ; adresses de test jamais envoyées ; texte échappé. Le vrai contrat créé par le serveur est vérifié par `verify:paiement --http` |
| Page « Ma réservation » | `DB_CIBLE=test npm run verify:suivi` | Jetons distincts et bien formés ; page fermée pour un jeton mal formé ou inconnu et une réservation non payée, ouverte une fois payée ; validité jusqu'au départ + 30 jours inclus, réglage relu à chaque affichage ; réservation remboursée ; formulaire (adresse inconnue, mal formée, connue quelle que soit la casse ; jamais une réservation non payée ; langue de la réservation) ; limite de 3 demandes par heure ; courriel envoyé avec le lien et sa date de fin. La vraie page, par le serveur, est vérifiée par `verify:paiement --http` |
| Solde | `DB_CIBLE=test npm run verify:solde` | 61 cas avec `--http`, prestataire, messagerie et factures **simulés**, le temps fixé à chaque passage : préavis, prélèvement une seule fois, aucune facture (D-41) ; refus, impayé et seconde alerte ; lien, rappel, impayé, paiement par le lien réutilisé ; avis de Stripe avant la référence ; prélèvement sans réponse depuis 20 heures ; séjour payé en une fois et réservation annulée ignorés ; solde reçu pour une réservation annulée ; courriel « facture » refusé à l'émission ; facture du séjour en anglais. Avec `--http` : le réveil refusé sans secret, la route de paiement du solde |
| Factures sur demande | `DB_CIBLE=test STORAGE_PATH=./.data/documents-test npm run verify:factures` | 28 cas (38 avec `--http`), prestataire, messagerie et émission **simulés** : saisie « Au nom d'une entreprise » (vide, incomplète, SIREN) ; séjour payé en deux fois (aucune facture après les paiements, refus avant le solde, récapitulatif, empreinte, courriel inscrit, journal, pas deux demandes à la fois, PDF joint, « Renvoyer la facture ») ; séjour payé en une fois au nom d'une entreprise ; retenue sur la caution sans facture (D-43) ; réservation annulée. Avec `--http` : les **vraies** factures par le serveur — deux paiements listés, entreprise et SIREN (texte des PDF lu), idempotence, plus de facture d'acompte après celle du séjour, refus sans numéro consommé, type « retenue » refusé, deux numéros qui se suivent |
| Annulation | `DB_CIBLE=test STORAGE_PATH=./.data/documents-test npm run verify:annulation` | 37 cas (47 avec `--http`), prestataire, messagerie et émission **simulés** : refus (qui annule, date du préavis absente, future ou avant la réservation, absence avant l'arrivée) ; le client annule avant la date du solde (récapitulatif exact, empreinte, statut, nuits libérées, paiement du solde ouvert annulé, carte remboursée une fois, annulation et journal, courriel, « Ma réservation », pas d'avoir sans facture, pas deux annulations) ; carte puis virement avec une facture (« À traiter », « Remboursement fait », l'avoir part) ; refus et panne de Stripe ; client absent et statistiques ; caution bloquée levée, caution par chèque rendue tout de suite. Avec `--http` : le **vrai** avoir (numéro dans la suite FAC, texte du PDF lu, idempotence, refus sans numéro consommé) et les pages (fiche annulée, formulaire, « Documents », « Ma réservation »), le lien de signature d'une réservation annulée (page et enregistrement refusés) |
| Caution par carte | `DB_CIBLE=test npm run verify:caution` | 67 cas, prestataire et messagerie **simulés**, le temps fixé : montant figé (le gîte peut changer le sien), préautorisation la veille à 18 h et pas avant, une seule ; courriels du jour même ; alerte la veille de la levée ; levée au troisième jour, réservation terminée, carte effacée ; refus et authentification exigée (un seul lien, pas de nouvel essai, validation sur le même paiement, courriels devenus faux non envoyés) ; montant absent ; réponse perdue, avis en avance, 20 heures ; retenue dans Stripe ; annulée, caution à 0 €, 7 jours ; article 6.6 ; passage manqué ; contestation. `--stripe` : **Stripe en mode test, trois cartes** (normale, 3184, refusée), carte détachée. `--http` : la route de validation et la page |
| Caution par virement | `DB_CIBLE=test npm run verify:virement` | 47 cas, messagerie **simulée**, le temps fixé : contrôle de l'IBAN ; courriel des coordonnées 10 jours avant la date limite et une seule fois, son texte (compte, référence, mise en garde contre les faux RIB, RIB demandé, restitution) ; coordonnées sur « Ma réservation » jusqu'à la date limite ; alertes « à vérifier » et « à rendre » à 8 h ; séjour terminé au troisième jour ; compte absent ou IBAN faux (alerte « À TRAITER ») ; passage manqué ; anglais ; chèque ; réservation annulée ; tunnel qui refuse le virement après sa date limite |
| Tentatives abandonnées | `DB_CIBLE=test npm run verify:abandons` | 24 cas, prestataire **simulé** : durée vide (rien n'est effacé ; la politique de confidentialité n'annonce aucune durée) ; durée de 7 jours (la politique l'annonce ; effacée avec paiements, nuits et fiche client, trace sans nom ni courriel ; 6 jours gardée) ; payée non constatée, remboursée, confirmée jamais touchées ; fiche client impossible à supprimer ; retour en arrière |
| Back-office | `DB_CIBLE=test npm run verify:gestion` | 97 cas, messagerie **simulée** : empreinte du mot de passe, codes, appareils ; création du compte (lien, aucun jeton en clair) ; mot de passe trop court, différent, lien usé ; connexion, code par courriel (texte), mauvais code, autre navigateur, appareil reconnu ; 29, 31 et 200 jours ; 7 et 9 heures d'inactivité ; 5 échecs par IP puis 15 minutes, autre IP libre ; 5 mauvais codes, code expiré ; retirer un appareil ; mot de passe oublié ; tout déconnecté après un changement ; réglages (bornes, champs liés, IBAN, BIC, journal avant/après, alerte « compte de virement modifié » et son texte, conditions du contrat intouchables) ; alertes. Avec `--http` (dans `lancer.sh`), 10 de plus : `/gestion` fermé sans session et non indexé, témoin inventé refusé, réglages et appareils ouverts avec une session |
| Back-office, réservations | `DB_CIBLE=test npm run verify:gestion-reservations` | 87 cas, prestataire et messagerie **simulés** : liste (vues, recherche, tentatives absentes) et fiche ; coordonnées et journal ; caution par carte (pas avant le départ, bornes, motif, types et taille des justificatifs, Stripe en panne sans trace, retenue de 120 €, pièce jointe, une seule retenue, libérer) ; chèque et virement (reçue, alerte du virement arrêtée, rendue, retenue de toute la caution) ; lien de caution ; solde par virement (montant exact, paiement en ligne annulé, aucune facture, mode imprimé) ; « À traiter » (caution, solde impayé 10 jours avant une arrivée dans 20, contrat non signé à 3 jours, virement pas reçu, caution à rendre, compte absent, contestation et courriel non parti avec « C'est fait ») ; arrivées ; « Plus loin » (trois périodes, arrivées à 2, 10, 40, 200 et 400 jours). Avec `--http`, 5 de plus : pages fermées sans session, liste, fiche, 404, accueil |
| Back-office, tarifs | `DB_CIBLE=test npm run verify:gestion-tarifs` | 87 cas : règles pures (prix, pourcentages, taux, jours, dates lisibles, découpage d'une période, jour de début, passé figé, période en cours, suppression, copie d'une année, trous, état) ; sur la base, prix en deux temps (récapitulatif, rien d'écrit avant la confirmation, empreinte périmée, doublon, prix invalide, nouveau tarif, suppression), périodes (découpage moyenne/haute/moyenne, jeudi refusé, période en cours raccourcie puis rétablie, suppression, copie de 2027 sur 2028), barèmes, règles générales, taxe de séjour (trois gîtes, correction, ligne figée), « À traiter » (nuits sans tarif, tarif sans prix). Avec `--http`, 6 de plus : les cinq pages et leur état. La tarification d'essai est rechargée à la fin |
| Back-office, calendrier | `DB_CIBLE=test STORAGE_PATH=./.data/documents-test npm run verify:gestion-calendrier` | 92 cas, prestataire et messagerie **simulés** : le seed laisse un gîte existant tel quel ; fiche d'un gîte (bornes, récapitulatif, rien d'écrit avant la confirmation, empreinte périmée, journal, nouvelle caution lue par le tunnel, fiche figée d'un contrat émis) ; bloquer des nuits (hier refusé, ordre des jours, un an au plus, chevauchement, sur une réservation avec le client et la référence, verrou expiré repris), calendrier du mois, débloquer (le passé reste) ; option (refus, 7 nuits avec l'échéance, courriel et lien, fermée aux autres, libre pour son client, autres dates refusées, tunnel par le lien sans verrou, retour en arrière, paiement : nuits vendues et option utilisée ; échéance : courriel abandonné, nuits libres, lien refusé ; levée ; anglais) ; documents (recherche, année, chemin du PDF, renvoi d'une facture, du lien de signature, du contrat signé en pièce jointe, client sans adresse). Avec `--http`, 13 de plus : trois pages et le PDF fermés sans session, ouverts avec ; « Ouvrir le PDF » ; la page du lien d'option ; un faux jeton refusé par le tunnel |
| Back-office, statistiques | `DB_CIBLE=test npm run verify:gestion-statistiques` | 26 cas, sur des séjours d'essai de 2045 aux chiffres connus : départements par le code postal (Corse, outre-mer, étranger) ; nuits par mois (séjour à cheval sur deux mois et sur deux années), séjours hors taxe au mois de l'arrivée, tentative et annulation écartées ; nombre, durée et délai moyens ; langue, pays saisis de trois façons, départements ; retenue faite et pas encore faite ; taux de commission (bornes, vide, 15 %) ; registre de l'année et de juin. Avec `--http`, 2 de plus : la page fermée sans session, puis affichée |
| Base réelle | `npm run verify:production` | **Lecture seule**, sans `DB_CIBLE` : migrations manquantes, vérifications préalables aux migrations 0009 et 0010, compteurs de numérotation et numéros émis, contenu, réglages. OK, INFO, A VOIR, BLOQUANT ; code de sortie 1 si un point est bloquant. Hors de `lancer.sh` |
| Base | `npm run db:verify` | Tables, colonnes, seed, fonctions de numérotation, triggers, index uniques, contraintes de tarification, du calendrier et du paiement, immutabilité du texte d'accord, stockage. **Tout est annulé par ROLLBACK** : aucun numéro consommé |
| Bout en bout | `bash scripts/parcours/lancer.sh` | Les vingt-six étapes : les contrôles ci-dessus, puis le parcours complet — contrat, signature, factures, idempotence, refus attendus, accès aux PDF, contrôles en base **et** sur les PDF produits. Les étapes « blocage » et « paiement » exigent les clés Stripe de test |

**Les deux réservations de test** (`scripts/parcours/reference.ts`) sont
complémentaires :

- **L'Armu** — `TEST-2026-ARMU-001`, avec options : prouve que les options sont
  itemisées et que les lignes s'additionnent jusqu'au sous-total.
- **LaPhine** — `TEST-2026-LAPHINE-002`, sans option : prouve qu'aucune ligne
  « Options : 0,00 € » n'apparaît, et sert à éprouver la garde du cas B
  (réservation modifiée après émission de la facture d'acompte → `409`).

**Les montants attendus sont le point de vérité.** Ils ne se modifient **que**
sur décision métier explicite — jamais pour faire passer un test.

**Tout s'exécute sur `gites_test`** (`DB_CIBLE=test`). Le script de remise à
zéro **refuse** de s'exécuter autrement.

**Le contrôle visuel reste obligatoire.** `controler-pdf.py --png` écrit la
première page de chaque document dans `.parcours/png/`. Les ouvrir au moins une
fois après toute modification du rendu : un PDF peut passer tous les contrôles
automatiques et être visuellement cassé — logo absent, bloc qui déborde en
page 2, chevauchement. Les contrôles automatiques vérifient le **contenu**, pas
la **mise en page**.

**Un test qui passe doit prouver ce qu'il annonce.** En Phase 1, un test de
péremption de lien passait pour la mauvaise raison : le chemin transmis au calcul
de signature était corrompu par la conversion automatique des chemins de Git
Bash. Le code de retour était bon, la démonstration nulle. Vérifier le **message
d'erreur**, pas seulement le code.

---

## 9. Outillage

**Fins de ligne : LF partout**, imposé par `.gitattributes` (explicitement pour `*.sh`, qu'un CRLF casse sous Git Bash avec `$'\r': command not found`), indépendamment du réglage `core.autocrlf` de chaque poste.

### Procédure de session : atteindre la base depuis un poste

Le port PostgreSQL public est fermé (D-10). Toute session qui doit lire ou
écrire en base monte un **tunnel SSH**. Cette procédure se refait à chaque
phase ; elle n'est pas un détail de confort, ses deux dernières étapes évitent
des pannes qui se diagnostiquent mal.

**1. Ouvrir le tunnel**, en tâche de fond :

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L 127.0.0.1:5433:<ip du conteneur>:5432 <utilisateur>@<ip du VPS>
```

`ExitOnForwardFailure` fait échouer la commande tout de suite si le port local
est déjà pris, au lieu d'ouvrir une session qui ne redirige rien.

**2. Diriger l'application vers le tunnel.** Deux façons, la seconde est
préférable :

- modifier `.env.local` (non suivi par git) pour pointer l'hôte et le port sur
  `127.0.0.1:5433` — **relever l'empreinte du fichier avant** (`sha256sum
  .env.local`) ;
- ou passer la variable **en ligne de commande** pour la durée de la commande :
  rien n'est modifié, donc rien n'est à restaurer.

Dans les deux cas : **ne basculer que `DATABASE_URL_TEST`**, en laissant
`DATABASE_URL` sur l'adresse publique fermée. Une commande lancée sans
`DB_CIBLE=test` échoue alors au lieu d'atteindre la base réelle. C'est une
garde technique, et non une discipline à tenir de tête.

**3. Travailler.** Les essais se font sur `gites_test`, jamais sur la base
réelle — y compris les démonstrations (voir D-11 et la fiche de la Phase 2). Une
valeur modifiée pour un test se restaure par un `UPDATE` vers la valeur relevée
avant, **jamais** par `npm run db:seed`, qui écrase les valeurs saisies au
back-office.

**4. Refermer, et vérifier qu'on a refermé.**

- Remettre `.env.local` à l'identique si l'étape 2 l'a modifié, et **comparer
  l'empreinte** à celle relevée : c'est une preuve de restauration qui n'affiche
  aucun secret. Un `.env.local` laissé sur `127.0.0.1:5433` échoue en silence à
  la session suivante, sans rapport apparent avec la cause.
- Fermer le tunnel et **contrôler** que le port 5433 n'écoute plus. Sous
  Windows, arrêter la tâche ne suffit pas : `ssh.exe` survit et garde le port.

```powershell
$c = Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force }
```

**L'adresse du conteneur change à chaque redémarrage.** Si les connexions
cessent de passer alors que le tunnel tourne, c'est la première hypothèse à
tester — avant toute autre :

```bash
ssh <utilisateur>@<ip du VPS> \
  "sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <conteneur du projet>"
```

Puis rouvrir le tunnel avec la nouvelle adresse. Le conteneur du projet est
celui du § 1 : **jamais `coolify-db`**.

**Une adresse IP versée dans l'historique git est permanente.** Elle ne
disparaît pas si le dépôt devient public plus tard, ni si on la retire dans un
commit ultérieur. D'où les marques de remplacement ci-dessus : les valeurs
réelles vivent dans le gestionnaire de mots de passe des propriétaires.
