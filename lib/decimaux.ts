// Nombres décimaux qui ne sont PAS des montants (taux, coefficients) et division
// entière arrondie.
//
// Un taux de taxe de séjour (5,00 %) ou un coefficient de barème (0,85) n'est
// pas de l'argent, mais il sert à CALCULER de l'argent. Le lire en flottant,
// c'est partir d'une valeur déjà approchée. Ces nombres arrivent de PostgreSQL
// en texte (colonnes numeric en mode "string") et sont convertis ici en ENTIERS
// À ÉCHELLE FIXE, par découpage de chaîne, exactement comme les montants :
//
//   taux        "5.00"   sur 2 décimales → 500    (centièmes de pour cent)
//   coefficient "0.8500" sur 4 décimales → 8500   (dix-millièmes)
//
// Les MONTANTS ne passent jamais ici : ils ont leurs deux fonctions de frontière
// dans lib/centimes.ts.

const DECIMAL_REGEX = /^(\d+)(?:\.(\d+))?$/;

// Constantes BigInt construites par appel, et non écrites « 0n » : la cible de
// compilation du projet (ES2017, tsconfig.json) n'accepte pas les littéraux.
export const BIG_ZERO = BigInt(0);
export const BIG_UN = BigInt(1);
const BIG_DEUX = BigInt(2);

/**
 * Texte décimal positif → entier à `decimales` chiffres après la virgule.
 *   ("5.00", 2) → 500 ; ("5.5", 2) → 550 ; ("0.8500", 4) → 8500 ; ("1", 4) → 10000.
 * Lève une erreur sur un signe, une virgule, une notation exponentielle ou plus
 * de `decimales` chiffres significatifs après le point : une valeur qu'on ne
 * sait pas lire exactement ne doit jamais entrer dans un calcul.
 */
export function entierDepuisDecimal(texte: string, decimales: number): number {
  const m = DECIMAL_REGEX.exec(texte.trim());
  if (!m) {
    throw new Error(`entierDepuisDecimal : valeur décimale inattendue « ${texte} »`);
  }
  const [, entiers, fraction = ""] = m;
  // Des zéros au-delà de l'échelle ne changent pas la valeur ("0.85000").
  const significative = fraction.replace(/0+$/, "");
  if (significative.length > decimales) {
    throw new Error(
      `entierDepuisDecimal : « ${texte} » a plus de ${decimales} décimale(s) significative(s)`,
    );
  }
  const valeur = parseInt(entiers + (fraction + "0".repeat(decimales)).slice(0, decimales), 10);
  if (!Number.isSafeInteger(valeur)) {
    throw new Error(`entierDepuisDecimal : valeur hors limites « ${texte} »`);
  }
  return valeur;
}

/**
 * Division de deux entiers positifs, arrondie au plus proche, la moitié vers le
 * haut : 1350 × 500 / 10000 = 67,5 → 68 (règle d'arrondi « au centième » du
 * guide officiel de la taxe de séjour, qui arrondit 0,675 € à 0,68 €).
 *
 * Calcul en BigInt : aucun flottant n'intervient, le résultat est exact quelle
 * que soit la taille des opérandes.
 */
export function diviserArrondi(numerateur: bigint, denominateur: bigint): bigint {
  if (numerateur < BIG_ZERO || denominateur <= BIG_ZERO) {
    throw new Error(
      `diviserArrondi : opérandes attendus positifs, reçu ${numerateur} / ${denominateur}`,
    );
  }
  return (BIG_DEUX * numerateur + denominateur) / (BIG_DEUX * denominateur);
}

/** Version en `number` de diviserArrondi, pour des entiers sûrs (centimes, taux). */
export function diviserArrondiEntier(numerateur: number, denominateur: number): number {
  if (!Number.isSafeInteger(numerateur) || !Number.isSafeInteger(denominateur)) {
    throw new Error(
      `diviserArrondiEntier : entiers attendus, reçu ${numerateur} / ${denominateur}`,
    );
  }
  return Number(diviserArrondi(BigInt(numerateur), BigInt(denominateur)));
}
