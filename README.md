# Les Gîtes de Samoyas

Site de réservation **en direct** des trois gîtes du hameau de Samoyas, à Savas
(Ardèche) : LaPhine, L'Armu et La Maison Vieille. Exploitation : Patricia et
Nicolas Terrafina — entité légale **SARL DE LA VOUTE**.

Une seule application porte le site vitrine, le tunnel de réservation, la
génération des contrats et des factures, et la signature électronique.

**Next.js 15** (App Router, React 19, TypeScript) · **PostgreSQL 17** + Drizzle ·
`@react-pdf/renderer` pour les PDF · VPS OVH administré par Coolify.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs (jamais commitées)
npm run dev                  # http://localhost:3000
```

Le site démarre sans base : les pages publiques affichent alors leur contenu
sans les chiffres (prix, capacités). Pour travailler avec des données, il faut
une base joignable — voir `db/README.md` et, pour l'accès au serveur,
`docs/04-architecture.md` § 9.

```bash
npm run build            # build de production (n'exige aucune base)
npm run lint
npx tsc --noEmit

npm run db:migrate       # applique les migrations
npm run db:seed          # insère ou remet à jour les trois gîtes
npm run db:verify        # auto-vérification (tout est annulé par ROLLBACK)
npm run verify:centimes  # aller-retour centimes <-> texte numeric

bash scripts/parcours/lancer.sh   # non-régression : contrat, signature, factures
```

Les commandes de base visent la base **réelle** par défaut. `DB_CIBLE=test` les
fait travailler sur `gites_test` : c'est là que se font les essais, jamais sur
la base réelle.

## Structure

| Dossier | Contenu |
|---|---|
| `app/` | Routes App Router : pages publiques, tunnel `reserver/`, signature `signer/`, suivi `suivi/`, API `api/` |
| `components/` | Composants d'interface (`ui/`, `layout/`) et composants PDF (`pdf/`) |
| `lib/` | Modèle monétaire (`centimes.ts`), calculs (`montants.ts`), lecture publique des gîtes (`gites-publics.ts`), constantes légales (`constantes.ts`), données rédactionnelles (`data/`) |
| `db/` | Schéma Drizzle, migrations, seed, vérification |
| `scripts/parcours/` | Parcours de non-régression de bout en bout |
| `docs/` | Contexte métier, décisions, conformité, architecture, fiches de phase |
| `public/assets/` | Logos servis par l'application |

## Deux règles qui surprennent

1. **Un montant est un entier de centimes** partout en mémoire. Les seules
   conversions autorisées sont `centimesDepuisNumeric` et `numericDepuisCentimes`
   (`lib/centimes.ts`) : jamais `× 100` ni `/ 100`.
2. **Les chiffres des gîtes viennent de la base**, pas du code. Une page qui
   affiche un prix, une capacité, une caution ou un taux les lit par
   `lib/gites-publics.ts`. Si la base ne répond pas, ces chiffres disparaissent
   et la page reste affichée : c'est voulu.

Le détail vit dans `CLAUDE.md` (règles absolues) et dans `docs/`.

## Photos

Les emplacements d'images sont des composants `<ImageSlot>` qui affichent une
légende de remplacement. Les vraies photos restent à intégrer (Phase 6).
