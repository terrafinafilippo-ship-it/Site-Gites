"use client";
// Les formulaires de l'écran des tarifs (Phase 5, lot 3, D-34).
//
// FormulairePlan : un enregistrement en deux temps (réponse 1 A du cadrage du
// 7 novembre 2026) — le premier envoi revient avec le récapitulatif de ce qui
// va changer ; « Confirmer » renvoie la même saisie avec l'empreinte de ce
// récapitulatif, et le serveur n'écrit que s'il n'a pas changé entre-temps.
//
// EditeurBareme : les cases du barème en pourcentages, avec l'aperçu du prix
// de 1 à 14 nuits calculé par le même code que le site (réponse 7 A).
import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";

import { pourcentEnDixMilliemes } from "@/lib/gestion/tarifs-regles";
import { fmtEuro } from "@/lib/format";
import { prixPourNuits } from "@/lib/tarification";

import type { EtatPlan } from "../actions-tarifs";
import styles from "../gestion.module.css";

type Action = (precedent: EtatPlan, f: FormData) => Promise<EtatPlan>;

const INITIAL: EtatPlan = { version: 0, etape: "neuf", message: "", lignes: [], empreinte: "" };

export function FormulairePlan({
  action,
  libelle,
  children,
  danger,
  vider,
}: {
  action: Action;
  libelle: string;
  children?: ReactNode;
  /** Bouton rouge (suppression). */
  danger?: boolean;
  /** Repartir d'un formulaire vide après l'enregistrement (ajout). */
  vider?: boolean;
}) {
  const [etat, envoyer, enCours] = useActionState(action, INITIAL);
  // Version du récapitulatif sur lequel « Modifier » a été cliqué : la saisie réapparaît.
  const [modifie, setModifie] = useState(-1);
  const recap = etat.etape === "plan" && modifie !== etat.version;

  function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const bouton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (bouton?.value === "confirmer") f.set("confirmation", etat.empreinte);
    else f.delete("confirmation");
    startTransition(() => envoyer(f));
  }

  return (
    <div>
      {(etat.etape === "fait" || etat.etape === "refus") && (
        <p className={`${styles.message} ${etat.etape === "fait" ? styles.ok : styles.ko}`} role={etat.etape === "refus" ? "alert" : undefined}>
          {etat.message}
        </p>
      )}
      <form key={vider && etat.etape === "fait" ? etat.version : 0} onSubmit={soumettre}>
        <div hidden={recap}>
          {children}
          <button type="submit" value="voir" className={danger ? styles.boutonDiscret : styles.bouton} disabled={enCours}>
            {enCours ? "Vérification…" : libelle}
          </button>
        </div>
        {recap && (
          <div className={styles.confirmation}>
            {etat.message && (
              <p role="alert">
                <strong>{etat.message}</strong>
              </p>
            )}
            <p>
              <strong>Vérifiez avant d&apos;enregistrer :</strong>
            </p>
            <ul>
              {etat.lignes.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <div className={styles.ligne}>
              <button type="submit" value="confirmer" className={danger ? styles.boutonDiscret : styles.bouton} disabled={enCours}>
                {enCours ? "Enregistrement…" : "Confirmer"}
              </button>
              <button type="button" className={styles.boutonSecondaire} onClick={() => setModifie(etat.version)} disabled={enCours}>
                Modifier
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export interface TarifApercu {
  id: string;
  nom: string;
  /** Prix d'une nuit par gîte (clé : id du gîte), en centimes. */
  prix: Record<string, number | null>;
}

function rangLisible(rang: number): string {
  return rang === 1 ? "1re nuit" : `${rang}e nuit`;
}

/** Les cases du barème (champs « pourcent ») et l'aperçu des prix. */
export function EditeurBareme({
  initiaux,
  tarifs,
  gites,
}: {
  /** Pourcentages tels qu'on les tape (« 100 », « 85,5 »). */
  initiaux: string[];
  tarifs: TarifApercu[];
  gites: Array<{ id: string; nom: string }>;
}) {
  const [cases, setCases] = useState<string[]>(initiaux.length ? initiaux : ["100"]);
  const [giteId, setGiteId] = useState(gites[0]?.id ?? "");
  const [tarifId, setTarifId] = useState(tarifs.find((t) => t.prix[gites[0]?.id ?? ""] != null)?.id ?? tarifs[0]?.id ?? "");
  const coefficients = cases.map((c) => pourcentEnDixMilliemes(c));
  const valides = coefficients.length > 0 && coefficients.every((c): c is number => c !== null);
  const prix = tarifs.find((t) => t.id === tarifId)?.prix[giteId] ?? null;

  return (
    <div className={styles.grille}>
      <div>
        {cases.map((c, i) => (
          <div key={i} className={styles.champ}>
            <label htmlFor={`case-${i}`}>{rangLisible(i + 1)}</label>
            <div className={styles.ligne}>
              <input
                id={`case-${i}`}
                name="pourcent"
                type="text"
                inputMode="decimal"
                value={c}
                onChange={(e) => setCases(cases.map((x, j) => (j === i ? e.target.value : x)))}
                aria-invalid={coefficients[i] === null ? true : undefined}
                className={styles.court}
                autoComplete="off"
              />
              <span>%</span>
              {i === cases.length - 1 && cases.length > 1 && (
                <button type="button" className={styles.boutonSecondaire} onClick={() => setCases(cases.slice(0, -1))}>
                  Retirer
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className={styles.boutonSecondaire} onClick={() => setCases([...cases, cases[cases.length - 1] ?? "100"])}>
          Ajouter la {rangLisible(cases.length + 1)}
        </button>
        <p className={styles.aide}>Au-delà de la dernière case, chaque nuit vaut la moyenne des cases.</p>
      </div>
      <div>
        <h3>Aperçu</h3>
        <div className={styles.ligne}>
          <select aria-label="Gîte de l'aperçu" value={giteId} onChange={(e) => setGiteId(e.target.value)}>
            {gites.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
          <select aria-label="Tarif de l'aperçu" value={tarifId} onChange={(e) => setTarifId(e.target.value)}>
            {tarifs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
        </div>
        {!valides ? (
          <p className={styles.aide}>Chaque case est un pourcentage entre 1 et 200 (par exemple 85 ou 85,5).</p>
        ) : prix === null ? (
          <p className={styles.aide}>Ce tarif n&apos;a pas de prix pour ce gîte.</p>
        ) : (
          <table className={styles.tableau}>
            <tbody>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                <tr key={n}>
                  <td>
                    {n} nuit{n > 1 ? "s" : ""}
                  </td>
                  <td>{fmtEuro(prixPourNuits(prix, coefficients as number[], n))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
