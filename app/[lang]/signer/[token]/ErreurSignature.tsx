// Écran d'erreur de la page de signature : lien invalide (404), contrat déjà
// signé (409), lien expiré ou réservation annulée (410). Présentationnel pur,
// habillage des pages client du site (page.module.css).
import styles from './page.module.css';

export function ErreurSignature({
  code,
  titre,
  message,
}: {
  code: 404 | 409 | 410;
  titre: string;
  message: string;
}) {
  return (
    <main className={styles.page}>
      <div className={`wrap ${styles.colonne}`}>
        <div className={styles.bloc}>
          <span className="eyebrow">Les Gîtes de Samoyas</span>
          <h1>{titre}</h1>
          <p className={styles.sous}>{message}</p>
          <p className={styles.sous}>Code : {code}</p>
        </div>
      </div>
    </main>
  );
}
