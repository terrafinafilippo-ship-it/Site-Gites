// Tarifs › Taxe de séjour (Phase 5, lot 3, D-18, D-34) : une délibération par
// ligne datée. Une seule saisie pour les trois gîtes, qu'on peut limiter à un
// gîte ; une ligne pas encore commencée se corrige ou se supprime, une ligne
// commencée est figée (réponse 9 A).
import { fmtDateLongue } from "@/lib/format";
import { lireTarifsGestion, type TaxePage } from "@/lib/gestion/tarifs";

import { actionSupprimerTaxe, actionTaxe } from "../../actions-tarifs";
import styles from "../../gestion.module.css";
import { exigerSession } from "../../outils";
import { GesteBouton } from "../../reservations/Gestes";
import Cadre from "../Cadre";
import { ChampsTaxe } from "../Champs";
import { FormulairePlan } from "../Formulaires";

export const dynamic = "force-dynamic";

const ETATS: Record<TaxePage["etat"], string> = { en_vigueur: "en vigueur", a_venir: "à venir", remplacee: "remplacée" };

export default async function PageTaxe() {
  await exigerSession();
  const page = await lireTarifsGestion();
  const modele = page.taxes.filter((t) => t.etat === "en_vigueur").at(0) ?? null;

  return (
    <Cadre courant="/gestion/tarifs/taxe" etat={page.etat}>
      <p className={styles.aide}>
        La taxe se calcule selon la règle officielle (taux et plafond d&apos;un gîte non classé, ou tarif fixe d&apos;un gîte classé, plus la
        taxe additionnelle). Une nouvelle délibération s&apos;ajoute par une ligne datée ; les réservations déjà faites gardent leur taxe.
      </p>

      {page.gites.map((g) => {
        const lignes = page.taxes.filter((t) => t.giteId === g.id);
        return (
          <section key={g.id} className={styles.carte} aria-labelledby={`titre-${g.id}`}>
            <h2 id={`titre-${g.id}`}>{g.nom}</h2>
            {lignes.length === 0 ? (
              <p>Aucune délibération : les dates de ce gîte ne sont pas réservables.</p>
            ) : (
              lignes.map((t) => (
                <article key={t.id} className={`${styles.periode} ${t.etat === "remplacee" ? styles.passe : ""}`}>
                  <p>
                    <strong>À partir du {fmtDateLongue(t.dateDebut)}</strong> <span className={styles.etiquette}>{ETATS[t.etat]}</span>
                  </p>
                  <p>Affiché aux clients : {t.resume}.</p>
                  <p className={styles.aide}>
                    Ménage {t.menage ? "compris dans le calcul" : "hors du calcul"} ; bébés {t.bebes ? "comptés" : "non comptés"} parmi les occupants.
                    {t.source ? ` Référence : ${t.source}.` : ""}
                  </p>
                  {t.etat === "a_venir" && (
                    <details>
                      <summary>Corriger ou supprimer</summary>
                      <FormulairePlan action={actionTaxe.bind(null, t.id)} libelle="Vérifier les changements…">
                        <ChampsTaxe id={`x-${t.id}`} gites={page.gites} valeurs={t} choixGites={false} />
                      </FormulairePlan>
                      <GesteBouton
                        action={actionSupprimerTaxe.bind(null, t.id)}
                        libelle="Supprimer cette délibération"
                        confirmation={`Supprimer la délibération du ${fmtDateLongue(t.dateDebut)} pour ${g.nom} ?`}
                        discret
                      />
                    </details>
                  )}
                </article>
              ))
            )}
          </section>
        );
      })}

      <details className={styles.carte} open={page.taxes.length === 0}>
        <summary>
          <strong>Nouvelle délibération</strong>
        </summary>
        <FormulairePlan action={actionTaxe.bind(null, null)} libelle="Vérifier…" vider>
          <ChampsTaxe id="x-nouvelle" gites={page.gites} valeurs={modele ? { ...modele, dateDebut: "" } : null} choixGites />
        </FormulairePlan>
      </details>
    </Cadre>
  );
}
