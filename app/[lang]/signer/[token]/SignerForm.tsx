'use client';

// Formulaire de signature (client) : nom et prénom du signataire, case
// d'acceptation reprenant le texte de consentement EXACT (lib/constantes.ts),
// appel de POST /api/contrats/signer, puis écran de confirmation avec le numéro
// du contrat et le lien vers le PDF signé.
//
// Habillage des pages client du site (page.module.css, Phase 6) ; les textes
// et le comportement sont ceux de la Phase 1.

import { useState } from 'react';

import { EMETTEUR } from '@/lib/constantes';

import styles from './page.module.css';

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
        <div className={styles.bloc}>
          <span className="eyebrow">Les Gîtes de Samoyas</span>
          <h1>Contrat signé</h1>
          <p className={styles.recu} role="status">
            Merci. Votre signature du contrat <strong>{resultat.numero}</strong> a bien été
            enregistrée.
          </p>
          <p className={styles.sous}>
            Identifiant de signature : <code className={styles.code}>{resultat.signature_id}</code>
          </p>
          {resultat.document_signe_url ? (
            <>
              <p>
                <a
                  href={resultat.document_signe_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Télécharger le contrat signé (PDF)
                </a>
              </p>
              <p className={styles.sous}>
                Ce lien est valable une heure. Vous recevrez également le contrat signé par e-mail.
              </p>
            </>
          ) : (
            <p className={styles.sous}>Vous recevrez le contrat signé par e-mail.</p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className={styles.bloc}>
        <span className="eyebrow">Signature de votre contrat de location</span>
        <h1>Contrat {numero}</h1>

        {/* Récapitulatif */}
        <dl className={styles.recap}>
          <Recap label="Gîte" value={giteNom} />
          <Recap label="Montant total du séjour" value={montantTtc} />
          {montantOptions !== null && <Recap label="Dont options" value={montantOptions} />}
          <Recap label="Arrivée" value={dateArrivee} />
          <Recap label="Départ" value={dateDepart} />
        </dl>
      </div>

      {/* Aperçu du contrat */}
      <div className={styles.bloc}>
        <h2>Votre contrat</h2>
        {pdfUrl ? (
          <>
            <iframe src={pdfUrl} title={`Contrat ${numero}`} className={styles.apercu} />
            <a href={pdfUrl} target="_blank" rel="noreferrer" className={styles.lien}>
              Ouvrir le PDF dans un nouvel onglet
            </a>
          </>
        ) : (
          <p className={styles.sous}>
            L&apos;aperçu du PDF est momentanément indisponible. Contactez Les Gîtes de Samoyas
            avant de signer.
          </p>
        )}
      </div>

      <div className={styles.bloc}>
        {/* Identité du signataire */}
        <div className={styles.champ}>
          <label htmlFor="signataire_nom">Vos nom et prénom</label>
          <input
            id="signataire_nom"
            name="signataire_nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Prénom NOM"
            autoComplete="name"
            maxLength={120}
          />
        </div>

        {/* Consentement (texte exact enregistré comme preuve) */}
        <label className={styles.accord}>
          <input
            type="checkbox"
            name="accepte"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
          />
          <span>{consentement}</span>
        </label>

        {etat === 'erreur' && (
          <p role="alert" className={styles.erreur}>
            {erreur}
          </p>
        )}

        <button
          type="button"
          onClick={signer}
          disabled={!peutSigner}
          className={`btn btn-primary ${styles.signer}`}
        >
          {etat === 'envoi' ? 'Signature en cours…' : 'Je signe le contrat'}
        </button>

        <p className={`${styles.sous} ${styles.mention}`}>
          Signature électronique simple au sens de l&apos;article 3, point 10, du règlement
          eIDAS, recueillie directement par la {EMETTEUR.raisonSociale}. La date, l&apos;heure, votre
          adresse IP et l&apos;empreinte SHA-256 du document sont enregistrées comme preuve de
          signature.
        </p>
      </div>
    </Shell>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={`wrap ${styles.colonne}`}>{children}</div>
    </main>
  );
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
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
