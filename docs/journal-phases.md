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

## Avant le premier client réel

Cette liste a **déménagé** dans `docs/06-avant-premier-client.md`, son seul
domicile. Elle y est tenue à jour, avec pour chaque point la raison, l'action
attendue, la phase concernée et **qui peut le lever** (voir
`docs/05-protocole-phase.md`, règle 1 : un fait, un seul domicile).
