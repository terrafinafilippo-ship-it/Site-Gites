// Frontière du modèle monétaire : les DEUX seules fonctions qui font passer un
// montant entre sa forme en base (numeric PostgreSQL, texte "576.66" tel que
// renvoyé par le driver pg) et sa forme en mémoire (ENTIER de centimes, 57666).
//
// Règle du projet : en mémoire et dans tous les calculs, un montant est un
// entier de centimes. Aucune virgule, aucun flottant, aucun arrondi ailleurs
// qu'à la conversion d'un TAUX en montant (lib/montants.ts).
//
// Ces fonctions travaillent sur des chaînes : découpage au point décimal et
// concaténation des chiffres. Elles ne multiplient ni ne divisent JAMAIS par
// 100 : partir d'un nombre JavaScript, c'est partir d'un flottant, et
// 457.30 * 100 peut valoir 45729.999… Le texte renvoyé par PostgreSQL est la
// seule forme exacte disponible.
//
// Points d'appel (documentation de référence, à tenir à jour) :
//   centimesDepuisNumeric : lib/reservations.ts (réservation + gîte joints),
//                           app/api/factures/route.ts (rappel de l'acompte),
//                           db/verify.ts (contrôle de creer_facture).
//   numericDepuisCentimes : app/api/factures/route.ts (p_montant_ttc de
//                           creer_facture), db/seed.ts (gîtes), lib/format.ts
//                           (fmtEuro, affichage).

// Forme acceptée en entrée : chiffres, point décimal optionnel, une ou deux
// décimales (numeric(10,2) n'en produit jamais plus), signe moins optionnel.
const NUMERIC_REGEX = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Texte numeric PostgreSQL → centimes entiers.
 *   "576.66" → 57666 ; "450" → 45000 ; "450.5" → 45050 ; "0.00" → 0 ;
 *   "-12.30" → -1230 ; null → null.
 * Lève une erreur sur une forme inattendue (plus de deux décimales, texte non
 * numérique) plutôt que de tronquer en silence : un montant faux ne doit
 * jamais sortir d'ici.
 */
export function centimesDepuisNumeric(v: string | null): number | null {
  if (v === null) return null;
  const m = NUMERIC_REGEX.exec(v.trim());
  if (!m) {
    throw new Error(`centimesDepuisNumeric : valeur numeric inattendue « ${v} »`);
  }
  const [, signe, entiers, decimales = ''] = m;
  // Deux chiffres de centimes exactement : "5" → "50", "" → "00".
  const cents = (decimales + '00').slice(0, 2);
  const valeur = parseInt(entiers + cents, 10);
  if (!Number.isSafeInteger(valeur)) {
    throw new Error(`centimesDepuisNumeric : montant hors limites « ${v} »`);
  }
  // "-0.00" → 0 (jamais -0).
  return signe && valeur !== 0 ? -valeur : valeur;
}

/**
 * Centimes entiers → texte numeric PostgreSQL à deux décimales.
 *   57666 → "576.66" ; 5 → "0.05" ; 0 → "0.00" ; -1230 → "-12.30".
 * Lève une erreur si l'entrée n'est pas un entier fini : un flottant qui
 * arriverait ici serait la preuve qu'un calcul a quitté le modèle en centimes.
 */
export function numericDepuisCentimes(c: number): string {
  if (!Number.isSafeInteger(c)) {
    throw new Error(`numericDepuisCentimes : entier de centimes attendu, reçu ${String(c)}`);
  }
  const signe = c < 0 ? '-' : '';
  // Au moins trois chiffres pour que les deux derniers soient les centimes.
  const chiffres = String(Math.abs(c)).padStart(3, '0');
  return `${signe}${chiffres.slice(0, -2)}.${chiffres.slice(-2)}`;
}
