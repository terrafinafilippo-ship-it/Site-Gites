// Accueil du back-office (Phase 5, lot 2, réponses 9 et a du cadrage du
// 6 novembre 2026) : tout ce qui demande un geste MAINTENANT, quelle que soit
// la date du séjour (lib/gestion/a-traiter.ts), puis les arrivées et les
// départs des 7 prochains jours. Les chiffres ont leur page (lot 6,
// /gestion/statistiques).
import Link from "next/link";

import { fmtDateCourte, fmtDateLongue, fmtHeure } from "@/lib/format";
import { arriveesDeparts, listerATraiter, type Mouvement } from "@/lib/gestion/a-traiter";

import { actionCestFait, actionRenvoyerContrat } from "./actions-reservations";
import Entete from "./Entete";
import styles from "./gestion.module.css";
import { exigerSession } from "./outils";
import { GesteBouton } from "./reservations/Gestes";

export const dynamic = "force-dynamic";

function Mouvements({ titre, liste, vide }: { titre: string; liste: Mouvement[]; vide: string }) {
  return (
    <div>
      <h3>{titre}</h3>
      {liste.length === 0 ? (
        <p className={styles.aide}>{vide}</p>
      ) : (
        <ul>
          {liste.map((m) => (
            <li key={`${m.reservationId}-${m.date}`}>
              {fmtDateCourte(m.date)}
              {m.heure ? `, ${fmtHeure(m.heure)}` : ""} — <Link href={`/gestion/reservations/${m.reservationId}`}>{m.client}</Link>, {m.gite} (
              {m.voyageurs} pers.)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AccueilGestion() {
  await exigerSession();
  const [taches, mouvements] = await Promise.all([listerATraiter(), arriveesDeparts()]);

  return (
    <>
      <Entete courante="/gestion" />
      <main className={styles.page}>
        <h1>À traiter</h1>
        {taches.length === 0 ? (
          <p className={`${styles.message} ${styles.ok}`}>Rien à traiter pour le moment.</p>
        ) : (
          taches.map((t) => (
            <article key={t.cle} className={styles.tache}>
              <h3>{t.titre}</h3>
              {t.reference && (
                <p className={styles.aide}>
                  {t.client}, {t.gite} · {t.reference} · depuis le {fmtDateLongue(t.depuis)}
                </p>
              )}
              <p>{t.detail}</p>
              <div className={styles.ligne}>
                {t.gestes.includes("fiche") && t.reservationId && (
                  <Link href={`/gestion/reservations/${t.reservationId}`} className={styles.boutonSecondaire}>
                    Ouvrir la réservation
                  </Link>
                )}
                {t.gestes.includes("reglages") && (
                  <Link href="/gestion/reglages" className={styles.boutonSecondaire}>
                    Ouvrir les réglages
                  </Link>
                )}
                {t.gestes.includes("tarifs") && (
                  <Link href="/gestion/tarifs" className={styles.boutonSecondaire}>
                    Ouvrir les tarifs
                  </Link>
                )}
                {t.gestes.includes("renvoyer_contrat") && t.reservationId && (
                  <GesteBouton action={actionRenvoyerContrat.bind(null, t.reservationId)} libelle="Renvoyer le lien de signature" discret />
                )}
                {t.gestes.includes("c_est_fait") && (
                  <GesteBouton
                    action={actionCestFait.bind(null, t.cle)}
                    libelle="C'est fait"
                    confirmation="Retirer cette ligne de la liste ? Faites-le une fois le problème réglé."
                    discret
                  />
                )}
              </div>
            </article>
          ))
        )}

        <section className={styles.carte}>
          <h2>Les 7 prochains jours</h2>
          <div className={styles.grille}>
            <Mouvements titre="Arrivées" liste={mouvements.arrivees} vide="Aucune arrivée." />
            <Mouvements titre="Départs" liste={mouvements.departs} vide="Aucun départ." />
          </div>
        </section>
      </main>
    </>
  );
}
