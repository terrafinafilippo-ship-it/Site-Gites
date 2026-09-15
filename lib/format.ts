// Helpers de formatage partagés (dates FR, heures FR, nuits, arrondis, euros).

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Affichage d'un montant en euros, ex. "1 234,56 €".
 * SEUL point de passage calcul → affichage : utilisé par les trois composants
 * PDF et par la page de signature. Une conversion du modèle interne en
 * centimes entiers se fera ici (n / 100) et nulle part ailleurs.
 */
export const fmtEuro = (n: number): string =>
  n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';

export const fmtDateFr = (iso: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// Accepte "18:00" comme "18:00:00" (type `time` PostgreSQL) : seuls les deux
// premiers champs sont lus.
export const fmtHeureFr = (hhmm: string): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  return `${parseInt(h, 10)} h ${m}`;
};

export const computeNbNuits = (arrivee: string, depart: string): number => {
  if (!arrivee || !depart) return 0;
  const a = new Date(arrivee);
  const d = new Date(depart);
  return Math.round((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

export const minusDaysFr = (iso: string, days: number): string => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
