// Helpers de formatage partagés (dates, heures, nuits, euros).
//
// LANGUE : les fonctions d'affichage public prennent une langue (français par
// défaut). Les documents légaux (contrat, factures, page de signature) restent
// en français et appellent ces fonctions sans langue (décision D-22).

import { numericDepuisCentimes } from '@/lib/centimes';
import { LOCALE, type Langue } from '@/lib/i18n/langues';
import type { ReglageTaxe } from '@/lib/taxe-sejour';

/**
 * Affichage d'un montant en euros à partir de CENTIMES ENTIERS :
 * 57666 → "576,66 €", 123456 → "1 234,56 €", -1230 → "-12,30 €".
 * En anglais : "€576.66", "€1,234.56", "-€12.30".
 *
 * SEUL point de passage calcul → affichage : utilisé par les trois composants
 * PDF et par la page de signature. Le montant passe par numericDepuisCentimes
 * (lib/centimes.ts) puis n'est manipulé que comme texte : aucune division.
 */
export const fmtEuro = (centimes: number, langue: Langue = 'fr'): string => {
  const texte = numericDepuisCentimes(centimes); // ex. "-1234.56"
  const negatif = texte.startsWith('-');
  const [entiers, decimales] = (negatif ? texte.slice(1) : texte).split('.');
  // Groupement des milliers selon la langue (espace fine insécable en français,
  // virgule en anglais). Seule la partie entière passe par un nombre.
  const entiersGroupes = Number(entiers).toLocaleString(LOCALE[langue], { maximumFractionDigits: 0 });
  if (langue === 'en') return `${negatif ? '-' : ''}€${entiersGroupes}.${decimales}`;
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
export const fmtPrix = (centimes: number, langue: Langue = 'fr'): string =>
  langue === 'en'
    ? fmtEuro(centimes, langue).replace(/\.00$/, '')
    : fmtEuro(centimes, langue).replace(/,00 €$/, ' €');

/**
 * Affichage d'un TAUX en pourcentage (5.5 → "5,5 %", 30 → "30 %").
 *
 * Un taux n'est pas un montant : il reste un nombre décimal (cf. la règle 3 de
 * CLAUDE.md, et le taux de taxe de séjour stocké en numeric(5,2) mode number).
 */
export const fmtTaux = (taux: number, langue: Langue = 'fr'): string =>
  langue === 'en'
    ? `${taux.toLocaleString(LOCALE.en, { maximumFractionDigits: 2 })}%`
    : `${taux.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/**
 * Affichage d'un taux lu en CENTIÈMES DE POUR CENT (lib/decimaux.ts) :
 * 500 → "5 %", 550 → "5,5 %", 1000 → "10 %". Passe par le texte, comme fmtEuro :
 * aucune division.
 */
export const fmtTauxCentiemes = (centiemes: number, langue: Langue = 'fr'): string => {
  if (!Number.isSafeInteger(centiemes) || centiemes < 0) {
    throw new Error(`fmtTauxCentiemes : entier positif attendu, reçu ${String(centiemes)}`);
  }
  const chiffres = String(centiemes).padStart(3, '0');
  const decimales = chiffres.slice(-2).replace(/0+$/, '');
  if (langue === 'en') return `${chiffres.slice(0, -2)}${decimales ? `.${decimales}` : ''}%`;
  return `${chiffres.slice(0, -2)}${decimales ? `,${decimales}` : ''} %`;
};

/**
 * Plage de dates d'une période tarifaire, la fin étant le jour du départ :
 * « 3 juil. → 28 août 2027 », « 19 déc. 2026 → 2 janv. 2027 ».
 * Dates civiles lues en UTC : aucun décalage d'un jour selon le fuseau du serveur.
 */
export const fmtPlage = (debut: string, fin: string, langue: Langue = 'fr'): string => {
  const jour = (iso: string, avecAnnee: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE[langue], {
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
export const fmtTaxeSejour = (r: ReglageTaxe, langue: Langue = 'fr'): string => {
  if (langue === 'en') {
    const plus = r.taxeAdditionnelle > 0 ? `, plus ${fmtTauxCentiemes(r.taxeAdditionnelle, langue)}` : '';
    if (r.mode === 'fixe' && r.tarifFixe !== null) {
      return `${fmtPrix(r.tarifFixe, langue)} per person per night${plus}`;
    }
    if (r.mode === 'proportionnel' && r.taux !== null && r.plafond !== null) {
      return `${fmtTauxCentiemes(r.taux, langue)} of the nightly price per person, capped at ${fmtPrix(r.plafond, langue)}${plus}`;
    }
    throw new Error(`fmtTaxeSejour : réglage incomplet (mode ${r.mode})`);
  }
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

/** Heure affichée selon la langue : « 18 h 00 » en français, « 18:00 » en anglais. */
export const fmtHeure = (hhmm: string, langue: Langue = 'fr'): string => {
  if (langue === 'fr') return fmtHeureFr(hhmm);
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  return `${String(parseInt(h, 10)).padStart(2, '0')}:${m}`;
};

/** « samedi 12 juin 2027 » / « Saturday 12 June 2027 ». Date civile lue en UTC. */
export const fmtDateAvecJour = (iso: string, langue: Langue = 'fr'): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE[langue], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** « 17 octobre 2026 » / « 17 October 2026 ». Date civile lue en UTC : aucun décalage de fuseau. */
export const fmtDateLongue = (iso: string, langue: Langue = 'fr'): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE[langue], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** « sam. 17 oct. 2026 » / « Sat 17 Oct 2026 ». Date civile lue en UTC. */
export const fmtDateCourte = (iso: string, langue: Langue = 'fr'): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE[langue], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** « Octobre 2026 » / « October 2026 » : titre d'un mois de calendrier (date civile aaaa-mm-jj). */
export const fmtMois = (iso: string, langue: Langue = 'fr'): string => {
  const t = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(LOCALE[langue], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Initiales des jours, lundi en tête. */
export const INITIALES_JOURS: Record<Langue, readonly string[]> = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

/** Note sur 5 : « 4,9 » / « 4.9 ». */
export const fmtNote = (note: number, langue: Langue = 'fr'): string =>
  langue === 'en' ? note.toFixed(1) : note.toFixed(1).replace('.', ',');

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
