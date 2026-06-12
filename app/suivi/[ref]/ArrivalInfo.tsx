"use client";

import { useState } from "react";
import styles from "./page.module.css";

/** Coordonnées d'arrivée verrouillées/déverrouillées + bascule démo
 *  (reproduit le toggle de suivi.html). */
export default function ArrivalInfo() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <>
      {!unlocked && (
        <div className={styles.arrivalLocked}>
          <div>
            <div className={styles.arrivalLockedIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="11" width="14" height="10" rx="1" />
                <path d="M9 11V7a3 3 0 0 1 6 0v4" />
              </svg>
            </div>
            <h3>Coordonnées d&apos;arrivée — verrouillées</h3>
            <p>
              Le code de la boîte à clés, l&apos;adresse précise du hameau et les numéros directs
              vous seront communiqués dès la signature du contrat. Ils s&apos;afficheront ici, et un
              email vous sera envoyé à J-3.
            </p>
          </div>
          <a href="#" className="btn btn-primary">Signer le contrat</a>
        </div>
      )}

      {unlocked && (
        <div className={styles.arrivalUnlocked}>
          <h3>Coordonnées d&apos;arrivée</h3>
          <div className={styles.arrivalGrid}>
            <div><small>Adresse précise</small><strong>Hameau de Samoyas, 3ᵉ maison à droite — 07430 Savas</strong></div>
            <div><small>Code boîte à clés</small><strong style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}>7430#</strong></div>
            <div><small>Arrivée</small><strong>Samedi 11 juillet — entre 16h et 19h</strong></div>
            <div><small>Départ</small><strong>Samedi 18 juillet — avant 10h</strong></div>
            <div><small>Patricia</small><strong>+33 6 79 33 23 51</strong></div>
            <div><small>Nicolas</small><strong>+33 6 66 89 96 24</strong></div>
          </div>
        </div>
      )}

      {/* Demo toggle */}
      <details className={styles.demoToggle}>
        <summary>⚙ Démo — simuler la signature du contrat</summary>
        <p style={{ marginTop: 8 }}>
          Cliquez pour basculer entre coordonnées verrouillées (avant signature) et déverrouillées
          (après signature).
        </p>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: "8px 14px", minHeight: 36, marginTop: 8 }}
          onClick={() => setUnlocked((u) => !u)}
        >
          Basculer l&apos;état
        </button>
      </details>
    </>
  );
}
