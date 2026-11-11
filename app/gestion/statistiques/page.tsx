// Statistiques (Phase 5, lot 6) : une année à choisir, de simples tableaux.
// Les choix du gérant sont en tête de lib/gestion/statistiques.ts.
import Link from "next/link";

import { fmtDateCourte, fmtEuro } from "@/lib/format";
import { lireStatistiques, type ChiffresReservations, type ParGite } from "@/lib/gestion/statistiques";

import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";

export const dynamic = "force-dynamic";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const UNE_DECIMALE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const ENTIER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function TableauMois({
  gites,
  valeurs,
  format,
  libelle,
}: {
  gites: { id: string; nom: string }[];
  valeurs: ParGite[];
  format: (n: number) => string;
  libelle: string;
}) {
  const de = (giteId: string) => valeurs.find((v) => v.giteId === giteId)?.mois ?? Array<number>(12).fill(0);
  const totalMois = (i: number) => valeurs.reduce((s, v) => s + v.mois[i], 0);
  const totalGite = (giteId: string) => de(giteId).reduce((s, n) => s + n, 0);
  return (
    <div className={styles.defile}>
      <table className={styles.tableau} aria-label={libelle}>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            {gites.map((g) => (
              <th key={g.id} scope="col">
                {g.nom}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {MOIS.map((m, i) => (
            <tr key={m}>
              <th scope="row">{m}</th>
              {gites.map((g) => (
                <td key={g.id}>{format(de(g.id)[i])}</td>
              ))}
              <td>
                <strong>{format(totalMois(i))}</strong>
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Année</th>
            {gites.map((g) => (
              <td key={g.id}>
                <strong>{format(totalGite(g.id))}</strong>
              </td>
            ))}
            <td>
              <strong>{format(valeurs.reduce((s, v) => s + v.mois.reduce((a, b) => a + b, 0), 0))}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Chiffres({ libelle, c }: { libelle: string; c: ChiffresReservations }) {
  return (
    <tr>
      <th scope="row">{libelle}</th>
      <td>{c.nombre}</td>
      <td>{c.dureeMoyenne === null ? "—" : `${UNE_DECIMALE.format(c.dureeMoyenne)} nuits`}</td>
      <td>{c.delaiMoyen === null ? "—" : `${ENTIER.format(c.delaiMoyen)} jours`}</td>
    </tr>
  );
}

export default async function PageStatistiques({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigerSession();
  const q = await searchParams;
  const s = await lireStatistiques({ annee: q.annee, du: q.du, au: q.au });
  const nomGite = (id: string) => s.gites.find((g) => g.id === id)?.nom ?? "";

  return (
    <>
      <Entete courante="/gestion/statistiques" />
      <main className={styles.page}>
        <h1>Statistiques</h1>
        <nav className={styles.ligne} aria-label="Année">
          <Link href={`/gestion/statistiques?annee=${s.annee - 1}`} className={styles.boutonSecondaire}>
            ← {s.annee - 1}
          </Link>
          <strong>{s.annee}</strong>
          <Link href={`/gestion/statistiques?annee=${s.annee + 1}`} className={styles.boutonSecondaire}>
            {s.annee + 1} →
          </Link>
        </nav>
        <p className={styles.aide}>
          Seules comptent les réservations payées sur le site. Les séjours vendus sur Gîtes de France ou Airbnb n&apos;y sont pas, ni les
          nuits que vous avez bloquées.
        </p>

        <section className={styles.carte} aria-labelledby="titre-nuits">
          <h2 id="titre-nuits">Nuits louées</h2>
          <p className={styles.aide}>Chaque nuit compte dans son mois, même quand le séjour est à cheval sur deux mois.</p>
          <TableauMois gites={s.gites} valeurs={s.nuits} format={(n) => (n === 0 ? "—" : String(n))} libelle="Nuits louées par mois et par gîte" />
        </section>

        <section className={styles.carte} aria-labelledby="titre-sejours">
          <h2 id="titre-sejours">Séjours, hors taxe de séjour</h2>
          <p className={styles.aide}>
            Location et ménage. Chaque séjour compte en entier au mois de son arrivée. Un séjour à venir compte déjà, même si son solde
            n&apos;est pas encore payé. La taxe de séjour et la caution n&apos;en font pas partie.
          </p>
          <TableauMois gites={s.gites} valeurs={s.sejours} format={(n) => (n === 0 ? "—" : fmtEuro(n))} libelle="Séjours par mois d'arrivée et par gîte" />
        </section>

        <section className={styles.carte} aria-labelledby="titre-reservations">
          <h2 id="titre-reservations">Réservations en direct</h2>
          <p className={styles.aide}>Les séjours qui commencent en {s.annee}.</p>
          <div className={styles.defile}>
            <table className={styles.tableau}>
              <thead>
                <tr>
                  <th scope="col">Gîte</th>
                  <th scope="col">Réservations</th>
                  <th scope="col">Durée moyenne</th>
                  <th scope="col">Réservé en moyenne, avant l&apos;arrivée</th>
                </tr>
              </thead>
              <tbody>
                {s.reservations.parGite.map((c) => (
                  <Chiffres key={c.giteId} libelle={nomGite(c.giteId)} c={c} />
                ))}
                <Chiffres libelle="Les trois gîtes" c={s.reservations.total} />
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.carte} aria-labelledby="titre-commissions">
          <h2 id="titre-commissions">Commissions évitées</h2>
          {s.commission.taux === null ? (
            <p>
              Indiquez le taux de commission d&apos;une plateforme dans <Link href="/gestion/reglages">Réglages › Statistiques</Link> pour
              chiffrer les commissions évitées.
            </p>
          ) : (
            <p>
              Avec une commission de {s.commission.taux} %, les {fmtEuro(s.commission.base)} de séjours réservés en direct en {s.annee} vous
              ont évité <strong>{fmtEuro(s.commission.montant ?? 0)}</strong> de commissions.
            </p>
          )}
        </section>

        <section className={styles.carte} aria-labelledby="titre-provenance">
          <h2 id="titre-provenance">D&apos;où viennent les clients</h2>
          <p className={styles.aide}>D&apos;après l&apos;adresse donnée à la réservation, pour les séjours qui commencent en {s.annee}.</p>
          <p>
            Site consulté en français : <strong>{s.provenance.langues.fr}</strong> · en anglais : <strong>{s.provenance.langues.en}</strong>
          </p>
          {s.provenance.pays.length === 0 ? (
            <p className={styles.aide}>Aucun séjour.</p>
          ) : (
            <div className={styles.grille}>
              <table className={styles.tableau}>
                <thead>
                  <tr>
                    <th scope="col">Pays</th>
                    <th scope="col">Réservations</th>
                  </tr>
                </thead>
                <tbody>
                  {s.provenance.pays.map((p) => (
                    <tr key={p.libelle}>
                      <td>{p.libelle}</td>
                      <td>{p.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.provenance.departements.length > 0 && (
                <table className={styles.tableau}>
                  <thead>
                    <tr>
                      <th scope="col">Département (France)</th>
                      <th scope="col">Réservations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.provenance.departements.map((d) => (
                      <tr key={d.code}>
                        <td>{`${d.nom} (${d.code})`}</td>
                        <td>{d.nombre}</td>
                      </tr>
                    ))}
                    {s.provenance.franceSansDepartement > 0 && (
                      <tr>
                        <td>Code postal non reconnu</td>
                        <td>{s.provenance.franceSansDepartement}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        <section className={styles.carte} aria-labelledby="titre-retenues">
          <h2 id="titre-retenues">Cautions retenues</h2>
          {s.retenues.length === 0 ? (
            <p className={styles.aide}>Aucune caution retenue pour les séjours de {s.annee}.</p>
          ) : (
            <>
              <p>
                {s.retenues.length === 1 ? "1 retenue" : `${s.retenues.length} retenues`}, pour{" "}
                <strong>{fmtEuro(s.retenues.reduce((t, r) => t + r.montant, 0))}</strong>.
              </p>
              <ul>
                {s.retenues.map((r) => (
                  <li key={r.reservationId}>
                    {fmtDateCourte(r.date)} — <Link href={`/gestion/reservations/${r.reservationId}`}>{r.client}</Link>, {r.gite} :{" "}
                    {fmtEuro(r.montant)} ({r.motif})
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={styles.carte} aria-labelledby="titre-registre">
          <h2 id="titre-registre">Taxe de séjour : le registre</h2>
          <p className={styles.aide}>
            Les séjours qui commencent entre ces deux dates, premier et dernier jour compris, une ligne par séjour : ce que demande le registre
            de la taxe de séjour. Les mineurs sont exonérés.
          </p>
          <form method="get" className={styles.ligne}>
            <input type="hidden" name="annee" value={s.annee} />
            <div className={styles.champ}>
              <label htmlFor="registre-du">Du</label>
              <input id="registre-du" name="du" type="date" defaultValue={s.registre.du} required />
            </div>
            <div className={styles.champ}>
              <label htmlFor="registre-au">Au (inclus)</label>
              <input id="registre-au" name="au" type="date" defaultValue={s.registre.au} required />
            </div>
            <button type="submit" className={styles.boutonSecondaire}>
              Afficher
            </button>
          </form>
          {s.registre.lignes.length === 0 ? (
            <p className={styles.aide}>Aucun séjour sur cette période.</p>
          ) : (
            <div className={styles.defile}>
              <table className={styles.tableau}>
                <thead>
                  <tr>
                    <th scope="col">Arrivée</th>
                    <th scope="col">Départ</th>
                    <th scope="col">Gîte</th>
                    <th scope="col">Client</th>
                    <th scope="col">Nuits</th>
                    <th scope="col">Adultes</th>
                    <th scope="col">Mineurs exonérés</th>
                    <th scope="col">Nuitées taxées</th>
                    <th scope="col">Taxe</th>
                  </tr>
                </thead>
                <tbody>
                  {s.registre.lignes.map((l) => (
                    <tr key={l.reservationId}>
                      <td>{fmtDateCourte(l.arrivee)}</td>
                      <td>{fmtDateCourte(l.depart)}</td>
                      <td>{l.gite}</td>
                      <td>
                        <Link href={`/gestion/reservations/${l.reservationId}`}>{l.client}</Link>
                        <br />
                        <span className={styles.aide}>{l.reference}</span>
                      </td>
                      <td>{l.nuits}</td>
                      <td>{l.adultes}</td>
                      <td>{l.mineurs}</td>
                      <td>{l.nuitees}</td>
                      <td>{fmtEuro(l.taxe)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" colSpan={7}>
                      Total
                    </th>
                    <td>
                      <strong>{s.registre.nuitees}</strong>
                    </td>
                    <td>
                      <strong>{fmtEuro(s.registre.taxe)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
