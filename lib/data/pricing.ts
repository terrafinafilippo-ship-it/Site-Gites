// Grille tarifaire des fiches gîtes.
//
// UNE SEULE LIGNE VIENT DE LA BASE : la basse saison, lue dans
// gites.tarif_semaine_base. Les trois autres saisons sont un legs du site
// d'origine (script inline de gite.html) et restent en code jusqu'à la Phase 5,
// qui introduira un vrai modèle de saisons en base.
//
// Pourquoi la basse saison et pas une autre : elle est le prix plancher, donc
// celui qu'annoncent tous les « Dès … » du site. Deux sources pour le même
// chiffre sur la même page, c'est la garantie d'afficher deux prix différents
// dès la première modification (voir docs/02-decisions.md, D-15).
//
// MONTANTS EN CENTIMES ENTIERS (règle 3 de CLAUDE.md), comme partout ailleurs
// en mémoire : 67000 = 670,00 €.
import type { GiteId } from "./gites";

export interface LigneTarif {
  saison: string;
  /** Prix de la semaine, en CENTIMES entiers. */
  semaineCentimes: number;
  periode: string;
}

/** Libellé et période de la ligne dont le montant vient de la base. */
const BASSE_SAISON = { saison: "Basse", periode: "Janv. · Fév. · Nov." };

/** Saisons hors basse — legs du site d'origine, en attente du modèle de la Phase 5. */
const SAISONS_HORS_BASSE: Record<GiteId, LigneTarif[]> = {
  laphine: [
    { saison: "Moyenne", semaineCentimes: 78000,  periode: "Mars · Avril · Mai · Oct." },
    { saison: "Haute",   semaineCentimes: 92000,  periode: "Juin · Juillet · Août · Sept." },
    { saison: "Fêtes",   semaineCentimes: 105000, periode: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
  armu: [
    { saison: "Moyenne", semaineCentimes: 56000, periode: "Mars · Avril · Mai · Oct." },
    { saison: "Haute",   semaineCentimes: 69000, periode: "Juin · Juillet · Août · Sept." },
    { saison: "Fêtes",   semaineCentimes: 82000, periode: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
  "maison-vieille": [
    { saison: "Moyenne", semaineCentimes: 82000,  periode: "Mars · Avril · Mai · Oct." },
    { saison: "Haute",   semaineCentimes: 96000,  periode: "Juin · Juillet · Août · Sept." },
    { saison: "Fêtes",   semaineCentimes: 109000, periode: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
};

/**
 * Grille complète d'un gîte, basse saison en tête.
 *
 * `null` si `tarifSemaineBase` est absent (valeur non saisie, ou base
 * injoignable) : on masque la grille ENTIÈRE plutôt que sa première ligne. Une
 * grille amputée de sa basse saison ferait passer la moyenne saison pour le
 * prix plancher — un chiffre faux, pas une information partielle.
 */
export function construireGrille(
  slug: GiteId,
  tarifSemaineBase: number | null,
): LigneTarif[] | null {
  if (tarifSemaineBase === null) return null;
  return [{ ...BASSE_SAISON, semaineCentimes: tarifSemaineBase }, ...SAISONS_HORS_BASSE[slug]];
}

/**
 * Prix plancher affiché (« Dès … ») : le MINIMUM de la grille, et non la ligne
 * basse saison lue directement.
 *
 * La page devient cohérente par construction — elle ne peut pas annoncer un
 * plancher supérieur à une cellule de sa propre grille — au même titre que
 * solde = total − acompte en Phase 1. Tant que les données sont saines, ce
 * minimum EST la basse saison.
 */
export function prixPlancher(lignes: LigneTarif[]): number {
  return Math.min(...lignes.map((l) => l.semaineCentimes));
}

/** Prix plancher d'un gîte, ou `null` si sa grille est masquée. */
export function plancherDuGite(slug: GiteId, tarifSemaineBase: number | null): number | null {
  const grille = construireGrille(slug, tarifSemaineBase);
  return grille ? prixPlancher(grille) : null;
}
