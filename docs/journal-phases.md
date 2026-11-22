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

## Phase 3 — lot 4, étape 2 : après le paiement, contrat et courriels (27 octobre 2026)

La phase reste ouverte (étape 3 du lot 4 : page de suivi ; lot 5).

### Ce qui a été décidé

Avec le gérant, du 24 au 27 octobre 2026 (D-24) :
- **adresses** : reservation@gitesdesamoyas.fr envoie les courriels
  automatiques et ne reçoit rien ; contact@gitesdesamoyas.fr est la boîte des
  propriétaires, et « Répondre » y écrit ;
- **confirmation au client** : les faits, comme l'écran de confirmation, avec
  le lien de signature ; un paragraphe d'accueil des propriétaires pourra
  s'ajouter ;
- **alertes** (réservation, signature, problème) : toutes vers contact@ ;
  l'objet d'un problème commence par « À TRAITER — » ;
- **contrat** créé tout de suite après le paiement.

Fait par le gérant, guidé pas à pas : boîte contact@ créée chez OVH et
installée sur son téléphone ; domaine authentifié chez Brevo (connexion
directe à OVH) ; expéditeur reservation@ déclaré ; clé API Brevo dans
`.env.local`. Vérifié dans l'annuaire public du domaine : code Brevo, deux
signatures DKIM, règle DMARC, une seule ligne SPF (celle d'OVH, intacte).
La clé ne permet que l'envoi (lecture du compte refusée) : contrôlé sans la
lire ni l'afficher.

Par la session : journal des courriels inscrit dans la transaction de
l'événement, envoi après la réponse, nouveaux essais espacés puis alerte ;
jamais d'envoi vers une adresse réservée aux essais ; alertes de la base de
test vers `proprietaires@example.invalid`.

### Ce qui a été fait

- **Migration 0006** : table `courriels` (journal, clé unique), table
  `alertes` (trois alertes vers contact@), adresses dans `reglages`.
- **`lib/messagerie.ts`** : envoi par Brevo, ou dans un fichier (sans clé, ou
  adresse de test).
- **`lib/courriels.ts`** (inscription), **`lib/courriels-envoi.ts`** (envoi,
  nouveaux essais, contrat créé juste avant la confirmation),
  **`lib/courriels-textes.ts`** (textes français et anglais, alertes en
  français).
- **`lib/recapitulatif.ts`** : les lignes de faits, communes à l'écran et au
  courriel de confirmation (sorties de la page).
- **`lib/contrat.ts`** : l'émission du contrat, sortie de `POST /api/contrats`
  sans changement de comportement.
- **Branchements** : le paiement inscrit la confirmation et l'alerte, un
  remboursement le courriel au client et l'alerte « À TRAITER » (fin du simple
  « PROBLÈME À TRAITER » dans le journal du serveur) ; la signature inscrit son
  alerte dans sa transaction ; page de retour, avis de Stripe, signature et
  tunnel envoient après la réponse. Page de retour : « Votre contrat à signer
  vous est envoyé par courriel, à … ».
- **Contrôles** : nouveau `verify:courriels` (40 cas) ; `verify:paiement`
  vérifie que le serveur crée le vrai contrat et « envoie » la confirmation
  (58 cas) ; `db:verify` 142 contrôles ; `lancer.sh` passe à treize étapes
  (étape courriels, et une seconde remise à zéro avant les parcours).

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent ; le build ne
  pré-génère que `/_not-found`.
- Base PostgreSQL 16 jetable, migration 0006 appliquée ;
  `bash scripts/parcours/lancer.sh` avec les clés Stripe et Brevo : **treize
  étapes sur treize**, aucun montant de référence n'a bougé.
- Par Stripe en mode test : paiement, page de retour, puis le serveur crée le
  contrat (numéro légal, vrai PDF) et écrit la confirmation et l'alerte dans
  des fichiers ; la confirmation contient le lien de signature de ce contrat.
- Aucun courriel parti chez Brevo pendant les contrôles : les quatre écrits
  par le serveur l'ont été dans des fichiers. La confirmation, ouverte dans un
  navigateur, est conforme au modèle validé.
- Le contrôle des courriels, lancé trois fois de suite : 40 cas sur 40.

### Ce qui n'a PAS été vérifié

- **Un vrai envoi par Brevo** vers une vraie boîte : il attend l'accord du
  gérant (une réservation de test avec son adresse).
- Le courriel « contrat à signer » de rattrapage et l'alerte « courriel non
  parti » ne sont vérifiés qu'avec l'envoi et le contrat simulés.

### Écarts avec le plan annoncé

- **`lib/recapitulatif.ts`** et **`lib/courriels-envoi.ts`**, hors liste : le
  premier évite deux copies des lignes de faits, le second sépare l'envoi de
  l'inscription (lib/paiement.ts n'importe que l'inscription, sans le moteur
  PDF ni le tunnel).
- **`courriels-textes.ts`** porte ses textes ; la page de retour garde les
  siens pour les autres écrans.
- **Corrigé en cours de route** : l'échéance d'un nouvel essai était comparée
  à l'heure de Node (à la milliseconde) alors que la base la date à la
  microseconde : un courriel dû pouvait attendre le passage suivant. La
  comparaison se fait maintenant dans la base.
- **`db/verify.ts`** : le contrôle « seconde ligne de réglages refusée »
  fournit les nouvelles adresses obligatoires, pour que le refus vienne bien
  de la règle « une seule ligne ».

### Points reportés

- **Étape 3** : page de suivi par lien secret.
- **Phase 4** : minuterie des envois en retard (aujourd'hui, à la prochaine
  activité du site), relance d'un contrat non signé.
- **Lot 5** : contact@ au lieu de l'adresse wanadoo sur le contrat, les
  factures et l'article sur les données personnelles ?
- **Au déploiement** : point 15 de `docs/06-avant-premier-client.md`.

---

## Phase 3 — lot 4, étape 3 : page « Ma réservation » (28 octobre 2026)

L'étape 2 est enregistrée le même jour (commits `4987a22` et `58f5203`). Le
lot 4 est clos ; la phase reste ouverte (lot 5).

### Ce qui a été décidé

Avec le gérant, le 28 octobre 2026 (D-25) :
- **contenu** : les faits, comme la confirmation, et l'état du contrat (à
  signer avec son bouton, ou signé avec le PDF) ; les trois actions de la
  maquette qui n'existent pas sont retirées ;
- **lien** valable jusqu'à **30 jours après le départ** (réglage) ;
- **lien perdu** : formulaire avec l'adresse seule, même réponse dans tous les
  cas, **3 demandes par heure** et par adresse (réglage) ; proposé seulement
  sur la page d'un lien expiré ;
- **second bouton** « Voir ma réservation » dans la confirmation ;
- **adresse et heures** affichées dès le paiement ;
- **réservation remboursée** : « n'a pas pu être confirmée » ;
- la page dans la langue du client.

### Ce qui a été fait

- **Migration 0007** : `reservations.jeton_suivi` (64 caractères tirés par la
  base, unique ; les réservations existantes en reçoivent un), trois réglages
  (`suivi_validite_jours`, `suivi_demandes_max`, `suivi_demandes_minutes`),
  courriel `lien_suivi`.
- **`lib/suivi.ts`** : ce que montre la page (fermée, ouverte, remboursée),
  validité, demande de lien avec la limite (verrou par adresse).
- **Pages** : `app/[lang]/suivi/[jeton]` (français et anglais) et
  `app/[lang]/suivi` (formulaire seul) ; route `POST /api/suivi/lien`.
  L'ancienne maquette (`suivi/[ref]`, faux code de boîte à clés, horaires
  16 h–19 h, solde « prélevé automatiquement ») est supprimée.
- **Courriels** : second bouton dans la confirmation ; courriel « Votre lien
  de réservation » ; s'il ne part pas, l'alerte « courriel non parti ».
- **`cheminContratSigne`** (`lib/storage.ts`) : le chemin du contrat signé,
  écrit par la signature et lu par la page, en un seul endroit.
- **Contrôles** : nouveau `verify:suivi` (22 cas) ; `verify:courriels`
  41 cas (lien de la confirmation, anglais) ; `verify:paiement` 63 cas (la
  vraie page par le serveur, lien inconnu, formulaire) ; `db:verify`
  148 contrôles (section 6f) ; `lancer.sh` passe à quatorze étapes.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent ; la page
  « Ma réservation » est rendue à chaque demande (jamais pré-générée).
- Base PostgreSQL 16 jetable, migration 0007 appliquée : deux réservations
  existantes, deux jetons distincts.
- `bash scripts/parcours/lancer.sh` : **quatorze étapes sur quatorze**, aucun
  montant de référence n'a bougé.
- Par Stripe en mode test : la confirmation porte le lien ; la page s'ouvre
  avec la référence, le contrat à signer et son lien, en français et en
  anglais ; sans indexation ni transmission de l'adresse.
- Capture d'écran d'une page au contrat signé (paiement ajouté le temps de la
  capture sur la base d'essai, puis retiré) et d'un lien inconnu en anglais.
- Aucun courriel parti chez Brevo : adresses réservées aux essais, écrites
  dans des fichiers.

### Ce qui n'a PAS été vérifié

- **Le rendu sur un vrai téléphone** : le navigateur des captures ne descend
  pas sous ~500 pixels de large (la page Contact y est coupée de la même
  façon). La colonne est protégée contre le débordement.
- **Le téléchargement du contrat signé depuis la page** n'est vérifié que par
  la capture (bouton présent) : l'accès aux PDF par URL signée l'est par le
  parcours.

### Écarts avec le plan annoncé

- **Un courriel par réservation** (et non un seul listant tout) : chacun dans
  la langue de sa réservation, comme annoncé.
- **`lib/storage.ts`** et **`app/api/contrats/signer/route.ts`**, hors liste :
  le chemin du contrat signé n'existe plus qu'à un endroit.

### Points reportés

- **Lot 5** : contrat du paiement intégral, article 4.4, contact@ sur les
  documents, liste des phrases du prototype.
- **Phase 4** : minuterie des envois, relance d'un contrat non signé ; sur la
  page, le solde et la caution restent des faits sans action.
- **Point 12** : durée de conservation des demandes de lien (journal des
  courriels).

---

## Phase 3 — lot 5 : contrat v3 et pages (29 octobre 2026)

Le contrat suit enfin ce que le site vend : trois moyens de caution, le séjour
payé en une fois, la règle d'annulation du gérant. Décision D-26.

### Ce qui a été décidé

Choix du gérant (28 et 29 octobre 2026) :
- **Article 6** : rédigé par la session sur les décisions déjà prises (D-16,
  D-19), validé par le gérant, à faire relire au juriste.
- **Annulation** : tout est remboursé jusqu'à la date limite du solde ;
  ensuite l'acompte est conservé et le solde remboursé jusqu'à 48 heures
  avant l'arrivée (délai à confirmer, le gérant ne décidant pas seul :
  point 16) ; la date limite de l'acompte est celle du solde ; même règle pour
  un séjour payé en une fois ; la taxe de séjour, qui s'ajoute au prix et se
  paie avec lui, est toujours remboursée.
- **Caution par chèque** : en cas de dégât, le chèque est encaissé et la
  différence rendue au client (confirmé par le gérant).
- **contact@** des réglages à la place de l'adresse wanadoo sur le contrat.
- **CGV** : erreurs de fait corrigées maintenant, le reste en Phase 6.
- **Phrases du prototype** : « sous 24 heures » retirée ; note des avis, titre
  « Avis vérifiés » et case de l'avis Gîtes de France gardés ; la note devient
  un réglage.
- **Paiement intégral au choix du client** : accepté, dans une étape à part.

### Ce qui a été fait

- **Migration 0008** : `reglages.delai_remboursement_solde_heures` (48) et la
  note des avis (497, 46, 100) ; `reservations.delai_remboursement_solde_heures`
  et `delai_virement_caution_jours`, recopiés par le tunnel, sans valeur par
  défaut (48 et 3 pour les réservations existantes).
- **Contrat v3** (`components/pdf/ContratPDF.tsx`, `lib/contrat.ts`) :
  art. 4.4 (Annonay Rhône Agglo), art. 5 en deux variantes, art. 6 (trois
  moyens, 6.6 client arrivé sans caution), art. 7.2 (dates et somme conservée
  imprimées), 7.5 et 10.4 ; « à la réservation » au lieu de « à la signature »
  pour l'acompte ; contact@ en en-tête, 14.1 et 15.1.
- **Calcul** : `retenueAnnulation` (`lib/montants.ts`) et `fmtAvantArriveeFr`
  (`lib/format.ts`) ; le « 7 jours » écrit en dur disparaît de
  `lib/constantes.ts`.
- **Séjour payé en une fois** : contrat émis et envoyé comme les autres ;
  l'alerte « contrat à envoyer à la main » et la phrase « votre contrat vous
  sera envoyé » disparaissent. Les factures restent refusées (comptable).
- **Pages** : CGV § 02 à 04 ; caution en trois moyens sur la fiche gîte ;
  « sous 24 heures » retirée de la page Contact ; note des avis lue en base
  (`lib/gites-publics.ts`), masquée si vide.
- **Contrôles** : `verify:tarification` 181 cas ; `verify:courriels` (cas du
  paiement intégral réécrit) ; `db:verify` 154 contrôles (section 6g) ;
  contrôle des PDF : contact@, Annonay Rhône Agglo, trois moyens, somme
  conservée, 11 pages.
- **Documentation** : D-26 (et D-20 complétée), `docs/contrat-template.md`,
  points 3, 10 et 16 de `docs/06-avant-premier-client.md`, fiche de la
  phase 3, conformité, architecture, `db/README.md`.

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- Base PostgreSQL 16 jetable, migration 0008 appliquée : les deux réservations
  existantes ont reçu 48 et 3, les colonnes n'ont plus de valeur par défaut.
- `bash scripts/parcours/lancer.sh` : **quatorze étapes sur quatorze**, aucun
  montant de référence n'a bougé. Le contrat passe de 10 à 11 pages : la liste
  des annexes tient seule sur la dernière page.
- Un contrat d'essai pour un séjour payé en une fois, caution par chèque
  (émis par le serveur sur la base d'essai, puis supprimé) : « Paiement
  intégral 715,40 € à la réservation », « Il n'y a pas de solde », « Sans
  objet » au 5.3, caution « (chèque) », 210,00 € conservés jusqu'au
  19 novembre 2026 à 18 h 00.
- Sur le serveur d'essai : la note des avis lue en base sur l'accueil (français
  et anglais), les nouvelles CGV et la page Contact sans « 24 heures »
  (français).

### Ce qui n'a PAS été vérifié

- **La relecture juridique** des articles 4.4, 5, 6, 7.2 et 7.5 : questions au
  point 3 de `docs/06-avant-premier-client.md`.
- **Le rattachement de Savas** à Annonay Rhône Agglo pour la taxe de séjour :
  aucune page trouvée ne cite la commune (point 10).

### Écarts avec le plan annoncé

- **`app/api/factures/route.ts`** n'a pas été modifié : le refus d'une
  facture pour un séjour payé en une fois attend le comptable (D-20).
- **Hors liste** : `app/api/contrats/signer/route.ts` (adresse de contact du
  PDF signé), `lib/courriels.ts` et `lib/courriels-textes.ts` (alerte « à la
  main » retirée), `lib/devis.ts`, `scripts/parcours/reinitialiser.ts`,
  `scripts/verifier-blocage.ts` (deux délais obligatoires) ; article 10.4 du
  contrat (renvoi aux nouveaux 6.3 et 6.4).
- **CGV** : les dates, délais et taux renvoient au contrat au lieu d'être
  recopiés, pour qu'un réglage changé ne les rende pas faux.

### Points reportés

- **Étape suivante** : paiement intégral au choix du client.
- **Point 16** : confirmer les 48 heures.
- **Phase 6** : identité de l'éditeur et médiateur des CGV (DO-01, DO-02),
  politique de confidentialité (adresse contact@gites-samoyas.fr, durée de
  conservation).
- **Notes des fiches gîtes** (5,0/5 et 16 avis, etc., `lib/data/gites.ts`) :
  encore écrites en dur.
- **Le PDF signé est re-rendu à la signature** avec le code du moment : un
  contrat émis en v2 et signé après le déploiement de la v3 sortirait signé
  avec le texte v3, alors que l'empreinte est celle du PDF v2. Sans effet
  tant qu'aucun client réel n'a de contrat en cours ; à traiter avant tout
  changement de texte en production.

---

## Phase 3 — tout régler maintenant, au choix du client (30 octobre 2026)

Le client qui réserve avant la date limite du solde peut tout payer à la
réservation. Décision D-27, contrat v4.

### Ce qui a été décidé

Choix du gérant : troisième possibilité dans le bloc « Le solde » (« Tout
régler maintenant — Vous payez … aujourd'hui, il n'y a plus de solde. ») ;
aucune réduction ; l'annulation suit la règle habituelle (D-26).

### Ce qui a été fait

- **`lib/reglement.ts`** : le mode « integral », contrôlé par le serveur,
  jamais écrit en base (`mode_solde` vide, `paiement_integral` vrai).
- **`lib/devis.ts`, `lib/tunnel.ts`** : `devisToutRegler`, le total à payer
  et plus de date du solde ; ignoré quand l'arrivée est trop proche (D-20).
- **Tunnel** (`ReserverFunnel.tsx`) : la troisième case, le montant à payer et
  le récapitulatif latéral, en français et en anglais.
- **Contrat v4** : article 5.1 « Le Locataire a choisi de régler le prix total
  du séjour en une fois, lors de la réservation. » ; l'article 7.2 garde son
  premier cas. Choisi ou imposé se déduit des dates (`integralChoisi`).
- **Contrôles** : `verify:tarification` 187 cas ; `verify:paiement` (réservation
  40 jours avant, paiement « total », aucun solde en base, aucune carte).

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `bash scripts/parcours/lancer.sh` : **quatorze étapes sur quatorze**, aucun
  montant de référence n'a bougé.
- Contrat d'essai émis par le serveur (arrivée le 20 mars 2027, réservé le
  30 octobre 2026, puis supprimé) : « Le Locataire a choisi… », « Jusqu'au
  18 février 2027 inclus : remboursement intégral », « Après le 18 février
  2027 et jusqu'au 18 mars 2027 à 18 h 00 : … 210,00 € ».

### Ce qui n'a PAS été vérifié

- **L'écran du tunnel** avec la troisième case : aucun outil de navigateur
  automatisé sur ce poste. Le code est contrôlé par les types et le build, la
  logique par les contrôles ; l'écran est à regarder à la main.

### Points reportés

- La phrase de l'article 5.1 rejoint la relecture du juriste (point 3).

---

## Phase 3 — clôture (1er novembre 2026)

La Phase 3 est close. Le site prend une réservation de bout en bout : prix et
taxe de séjour calculés, dates bloquées pendant le paiement, acompte ou total
payé par Stripe (mode test), contrat créé et envoyé, signé en ligne, page
« Ma réservation ». Détail des lots dans les entrées ci-dessus.

### Critères d'acceptation (`docs/phases/phase-3.md`)

1. **Une réservation complète à l'écran, avec une carte de test, jusqu'au
   contrat signé reçu par courriel** : faite par le gérant le 1er novembre
   2026 sur le serveur d'essai (base jetable). Réservation SAM-2026-DDCF9
   (arrivée le 27 novembre, donc paiement intégral imposé), caution par
   carte, contrat CTR-2026-003 en v4 **signé** le 1er novembre à 18 h 48
   (vérifié en base). Le courriel de confirmation est **réellement parti par
   Brevo** vers l'adresse du gérant : premier envoi réel, reçu.
2. **Deux tentatives simultanées** : la seconde est refusée, le blocage de la
   première se libère seul (`verify:blocage`, 42 cas).
3. **`bash scripts/parcours/lancer.sh`** : quatorze étapes sur quatorze, aucun
   montant de référence n'a bougé.

### Ce qui n'a PAS été vérifié à l'écran

- La case « Tout régler maintenant » (arrivée à plus de 30 jours) : vérifiée
  par les contrôles et un contrat d'essai, pas regardée à l'écran.
- La carte 3-D Secure (`4000 0027 6000 3184`) dans le tunnel.

### Ce qui reste ouvert, et où

- **Avant le premier client** : `docs/06-avant-premier-client.md` (relecture
  du juriste des articles 4.4, 5, 6, 7 ; 48 heures à confirmer ; taxe de
  séjour de Savas ; Stripe et Brevo sur le serveur déployé ; etc.).
- **Phase 4** : solde à J-30, caution la veille du départ, factures
  automatiques (le paiement intégral attend le comptable), relances, tâches
  planifiées.
- **Le PDF signé est re-rendu à la signature** avec le texte du moment
  (entrée du lot 5, points reportés) : à traiter avant tout changement de
  texte en production.
- **Base de test sur le serveur** (`gites_test`) : migrations 0002 à 0008 à
  appliquer quand le tunnel SSH sera ouvert ; les essais de cette phase ont
  tourné sur une base PostgreSQL jetable du poste.

---

## Phase 4 — lot 1 : le réveil, le solde, les factures (1er novembre 2026)

### Ce qui a été décidé

Cadrage de la Phase 4 le 1er novembre 2026 (fiche de phase) ; décisions D-28
(le solde) et D-29 (factures automatiques, facture unique d'un séjour payé en
une fois, réponse (a) à confirmer par le comptable). Textes des courriels, de
la page et de la facture unique validés par le gérant le même jour.

### Défauts trouvés dans le code avant d'écrire

- **Un paiement du solde aurait été remboursé** : le constat ne connaissait
  qu'un paiement par réservation, celui de la réservation, et remboursait tout
  paiement reçu pour une réservation déjà confirmée.
- **Stripe aurait refusé le second paiement** : la clé d'idempotence était la
  même pour tous les paiements d'une réservation.
- Trouvé en écrivant les contrôles : **la facture de solde aurait imprimé la
  référence de l'acompte** (celle de la réservation).

### Ce qui a été fait

- **Migration 0009** : délais des courriels du solde en réglages (7, 7, 1, 3
  jours) ; courriels `facture`, `solde_preavis`, `solde_lien`, `solde_rappel`,
  `solde_impaye` ; type de facture `total` ; une facture par type et par
  réservation (index unique).
- **`lib/solde.ts`, `lib/taches.ts`, `POST /api/taches`** : le réveil et ce que
  chaque passage fait du solde (préavis, prélèvement, lien, rappel, impayé,
  seconde alerte).
- **`lib/stripe.ts`** : le prélèvement hors session (`prelever`), une clé
  d'idempotence par sorte de paiement, le type inscrit sur le paiement.
- **`lib/paiement.ts`** : le constat du solde (`SOLDE_RECU`) ; remboursement
  d'un solde sans toucher à la réservation ni à la carte.
- **`lib/factures.ts`** : l'émission des factures, déplacée de la route ;
  `FactureTotalPDF.tsx` ; la date et la référence du paiement facturé.
- **Courriels** : la facture jointe en PDF (`lib/messagerie.ts`), les courriels
  du solde, les alertes « solde impayé », « prélèvement à vérifier », « facture
  non émise » ; en français et en anglais.
- **« Ma réservation »** : bloc « Votre solde », bouton « Payer le solde »
  (`PayerSolde.tsx`, `POST /api/suivi/solde`), retour après paiement revérifié
  chez Stripe.
- **Contrôles** : `verify:solde` (62 cas, nouveau) ; `verify:paiement --http`
  vérifie la vraie facture d'acompte émise par le serveur ; `verify:courriels`
  compte la facture ; `db:verify` 164 contrôles (section 6h).

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `bash scripts/parcours/lancer.sh` : **quinze étapes sur quinze**, aucun
  montant de référence n'a bougé.
- Essai par le serveur et Stripe en mode test (base jetable) : réservation
  avec solde par lien, page « Ma réservation » (« Solde de 388,35 €, à régler
  au plus tard le 3 décembre 2026 »), bouton, même paiement au second clic,
  carte de test, retour « Paiement du solde reçu », facture de solde émise et
  envoyée ; séjour payé en une fois, facture unique. Les trois PDF regardés.

### Ce qui n'a PAS été vérifié

- **L'écran** du bloc « Votre solde » et du champ de carte dans un navigateur
  (la page a été lue par le serveur, pas regardée).
- **Le prélèvement réel hors session chez Stripe** : la logique est contrôlée
  avec un prestataire simulé ; le vrai appel le sera en mode test au lot 2,
  avec la carte enregistrée de la caution.
- **La tâche programmée de Coolify** : elle se crée au déploiement (point 18
  de `docs/06-avant-premier-client.md`).

### Points reportés

- La facture unique attend la confirmation du comptable (point 17).
- Le site écrit « le 1 novembre » au lieu de « le 1er novembre » (format des
  dates, déjà le cas partout) : signalé au gérant.
- `lancer.sh` vide la base de test : la réservation d'essai SAM-2026-DDCF9 de
  la clôture de la Phase 3 n'y est plus (bilan déjà écrit).

---

## Phase 4 — lot 2 : la caution par carte (2 novembre 2026)

### Ce qui a été décidé

Cadrage du lot le 2 novembre 2026 (fiche de phase, réponses 1A, 2A, 3A, 4A,
et un court message de validation pour la question 5) ; décision D-30. Textes
des courriels et du bloc « Votre caution » présentés au gérant le même jour.

### Défauts trouvés dans le code avant d'écrire

- **Le contrat lisait la caution dans la fiche du gîte** au moment de sa
  création : changer la caution d'un gîte aurait pu faire bloquer un autre
  montant que celui du contrat signé.
- **`CAUTION_DEFAUT`** (500 €) sortait sans rien dire si le montant manquait.
- **Rien n'effaçait les cartes enregistrées**, ni pour les séjours finis ni
  pour les réservations annulées.
- Trouvé en écrivant : **une caution encaissée depuis le tableau de bord
  Stripe aurait été remboursée** par le constat (paiement reçu, réservation
  déjà confirmée) ; et une préautorisation (`requires_capture`) était lue
  comme « en attente ».

### Ce qui a été fait

- **Migration 0010** : `reservations.caution` (rempli pour les réservations
  existantes), `carte_caution_demandee_at` ; états et colonnes de la caution
  dans `paiements`, une caution par réservation ; heures en réglages ;
  alerte `caution` ; courriels `caution_bloquee`, `caution_a_valider`,
  `caution_liberee`, `caution_carte`, `alerte_caution`.
- **`lib/caution.ts`** : préautorisation la veille du départ, alerte la veille
  de la levée, levée au troisième jour, effacement des cartes ; validation par
  le client ; article 6.6 (`demanderCarteCaution`, enregistrement de carte).
- **`lib/stripe.ts`** : `bloquerCaution` (capture manuelle, hors session),
  levée par annulation, date limite lue sur la charge, enregistrement de carte
  (SetupIntent), avis `amount_capturable_updated`, `setup_intent.*`,
  `charge.dispute.created` ; une carte déjà détachée n'est pas une erreur.
- **`lib/paiement.ts`** : la caution passe par `constaterCaution`, jamais par
  le remboursement.
- **Montant figé** : tunnel, contrat (refusé sans montant), récapitulatif ;
  `CAUTION_DEFAUT` supprimé.
- **« Ma réservation »** : bloc « Votre caution », `ValiderCaution.tsx`,
  `POST /api/suivi/caution` ; le champ de carte accepte la préautorisation et
  l'enregistrement d'une carte.
- **Courriels** : quatre au client, en français et en anglais ; l'alerte
  « caution » (bloquée, levée demain, carte enregistrée) ; « À TRAITER » pour
  un refus, un montant absent, une préautorisation à vérifier, un paiement
  contesté.
- **Contrôles** : `verify:caution` (67 cas simulés, 15 avec Stripe en mode
  test, 4 par le serveur), nouvelle étape de `lancer.sh` ; `db:verify`
  179 contrôles (section 6i).

### Ce qui a été vérifié

- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `bash scripts/parcours/lancer.sh` : **seize étapes sur seize**, aucun montant
  de référence n'a bougé (la caution des deux contrats de référence vient
  désormais de la réservation : 400 € et 500 €, inchangés).
- **Stripe en mode test, trois cartes** : carte normale (préautorisation
  « à encaisser », rien de débité, date limite lue, levée, carte détachée) ;
  4000 0027 6000 3184 (refusée hors session, lien et alerte, validée par le
  client sur la même préautorisation, levée) ; carte refusée (code enregistré,
  close à la levée, carte détachée). C'est aussi le premier essai réel d'un
  appel hors session sur la carte enregistrée, laissé ouvert au lot 1.

### Ce qui n'a PAS été vérifié

- **L'écran** du bloc « Votre caution » et du champ de carte dans un navigateur,
  et la **fenêtre 3-D Secure** de la validation : le contrôle valide avec une
  autre carte, côté serveur.
- **Les avis de Stripe réels** pour la caution et les contestations : la
  route les lit, mais aucun avis signé n'a été reçu (point 14).
- **La tâche programmée de Coolify** (point 18).

### Points reportés

- **La retenue** (encaissement partiel, courriel avec justificatifs) : Phase 5.
  Une réservation dont la caution a été retenue reste « confirmée » ; la
  Phase 5 la fermera avec la retenue.
- Les jours (veille, 3, 7) sont des constantes liées au contrat ; les rendre
  réglables demanderait que le contrat les lise.

---

## Phase 4 — lot 3 : virement et chèque, tentatives abandonnées, base réelle (3 novembre 2026)

### Ce qui a été décidé

Cadrage du lot le 2 novembre 2026 (fiche de phase, douze questions sur
l'exemple de Camille : réponses 1A, 2A, 3A, 4C avec DMARC A, 5C, 6A, 7A,
8a A, 8b A, 8c A, 9 oui, 10 reportée, 11B, 12A) ; décision D-31. Textes des
courriels, des alertes, du bloc « Votre caution » et du tunnel présentés au
gérant le 3 novembre, validés avec la mise en garde contre les faux RIB.

### Défauts trouvés dans le code avant d'écrire

- **Un séjour au chèque ou au virement ne passait jamais « terminé »** : seule
  la levée d'une caution par carte fermait la réservation.
- **Le tunnel proposait le virement même quand sa date limite était déjà
  passée** (réservation à moins de 3 jours de l'arrivée).
- **Le retour en arrière laissait la fiche client chez Stripe** (nom et
  courriel) : seule la réservation était effacée.
- **La base réelle est à la migration 0001**, le code à 0010 : rien ne
  vérifiait qu'elle pouvait recevoir les migrations sans dégât (factures en
  double, cautions anciennes, compteurs).
- **La règle DMARC du domaine est « observer seulement »** : un faux courriel
  au nom du domaine, avec un autre IBAN, arriverait chez le client.
- `docs/06-avant-premier-client.md` annonçait seize points pour dix-huit, et
  `db/README.md` renvoyait encore la séparation des rôles à la Phase 3.
- Trouvé en écrivant : **une tentative payée trop tard puis remboursée** reste
  « en attente de paiement » pour toujours ; cinquante d'entre elles auraient
  occupé chaque passage de l'effacement. Elles sont écartées dès la recherche.

### Ce qui a été fait

- **Migration 0011** : compte du virement (`virement_titulaire`,
  `virement_iban`, `virement_bic`, vides), `virement_courriel_jours` (10),
  `abandon_conservation_jours` (vide), contraintes de forme ; courriel
  `caution_virement`.
- **`lib/iban.ts`** (contrôle mod 97, forme lisible) et **`lib/virement.ts`** :
  coordonnées sur « Ma réservation » du jour du courriel à la date limite ;
  courriel des coordonnées, alertes « à vérifier » et « à rendre », alerte « À
  TRAITER » sans compte valable ; revérification à l'envoi.
- **`lib/caution.ts`** : séjour sans caution par carte « terminé » au troisième
  jour après le départ.
- **Tunnel** : `virementPossible` dans le devis, choix grisé avec une phrase,
  refus côté serveur.
- **`lib/abandons.ts`** et **`abandonnerTentative`** : effacement après la durée
  réglée, fiche client Stripe supprimée (`oublierClient`, aussi au retour en
  arrière), trace `audit_logs` (premier usage de la table) ; 50 par passage.
- **Le réveil** (`lib/taches.ts`) : soldes, virements, cautions, abandons, dans
  cet ordre ; le bilan les nomme.
- **`npm run verify:production`** : la base réelle en lecture seule (migrations,
  vérifications préalables à 0009 et 0010, compteurs, contenu, réglages),
  essayé sur deux bases jetables arrêtées à 0001 et à 0008 : il a signalé un
  compteur de factures en avance (BLOQUANT) et une réservation ancienne qui
  recevrait la caution du gîte (A VOIR).
- **Contrôles** : `verify:virement` (47 cas), `verify:abandons` (22 cas),
  outils communs `scripts/simulations.ts` ; 5 cas de plus dans
  `verify:tarification` et 2 dans `verify:paiement` ; `db:verify` section 6j ;
  deux étapes de plus dans `lancer.sh`.

### Ce qui a été vérifié

Sur une base PostgreSQL jetable du poste (port 55433, `gites_essai`), jamais sur
la base réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 191 contrôles, 0 échec.
- `bash scripts/parcours/lancer.sh` : **dix-huit étapes sur dix-huit**, code de
  sortie 0 — centimes, tarification 192 cas, blocage 42, paiement 69 (Stripe en
  mode test compris), courriels 41, « Ma réservation » 22, solde 62, caution 86
  (trois cartes Stripe comprises), virement 47, abandons 22, parcours L'Armu et
  LaPhine 0 échec, URL signées 0 échec, contrôles en base 81/0, contrôles PDF
  112 OK, `db:verify` 191/0. Aucun montant de `reference.ts` n'a bougé.

### Ce qui n'a PAS été vérifié

- **Les écrans** (virement grisé dans le tunnel, coordonnées sur « Ma
  réservation ») dans un navigateur : leur contenu est contrôlé, pas leur
  mise en page.
- **`verify:production` sur la base réelle** : à lancer avec le gérant, tunnel
  ouvert par lui (11B).
- **Un vrai courriel du virement** reçu dans une boîte (Brevo, DMARC).
- **La tâche programmée de Coolify** (point 18).

### Points reportés

- **Appliquer les migrations 0002 à 0011** sur la base réelle puis sur
  `gites_test` du serveur : le gérant, après `verify:production`.
- **Saisir le compte du virement** dans `reglages` : le gérant, en attendant
  l'écran de gestion (Phase 5).
- **La durée de conservation** des tentatives : le juriste (point 12) ; la
  tentative remboursée et le journal des courriels restent hors de
  l'effacement, pour la même question.
- **Séparation des rôles PostgreSQL** : reportée à la fin des travaux (point 4).
- **DMARC en « quarantaine »** avant l'ouverture (point 15).
- L'enregistrement comptable d'une caution reçue par virement : question au
  comptable (D-19, point 17).

---

## Phase 5 — ouverture et lot 1 : la connexion et les réglages (3 et 4 novembre 2026)

### Ce qui a été décidé

Cadrage de la phase le 3 novembre 2026 : quinze questions sur l'exemple de
Camille, puis six de plus (statistiques, durées, alerte du compte, conditions
du contrat, texte d'accord, limites). Réponses consignées dans
`docs/phases/phase-5.md` (« Cadrage du 3 novembre 2026 ») ; décision D-32.
L'essentiel : un seul compte partagé, mot de passe plus un code sur un appareil
inconnu (30 jours glissants), journal gardé, rien n'est vendu en options, bons
cadeaux reportés, travaux gérés par le blocage des nuits, seed « création
seule », annulation et avoir dans un lot à part après le comptable, page de
statistiques à part. La phase compte six lots.

### Défauts trouvés dans le code avant d'écrire

- **Aucune authentification n'existait** : seul un secret service-à-service
  protégeait les routes d'émission.
- **Aucune annulation par les propriétaires** dans aucune phase, alors que les
  factures partent au paiement : rembourser un client laisse une facture sans
  avoir. Ajouté : point 19 de la liste, lot 5.
- **La fiche de phase était en partie dépassée** : le drapeau `actif` refuse
  déjà la réservation en ligne ; l'alerte « virement pas arrivé » et le compte
  du virement existent depuis la Phase 4.
- **`db:seed` écrase les fiches des gîtes** : à traiter au lot 4 (réponse 11A).
- **Le point 1 (libellé des options)** visait un cas qui n'existe pas : aucune
  option n'est vendue ; levé, E-5 sans objet.
- Trouvé en écrivant : la limite du tunnel lit la **dernière** adresse de
  X-Forwarded-For (celle du proxy), la signature la **première** ; le
  back-office suit le tunnel. L'écart de la signature reste le point 2.

### Ce qui a été fait

- **Migration 0012** : six tables de connexion (`db/schema/gestion.ts`), six
  réglages `gestion_*` et leurs bornes.
- **`lib/gestion/`** : `secrets.ts` (scrypt N = 2^17, jetons, codes, appareil
  lisible), `connexion.ts` (mot de passe, code, appareils reconnus 30 jours
  glissants, sessions de 8 heures, échecs par adresse IP, lien du mot de passe,
  ménage à chaque connexion), `reglages.ts` (dix rubriques, bornes, champs
  liés, IBAN, alertes, lecture seule), `journal.ts` (`audit_logs`).
- **`app/gestion/`** : connexion, code, mot de passe oublié, choix du mot de
  passe, accueil provisoire, réglages, appareils ; actions serveur ; témoins
  `httpOnly`, `SameSite=Strict`, chemin /gestion. **`middleware.ts`** : /gestion
  hors des langues, fermé sans témoin, en-têtes `noindex`, `no-store`,
  `DENY`, `no-referrer`.
- **Courriels** : code de connexion et lien du mot de passe (envoyés tout de
  suite, hors du journal des courriels) ; alerte « À TRAITER — le compte de
  virement a été modifié » ; l'alerte « coordonnées bancaires absentes » renvoie
  désormais aux réglages du back-office.
- **`npm run gestion:compte`** : crée le compte et envoie le lien.
- **Contrôles** : `verify:gestion` (97 cas, 10 de plus avec `--http`),
  `db:verify` section 6k (8 contrôles), une étape de plus dans `lancer.sh`.

### Ce qui a été vérifié

Sur la base PostgreSQL jetable du poste (port 55433, `gites_essai`), jamais sur
la base réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 205 contrôles, 0 échec.
- Les formulaires par le serveur, comme un navigateur sans JavaScript (curl) :
  connexion, code reçu dans le fichier du courriel, témoins posés avec leurs
  protections, accueil, action refusée depuis une autre origine, déconnexion,
  ancien témoin refusé ; une rubrique des réglages refusée (0 minute) puis
  enregistrée (21 minutes, journal avant/après), remise à 20.
- `bash scripts/parcours/lancer.sh` : **dix-neuf étapes sur dix-neuf**, code de
  sortie 0 — centimes 51, tarification 192, blocage 42, paiement 69 (Stripe en
  mode test compris), courriels 41, « Ma réservation » 22, solde 62, caution
  86 (trois cartes Stripe comprises), virement 47, abandons 22, **back-office
  107**, parcours L'Armu et LaPhine 0 échec, URL signées 0 échec, contrôles en
  base 81/0, contrôles PDF 112 OK, `db:verify` 205/0. Aucun montant de
  `reference.ts` n'a bougé.

### Ce qui n'a PAS été vérifié

- **Les écrans dans un navigateur** (mise en page, téléphone) : leur contenu et
  leurs formulaires sont contrôlés, pas leur aspect.
- **Un vrai courriel de code** reçu à contact@ par Brevo.
- **L'en-tête X-Forwarded-For écrit par Traefik** sur le serveur (comme pour
  le tunnel) : sans lui, les échecs de tous les visiteurs se cumulent.
- **La base réelle** : la migration 0012 s'ajoute aux migrations en attente.

### Points reportés

- **Appliquer les migrations 0002 à 0012**, puis **créer le compte**
  (`npm run gestion:compte -- contact@gitesdesamoyas.fr`) et **saisir le compte
  du virement** dans le back-office : le gérant (point 4).
- **Les questions au comptable** (avoir, retenue de caution) : avant le lot 5
  (point 19).
- **La commission de comparaison** (statistiques) : un réglage du lot 6.
- Les textes des pages et des courriels du back-office, proposés le 3 et le
  4 novembre, ont été **validés par le gérant le 6 novembre 2026**.

---

## Phase 5 — lot 2 : réservations, cautions, solde par virement, « À traiter » (6 novembre 2026)

### Ce qui a été décidé

Cadrage du lot le 6 novembre 2026 (neuf questions sur l'exemple de Camille,
puis quatre de plus : réponses 1A à 8A, 9 « tout ce qui est à traiter
maintenant », a = A, b = 3 jours, c = A, d = virement seulement) ; décision
D-33. Consigné dans `docs/phases/phase-5.md`. Les textes (trois courriels au
client en français et en anglais, mentions de la facture, récapitulatifs,
lignes de l'accueil, messages de refus) ont été **validés par le gérant le
6 novembre 2026**.

### Défauts trouvés dans le code avant d'écrire

- **La facture de solde imprimait le moyen de paiement de l'acompte** (« Carte
  bancaire ») et sa référence : un solde reçu par virement serait sorti faux.
  Corrigé (`paiementImprime`, `lib/montants.ts`).
- **Le site ne savait pas encaisser une partie d'une caution** : le
  prestataire n'avait que « lever ». Ajouté : `encaisserCaution` (capture
  partielle Stripe, clé d'idempotence).
- **Les alertes du virement auraient continué** après qu'il soit noté reçu ou
  rendu (« vérifiez le virement », « rendez la caution ») : arrêtées.
- **Next refuse par défaut un formulaire de plus de 1 Mo** : les justificatifs
  (10 Mo) auraient été refusés. Plafond relevé à 12 Mo (`next.config.ts`).
- Trouvé au parcours : la **remise à zéro de la base de test** ne connaissait
  pas les nouvelles tables (`TRUNCATE` refusé à cause de `retenues`) ; ajoutées.

### Ce qui a été fait

- **Migration 0013** : caution reçue et rendue, note interne ; tables
  `retenues` et `a_traiter_faits` ; réglage `contrat_non_signe_jours` (3) ;
  trois courriels au client (retenue, caution reçue, caution rendue).
- **`lib/gestion/`** : `cautions.ts` (libérer, retenir avec justificatifs,
  chèque et virement reçus et rendus, lien de caution), `solde-virement.ts`,
  `reservations.ts` (liste, fiche, coordonnées, renvoi du lien de signature),
  `a-traiter.ts` (accueil, « C'est fait », arrivées et départs).
- **Pages** : accueil « À traiter », liste des réservations, fiche avec ses
  gestes ; les gestes définitifs passent par un récapitulatif à confirmer.
- **Contrôles** : `verify:gestion-reservations` (81 cas, 5 de plus avec
  `--http`), `db:verify` section 6l (11 contrôles), une étape de plus dans
  `lancer.sh` (vingt étapes).

### Ce qui a été vérifié

Sur la base PostgreSQL jetable du poste (port 55433, `gites_essai`), jamais sur
la base réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 218 contrôles, 0 échec.
- `bash scripts/parcours/lancer.sh` : **vingt étapes sur vingt**, code de
  sortie 0 — centimes 51, tarification 192, blocage 42, paiement 69 (Stripe en
  mode test compris), courriels 41, « Ma réservation » 22, solde 62, caution
  86 (trois cartes Stripe comprises), virement 47, abandons 22, back-office
  connexion 107, **back-office réservations 86**, parcours L'Armu et LaPhine
  0 échec, URL signées 0 échec, contrôles en base 81/0, contrôles PDF 112 OK,
  `db:verify` 218/0. Aucun montant de `reference.ts` n'a bougé. (Un premier
  passage a échoué à la remise à zéro : voir plus haut.)

### Ce qui n'a PAS été vérifié

- **Les écrans dans un navigateur**, dont le récapitulatif de la retenue et le
  choix des fichiers sur téléphone.
- **Une vraie capture partielle chez Stripe** (mode test) : la retenue est
  contrôlée avec le prestataire simulé.
- **Une facture de solde « Virement bancaire » en PDF** : les données imprimées
  sont contrôlées, pas le rendu (aucun numéro légal consommé pour un essai).
- **Un courriel avec pièce jointe reçu par Brevo.**

### Points reportés

- La **facture d'une retenue**, si le comptable la demande (point 19).
- La **durée de conservation** des justificatifs : le juriste (point 12).
- Les **migrations 0002 à 0013** sur la base réelle : le gérant (point 4).

---

## Phase 5 — lot 3 : les tarifs (7 novembre 2026)

### Ce qui a été décidé

Cadrage du lot le 7 novembre 2026 (neuf questions sur l'exemple de L'Armu,
75 € la nuit en basse saison) : réponses 1A, 2A, 3B, 5A, 6A, 7A, 8A, 9A. La
question 4 (période qui ne commence pas un samedi) n'avait pas été comprise :
expliquée, elle reprend ce que prévoyait déjà la fiche (refus, jour réglable).
La question 7 reposait à tort la règle du barème, décidée en octobre (D-17) :
seule la saisie à l'écran était ouverte. Décision D-34, consignée dans
`docs/phases/phase-5.md`. Les textes des écrans (état, récapitulatifs, refus,
aides) ont été **validés par le gérant le 7 novembre 2026**.

### Ce qui a été fait

- **Migration 0014** : `reglages.tarifs_horizon_mois` (12 mois).
- **`lib/gestion/tarifs-regles.ts`** (pur) : saisies, découpage des périodes,
  passé figé, période en cours, copie d'une année (+ 364 jours), trous, état.
- **`lib/gestion/tarifs.ts`** : lecture de la page ; gestes en deux temps
  (récapitulatif et empreinte, puis écriture sous verrou si rien n'a bougé) ;
  journal ; noms comparés côté site (`lower()` de PostgreSQL laisse « É » intact
  en locale C : trouvé par le contrôle).
- **Pages** `/gestion/tarifs` (prix, périodes, barèmes, règles, taxe de séjour),
  l'état en tête de chacune ; « Tarifs » dans le menu ; « À traiter » : nuits
  sans tarif et tarifs incomplets.
- **Contrôles** : `verify:gestion-tarifs` (87 cas, 93 avec `--http`),
  `db:verify` section 6m (3 contrôles), une étape de plus dans `lancer.sh`
  (vingt et une étapes).

### Ce qui a été vérifié

Sur la base PostgreSQL jetable du poste (port 55433, `gites_essai`), jamais sur
la base réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 221 contrôles, 0 échec.
- `bash scripts/parcours/lancer.sh` : **vingt et une étapes sur vingt et une**,
  code de sortie 0 — tarification 192, blocage 42, paiement 69, courriels 41,
  « Ma réservation » 22, solde 62, caution 86, virement 47, abandons 22,
  back-office connexion 107, réservations 86, **tarifs 93**, parcours L'Armu et
  LaPhine 0 échec, URL signées 0 échec, contrôles en base 81/0, contrôles PDF
  0 échec, `db:verify` 221/0. Aucun montant de `reference.ts` n'a bougé.

### Ce qui n'a PAS été vérifié

- **Les écrans dans un navigateur** : les formulaires en deux temps, l'aperçu
  du barème, la bande de couleurs sur téléphone. Les gestes sont contrôlés par
  leurs fonctions, les pages par leur affichage au serveur.
- La lecture des tarifs dans une transaction envoie plusieurs requêtes à la
  fois sur la même connexion (avertissement de la bibliothèque PostgreSQL,
  déjà présent avec le tunnel) : sans effet aujourd'hui, à reprendre avant la
  version 9 de `pg`.

### Points reportés

- **La saisie des vrais tarifs** : les propriétaires, après les migrations
  (point 11).
- Les **migrations 0002 à 0014** sur la base réelle : le gérant (point 4).

---

## Phase 5 — lot 4 : calendrier, options, fiches des gîtes, documents (7 et 8 novembre 2026)

### Ce qui a été décidé

Cadrage du lot le 7 novembre 2026 (exemples : M. Durand au téléphone pour
LaPhine du 10 au 17 juillet ; travaux à L'Armu en janvier). Déjà décidé le
3 novembre : fermer d'un geste (10), seed « création seule » (11 A), fiche du
gîte (12 A). Réponses : 1B (option), 2A, 4A, 5B, 6A, 7A. La décision 13 A
(« bloquer puis envoyer réserver ») ne marchait pas — le site refuse une nuit
fermée au client lui-même — : remplacée par l'option. La question 3 greffait
des variantes (plusieurs gîtes, motif, réouverture partielle) sur une décision
prise : « ça se fera manuellement » ; seule la forme simple est construite.
Décision D-35, consignée dans `docs/phases/phase-5.md`. Le 8 novembre : textes
validés ; les boutons deviennent « Bloquer ces nuits » et « Débloquer ces
nuits » (blocage manuel, sans motif ni paiement) ; écart E-9 : choix A, la
fiche du gîte est figée sur la réservation à l'émission du contrat.

### Ce qui a été fait

- **Migration 0015** : table `options_sejour`, état `option` des nuits,
  `reservations.option_id`, réglage `option_duree_jours` (3), courriels
  `option` et `contrat_signe` ; trois colonnes mortes de `gites` retirées.
- **`lib/disponibilites.ts`** : une ligne provisoire échue (verrou ou option)
  vaut libre ; les nuits d'une option sont libres pour son client et vendues à
  son paiement. **`lib/options-sejour.ts`** ; le tunnel accepte le lien d'une
  option (`/reserver?option=…`, dates fixées, pas de verrou) ;
  `lib/paiement.ts` marque l'option utilisée.
- **`lib/gestion/calendrier.ts`** (mois, fermer, rouvrir, poser et lever une
  option), **`gites.ts`** (fiche en deux temps), **`documents.ts`** (liste,
  PDF, renvoi du même document).
- **Pages** `/gestion/calendrier`, `/gestion/gites`, `/gestion/documents`
  (et `/gestion/documents/pdf`), boutons « Ouvrir le PDF » et « Renvoyer » sur
  la fiche d'une réservation, réglage de la durée d'une option ; menu.
- **`db:seed`** : création seule.
- **Migration 0016** (écart E-9, le 8 novembre) : capacité, équipements, spa et
  téléphone recopiés sur la réservation par `lib/contrat.ts` à l'émission ;
  `ficheContrat` (`lib/montants.ts`) les lit pour le contrat et sa copie signée.
- **Contrôles** : `verify:gestion-calendrier` (92 cas, 105 avec `--http`),
  `db:verify` section 6n (11 contrôles), `controler.ts` (la fiche recopiée à
  l'émission, une fois par parcours), une étape de plus dans `lancer.sh`
  (vingt-deux étapes) ; `verify:gestion` envoie le nouveau champ de la rubrique
  Tunnel.

### Ce qui a été vérifié

Sur la base PostgreSQL jetable du poste (port 55433, `gites_essai`), jamais sur
la base réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 232 contrôles, 0 échec.
- `bash scripts/parcours/lancer.sh` : **vingt-deux étapes sur vingt-deux**,
  code de sortie 0 — tarification 192, blocage 42, paiement 69, courriels 41,
  « Ma réservation » 22, solde 62, caution 86, virement 47, abandons 22,
  back-office connexion 107, réservations 86, tarifs 93, **calendrier 105**,
  parcours L'Armu et LaPhine 0 échec, URL signées 0 échec, contrôles en base
  83/0, contrôles PDF 0 échec, `db:verify` 232/0. Aucun montant de
  `reference.ts` n'a bougé. Journal du serveur sans erreur. (Rejoué le
  8 novembre après le renommage et la migration 0016.)
- Le contrôle a trouvé, avant tout commit, une condition qui faisait lire
  toutes les nuits comme libres hors option (la vente en double restait
  impossible : le verrou en base refusait) ; corrigée.

### Ce qui n'a PAS été vérifié

- **Les écrans dans un navigateur** : la grille du calendrier sur téléphone,
  les formulaires, le tunnel ouvert par un lien d'option. Les pages sont
  contrôlées par leur affichage au serveur, les gestes par leurs fonctions.
- Le courriel d'option réellement reçu (envoi simulé).

### Points reportés

- Les **migrations 0002 à 0016** sur la base réelle : le gérant (point 4).

---

## Phase 5 — lot 6 : statistiques (8 novembre 2026)

### Ce qui a été décidé

La liste des chiffres était décidée depuis le 3 novembre (réponse S
« toutes »), provenance comprise (langue du site, département ou pays). Le lot 5
(annulation et avoir) attend toujours le comptable : le lot 6 passe avant.
Réponses du 8 novembre : 1B (l'argent au mois du séjour : « quel mois a été
productif »), 2A (taxe : les séjours qui commencent dans la période), 4A (taux
de commission vide au départ). La question 3 (provenance) avait été reposée
par erreur : retirée. Décision D-36, consignée dans `docs/phases/phase-5.md`.

### Ce qui a été fait

- **Migration 0017** : `reglages.commission_taux` (pour cent entiers, 1 à 50,
  vide), rubrique « Statistiques » des Réglages.
- **`lib/gestion/statistiques.ts`**, **`lib/departements.ts`**, page
  **`/gestion/statistiques`** (menu) : nuits louées, séjours hors taxe de
  séjour, réservations, commissions évitées, provenance, cautions retenues,
  registre de la taxe de séjour d'une période.
- **Contrôles** : `verify:gestion-statistiques` (26 cas, 28 avec `--http`),
  `db:verify` (colonne et borne du taux), vingt-troisième étape de
  `lancer.sh`.

### Ce qui a été vérifié

Sur la base PostgreSQL jetable du poste (`gites_essai`), jamais sur la base
réelle :
- `npm run lint`, `npx tsc --noEmit`, `npm run build` : passent.
- `npm run db:verify` : 233 contrôles, 0 échec.
- `bash scripts/parcours/lancer.sh` : **vingt-trois étapes sur vingt-trois**,
  code de sortie 0 — tarification 192, blocage 42, paiement 69, courriels 41,
  « Ma réservation » 22, solde 62, caution 86, virement 47, abandons 22,
  back-office connexion 107, réservations 86, tarifs 93, calendrier 105,
  **statistiques 28**, parcours L'Armu et LaPhine 0 échec, URL signées
  0 échec, contrôles en base 83/0, contrôles PDF OK, `db:verify` 233/0. Aucun
  montant de `reference.ts` n'a bougé. Journal du serveur sans erreur.
- Le premier passage a buté sur un seul cas : la page affichait bien
  « Corse-du-Sud (2A) », mais en morceaux dans le HTML ; le libellé est écrit
  d'un tenant.

### Ce qui n'a PAS été vérifié

- **La page dans un navigateur**, en particulier les tableaux sur téléphone
  (ils défilent de côté).
- Des chiffres sur de vraies réservations : aucune en base réelle.

### Points reportés

- **Les textes de la page** sont à valider par le gérant avant le commit.
- Le **lot 5** (annulation et avoir) : après la réponse du comptable.
- Les **migrations 0002 à 0017** sur la base réelle : le gérant (point 4).

---

## Hors phase : travaux sans réponse extérieure (9 novembre 2026)

En attendant le comptable, trois travaux qui ne demandent la réponse de
personne, à la demande du gérant.

### Ce qui a été fait

- **Écart E-7 corrigé.** L'identité de la SARL (raison sociale, capital,
  adresse, RCS, SIRET, téléphone, gérant) et les mentions (article de
  l'exonération de TVA, médiateur) vivent dans `lib/constantes.ts`, en
  éléments séparés ; le contrat, les trois factures et la page de signature les
  lisent là. Aucun mot imprimé ne change.
- **Relevé des valeurs sans source** des pages publiques, inscrit dans
  `docs/phases/phase-6.md` : rien n'a été modifié.
- **Ancien site relevé** (sept adresses, lecture seule) et quatre redirections
  301 ajoutées dans `next.config.ts` ; deux adresses attendent une décision
  (`docs/phases/phase-7.md`).

### Ce qui a été vérifié

- Texte des PDF extrait avant et après (contrat, contrat signé, factures
  d'acompte et de solde du parcours ; facture unique rendue à part par les deux
  versions avec les mêmes données) : identique, hors date, identifiant et
  empreinte de signature. Le premier passage a trouvé deux écarts d'espace
  (« donnéespersonnelles » à l'article 14.1, un espace double dans l'en-tête
  des factures), corrigés avant le second passage.
- Parcours complet 23 étapes, code de sortie 0 ; lint, `tsc --noEmit`, build.
- Les quatre redirections répondent 301 vers une page qui répond 200.

### Ce qui n'a PAS été vérifié

- Les pages de l'ancien site que plus aucun lien ne montre (Search Console).

---

## Hors phase : réponses du gérant (11 et 12 novembre 2026)

### Ce qui a été décidé

- Adresse de contact du site : **contact@gitesdesamoyas.fr**.
- Bons cadeaux de l'ancien site (`/bon.html`, `/images/amour.pdf`) : vers la
  page Contact ; les options de l'ancien site ne sont pas reprises.
- Taxe de séjour : ni le ménage ni les **bébés** ne comptent dans le calcul.
- **Aucun ménage** (D-37) : forfait à 0 € sur la fiche des gîtes, client qui
  nettoie avant de partir, retenue sur la caution à défaut ; contrat v5.
- Médiateur : **aucune adhésion** ; l'obligation est rappelée, le point 7 reste
  bloquant.
- Lot 6 : textes validés, commité.

### Ce qui a été fait

- `lib/data/legal.ts` et la page Contact : contact@gitesdesamoyas.fr.
- `next.config.ts` : les sept adresses de l'ancien site ont une suite.
- Migration **0018** : `taxes_sejour.bebes_parmi_occupants` faux par défaut ;
  la case du back-office naît décochée, son aide donne la réponse.
- Ménage à 0 € : lignes masquées (fiche du gîte, tunnel, contrat, trois
  factures), article 4.5 omis, article 11.5 en seconde rédaction ;
  `TEMPLATE_VERSION` v5 ; `docs/contrat-template.md` et
  `docs/facture-template.md` suivent.

### Ce qui a été vérifié

- Contrat et trois factures rendus avec et sans ménage, sur la réservation
  LaPhine du parcours, ménage modifié en mémoire seulement : sans ménage, plus
  aucune ligne, plus d'article 4.5, nouvel article 11.5, totaux en baisse de
  80 € exactement, taxe de séjour inchangée (le ménage n'est pas dans son
  calcul). Avec 80 €, texte de la v4.
- Fiche de LaPhine à 0 € sur la base de test, en français et en anglais : plus
  de ligne ménage ; L'Armu, à 80 €, la garde ; base remise à 80 €.
- Sept adresses de l'ancien site : 301 puis 200. L'adresse de contact sur
  Contact (fr, en), mentions légales et confidentialité.
- `db:verify` 233/0, `verify:tarification` 192, `verify:gestion-tarifs` 87,
  parcours 23 étapes (code 0, `reference.ts` inchangé), lint, `tsc`, build.

### Ce qui n'a PAS été vérifié

- Le récapitulatif du tunnel à 0 € dans un navigateur : il se dessine chez le
  client ; la condition est celle de la fiche du gîte.

---

## Hors phase : le sauna à l'article 12, les mentions légales (12 novembre 2026)

### Ce qui a été décidé

- Les notes des gîtes (5,0, 16 avis…) et le label 3 épis sont vrais : avis
  Gîtes de France. À terme, les avis laissés par les clients du site doivent
  remplacer ces chiffres. L'agence partenaire des mentions légales est fausse :
  retirée.
- Le sauna : une case de la fiche du gîte (D-38).

### Ce qui a été fait

- Migration **0019** : `gites.a_sauna` (cochée pour La Maison Vieille),
  `reservations.contrat_a_sauna` figée à l'émission du contrat.
- Article 12 du contrat (`ArticleEquipements`) : règles du sauna, titre et
  paragraphes selon les deux cases, numérotation suivie.
- Texte d'accord : l'article 12 nommé selon les équipements imprimés.
- Back-office : case « Sauna » sur la fiche, ligne du récapitulatif.
- Mentions légales : « avec l'aide d'une agence partenaire » retiré.

### Ce qui a été vérifié

- Contrat rendu pour les quatre cas (spa, spa et sauna, sauna, aucun) : règles
  et numérotation justes, pas d'article 12 sans équipement.
- Contrats de L'Armu et LaPhine du parcours : mot pour mot ceux d'avant ;
  texte d'accord enregistré « relatif à l'équipement spa ».
- `verify:gestion-calendrier` 94 cas (texte d'accord, case sauna, fiche figée),
  `db:verify` 233/0, parcours 23 étapes (code 0, `reference.ts` inchangé),
  lint, `tsc`, build.

### Ce qui n'a PAS été vérifié

- Un contrat de La Maison Vieille passé par tout le parcours (paiement,
  signature) : le parcours ne couvre que L'Armu et LaPhine ; le rendu a été
  contrôlé à part.

---

## Phase 6 (sans réponse extérieure) : cookies, référencement, signature (12 novembre 2026)

### Ce qui a été fait

- **Bannière cookies retirée** (D-39) : le site ne dépose aucun traceur ;
  politique cookies réécrite (`lib/data/legal.ts`).
- **Référencement** : description et aperçu de partage par page
  (`lib/i18n/metadonnees.ts`, textes déjà affichés), `app/robots.ts`,
  `app/sitemap.ts`, données structurées (`components/ui/DonneesStructurees.tsx`).
- **Page de signature** habillée comme « Ma réservation »
  (`app/[lang]/signer/[token]/page.module.css`), textes inchangés.

### Ce qui a été vérifié

- Plus de bannière en français ni en anglais ; politique cookies affichée.
- `robots.txt` ; `sitemap.xml` vide et signalé sans `NEXT_PUBLIC_SITE_URL`,
  22 adresses avec elle ; titre, description, aperçu de partage et données
  structurées lus sur l'accueil, les fiches (fr, en), la liste des gîtes, les
  activités, le contact.
- Page de signature capturée (ordinateur, téléphone, erreur) sur un contrat
  d'essai de La Maison Vieille émis par le serveur de test : sauna figé, texte
  d'accord « relatif aux équipements spa et sauna ».
- Parcours 23 étapes (code 0, `reference.ts` inchangé), lint, `tsc`, build.

### Ce qui n'a PAS été vérifié

- Les données structurées dans l'outil de test de Google (adresse publique
  nécessaire).
- La page de signature sous 500 pixels de large : l'outil de capture ne
  descend pas plus bas (la page « Ma réservation », dont elle reprend les
  styles, montre le même cadrage).

### Trouvé en passant

- La route qui sert les PDF (`app/api/documents`, `Readable.toWeb` dans
  `lib/storage.ts`) inscrivait « Controller is already closed » au journal
  quand le navigateur coupait le téléchargement. **Corrigé le même jour** : le
  fichier est lu en entier avant d'être envoyé (quelques centaines de Ko, un
  justificatif 10 Mo au plus) ; `readStream` est retiré du stockage. Contrôlé
  par `db:verify`, section 7 (200, type, octets exacts, 403, 404).

---

## Phase 6 (sans réponse extérieure) : les avis des clients (12 novembre 2026)

Réponses du gérant : 1 A, 2 A, 3 A, 4 B, 5 A (D-40).

### Ce qui a été fait

- **Migrations 0020 et 0021** : la table `avis` provisoire retirée (garde-fou :
  arrêt si elle contient une ligne ; contrôle ajouté à `verify:production`),
  puis la table définitive ; chiffres Gîtes de France sur la fiche de chaque
  gîte (valeurs du site recopiées) ; deux réglages ; trois courriels ;
  l'alerte « avis ».
- **`lib/avis.ts`** : invitation le lendemain du départ (tâches
  automatiques), lien `/avis/{jeton}` (jeton de « Ma réservation ») ouvert du
  départ à D + 30, dépôt unique, lecture publique, retrait en deux temps,
  effacement après 3 ans. Règles écrites dans `lib/avis-regles.ts`.
- **Pages** : la page de dépôt et `POST /api/avis` ; les avis sur la fiche du
  gîte (`components/ui/AvisClients.tsx`) ; la note des clients à l'accueil ;
  les cartes des gîtes lisent les chiffres Gîtes de France en base (avec leur
  source) et passent aux avis du site quand ils sont vidés ; la politique des
  avis (`/legal/avis`), le pied de page (« Avis de nos hôtes » mène enfin
  quelque part), la confidentialité et les mentions légales mises à jour.
- **Back-office** : page « Avis » (lecture, retrait pour un motif), chiffres
  Gîtes de France sur la fiche des gîtes, délais dans les réglages, alerte
  « Nouvel avis ».
- La carte Gîtes de France de la fiche avait un lien « Lire les avis » vers
  `#` : il ne s'affiche plus que si l'adresse de la page est saisie.

### Ce qui a été vérifié

- `verify:avis --http` 59/0 (ajouté au parcours) ; `verify:gestion-calendrier`
  (fiche du gîte, chiffres Gîtes de France) ; `db:verify` 255/0 (section 6o) ;
  parcours 24 étapes (code 0, `reference.ts` inchangé), lint, `tsc`, build.
- Captures : la page de dépôt, la fiche de L'Armu avec trois avis (4,7/5) et
  la carte Gîtes de France (5,0/5, 22 avis).

### Ce qui n'a PAS été vérifié

- Le courriel d'invitation reçu dans une vraie boîte (envoi simulé).
- La relecture des textes par un juriste (point 13).

## Phase 6 : le bailleur est la SARL, factures sur demande décidées (14 novembre 2026)

Réponses du gérant aux questions préparées pour le comptable (D-41).

### Ce qui a été fait

- Mentions légales, CGV (version 5), confidentialité et pied de page au nom de
  la SARL DE LA VOUTE, lus dans `EMETTEUR` : capital, siège, RCS, SIRET,
  directeur de la publication (le gérant). Le SIRET factice et le code APE
  disparaissent. Points 6 et 17 levés, écart E-1 corrigé.
- Le médiateur MTV retiré des CGV (gérant : rien de non confirmé) ; elles
  n'en citent plus aucun jusqu'à l'adhésion (point 7).
- Décidé, pas encore construit : les factures seulement sur demande (bouton
  sur la fiche de la réservation), l'avoir (suite `AV`, envoyé
  automatiquement), la facture de retenue sur caution.

### Ce qui a été vérifié

- lint, `tsc`, build ; les pages juridiques relues à l'écran.

## Phase 6 : les factures sur demande (14 novembre 2026)

D-41, réponses du gérant : une facture du séjour entier (1 A), au nom du
client ou d'une entreprise (2 A), l'avoir envoyé automatiquement (3 A, à
construire avec l'annulation).

### Ce qui a été fait

- **Plus aucune facture automatique** : ni après l'acompte, ni après le solde
  (carte ou virement), ni pour un séjour payé en une fois. Les courriels de
  confirmation restent. « Ma réservation » ne promet plus la facture.
- **Fiche de la réservation** : une fois le séjour entièrement payé, « Créer
  et envoyer la facture », en deux temps (récapitulatif : montant,
  destinataire, adresse du courriel, « ne pourra plus être supprimée »),
  avec un volet replié « Au nom d'une entreprise » (nom, adresse, SIREN
  facultatif). Sous une retenue faite : « Créer et envoyer la facture de
  retenue ». Journal « Facture demandée par le client ».
- **La facture du séjour** (`total`) sert maintenant aussi au séjour payé en
  deux fois : elle liste les paiements reçus (acompte puis solde, même le
  même jour) et refuse si leur somme ne fait pas le total. Sa note devient
  « Le séjour est intégralement réglé. ». Instantané au format 4.
- **La facture de retenue** (migration 0022, `FactureRetenuePDF`) : objet,
  motif, caution, restitué, retenu, phrase « Somme non soumise à la TVA :
  dédommagement d'un dégât, sans service rendu en échange. ».
- Garde ajoutée : plus de facture d'acompte ni de solde après celle du séjour.

### Ce qui a été vérifié

- Parcours complet : **25 étapes, toutes OK** (code 0), `reference.ts`
  inchangé. Par étape : conversion 51, tarification 192, blocage 42,
  paiement 69, courriels 41, « Ma réservation » 22, solde 61, **factures sur
  demande 42** (nouvelle étape, vraies factures par le serveur), caution par
  carte 86, virement 47, abandons 22, avis 59, back-office 107, réservations
  86, tarifs 93, calendrier 111, statistiques 28, deux parcours et URL
  signées sans échec, contrôles en base 83, contrôles des PDF 112,
  `db:verify` 256.
- lint, `tsc`, build. Contrôle visuel des PDF : facture du séjour payé en
  deux fois, au nom d'une entreprise, facture de retenue.

### Ce qui n'a PAS été vérifié

- Le bouton à l'écran avec une vraie session (les gestes sont contrôlés par
  la fonction, les pages du back-office s'ouvrent dans `verify:gestion-*`).
- Le courriel de la facture reçu dans une vraie boîte (envoi simulé).
- La phrase de TVA de la retenue et l'exonération, par le comptable.

## Phase 6 : plus aucun médiateur cité (15 novembre 2026)

Gérant : pas d'adhésion, donc pas de médiateur affiché (D-41).

### Ce qui a été fait

- Contrat **v6** : l'art. 15 devient « Réclamations » (15.2 MEDICYS retiré,
  l'ancien 15.3 devient 15.2), l'art. 16.2 dit « À défaut de résolution
  amiable, tout litige… » sans « après tentative de médiation ».
- Les quatre factures (acompte, solde, séjour, retenue) n'impriment plus la
  ligne « Médiation de la consommation ». `MENTIONS.mediateur` supprimé.

### Ce qui a été vérifié

- lint, `tsc`, build ; parcours complet : **25 étapes, toutes OK**,
  `reference.ts` inchangé. Le contrat passe de 11 à 10 pages (contrôle mis à
  jour) ; contrôles des PDF **120** (dont « aucun médiateur cité » sur chaque
  contrat et chaque facture), `db:verify` 256. Page des art. 15 et 16 relue à
  l'écran.
- Puis, le même jour (gérant), contrat **v7** : l'art. 15.2, qui renvoyait à
  la plateforme européenne de règlement en ligne des litiges (fermée par la
  Commission en juillet 2025), est retiré ; l'art. 15 ne garde que la
  réclamation directe (15.1). Parcours rejoué : 25 étapes OK, contrat
  toujours sur 10 pages.

## Phase 5, lot 5 : annuler une réservation, rembourser, l'avoir (15 novembre 2026)

D-42, réponses du gérant : 1 A (la carte remboursée par le site), 2 A (la
carte d'abord, le reste par virement), 3 A (le montant du contrat, sans
geste), 4 A (seuls les propriétaires annulent), 5 A (ce qui est gardé compte
dans les statistiques), 6 A (la date où le client a prévenu est saisie).

### Ce qui a été fait

- **Migration 0023** : tables `annulations`, `remboursements`, `avoirs` ;
  fonction `creer_avoir` (suite AV par `prochain_numero`) ; courriels
  « annulation » et « avoir ».
- **Le calcul** (`partageAnnulation`, `lib/montants.ts`) : article 7 selon qui
  annule et quand le client a prévenu ; la taxe de séjour payée toujours
  rendue ; pas de « tout rendu » en paiement intégral imposé.
- **Le geste** (`lib/gestion/annulation.ts`) : cadre « Annuler la
  réservation » sur la fiche, en deux temps (qui, règle et date, payé, gardé,
  rendu et comment, nuits, solde, caution, courriel, avoir, « C'est
  définitif ») ; à la confirmation : paiement du solde ouvert annulé chez
  Stripe, statut « annulée », nuits libérées, remboursements écrits, courriel,
  journal, puis la carte remboursée chez Stripe et la caution bloquée levée.
- **Le remboursement** (`lib/annulation.ts`) : la carte d'abord (le paiement
  le plus récent d'abord), le reste par virement avec « Remboursement fait » ;
  refus de Stripe : passage en virement ; panne : reprise par les tâches,
  même clé, jamais deux fois.
- **L'avoir** (`lib/avoirs.ts`, `AvoirPDF`) : quand tout est rendu, s'il y a
  une facture ; envoyé au client, listé dans « Documents », renvoyable.
- « À traiter » : remboursement à faire par virement, remboursement par carte
  qui n'aboutit pas, caution reçue à rendre (rendue tout de suite, avant le
  départ). « Ma réservation » : « Cette réservation est annulée. ».
  Statistiques : ce qui est gardé compte dans les séjours.
- `POST /api/factures` accepte `avoir` (parcours et contrôles).

### Ce qui a été vérifié

- Parcours complet : **26 étapes, toutes OK** (code 0), `reference.ts`
  inchangé. Par étape : conversion 51, tarification **209** (17 nouveaux),
  blocage 42, paiement 69, courriels 41, « Ma réservation » 22, solde 61,
  factures 42, **annulation 45** (nouvelle étape, vrai avoir et pages),
  caution par carte 86, virement 47, abandons 22, avis 59, back-office 107,
  réservations 86, tarifs 93, calendrier 111, statistiques 28, deux parcours
  et URL signées sans échec, contrôles en base 83, contrôles des PDF 120,
  `db:verify` **268** (12 nouveaux : tables, avoir AV, refus).
- lint, `tsc`, build. PDF de l'avoir relu à l'écran (un défaut corrigé :
  « Virement bancaire » coupé dans la colonne étroite).

### Ce qui n'a PAS été vérifié

- Un vrai remboursement Stripe en mode test (le prestataire est simulé ; la
  clé d'idempotence et le refus sont contrôlés par la simulation).
- Les courriels reçus dans une vraie boîte (envoi simulé).
- Le formulaire à l'écran avec une vraie session (la page est ouverte par
  `verify:annulation --http`, le geste est contrôlé par la fonction).

## Phase 5 : clôture (16 au 18 novembre 2026)

Réponses du gérant : 1 A (le contrat d'une réservation annulée ne se signe
plus), 2 A (la borne du champ « Le client a prévenu le » retirée), 3 A (les
textes du lot 5 remontrés), 4 A (les deux angles morts notés, rien de
construit), et ses essais à l'écran **avant** de clore.

### Ce qui a été fait

- **Signature d'une réservation annulée** (D-42) : la page `/signer/{jeton}`
  affiche « Réservation annulée » au lieu du formulaire ; l'enregistrement
  répond 410, y compris quand l'annulation tombe pendant la signature
  (réservation relue sous verrou partagé dans la transaction). Phrase unique
  `messageContratAnnule` (`lib/constantes.ts`).
- **Le champ de l'heure du préavis** accepte une heure plus tardive que
  l'ouverture de la page (le refus d'une date future reste au serveur).
- **La confirmation d'une facture** ajoute « Rechargez la page (F5) pour la
  voir et ouvrir son PDF. » : la facture est écrite juste après la réponse,
  la page affichée ne la montrait pas (vu par le gérant à l'essai 7.4).
- `verify:annulation --http` : 2 cas de plus (page et enregistrement de la
  signature refusés), **47**.
- Documentation : fiche de phase close (critères et preuves, seed, points
  hérités, reports, questions ouvertes), une ligne dans D-42, checklist
  (point 19 dans l'en-tête, migrations 0002 à 0023, bilan des tâches),
  architecture (scripts, 47 cas), README du parcours.

### Textes validés par le gérant

- Nouveau : « **Réservation annulée** — La réservation liée au contrat
  {numéro} est annulée : ce contrat ne peut plus être signé. Pour toute
  question, contactez Les Gîtes de Samoyas. »
- Nouveau : « La facture est créée et part à {courriel} dans un instant.
  Rechargez la page (F5) pour la voir et ouvrir son PDF. »
- Les textes du lot 5, remontrés en une fois : récapitulatif de
  l'annulation, courriel d'annulation et courriel de l'avoir (français et
  anglais), PDF de l'avoir et ses trois motifs, « Ma réservation », lignes
  « À traiter ».

### Ce qui a été vérifié

- **Essais à l'écran du gérant** (guide en dix essais, base de test,
  Stripe en mode test, courriels écrits dans des fichiers) : connexion, code
  et appareil reconnu, `/gestion/reglages` fermé en navigation privée ; prix
  changé visible tout de suite sur la fiche publique ; périodes (découpage,
  mardi refusé, copie d'une année) ; calendrier (bloquer, débloquer, option
  et son lien, levée) ; fiche d'un gîte ; réservations prises comme un
  client ; fiche d'une réservation, solde et caution par virement, factures
  et leur PDF ; annulations (« Nous » remboursée sur la carte chez Stripe en
  mode test, client tard avec avoir, carte puis virement avec « Remboursement
  fait » et « Caution rendue entière ») ; vieux lien de signature ;
  « Ma réservation » ; client absent (récapitulatif sans confirmer) ;
  « Documents » ; statistiques et registre ; affichage téléphone. Tous bons.
- lint, `tsc`, build ; `db:verify` **268** ; parcours complet : **26 étapes,
  toutes OK** (code 0), `reference.ts` inchangé. Par étape : conversion 51,
  tarification 209, blocage 42, paiement 69, courriels 41, « Ma
  réservation » 22, solde 61, factures 42, **annulation 47**, caution par
  carte 86, virement 47, abandons 22, avis 59, back-office 107,
  réservations 86, tarifs 93, calendrier 111, statistiques 28, deux parcours
  et URL signées sans échec, contrôles en base 83, contrôles des PDF 120,
  `db:verify` 268.

### Ce qui n'a PAS été vérifié

- Les courriels reçus dans une vraie boîte (écrits dans des fichiers).
- Le critère 1 par un contrôle automatique : les contrôles appellent les
  fonctions, pas les actions ; la preuve est l'essai à l'écran.

### Reporté et ouvert

- Reportés après l'ouverture : les bons cadeaux ; l'accueil plus loin dans
  le temps (le mois prochain, 6 mois, 1 an), demandé par le gérant pendant
  ses essais.
- Questions ouvertes : aucune facture possible pour la somme gardée après
  une annulation ; « client absent » à noter avant le passage en
  « terminée » (3 jours après le départ). Détail : `docs/phases/phase-5.md`,
  « Clôture ».

## Réponses du comptable et du juriste, 72 heures (19 et 20 novembre 2026)

D-43. Comptable : l'exonération de TVA tient ; pas de facture pour une
retenue ; l'avoir a son numéro dans la suite des factures ; la caution par
virement, il l'enregistre lui-même ; la facture électronique, il demande plus
de temps. Juriste : contrat relu sans remarque, CGV en français seulement
acceptées, 30 jours de conservation des tentatives abandonnées. Gérant :
72 heures pour le solde (point 16), médiateur plus tard, choix 1 A (avoir
`FAC-…`) et 2 A (facture de retenue retirée entièrement). Stripe : le compte
est activé (partie 1 faite par le gérant), restent les clés réelles et l'avis
de paiement au déploiement.

### Ce qui a été fait

- **Migration 0024** : `creer_avoir` par `prochain_numero('FAC', année)` ;
  type `retenue` retiré de `factures_type_check` ; réglage du délai de
  remboursement du solde à 72 (défaut et ligne existante si elle valait 48).
- **Facture de retenue retirée** : bouton de la fiche, action, émission
  (`lib/factures.ts`, `lib/gestion/factures.ts`), données (`lib/montants.ts`),
  `FactureRetenuePDF` supprimé, texte du courriel, libellé des documents,
  mention `tvaRetenue`. Le courriel de la retenue (montant, justificatifs)
  reste.
- `verify:production` compte factures **et** avoirs dans la suite FAC ;
  message des 30 jours.
- Contrôles adaptés : `db:verify` (avoir FAC suivant, retenue refusée,
  72 heures), `verify:annulation` (compteur FAC), `verify:factures` (retenue
  sans facture, type refusé par la route).
- Documentation : D-43 (et renvois dans D-19, D-26, D-41, D-42), checklist
  (points 3, 12, 13, 16, 19, migrations 0002 à 0024), conformité, architecture,
  README de la base et du parcours, modèles de facture et de contrat.
- Guide de l'étape 2 pour le gérant (`.data/guide-base-reelle.md`, hors git).

### Textes

- Retirés : le bouton et la phrase « Facture de la retenue : seulement si le
  client la demande… », le courriel « Voici la facture de la retenue sur
  votre dépôt de garantie : … », le PDF de la facture de retenue et sa phrase
  de TVA.
- Changés sans texte nouveau : le contrat imprime « 72 heures » à
  l'article 7.2 (le chiffre vient du réglage) ; l'avoir porte un numéro
  `FAC-…` sous le titre « Avoir ».

### Ce qui a été vérifié

- lint, `tsc`, build ; migration 0024 appliquée sur la base de test (réglage
  à 72, type `retenue` refusé). Parcours complet : **26 étapes, toutes OK**
  (code 0), `reference.ts` inchangé. Par étape : conversion 51, tarification
  209, blocage 42, paiement 69, courriels 41, « Ma réservation » 22, solde 61,
  **factures 38**, annulation 47 (avoir `FAC-…`), caution par carte 86,
  virement 47, abandons 22, avis 59, back-office 107, réservations 86, tarifs
  93, calendrier 111, statistiques 28, deux parcours et URL signées sans
  échec, contrôles en base 83, contrôles des PDF 120, `db:verify` 268.
- Le premier passage du parcours a échoué à `db:verify`, qui attendait encore
  48 heures : contrôle corrigé, parcours rejoué en entier.

### Ce qui n'a PAS été vérifié

- La migration 0024 sur la base réelle (étape 2, par le gérant).
- Un contrat imprimé avec « 72 heures » lu à l'écran : les deux réservations
  de référence gardent 48 heures (recopié à leur création) ; le chiffre vient
  du réglage, contrôlé à 72 par `db:verify`.

---

## Avant le premier client réel

Cette liste a **déménagé** dans `docs/06-avant-premier-client.md`, son seul
domicile. Elle y est tenue à jour, avec pour chaque point la raison, l'action
attendue, la phase concernée et **qui peut le lever** (voir
`docs/05-protocole-phase.md`, règle 1 : un fait, un seul domicile).
