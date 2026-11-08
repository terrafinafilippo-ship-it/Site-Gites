// Calendrier (Phase 5, lot 4) : un mois, les trois gîtes l'un sous l'autre,
// une case par nuit (réponse 2 A) ; fermer et rouvrir des nuits d'un geste
// (décision 10, réponse 3) ; poser et lever une option pour un client au
// téléphone (réponse 1 B).
import Link from "next/link";

import { ajouterJours, jourSemaineIso, premierJourDuMois } from "@/lib/dates-civiles";
import { fmtMois, INITIALES_JOURS } from "@/lib/format";
import { lireCalendrierGestion, type CaseNuit, type JourGite } from "@/lib/gestion/calendrier";
import { dateLisible, plageLisible } from "@/lib/gestion/tarifs-regles";

import { actionFermer, actionLeverOption, actionPoserOption, actionRouvrir } from "../actions-calendrier";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { GesteBouton, GesteFormulaire } from "../reservations/Gestes";

export const dynamic = "force-dynamic";

const CLASSES: Record<CaseNuit["etat"], string> = {
  libre: "",
  sans_tarif: styles.sansTarif,
  reserve: styles.nuitReserve,
  paiement: styles.nuitPaiement,
  ferme: styles.nuitFerme,
  option: styles.nuitOption,
};

function description(c: CaseNuit): string {
  switch (c.etat) {
    case "libre":
      return "libre";
    case "sans_tarif":
      return "sans tarif : pas réservable en ligne";
    case "reserve":
      return `réservée : ${c.client}`;
    case "paiement":
      return "en cours de paiement par un client du site";
    case "ferme":
      return "bloquée";
    case "option":
      return `option de ${c.client}, jusqu'au ${dateLisible(c.dernierJour)} inclus`;
  }
}

/** Nuits consécutives de même contenu, pour la liste sous la grille. */
function suites(jours: JourGite[]): { du: string; au: string; c: CaseNuit }[] {
  const r: { du: string; au: string; c: CaseNuit }[] = [];
  for (const j of jours) {
    if (j.case.etat === "libre" || j.case.etat === "sans_tarif") continue;
    const d = r.at(-1);
    if (d && ajouterJours(d.au, 1) === j.date && description(d.c) === description(j.case)) d.au = j.date;
    else r.push({ du: j.date, au: j.date, c: j.case });
  }
  return r;
}

export default async function PageCalendrier({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigerSession();
  const q = await searchParams;
  const page = await lireCalendrierGestion(q.mois);
  const debut = `${page.mois}-01`;
  const lienMois = (decalage: number) => `/gestion/calendrier?mois=${premierJourDuMois(debut, decalage).slice(0, 7)}`;
  const jours = page.lignes[0]?.jours ?? [];

  return (
    <>
      <Entete courante="/gestion/calendrier" />
      <main className={styles.page}>
        <h1>Calendrier</h1>
        <nav className={styles.ligne} aria-label="Mois">
          <Link href={lienMois(-1)} className={styles.boutonSecondaire}>
            ← Mois précédent
          </Link>
          <strong>{fmtMois(debut)}</strong>
          <Link href={lienMois(1)} className={styles.boutonSecondaire}>
            Mois suivant →
          </Link>
          {page.mois !== page.aujourdhui.slice(0, 7) && <Link href="/gestion/calendrier">Aujourd&apos;hui</Link>}
        </nav>

        <div className={`${styles.carte} ${styles.defile}`}>
          <table className={styles.calendrier}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={styles.aide}>Nuit du</span>
                </th>
                {jours.map((j) => (
                  <th key={j.date} scope="col" className={j.date === page.aujourdhui ? styles.aujourdhui : undefined}>
                    {INITIALES_JOURS.fr[jourSemaineIso(j.date) - 1]}
                    <br />
                    {Number(j.date.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.lignes.map((l) => (
                <tr key={l.giteId}>
                  <th scope="row">{l.nom}</th>
                  {l.jours.map((j) => {
                    const titre = `${l.nom}, nuit du ${dateLisible(j.date)} : ${description(j.case)}`;
                    const classe = `${styles.nuit} ${CLASSES[j.case.etat]} ${j.passe ? styles.passe : ""}`;
                    return (
                      <td key={j.date}>
                        {j.case.etat === "reserve" && j.case.reservationId ? (
                          <Link href={`/gestion/reservations/${j.case.reservationId}`} className={classe} title={titre} aria-label={titre} />
                        ) : (
                          <span className={classe} title={titre} aria-label={titre} role="img" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={styles.legende}>
            <li>
              <i className={styles.nuit} style={{ display: "inline-block", width: 12, height: 12, margin: 0 }} /> libre
            </li>
            <li>
              <i className={styles.nuitReserve} /> réservée
            </li>
            <li>
              <i className={styles.nuitPaiement} /> paiement en cours
            </li>
            <li>
              <i className={styles.nuitOption} /> option
            </li>
            <li>
              <i className={styles.nuitFerme} /> bloquée
            </li>
            <li>
              <i className={styles.sansTarif} /> sans tarif
            </li>
          </ul>
        </div>

        <section className={styles.carte}>
          <h2>{fmtMois(debut)} en détail</h2>
          {page.lignes.map((l) => {
            const s = suites(l.jours);
            return (
              <div key={l.giteId}>
                <h3>{l.nom}</h3>
                {s.length === 0 ? (
                  <p className={styles.aide}>Aucune nuit prise ce mois-ci.</p>
                ) : (
                  <ul>
                    {s.map((x) => (
                      <li key={x.du}>
                        {x.du === x.au ? `Nuit du ${dateLisible(x.du)}` : `Nuits ${plageLisible(x.du, x.au)}`} :{" "}
                        {x.c.etat === "reserve" && x.c.reservationId ? (
                          <Link href={`/gestion/reservations/${x.c.reservationId}`}>{description(x.c)}</Link>
                        ) : (
                          description(x.c)
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        <section className={styles.carte} aria-labelledby="titre-fermer">
          <h2 id="titre-fermer">Bloquer des nuits</h2>
          <p className={styles.aide}>
            Les nuits choisies, premier et dernier jour compris, ne sont plus réservables par personne, sans paiement. Elles le restent
            jusqu&apos;à ce que vous les débloquiez.
          </p>
          <GesteFormulaire action={actionFermer} libelle="Bloquer ces nuits">
            <div className={styles.champ}>
              <label htmlFor="fermer-gite">Gîte</label>
              <select id="fermer-gite" name="gite" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {page.gites.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.ligne}>
              <div className={styles.champ}>
                <label htmlFor="fermer-du">Du</label>
                <input id="fermer-du" name="du" type="date" min={page.aujourdhui} required />
              </div>
              <div className={styles.champ}>
                <label htmlFor="fermer-au">Au (inclus)</label>
                <input id="fermer-au" name="au" type="date" min={page.aujourdhui} required />
              </div>
            </div>
          </GesteFormulaire>
        </section>

        <section className={styles.carte} aria-labelledby="titre-fermees">
          <h2 id="titre-fermees">Nuits bloquées à venir</h2>
          {page.blocs.length === 0 ? (
            <p className={styles.aide}>Aucune.</p>
          ) : (
            page.blocs.map((b) => (
              <article key={`${b.giteId}-${b.du}`} className={styles.periode}>
                <p>
                  <strong>{b.gite}</strong> : {b.du === b.au ? `nuit du ${dateLisible(b.du)}` : `nuits ${plageLisible(b.du, b.au)} inclus`}
                </p>
                <GesteBouton action={actionRouvrir.bind(null, b.giteId, b.du, b.au)} libelle="Débloquer ces nuits" discret />
              </article>
            ))
          )}
        </section>

        <section className={styles.carte} aria-labelledby="titre-option">
          <h2 id="titre-option">Poser une option</h2>
          <p className={styles.aide}>
            Pour un client au téléphone : ses nuits sont bloquées pour tous sauf pour lui. Il reçoit un courriel avec un lien pour réserver et payer
            en ligne. Sans paiement, les nuits redeviennent libres à la fin du {page.dureeOptionJours}
            {page.dureeOptionJours === 1 ? "er" : "e"} jour (réglage).
          </p>
          <GesteFormulaire action={actionPoserOption} libelle="Poser l'option et envoyer le lien">
            <div className={styles.champ}>
              <label htmlFor="option-gite">Gîte</label>
              <select id="option-gite" name="gite" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {page.gites.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.ligne}>
              <div className={styles.champ}>
                <label htmlFor="option-arrivee">Arrivée</label>
                <input id="option-arrivee" name="arrivee" type="date" min={page.aujourdhui} required />
              </div>
              <div className={styles.champ}>
                <label htmlFor="option-depart">Départ</label>
                <input id="option-depart" name="depart" type="date" min={page.aujourdhui} required />
              </div>
            </div>
            <div className={styles.champ}>
              <label htmlFor="option-nom">Nom du client, tel qu&apos;il ouvrira le courriel (« M. Durand »)</label>
              <input id="option-nom" name="nom" type="text" maxLength={80} autoComplete="off" required className={styles.large} />
            </div>
            <div className={styles.champ}>
              <label htmlFor="option-email">Courriel du client</label>
              <input id="option-email" name="email" type="email" maxLength={254} autoComplete="off" required className={styles.large} />
            </div>
            <div className={styles.champ}>
              <label htmlFor="option-langue">Langue du courriel</label>
              <select id="option-langue" name="langue" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </select>
            </div>
          </GesteFormulaire>
        </section>

        <section className={styles.carte} aria-labelledby="titre-options">
          <h2 id="titre-options">Options en cours</h2>
          {page.options.length === 0 ? (
            <p className={styles.aide}>Aucune.</p>
          ) : (
            page.options.map((o) => (
              <article key={o.id} className={styles.periode}>
                <p>
                  <strong>{o.client}</strong> ({o.email}) : {o.gite} {plageLisible(o.arrivee, o.depart)}
                </p>
                <p className={styles.aide}>Gardée jusqu&apos;au {dateLisible(o.dernierJour)} inclus.</p>
                <GesteBouton
                  action={actionLeverOption.bind(null, o.id)}
                  libelle="Lever l'option"
                  confirmation={`Lever l'option de ${o.client} ? Ses nuits redeviennent libres pour tous, et son lien ne marche plus.`}
                  discret
                />
              </article>
            ))
          )}
        </section>
      </main>
    </>
  );
}
