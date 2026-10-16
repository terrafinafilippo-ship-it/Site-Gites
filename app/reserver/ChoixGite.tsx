import Link from "next/link";
import { GITES, GITE_IDS } from "@/lib/data/gites";
import { chiffresDuGite, type ChiffresPublics } from "@/lib/gites-publics";
import EnteteTunnel from "./EnteteTunnel";
import styles from "./page.module.css";

/**
 * /reserver sans gîte précisé (bouton « Réserver un séjour » de l'en-tête) :
 * le client choisit. Avant la Phase 3, ce cas réservait LaPhine sans rien dire.
 * La capacité vient de la base ; si elle ne répond pas, elle n'est pas affichée.
 */
export default function ChoixGite({ publics }: { publics: ChiffresPublics }) {
  return (
    <>
      <EnteteTunnel />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>
            <h1>Quel gîte souhaitez-vous réserver&nbsp;?</h1>
            <div className={styles.recourses}>
              {GITE_IDS.map((id) => {
                const gite = GITES[id];
                const capacite = chiffresDuGite(publics, id)?.capaciteMax ?? null;
                return (
                  <div className={styles.recourse} key={id}>
                    <strong>{gite.name}</strong>
                    <p>
                      {gite.profil}
                      {capacite !== null ? ` · ${capacite} personnes` : ""}
                    </p>
                    <Link
                      href={`/reserver?gite=${id}`}
                      className="btn btn-primary"
                      style={{ marginTop: 12, width: "100%" }}
                    >
                      Choisir {gite.name}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** Le tunnel ne peut pas s'ouvrir (base injoignable, réglages absents) : il le dit, sans prix de repli. */
export function TunnelIndisponible({ nomGite }: { nomGite: string }) {
  return (
    <>
      <EnteteTunnel />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>
            <h1>La réservation en ligne est momentanément indisponible.</h1>
            <p className={styles.stateBlockSub}>
              Il n&apos;est pas possible de réserver {nomGite} en ligne pour le moment.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/contact">Nous contacter</Link>
              <Link className="btn btn-ghost" href="/gites">Voir les gîtes</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
