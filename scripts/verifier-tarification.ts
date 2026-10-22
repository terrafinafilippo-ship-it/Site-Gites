// Contrôle du calcul des prix de séjour (lib/tarification.ts), de la taxe de
// séjour (lib/taxe-sejour.ts), du devis du tunnel (lib/devis.ts), du contrôle
// des coordonnées (lib/coordonnees.ts) et du règlement choisi par le client
// (lib/reglement.ts : caution, solde, texte d'accord), cas par cas, montants
// attendus calculés à la main.
//
// Lancer : npm run verify:tarification
// Code de sortie 1 si un cas échoue. Aucune base de données requise : les
// tarifs, barèmes et réglages sont construits ici. Les prix sont des valeurs
// d'essai ; seuls les réglages de taxe reprennent les valeurs officielles de
// Savas (délibération CC_2025_119), et les deux exemples du guide officiel
// d'Ardèche Grand Air doivent être retrouvés au centime.
import { readFileSync } from 'node:fs';

import { ajouterJours, jourSemaineIso, nombreDeNuits } from '../lib/dates-civiles';
import { diviserArrondiEntier, entierDepuisDecimal } from '../lib/decimaux';
import {
  calculerSejour,
  construireGrille,
  plancherSemaine,
  prixPourNuits,
  resoudrePeriodes,
  type DonneesTarification,
  type PeriodeDonnees,
  type ReglesPartielles,
  type ResultatSejour,
  type TarifDonnees,
} from '../lib/tarification';
import { calculerTaxeSejour, reglageEnVigueur, type ReglageTaxe } from '../lib/taxe-sejour';
import { occupantsMajeurs, validerCoordonnees } from '../lib/coordonnees';
import {
  datesPossibles,
  detailCalcul,
  devisSejour,
  joursDuCalendrier,
  preparerDevis,
  type DonneesDevis,
  type GiteTunnel,
  type ReglagesTunnel,
  type ResultatDevis,
} from '../lib/devis';
import { montantsDesPostes } from '../lib/montants';
import { carteEnregistree, choixComplet, texteAccordCarte, validerChoix } from '../lib/reglement';
import { fmtDateLongue, fmtEuro, fmtPrix, fmtTaux, fmtTauxCentiemes } from '../lib/format';
import { cheminSansLangue, lien, type Langue } from '../lib/i18n/langues';

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${libelle}${ok ? '' : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

function attendErreur(fn: () => unknown, libelle: string): void {
  try {
    const v = fn();
    noter(false, `${libelle} (erreur attendue)`, v);
  } catch {
    noter(true, `${libelle} (erreur levée)`);
  }
}

// ─── Fabrique de données d'essai ─────────────────────────────────────────────

const TOUS_LES_JOURS = [1, 2, 3, 4, 5, 6, 7];
const LIBRE: ReglesPartielles = { nuitsMinimum: null, joursArrivee: null, joursDepart: null };

/** Barème donné en exemple au cadrage, le 11 octobre 2026 : 1 · 1 · 0,9 · 0,85 · 0,8 · 0,75 · 0,7. */
const BAREME_EXEMPLE = [10000, 10000, 9000, 8500, 8000, 7500, 7000];

function tarif(id: string, prix: Partial<Record<string, number>>, extra: Partial<TarifDonnees> = {}): TarifDonnees {
  return { id, nom: id, regles: LIBRE, baremeId: null, prixNuit: prix, ...extra };
}

function periode(tarifId: string, debut: string, fin: string, extra: Partial<PeriodeDonnees> = {}): PeriodeDonnees {
  return { id: `${tarifId}:${debut}`, tarifId, debut, fin, regles: LIBRE, baremeId: null, ...extra };
}

function donnees(
  tarifs: TarifDonnees[],
  periodes: PeriodeDonnees[],
  baremes: Record<string, number[]> = { exemple: BAREME_EXEMPLE },
  baremeGeneral: string | null = 'exemple',
): DonneesTarification {
  return {
    general: {
      regles: { nuitsMinimum: 1, joursArrivee: TOUS_LES_JOURS, joursDepart: TOUS_LES_JOURS },
      baremeId: baremeGeneral,
    },
    baremes,
    tarifs,
    periodes,
  };
}

function sejour(d: DonneesTarification, gite: string, arrivee: string, depart: string): ResultatSejour {
  return calculerSejour(resoudrePeriodes(d, gite), arrivee, depart);
}

/** Vérifie un total attendu ET que nuits et lignes s'additionnent exactement au total. */
function totalAttendu(r: ResultatSejour, attendu: number, libelle: string): void {
  if (!r.ok) {
    noter(false, libelle, r.refus);
    return;
  }
  noter(r.prix.total === attendu, `${libelle} = ${attendu} c`, r.prix.total);
  const sommeNuits = r.prix.nuits.reduce((s, n) => s + n.montant, 0);
  const sommeLignes = r.prix.lignes.reduce((s, l) => s + l.montant, 0);
  noter(
    sommeNuits === r.prix.total && sommeLignes === r.prix.total,
    `${libelle} : nuits et lignes s'additionnent au total`,
    { sommeNuits, sommeLignes, total: r.prix.total },
  );
}

function refusAttendu(r: ResultatSejour, motif: string, libelle: string): void {
  noter(!r.ok && r.refus.motif === motif, `${libelle} → refus ${motif}`, r.ok ? r.prix.total : r.refus);
}

// ─── 1. Outils : dates, décimaux, arrondi ────────────────────────────────────

console.log('--- dates civiles');
for (const [date, jour] of [
  ['2026-10-10', 6], ['2026-10-11', 7], ['2026-10-12', 1], ['2027-05-29', 6],
  ['2027-07-03', 6], ['2027-08-28', 6], ['2028-01-01', 6],
] as const) {
  noter(jourSemaineIso(date) === jour, `${date} est le jour ISO ${jour}`, jourSemaineIso(date));
}
noter(nombreDeNuits('2027-03-27', '2027-04-03') === 7, 'passage à l\'heure d\'été : 27 mars → 3 avril 2027 = 7 nuits', nombreDeNuits('2027-03-27', '2027-04-03'));
noter(ajouterJours('2026-12-30', 3) === '2027-01-02', '30 déc. 2026 + 3 jours = 2 janv. 2027', ajouterJours('2026-12-30', 3));
attendErreur(() => jourSemaineIso('2027-02-30'), 'date impossible 2027-02-30');

console.log('--- lecture exacte des taux et coefficients');
for (const [texte, decimales, attendu] of [
  ['0.8500', 4, 8500], ['1', 4, 10000], ['1.0000', 4, 10000], ['0.85000', 4, 8500],
  ['5.00', 2, 500], ['5.5', 2, 550], ['10.00', 2, 1000], ['0', 2, 0],
] as const) {
  const obtenu = entierDepuisDecimal(texte, decimales);
  noter(obtenu === attendu, `"${texte}" sur ${decimales} décimales → ${attendu}`, obtenu);
}
attendErreur(() => entierDepuisDecimal('1.23456', 4), '"1.23456" sur 4 décimales');
attendErreur(() => entierDepuisDecimal('-1', 2), 'valeur négative "-1"');
attendErreur(() => entierDepuisDecimal('1,5', 2), 'virgule "1,5"');
attendErreur(() => entierDepuisDecimal('1e3', 2), 'notation "1e3"');

console.log('--- division arrondie (la moitié vers le haut)');
for (const [n, d, attendu] of [[675, 100, 7], [674, 100, 7], [649, 100, 6], [650, 100, 7], [1, 3, 0], [2, 3, 1], [3, 2, 2]] as const) {
  const obtenu = diviserArrondiEntier(n, d);
  noter(obtenu === attendu, `${n} / ${d} → ${attendu}`, obtenu);
}

// ─── 2. Barème et dégressivité, une seule saison ──────────────────────────────
// L'Armu à 75 € la nuit (essai), barème d'exemple. Période du sam. 2 janv. au sam. 6 mars 2027.

console.log('--- dégressivité (75 € la nuit, barème 1 · 1 · 0,9 · 0,85 · 0,8 · 0,75 · 0,7)');
const UNE_SAISON = donnees([tarif('Basse', { armu: 7500 })], [periode('Basse', '2027-01-02', '2027-03-06')]);
for (const [nuits, attendu] of [
  [1, 7500], [2, 15000], [3, 21750], [7, 45000],
  [8, 51429], // 450 + 75 × 6/7 = 514,2857…
  [10, 64286], // 450 + 3 × 64,2857… = 642,857…
  [14, 90000], // deux semaines = exactement deux fois une semaine
] as const) {
  totalAttendu(sejour(UNE_SAISON, 'armu', '2027-01-04', ajouterJours('2027-01-04', nuits)), attendu, `${nuits} nuit(s)`);
}
noter(prixPourNuits(7500, BAREME_EXEMPLE, 7) === 45000, 'prix de la semaine (grille) = 450,00 €', prixPourNuits(7500, BAREME_EXEMPLE, 7));
{
  const r = sejour(UNE_SAISON, 'armu', '2027-01-04', '2027-01-14');
  const montants = r.ok ? r.prix.nuits.map((n) => n.montant) : [];
  noter(
    JSON.stringify(montants.slice(7)) === JSON.stringify([6429, 6428, 6429]),
    'nuits 8 à 10 par arrondi cumulé : 64,29 · 64,28 · 64,29',
    montants.slice(7),
  );
}

console.log('--- barème plus court (1 · 1 · 0,9 · 0,85 ; au-delà : moyenne 0,9375)');
const BAREME_COURT = donnees(
  [tarif('Basse', { armu: 10000 })],
  [periode('Basse', '2027-01-02', '2027-03-06')],
  { court: [10000, 10000, 9000, 8500] },
  'court',
);
totalAttendu(sejour(BAREME_COURT, 'armu', '2027-01-04', '2027-01-09'), 46875, '5 nuits à 100 €');
totalAttendu(sejour(BAREME_COURT, 'armu', '2027-01-04', '2027-01-10'), 56250, '6 nuits à 100 €');

console.log('--- arrondi du total');
totalAttendu(sejour(donnees([tarif('Basse', { armu: 11111 })], [periode('Basse', '2027-01-02', '2027-03-06')]), 'armu', '2027-01-04', '2027-01-07'), 32222, '3 nuits à 111,11 € (322,219 → 322,22)');
totalAttendu(sejour(donnees([tarif('Basse', { armu: 5 })], [periode('Basse', '2027-01-02', '2027-03-06')]), 'armu', '2027-01-04', '2027-01-07'), 15, '3 nuits à 0,05 € (14,5 c → 15 c, moitié vers le haut)');

// ─── 3. Séjour à cheval sur deux saisons ──────────────────────────────────────

console.log('--- séjour à cheval sur deux saisons (90 € puis 110 € la nuit)');
const DEUX_SAISONS = donnees(
  [tarif('Moyenne', { laphine: 9000 }), tarif('Haute', { laphine: 11000 })],
  [periode('Moyenne', '2027-05-01', '2027-05-29'), periode('Haute', '2027-05-29', '2027-07-03')],
);
{
  // Exemple donné au gérant : 90 × 1 + 90 × 1 + 110 × 0,9 + 110 × 0,85 = 372,50 €.
  const r = sejour(DEUX_SAISONS, 'laphine', '2027-05-27', '2027-05-31');
  totalAttendu(r, 37250, '2 nuits moyenne + 2 nuits haute');
  noter(
    r.ok && r.prix.lignes.length === 2 && r.prix.lignes[0].montant === 18000 && r.prix.lignes[1].montant === 19250,
    'deux lignes : moyenne 180,00 € (2 nuits), haute 192,50 € (2 nuits)',
    r.ok ? r.prix.lignes.map((l) => [l.tarifNom, l.nbNuits, l.montant]) : r.refus,
  );
}
{
  // 7 nuits en moyenne saison, la 8e en haute : elle vaut 110 × 6/7 = 94,29 €.
  const r = sejour(DEUX_SAISONS, 'laphine', '2027-05-22', '2027-05-30');
  totalAttendu(r, 63429, '7 nuits moyenne + 8e nuit haute');
  noter(r.ok && r.prix.nuits[7].montant === 9429, '8e nuit, au prix de SA saison : 94,29 €', r.ok ? r.prix.nuits[7].montant : r.refus);
}

console.log('--- le rang continue d\'un barème à l\'autre');
{
  const d = donnees(
    [tarif('A', { armu: 10000 }), tarif('B', { armu: 10000 }, { baremeId: 'plat' })],
    [periode('A', '2027-01-02', '2027-01-09'), periode('B', '2027-01-09', '2027-01-16')],
    { exemple: BAREME_EXEMPLE, plat: [10000] },
  );
  // Rangs 1-3 sur A (1 · 1 · 0,9), rangs 4-5 sur B (barème plat : moyenne 1).
  totalAttendu(sejour(d, 'armu', '2027-01-06', '2027-01-11'), 49000, '3 nuits barème d\'exemple + 2 nuits barème plat');
}
{
  // Même résultat quand c'est la PÉRIODE qui porte son barème (priorité période → tarif → général).
  const d = donnees(
    [tarif('A', { armu: 10000 })],
    [periode('A', '2027-01-02', '2027-01-09'), periode('A', '2027-01-09', '2027-01-16', { baremeId: 'plat' })],
    { exemple: BAREME_EXEMPLE, plat: [10000] },
  );
  totalAttendu(sejour(d, 'armu', '2027-01-06', '2027-01-11'), 49000, 'barème porté par la période');
}

// ─── 4. Règles ────────────────────────────────────────────────────────────────

console.log('--- règles d\'arrivée, de départ et de durée');
const ETE = donnees(
  [
    tarif('Haute', { laphine: 11000 }),
    tarif('Été', { laphine: 13000 }, { regles: { nuitsMinimum: 7, joursArrivee: [6], joursDepart: [6] } }),
  ],
  [periode('Haute', '2027-05-29', '2027-07-03'), periode('Été', '2027-07-03', '2027-08-28')],
);
totalAttendu(sejour(ETE, 'laphine', '2027-07-03', '2027-07-10'), 78000, 'été, samedi → samedi, 7 nuits à 130 €');
totalAttendu(sejour(ETE, 'laphine', '2027-07-03', '2027-07-17'), 156000, 'été, samedi → samedi, 14 nuits');
refusAttendu(sejour(ETE, 'laphine', '2027-07-05', '2027-07-12'), 'ARRIVEE_NON_AUTORISEE', 'été, arrivée un lundi');
refusAttendu(sejour(ETE, 'laphine', '2027-07-03', '2027-07-12'), 'DEPART_NON_AUTORISE', 'été, départ un lundi');
// Arrivée libre en haute saison, mais la dernière nuit tombe en été : le départ
// obéit à l'été. C'est ce qui empêche d'entamer la première semaine d'été.
refusAttendu(sejour(ETE, 'laphine', '2027-07-01', '2027-07-06'), 'DEPART_NON_AUTORISE', 'jeudi 1er → mardi 6 juillet (dernière nuit en été)');
totalAttendu(sejour(ETE, 'laphine', '2027-07-01', '2027-07-03'), 22000, 'jeudi 1er → samedi 3 juillet, tout en haute saison');
{
  const d = donnees(
    [tarif('X', { armu: 10000 }), tarif('Y', { armu: 10000 }, { regles: { nuitsMinimum: 5, joursArrivee: null, joursDepart: null } })],
    [periode('X', '2027-01-02', '2027-01-09'), periode('Y', '2027-01-09', '2027-01-16')],
  );
  const r = sejour(d, 'armu', '2027-01-07', '2027-01-11');
  refusAttendu(r, 'SEJOUR_TROP_COURT', '2 nuits X + 2 nuits Y (Y exige 5 nuits)');
  noter(!r.ok && r.refus.motif === 'SEJOUR_TROP_COURT' && r.refus.minimum === 5 && r.refus.tarifNom === 'Y', 'le minimum retenu est le plus exigeant (5, tarif Y)', r.ok ? null : r.refus);
}
{
  // Règle de la période > règle du tarif : une année calme, l'été redevient libre.
  const d = donnees(
    [tarif('Été', { laphine: 13000 }, { regles: { nuitsMinimum: 7, joursArrivee: [6], joursDepart: [6] } })],
    [periode('Été', '2028-07-01', '2028-08-26', { regles: { nuitsMinimum: 1, joursArrivee: TOUS_LES_JOURS, joursDepart: TOUS_LES_JOURS } })],
  );
  totalAttendu(sejour(d, 'laphine', '2028-07-04', '2028-07-06'), 26000, 'été 2028 rendu libre par sa période : 2 nuits un mardi');
}

// ─── 5. Données manquantes : refus, jamais de repli ──────────────────────────

console.log('--- données manquantes');
refusAttendu(sejour(UNE_SAISON, 'armu', '2026-12-30', '2027-01-04'), 'NUIT_SANS_TARIF', 'nuits avant la première période');
refusAttendu(sejour(UNE_SAISON, 'laphine', '2027-01-04', '2027-01-06'), 'NUIT_SANS_PRIX', 'tarif sans prix pour ce gîte');
refusAttendu(sejour(donnees([tarif('Basse', { armu: 7500 })], [periode('Basse', '2027-01-02', '2027-03-06')], {}, null), 'armu', '2027-01-04', '2027-01-06'), 'BAREME_ABSENT', 'aucun barème général');
refusAttendu(
  sejour(donnees([tarif('Basse', { armu: 7500 }, { baremeId: 'incoherent' })], [periode('Basse', '2027-01-02', '2027-03-06')]), 'armu', '2027-01-04', '2027-01-06'),
  'BAREME_ABSENT',
  'barème du tarif invalide : pas de repli sur le barème général',
);
refusAttendu(sejour(UNE_SAISON, 'armu', '2027-01-04', '2027-01-04'), 'DATES_INVALIDES', 'départ le jour de l\'arrivée');
refusAttendu(sejour(UNE_SAISON, 'armu', '2027-02-27', '2027-02-30'), 'DATES_INVALIDES', 'date de départ impossible');

// ─── 6. Grille publique ──────────────────────────────────────────────────────

console.log('--- grille affichée sur la fiche');
{
  const d = donnees(
    [
      tarif('Basse', { armu: 7500 }),
      tarif('Haute', { armu: 11000 }),
      tarif('Ancien', { armu: 5000 }),
      tarif('LaPhine seule', { laphine: 9000 }),
    ],
    [
      periode('Ancien', '2026-01-03', '2026-03-07'),
      periode('Haute', '2027-05-29', '2027-07-03'),
      periode('Basse', '2027-01-02', '2027-03-06'),
      periode('Basse', '2027-11-06', '2027-12-18'),
      periode('LaPhine seule', '2027-03-06', '2027-04-03'),
    ],
  );
  const { lignes, anomalies } = construireGrille(d, 'armu', '2027-01-10');
  noter(
    JSON.stringify(lignes.map((l) => l.tarifNom)) === JSON.stringify(['Basse', 'Haute']),
    'deux lignes, dans l\'ordre de leur prochaine période ; tarif passé écarté',
    lignes.map((l) => l.tarifNom),
  );
  noter(lignes[0]?.prixSemaine === 45000 && lignes[0]?.plages.length === 2, 'Basse : 450,00 € la semaine, deux plages', lignes[0]);
  noter(lignes[1]?.prixSemaine === 66000, 'Haute : 110 € × 6 = 660,00 € la semaine', lignes[1]?.prixSemaine);
  noter(plancherSemaine(lignes) === 45000, '« à partir de » = 450,00 € (minimum de la grille)', plancherSemaine(lignes));
  // Une période couvre les trois gîtes : un tarif sans prix pour L'Armu rend ces
  // dates invendables pour L'Armu. C'est un oubli de saisie probable, signalé.
  noter(
    anomalies.length === 1 && anomalies[0].includes('LaPhine seule'),
    'L\'Armu : le tarif sans prix pour ce gîte est écarté et signalé',
    anomalies,
  );
  const laphine = construireGrille(d, 'laphine', '2027-01-10');
  noter(
    laphine.lignes.length === 1 && laphine.anomalies.length === 2,
    'LaPhine : une ligne, deux tarifs sans prix signalés',
    laphine,
  );
  noter(plancherSemaine([]) === null, 'grille vide : pas de « à partir de »', plancherSemaine([]));
}

// ─── 7. Taxe de séjour ────────────────────────────────────────────────────────

console.log('--- taxe de séjour (Savas : 5 %, plafond 4,40 €, + 10 %)');
const SAVAS_2026: ReglageTaxe = {
  dateDebut: '2026-01-01',
  mode: 'proportionnel',
  taux: 500,
  plafond: 440,
  tarifFixe: null,
  taxeAdditionnelle: 1000,
  menageDansAssiette: false,
  bebesParmiOccupants: true,
  source: 'Annonay Rhône Agglo, délibération CC_2025_119',
};

function taxe(
  prixHebergement: number,
  arrivee: string,
  depart: string,
  nbOccupants: number,
  nbAssujettis: number,
  reglages: ReglageTaxe[] = [SAVAS_2026],
  forfaitMenage = 0,
) {
  return calculerTaxeSejour({ arrivee, depart, prixHebergement, forfaitMenage, nbOccupants, nbAssujettis, reglages });
}

{
  // Guide officiel, exemple 1 : 378 € HT, 7 nuits, 2 adultes et 2 enfants de 19 et 16 ans.
  const r = taxe(37800, '2026-03-07', '2026-03-14', 4, 3);
  noter(r.ok && r.taxe.total === 1575, 'exemple officiel 1 : 15,75 €', r.ok ? r.taxe.total : r.refus);
  const s = r.ok ? r.taxe.segments[0] : undefined;
  noter(
    s?.prixParNuit === 5400 && s?.prixNuitee === 1350 && s?.tarif === 68 && s?.additionnelle === 7 && s?.tarifParPersonneNuit === 75,
    'exemple officiel 1, étapes : 54,00 · 13,50 · 0,68 · 0,07 · 0,75',
    s,
  );
}
{
  // Guide officiel, exemple 2 : 400 € HT, 1 nuit, 2 adultes et 2 enfants de 14 et 12 ans.
  const r = taxe(40000, '2026-03-07', '2026-03-08', 4, 2);
  noter(r.ok && r.taxe.total === 968, 'exemple officiel 2 : 9,68 €', r.ok ? r.taxe.total : r.refus);
  const s = r.ok ? r.taxe.segments[0] : undefined;
  noter(s?.plafonne === true && s?.tarif === 440 && s?.additionnelle === 44, 'exemple officiel 2 : plafonné à 4,40 €, + 0,44 €', s);
}
{
  // 780 € pour 7 nuits, 2 adultes et 1 enfant, ménage hors calcul :
  // 111,43 → 37,14 → 1,86 → 0,19 → 2,05 € × 7 nuits × 2 adultes.
  const r = taxe(78000, '2027-05-01', '2027-05-08', 3, 2, [SAVAS_2026], 8000);
  noter(r.ok && r.taxe.total === 2870, '780 €, 2 adultes + 1 enfant : 28,70 €', r.ok ? r.taxe.total : r.refus);
  const avecMenage = taxe(78000, '2027-05-01', '2027-05-08', 3, 2, [{ ...SAVAS_2026, menageDansAssiette: true }], 8000);
  // 860 € : 122,86 → 40,95 → 2,05 → 0,21 → 2,26 € × 14.
  noter(avecMenage.ok && avecMenage.taxe.total === 3164, 'le même, ménage compris dans le calcul : 31,64 €', avecMenage.ok ? avecMenage.taxe.total : avecMenage.refus);
}
{
  // Exactement au plafond : 4,40 € n'est pas « plafonné ».
  const r = taxe(17600, '2027-05-01', '2027-05-02', 2, 2);
  const s = r.ok ? r.taxe.segments[0] : undefined;
  noter(s?.tarif === 440 && s?.plafonne === false && r.ok && r.taxe.total === 968, 'nuitée à 88 € : tarif 4,40 € sans plafonnement, 9,68 €', s);
}
{
  const classe: ReglageTaxe = { ...SAVAS_2026, mode: 'fixe', taux: null, plafond: null, tarifFixe: 82 };
  const r = taxe(78000, '2027-05-01', '2027-05-08', 3, 2, [classe]);
  noter(r.ok && r.taxe.total === 1260, 'mode fixe (0,82 € + 10 % = 0,90 €) : 7 nuits × 2 adultes = 12,60 €', r.ok ? r.taxe.total : r.refus);
}
{
  // Nouvelle délibération au 1er janvier 2027 (taux 4 %) : 2 nuits à chaque régime.
  const r2027: ReglageTaxe = { ...SAVAS_2026, dateDebut: '2027-01-01', taux: 400 };
  const r = taxe(40000, '2026-12-30', '2027-01-03', 2, 2, [r2027, SAVAS_2026]);
  noter(
    r.ok && r.taxe.total === 1980 && r.taxe.segments.length === 2,
    'séjour du 30 déc. au 3 janv. : 2 nuits à 2,75 € + 2 nuits à 2,20 € (× 2 adultes) = 19,80 €',
    r.ok ? r.taxe : r.refus,
  );
  noter(reglageEnVigueur([r2027, SAVAS_2026], '2026-06-01')?.taux === 500, 'réglage en vigueur le 1er juin 2026 : 5 %', reglageEnVigueur([r2027, SAVAS_2026], '2026-06-01'));
}
{
  const r = taxe(40000, '2025-12-30', '2026-01-02', 2, 2);
  noter(!r.ok && r.refus.motif === 'TAXE_NON_DEFINIE', 'nuit sans réglage (30 déc. 2025) → refus, pas une taxe nulle', r.ok ? r.taxe.total : r.refus);
}
{
  const r = taxe(40000, '2027-05-01', '2027-05-03', 2, 0);
  noter(r.ok && r.taxe.total === 0, 'deux mineurs, aucun assujetti : taxe nulle', r.ok ? r.taxe.total : r.refus);
  const invalide = taxe(40000, '2027-05-01', '2027-05-03', 2, 3);
  noter(!invalide.ok && invalide.refus.motif === 'OCCUPANTS_INVALIDES', '3 assujettis pour 2 occupants → refus', invalide.ok ? invalide.taxe.total : invalide.refus);
}

{
  // Bébé parmi les occupants (réglage) : 780 €, 2 adultes + 1 bébé, 7 nuits.
  // Avec : 111,43 → 37,14 → 1,86 → 0,19 → 2,05 € ; sans : 55,71 → 2,79 → 0,28 → 3,07 €.
  const avec = calculerTaxeSejour({
    arrivee: '2027-05-01', depart: '2027-05-08', prixHebergement: 78000, forfaitMenage: 0,
    nbOccupants: 3, nbAssujettis: 2, nbBebes: 1, reglages: [SAVAS_2026],
  });
  noter(avec.ok && avec.taxe.total === 2870, 'bébé compté parmi les occupants : 28,70 €', avec.ok ? avec.taxe.total : avec.refus);
  const sans = calculerTaxeSejour({
    arrivee: '2027-05-01', depart: '2027-05-08', prixHebergement: 78000, forfaitMenage: 0,
    nbOccupants: 3, nbAssujettis: 2, nbBebes: 1, reglages: [{ ...SAVAS_2026, bebesParmiOccupants: false }],
  });
  noter(sans.ok && sans.taxe.total === 4298, 'bébé hors des occupants : 3,07 € × 7 × 2 = 42,98 €', sans.ok ? sans.taxe.total : sans.refus);
  const queBebes = calculerTaxeSejour({
    arrivee: '2027-05-01', depart: '2027-05-08', prixHebergement: 78000, forfaitMenage: 0,
    nbOccupants: 1, nbAssujettis: 0, nbBebes: 1, reglages: [SAVAS_2026],
  });
  noter(!queBebes.ok && queBebes.refus.motif === 'OCCUPANTS_INVALIDES', 'un bébé seul → refus', queBebes.ok ? queBebes.taxe.total : queBebes.refus);
}

// ─── 8. Devis du tunnel (lib/devis.ts) ───────────────────────────────────────

console.log('--- devis du tunnel : prix + ménage + taxe, acompte ou paiement intégral');

const REGLAGES_TUNNEL: ReglagesTunnel = {
  dureeBlocageMinutes: 20,
  delaiReservationJours: 1,
  heureArrivee: '18:00',
  heureDepart: '09:00',
  heureLimiteArrivee: '20:00',
  bebeAgeLimite: 2,
  bebesHorsCapacite: 1,
  litsBebe: 1,
  tauxAcompte: 30,
  delaiSoldeJours: 30,
  delaiVirementCautionJours: 3,
};
const ARMU: GiteTunnel = { slug: 'armu', nom: "L'Armu", capaciteMax: 2, forfaitMenage: 8000, caution: 40000 };
const LAPHINE: GiteTunnel = { slug: 'laphine', nom: 'LaPhine', capaciteMax: 4, forfaitMenage: 8000, caution: 50000 };
// Basse saison de janvier à mars 2027 ; été samedi → samedi, 7 nuits, sans prix pour LaPhine.
const DONNEES_DEVIS = donnees(
  [
    tarif('Basse', { armu: 7500, laphine: 11200 }),
    tarif('Été', { armu: 13700 }, { regles: { nuitsMinimum: 7, joursArrivee: [6], joursDepart: [6] } }),
  ],
  [periode('Basse', '2027-01-02', '2027-03-06'), periode('Été', '2027-07-03', '2027-08-28')],
);

function contexte(gite: GiteTunnel, extra: Partial<DonneesDevis> = {}, langue: Langue = 'fr') {
  return preparerDevis(
    {
      tarification: DONNEES_DEVIS,
      taxes: [SAVAS_2026],
      gite,
      reglages: REGLAGES_TUNNEL,
      nuitsPrises: [],
      aujourdhui: '2026-10-15',
      ...extra,
    },
    langue,
  );
}

function refusDevisAttendu(r: ResultatDevis, motif: string, libelle: string): void {
  noter(!r.ok && r.refus.motif === motif, `${libelle} → refus ${motif}`, r.ok ? r.devis.montants : r.refus);
}

const SEMAINE = { arrivee: '2027-01-09', depart: '2027-01-16' };
{
  // L'Armu, 2 adultes, 7 nuits à 75 € : 450 € ; taxe 6 429 → 3 215 → 1,61 → 0,16 → 1,77 € × 14 = 24,78 €.
  const r = devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  const d = r.ok ? r.devis : undefined;
  noter(
    d?.prix.total === 45000 && d.montants.forfaitMenage === 8000 && d.taxe.total === 2478 && d.montants.totalTtc === 55478,
    "L'Armu, une semaine de janvier : 450 € + 80 € + 24,78 € = 554,78 €",
    d?.montants ?? (r.ok ? null : r.refus),
  );
  noter(
    d?.montants.acompte === 16643 && d.montants.solde === 38835 && d.aRegler === 16643 && !d.paiementIntegral,
    'acompte 30 % = 166,43 €, solde 388,35 € (le calcul des documents)',
    d && { acompte: d.montants.acompte, solde: d.montants.solde, aRegler: d.aRegler },
  );
  noter(d?.dateLimiteSolde === '2026-12-10' && d.caution === 40000, 'solde dû le 10 décembre 2026 ; caution 400 €', d && [d.dateLimiteSolde, d.caution]);
  const detail = d ? detailCalcul(d, REGLAGES_TUNNEL) : {};
  noter(detail.formatVersion === 1 && detail.unite === 'centimes', 'détail figé avec la réservation : format 1, en centimes', detail.formatVersion);
}
{
  const avecBebe = devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 1 });
  noter(avecBebe.ok && avecBebe.devis.taxe.total === 1652, "L'Armu, 2 adultes + 1 bébé : accepté (bébé hors capacité), taxe divisée par 3 = 16,52 €", avecBebe.ok ? avecBebe.devis.taxe.total : avecBebe.refus);
  refusDevisAttendu(devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 2 }), 'CAPACITE_DEPASSEE', "L'Armu, 2 adultes + 2 bébés (le second prend une place)");
  refusDevisAttendu(devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 1, bebes: 0 }), 'CAPACITE_DEPASSEE', "L'Armu, 2 adultes + 1 enfant");
  refusDevisAttendu(devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 0, enfants: 1, bebes: 0 }), 'SANS_ADULTE', 'aucun adulte');
  const deuxBebes = devisSejour(contexte(LAPHINE), { ...SEMAINE, adultes: 3, enfants: 0, bebes: 2 });
  noter(deuxBebes.ok && deuxBebes.devis.litsBebeInsuffisants, 'LaPhine, 3 adultes + 2 bébés : accepté, « un seul lit bébé » signalé', deuxBebes.ok ? deuxBebes.devis.litsBebeInsuffisants : deuxBebes.refus);
  refusDevisAttendu(devisSejour(contexte(LAPHINE), { ...SEMAINE, adultes: 4, enfants: 0, bebes: 2 }), 'CAPACITE_DEPASSEE', 'LaPhine, 4 adultes + 2 bébés');
  const plein = devisSejour(contexte(LAPHINE), { ...SEMAINE, adultes: 4, enfants: 0, bebes: 1 });
  noter(plein.ok && !plein.devis.litsBebeInsuffisants, 'LaPhine, 4 adultes + 1 bébé : accepté', plein.ok ? plein.devis.occupants : plein.refus);
}
{
  // Délai d'un jour : réservable jusqu'à la veille (réponse du 15 octobre 2026).
  const veille = devisSejour(contexte(ARMU, { aujourdhui: '2027-01-08' }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(veille.ok, 'arrivée le 9 janvier réservée le 8 : acceptée', veille.ok ? null : veille.refus);
  const jourMeme = devisSejour(contexte(ARMU, { aujourdhui: '2027-01-09' }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    !jourMeme.ok && jourMeme.refus.motif === 'ARRIVEE_TROP_PROCHE' && jourMeme.refus.message === 'Une arrivée se réserve au plus tard la veille.',
    'arrivée le jour même → refus « au plus tard la veille »',
    jourMeme.ok ? null : jourMeme.refus,
  );
  const passee = devisSejour(contexte(ARMU, { aujourdhui: '2027-01-12' }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(!passee.ok && passee.refus.message === "La date d'arrivée est passée.", 'arrivée passée → « La date d\'arrivée est passée. »', passee.ok ? null : passee.refus);
  const sansDelai = devisSejour(
    contexte(ARMU, { aujourdhui: '2027-01-09', reglages: { ...REGLAGES_TUNNEL, delaiReservationJours: 0 } }),
    { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 },
  );
  noter(sansDelai.ok, 'délai réglé à 0 : arrivée le jour même acceptée', sansDelai.ok ? null : sansDelai.refus);
}
{
  // D-20 : date limite du solde (arrivée − 30 jours) atteinte → le total aujourd'hui.
  const limite = devisSejour(contexte(ARMU, { aujourdhui: '2026-12-10' }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    limite.ok && limite.devis.paiementIntegral && limite.devis.aRegler === 55478 && limite.devis.dateLimiteSolde === null,
    'réservé le 10 décembre (jour limite du solde) : paiement intégral de 554,78 €',
    limite.ok ? limite.devis.aRegler : limite.refus,
  );
  const avant = devisSejour(contexte(ARMU, { aujourdhui: '2026-12-09' }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(avant.ok && !avant.devis.paiementIntegral && avant.devis.aRegler === 16643, 'réservé le 9 décembre : acompte seulement', avant.ok ? avant.devis.aRegler : avant.refus);
}
{
  const prise = contexte(ARMU, { nuitsPrises: ['2027-01-12'] });
  const r = devisSejour(prise, { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    !r.ok && r.refus.motif === 'NUITS_PRISES' && r.refus.message === 'La nuit du 12 janvier 2027 est déjà prise.',
    'nuit du 12 janvier prise → refus qui la nomme',
    r.ok ? null : r.refus,
  );
  noter(devisSejour(prise, { arrivee: '2027-01-09', depart: '2027-01-12', adultes: 2, enfants: 0, bebes: 0 }).ok, 'départ le 12 (nuit du 12 non comprise) : accepté');
  const ete = devisSejour(contexte(ARMU), { arrivee: '2027-07-08', depart: '2027-07-15', adultes: 2, enfants: 0, bebes: 0 });
  noter(
    !ete.ok && ete.refus.message === 'En « Été », les arrivées se font le samedi.' && !ete.refus.donneeManquante,
    'été, arrivée un jeudi → « En « Été », les arrivées se font le samedi. »',
    ete.ok ? null : ete.refus,
  );
  const sansPrix = devisSejour(contexte(LAPHINE), { arrivee: '2027-07-03', depart: '2027-07-10', adultes: 2, enfants: 0, bebes: 0 });
  noter(!sansPrix.ok && sansPrix.refus.motif === 'NUIT_SANS_PRIX' && sansPrix.refus.donneeManquante, 'LaPhine sans prix d\'été → refus, signalé comme donnée manquante', sansPrix.ok ? null : sansPrix.refus);
  const sansTaxe = devisSejour(contexte(ARMU, { taxes: [] }), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(!sansTaxe.ok && sansTaxe.refus.motif === 'TAXE_NON_DEFINIE' && sansTaxe.refus.donneeManquante, 'aucun réglage de taxe → refus, jamais une taxe nulle', sansTaxe.ok ? null : sansTaxe.refus);
}
{
  // Calendrier : délai, nuit prise, fin de période.
  const ctx = contexte(ARMU, { aujourdhui: '2027-01-08', nuitsPrises: ['2027-01-12'] });
  const jours = joursDuCalendrier(ctx, '2027-01-07', 6);
  const etat = (date: string) => jours.find((j) => j.date === date);
  noter(etat('2027-01-08')?.arriveePossible === false && etat('2027-01-09')?.arriveePossible === true, 'calendrier : arrivée possible dès le lendemain', jours);
  noter(etat('2027-01-12')?.prise === true && etat('2027-01-12')?.arriveePossible === false, 'calendrier : nuit prise, pas d\'arrivée', etat('2027-01-12'));
  const finPeriode = joursDuCalendrier(ctx, '2027-03-05', 2);
  noter(finPeriode[0].sansTarif === false && finPeriode[1].sansTarif === true, 'calendrier : le 6 mars, fin de la période, est sans tarif', finPeriode);
  const ete = contexte(ARMU);
  noter(
    datesPossibles(ete, '2027-07-03', '2027-07-10') && !datesPossibles(ete, '2027-07-03', '2027-07-09'),
    'été : départ possible le samedi 10, pas le vendredi 9',
  );
}
{
  // Le devis et les documents partagent le calcul : réservation de référence L'Armu.
  const m = montantsDesPostes({ prixLocation: 45730, forfaitMenage: 8000, options: 2550, taxeSejour: 1386 }, 30);
  noter(m.totalTtc === 57666 && m.acompte === 17300 && m.solde === 40366, 'montantsDesPostes = montants de référence (576,66 / 173,00 / 403,66)', m);
  let refuse = false;
  try {
    montantsDesPostes({ prixLocation: 45730, forfaitMenage: 8000, options: 0, taxeSejour: 0 }, 0);
  } catch {
    refuse = true;
  }
  noter(refuse, "taux d'acompte de 0 % : refusé, jamais un acompte nul");
}
{
  // Lot 3 : taux d'acompte, délai du solde et délai du virement viennent des réglages.
  const quarante = devisSejour(
    contexte(ARMU, { reglages: { ...REGLAGES_TUNNEL, tauxAcompte: 40 } }),
    { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 },
  );
  noter(
    quarante.ok && quarante.devis.tauxAcompte === 40 && quarante.devis.aRegler === 22191 &&
      quarante.devis.montants.solde === 33287,
    'acompte réglé à 40 % : 221,91 € sur 554,78 € (arrondi au centime), solde 332,87 €',
    quarante.ok ? quarante.devis.montants : quarante.refus,
  );
  const delai45 = devisSejour(
    contexte(ARMU, { aujourdhui: '2026-11-25', reglages: { ...REGLAGES_TUNNEL, delaiSoldeJours: 45 } }),
    { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 },
  );
  noter(
    delai45.ok && delai45.devis.paiementIntegral && delai45.devis.delaiSoldeJours === 45,
    'délai du solde réglé à 45 jours : réservé le 25 novembre pour le 9 janvier, paiement intégral',
    delai45.ok ? delai45.devis.dateLimiteSolde : delai45.refus,
  );
  const r = devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    r.ok && r.devis.dateLimiteVirementCaution === '2027-01-06',
    'caution par virement reçue au plus tard le 6 janvier (3 jours avant le 9)',
    r.ok ? r.devis.dateLimiteVirementCaution : r.refus,
  );
}

// ─── 9. Coordonnées du client (lib/coordonnees.ts) ────────────────────────────

console.log('--- coordonnées du client');
const CLIENT = {
  locataire: { civilite: 'Mme', prenom: ' Camille ', nom: 'Durand' },
  email: 'Camille.Durand@Example.invalid',
  telephone: '06 12 34 56 78',
  adresse: '12  rue des Lilas',
  codePostal: '69003',
  ville: 'Lyon',
  pays: 'France',
  colocataire: null,
  autresAdultes: [],
};
{
  const r = validerCoordonnees(CLIENT, 1);
  noter(
    r.ok && r.coordonnees.locataire.prenom === 'Camille' && r.coordonnees.adresse === '12 rue des Lilas' &&
      r.coordonnees.email === 'camille.durand@example.invalid' && occupantsMajeurs(r.coordonnees) === 'Camille DURAND',
    'un adulte : espaces nettoyés, e-mail en minuscules, occupants « Camille DURAND »',
    r,
  );
  const sansCivilite = validerCoordonnees({ ...CLIENT, locataire: { ...CLIENT.locataire, civilite: 'Dr' } }, 1);
  noter(sansCivilite.ok && sansCivilite.coordonnees.locataire.civilite === '', 'civilité facultative : une valeur inconnue est ignorée', sansCivilite);
  const trois = validerCoordonnees(
    {
      ...CLIENT,
      colocataire: { civilite: '', prenom: 'Julien', nom: 'Durand' },
      autresAdultes: [{ prenom: 'Léa', nom: 'Martin' }],
    },
    3,
  );
  noter(
    trois.ok && occupantsMajeurs(trois.coordonnees) === 'Camille DURAND, Julien DURAND, Léa MARTIN',
    'trois adultes dont un second locataire : les trois au contrat',
    trois.ok ? occupantsMajeurs(trois.coordonnees) : trois.erreurs,
  );
  const incomplet = validerCoordonnees({ ...CLIENT, email: 'pas-une-adresse' }, 3);
  noter(
    !incomplet.ok && !!incomplet.erreurs.email && !!incomplet.erreurs['autresAdultes.0.prenom'] && !!incomplet.erreurs['autresAdultes.1.nom'],
    'e-mail invalide et deux adultes sans nom : trois erreurs nommées',
    incomplet.ok ? null : incomplet.erreurs,
  );
  const colocSeul = validerCoordonnees({ ...CLIENT, colocataire: { civilite: '', prenom: 'Julien', nom: 'Durand' } }, 1);
  noter(!colocSeul.ok && !!colocSeul.erreurs.colocataire, 'second locataire avec un seul adulte → refus', colocSeul.ok ? null : colocSeul.erreurs);
}

// ─── 10. Anglais (décision D-22) : affichage seulement, mêmes montants ───────

console.log('--- anglais : montants, dates, messages, liens');
{
  noter(fmtEuro(123456, 'en') === '€1,234.56' && fmtEuro(-1230, 'en') === '-€12.30', 'montant en anglais : €1,234.56 et -€12.30', [fmtEuro(123456, 'en'), fmtEuro(-1230, 'en')]);
  noter(fmtPrix(67000, 'en') === '€670' && fmtPrix(67050, 'en') === '€670.50', 'prix affiché en anglais : €670 et €670.50', [fmtPrix(67000, 'en'), fmtPrix(67050, 'en')]);
  noter(fmtTaux(30, 'en') === '30%' && fmtTauxCentiemes(550, 'en') === '5.5%', 'taux en anglais : 30% et 5.5%', [fmtTaux(30, 'en'), fmtTauxCentiemes(550, 'en')]);
  noter(fmtDateLongue('2027-01-12', 'en') === '12 January 2027', 'date en anglais : 12 January 2027', fmtDateLongue('2027-01-12', 'en'));

  const fr = devisSejour(contexte(ARMU), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  const en = devisSejour(contexte(ARMU, {}, 'en'), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    fr.ok && en.ok && JSON.stringify(fr.devis) === JSON.stringify(en.devis),
    'devis identique en anglais et en français (554,78 €) : la langue ne touche aucun montant',
    en.ok ? en.devis.montants.totalTtc : en.refus,
  );
  const veille = devisSejour(contexte(ARMU, { aujourdhui: '2027-01-09' }, 'en'), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(
    !veille.ok && veille.refus.message === 'Arrivals can be booked up to the day before at the latest.' && veille.refus.detail.startsWith('arrivée'),
    'refus en anglais pour le client, cause en français pour le journal',
    veille.ok ? null : veille.refus,
  );
  const prise = devisSejour(contexte(ARMU, { nuitsPrises: ['2027-01-12'] }, 'en'), { ...SEMAINE, adultes: 2, enfants: 0, bebes: 0 });
  noter(!prise.ok && prise.refus.message === 'The night of 12 January 2027 is already taken.', 'nuit prise, en anglais', prise.ok ? null : prise.refus);
  const ete = devisSejour(contexte(ARMU, {}, 'en'), { arrivee: '2027-07-08', depart: '2027-07-15', adultes: 2, enfants: 0, bebes: 0 });
  noter(!ete.ok && ete.refus.message === 'During “Été”, arrivals are on Saturday.', 'règle d\'arrivée en anglais (le nom du tarif reste celui saisi)', ete.ok ? null : ete.refus);
  const coord = validerCoordonnees({ ...CLIENT, email: 'pas-une-adresse' }, 1, 'en');
  noter(!coord.ok && coord.erreurs.email === 'This email address is not valid.', 'erreur de coordonnées en anglais', coord.ok ? null : coord.erreurs);

  noter(
    lien('en', '/gites/laphine') === '/en/gites/laphine' && lien('fr', '/gites/laphine') === '/gites/laphine' &&
      lien('en', '/') === '/en' && lien('en', '/reserver?gite=armu') === '/en/reserver?gite=armu',
    'liens : /en devant en anglais, rien en français',
  );
  noter(
    cheminSansLangue('/en/gites') === '/gites' && cheminSansLangue('/en') === '/' &&
      cheminSansLangue('/fr/contact') === '/contact' && cheminSansLangue('/entree') === '/entree',
    'chemin sans langue : /en/gites → /gites, /en → /, /fr/contact → /contact, /entree intact',
  );
}

// ─── 11. Règlement : caution, solde, texte d'accord (lot 3) ──────────────────

console.log("--- règlement : caution, solde, texte d'accord");
{
  const ok = validerChoix({ moyenCaution: 'carte', modeSolde: 'prelevement' }, false);
  noter(ok.ok && ok.choix.modeSolde === 'prelevement', 'carte + prélèvement : accepté');
  noter(validerChoix({ moyenCaution: 'cheque', modeSolde: 'lien' }, false).ok, 'chèque + lien : accepté');
  const sansCarte = validerChoix({ moyenCaution: 'virement', modeSolde: 'prelevement' }, false);
  noter(
    !sansCarte.ok && sansCarte.message === 'Le prélèvement automatique du solde demande une caution par carte.',
    'virement + prélèvement : refusé (pas de carte enregistrée)',
    sansCarte,
  );
  const rien = validerChoix({}, false, 'en');
  noter(!rien.ok && rien.message === 'Choose how you will provide the security deposit.', 'rien choisi : refusé (rien n\'est pré-choisi), message en anglais', rien);
  const sansSolde = validerChoix({ moyenCaution: 'carte' }, false);
  noter(!sansSolde.ok && sansSolde.message === 'Choisissez comment régler le solde.', 'caution choisie sans le solde : refusé', sansSolde);
  const integral = validerChoix({ moyenCaution: 'cheque', modeSolde: 'prelevement' }, true);
  noter(integral.ok && integral.choix.modeSolde === null, 'paiement intégral : pas de solde, le choix reçu est ignoré', integral);
  noter(
    choixComplet({ moyenCaution: 'carte', modeSolde: null }, true) !== null &&
      choixComplet({ moyenCaution: 'carte', modeSolde: null }, false) === null,
    'bouton « Procéder au paiement » : actif dès la caution en paiement intégral, sinon caution ET solde',
  );
  noter(
    carteEnregistree({ moyenCaution: 'carte', modeSolde: 'lien' }) &&
      !carteEnregistree({ moyenCaution: 'virement', modeSolde: 'lien' }),
    'carte enregistrée seulement pour une caution par carte',
  );

  // Les modèles de la migration 0005, et les textes validés le 14 et le 20 octobre 2026.
  const MODELE_FR =
    "En validant ce paiement, j'accepte que la carte utilisée soit conservée par Stripe, prestataire de paiement de la SARL DE LA VOUTE, pour les opérations suivantes :\n– une préautorisation de {caution} au titre du dépôt de garantie, effectuée la veille de mon départ. Elle n'est pas débitée, sauf dégât constaté, et elle est levée au plus tard 3 jours après mon départ{ligne_solde}.\nLes données de ma carte sont supprimées au plus tard 7 jours après mon départ.";
  const SOLDE_FR = ' ;\n– le prélèvement du solde de {montant}, le {date}';
  const MODELE_EN =
    'By confirming this payment, I agree that the card used will be stored by Stripe, payment provider of SARL DE LA VOUTE, for the following operations:\n– a pre-authorisation of {caution} as a security deposit, made the day before my departure. It is not charged unless damage is found, and it is released no later than 3 days after my departure{ligne_solde}.\nMy card details are deleted no later than 7 days after my departure.';
  const SOLDE_EN = ';\n– the charge of the balance of {montant} on {date}';
  const migration = readFileSync('db/migrations/0005_paiement.sql', 'utf8');
  const enSql = (t: string) => t.replaceAll("'", "''");
  noter(
    [MODELE_FR, SOLDE_FR, MODELE_EN, SOLDE_EN].every((t) => migration.includes(enSql(t))),
    'les modèles contrôlés ici sont ceux de la migration 0005, mot pour mot',
  );

  const fr = texteAccordCarte(
    { id: 'v-fr', langue: 'fr', modele: MODELE_FR, modeleSolde: SOLDE_FR },
    { caution: 40000, prelevement: { montant: 38835, date: '2026-12-10' } },
  );
  noter(
    fr ===
      "En validant ce paiement, j'accepte que la carte utilisée soit conservée par Stripe, prestataire de paiement de la SARL DE LA VOUTE, pour les opérations suivantes :\n" +
        '– une préautorisation de 400 € au titre du dépôt de garantie, effectuée la veille de mon départ. Elle n\'est pas débitée, sauf dégât constaté, et elle est levée au plus tard 3 jours après mon départ ;\n' +
        '– le prélèvement du solde de 388,35 €, le 10 décembre 2026.\n' +
        'Les données de ma carte sont supprimées au plus tard 7 jours après mon départ.',
    'texte d\'accord, prélèvement choisi : le texte validé le 14 octobre, crochets remplis',
    fr,
  );
  const frSansSolde = texteAccordCarte(
    { id: 'v-fr', langue: 'fr', modele: MODELE_FR, modeleSolde: SOLDE_FR },
    { caution: 40000, prelevement: null },
  );
  noter(
    frSansSolde.includes('levée au plus tard 3 jours après mon départ.\nLes données') && !frSansSolde.includes('solde'),
    'texte d\'accord, solde par lien : sans la ligne du solde, la phrase finit par un point',
    frSansSolde,
  );
  const en = texteAccordCarte(
    { id: 'v-en', langue: 'en', modele: MODELE_EN, modeleSolde: SOLDE_EN },
    { caution: 40000, prelevement: { montant: 38835, date: '2026-12-10' } },
  );
  noter(
    en.includes('a pre-authorisation of €400 as a security deposit') &&
      en.includes('after my departure;\n– the charge of the balance of €388.35 on 10 December 2026.\n'),
    'texte d\'accord en anglais : montants et date à l\'anglaise',
    en,
  );
  let incomplet = false;
  try {
    texteAccordCarte({ id: 'v-x', langue: 'fr', modele: 'Caution {caution}, {inconnu}', modeleSolde: '' }, { caution: 1, prelevement: null });
  } catch {
    incomplet = true;
  }
  noter(incomplet, 'repère inconnu dans un modèle : le texte n\'est pas affiché (erreur)');
}

console.log(echecs === 0 ? `\n${nbCas} cas, tous passent.` : `\n${nbCas} cas, ${echecs} en échec.`);
process.exitCode = echecs === 0 ? 0 : 1;
