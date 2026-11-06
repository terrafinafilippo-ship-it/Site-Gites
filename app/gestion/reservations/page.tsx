import Link from "next/link";

import { fmtDateCourte } from "@/lib/format";
import { listerReservations, VUES, type Vue } from "@/lib/gestion/reservations";

import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";

export const dynamic = "force-dynamic";

const LIBELLES_VUE: Record<Vue, string> = {
  a_venir: "À venir et en cours",
  passees: "Passées",
  annulees: "Annulées",
};

const STATUTS: Record<string, string> = {
  confirmee: "confirmée",
  terminee: "terminée",
  annulee: "annulée",
};

export default async function PageReservations({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigerSession();
  const q = await searchParams;
  const vue: Vue = (VUES as readonly string[]).includes(q.vue ?? "") ? (q.vue as Vue) : "a_venir";
  const recherche = (q.q ?? "").slice(0, 80);
  const lignes = await listerReservations(vue, recherche);
  const lienVue = (v: Vue) => `/gestion/reservations?vue=${v}${recherche ? `&q=${encodeURIComponent(recherche)}` : ""}`;

  return (
    <>
      <Entete courante="/gestion/reservations" />
      <main className={styles.page}>
        <h1>Réservations</h1>
        <nav className={styles.onglets} aria-label="Filtre">
          {VUES.map((v) => (
            <Link key={v} href={lienVue(v)} aria-current={v === vue ? "page" : undefined}>
              {LIBELLES_VUE[v]}
            </Link>
          ))}
        </nav>
        <form method="get" className={styles.ligne}>
          <input type="hidden" name="vue" value={vue} />
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom, courriel ou référence"
            aria-label="Rechercher une réservation"
            className={styles.champRecherche}
          />
          <button type="submit" className={styles.boutonSecondaire}>
            Rechercher
          </button>
        </form>
        <div className={`${styles.carte} ${styles.defile}`}>
          {lignes.length === 0 ? (
            <p>Aucune réservation{recherche ? ` pour « ${recherche} »` : ""}.</p>
          ) : (
            <table className={styles.tableau}>
              <thead>
                <tr>
                  <th>Séjour</th>
                  <th>Client</th>
                  <th>Gîte</th>
                  <th>Voyageurs</th>
                  <th>Référence</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/gestion/reservations/${l.id}`}>
                        {fmtDateCourte(l.arrivee)} → {fmtDateCourte(l.depart)}
                      </Link>
                      {l.enCours && l.statut === "confirmee" && <span className={styles.etiquette}> en cours</span>}
                      {vue !== "a_venir" && <span className={styles.aide}> ({STATUTS[l.statut] ?? l.statut})</span>}
                    </td>
                    <td>
                      {l.client}
                      <br />
                      <span className={styles.aide}>{l.email}</span>
                    </td>
                    <td>{l.gite}</td>
                    <td>{l.voyageurs}</td>
                    <td>{l.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
