'use client';

// Formulaire de signature (client) : nom et prénom du signataire, case
// d'acceptation reprenant le texte de consentement EXACT (lib/constantes.ts),
// appel de POST /api/contrats/signer, puis écran de confirmation avec le numéro
// du contrat et le lien vers le PDF signé.
//
// Mise en forme sobre et fonctionnelle (Tailwind) : l'habillage graphique est
// le sujet de la Phase 6.

import { useState } from 'react';

type Etat = 'idle' | 'envoi' | 'signe' | 'erreur';

interface ReponseSignature {
  statut: string;
  numero: string;
  signature_id: string;
  document_signe_path: string;
  document_signe_url: string | null;
}

export function SignerForm({
  token,
  numero,
  giteNom,
  dateArrivee,
  dateDepart,
  montantTtc,
  montantOptions,
  consentement,
  pdfUrl,
}: {
  token: string;
  numero: string;
  giteNom: string;
  dateArrivee: string;
  dateDepart: string;
  montantTtc: string;
  montantOptions: string | null; // null : aucune option, la ligne n'est pas affichée
  consentement: string;
  pdfUrl: string | null;
}) {
  const [nom, setNom] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [etat, setEtat] = useState<Etat>('idle');
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<ReponseSignature | null>(null);

  const peutSigner = nom.trim().length > 1 && accepte && etat !== 'envoi';

  async function signer() {
    setEtat('envoi');
    setErreur('');
    try {
      const res = await fetch('/api/contrats/signer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signataire_nom: nom.trim(), accepte: true }),
      });
      const data = (await res.json()) as Partial<ReponseSignature> & { error?: string };
      if (!res.ok) {
        setErreur(data.error ?? messagePourStatut(res.status));
        setEtat('erreur');
        return;
      }
      setResultat(data as ReponseSignature);
      setEtat('signe');
    } catch {
      setErreur('Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.');
      setEtat('erreur');
    }
  }

  if (etat === 'signe' && resultat) {
    return (
      <Shell>
        <p className="text-sm uppercase tracking-wide">Les Gîtes de Samoyas</p>
        <h1 className="text-2xl font-semibold mt-2 mb-4">Contrat signé</h1>
        <p className="leading-relaxed">
          Merci. Votre signature du contrat <strong>{resultat.numero}</strong> a bien été
          enregistrée.
        </p>
        <p className="leading-relaxed mt-3">
          Identifiant de signature : <code className="text-sm">{resultat.signature_id}</code>
        </p>
        {resultat.document_signe_url ? (
          <p className="mt-4">
            <a
              href={resultat.document_signe_url}
              target="_blank"
              rel="noreferrer"
              className="underline font-medium"
            >
              Télécharger le contrat signé (PDF)
            </a>
            <span className="block text-sm mt-1">
              Ce lien est valable une heure. Vous recevrez également le contrat signé par e-mail.
            </span>
          </p>
        ) : (
          <p className="mt-4 text-sm">Vous recevrez le contrat signé par e-mail.</p>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm uppercase tracking-wide">Signature de votre contrat de location</p>
      <h1 className="text-2xl font-semibold mt-2 mb-6">Contrat {numero}</h1>

      {/* Récapitulatif */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-6 p-4 border rounded">
        <Recap label="Gîte" value={giteNom} />
        <Recap label="Montant total du séjour" value={montantTtc} />
        {montantOptions !== null && <Recap label="Dont options" value={montantOptions} />}
        <Recap label="Arrivée" value={dateArrivee} />
        <Recap label="Départ" value={dateDepart} />
      </dl>

      {/* Aperçu du contrat */}
      <h2 className="text-base font-semibold mb-2">Votre contrat</h2>
      {pdfUrl ? (
        <>
          <iframe
            src={pdfUrl}
            title={`Contrat ${numero}`}
            className="w-full border rounded bg-white"
            style={{ height: '70vh', minHeight: 420 }}
          />
          <p className="text-sm mt-2 mb-6">
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
              Ouvrir le PDF dans un nouvel onglet
            </a>
          </p>
        </>
      ) : (
        <p className="text-sm mb-6">
          L&apos;aperçu du PDF est momentanément indisponible. Contactez Les Gîtes de Samoyas
          avant de signer.
        </p>
      )}

      {/* Identité du signataire */}
      <label htmlFor="signataire_nom" className="block font-semibold mb-1">
        Vos nom et prénom
      </label>
      <input
        id="signataire_nom"
        name="signataire_nom"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Prénom NOM"
        autoComplete="name"
        maxLength={120}
        className="block w-full border rounded px-3 py-2 mb-5 text-base"
      />

      {/* Consentement (texte exact enregistré comme preuve) */}
      <label className="flex items-start gap-3 border rounded p-3 mb-5 cursor-pointer">
        <input
          type="checkbox"
          name="accepte"
          checked={accepte}
          onChange={(e) => setAccepte(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span className="leading-relaxed">{consentement}</span>
      </label>

      {etat === 'erreur' && (
        <p role="alert" className="border rounded p-3 mb-4 text-sm">
          {erreur}
        </p>
      )}

      <button
        type="button"
        onClick={signer}
        disabled={!peutSigner}
        className="block w-full border rounded px-4 py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {etat === 'envoi' ? 'Signature en cours…' : 'Je signe le contrat'}
      </button>

      <p className="text-sm mt-4 leading-relaxed">
        Signature électronique simple au sens de l&apos;article 3, point 10, du règlement
        eIDAS, recueillie directement par la SARL DE LA VOUTE. La date, l&apos;heure, votre
        adresse IP et l&apos;empreinte SHA-256 du document sont enregistrées comme preuve de
        signature.
      </p>
    </Shell>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="border rounded p-6 bg-white">{children}</div>
    </main>
  );
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold m-0">{value || '—'}</dd>
    </div>
  );
}

function messagePourStatut(status: number): string {
  switch (status) {
    case 404:
      return 'Lien de signature invalide.';
    case 409:
      return 'Ce contrat a déjà été signé.';
    case 410:
      return 'Lien de signature expiré.';
    default:
      return 'Une erreur est survenue. Réessayez ou contactez Les Gîtes de Samoyas.';
  }
}
