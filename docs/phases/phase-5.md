# Phase 5 — Back-office Patricia et Nicolas

> Fiche à **compléter à l'ouverture de la phase**. Ce qui suit est le cadre.

**Dépendances :** Phase 2 close. **Parallélisable** avec les phases 3 et 4 : ne
dépend que de la lecture en base, pas du paiement.

---

## Objectif

Rendre l'exploitation autonome. Toute valeur que Patricia et Nicolas ont besoin
de changer doit être un **champ de formulaire**, pas une constante dans un
fichier. Voir `docs/00-projet.md` § 5.

Le back-office statique `admin/` a été **supprimé en Phase 2** (commit
`e341c01`). Ses neuf maquettes restent lisibles dans l'historique et servent de
référence d'intention, pas de code à reprendre :

```bash
git show e341c01^:admin/tarifs.html
```

---

## Périmètre inclus

Une application Next.js protégée par **authentification** :

1. **Réservations** — liste, fiche, modification.
2. **Calendrier** des trois gîtes, avec blocage manuel de nuits.
3. **Tarifs**, y compris le **modèle de saisons qui n'existe pas encore en
   base** : la table `gites` ne porte que `tarif_semaine_base` et
   `tarif_weekend`, alors que le site affiche quatre saisons
   (`lib/data/pricing.ts`). Ce modèle est à créer ici, et il **absorbe**
   `tarif_semaine_base`, définie en Phase 2 comme le tarif de basse saison
   (D-15). Aujourd'hui, seule cette cellule vient de la base ; les trois autres
   saisons sont encore en code.

   **Question à poser aux propriétaires au cadrage :** pensent-ils leurs prix
   comme **un plancher en basse saison**, majoré ensuite, ou comme **une base de
   référence** à laquelle s'appliquent des coefficients ? La réponse détermine la
   forme du modèle. Elle ne remet pas en cause la cellule branchée en Phase 2.
4. **Fiches des gîtes** — les scalaires métier (voir l'architecture hybride de
   la fiche Phase 2).
5. **Documents** — retrouver et renvoyer contrats et factures.
6. **Bons cadeaux.**
7. **Libellé des options**, reporté depuis la Phase 1 : point 1 de
   `docs/06-avant-premier-client.md`. Ajouter le libellé en base **et**
   l'afficher dans les trois composants PDF et sur la page de signature — la
   moitié du travail ne lève pas le point.

---

## Périmètre EXCLU

Les contenus publics et le légal (Phase 6), la synchronisation des calendriers
avec les plateformes (Phase 7), tout ce qui touche au paiement (Phases 3 et 4).

---

## Critères d'acceptation

1. **Patricia modifie un tarif sans toucher au code**, et la modification
   apparaît sur le site dans les 60 secondes — délai du cache de
   `lib/gites-publics.ts` (Phase 2, D-13). L'enregistrement devrait appeler
   `revalidateTag('gites')`, qui rend la modification visible **immédiatement**
   au lieu d'attendre l'expiration : l'étiquette est déjà posée.
2. Le back-office est inaccessible sans authentification — vérifié en appelant
   directement une URL d'administration.
3. Une option nommée en back-office apparaît sous son libellé réel sur le
   contrat, les deux factures et la page de signature.
4. `bash scripts/parcours/lancer.sh` passe toujours.

---

## Point de vigilance

`npm run db:seed` **remet les paramètres descriptifs des gîtes aux valeurs de
`db/seed.ts`** (nom, adresse, capacité, ménage, caution, tarifs, taux de taxe).
Une valeur modifiée en back-office sera **écrasée** au prochain seed si elle
n'est pas reportée dans le fichier. À traiter explicitement dans cette phase :
c'est un piège silencieux, et il vise précisément le geste que la phase rend
possible.

---

## Deux points hérités de la Phase 2

**Le drapeau `actif` de la table `gites` n'a aucun effet sur le site.** Les trois
gîtes s'affichent qu'il soit vrai ou faux. Décider ce qu'il doit produire —
masquer la fiche, la laisser visible mais non réservable, la retirer du
formulaire de contact — est un choix commercial, à trancher ici avec les
propriétaires. Tant qu'il ne fait rien, personne ne doit croire qu'il retire un
gîte de la vente.

**Le nom et la référence Gîtes de France vivent à deux endroits**, en base et
dans `lib/data/gites.ts`. C'est volontaire : ce sont eux qui permettent
d'afficher une fiche quand la base ne répond pas. `lib/gites-publics.ts`
journalise une ligne `INCOHÉRENCE` si les valeurs divergent. Si le back-office
rend ces champs modifiables, il faudra reporter la modification dans le code —
ou décider que la fiche dégradée n'affiche plus de nom.
