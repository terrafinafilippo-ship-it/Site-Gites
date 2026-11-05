// Accueil du back-office — PROVISOIRE (Phase 5, lot 1). La liste « à traiter »
// et les arrivées et départs de la semaine arrivent au lot 2 (réponse 15 A du
// cadrage) ; les chiffres auront leur page, au lot 6.
import Link from "next/link";

import Entete from "./Entete";
import styles from "./gestion.module.css";
import { exigerSession } from "./outils";

export const dynamic = "force-dynamic";

export default async function AccueilGestion() {
  const session = await exigerSession();
  return (
    <>
      <Entete courante="/gestion" />
      <main className={styles.page}>
        <h1>Accueil</h1>
        <p className={styles.aide}>
          Connecté depuis {session.appareil}. La liste des choses à traiter et les arrivées de la semaine arrivent ici
          prochainement.
        </p>
        <div className={styles.carte}>
          <h2>Pour l&apos;instant</h2>
          <ul>
            <li>
              <Link href="/gestion/reglages">Réglages</Link> : horaires, délais, compte du virement, destinataires des
              alertes.
            </li>
            <li>
              <Link href="/gestion/appareils">Appareils</Link> : les ordinateurs et téléphones reconnus, et les retirer.
            </li>
          </ul>
        </div>
      </main>
    </>
  );
}
