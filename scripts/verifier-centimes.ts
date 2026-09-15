// Contrôle des deux fonctions de frontière du modèle monétaire (lib/centimes.ts).
//
// Lancer : npm run verify:centimes
// Code de sortie 1 si un cas échoue. Aucune base de données requise.
import { centimesDepuisNumeric, numericDepuisCentimes } from '../lib/centimes';

let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
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

console.log('--- centimesDepuisNumeric : texte numeric → centimes');
const versCentimes: Array<[string | null, number | null]> = [
  ['0.00', 0],
  ['0.05', 5],
  ['0.5', 50],
  ['10', 1000],
  ['999999.99', 99999999],
  [null, null],
  ['-457.30', -45730],
  ['457.30', 45730], // 457.30 * 100 vaudrait 45729.999… en flottant
  ['576.66', 57666],
  ['13.86', 1386],
  ['25.50', 2550],
  ['450.5', 45050],
  ['450', 45000],
  ['-0.00', 0],
  [' 80.00 ', 8000],
];
for (const [entree, attendu] of versCentimes) {
  const obtenu = centimesDepuisNumeric(entree);
  noter(Object.is(obtenu, attendu), `${JSON.stringify(entree)} → ${JSON.stringify(attendu)}`, obtenu);
}

console.log('--- numericDepuisCentimes : centimes → texte numeric');
const versNumeric: Array<[number, string]> = [
  [0, '0.00'],
  [5, '0.05'],
  [50, '0.50'],
  [1000, '10.00'],
  [99999999, '999999.99'],
  [-45730, '-457.30'],
  [57666, '576.66'],
  [17300, '173.00'],
  [40366, '403.66'],
  [8000, '80.00'],
];
for (const [entree, attendu] of versNumeric) {
  const obtenu = numericDepuisCentimes(entree);
  noter(obtenu === attendu, `${entree} → ${JSON.stringify(attendu)}`, obtenu);
}

console.log('--- aller-retour exact');
for (const texte of ['0.00', '0.05', '0.50', '10.00', '999999.99', '-457.30', '457.30', '576.66']) {
  const c = centimesDepuisNumeric(texte);
  const retour = c === null ? null : numericDepuisCentimes(c);
  noter(retour === texte, `${texte} → ${c} → ${retour}`, retour);
}
for (const c of [0, 1, 99, 100, 101, 57666, -1, -45730, 99999999]) {
  const retour = centimesDepuisNumeric(numericDepuisCentimes(c));
  noter(Object.is(retour, c), `${c} → ${numericDepuisCentimes(c)} → ${retour}`, retour);
}

console.log('--- entrées refusées');
attendErreur(() => centimesDepuisNumeric('1.234'), 'trois décimales "1.234"');
attendErreur(() => centimesDepuisNumeric('abc'), 'texte "abc"');
attendErreur(() => centimesDepuisNumeric(''), 'chaîne vide');
attendErreur(() => centimesDepuisNumeric('1,50'), 'virgule "1,50"');
attendErreur(() => centimesDepuisNumeric('1e3'), 'notation "1e3"');
attendErreur(() => numericDepuisCentimes(576.66), 'flottant 576.66');
attendErreur(() => numericDepuisCentimes(Number.NaN), 'NaN');
attendErreur(() => numericDepuisCentimes(Number.POSITIVE_INFINITY), 'Infinity');
attendErreur(() => numericDepuisCentimes(45729.999), 'flottant 45729.999');

console.log(echecs === 0 ? '\nTous les contrôles passent.' : `\n${echecs} contrôle(s) en échec.`);
process.exitCode = echecs === 0 ? 0 : 1;
