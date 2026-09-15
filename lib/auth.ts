// Authentification service-à-service des routes de génération de documents.
//
// POST /api/contrats et POST /api/factures ne sont appelées que par un
// serveur (back-office, webhook de paiement), jamais par un navigateur :
// chaque appel exige l'en-tête `x-service-secret` égal à
// process.env.DOCUMENT_SERVICE_SECRET. Ce secret est CÔTÉ SERVEUR uniquement :
// il ne doit jamais être préfixé NEXT_PUBLIC_ ni référencé dans du code client.
//
// POST /api/contrats/signer n'utilise pas ce secret : le jeton à usage unique
// porté par le lien /signer/{token} authentifie le signataire.

import { NextResponse } from 'next/server';

/**
 * Vérifie l'en-tête `x-service-secret` de la requête.
 *
 * @returns `null` si le secret est valide (la route peut continuer), sinon une
 *          réponse 401 / 500 prête à être renvoyée.
 */
export function verifierSecret(request: Request): NextResponse | null {
  const attendu = process.env.DOCUMENT_SERVICE_SECRET;

  // Mauvaise configuration serveur : on refuse plutôt que d'ouvrir la route.
  if (!attendu) {
    return NextResponse.json(
      { error: 'Configuration serveur incomplète : DOCUMENT_SERVICE_SECRET manquant.' },
      { status: 500 },
    );
  }

  const fourni = request.headers.get('x-service-secret');
  if (!fourni || fourni !== attendu) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  return null;
}
