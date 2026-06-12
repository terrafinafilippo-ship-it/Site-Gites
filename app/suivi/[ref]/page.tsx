import type { Metadata } from "next";
import Link from "next/link";
import ArrivalInfo from "./ArrivalInfo";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Suivi de réservation — Les Gîtes de Samoyas",
};

interface Params {
  ref: string;
}

export function generateStaticParams(): Params[] {
  // Référence de démonstration (cf. suivi.html / reserver.html)
  return [{ ref: "SAM-2026-07-LP-4271" }];
}

export default async function SuiviPage({ params }: { params: Promise<Params> }) {
  const { ref } = await params;
  const reference = decodeURIComponent(ref);

  return (
    <>
      <section className={styles.idBanner}>
        <div className="wrap">
          <div className={styles.idBannerGrid}>
            <div>
              <span className="eyebrow on-dark" style={{ color: "var(--color-gold-taupe)" }}>
                Votre séjour
              </span>
              <h1 style={{ marginTop: 14 }}>LaPhine — du 11 au 18 juillet 2026</h1>
              <div className={styles.idBannerRefRow}>
                <span>Réservation <strong>{reference}</strong></span>
                <span>Patricia &amp; Nicolas — réponse sous 24 h</span>
                <span>7 nuits · 2 voyageurs</span>
              </div>
            </div>
            <div className={styles.idBannerPrice}>
              <small>Total TTC</small>
              <strong>907,30 €</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.status}>
        <div className="wrap">
          <div className={styles.statusHead}>
            <div>
              <span className="eyebrow">Avancement</span>
              <h2 style={{ marginTop: 10 }}>Où en est votre dossier ?</h2>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-gray-medium)" }}>
              Mise à jour automatique · accès par lien sécurisé reçu par email
            </div>
          </div>
          <div className={styles.statusGrid}>
            {/* 1. Contrat — todo */}
            <div className={styles.statusCard}>
              <div className={styles.statusCardNum}>01</div>
              <div className={`${styles.statusCardIcon} ${styles.todo}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </div>
              <h4>Contrat à signer</h4>
              <span className={`${styles.statusCardState} ${styles.todo}`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>
                À faire
              </span>
              <p>Signature électronique eIDAS. Verrouille les coordonnées d&apos;arrivée.</p>
              <div className={styles.statusCardWhen}>Sous 48 h</div>
              <a href="#" className={styles.statusCardCta}>
                Signer le contrat
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
                </svg>
              </a>
            </div>

            {/* 2. Acompte — done */}
            <div className={styles.statusCard}>
              <div className={styles.statusCardNum}>02</div>
              <div className={`${styles.statusCardIcon} ${styles.done}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h4>Acompte 30 %</h4>
              <span className={`${styles.statusCardState} ${styles.done}`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Réglé · 272,19 €
              </span>
              <p>Reçu envoyé à votre adresse email. Téléchargeable en PDF.</p>
              <div className={styles.statusCardWhen}>19 mai 2026</div>
              <a href="#" className={styles.statusCardCta}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><line x1="4" y1="20" x2="20" y2="20" />
                </svg>
                Reçu PDF
              </a>
            </div>

            {/* 3. Solde — scheduled */}
            <div className={styles.statusCard}>
              <div className={styles.statusCardNum}>03</div>
              <div className={`${styles.statusCardIcon} ${styles.scheduled}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h4>Solde du séjour</h4>
              <span className={`${styles.statusCardState} ${styles.scheduled}`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                Programmé
              </span>
              <p>635,11 € prélevés automatiquement sur la même carte. Modifiable jusqu&apos;à J-31.</p>
              <div className={styles.statusCardWhen}>J − 30 · 11 juin 2026</div>
            </div>

            {/* 4. Caution — upcoming */}
            <div className={styles.statusCard}>
              <div className={styles.statusCardNum}>04</div>
              <div className={`${styles.statusCardIcon} ${styles.upcoming}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="11" width="14" height="10" rx="1" /><path d="M9 11V7a3 3 0 0 1 6 0v4" />
                </svg>
              </div>
              <h4>Caution Swikly</h4>
              <span className={`${styles.statusCardState} ${styles.upcoming}`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                À venir
              </span>
              <p>
                Empreinte bancaire de 500 €, non débitée sauf dégât constaté. Libérée 7 jours après
                votre départ.
              </p>
              <div className={styles.statusCardWhen}>J − 7 · 4 juillet 2026</div>
            </div>
          </div>

          <ArrivalInfo />
        </div>
      </section>

      <section className={styles.actions}>
        <div className="wrap">
          <div className={styles.statusHead}>
            <div>
              <span className="eyebrow">Actions sur votre dossier</span>
              <h2 style={{ marginTop: 10 }}>Besoin de modifier quelque chose ?</h2>
            </div>
          </div>
          <div className={styles.actionsGrid}>
            <div className={styles.actionCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
              <strong>Modifier mes coordonnées</strong>
              <p>Vous pouvez mettre à jour téléphone, email, adresse postale jusqu&apos;au jour de l&apos;arrivée.</p>
              <a href="#">Modifier les coordonnées →</a>
            </div>
            <div className={styles.actionCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="6" width="20" height="13" rx="1.5" /><line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <strong>Changer de carte bancaire</strong>
              <p>La nouvelle carte sera utilisée pour le solde du séjour. À faire avant J-30 (11 juin).</p>
              <a href="#">Mettre à jour la carte →</a>
            </div>
            <div className={styles.actionCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <strong>Annuler ma réservation</strong>
              <p>Selon le barème CGV. Plus vous nous prévenez tôt, plus le remboursement est élevé.</p>
              <Link href="/legal/cgv">Voir le barème d&apos;annulation →</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
