# Journal des phases — Les Gîtes de Samoyas (SARL DE LA VOUTE)

Ce fichier consigne, pour chaque phase ou session de travail close, ce qui a
été fait, les valeurs de référence des montants de test, les décisions
structurantes et les points reportés. Il vit dans git, avec le code qu'il
décrit : c'est le point de départ de toute session suivante. Une session qui
se termine sans mettre ce fichier à jour n'est pas terminée.

Vocabulaire : ACOMPTE (jamais « arrhes »). Entité légale : SARL DE LA VOUTE.

---

## Phase 0 — Fondation données (close le 14 septembre 2026)

### Ce qui a été fait

- Base PostgreSQL 17 sur le VPS (Coolify), reconstruite depuis zéro avec
  Drizzle dans `db/` : schéma TypeScript (`db/schema/`), deux migrations
  appliquées (`0000_schema_initial.sql`, `0001_fonctions_triggers.sql`), seed
  des trois gîtes (`db/seed.ts`), script d'auto-vérification (`db/verify.ts`,
  74 contrôles, toutes les écritures annulées par ROLLBACK).
- Tables : gites, reservations, documents, signatures, factures,
  compteurs_documents, et trois tables provisoires (paiements, disponibilites,
  avis, audit_logs).
- Numérotation légale sans trou par `compteurs_documents` + fonction SQL
  `prochain_numero(série, année)` (UPSERT verrouillant) ; `creer_facture(...)`
  est le seul point d'entrée pour créer une ligne `factures`.
- Trigger d'immutabilité sur `signatures` (UPDATE et DELETE refusés), trigger
  `updated_at` sur reservations.

### Décisions structurantes (validées, à ne pas rediscuter)

- `documents.url_pdf` NOT NULL (chemin relatif dans le stockage, jamais une
  URL) ; `signatures.document_id` UNIQUE ; `documents.token` nullable avec
  index unique partiel.
- `ip_signataire` en `inet` nullable : NULL si inconnue, jamais une chaîne de
  repli.
- Dates civiles en `date` (arrivée, départ, émission), heures en `time`,
  instants en `timestamptz`. Année et date d'émission des factures prises en
  heure de Paris.
- `prochain_numero` renvoie la chaîne formatée (`CTR-2026-001`, trois chiffres
  minimum, sans troncature) ; aucune logique de numérotation côté JS.
- Seed : forfait ménage 80 € pour les trois gîtes, slugs `laphine`, `armu`,
  `maison-vieille` ; cautions 500 / 400 / 500 €.

### Points reportés

- ~~Le site vitrine (`lib/data/gites.ts`) utilise encore les slugs `larmu` et
  `maisonvieille` : à aligner sur `armu` / `maison-vieille`.~~ **Fait en
  Phase 2** (D-14).
- Séparation des rôles PostgreSQL (lecture seule pour le site vitrine) à
  décider en Phase 3.
- En production, `DATABASE_URL` doit viser l'hôte interne du réseau Coolify.

---

## Session A — Fusion du module de contrat dans le site (close le 15 septembre 2026)

Branche `feat/fusion-module-contrat`, commits `c77d1ee` → `bc04e05`.

### Ce qui a été fait

- L'ancien dépôt `Logiciel-contrat-` est absorbé dans le site : Supabase
  remplacé par Drizzle + pg (`db/`), stockage des PDF par `lib/storage.ts`
  (fichiers sur `STORAGE_PATH`, servis uniquement par des liens signés
  `/api/documents/...` à durée limitée).
- Routes : `POST /api/contrats` (numéro CTR, ligne documents, PDF et
  `reservations.numero_contrat` dans une transaction, idempotent),
  `POST /api/contrats/signer` (preuve `signatures`, PDF signé, statut
  `signe`, dans une transaction), `POST /api/factures` (acompte ou solde via
  `creer_facture`, ré-émission idempotente pour le même numéro).
- Page publique de signature `/signer/[token]` : aperçu du PDF, nom du
  signataire, case de consentement avec le texte exact enregistré en preuve,
  écrans 404 / 409 / 410.
- Composants PDF (`components/pdf/`) : contrat avec bloc de signature
  électronique simple (SES, art. 3 point 10 eIDAS) recueillie par le
  Bailleur, sans prestataire tiers ; factures d'acompte et de solde.
- Un seul secret service-à-service (`DOCUMENT_SERVICE_SECRET`, en-tête
  `x-service-secret`). Base de test `gites_test` activée par `DB_CIBLE=test`
  (`DATABASE_URL_TEST`), pour ne consommer aucun numéro légal sur la base
  réelle.

### Valeurs de référence des montants de test

Réservation de test : gîte L'Armu (caution 400 €), Mme Camille DURAND et
M. Julien DURAND (Lyon), du 17 au 24 octobre 2026 (7 nuits), 2 adultes et
1 enfant, arrivée 17 h, départ 10 h, paiement carte bancaire, référence
`TEST-PAY-0001`, acompte encaissé le 15 septembre 2026.

| Poste | Montant |
|---|---|
| Location (7 nuits) | 457,30 € |
| Forfait ménage | 80,00 € |
| Options | 25,50 € |
| Sous-total | 562,80 € |
| Taxe de séjour (5,5 %) | 13,86 € |
| Total TTC | 576,66 € |
| Acompte (30 % du TTC) | 173,00 € |
| Solde | 403,66 € |
| Caution (non facturée) | 400,00 € |

Documents produits sur `gites_test` : CTR-2026-001 (signé), FAC-2026-001
(acompte, 173,00), FAC-2026-002 (solde, 403,66). Une seconde réservation
(LaPhine, 620,00 € sans option) a produit CTR-2026-002.

### Décisions structurantes

- Règle de calcul (validée le 12 juin 2026) : sous-total = location + forfait
  ménage + options ; total TTC = sous-total + taxe de séjour ; acompte = 30 %
  du TOTAL TTC (taxe incluse) ; solde = total − acompte. La taxe de séjour est
  fournie par la réservation, jamais recalculée.
- La LIGNE EN BASE (`factures`, `documents`, `signatures`) est le document
  légal ; le PDF n'en est qu'une représentation. Un PDF échoué se ré-émet pour
  le même numéro.
- `fmtEuro` (`lib/format.ts`) est le seul formateur calcul → affichage.
- Forfait ménage : réservation > gîte > défaut ; caution : gîte > défaut.

### Points reportés (repris en session B)

- Modèle interne des montants en euros flottants (`mode: "number"`, `round2`).
- Les options entrent dans les totaux mais ne sont itemisées sur aucun
  document (les lignes de la facture ne s'additionnent pas visuellement).
- Logo des PDF chargé par requête HTTP vers l'origine du site.
- Instantané `factures.donnees` figé avant la frappe du numéro
  (`numeroFacture` vide).

---

## Session B — Centimes entiers, options, logo, instantané (close le 16 septembre 2026)

Branche `feat/fusion-module-contrat`, commits `0531df3` → `1bbf7e5` (non
poussés).

### Ce qui a été fait

- **Modèle monétaire en centimes entiers.** En mémoire et dans tous les
  calculs, un montant est un entier de centimes (576,66 € = 57666). Deux
  fonctions de frontière, et deux seulement, dans `lib/centimes.ts` :
  `centimesDepuisNumeric` (texte numeric PostgreSQL → centimes, par découpage
  de chaîne, jamais ×100) et `numericDepuisCentimes` (centimes → texte à deux
  décimales). Colonnes de montants du schéma en `mode: "string"` (aucune
  migration : le type SQL ne change pas), conversion base → mémoire dans
  `lib/reservations.ts`, `fmtEuro` prend des centimes, `round2` supprimé. Les
  taux (taux de taxe de séjour, taux d'acompte) restent des décimaux ; le seul
  arrondi du modèle est le `Math.round` de la conversion du taux d'acompte en
  montant. Script de contrôle : `npm run verify:centimes` (51 cas).
- **Ligne « Options »** sur les deux tableaux du contrat, les deux factures et
  le récapitulatif de la page de signature, affichée seulement si le montant
  est différent de zéro. Les lignes de la facture s'additionnent désormais
  jusqu'au sous-total.
- **Logo lu sur le disque** (`lib/logo.ts`, `public/logo.png` depuis
  `process.cwd()`, gardé en mémoire). En cas d'échec de lecture, le PDF est
  généré sans logo et l'erreur journalisée ; la route n'échoue jamais.
- **Instantané `factures.donnees`** réécrit avec le numéro et la date
  d'émission réels dans la même opération que `pdf_url`, et auto-décrit :
  `unite: "centimes"`, `formatVersion: 2`.
- **Garde d'émission** dans `POST /api/factures`, avant `creer_facture` :
  HTTP 500 si acompte + solde ≠ total sur des montants fraîchement calculés
  (bug du code) ; HTTP 409 si la réservation a changé depuis la facture
  d'acompte déjà émise (situation métier, message avec la marche à suivre).
- Factures resserrées de 24 pt pour tenir sur une page avec la ligne Options ;
  `db:verify` compare les compteurs avant/après ROLLBACK au lieu d'exiger zéro.

### Valeurs de référence des montants de test

Même réservation Durand / L'Armu qu'en session A, rejouée sur `gites_test`
remise à zéro. Les neuf montants sont identiques au centime à ceux de la
session A (seule différence sur les documents : la ligne Options ajoutée et
la date d'émission du jour).

| Poste | Session A | Session B | Centimes en base |
|---|---|---|---|
| Location (7 nuits) | 457,30 € | 457,30 € | 45730 |
| Forfait ménage | 80,00 € | 80,00 € | 8000 |
| Options | 25,50 € | 25,50 € | 2550 |
| Sous-total | 562,80 € | 562,80 € | 56280 |
| Taxe de séjour (5,5 %) | 13,86 € | 13,86 € | 1386 |
| Total TTC | 576,66 € | 576,66 € | 57666 |
| Acompte (30 %) | 173,00 € | 173,00 € | 17300 |
| Solde | 403,66 € | 403,66 € | 40366 |
| Caution | 400,00 € | 400,00 € | 40000 |

Seconde réservation Martin / LaPhine (620,00 € sans option) : total 715,40 €,
acompte 214,62 €, solde 500,78 € ; aucune ligne Options sur aucun document.

### Décisions structurantes

- Un montant est un entier de centimes partout hors des deux fonctions de
  frontière ; toute multiplication ou division par 100 sur un montant est
  interdite (le `/ 100` de `lib/montants.ts` porte sur le taux, pas sur un
  montant).
- L'intitulé des options est générique (« Options ») tant que la table
  `reservations` n'a pas de libellé.
- Format 2 de l'instantané facture ; le format 1 (euros flottants) n'a jamais
  été stocké en base réelle.

### Points reportés

- Phase 5 (back-office) : nommer les options (libellé en base) et remplacer
  l'intitulé générique.
- Déploiement : avec `output: "standalone"`, Next.js ne copie pas `public/` ;
  vérifier au premier déploiement que `public/logo.png` est présent à côté
  du serveur (le journal signale `[logo] Lecture … impossible` sinon).
- Colonne `paiements.montant` passée en mode texte sans code appelant (Phase 3).
- Les pages `/signer` d'erreur (lien invalide, déjà signé, expiré) répondent
  en HTTP 200 avec le message ; seul l'API renvoie 404 / 409 / 410.

---

## Phase 2 — Assainissement et connexion du site (close le 18 septembre 2026)

Branche `main`, commits `e341c01` → (commit de documentation).

### Ce qui a été fait

- **L'ancien site statique est supprimé** : les 9 `.html` de la racine,
  `assets/` (11 fichiers) et `admin/` (9 maquettes du back-office), commit
  `e341c01`. `eslint.config.mjs` n'a plus à les exclure. Les maquettes se
  relisent par `git show e341c01^:admin/<page>.html`.
- **Les slugs du site sont ceux de la base** (`armu`, `maison-vieille`), avec
  deux redirections **301** pour les anciennes adresses. Décision D-14.
- **Les chiffres des gîtes se lisent en base** par `lib/gites-publics.ts` :
  capacité, tarif de basse saison, forfait ménage, caution, taux de taxe de
  séjour. Décision D-13. Pages concernées : accueil, `/gites`, `/gites/[slug]`,
  `/contact`, plus la carte gîte.
- **`tarif_semaine_base` est défini** : tarif de **basse saison**, donc prix
  plancher. Décision D-15, écrite aussi dans `db/schema/gites.ts`. Le « Dès … »
  est le **minimum de la grille affichée**, pas une lecture séparée : la page
  est cohérente par construction.
- **Le taux d'acompte et le délai de solde** viennent de `lib/constantes.ts`,
  les mêmes constantes que `lib/montants.ts` utilise pour les échéances.
- **Le README** décrit l'application réelle, plus un site statique.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, et `npm run build` **tunnel fermé** :
  le build ne dépend plus de la base (risque R-2 levé).
- Caution affichée : **400 € sur L'Armu**, 500 € sur les deux autres — la valeur
  fausse en dur a disparu.
- Cache de 60 s, sur `gites_test` : tarif passé à 451,00 par `UPDATE`, ancienne
  valeur encore servie juste après, nouvelle valeur affichée **24 s** plus tard,
  puis valeur d'origine rétablie par `UPDATE` (jamais par `db:seed`).
- `tarif_semaine_base` à `NULL` : page en 200, grille et « Dès » du gîte
  masqués, journal `VALEUR ABSENTE EN BASE`.
- Base injoignable (connexion refusée, puis base muette) : les quatre pages
  répondent **200** en mode dégradé, en **3,1 s** au pire, journal `BASE
  INJOIGNABLE`.
- `bash scripts/parcours/lancer.sh` **en entier** : ses **8 étapes** passent,
  **0 échec**. Les compteurs, séparément — le parcours n'en publie pas un seul,
  et les confondre fait passer une étape pour le filet complet :

  | Étape | Contrôles |
  |---|---|
  | Conversion des montants (aller-retour centimes) | 51 cas |
  | Remise à zéro de la base de test | — |
  | Parcours L'Armu (avec options) | 12 |
  | Parcours LaPhine (sans option, garde du cas B) | 13 |
  | Accès aux PDF par URL signée | 5 |
  | Contrôles en base (montants, instantanés, numérotation) | **81** |
  | Contrôles sur les PDF produits | 92 |
  | Auto-vérification de la base (`db:verify`) | **74** |

  Les **81** de `scripts/parcours/controler.ts` et les **74** de `db:verify` sont
  deux étapes distinctes : citer « 74 » seul décrit `db:verify`, pas le parcours.
- Logo présent sur l'accueil, une fiche et le tunnel (captures d'écran).

### Points reportés

- **Le tunnel de réservation contredit les fiches** : il affiche « Caution
  Swikly 500 € » pour L'Armu, dont la fiche affiche maintenant 400 €. Ses autres
  chiffres (ménage, taxe, capacités) sont également en dur. À lever en Phase 3,
  avant toute mise en ligne — voir `docs/phases/phase-3.md`.
- **Un `?gite=` inconnu réserve LaPhine en silence** (`app/reserver/page.tsx`).
  Phase 3.
- **Taxe de séjour** : la méthode de calcul actuelle (5,5 % du séjour et du
  ménage) ne suit pas la règle légale. Devenu le point **10** de
  `docs/06-avant-premier-client.md`, détaillé dans `docs/03-conformite.md`
  § 7 bis, à trancher en Phase 3.
- **Le drapeau `actif` n'a aucun effet** sur le site : à décider en Phase 5.
- **Les trois saisons hors basse** restent en code (`lib/data/pricing.ts`),
  en attendant le modèle de saisons de la Phase 5.
- **Les adresses de l'ancien site en ligne** restent à relever et à rediriger
  au moment de la mise en ligne : Phase 7.

### Le mécanisme mis au jour : l'erreur devient visible

Brancher une source sur la base **en laissant l'autre en dur** transforme une
erreur **silencieuse** en erreur **visible**.

Avant cette phase, la fiche de L'Armu et le tunnel affichaient tous les deux
« Caution 500 € » : faux, mais **d'accord entre eux**, donc invisible. Depuis que
la fiche lit la base (400 €) et que le tunnel garde sa valeur en dur (500 €), la
contradiction saute aux yeux du premier lecteur.

**C'est un progrès, pas une régression.** Une erreur visible se corrige ; une
erreur cohérente survit des années, jusqu'au client qui la découvre sur son
contrat. La bonne lecture d'une divergence apparue après un branchement est donc
« la moitié du chemin est faite », et non « on a cassé quelque chose ».

À garder en tête pour chaque phase qui branchera une source de plus : la liste
des endroits **restés en dur** doit être écrite au moment du branchement, pas
découverte plus tard. Pour la Phase 3, elle est dans `docs/phases/phase-3.md`.

### Deux formulations ont changé

Elles portaient un chiffre que le code ne pouvait plus garantir :
« regroupables jusqu'à **dix** personnes » devient « jusqu'à **10** personnes »,
calculé depuis la base ; et le récit de La Maison Vieille ne porte plus ce
total.

**Une troisième a été corrigée après relecture.** Le titre de repli du bloc
tarifs, écrit « La semaine, tout compris », a été remplacé par « Tarifs à la
semaine ». « Tout compris » est une **allégation** — et une allégation inexacte,
puisque le forfait ménage, la taxe de séjour et la caution s'ajoutent. C'était la
même faute que celle refusée en DO-2.4 avec « tarif sur demande ». D'où la
**règle 3** de `docs/05-protocole-phase.md` : une session écrit des libellés
descriptifs, jamais des formules qui vendent ou qui promettent. La formule
héritée de la variante avec prix (« À partir de X €, la semaine, tout compris »)
n'a pas été réécrite d'autorité : elle devient l'écart **E-8** de
`docs/03-conformite.md`, à trancher avec les propriétaires en Phase 6.

---

## Cadrage de la Phase 3 — décision caution (9 octobre 2026)

Ce n'est pas une clôture de phase : la Phase 3 est ouverte, pas close. Cette
entrée consigne une décision prise pendant son cadrage, qui a modifié le contrat
et cinq pages du site.

### Ce qui a été fait

- **Décision D-16** (`docs/02-decisions.md`) : la caution est une
  préautorisation Stripe faite la veille du départ sur la carte de l'acompte,
  sans prestataire tiers. Le mécanisme, ses paramètres et les cinq alternatives
  écartées y sont consignés. **Rien du mécanisme n'est développé** : il
  appartient à la Phase 4.
- **Contrat** (`components/pdf/ContratPDF.tsx` et `docs/contrat-template.md`),
  en un seul changement : articles 6.2 à 6.5 réécrits, article 5.1 (solde au
  choix du Locataire), articles 14.2, 14.4 et 14.5, ligne « Caution » du
  récapitulatif. La numérotation 6.1 à 6.5 est **conservée** : les renvois des
  articles 10 et 11 restent justes sans y toucher.
- **`TEMPLATE_VERSION` passe à `v2`** (`app/api/contrats/route.ts`).
- **Pages publiques** : fiche gîte, tunnel (4 endroits), suivi, CGV, cookies.
  Le tunnel reçoit désormais la caution **lue en base** ; la page de suivi,
  encore fictive, ne porte plus de montant.
- **Référentiel** : écart E-4 reformulé, point 3 de la liste de contrôle
  remplacé, fiches des Phases 3, 4, 5 et 6 complétées.
- Dans l'écran de succès du tunnel, la caution passe de la 2ᵉ à la 4ᵉ étape :
  elle est maintenant la dernière dans le temps.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run verify:centimes` : passe.
- **Nombre de pages du contrat.** L'article 6 s'allonge, et le parcours exige
  10 pages. Le contrat a été rendu hors serveur, ancien et nouveau texte, sur
  les deux réservations de référence, signé et non signé : **10 pages dans les
  huit cas**. Les pages 4 et 5 ont été relues à l'œil.
- Le contrôle `montant(texte, "Caution")` de `controler-pdf.py` retrouve 400,00
  et 500,00 sur le nouveau texte : il n'a pas été modifié.
- Les cinq pages publiques répondent 200 et affichent les nouvelles phrases,
  **base injoignable** : c'est donc la variante sans montant du tunnel qui a
  été vue.
- Recherche du nom de l'ancien prestataire dans le dépôt : il ne reste que
  D-16, qui le documente comme alternative écartée, et trois lignes
  d'historique laissées intactes (ce journal, section Phase 2, et
  `docs/phases/phase-2.md`).

### Ce qui n'a PAS été vérifié

- **`bash scripts/parcours/lancer.sh` n'a pas été rejoué** : il exige le tunnel
  vers la base de test, qui n'était pas ouvert. La règle absolue n° 7 n'est donc
  pas satisfaite pour ce changement, et il ne doit pas être considéré comme
  clos tant que le parcours n'a pas tourné. Aucun montant n'a été touché et
  `reference.ts` est inchangé ; le risque porte sur le rendu du contrat, couvert
  à part ci-dessus.
- **La variante avec montant du tunnel** (« Caution de 400 € ») n'a pas été
  vue, faute de base joignable.

**Complément du même jour, avant commit.** Tunnel ouvert, serveur sur 3001 en
`DB_CIBLE=test` : `bash scripts/parcours/lancer.sh` rejoué **en entier**, ses
8 étapes passent, 0 échec. Les deux contrats (`v2`) font 10 pages, caution
imprimée 400,00 € et 500,00 €, montants de `reference.ts` inchangés. Page 1 et
page de l'article 6 ouvertes en image : pas de débordement. La règle n° 7 est
satisfaite pour ce changement. La variante avec montant du tunnel de
réservation reste non vue.

### Points reportés

- **Le texte de l'article 6 n'a été relu par aucun juriste.** Point 3 de
  `docs/06-avant-premier-client.md`.
- **Deux confirmations écrites de Stripe** sont un préalable à la Phase 4
  (réponses obtenues par chat le jour même : voir le point 3 de
  `docs/06-avant-premier-client.md`).
- **Le choix du mode de règlement du solde** est écrit au contrat mais n'existe
  dans aucun écran : Phase 3 pour le choix, Phase 4 pour les deux circuits. Les
  phrases du site qui annoncent encore un prélèvement automatique sont listées
  dans `docs/phases/phase-3.md`.
- **L'article 14 nomme Stripe et Brevo**, qui ne sont branchés ni l'un ni
  l'autre : exact pour le système cible, pas pour le code d'aujourd'hui.
- **`CAUTION_DEFAUT`** reste un repli silencieux à 500 € : à trancher en
  Phase 4.
- Hors code : ce que couvre l'assurance des propriétaires au-delà de la caution.

---

## Phase 3 — fin du cadrage et lot 1 « prix » (10 au 14 octobre 2026)

La phase reste ouverte : c'est le premier des cinq lots
(`docs/phases/phase-3.md`). Commité le 14 octobre 2026 : `44e22de` (calcul,
tables, contrôles), `f99322b` (pages), puis la documentation.

### Ce qui a été décidé

Toutes les décisions du cadrage sont consignées dans
`docs/phases/phase-3.md` (section « Décisions arrêtées au cadrage ») ; les
structurantes ont leur entrée : **D-17** (tarification), **D-18** (taxe de
séjour), **D-19** (caution par carte, chèque ou virement, complète D-16),
**D-20** (paiement intégral à moins de 30 jours). **D-15 est remplacée.**

### Ce qui a été fait

- **Sept tables** (`tarifs`, `tarifs_prix`, `periodes`, `baremes`,
  `baremes_coefficients`, `reglages`, `taxes_sejour`) et **deux migrations** :
  `0002_tarification` (générée) et `0003_tarification_contraintes` (écrite à la
  main : interdiction du chevauchement des périodes, ligne unique de
  `reglages` avec la règle générale « libre » et les périodes au samedi, sans
  barème général).
- **Calcul du prix d'un séjour** (`lib/tarification.ts`) et **de la taxe de
  séjour** (`lib/taxe-sejour.ts`), purs ; lecture en base (`lib/tarifs.ts`) ;
  lecture exacte des taux et coefficients et division arrondie
  (`lib/decimaux.ts`) ; dates civiles en UTC (`lib/dates-civiles.ts`).
- **Fiches gîtes, liste, accueil** : la grille vient des tables (une ligne par
  tarif : nuit, semaine, dates), le « À partir de » est le minimum de la grille,
  la taxe affiche la règle en vigueur. **`lib/data/pricing.ts` est supprimé** :
  plus aucun prix n'est écrit dans le code des pages. Une troisième panne est
  journalisée à part : « TARIFICATION ILLISIBLE ».
- **Contrôles** : `npm run verify:tarification` (102 cas), 27 contrôles de plus
  dans `db:verify`, et une étape de plus dans `lancer.sh` (9 au lieu de 8).
- **Base de test** : la remise à zéro charge une tarification d'essai, marquée
  « (essai) » (`scripts/parcours/tarifs-fictifs.ts`), avec la taxe réelle de
  Savas.
- Documentation : décisions, conformité § 7 bis, architecture, avant premier
  client (points 3 et 10 complétés, point 11 créé), fiches des phases 3, 4 et 5,
  contexte métier, README de `db/` et du parcours, `CLAUDE.md`.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run verify:tarification` : **102 cas, 0 échec**, dont les deux exemples
  officiels de la taxe (15,75 € et 9,68 €) au centime.
- **Sur une base PostgreSQL jetable créée sur le poste** (16.13, détruite
  ensuite ; voir « pas vérifié ») : les **4 migrations** s'appliquent sur une
  base vierge ; `db:verify` : **101 contrôles, 0 échec** ; la lecture en base
  redonne les montants du calcul (5 séjours et une taxe, script jetable
  supprimé) ; les fiches répondent 200 et affichent la grille d'essai
  (L'Armu : 75 € la nuit, 450 € la semaine en basse saison, « À partir de
  450 € », règle de taxe complète) ; table `reglages` renommée pour simuler une
  tarification illisible → page 200, grille et taxe masquées, capacité et
  caution conservées, journal « TARIFICATION ILLISIBLE ».
- **`bash scripts/parcours/lancer.sh`** contre cette base jetable, serveur sur
  3001 : **9 étapes sur 9 passent** — conversion 51 cas ; prix et taxe 102 cas ;
  remise à zéro ; parcours L'Armu 0 échec ; parcours LaPhine 0 échec ; URL
  signées 0 échec ; contrôles en base 81, 0 échec ; contrôles PDF 92 OK ;
  `db:verify` 101, 0 échec. Les montants de `reference.ts` sont inchangés et
  retrouvés.

### Ce qui n'a PAS été vérifié

- **Les migrations 0002 et 0003 ne sont appliquées ni sur `gites_test` ni sur la
  base réelle.** Le tunnel SSH n'était pas ouvert, et l'hôte de la
  configuration SSH du poste ne correspond pas à celui des chaînes de connexion :
  la session n'a pas deviné le serveur. La règle n° 7 est donc satisfaite sur
  une base jetable de même schéma, **pas sur `gites_test`**. À rejouer tunnel
  ouvert : `DB_CIBLE=test npm run db:migrate`, puis `lancer.sh`.
- PostgreSQL **17** : la base jetable était en 16. Rien d'utilisé n'en dépend
  (intervalles de dates, tableaux, contraintes d'exclusion natives).
- **La mise en page** de la nouvelle grille (4 colonnes, plusieurs plages par
  tarif, réglage mobile) : seul le contenu HTML a été lu, aucune capture.
- Sur la base réelle, **après migration, les fiches masqueront leurs prix**
  tant que rien n'est saisi (point 11) : voulu, mais à savoir avant de migrer.

### Écarts avec le plan annoncé

- Le plan citait l'exemple « 860 € » parmi les contrôles : il appartenait au
  premier modèle (prix à la semaine), abandonné au profit du prix à la nuit ;
  les contrôles portent sur les exemples du modèle retenu (372,50 €, 94,29 €…).
- La taxe de l'exemple « 2 adultes + 1 enfant, 780 € » vaut **28,70 €**, non
  28,60 € comme annoncé au cadrage : le guide officiel arrondit à chaque étape.
- **Ajouts de la session**, cohérents avec les réponses du gérant et
  **confirmés par lui après la livraison** (14 octobre 2026) : les règles et le
  barème peuvent aussi être portés par une **période** (« ça dépend des
  périodes et même des années ») ; un **jour de départ** autorisé s'ajoute au
  jour d'arrivée (sans lui, « samedi → samedi » ne s'exprime pas) ; et la règle
  des séjours à cheval sur plusieurs périodes (D-17).
- L'âge en dessous duquel on ne paie pas la taxe avait été annoncé comme
  réglable : ce n'est **pas** un réglage, c'est la loi (les mineurs, art.
  L.2333-31 du CGCT).
- Le bandeau de réservation des fiches ne mentionne plus le taux de taxe : la
  taxe n'est plus un taux unique, la règle complète est dans les conditions.

### Points reportés

- Lot 2 : bébés dans la capacité ; occupants et ménage de la taxe (service taxe
  de séjour) ; âges et horaires du tunnel.
- Les PDF impriment encore « Taxe de séjour (5,5 %) » à partir de la
  réservation : lot 5.
- Retrait des colonnes `gites.tarif_semaine_base`, `tarif_weekend`,
  `taux_taxe_sejour` : migration à écrire quand plus rien ne les lit.

---

## Phase 3 — lot 2 « calendrier et réservation » (15 octobre 2026)

La phase reste ouverte : lots 3 à 5 à faire (`docs/phases/phase-3.md`).

### Ce qui a été décidé

Avec le gérant, le 15 octobre 2026 :
- le **premier bébé** de moins de 2 ans ne compte pas dans la capacité ; un
  second prend une place ; un seul lit bébé ;
- une arrivée se réserve **au plus tard la veille** ;
- les **horaires** valent pour les trois gîtes ;
- la **civilité est facultative** (CJUE, 9 janvier 2025, C-394/23).

Par la session : **D-21** (blocage des dates, une ligne par nuit, verrou expiré
repris sans tâche de nettoyage) ; et pour D-20, le paiement intégral commence
au jour limite du solde inclus.

### Ce qui a été fait

- **Migration 0004** : les réglages du tunnel dans `reglages` (durée du
  blocage, délai, horaires, bébés) ; forme définitive de `disponibilites` (trois
  états, l'état « libre » stocké supprimé, contraintes sur le verrou) ;
  `reservations.detail_calcul` (le devis figé) ;
  `taxes_sejour.bebes_parmi_occupants` (la question des bébés dans la taxe
  devient un réglage, comme le ménage).
- **Devis** (`lib/devis.ts`) et **coordonnées** (`lib/coordonnees.ts`) :
  modules purs, exécutés par le navigateur pour l'affichage et par le serveur
  pour l'engagement. L'acompte vient du calcul des documents
  (`montantsDesPostes`, extrait de `lib/montants.ts` sans changer aucun
  montant).
- **Côté serveur** : `lib/disponibilites.ts` (blocage en une requête sur
  l'index unique), `lib/tunnel.ts` (charger ou refuser, enregistrer, proposer
  les autres gîtes, abandonner), `POST /api/reservations` et
  `DELETE /api/reservations/{id}`.
- **Tunnel** : calendrier réel, voyageurs selon la capacité, prix dès le choix
  des dates, coordonnées dont le nom de chaque adulte, récapitulatif, écran de
  paiement avec compte à rebours (bouton « Payer » inactif jusqu'au lot 3),
  écran « dates prises » avec les autres gîtes libres. `/reserver` sans gîte :
  écran de choix ; gîte inconnu : 404 ; base illisible : « momentanément
  indisponible ».
- **Fiches gîtes** : le calendrier affiche les vraies nuits prises et les nuits
  sans tarif ; les dates inventées (`BUSY_SETS`) sont supprimées.
- **Contrôles** : 35 cas de plus dans `verify:tarification` (137) ;
  `scripts/verifier-blocage.ts` (39 cas, dont deux clients simultanés et les
  codes de réponse du serveur) ; 14 contrôles de plus dans `db:verify` (115) ;
  une étape de plus dans `lancer.sh` (10).

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent. Le tunnel pèse
  16 ko dans le navigateur et n'embarque aucun code serveur.
- **Sur une base PostgreSQL 16 jetable** créée sur le poste (tunnel SSH fermé),
  puis détruite : les **5 migrations** s'appliquent sur une base vierge.
- **`bash scripts/parcours/lancer.sh` : 10 étapes sur 10 passent** — conversion
  51 cas ; prix, taxe et devis 137 cas ; remise à zéro ; blocage et tunnel
  39 cas ; parcours L'Armu 0 échec ; parcours LaPhine 0 échec ; URL signées
  0 échec ; contrôles en base 81, 0 échec ; contrôles PDF 92 OK, 0 échec ;
  `db:verify` 115, 0 échec. Montants de `reference.ts` inchangés.
- **Deux clients simultanés** : un seul blocage réussit, en base comme par le
  serveur (un 201, un 409 « dates prises » avec les deux autres gîtes).
- **Écrans** parcourus par un navigateur sans fenêtre, de l'étape 1 à l'écran
  de paiement (blocage réel, compte à rebours), puis retour : tentative
  supprimée, nuits libérées. Captures à 1 280 px et à 390 px : aucun débordement
  mesuré sur téléphone.
- **Panne simulée** (table `reglages` renommée) : tunnel « momentanément
  indisponible », enregistrement en 503 ; fiche en 200, calendrier et grille
  masqués, caution et ménage affichés, retour à la normale après la panne.

### Ce qui n'a PAS été vérifié

- **`gites_test` et la base réelle n'ont reçu ni 0002, ni 0003, ni 0004** (tunnel
  fermé). La règle n° 7 est satisfaite sur une base jetable de même schéma, pas
  sur `gites_test`.
- PostgreSQL 17.
- La **limite anti-abus derrière Traefik** : elle suppose que le proxy écrit
  `X-Forwarded-For` (`docs/04-architecture.md` § 6). À contrôler au déploiement.
- Dans le navigateur : l'écran « dates prises » (vérifié par le serveur
  seulement), le bouton « Bloquer à nouveau » après expiration, et la levée du
  blocage par « Quitter la réservation ».

### Écarts avec le plan annoncé

- **Fichiers ajoutés** : `lib/coordonnees.ts` (le même contrôle des coordonnées
  pour le navigateur et le serveur) et `app/reserver/EnteteTunnel.tsx` (l'en-tête
  partagé par le tunnel, le choix du gîte et la page d'indisponibilité).
- **`DELETE /api/reservations/{id}`** au lieu de `…/{id}/blocage` : l'abandon
  supprime la tentative entière, pas seulement son blocage.
- **`db/schema/gites.ts` n'a pas changé** : les réglages de bébés sont généraux
  (« un bébé par réservation »), pas par gîte.
- **Bébés et taxe** : prévu comme un paramètre du calcul, devenu un réglage daté
  de `taxes_sejour`, sur le modèle du ménage.
- **Écran de succès retiré** : il affichait une fausse référence et des formules
  non validées ; il se reconstruit au lot 3 avec le paiement.
- **Phrases du solde** réécrites de façon descriptive dans le tunnel (« à régler
  au plus tard le … ») au lieu de « prélevé J-30 », qui n'est plus vrai pour
  tous les clients.
- **Corrigé en cours de route** : la limite anti-abus comptait aussi les
  demandes mal formées et s'appliquait aux appels locaux — le parcours l'a
  révélé par un 429 ; `isGiteId("toString")` répondait vrai (`in` remonte au
  prototype de l'objet) — corrigé par `hasOwnProperty`.

### Points reportés

- **Lot 3** : paiement Stripe ; écran de succès ; taux d'acompte et délai du
  solde en réglages, figés sur la réservation ; le retour de paiement devra
  vérifier que les nuits sont toujours au nom de la réservation (D-21) ; un
  abandon devra aussi annuler le paiement préparé chez Stripe.
- **Lot 4** : libellé de la taxe dans les PDF (`taux_taxe_sejour` est vide sur
  les réservations du tunnel).
- **Phase 4** : effacement des tentatives abandonnées (point 12 de
  `docs/06-avant-premier-client.md`).

---

## Phase 3 — entre les lots 2 et 3 : le site en deux langues (16 octobre 2026)

Demandé par le gérant : « fais en sorte que le choix des langues change
vraiment la langue ». La phase reste ouverte (lots 3 à 5).

### Ce qui a été décidé

Avec le gérant, le 16 octobre 2026 :
- l'**italien** est retiré du site : sélecteur, puis (le 18 octobre) les
  phrases qui disaient que les propriétaires parlent italien ;
- **tout le site en anglais sauf le juridique** (option B) : les pages
  juridiques affichent le texte français avec « Available in French only » ;
  contrat, factures, signature et suivi restent en français ;
- **une adresse par langue** (option A) : `/en/…`, le français sans préfixe.

Par la session : **D-22** (anglais britannique ; mots français gardés dans les
adresses ; textes côte à côte dans le code ; le site ne bascule jamais seul ;
changer de langue dans le tunnel lève d'abord le blocage des dates).

### Ce qui a été fait

- **Aiguillage** : `middleware.ts` ; toutes les pages déplacées sous
  `app/[lang]/` (adresses françaises inchangées) ; `/fr/…` redirigé en 301 ;
  toute autre adresse donne la page introuvable dans sa langue.
- **`lib/i18n/`** : langues, liens dans la bonne langue, balises hreflang.
- **Sélecteur FR / EN** (`components/layout/ChoixLangue.tsx`) : de vrais liens
  vers la même page dans l'autre langue, paramètres et ancre conservés ; dans
  l'en-tête du site, le menu du téléphone et l'en-tête du tunnel.
- **Textes** : chaque page, l'en-tête, le pied de page, la bannière cookies, les
  données des gîtes, des récits et des activités, en français et en anglais.
- **Affichage** (`lib/format.ts`) : montants « €1,234.56 », dates « 12 January
  2027 », heures « 18:00 ». Aucun calcul ne connaît la langue.
- **Messages** : refus du devis (`lib/devis.ts`), erreurs de coordonnées
  (`lib/coordonnees.ts`) et réponses de `POST /api/reservations` dans la langue
  du client ; le journal du serveur reste en français.
- **Tunnel** : l'adresse de la page suit les dates, les voyageurs et l'étape
  atteinte ; changer de langue lève le blocage puis rouvre le tunnel à la
  saisie des coordonnées.
- **Contrôles** : 11 cas de plus dans `verify:tarification` (148), dont « devis
  identique en anglais et en français ».

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent. Le build ne
  pré-génère aucune page lue en base (`prerender-manifest.json` : `/_not-found`
  seulement).
- **Sur la base PostgreSQL 16 jetable** du poste (tunnel SSH fermé) :
  `bash scripts/parcours/lancer.sh` **10 étapes sur 10** — conversion OK ;
  prix, taxe et devis 148 cas ; remise à zéro ; blocage et tunnel 39 cas ;
  parcours L'Armu et LaPhine 0 échec (signature comprise, par l'aiguillage) ;
  URL signées 0 échec ; contrôles en base 81, 0 échec ; contrôles PDF OK ;
  `db:verify` 115, 0 échec.
- **51 contrôles d'adresses** par le serveur : 17 pages en 200 dans les deux
  langues, 7 adresses en 404 (dont `/en/signer/…`, `/en/suivi/…`, `/de/gites`),
  redirections `/fr/…` et `/gites/larmu`, attribut `lang`, hreflang, contenu
  anglais, mention « Available in French only », tunnel non indexé.
- **Dans un navigateur sans fenêtre**, à 1 280 px et à 390 px : tunnel anglais
  jusqu'à l'écran de paiement (7 nuits bloquées), clic sur « FR » → 0 nuit
  bloquée, tentative supprimée, tunnel français à la saisie des coordonnées avec
  les mêmes dates et les mêmes montants (554,78 €) ; fiche française → « EN »
  avec l'ancre conservée ; aucun débordement en largeur.

### Ce qui n'a PAS été vérifié

- La **relecture de l'anglais** par les propriétaires et l'avis du juriste
  (point 13 de `docs/06-avant-premier-client.md`).
- `gites_test` et la base réelle (tunnel fermé, comme au lot 2).
- Les balises hreflang en adresses absolues : `NEXT_PUBLIC_SITE_URL` n'est pas
  réglée sur ce poste.

### Écarts avec le plan annoncé

- **Textes rangés à côté de ce qui les affiche** (français et anglais côte à
  côte, `Bilingue<T>`) au lieu de deux fichiers `lib/i18n/fr.ts` et `en.ts` :
  une phrase et sa traduction se relisent et se modifient ensemble. La garantie
  annoncée tient : une traduction manquante empêche la compilation.
- **Fichiers en plus** : `lib/i18n/metadonnees.ts` (hreflang),
  `components/layout/ChoixLangue.tsx` (le sélecteur partagé).
- **Le tunnel recopie dates et voyageurs dans son adresse** (rechargement,
  changement de langue) ; jamais les coordonnées.
- **Corrigé en cours de route** : la page « Quel gîte ? » plantait (l'en-tête
  du tunnel passait un gestionnaire de clic depuis un composant serveur), vu
  par les contrôles d'adresses, le build ne rendant pas cette page ; la mise à
  jour de l'adresse du tunnel était ignorée par le routeur de Next.js tant que
  l'état passé n'était pas `null`.

### Points reportés

- **Lot 3** : chaque écran ajouté s'écrit dans les deux langues ; le retour de
  paiement par redirection devra reprendre la tentative en cours.
- **Lot 4** : enregistrer la langue du client sur la réservation, pour que
  ses courriels partent dans sa langue (accord du gérant le 18 octobre 2026).
- **Phase 6** : relecture et juridique (point 13).

---

## Phase 3 — lot 3 : le paiement, Stripe en mode test (20 octobre 2026)

La phase reste ouverte (lots 4 et 5).

### Ce qui a été décidé

Avec le gérant, le 20 octobre 2026 (D-23) :
- le client paie **sur le site**, dans le champ de carte de Stripe intégré à
  l'étape 4, pas sur une page Stripe ;
- le **texte d'accord pour la carte en anglais** : traduction fidèle du texte
  français du 14 octobre, validée telle quelle ;
- l'**écran après paiement** ne montre que des faits ; « Souvent ça passe au
  second essai » est retiré de l'écran de refus.

Puis le 22 octobre 2026, au premier affichage avec les clés de test : le champ
de Stripe ne montre que la carte, sans Link ni la phrase d'autorisation de
Stripe (doublon du texte d'accord).

Par la session (D-23) : le serveur ne croit que Stripe, par deux chemins
(retour du client, avis de Stripe) et un constat idempotent ; taux d'acompte et
délai du solde recopiés sur chaque réservation, sans valeur par défaut ; texte
d'accord en table versionnée et immuable ; clé réelle refusée tant que le site
n'est pas mis en ligne ; colonne de la langue du client créée dès ce lot
plutôt qu'au lot 4 (une migration de moins).

### Ce qui a été fait

- **Migration 0005** : réglages du paiement (acompte 30 %, solde 30 jours,
  virement de caution 3 jours avant l'arrivée) ; sur `reservations`, les
  conditions figées, les choix du client, la langue, les identifiants Stripe
  et le texte d'accord ; `paiements` dans sa forme définitive ; table
  `textes_accord` avec ses deux premières versions (français, anglais).
- **`lib/reglement.ts`** : choix de la caution et du solde (rien de pré-choisi,
  prélèvement seulement avec une caution par carte, pas de solde en paiement
  intégral), texte d'accord avec ses repères remplacés.
- **`lib/stripe.ts`** : le prestataire derrière une interface (Stripe, ou un
  simulé pour les contrôles) ; refus des clés réelles.
- **`lib/paiement.ts`** : ouverture du paiement, annulation au retour en
  arrière, constat (nuits vendues, ou remboursement intégral), page de retour
  protégée par le secret du paiement.
- **`lib/disponibilites.ts`** : `vendreNuits`, la vente des nuits en une
  requête, même après la fin du blocage si personne ne les a reprises.
- **Tunnel** : étape 3 « Récapitulatif et règlement » avec les choix ; étape 4
  avec le champ de Stripe et le texte d'accord ; écran de refus corrigé
  (« vos dates restent bloquées ») ; le tunnel ne s'ouvre pas sans clés de
  test ni texte d'accord. Nouvelle page `/reserver/confirmation` et route
  `/api/stripe/webhook`.
- **Fiche gîte** : acompte et délai du solde lus dans les réglages.
- **Paquets** : `stripe` 22.6.2, `@stripe/stripe-js` 9.17.0,
  `@stripe/react-stripe-js` 6.12.0, versions exactes. Les dernières versions
  majeures (23, 10, 7) avaient moins de trois semaines, et `stripe` 23 retire
  le paramètre « cartes seulement » de la création d'un paiement.
- **Contrôles** : `verify:tarification` 165 cas (17 de plus : réglages,
  règlement, texte d'accord comparé mot pour mot à la migration) ; nouveau
  `verify:paiement` (40 cas avec un Stripe simulé, et une partie `--http` par
  Stripe en mode test) ; `verify:blocage` contrôle les conditions figées et le
  texte d'accord ; `db:verify` 130 contrôles (contraintes du paiement,
  immutabilité du texte d'accord) ; `lancer.sh` passe à onze étapes.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent ; le build ne
  pré-génère que `/_not-found`.
- **Sur la base PostgreSQL 16 jetable** du poste (tunnel SSH toujours fermé),
  migration 0005 appliquée sur des réservations existantes (30 % et 30 jours
  reçus) ; `bash scripts/parcours/lancer.sh` : **neuf étapes sur onze**.
  Conversion OK ; prix, taxe et devis 165 cas ; remise à zéro ; parcours
  L'Armu et LaPhine 0 échec ; URL signées 0 échec ; contrôles en base 81,
  0 échec (**aucun montant n'a bougé**) ; contrôles PDF OK ; `db:verify` 130,
  0 échec. Les deux étapes restantes échouent **comme prévu**, en le disant :
  « clés Stripe de TEST absentes de .env.local » (blocage : 31 cas sur 32 ;
  paiement : 40 cas sur 41, toute la partie simulée passe).
- **Dans un navigateur sans fenêtre**, serveur lancé avec des clés factices,
  en français à 1 280 px et en anglais à 390 px : rien de coché à l'étape 3,
  bouton inactif jusqu'au choix complet, prélèvement retiré et grisé quand la
  caution passe au virement, récapitulatif suivant le choix ; « Procéder au
  paiement » → « Le paiement en ligne est momentanément indisponible : vos
  dates n'ont pas été retenues », 0 nuit bloquée, 0 tentative restante ;
  aucun débordement en largeur.
- **Le 22 octobre 2026, clés de test dans `.env.local`** :
  `bash scripts/parcours/lancer.sh` : **onze étapes sur onze**. Blocage 42 cas,
  paiement 54 cas, dont, par Stripe en mode test : paiement ouvert au montant
  du devis du serveur, carte de test acceptée → page « Paiement reçu » et
  réservation confirmée avec sa carte ; carte refusée → dates libérées et
  paiement annulé chez Stripe ; retour avec un faux secret → 404.
- **Dans un navigateur sans fenêtre, avec les clés de test**, en français à
  1 280 px et en anglais à 390 px : le champ de Stripe s'affiche à l'étape 4
  (carte, date, code, pays), sans Link ni phrase de Stripe, avec le texte
  d'accord en dessous ; « Payer 200,60 € » inactif tant que les CGV ne sont
  pas acceptées ; aucun débordement en largeur.

### Ce qui n'a PAS été vérifié

- **La saisie d'une carte de test dans le champ, à l'écran**, et la
  **validation 3-D Secure** : le champ de Stripe est hors d'atteinte du
  navigateur piloté ; le paiement accepté et refusé est vérifié par le
  serveur (`verify:paiement --http`).
- **L'avis signé de Stripe** : `STRIPE_WEBHOOK_SECRET` n'est pas dans
  `.env.local` ; seul le refus sans secret (503) est vérifié.
- `gites_test` et la base réelle : migrations 0002 à 0005 non appliquées.

### Écarts avec le plan annoncé

- **`lib/reglement.ts`** et **`lib/disponibilites.ts`** (`vendreNuits`) en
  plus de la liste : le premier sert au navigateur et au serveur, le second
  garde dans le même fichier les deux requêtes qui écrivent le calendrier.
- **La langue du client** est enregistrée dès ce lot (prévue au lot 4).
- **Tunnel fermé sans clés de test**, plutôt qu'un échec à l'étape 4 : le
  client ne saisit pas tout pour rien. Conséquence : sur ce poste, le tunnel
  affiche « momentanément indisponible » tant que les clés n'y sont pas.
- **Page de retour, paiement non abouti** : la tentative est abandonnée tout
  de suite (dates libérées), sinon le client qui reprend sa réservation
  butait sur son propre blocage.
- **Corrigé en cours de route** : après la migration, le serveur de
  développement relancé à chaud échouait sur toute lecture de la base ; un
  redémarrage complet a suffi (aucun changement de code).

### Points reportés

- **Lot 4** : courriels (confirmation, paiement remboursé, alerte aux
  propriétaires) dans la langue du client ; documents d'un paiement intégral ;
  phrase sur le contrat à signer sur la page de confirmation.
- **Au déploiement** : Stripe réel et avis de paiement (point 14 de
  `docs/06-avant-premier-client.md`).
- **Juriste** : texte d'accord français et anglais (point 3).

---

## Phase 3 — lot 4, étape 1 : des documents justes (23 octobre 2026)

Le lot 4 est découpé en trois étapes (choix du gérant) : 1. des documents
justes ; 2. après le paiement (contrat, Brevo, courriels) ; 3. la page de
suivi. La phase reste ouverte.

### Ce qui a été décidé

Avec le gérant, le 23 octobre 2026 :
- ligne de la taxe des PDF : « Taxe de séjour — 2 adultes × 7 nuits (mineurs
  exonérés) » ;
- fiche gîte : taux et plafond tout compris, « 5,5 % … au plus 4,84 € par
  adulte et par nuit ; mineurs exonérés ». Le gérant a confirmé que ses
  5,5 % sont bien 5 % plus les 10 % du département, déjà appliqués ;
- paiement intégral : pas de contrat automatique ; clauses rédigées au lot 5.

Par la session : une réservation calculée à l'ancienne garde « Taxe de séjour
(5,5 %) » ; refus (409) des routes de contrat et de facture pour un paiement
intégral ; sommaire du contrat rendu insécable (voir les écarts).

### Ce qui a été fait

- **`lib/montants.ts`** : `libelleTaxeSejour` ; paiement intégral → acompte =
  total, solde = 0 ; instantané des factures en version 3 (`libelleTaxeSejour`
  remplace `tauxTaxeSejour`).
- **PDF** (contrat, deux endroits ; factures d'acompte et de solde) : la ligne
  de la taxe vient de `libelleTaxeSejour`. Rien d'autre ne change dans le
  texte.
- **`lib/format.ts`** : `fmtTaxeSejour` en taux et plafond tout compris, en
  français et en anglais, calculés depuis les réglages.
- **`POST /api/contrats`, `POST /api/factures`** : 409 pour un paiement
  intégral, avec la raison.
- **Contrôles** : `verify:tarification` 174 cas (9 de plus : phrases de la
  fiche, ligne des PDF, montants d'un paiement intégral) ; le contrôle des
  instantanés du parcours attend la version 3.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent ; le build ne
  pré-génère que `/_not-found`.
- `bash scripts/parcours/lancer.sh`, base PostgreSQL 16 jetable, clés Stripe
  de test : **onze étapes sur onze**, aucun montant de référence n'a bougé ;
  les deux réservations de référence gardent « Taxe de séjour (5,5 %) ».
- **Sur la base jetable**, une réservation du tunnel simulée (copie d'une
  réservation de référence, taux vidé) : contrat et facture d'acompte émis,
  ligne « Taxe de séjour — 2 adultes × 7 nuits (mineurs exonérés) » lue dans
  les deux PDF et regardée à l'image ; la même en paiement intégral : contrat
  409, facture 409, aucun numéro consommé.
- Fiches gîte servies par le serveur : la nouvelle phrase, en français et en
  anglais.

### Ce qui n'a PAS été vérifié

- Une vraie réservation du tunnel menée jusqu'au contrat : le contrat n'est
  pas encore créé après le paiement (étape 2).

### Écarts avec le plan annoncé

- **Sommaire du contrat** (`ContratPDF.tsx`), hors liste : il ne tient pas en
  bas de la page 1 et passait déjà coupé (deux lignes en page 1, la suite en
  page 2). La ligne de la taxe, sur deux lignes dans le récapitulatif de la
  page 1, y laissait le titre seul. Il est rendu insécable et part entier en
  page 2 ; le contrat garde ses dix pages.
- **`scripts/parcours/controler.ts`**, hors liste : attend la version 3 de
  l'instantané.

### Points reportés

- **Lot 5** : clauses du paiement intégral (5.1, 5.2, 5.3, 7.2) et article
  4.4, avec le reste du contrat ; relecture par le juriste (point 3).
- **Phase 4** : la facture d'un paiement intégral (question au comptable).

---

## Avant le premier client réel

Cette liste a **déménagé** dans `docs/06-avant-premier-client.md`, son seul
domicile. Elle y est tenue à jour, avec pour chaque point la raison, l'action
attendue, la phase concernée et **qui peut le lever** (voir
`docs/05-protocole-phase.md`, règle 1 : un fait, un seul domicile).
