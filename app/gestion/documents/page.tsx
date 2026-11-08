// Documents (Phase 5, lot 4, réponse 4 A) : tous les contrats et toutes les
// factures, une recherche, un filtre par année ; ouvrir le PDF, le renvoyer
// au client (le même document, au même numéro).
import Link from "next/link";

import { fmtDateLongue, fmtEuro } from "@/lib/format";
import { libelleRenvoi, listerDocuments } from "@/lib/gestion/documents";

import { actionRenvoyerDocument } from "../actions-calendrier";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { GesteBouton } from "../reservations/Gestes";

export const dynamic = "force-dynamic";

export default async function PageDocuments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigerSession();
  const q = await searchParams;
  const recherche = (q.q ?? "").slice(0, 80);
  const annee = /^\d{4}$/.test(q.annee ?? "") ? Number(q.annee) : null;
  const { lignes, annees } = await listerDocuments(annee, recherche);

  return (
    <>
      <Entete courante="/gestion/documents" />
      <main className={styles.page}>
        <h1>Documents</h1>
        <form method="get" className={styles.ligne}>
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Numéro, nom ou référence"
            aria-label="Rechercher un document"
            className={styles.champRecherche}
          />
          <select name="annee" defaultValue={annee ? String(annee) : ""} aria-label="Année">
            <option value="">Toutes les années</option>
            {annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.boutonSecondaire}>
            Rechercher
          </button>
        </form>
        <p className={styles.aide}>
          « Renvoyer au client » envoie le même document, au même numéro, à l&apos;adresse enregistrée sur la réservation. Si elle a changé,
          corrigez-la d&apos;abord sur la fiche de la réservation.
        </p>
        <div className={`${styles.carte} ${styles.defile}`}>
          {lignes.length === 0 ? (
            <p>Aucun document{recherche ? ` pour « ${recherche} »` : ""}.</p>
          ) : (
            <table className={styles.tableau}>
              <thead>
                <tr>
                  <th>Émis le</th>
                  <th>Document</th>
                  <th>Client</th>
                  <th>Montant</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lignes.map((d) => (
                  <tr key={`${d.sorte}-${d.id}`}>
                    <td>{fmtDateLongue(d.date)}</td>
                    <td>
                      <strong>{d.numero}</strong>
                      <br />
                      {d.libelle}
                      {d.sorte === "contrat" && (
                        <span className={styles.aide}>{d.signeLe ? ` — signé le ${fmtDateLongue(d.signeLe)}` : " — pas encore signé"}</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/gestion/reservations/${d.reservationId}`}>{d.client}</Link>
                      <br />
                      <span className={styles.aide}>
                        {d.gite}, {d.reference}
                      </span>
                    </td>
                    <td>{d.montant === null ? "" : fmtEuro(d.montant)}</td>
                    <td>
                      {d.pdf ? (
                        <a href={`/gestion/documents/pdf?sorte=${d.sorte}&id=${d.id}`} target="_blank" rel="noopener">
                          Ouvrir le PDF
                        </a>
                      ) : (
                        <span className={styles.aide}>PDF pas encore produit</span>
                      )}
                      <GesteBouton
                        action={actionRenvoyerDocument.bind(null, d.sorte, d.id)}
                        libelle={libelleRenvoi(d)}
                        confirmation={`${libelleRenvoi(d)} : ${d.numero} à ${d.email ?? "(aucune adresse)"} ?`}
                        discret
                      />
                    </td>
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
