// Tarifs › Périodes (Phase 5, lot 3, D-34) : une bande de couleurs par année
// (les nuits sans tarif en rouge), la liste des périodes, l'ajout qui découpe
// les périodes recouvertes (réponse 3 B), et « Copier une année » (2 A). Une
// période passée est figée ; une période en cours ne change que sa fin (5 A).
import { ajouterJours, nombreDeNuits, nomJourIso } from "@/lib/dates-civiles";
import { lireTarifsGestion, type PageTarifs } from "@/lib/gestion/tarifs";
import { anneesDesPeriodes, plageLisible, type PeriodeGestion } from "@/lib/gestion/tarifs-regles";

import { actionCopierAnnee, actionPeriode, actionSupprimerPeriode } from "../../actions-tarifs";
import styles from "../../gestion.module.css";
import { exigerSession } from "../../outils";
import Cadre from "../Cadre";
import { ChampsRegles, reglesLisibles } from "../Champs";
import { FormulairePlan } from "../Formulaires";

export const dynamic = "force-dynamic";

const COULEURS = ["#3d5b45", "#b8860b", "#6b8e23", "#4682b4", "#8b5a2b", "#7b68ee", "#2e8b57", "#cd853f"];

interface Segment {
  debut: string;
  fin: string;
  tarifId: string | null;
  passe: boolean;
}

/** Les nuits de l'année regroupées par tarif (null = sans tarif) et par « passé ou non ». */
function segments(annee: number, periodes: PeriodeGestion[], aujourdhui: string): Segment[] {
  const resultat: Segment[] = [];
  const fin = `${annee + 1}-01-01`;
  for (let d = `${annee}-01-01`; d < fin; d = ajouterJours(d, 1)) {
    const tarifId = periodes.find((p) => p.debut <= d && d < p.fin)?.tarifId ?? null;
    const passe = d < aujourdhui;
    const dernier = resultat[resultat.length - 1];
    if (dernier && dernier.tarifId === tarifId && dernier.passe === passe) dernier.fin = ajouterJours(d, 1);
    else resultat.push({ debut: d, fin: ajouterJours(d, 1), tarifId, passe });
  }
  return resultat;
}

function Bande({ annee, page, couleur }: { annee: number; page: PageTarifs; couleur: (id: string) => string }) {
  const noms = new Map(page.tarifs.map((t) => [t.id, t.nom]));
  return (
    <div>
      <h3>{annee}</h3>
      <div className={styles.bande} role="img" aria-label={`Tarifs de ${annee}`}>
        {segments(annee, page.periodes, page.aujourdhui).map((s) => (
          <div
            key={s.debut}
            className={`${styles.segment} ${s.tarifId === null ? styles.sansTarif : ""} ${s.passe ? styles.passe : ""}`}
            style={{ flexGrow: nombreDeNuits(s.debut, s.fin), ...(s.tarifId ? { background: couleur(s.tarifId) } : {}) }}
            title={`${s.tarifId ? noms.get(s.tarifId) : "Sans tarif"} : ${plageLisible(s.debut, s.fin)}`}
          />
        ))}
      </div>
      <div className={styles.mois} aria-hidden="true">
        {["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function ChampsPeriode({ id, p, page, enCours }: { id: string; p: PeriodeGestion | null; page: PageTarifs; enCours: boolean }) {
  return (
    <>
      <div className={styles.grille}>
        <div className={styles.champ}>
          <label htmlFor={`${id}-tarif`}>Tarif</label>
          {enCours ? (
            <>
              <input type="hidden" name="tarif" value={p?.tarifId} />
              <span>{page.tarifs.find((t) => t.id === p?.tarifId)?.nom}</span>
            </>
          ) : (
            <select id={`${id}-tarif`} name="tarif" defaultValue={p?.tarifId ?? ""} required>
              <option value="" disabled>
                Choisir…
              </option>
              {page.tarifs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-debut`}>Première nuit</label>
          <input id={`${id}-debut`} name="debut" type="date" defaultValue={p?.debut ?? ""} readOnly={enCours} required />
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-fin`}>Jour de départ (fin)</label>
          <input id={`${id}-fin`} name="fin" type="date" defaultValue={p?.fin ?? ""} required />
        </div>
      </div>
      {enCours ? (
        <>
          <p className={styles.aide}>Elle a commencé : seule sa date de fin peut changer (les nuits passées gardent leur tarif).</p>
          {/* Les règles restent celles de la période. */}
          <input type="hidden" name="nuits_minimum" value={p?.nuitsMinimum ?? ""} />
          <input type="hidden" name="arrivee_mode" value={p?.joursArrivee ? "propre" : "general"} />
          {p?.joursArrivee?.map((j) => <input key={`a${j}`} type="hidden" name="arrivee" value={j} />)}
          <input type="hidden" name="depart_mode" value={p?.joursDepart ? "propre" : "general"} />
          {p?.joursDepart?.map((j) => <input key={`d${j}`} type="hidden" name="depart" value={j} />)}
          <input type="hidden" name="bareme" value={p?.baremeId ?? ""} />
        </>
      ) : (
        <ChampsRegles
          id={id}
          valeurs={p ?? { nuitsMinimum: null, joursArrivee: null, joursDepart: null, baremeId: null }}
          baremes={page.baremes.map((b) => ({ id: b.id, nom: b.nom }))}
          dessus="celles du tarif, puis les règles générales"
        />
      )}
    </>
  );
}

export default async function PagePeriodes() {
  await exigerSession();
  const page = await lireTarifsGestion();
  const auj = page.aujourdhui;
  const anneeCourante = Number(auj.slice(0, 4));
  const derniere = page.periodes.reduce((m, p) => Math.max(m, Number(ajouterJours(p.fin, -1).slice(0, 4))), anneeCourante);
  const annees = Array.from({ length: Math.max(derniere, anneeCourante + 1) - anneeCourante + 1 }, (_, i) => anneeCourante + i);
  const index = new Map(page.tarifs.map((t, i) => [t.id, i]));
  const couleur = (id: string) => COULEURS[(index.get(id) ?? 0) % COULEURS.length];
  const visibles = page.periodes.filter((p) => p.fin > `${anneeCourante}-01-01`);
  const aCopier = anneesDesPeriodes(page.periodes).at(-1);
  const jour = page.general.jourDebut;

  return (
    <Cadre courant="/gestion/tarifs/periodes" etat={page.etat}>
      <section className={styles.carte} aria-labelledby="titre-annees">
        <h2 id="titre-annees">L&apos;année en couleurs</h2>
        <p className={styles.aide}>Chaque couleur est un tarif ; le rouge, des nuits sans tarif (pas réservables). Le passé est pâli.</p>
        <ul className={styles.legende}>
          {page.tarifs.map((t) => (
            <li key={t.id}>
              <i style={{ background: couleur(t.id) }} /> {t.nom}
            </li>
          ))}
          <li>
            <i className={styles.sansTarif} /> sans tarif
          </li>
        </ul>
        {annees.map((a) => (
          <Bande key={a} annee={a} page={page} couleur={couleur} />
        ))}
      </section>

      <section className={styles.carte} aria-labelledby="titre-ajout">
        <h2 id="titre-ajout">Ajouter une période</h2>
        <p className={styles.aide}>
          {jour === null ? "Une période peut commencer n'importe quel jour." : `Une période commence et finit un ${nomJourIso(jour)} (réglage dans « Règles »).`}{" "}
          Placée au milieu d&apos;une autre, elle la découpe : le résultat s&apos;affiche avant d&apos;enregistrer.
        </p>
        {page.tarifs.length === 0 ? (
          <p>Créez d&apos;abord un tarif dans « Prix ».</p>
        ) : (
          <FormulairePlan action={actionPeriode.bind(null, null)} libelle="Vérifier…" vider>
            <ChampsPeriode id="p-nouvelle" p={null} page={page} enCours={false} />
          </FormulairePlan>
        )}
      </section>

      {aCopier !== undefined && (
        <section className={styles.carte} aria-labelledby="titre-copie">
          <h2 id="titre-copie">
            Copier {aCopier} sur {aCopier + 1}
          </h2>
          <p className={styles.aide}>
            Les périodes qui commencent en {aCopier} sont recopiées 52 semaines plus tard : les samedis restent des samedis. Vous ajustez
            ensuite les vacances scolaires.
          </p>
          <FormulairePlan action={actionCopierAnnee.bind(null, aCopier)} libelle={`Copier ${aCopier} sur ${aCopier + 1}…`} />
        </section>
      )}

      <section className={styles.carte} aria-labelledby="titre-liste">
        <h2 id="titre-liste">Les périodes</h2>
        {visibles.length === 0 && <p>Aucune période.</p>}
        {visibles.map((p) => {
          const passee = p.fin <= auj;
          const enCours = !passee && p.debut < auj;
          const nuits = nombreDeNuits(p.debut, p.fin);
          return (
            <article key={p.id} className={`${styles.periode} ${passee ? styles.passe : ""}`} style={{ borderLeftColor: couleur(p.tarifId) }}>
              <p>
                <strong>{page.tarifs.find((t) => t.id === p.tarifId)?.nom}</strong>, {plageLisible(p.debut, p.fin)} ({nuits} nuit{nuits > 1 ? "s" : ""})
                {passee && <span className={styles.etiquette}> passée</span>}
                {enCours && <span className={styles.etiquette}> en cours</span>}
              </p>
              {reglesLisibles(p, page.baremes) !== "—" && <p className={styles.aide}>Règles propres : {reglesLisibles(p, page.baremes)}</p>}
              {!passee && (
                <details>
                  <summary>Modifier{enCours ? " la fin" : " ou supprimer"}</summary>
                  <FormulairePlan action={actionPeriode.bind(null, p.id)} libelle="Vérifier les changements…">
                    <ChampsPeriode id={`p-${p.id}`} p={p} page={page} enCours={enCours} />
                  </FormulairePlan>
                  {!enCours && <FormulairePlan action={actionSupprimerPeriode.bind(null, p.id)} libelle="Supprimer cette période…" danger />}
                </details>
              )}
            </article>
          );
        })}
      </section>
    </Cadre>
  );
}
