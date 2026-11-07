// Les champs des formulaires des tarifs (Phase 5, lot 3), sans état : ils
// sont placés dans les formulaires en deux temps (Formulaires.tsx).
import { numericDepuisCentimes } from "@/lib/centimes";
import { entierDepuisDecimal } from "@/lib/decimaux";
import type { GitePage, PageTarifs, TaxePage } from "@/lib/gestion/tarifs";
import { joursLisibles, pourcentLisible } from "@/lib/gestion/tarifs-regles";

import styles from "../gestion.module.css";
import { JOURS } from "./Cadre";

/** 7550 → « 75,50 » ; 7500 → « 75 » : un montant tel qu'on le tape. */
export function montantSaisi(centimes: number | null): string {
  if (centimes === null) return "";
  return numericDepuisCentimes(centimes).replace(/\.00$/, "").replace(".", ",");
}

/** « 4.40 » → « 4,40 » ; « 5.00 » (taux) → « 5 ». */
function numericSaisi(v: string | null, taux: boolean): string {
  if (v === null) return "";
  return taux ? pourcentLisible(entierDepuisDecimal(v, 2)) : v.replace(".", ",");
}

/** Les règles propres d'un tarif, en clair ; « — » s'il suit le général. */
export function reglesLisibles(r: { nuitsMinimum: number | null; joursArrivee: number[] | null; joursDepart: number[] | null; baremeId: string | null }, baremes: PageTarifs["baremes"]): string {
  const morceaux = [
    r.joursArrivee ? `arrivée : ${joursLisibles(r.joursArrivee)}` : null,
    r.joursDepart ? `départ : ${joursLisibles(r.joursDepart)}` : null,
    r.nuitsMinimum !== null ? `${r.nuitsMinimum} nuit${r.nuitsMinimum > 1 ? "s" : ""} au moins` : null,
    r.baremeId ? `barème « ${baremes.find((b) => b.id === r.baremeId)?.nom ?? "?"} »` : null,
  ].filter(Boolean);
  return morceaux.length ? morceaux.join(" ; ") : "—";
}

export interface ValeursRegles {
  nuitsMinimum: number | null;
  joursArrivee: number[] | null;
  joursDepart: number[] | null;
  baremeId: string | null;
}

function Jours({ id, nom, legende, jours }: { id: string; nom: "arrivee" | "depart"; legende: string; jours: number[] | null }) {
  return (
    <fieldset className={styles.groupe}>
      <legend>{legende}</legend>
      <label className={styles.ligne}>
        <input type="radio" name={`${nom}_mode`} value="general" defaultChecked={jours === null} /> comme le général
      </label>
      <label className={styles.ligne}>
        <input type="radio" name={`${nom}_mode`} value="propre" defaultChecked={jours !== null} /> seulement :
      </label>
      <div className={styles.ligne}>
        {JOURS.map((j) => (
          <label key={j.valeur} className={styles.ligne} htmlFor={`${id}-${nom}-${j.valeur}`}>
            <input id={`${id}-${nom}-${j.valeur}`} type="checkbox" name={nom} value={j.valeur} defaultChecked={jours?.includes(j.valeur) ?? false} />
            {j.nom}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Règles propres d'un tarif ou d'une période ; vide = celles du niveau au-dessus. */
export function ChampsRegles({ id, valeurs, baremes, dessus }: { id: string; valeurs: ValeursRegles; baremes: Array<{ id: string; nom: string }>; dessus: string }) {
  return (
    <details className={styles.replie} open={valeurs.nuitsMinimum !== null || valeurs.joursArrivee !== null || valeurs.joursDepart !== null || valeurs.baremeId !== null}>
      <summary>Règles propres (sinon : {dessus})</summary>
      <div className={styles.champ}>
        <label htmlFor={`${id}-nuits`}>Minimum de nuits</label>
        <input id={`${id}-nuits`} name="nuits_minimum" type="number" min={1} max={60} step={1} defaultValue={valeurs.nuitsMinimum ?? ""} placeholder="comme le général" />
      </div>
      <Jours id={id} nom="arrivee" legende="Jours d'arrivée" jours={valeurs.joursArrivee} />
      <Jours id={id} nom="depart" legende="Jours de départ" jours={valeurs.joursDepart} />
      <div className={styles.champ}>
        <label htmlFor={`${id}-bareme`}>Barème</label>
        <select id={`${id}-bareme`} name="bareme" defaultValue={valeurs.baremeId ?? ""}>
          <option value="">comme le général</option>
          {baremes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nom}
            </option>
          ))}
        </select>
      </div>
    </details>
  );
}

export function ChampsTarif({ id, nom, prix, gites }: { id: string; nom: string; prix: Record<string, number | null>; gites: GitePage[] }) {
  return (
    <>
      <div className={styles.champ}>
        <label htmlFor={`${id}-nom`}>Nom (affiché sur le site)</label>
        <input id={`${id}-nom`} name="nom" type="text" maxLength={60} defaultValue={nom} required autoComplete="off" className={styles.large} />
      </div>
      <div className={styles.grille}>
        {gites.map((g) => (
          <div key={g.id} className={styles.champ}>
            <label htmlFor={`${id}-prix-${g.id}`}>{g.nom} : prix d&apos;une nuit</label>
            <div className={styles.ligne}>
              <input id={`${id}-prix-${g.id}`} name={`prix_${g.id}`} type="text" inputMode="decimal" defaultValue={montantSaisi(prix[g.id] ?? null)} className={styles.court} autoComplete="off" />
              <span>€</span>
            </div>
          </div>
        ))}
      </div>
      <p className={styles.aide}>Un prix vide : ce tarif ne se vend pas pour ce gîte.</p>
    </>
  );
}

export function ChampsTaxe({ id, gites, valeurs, choixGites }: { id: string; gites: GitePage[]; valeurs: Partial<TaxePage> | null; choixGites: boolean }) {
  const v = valeurs ?? {};
  return (
    <>
      {choixGites && (
        <fieldset className={styles.groupe}>
          <legend>Pour</legend>
          <div className={styles.ligne}>
            {gites.map((g) => (
              <label key={g.id} className={styles.ligne}>
                <input type="checkbox" name="gite" value={g.id} defaultChecked /> {g.nom}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className={styles.champ}>
        <label htmlFor={`${id}-date`}>À partir du</label>
        <input id={`${id}-date`} name="date_debut" type="date" defaultValue={v.dateDebut ?? ""} required />
      </div>
      <fieldset className={styles.groupe}>
        <legend>Mode</legend>
        <label className={styles.ligne}>
          <input type="radio" name="mode" value="proportionnel" defaultChecked={(v.mode ?? "proportionnel") === "proportionnel"} /> proportionnel (gîte non classé) : un
          pourcentage du prix de la nuit par personne, avec un plafond
        </label>
        <label className={styles.ligne}>
          <input type="radio" name="mode" value="fixe" defaultChecked={v.mode === "fixe"} /> fixe (gîte classé) : un montant par personne et par nuit
        </label>
      </fieldset>
      <div className={styles.grille}>
        <div className={styles.champ}>
          <label htmlFor={`${id}-taux`}>Taux (proportionnel)</label>
          <div className={styles.ligne}>
            <input id={`${id}-taux`} name="taux" type="text" inputMode="decimal" defaultValue={numericSaisi(v.taux ?? null, true)} className={styles.court} autoComplete="off" />
            <span>%</span>
          </div>
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-plafond`}>Plafond par personne et par nuit (proportionnel)</label>
          <div className={styles.ligne}>
            <input id={`${id}-plafond`} name="plafond" type="text" inputMode="decimal" defaultValue={numericSaisi(v.plafond ?? null, false)} className={styles.court} autoComplete="off" />
            <span>€</span>
          </div>
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-fixe`}>Tarif par personne et par nuit (fixe)</label>
          <div className={styles.ligne}>
            <input id={`${id}-fixe`} name="tarif_fixe" type="text" inputMode="decimal" defaultValue={numericSaisi(v.tarifFixe ?? null, false)} className={styles.court} autoComplete="off" />
            <span>€</span>
          </div>
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-add`}>Taxe additionnelle (départementale)</label>
          <div className={styles.ligne}>
            <input id={`${id}-add`} name="additionnelle" type="text" inputMode="decimal" defaultValue={v.taxeAdditionnelle ? numericSaisi(v.taxeAdditionnelle, true) : "10"} className={styles.court} autoComplete="off" />
            <span>%</span>
          </div>
        </div>
      </div>
      <label className={styles.ligne}>
        <input type="checkbox" name="menage" defaultChecked={v.menage ?? false} /> Le forfait ménage entre dans le calcul
      </label>
      <label className={styles.ligne}>
        <input type="checkbox" name="bebes" defaultChecked={v.bebes ?? true} /> Les bébés comptent parmi les occupants
      </label>
      <p className={styles.aide}>Ces deux cases attendent la réponse du service taxe de séjour d&apos;Ardèche Grand Air.</p>
      <div className={styles.champ}>
        <label htmlFor={`${id}-source`}>Référence de la délibération</label>
        <input id={`${id}-source`} name="source" type="text" maxLength={200} defaultValue={v.source ?? ""} className={styles.large} autoComplete="off" />
      </div>
    </>
  );
}
