// Avis des clients (Phase 6, D-40) : tous les avis, du plus récent au plus
// ancien, retirés compris. Un avis publié se retire seulement pour l'un des
// motifs de la politique des avis, en deux temps ; le client reçoit le motif.
import Link from "next/link";

import { MOTIFS_RETRAIT } from "@/db/schema";
import { LIBELLES_MOTIF, lireAvisGestion } from "@/lib/avis";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { fmtDateLongue } from "@/lib/format";
import { plageDates } from "@/lib/courriels-textes";

import { actionRetirerAvis } from "../actions-avis";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { FormulairePlan } from "../tarifs/Formulaires";

export const dynamic = "force-dynamic";

export default async function PageAvis() {
  await exigerSession();
  const avis = await lireAvisGestion();

  return (
    <>
      <Entete courante="/gestion/avis" />
      <main className={styles.page}>
        <h1>Avis</h1>
        <p className={styles.aide}>
          Les avis laissés par vos clients après leur séjour, publiés dès leur dépôt sur la page du gîte. Un avis ne se retire que
          pour l&apos;un des motifs de la{" "}
          <Link href="/legal/avis" target="_blank">
            politique des avis
          </Link>{" "}
          ; un avis critique ou mal noté ne se retire pas. Le client reçoit le motif par courriel.
        </p>
        {avis.length === 0 && (
          <section className={styles.carte}>
            <p>Aucun avis pour l&apos;instant.</p>
          </section>
        )}
        {avis.map((a) => (
          <section key={a.id} className={styles.carte} aria-labelledby={`avis-${a.id}`}>
            <h2 id={`avis-${a.id}`}>
              {a.note}/5 — {a.gite} — {a.signature}
            </h2>
            <p className={styles.aide}>
              <Link href={`/gestion/reservations/${a.reservationId}`}>{a.reference}</Link> · {a.client} · séjour du{" "}
              {plageDates(a.arrivee, a.depart, "fr")} · publié le {fmtDateLongue(aujourdhuiParis(a.publieLe))}
            </p>
            <p style={{ whiteSpace: "pre-line" }}>{a.commentaire ?? "Pas de commentaire."}</p>
            {a.retireLe && a.motif ? (
              <p className={`${styles.message} ${styles.ko}`}>
                Retiré le {fmtDateLongue(aujourdhuiParis(a.retireLe))} : {LIBELLES_MOTIF[a.motif].fr}.
              </p>
            ) : (
              <details className={styles.replie}>
                <summary>Retirer cet avis…</summary>
                <FormulairePlan action={actionRetirerAvis.bind(null, a.id)} libelle="Vérifier le retrait…" danger>
                  <div className={styles.champ}>
                    <label htmlFor={`motif-${a.id}`}>Motif du retrait</label>
                    <select id={`motif-${a.id}`} name="motif" defaultValue="" required>
                      <option value="" disabled>
                        Choisir le motif
                      </option>
                      {MOTIFS_RETRAIT.map((m) => (
                        <option key={m} value={m}>
                          {LIBELLES_MOTIF[m].fr}
                        </option>
                      ))}
                    </select>
                  </div>
                </FormulairePlan>
              </details>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
