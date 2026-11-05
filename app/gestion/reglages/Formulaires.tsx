"use client";
// Formulaires des réglages (Phase 5, lot 1) : une rubrique = un formulaire,
// enregistré à part. Une saisie refusée reste affichée avec ce qui ne va pas.
import { useActionState } from "react";

import type { TypeAlerte } from "@/db/schema";
import type { Rubrique } from "@/lib/gestion/reglages";

import type { EtatFormulaire } from "../actions";
import styles from "../gestion.module.css";

const ETAT_INITIAL: EtatFormulaire = { version: 0, issue: "neuf", erreurs: {}, saisie: null, changes: 0 };

type Action = (precedent: EtatFormulaire, f: FormData) => Promise<EtatFormulaire>;

function Retour({ etat }: { etat: EtatFormulaire }) {
  if (etat.issue === "fait") {
    return <p className={`${styles.message} ${styles.ok}`}>{etat.changes ? "Enregistré." : "Aucun changement."}</p>;
  }
  if (etat.issue === "erreurs") {
    return (
      <p className={`${styles.message} ${styles.ko}`} role="alert">
        Rien n&apos;a été enregistré : corrigez ce qui est signalé ci-dessous.
        {etat.erreurs._ ? ` ${etat.erreurs._}` : ""}
      </p>
    );
  }
  if (etat.issue === "panne") {
    return (
      <p className={`${styles.message} ${styles.ko}`} role="alert">
        L&apos;enregistrement a échoué. Réessayez ; si cela se répète, prévenez le développeur.
      </p>
    );
  }
  return null;
}

export function FormulaireRubrique({ rubrique, valeurs, action }: { rubrique: Rubrique; valeurs: Record<string, string>; action: Action }) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT_INITIAL);
  return (
    <section className={styles.carte} aria-labelledby={`titre-${rubrique.id}`}>
      <h2 id={`titre-${rubrique.id}`}>{rubrique.titre}</h2>
      {rubrique.aide && <p className={styles.aide}>{rubrique.aide}</p>}
      <Retour etat={etat} />
      {/* La clé change à chaque enregistrement : le formulaire repart des valeurs relues en base. */}
      <form key={etat.version} action={envoyer}>
        {rubrique.champs.map((c) => {
          const id = `${rubrique.id}-${c.cle}`;
          const erreur = etat.erreurs[c.cle];
          const defaut = etat.saisie?.[c.cle] ?? valeurs[c.cle] ?? "";
          return (
            <div key={c.cle} className={styles.champ}>
              <label htmlFor={id}>{c.libelle}</label>
              <div className={styles.ligne}>
                <input
                  id={id}
                  name={c.cle}
                  type={c.sorte === "heure" ? "time" : c.sorte === "entier" ? "number" : "text"}
                  {...(c.sorte === "entier" ? { min: c.min, max: c.max, step: 1, inputMode: "numeric" as const } : {})}
                  defaultValue={defaut}
                  aria-invalid={erreur ? true : undefined}
                  aria-describedby={erreur ? `${id}-erreur` : undefined}
                  className={c.sorte === "texte" ? styles.large : undefined}
                  autoComplete="off"
                />
                {c.sorte === "entier" && <span>{c.unite}</span>}
              </div>
              {erreur && (
                <span id={`${id}-erreur`} className={styles.erreurChamp}>
                  {erreur}
                </span>
              )}
              {c.aide && <span className={styles.aide}>{c.aide}</span>}
              {"vide" in c && c.vide && <span className={styles.aide}>{c.vide}</span>}
            </div>
          );
        })}
        <button type="submit" className={styles.bouton} disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </section>
  );
}

export interface LigneAlerte {
  type: TypeAlerte;
  titre: string;
  aide: string;
  active: boolean;
  destinataires: string[];
}

export function FormulaireAlertes({ lignes, action }: { lignes: LigneAlerte[]; action: Action }) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT_INITIAL);
  return (
    <section className={styles.carte} aria-labelledby="titre-alertes">
      <h2 id="titre-alertes">Alertes aux propriétaires</h2>
      <p className={styles.aide}>Une adresse par ligne. Une alerte décochée n&apos;est plus envoyée du tout.</p>
      <Retour etat={etat} />
      <form key={etat.version} action={envoyer}>
        {lignes.map((l) => {
          const erreur = etat.erreurs[`${l.type}_destinataires`];
          const active = etat.saisie ? etat.saisie[`${l.type}_active`] === "on" : l.active;
          const destinataires = etat.saisie?.[`${l.type}_destinataires`] ?? l.destinataires.join("\n");
          return (
            <div key={l.type} className={styles.champ}>
              <label className={styles.ligne}>
                <input type="checkbox" name={`${l.type}_active`} defaultChecked={active} />
                {l.titre}
              </label>
              <span className={styles.aide}>{l.aide}</span>
              <textarea
                name={`${l.type}_destinataires`}
                rows={2}
                defaultValue={destinataires}
                aria-label={`Destinataires de l'alerte ${l.titre}`}
                aria-invalid={erreur ? true : undefined}
                className={styles.large}
              />
              {erreur && <span className={styles.erreurChamp}>{erreur}</span>}
            </div>
          );
        })}
        <button type="submit" className={styles.bouton} disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </section>
  );
}
