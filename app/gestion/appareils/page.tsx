import { listerAppareils } from "@/lib/gestion/connexion";

import { actionRetirerAppareil } from "../actions";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";

export const dynamic = "force-dynamic";

function quand(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }).format(d);
}

export default async function PageAppareils({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await exigerSession();
  const q = await searchParams;
  const appareils = await listerAppareils(session.compteId);

  return (
    <>
      <Entete courante="/gestion/appareils" />
      <main className={styles.page}>
        <h1>Appareils reconnus</h1>
        <p className={styles.aide}>
          Un appareil reconnu se connecte avec le mot de passe seul. Retiré, il redemandera le code reçu par courriel. Un
          téléphone perdu ou un ordinateur vendu se retire ici, sans changer le mot de passe.
        </p>
        {q.info === "retire" && <p className={`${styles.message} ${styles.ok}`}>L&apos;appareil a été retiré.</p>}
        <div className={styles.carte}>
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th>Appareil</th>
                <th>Dernière connexion</th>
                <th>Oublié le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {appareils.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.description}
                    {a.id === session.appareilId && <strong> (cet appareil)</strong>}
                    <br />
                    <span className={styles.aide}>reconnu depuis le {quand(a.creeLe)}</span>
                  </td>
                  <td>{quand(a.derniereConnexion)}</td>
                  <td>{quand(a.oublieLe)}</td>
                  <td>
                    <form action={actionRetirerAppareil}>
                      <input type="hidden" name="appareil" value={a.id} />
                      <button type="submit" className={styles.boutonDiscret}>
                        Retirer
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
