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

- Le site vitrine (`lib/data/gites.ts`) utilise encore les slugs `larmu` et
  `maisonvieille` : à aligner sur `armu` / `maison-vieille`.
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
