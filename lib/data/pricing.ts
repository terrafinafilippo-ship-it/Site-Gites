import type { GiteId } from "./gites";

/** Grilles tarifaires par gîte — extraites du script inline de gite.html. */
export interface PriceRow {
  season: string;
  week: number;
  period: string;
}

export const PRICES_BY_GITE: Record<GiteId, PriceRow[]> = {
  laphine: [
    { season: "Basse",   week: 670,  period: "Janv. · Fév. · Nov." },
    { season: "Moyenne", week: 780,  period: "Mars · Avril · Mai · Oct." },
    { season: "Haute",   week: 920,  period: "Juin · Juillet · Août · Sept." },
    { season: "Fêtes",   week: 1050, period: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
  larmu: [
    { season: "Basse",   week: 450, period: "Janv. · Fév. · Nov." },
    { season: "Moyenne", week: 560, period: "Mars · Avril · Mai · Oct." },
    { season: "Haute",   week: 690, period: "Juin · Juillet · Août · Sept." },
    { season: "Fêtes",   week: 820, period: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
  maisonvieille: [
    { season: "Basse",   week: 690,  period: "Janv. · Fév. · Nov." },
    { season: "Moyenne", week: 820,  period: "Mars · Avril · Mai · Oct." },
    { season: "Haute",   week: 960,  period: "Juin · Juillet · Août · Sept." },
    { season: "Fêtes",   week: 1090, period: "Vacances scolaires · 24 déc. → 2 janv." },
  ],
};
