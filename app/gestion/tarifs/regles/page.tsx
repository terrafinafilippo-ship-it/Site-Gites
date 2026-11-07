// Tarifs › Règles (Phase 5, lot 3, D-34) : la règle générale — minimum de
// nuits, jours d'arrivée et de départ, barème général — qu'un tarif ou une
// période peut remplacer (réponse 8 A) ; le jour où commencent les périodes
// (réponse 4) ; l'horizon de l'alerte des nuits sans tarif (réponse 6 A).
import { lireTarifsGestion } from "@/lib/gestion/tarifs";

import { actionGenerales } from "../../actions-tarifs";
import styles from "../../gestion.module.css";
import { exigerSession } from "../../outils";
import { GesteFormulaire } from "../../reservations/Gestes";
import Cadre, { JOURS } from "../Cadre";

export const dynamic = "force-dynamic";

function Jours({ nom, legende, jours }: { nom: "arrivee" | "depart"; legende: string; jours: number[] }) {
  return (
    <fieldset className={styles.groupe}>
      <legend>{legende}</legend>
      <div className={styles.ligne}>
        {JOURS.map((j) => (
          <label key={j.valeur} className={styles.ligne}>
            <input type="checkbox" name={nom} value={j.valeur} defaultChecked={jours.includes(j.valeur)} /> {j.nom}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function PageRegles() {
  await exigerSession();
  const page = await lireTarifsGestion();
  const g = page.general;

  return (
    <Cadre courant="/gestion/tarifs/regles" etat={page.etat}>
      <section className={styles.carte} aria-labelledby="titre-regles">
        <h2 id="titre-regles">Règles générales</h2>
        <p className={styles.aide}>
          Elles valent pour toutes les dates, sauf quand un tarif ou une période a ses propres règles (période d&apos;abord, puis tarif, puis
          celles-ci). Un séjour à cheval sur deux périodes : l&apos;arrivée suit la première, le départ la dernière, et le minimum de nuits
          le plus exigeant s&apos;applique.
        </p>
        <GesteFormulaire action={actionGenerales} libelle="Enregistrer">
          <div className={styles.champ}>
            <label htmlFor="r-nuits">Minimum de nuits</label>
            <input id="r-nuits" name="nuits_minimum" type="number" min={1} max={60} step={1} defaultValue={g.nuitsMinimum} required />
          </div>
          <Jours nom="arrivee" legende="Jours d'arrivée autorisés" jours={g.joursArrivee} />
          <Jours nom="depart" legende="Jours de départ autorisés" jours={g.joursDepart} />
          <div className={styles.champ}>
            <label htmlFor="r-bareme">Barème général</label>
            <select id="r-bareme" name="bareme" defaultValue={g.baremeId ?? ""}>
              <option value="">aucun (aucun séjour ne peut être chiffré)</option>
              {page.baremes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.champ}>
            <label htmlFor="r-jour">Les périodes commencent et finissent le</label>
            <select id="r-jour" name="jour_debut" defaultValue={g.jourDebut ?? ""}>
              {JOURS.map((j) => (
                <option key={j.valeur} value={j.valeur}>
                  {j.nom}
                </option>
              ))}
              <option value="">n&apos;importe quel jour</option>
            </select>
            <span className={styles.aide}>Une période saisie un autre jour est refusée. Les périodes déjà enregistrées ne changent pas.</span>
          </div>
          <div className={styles.champ}>
            <label htmlFor="r-horizon">Prévenir des nuits sans tarif dans les</label>
            <div className={styles.ligne}>
              <input id="r-horizon" name="horizon" type="number" min={1} max={36} step={1} defaultValue={g.horizonMois} required />
              <span>prochains mois (ligne dans « À traiter »)</span>
            </div>
          </div>
        </GesteFormulaire>
      </section>
    </Cadre>
  );
}
