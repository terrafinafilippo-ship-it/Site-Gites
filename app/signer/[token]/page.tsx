// Page de signature d'un contrat : /signer/{token}
//
// Le jeton porté par l'URL (documents.token, à usage unique) authentifie le
// signataire : aucune session ni mot de passe. La page charge le document et la
// réservation côté serveur, affiche le PDF non signé via une URL signée servie
// par /api/documents, puis le formulaire client (SignerForm) appelle
// POST /api/contrats/signer.
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import { calculerMontants } from '@/lib/montants';
import { chargerReservationAvecGite } from '@/lib/reservations';
import { fmtDateFr, fmtEuro } from '@/lib/format';
import { texteConsentement } from '@/lib/constantes';
import { SignerForm } from './SignerForm';
import { ErreurSignature } from './ErreurSignature';

// Données serveur (jeton privé, fichiers privés) : jamais mises en cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Signature du contrat — Les Gîtes de Samoyas',
  robots: { index: false, follow: false },
};

// Validité de l'URL signée de l'aperçu PDF (1 h).
const SIGNED_URL_TTL = 60 * 60;

// Forme des jetons émis par POST /api/contrats (24 octets en base64url).
const TOKEN_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

export default async function SignerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_REGEX.test(token)) {
    return <ErreurSignature code={404} titre="Lien invalide" message={MESSAGE_INVALIDE} />;
  }

  const db = getDb();

  // ── Validation du jeton ──────────────────────────────────────────────────
  const [doc] = await db
    .select({
      id: documents.id,
      reservation_id: documents.reservation_id,
      numero: documents.numero,
      url_pdf: documents.url_pdf,
      statut: documents.statut,
      token_expire_at: documents.token_expire_at,
    })
    .from(documents)
    .where(eq(documents.token, token))
    .limit(1);

  if (!doc) {
    return <ErreurSignature code={404} titre="Lien invalide" message={MESSAGE_INVALIDE} />;
  }
  if (doc.statut === 'signe') {
    return (
      <ErreurSignature
        code={409}
        titre="Contrat déjà signé"
        message={`Le contrat ${doc.numero} a déjà été signé. Aucune action supplémentaire n'est nécessaire.`}
      />
    );
  }
  if (doc.token_expire_at && doc.token_expire_at.getTime() < Date.now()) {
    return (
      <ErreurSignature
        code={410}
        titre="Lien expiré"
        message={`Le lien de signature du contrat ${doc.numero} a expiré. Contactez Les Gîtes de Samoyas pour en recevoir un nouveau.`}
      />
    );
  }

  // ── Données du récapitulatif + aperçu PDF ────────────────────────────────
  const resa = await chargerReservationAvecGite(doc.reservation_id, db);
  if (!resa) {
    return (
      <ErreurSignature
        code={404}
        titre="Réservation introuvable"
        message="Impossible de retrouver la réservation associée à ce contrat. Contactez Les Gîtes de Samoyas."
      />
    );
  }

  const montants = calculerMontants(resa);

  let pdfUrl: string | null = null;
  try {
    pdfUrl = await getStorage().getSignedUrl(doc.url_pdf, SIGNED_URL_TTL);
  } catch {
    pdfUrl = null; // configuration du stockage incomplète : l'aperçu est indisponible
  }

  return (
    <SignerForm
      token={token}
      numero={doc.numero}
      giteNom={resa.gites?.nom ?? ''}
      dateArrivee={fmtDateFr(resa.date_arrivee)}
      dateDepart={fmtDateFr(resa.date_depart)}
      montantTtc={fmtEuro(montants.totalTtc)}
      montantOptions={montants.options !== 0 ? fmtEuro(montants.options) : null}
      consentement={texteConsentement(doc.numero)}
      pdfUrl={pdfUrl}
    />
  );
}

const MESSAGE_INVALIDE =
  "Ce lien de signature n'est pas reconnu. Vérifiez l'adresse reçue par e-mail ou contactez Les Gîtes de Samoyas.";
