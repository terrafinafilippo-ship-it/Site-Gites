// L'IBAN du compte qui reçoit la caution par virement (Phase 4, lot 3) :
// contrôle et mise en forme. Module PUR, sans base : les courriels, la page
// « Ma réservation » et les contrôles l'importent.

/** Forme d'un IBAN écrit sans espaces, en majuscules (la même que la contrainte de `reglages`). */
export const FORME_IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

/** Clé de contrôle d'un IBAN (ISO 13616 : reste de la division par 97 égal à 1). */
export function ibanValide(iban: string): boolean {
  if (!FORME_IBAN.test(iban)) return false;
  const reordonne = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of reordonne) {
    const chiffres = c >= "A" && c <= "Z" ? String(c.charCodeAt(0) - 55) : c;
    for (const d of chiffres) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}

/** IBAN par groupes de quatre, comme sur un RIB. */
export function ibanLisible(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Le compte de la société qui reçoit la caution par virement (réglages, lib/virement.ts). */
export interface CompteVirement {
  titulaire: string;
  /** Sans espaces, majuscules ; clé de contrôle vérifiée. */
  iban: string;
  bic: string | null;
}
