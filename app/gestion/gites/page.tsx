// Fiches des gîtes (Phase 5, lot 4, réponse 12 A du cadrage de la phase) :
// capacité, ménage, caution, équipements, téléphone pour l'arrivée, spa ;
// enregistrés en deux temps, comme les tarifs.
import { numericDepuisCentimes } from "@/lib/centimes";
import { lireGitesGestion } from "@/lib/gestion/gites";

import { actionGite } from "../actions-calendrier";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { FormulairePlan } from "../tarifs/Formulaires";

export const dynamic = "force-dynamic";

/** Centimes → « 80 » ou « 80,50 », tel qu'on le tape (par le texte, jamais par un calcul : lib/centimes.ts). */
function saisie(centimes: number): string {
  return numericDepuisCentimes(centimes).replace(/\.00$/, "").replace(".", ",");
}

export default async function PageGites() {
  await exigerSession();
  const fiches = await lireGitesGestion();

  return (
    <>
      <Entete courante="/gestion/gites" />
      <main className={styles.page}>
        <h1>Gîtes</h1>
        <p className={styles.aide}>
          Le nom, la référence Gîtes de France, les textes et les photos du site ne se modifient pas ici. Chaque enregistrement montre
          d&apos;abord ce qui va changer.
        </p>
        {fiches.map((g) => (
          <section key={g.id} className={styles.carte} aria-labelledby={`titre-${g.id}`}>
            <h2 id={`titre-${g.id}`}>{g.nom}</h2>
            <p className={styles.aide}>Référence Gîtes de France : {g.refGdf}</p>
            <FormulairePlan action={actionGite.bind(null, g.id)} libelle="Vérifier les changements…">
              <div className={styles.ligne}>
                <div className={styles.champ}>
                  <label htmlFor={`capacite-${g.id}`}>Capacité (personnes)</label>
                  <input id={`capacite-${g.id}`} name="capacite" type="number" min={1} max={20} defaultValue={g.capacite} required className={styles.court} />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={`menage-${g.id}`}>Ménage (€)</label>
                  <input id={`menage-${g.id}`} name="menage" type="text" inputMode="decimal" defaultValue={saisie(g.menage)} required className={styles.court} />
                </div>
                <div className={styles.champ}>
                  <label htmlFor={`caution-${g.id}`}>Caution (€)</label>
                  <input id={`caution-${g.id}`} name="caution" type="text" inputMode="decimal" defaultValue={saisie(g.caution)} required className={styles.court} />
                </div>
              </div>
              <div className={styles.champ}>
                <label htmlFor={`equipements-${g.id}`}>Équipements particuliers, imprimés au contrat (facultatif)</label>
                <input id={`equipements-${g.id}`} name="equipements" type="text" maxLength={300} defaultValue={g.equipements} className={styles.large} />
              </div>
              <div className={styles.champ}>
                <label htmlFor={`telephone-${g.id}`}>Téléphone pour l&apos;arrivée, imprimé au contrat</label>
                <input id={`telephone-${g.id}`} name="telephone" type="text" inputMode="tel" maxLength={30} defaultValue={g.telephone} required />
              </div>
              <div className={styles.champ}>
                <label>
                  <input name="spa" type="checkbox" value="oui" defaultChecked={g.spa} /> Spa
                </label>
              </div>
            </FormulairePlan>
          </section>
        ))}
      </main>
    </>
  );
}
