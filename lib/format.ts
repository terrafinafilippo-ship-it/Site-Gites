// Helpers de formatage partagés (dates FR, heures FR, nuits, euros).

import { numericDepuisCentimes } from '@/lib/centimes';
import type { ReglageTaxe } from '@/lib/taxe-sejour';

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

/**
 * Affichage COMMERCIAL d'un montant en centimes : les centimes ronds
 * disparaissent. 67000 → "670 €", 67050 → "670,50 €".
 *
 * Réservé aux pages publiques (tarifs affichés, forfait ménage, caution). Les
 * documents légaux gardent fmtEuro et ses deux décimales : sur une facture,
 * « 670 € » se lit comme un montant tronqué.
 *
 * Passe par fmtEuro : aucune division, la virgule est retirée sur le TEXTE.
 */
export const fmtPrix = (centimes: number): string =>
  fmtEuro(centimes).replace(/,00 €$/, ' €');

/**
 * Affichage d'un TAUX en pourcentage (5.5 → "5,5 %", 30 → "30 %").
 *
 * Un taux n'est pas un montant : il reste un nombre décimal (cf. la règle 3 de
 * CLAUDE.md, et le taux de taxe de séjour stocké en numeric(5,2) mode number).
 */
export const fmtTaux = (taux: number): string =>
  `${taux.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/**
 * Affichage d'un taux lu en CENTIÈMES DE POUR CENT (lib/decimaux.ts) :
 * 500 → "5 %", 550 → "5,5 %", 1000 → "10 %". Passe par le texte, comme fmtEuro :
 * aucune division.
 */
export const fmtTauxCentiemes = (centiemes: number): string => {
  if (!Number.isSafeInteger(centiemes) || centiemes < 0) {
    throw new Error(`fmtTauxCentiemes : entier positif attendu, reçu ${String(centiemes)}`);
  }
  const chiffres = String(centiemes).padStart(3, '0');
  const decimales = chiffres.slice(-2).replace(/0+$/, '');
  return `${chiffres.slice(0, -2)}${decimales ? `,${decimales}` : ''} %`;
};

/**
 * Plage de dates d'une période tarifaire, la fin étant le jour du départ :
 * « 3 juil. → 28 août 2027 », « 19 déc. 2026 → 2 janv. 2027 ».
 * Dates civiles lues en UTC : aucun décalage d'un jour selon le fuseau du serveur.
 */
export const fmtPlage = (debut: string, fin: string): string => {
  const jour = (iso: string, avecAnnee: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      ...(avecAnnee ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    });
  return `${jour(debut, debut.slice(0, 4) !== fin.slice(0, 4))} → ${jour(fin, true)}`;
};

/**
 * Règle de taxe de séjour en une phrase DESCRIPTIVE, reprise des termes du
 * guide officiel : « 5 % du prix de la nuitée par personne, plafonné à 4,40 €,
 * majoré de 10 % » ou, pour un gîte classé, « 0,82 € par personne et par nuit,
 * majoré de 10 % ».
 */
export const fmtTaxeSejour = (r: ReglageTaxe): string => {
  const majoration = r.taxeAdditionnelle > 0 ? `, majoré de ${fmtTauxCentiemes(r.taxeAdditionnelle)}` : '';
  if (r.mode === 'fixe' && r.tarifFixe !== null) {
    return `${fmtPrix(r.tarifFixe)} par personne et par nuit${majoration}`;
  }
  if (r.mode === 'proportionnel' && r.taux !== null && r.plafond !== null) {
    return `${fmtTauxCentiemes(r.taux)} du prix de la nuitée par personne, plafonné à ${fmtPrix(r.plafond)}${majoration}`;
  }
  throw new Error(`fmtTaxeSejour : réglage incomplet (mode ${r.mode})`);
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
