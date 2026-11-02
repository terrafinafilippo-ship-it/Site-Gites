// Arithmétique sur les DATES CIVILES « aaaa-mm-jj » (arrivée, départ, nuits,
// bornes des périodes tarifaires).
//
// Tout est calculé en UTC, sur l'instant de minuit de chaque date : l'UTC n'a
// pas de changement d'heure, donc un jour y dure toujours exactement 24 h et
// « ajouter 1 jour » ne peut jamais sauter ni répéter une date, ce qui arrive
// en heure de Paris la nuit du passage à l'heure d'été. Ces dates ne sont pas
// des instants : aucune n'est jamais affichée ni comparée en heure locale.

const MS_PAR_JOUR = 86_400_000;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Instant UTC de minuit d'une date civile. Lève une erreur sur un format
 * inattendu ou une date impossible (« 2027-02-30 ») : une date fausse ne doit
 * jamais être silencieusement décalée au mois suivant.
 */
export function jourUtc(iso: string): number {
  const m = DATE_ISO.exec(iso);
  if (!m) throw new Error(`date attendue au format aaaa-mm-jj, reçu « ${iso} »`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new Error(`date impossible « ${iso} »`);
  }
  return ms;
}

/** Date civile située `n` jours après (ou avant, si `n` est négatif) `iso`. */
export function ajouterJours(iso: string, n: number): string {
  return new Date(jourUtc(iso) + n * MS_PAR_JOUR).toISOString().slice(0, 10);
}

/** Jour de la semaine à la norme ISO : 1 = lundi … 6 = samedi, 7 = dimanche. */
export function jourSemaineIso(iso: string): number {
  const j = new Date(jourUtc(iso)).getUTCDay();
  return j === 0 ? 7 : j;
}

/** Nombre de nuits entre une arrivée et un départ (négatif si le départ précède). */
export function nombreDeNuits(arrivee: string, depart: string): number {
  return (jourUtc(depart) - jourUtc(arrivee)) / MS_PAR_JOUR;
}

/** Premier jour du mois de `iso`, décalé de `decalageMois` mois (« 2026-10-15 », 3 → « 2027-01-01 »). */
export function premierJourDuMois(iso: string, decalageMois = 0): string {
  const d = new Date(jourUtc(iso));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalageMois, 1)).toISOString().slice(0, 10);
}

/** Date civile du jour à Paris, au format aaaa-mm-jj. */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}

/** Heure à Paris d'un instant, au format hh:mm (« 18:05 »), heure d'été comprise. */
export function heureParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(maintenant);
}

export const NOMS_JOURS_ISO = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
] as const;

/** Nom français d'un jour ISO (1 → « lundi »). */
export function nomJourIso(jour: number): string {
  const nom = NOMS_JOURS_ISO[jour - 1];
  if (!nom) throw new Error(`jour ISO attendu entre 1 et 7, reçu ${jour}`);
  return nom;
}
