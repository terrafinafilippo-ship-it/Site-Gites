// Helpers partagés par les routes API de génération de documents
// (/api/contrats, /api/contrats/signer, /api/factures) et la page /signer.

import { isStorageError } from '@/lib/storage';

/**
 * Origine publique du site, sans barre oblique finale : NEXT_PUBLIC_SITE_URL
 * en priorité (proxy, worker), sinon l'origine de la requête reçue.
 */
export function resolveSiteOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    new URL(request.url).origin
  );
}

/** URL du logo chargé par @react-pdf/renderer côté serveur (public/logo.png). */
export function resolveLogoUrl(request: Request): string {
  return `${resolveSiteOrigin(request)}/logo.png`;
}

/** Lien de signature envoyé au client : {origine du site}/signer/{token}. */
export function buildSigningUrl(request: Request, token: string): string {
  return `${resolveSiteOrigin(request)}/signer/${token}`;
}

/**
 * Le fichier existe déjà dans le stockage (upload sans overwrite) : erreur
 * EXISTE_DEJA de lib/storage.ts. Cette tolérance protège la ré-émission
 * idempotente d'un document dont l'étape suivant l'upload avait échoué : le
 * fichier déjà écrit fait foi, on ne l'écrase jamais.
 */
export function isDuplicateError(err: unknown): boolean {
  return isStorageError(err, 'EXISTE_DEJA');
}

/**
 * Code SQLSTATE d'une erreur PostgreSQL. Drizzle enveloppe l'erreur du driver
 * dans DrizzleQueryError et la conserve dans `cause` : on remonte la chaîne.
 */
export function codePostgres(err: unknown): string | undefined {
  let courant: unknown = err;
  for (let profondeur = 0; profondeur < 4 && courant && typeof courant === 'object'; profondeur += 1) {
    const code = (courant as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    courant = (courant as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Violation d'un index unique PostgreSQL (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return codePostgres(err) === '23505';
}

/** Message lisible d'une erreur inconnue (réponses JSON). Préfère la cause pg à l'enveloppe Drizzle. */
export function messageErreur(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return err.message;
  }
  return String(err);
}

// Identifiants uuid : vérifiés avant toute requête pour répondre 400 au lieu
// d'une erreur SQL « invalid input syntax for type uuid » (500).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && UUID_REGEX.test(valeur);
}
