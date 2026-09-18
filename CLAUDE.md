# Les Gîtes de Samoyas — instructions permanentes

Location de trois gîtes dans le hameau de Samoyas, à Savas (Ardèche, 07),
exploités par Patricia et Nicolas Terrafina. Entité légale : **SARL DE LA VOUTE**.
Le site existe pour faire réserver **en direct** et réduire la dépendance aux
plateformes (Gîtes de France, Airbnb) et à leurs commissions. Une seule
application porte le site vitrine, le tunnel de réservation, la génération des
contrats et des factures, et la signature électronique.

## Stack

Next.js 15 (App Router, React 19, TypeScript) · PostgreSQL 17 + Drizzle ORM ·
`@react-pdf/renderer` pour les PDF · VPS OVH administré par Coolify.

## Commandes

```bash
npm run dev              # serveur de développement (port 3000)
npm run build            # build de production
npm run lint             # ESLint
npx tsc --noEmit         # contrôle de types (pas de script dédié)

npm run db:generate      # génère une migration SQL depuis db/schema/
npm run db:migrate       # applique les migrations en attente
npm run db:seed          # insère ou remet à jour les trois gîtes
npm run db:verify        # auto-vérification de la base (tout est annulé par ROLLBACK)
npm run verify:centimes  # aller-retour centimes <-> texte numeric (51 cas)

bash scripts/parcours/lancer.sh   # non-régression complète (contrat, signature, factures)
```

Le parcours de non-régression exige la base de **test** et un serveur à part :

```bash
DB_CIBLE=test npm run db:migrate && DB_CIBLE=test npm run db:seed
DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx next dev -p 3001
```

## Règles absolues

Chaque règle est suivie de ce qui se passe si elle est violée.

1. **Numérotation des documents légaux sans trou ni doublon** (art. 289 CGI).
   Un numéro s'obtient uniquement par la fonction SQL `prochain_numero`, dans la
   même transaction que l'écriture de la ligne. Jamais de `SEQUENCE`, jamais de
   numéro construit en JavaScript, jamais de suppression d'une facture.
   *Violation : un trou dans la suite est lu en contrôle fiscal comme une facture
   dissimulée. Amende, et impossibilité de prouver le contraire.*

2. **Ne jamais modifier une migration déjà appliquée.** On en écrit une nouvelle.
   *Violation : la base réelle et `db/migrations/` divergent en silence. La
   prochaine restauration de sauvegarde produit un schéma différent de celui du
   code, et on ne s'en aperçoit qu'en production.*

3. **Un montant est un ENTIER DE CENTIMES** en mémoire et dans tous les calculs
   (576,66 € = `57666`). Les deux seules conversions autorisées sont
   `centimesDepuisNumeric` et `numericDepuisCentimes` (`lib/centimes.ts`), qui
   travaillent par découpage de chaîne. **Jamais `× 100` ni `/ 100` sur un
   montant** (le `/ 100` de `lib/montants.ts` porte sur un *taux*, pas un montant).
   *Violation : `457.30 * 100` vaut `45729.999…` en flottant. Un centime d'écart
   sur une facture émise est une facture fausse, qui ne se corrige que par un avoir.*

4. **ACOMPTE, jamais « arrhes ».** Le mot est juridique, pas cosmétique
   (art. 5.2 du contrat, art. 1590 C. civ.).
   *Violation : des arrhes autorisent le client à se dédire en abandonnant la
   somme versée, et le bailleur à annuler en remboursant le double. Un seul mot
   change qui supporte le risque d'annulation.*

5. **L'entité légale est SARL DE LA VOUTE** (`lib/constantes.ts`, `EMETTEUR`) —
   « Les Gîtes de Samoyas » n'est qu'une enseigne. Attention : ces valeurs sont
   aujourd'hui **recopiées en dur** dans les trois composants PDF, qui n'importent
   pas `EMETTEUR` (écart E-7 de `docs/03-conformite.md`).
   *Violation : une facture émise sous une identité qui n'est pas celle du
   redevable n'est pas une facture régulière (art. L.441-9 C. com.).*

6. **Aucun secret dans un fichier suivi par git.** On versionne le *nom* des
   variables (`.env.example`), jamais leur valeur. Aucun secret ne porte le
   préfixe `NEXT_PUBLIC_`.
   *Violation : un secret poussé sur GitHub est public pour toujours, y compris
   après suppression du commit. Il faut le révoquer, pas l'effacer.*

7. **Rejouer `bash scripts/parcours/lancer.sh` avant de clore une phase**, et
   lire ce que chaque étape affiche. Les montants attendus vivent dans
   `scripts/parcours/reference.ts` : ils ne changent que sur décision métier
   explicite, jamais pour faire passer un test.
   *Violation : une régression de facturation ne se voit pas à l'œil nu et se
   découvre sur la facture d'un vrai client.*

## Où trouver quoi

| Fichier | Contenu |
|---|---|
| `docs/00-projet.md` | Le contexte métier : l'activité, les trois gîtes, qui sont Patricia et Nicolas. À lire avant toute décision qui touche au commercial. |
| `docs/01-plan-execution.md` | L'état des phases 0 à 7 et leurs dépendances. Une ligne par phase, renvoi à sa fiche. |
| `docs/02-decisions.md` | Le registre des décisions structurantes, avec le **pourquoi** et ce qu'on casse en revenant dessus. |
| `docs/03-conformite.md` | Les obligations légales, où elles sont implémentées, comment on vérifie, et les écarts connus. |
| `docs/04-architecture.md` | La réalité technique : infra, tables, modèle monétaire, routes, stockage, tests. |
| `docs/05-protocole-phase.md` | Comment se mène une phase, de la lecture du code au rapport final. |
| `docs/06-avant-premier-client.md` | La checklist bloquante avant qu'un vrai client signe, avec qui peut lever chaque point. |
| `docs/phases/phase-N.md` | La fiche d'une phase : objectif, périmètre inclus et **exclu**, critères d'acceptation. |
| `docs/journal-phases.md` | L'historique de ce qui a été fait, phase par phase. Écrit à la clôture, jamais réécrit. |
| `docs/contrat-template.md` | Le contrat de location rédigé en clair (source de rédaction, pas d'exécution). |
| `docs/facture-template.md` | Les factures rédigées en clair (même statut). |
| `db/README.md` | La base : tables, migrations, seed, restauration de sauvegarde, numérotation. |
| `scripts/parcours/README.md` | Le parcours de non-régression : ce qu'il vérifie, comment le lancer. |

## Protocole de phase (résumé)

1. Lire `CLAUDE.md`, la fiche `docs/phases/phase-N.md`, et **le code réellement présent**.
2. Présenter les décisions ouvertes en options numérotées, avec recommandation, et **attendre l'arbitrage**.
3. Signaler failles, incohérences et angles morts **avant** d'exécuter, sans qu'on le demande.
4. Confirmer le plan de fichiers, puis exécuter en commits atomiques qui compilent.
5. Vérifier (lint, `tsc --noEmit`, build, parcours), rapporter, puis mettre la documentation à jour.

**Le détail complet — la règle « un fait, un seul domicile », la règle de garde,
et la règle « aucune formulation commerciale inventée par une session » — est
dans `docs/05-protocole-phase.md`. Le lire en entier à l'ouverture de chaque
phase.**
