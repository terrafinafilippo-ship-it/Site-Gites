// Tarifs › Barèmes (Phase 5, lot 3, D-34) : la remise selon le rang de la
// nuit (D-17), saisie en pourcentages, avec l'aperçu du prix de 1 à 14 nuits
// (réponse 7 A). Le barème général se choisit dans « Règles » ; un tarif ou
// une période peut en désigner un autre (réponse 8 A).
import { lireTarifsGestion } from "@/lib/gestion/tarifs";
import { pourcentLisible } from "@/lib/gestion/tarifs-regles";

import { actionBareme, actionSupprimerBareme } from "../../actions-tarifs";
import styles from "../../gestion.module.css";
import { exigerSession } from "../../outils";
import { GesteBouton } from "../../reservations/Gestes";
import Cadre from "../Cadre";
import { EditeurBareme, FormulairePlan } from "../Formulaires";

export const dynamic = "force-dynamic";

function ChampNom({ id, nom }: { id: string; nom: string }) {
  return (
    <div className={styles.champ}>
      <label htmlFor={`${id}-nom`}>Nom du barème (pour vous seulement)</label>
      <input id={`${id}-nom`} name="nom" type="text" maxLength={60} defaultValue={nom} required autoComplete="off" className={styles.large} />
    </div>
  );
}

export default async function PageBaremes() {
  await exigerSession();
  const page = await lireTarifsGestion();
  const apercu = page.tarifs.map((t) => ({ id: t.id, nom: t.nom, prix: t.prix }));
  const general = page.baremes.find((b) => b.id === page.general.baremeId);

  return (
    <Cadre courant="/gestion/tarifs/baremes" etat={page.etat}>
      <p className={styles.aide}>
        Chaque case donne le prix d&apos;une nuit selon son rang dans le séjour : 100 % = plein tarif, 90 % = 10 % de remise. Au-delà de la
        dernière case, chaque nuit vaut la moyenne des cases : deux semaines coûtent alors exactement deux fois une semaine.
      </p>

      {page.baremes.map((b) => (
        <section key={b.id} className={styles.carte} aria-labelledby={`titre-${b.id}`}>
          <h2 id={`titre-${b.id}`}>{b.nom}</h2>
          <p className={styles.aide}>
            {b.utilisePar.length ? `Sert à : ${b.utilisePar.join(", ")}.` : "Ne sert à rien pour le moment."}
            {!b.valide && " Ce barème est incomplet (cases manquantes) : le site l'écarte. Enregistrez-le à nouveau pour le réparer."}
          </p>
          <FormulairePlan action={actionBareme.bind(null, b.id)} libelle="Vérifier les changements…">
            <ChampNom id={`b-${b.id}`} nom={b.nom} />
            <EditeurBareme initiaux={b.coefficients.map(pourcentLisible)} tarifs={apercu} gites={page.gites} />
          </FormulairePlan>
          {b.utilisePar.length === 0 && (
            <GesteBouton action={actionSupprimerBareme.bind(null, b.id)} libelle="Supprimer ce barème" confirmation={`Supprimer le barème « ${b.nom} » ?`} discret />
          )}
        </section>
      ))}

      <details className={styles.carte} open={page.baremes.length === 0}>
        <summary>
          <strong>Nouveau barème</strong>
        </summary>
        <p className={styles.aide}>
          {general ? `Il part des cases du barème général (« ${general.nom} »).` : "Le premier barème créé se choisit ensuite comme barème général, dans « Règles »."}
        </p>
        <FormulairePlan action={actionBareme.bind(null, null)} libelle="Vérifier…" vider>
          <ChampNom id="b-nouveau" nom="" />
          <EditeurBareme initiaux={general ? general.coefficients.map(pourcentLisible) : ["100"]} tarifs={apercu} gites={page.gites} />
        </FormulairePlan>
      </details>
    </Cadre>
  );
}
