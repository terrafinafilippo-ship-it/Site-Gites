// Helpers de formatage partagés (dates FR, heures FR, nuits, euros).

import { numericDepuisCentimes } from '@/lib/centimes';

/**
 * Affichage d'un montant en euros à partir de CENTIMES ENTIERS :
 * 57666 → "576,66 €", 123456 → "1 234,56 €", -1230 → "-12,30 €".
 *
 * SEUL point de passage calcul → affichage : utilisé par les trois composants
 * PDF et par la page de signature. Le montant passe par numericDepuisCentimes
 * (lib/centimes.ts) puis n'est manipulé que comme texte : aucune division.
 */
export const fmtEuro = (centimes: number): string => {
  const texte = numericDepuisCentimes(centimes); // ex. "-1234.56"
  const negatif = texte.startsWith('-');
  const [entiers, decimales] = (negatif ? texte.slice(1) : texte).split('.');
  // Groupement des milliers à la française (espace fine insécable).
  const entiersGroupes = Number(entiers).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  return `${negatif ? '-' : ''}${entiersGroupes},${decimales} €`;
};

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
