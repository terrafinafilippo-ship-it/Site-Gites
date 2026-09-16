# Protocole de phase — comment se mène une phase

> Ce fichier est mis à jour quand la **méthode** change, pas quand le projet
> avance. Le lire **en entier** à l'ouverture de chaque phase.

Ce document remplace le cadrage qui se faisait auparavant dans une discussion
séparée. À partir de la Phase 2, tout se passe ici : les décisions, la
structuration des phases et l'exécution. Ce protocole est ce qui rend ce mode
tenable.

---

## Les deux règles de fond

### Règle 1 — Un fait, un seul domicile

**Une information n'existe qu'à un seul endroit du dépôt. Partout ailleurs, on
y renvoie.**

Cela vaut pour la documentation comme pour le code :

- un montant de caution vit dans la table `gites`, pas aussi en dur dans une
  page ;
- l'identité légale vit dans `lib/constantes.ts`, pas aussi dans trois
  composants PDF ;
- le périmètre d'une phase vit dans `docs/phases/phase-N.md`, pas aussi dans
  `docs/01-plan-execution.md` ;
- la checklist bloquante vit dans `docs/06-avant-premier-client.md`, pas aussi
  dans `docs/journal-phases.md`.

**Pourquoi.** Une information dupliquée **diverge à la première mise à jour** :
quelqu'un corrige une copie, ignore l'autre, et rien ne le signale. À partir de
là, deux versions coexistent et **plus personne ne sait laquelle fait foi**. Le
coût n'est pas la place perdue, c'est la confiance : une doc qui se contredit ne
sert plus à rien, et on recommence à lire le code pour chaque question.

**En pratique.** Avant d'écrire une information dans un fichier, chercher si
elle existe déjà ailleurs. Si oui : ne pas la recopier, y renvoyer. Si elle doit
changer de domicile : la **déplacer**, et laisser un renvoi d'une ligne à
l'ancien endroit.

**Pointer n'est pas dupliquer.** Un renvoi d'une ligne ne contient aucune
donnée : il ne peut pas diverger. La règle interdit de **recopier** un fait, pas
d'y **pointer** — et un fait que personne n'est conduit à lire est aussi
inopérant qu'un fait absent.

**Application obligatoire : les échéances anticipées.** Toute entrée de
`docs/06-avant-premier-client.md` dont l'échéance est **antérieure** à la phase
qui la traite porte un renvoi d'une ligne dans la fiche de la phase **qu'elle
précède** (`docs/phases/phase-N.md`). Raison : l'étape 1 fait ouvrir
`CLAUDE.md`, ce protocole et la fiche de la phase — rien n'y oblige à ouvrir
`06`. Sans ce renvoi, la session qui démarre la phase ne voit pas le point. Le
renvoi nomme le point et son numéro ; le contenu reste dans `06`.

Deux écarts à cette règle sont déjà ouverts dans le code et documentés : E-7
(identité recopiée dans les PDF) et la caution affichée en dur sur le site
(Phase 2).

### Règle 2 — La règle de garde

**Proposer et exécuter dans la même session supprime le regard extérieur.**
Personne ne relit la décision avant qu'elle ne devienne du code. C'est le prix
de la vitesse, et il se paie en erreurs qu'aucune relecture n'aura filtrées.

**Compensation obligatoire.** Avant d'exécuter une décision structurante, écrire
noir sur blanc, dans la conversation :

1. **ce qui pourrait mal tourner** — le scénario concret, pas une réserve
   générale ;
2. **ce qui rendrait la décision inverse préférable** — la condition qui, si
   elle était vraie, ferait choisir l'autre option.

Si on ne parvient pas à écrire le point 2, c'est le signe qu'on n'a pas vraiment
comparé les options : on a justifié un choix déjà fait.

---

## La séquence, à respecter à chaque phase

### 1. Lire

`CLAUDE.md`, la fiche `docs/phases/phase-N.md`, et les fichiers de `docs/`
concernés par le sujet de la phase.

### 2. Lire le code réellement présent — avant toute proposition

**Ne jamais se fier à une description**, y compris à celle d'un document de ce
dépôt. En Phase 1, **trois éléments du cadrage étaient faux** par rapport au
code réel. Un cadrage décrit une intention ; le code décrit l'état.

Concrètement : ouvrir les fichiers que la phase va toucher, lire les commentaires
d'en-tête (ils portent les décisions et les pièges), et vérifier les affirmations
du cadrage une par une.

### 3. Présenter les décisions ouvertes — et attendre

Les présenter en **options numérotées**, avec :
- une **recommandation** explicite ;
- pour chaque option, la **cause à effet en une phrase** — ce qui arrive si on
  la choisit.

Puis **attendre l'arbitrage**.

**Ne jamais trancher seul une décision qui engage le métier, le droit ou
l'argent.** Une décision technique se rattrape par une refonte ; une décision
juridique mal prise se découvre chez un client, et une décision commerciale mal
prise coûte des réservations.

### 4. Signaler avant d'exécuter

Sans qu'on ait à le demander : **failles de sécurité, incohérences logiques,
angles morts, coûts d'opportunité**. Y compris quand cela remet en cause le
cadrage qu'on vient de recevoir. Un problème signalé après coup n'a servi à rien.

### 5. Confirmer le plan

La liste des fichiers **créés, modifiés, supprimés**, et ce que chacun contiendra.
Attendre la validation.

### 6. Exécuter en commits atomiques

Un commit = un changement cohérent, qui **compile**. Un commit qui ne compile pas
n'est pas un point de retour : on ne peut pas y revenir, donc il ne sert à rien.
Regrouper plutôt que de livrer un commit cassé.

Le message dit **pourquoi**, pas seulement quoi.

### 7. Vérifier

Dans cet ordre :

```bash
npm run lint
npx tsc --noEmit
npm run build
bash scripts/parcours/lancer.sh
```

**Un test qui passe doit prouver ce qu'il annonce.** Vérifier le **message
d'erreur**, pas seulement le code de retour. En Phase 1, un test de péremption de
lien passait pour la mauvaise raison : le chemin transmis au calcul de signature
était corrompu par la conversion automatique des chemins de Git Bash. Le test
était vert et ne démontrait rien.

Ouvrir les PNG de `.parcours/png/` après toute modification du rendu des PDF :
les contrôles automatiques vérifient le contenu, pas la mise en page.

### 8. Rapport final

- les **fichiers touchés** ;
- le **résultat de chaque vérification** — le vrai, y compris les échecs ;
- les **écarts** entre ce qui était prévu et ce qui a été fait ;
- les **points restants** ;
- les **angles morts** identifiés en chemin.

Un rapport qui n'annonce que des succès est un rapport incomplet.

### 9. Mettre à jour la documentation

**Une phase n'est close que quand la documentation reflète l'état réel.**

| Fichier | Quand le toucher |
|---|---|
| `docs/journal-phases.md` | **Toujours** — ce qui a été fait, les valeurs de référence, les points reportés |
| `docs/01-plan-execution.md` | **Toujours** — l'état de la phase, rien d'autre |
| `docs/02-decisions.md` | Si une décision structurante a été prise ou revue |
| `docs/03-conformite.md` | Si une obligation ou un écart a bougé |
| `docs/04-architecture.md` | Si le code a changé de forme (table, route, convention) |
| `docs/06-avant-premier-client.md` | Si un point bloquant a été levé ou découvert |
| `docs/phases/phase-N.md` | À l'ouverture de la phase, pour la compléter |
| `CLAUDE.md` | Rarement — seulement si une règle absolue ou une commande change |

Respecter la **règle 1** en le faisant : ne pas recopier dans l'un ce qui vit
dans l'autre.

---

## Aide-mémoire des pièges déjà rencontrés

| Piège | Vécu en | Parade |
|---|---|---|
| Un cadrage décrit le code de mémoire, et se trompe | Phase 1 (3 éléments) | Étape 2 : lire le code avant de proposer |
| Un test vert qui ne prouve rien (chemin corrompu par Git Bash) | Phase 1 | Étape 7 : lire le message d'erreur |
| Un montant en flottant qui perd un centime | Phase 1, session B | `npm run verify:centimes` |
| Un repli silencieux par conception (logo absent) | Phase 1, session B | Contrôle visuel des PDF après déploiement |
| Une information recopiée à deux endroits qui divergent | Phase A (3 cas) | Règle 1 |
| Un document qui annonce un mécanisme inexistant | Phase 1 (signature « avancée »), en cours (Swikly, sauna) | Décrire exactement ce qui existe |
