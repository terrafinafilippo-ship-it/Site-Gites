# Plan d'exécution — état des phases et dépendances

> Ce fichier est mis à jour **à la clôture de chaque phase** : on y change l'état
> et rien d'autre. Le périmètre détaillé d'une phase vit dans sa fiche
> `docs/phases/phase-N.md`, jamais ici. Ce qui a été fait vit dans
> `docs/journal-phases.md`, jamais ici.

---

## État

| Phase | Objet | État | Fiche |
|---|---|---|---|
| 0 | Fondation données | **Close** — 14 septembre 2026 | — |
| 1 | Fusion du module contrat + modèle monétaire | **Close** — 16 septembre 2026 | — |
| A | Référentiel du projet dans le dépôt | **Close** — 17 septembre 2026 | ce document |
| 2 | Assainissement et connexion du site | **Close** — 18 septembre 2026 | `docs/phases/phase-2.md` |
| 3 | Moteur de réservation | À ouvrir | `docs/phases/phase-3.md` |
| 4 | Cycle de paiement complet | À ouvrir | `docs/phases/phase-4.md` |
| 5 | Back-office Patricia et Nicolas | À ouvrir | `docs/phases/phase-5.md` |
| 6 | Contenus, légal, SEO | À ouvrir | `docs/phases/phase-6.md` |
| 7 | Synchronisation iCal V1, recette, go-live | À ouvrir | `docs/phases/phase-7.md` |

---

## Dépendances

```
  A  ─────────────────────────────────────────────►  (préalable à tout)
  │
  └─►  2  ─►  3  ─►  4
       │
       ├─►  5  ──────────┐
       │                 ├─►  7   (en dernier)
       └─►  6  ──────────┘
```

- **A avant tout.** Sans référentiel dans le dépôt, chaque session repart de
  zéro et re-décide ce qui a déjà été décidé.
- **2 → 3 → 4 en séquence.** La Phase 3 branche le tunnel de réservation sur la
  base ; elle suppose que la lecture en base fonctionne déjà (Phase 2). La
  Phase 4 prélève le solde sur la carte enregistrée à l'acompte ; sans acompte
  réel (Phase 3), il n'y a pas de carte.
- **5 et 6 dès la fin de la 2**, en parallèle des phases 3 et 4. Elles ne
  dépendent que de la lecture en base, pas du paiement.
- **7 en dernier.** La synchronisation des calendriers et la recette supposent
  que tout le reste existe.

**Conséquence pratique :** si la Phase 3 s'éternise, les phases 5 et 6 peuvent
avancer sans elle. Si la Phase 2 bloque, tout bloque.

---

## Ce qui a été livré

Le détail, les valeurs de test et les points reportés sont dans
`docs/journal-phases.md`.

### Phase 0 — Fondation données (close le 14 septembre 2026)

Base PostgreSQL 17 reconstruite depuis zéro sur le VPS, pilotée par Drizzle
depuis `db/` : dix tables, deux migrations versionnées, seed des trois gîtes,
script d'auto-vérification (`npm run db:verify`, toutes les écritures annulées).
Numérotation légale sans trou par table compteur et fonction SQL. Triggers
d'immutabilité des signatures et de mise à jour automatique.

### Phase 1 — Fusion du module contrat (close le 16 septembre 2026)

Deux sessions, commits `c77d1ee` → `40ca9a3`, fusionnées dans `main` par la
pull request #3.

**Session A** — l'ancien dépôt `Logiciel-contrat-` est absorbé dans le site :
trois routes API (`/api/contrats`, `/api/contrats/signer`, `/api/factures`),
page publique de signature `/signer/[token]`, trois composants PDF, stockage
des PDF sur disque avec accès par URL signée à durée limitée, base de test
`gites_test` pour ne consommer aucun numéro légal en test.

**Session B** — modèle monétaire en **centimes entiers** avec deux fonctions de
frontière ; ligne « Options » sur les documents ; logo lu sur le disque ;
instantané de facture auto-décrit ; garde d'émission acompte + solde = total ;
scripts de non-régression (`scripts/parcours/`) versionnés.

### Phase A — Référentiel du projet (close le 17 septembre 2026)

Création de `CLAUDE.md` et de `docs/00` à `docs/06`, plus une fiche par phase
restante. Aucune ligne de code applicatif. Objet : rendre le dépôt
auto-suffisant, pour que la conduite du projet se fasse entièrement dans
Claude Code à partir de la Phase 2.

Trois contradictions entre le code, le journal et les documents ont été
trouvées à cette occasion et inscrites dans `docs/06-avant-premier-client.md` :
identité du bailleur, médiateur de la consommation, article 12 du contrat
(sauna).
