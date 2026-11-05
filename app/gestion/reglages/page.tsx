import { aujourdhuiParis, heureParis } from "@/lib/dates-civiles";
import { fmtDateLongue, fmtHeure } from "@/lib/format";
import { LIBELLES_ALERTE, lireAlertes, lireReglages, lireTextesAccord, RUBRIQUES, valeurAffichee } from "@/lib/gestion/reglages";

import { actionAlertes, actionRubrique } from "../actions";
import Entete from "../Entete";
import styles from "../gestion.module.css";
import { exigerSession } from "../outils";
import { FormulaireAlertes, FormulaireRubrique } from "./Formulaires";

export const dynamic = "force-dynamic";

export default async function PageReglages() {
  await exigerSession();
  const [r, alertes, textes] = await Promise.all([lireReglages(), lireAlertes(), lireTextesAccord()]);

  return (
    <>
      <Entete courante="/gestion/reglages" />
      <main className={styles.page}>
        <h1>Réglages</h1>
        <p className={styles.aide}>
          Chaque rubrique s&apos;enregistre à part. Chaque changement est noté dans le journal du site, avec la valeur avant
          et après.
        </p>

        {RUBRIQUES.map((rubrique) => (
          <FormulaireRubrique
            key={rubrique.id}
            rubrique={rubrique}
            valeurs={Object.fromEntries(rubrique.champs.map((c) => [c.cle, valeurAffichee(r, c)]))}
            action={actionRubrique.bind(null, rubrique.id)}
          />
        ))}

        <FormulaireAlertes
          lignes={alertes.map((a) => ({ type: a.type, ...LIBELLES_ALERTE[a.type], active: a.active, destinataires: a.destinataires }))}
          action={actionAlertes}
        />

        <section className={styles.carte} aria-labelledby="titre-contrat">
          <h2 id="titre-contrat">Conditions du contrat</h2>
          <p className={styles.aide}>
            Affichées seulement : les changer, c&apos;est changer vos conditions commerciales (contrat et pages du site). Cela
            se fait dans une session de travail dédiée.
          </p>
          <dl className={styles.lectureSeule}>
            <dt>Acompte</dt>
            <dd>{r.taux_acompte} % du prix total</dd>
            <dt>Date limite du solde</dt>
            <dd>{r.delai_solde_jours} jours avant l&apos;arrivée</dd>
            <dt>Caution par virement reçue au plus tard</dt>
            <dd>{r.delai_virement_caution_jours} jours avant l&apos;arrivée</dd>
            <dt>Solde remboursé si le client annule plus de</dt>
            <dd>{r.delai_remboursement_solde_heures} heures avant l&apos;heure d&apos;arrivée</dd>
          </dl>
        </section>

        <section className={styles.carte} aria-labelledby="titre-courriels">
          <h2 id="titre-courriels">Adresses des courriels</h2>
          <p className={styles.aide}>Affichées seulement : l&apos;adresse d&apos;envoi doit être reconnue par Brevo.</p>
          <dl className={styles.lectureSeule}>
            <dt>Envoyés par</dt>
            <dd>
              {r.courriel_expediteur_nom} &lt;{r.courriel_expediteur}&gt;
            </dd>
            <dt>Les réponses des clients vont à</dt>
            <dd>{r.courriel_reponse}</dd>
          </dl>
        </section>

        <section className={styles.carte} aria-labelledby="titre-accord">
          <h2 id="titre-accord">Texte d&apos;accord pour la carte</h2>
          <p className={styles.aide}>
            Le texte que chaque client accepte en payant (caution par carte, prélèvement du solde). Affiché seulement : une
            version acceptée par des clients ne se modifie jamais. {"{caution}"}, {"{montant}"} et {"{date}"} sont remplacés
            par les valeurs de la réservation.
          </p>
          {textes.map((t) => (
            <div key={t.id}>
              <h3>
                {t.langue === "fr" ? "Français" : "Anglais"}, en vigueur depuis le {fmtDateLongue(t.depuis, "fr")}
              </h3>
              <p className={styles.texteAccord}>{t.modele}</p>
              <p className={styles.texteAccord}>{t.modeleSolde}</p>
              <p className={styles.aide}>Validé par : {t.validePar}</p>
            </div>
          ))}
        </section>

        <p className={styles.aide}>
          Dernière modification des réglages : le {fmtDateLongue(aujourdhuiParis(r.updated_at), "fr")} à{" "}
          {fmtHeure(heureParis(r.updated_at), "fr")}.
        </p>
      </main>
    </>
  );
}
