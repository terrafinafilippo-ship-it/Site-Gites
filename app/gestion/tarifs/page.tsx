// Tarifs › Prix (Phase 5, lot 3, D-34) : un tableau, une ligne par tarif et
// une colonne par gîte — le prix d'une nuit et celui de la semaine, calculé
// comme sur le site. Modifier un prix passe par un récapitulatif.
import { fmtEuro } from "@/lib/format";
import { lireTarifsGestion, type PageTarifs, type TarifPage } from "@/lib/gestion/tarifs";

import { actionSupprimerTarif, actionTarif } from "../actions-tarifs";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { GesteBouton } from "../reservations/Gestes";
import Cadre from "./Cadre";
import { ChampsRegles, ChampsTarif, reglesLisibles } from "./Champs";
import { FormulairePlan } from "./Formulaires";

export const dynamic = "force-dynamic";

function Ligne({ t, page }: { t: TarifPage; page: PageTarifs }) {
  return (
    <tr>
      <th scope="row">{t.nom}</th>
      {page.gites.map((g) => (
        <td key={g.id}>
          {t.prix[g.id] === null ? (
            <span className={styles.aide}>pas de prix</span>
          ) : (
            <>
              {fmtEuro(t.prix[g.id] as number)}
              <br />
              <span className={styles.aide}>{t.semaine[g.id] === null ? "semaine : —" : `${fmtEuro(t.semaine[g.id] as number)} la semaine`}</span>
            </>
          )}
        </td>
      ))}
      <td>{reglesLisibles(t, page.baremes)}</td>
      <td>{t.nbPeriodes}</td>
    </tr>
  );
}

export default async function PagePrix() {
  await exigerSession();
  const page = await lireTarifsGestion();
  const baremes = page.baremes.map((b) => ({ id: b.id, nom: b.nom }));

  return (
    <Cadre courant="/gestion/tarifs" etat={page.etat}>
      <section className={styles.carte} aria-labelledby="titre-prix">
        <h2 id="titre-prix">Prix d&apos;une nuit</h2>
        <p className={styles.aide}>
          Le prix de la semaine applique le barème du tarif. Les réservations déjà faites gardent toujours leur prix.
        </p>
        {page.tarifs.length === 0 ? (
          <p>Aucun tarif pour le moment.</p>
        ) : (
          <div className={styles.defile}>
            <table className={styles.tableau}>
              <thead>
                <tr>
                  <th scope="col">Tarif</th>
                  {page.gites.map((g) => (
                    <th key={g.id} scope="col">
                      {g.nom}
                    </th>
                  ))}
                  <th scope="col">Règles propres</th>
                  <th scope="col">Périodes</th>
                </tr>
              </thead>
              <tbody>
                {page.tarifs.map((t) => (
                  <Ligne key={t.id} t={t} page={page} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {page.tarifs.map((t) => (
        <details key={t.id} className={styles.carte}>
          <summary>
            <strong>Modifier « {t.nom} »</strong>
          </summary>
          <FormulairePlan action={actionTarif.bind(null, t.id)} libelle="Vérifier les changements…">
            <ChampsTarif id={`t-${t.id}`} nom={t.nom} prix={t.prix} gites={page.gites} />
            <ChampsRegles id={`t-${t.id}`} valeurs={t} baremes={baremes} dessus="les règles générales" />
          </FormulairePlan>
          {t.nbPeriodes === 0 ? (
            <GesteBouton
              action={actionSupprimerTarif.bind(null, t.id)}
              libelle="Supprimer ce tarif"
              confirmation={`Supprimer le tarif « ${t.nom} » et ses prix ? Aucune période ne l'utilise.`}
              discret
            />
          ) : (
            <p className={styles.aide}>
              Il sert à {t.nbPeriodes} période{t.nbPeriodes > 1 ? "s" : ""} : il ne se supprime qu&apos;une fois ses périodes supprimées ou changées.
            </p>
          )}
        </details>
      ))}

      <details className={styles.carte} open={page.tarifs.length === 0}>
        <summary>
          <strong>Nouveau tarif</strong>
        </summary>
        <FormulairePlan action={actionTarif.bind(null, null)} libelle="Vérifier…" vider>
          <ChampsTarif id="t-nouveau" nom="" prix={{}} gites={page.gites} />
          <ChampsRegles id="t-nouveau" valeurs={{ nuitsMinimum: null, joursArrivee: null, joursDepart: null, baremeId: null }} baremes={baremes} dessus="les règles générales" />
        </FormulairePlan>
      </details>
    </Cadre>
  );
}
