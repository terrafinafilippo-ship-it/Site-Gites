import Link from "next/link";
import { GITES, GITE_IDS } from "@/lib/data/gites";
import { chiffresDuGite, type ChiffresPublics } from "@/lib/gites-publics";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import EnteteTunnel from "./EnteteTunnel";
import styles from "./page.module.css";

const TEXTES: Bilingue<{
  quelGite: string;
  personnes: (n: number) => string;
  choisir: (nom: string) => string;
  indisponible: string;
  pasEnLigne: (nom: string) => string;
  contacter: string;
  voirGites: string;
}> = {
  fr: {
    quelGite: "Quel gîte souhaitez-vous réserver ?",
    personnes: (n) => `${n} personnes`,
    choisir: (nom) => `Choisir ${nom}`,
    indisponible: "La réservation en ligne est momentanément indisponible.",
    pasEnLigne: (nom) => `Il n'est pas possible de réserver ${nom} en ligne pour le moment.`,
    contacter: "Nous contacter",
    voirGites: "Voir les gîtes",
  },
  en: {
    quelGite: "Which gîte would you like to book?",
    personnes: (n) => `${n} people`,
    choisir: (nom) => `Choose ${nom}`,
    indisponible: "Online booking is temporarily unavailable.",
    pasEnLigne: (nom) => `${nom} cannot be booked online for the moment.`,
    contacter: "Contact us",
    voirGites: "See the gîtes",
  },
};

/**
 * /reserver sans gîte précisé (bouton « Réserver un séjour » de l'en-tête) :
 * le client choisit. Avant la Phase 3, ce cas réservait LaPhine sans rien dire.
 * La capacité vient de la base ; si elle ne répond pas, elle n'est pas affichée.
 */
export default function ChoixGite({ langue, publics }: { langue: Langue; publics: ChiffresPublics }) {
  const t = TEXTES[langue];
  return (
    <>
      <EnteteTunnel langue={langue} />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>
            <h1>{t.quelGite}</h1>
            <div className={styles.recourses}>
              {GITE_IDS.map((id) => {
                const gite = GITES[id];
                const capacite = chiffresDuGite(publics, id)?.capaciteMax ?? null;
                return (
                  <div className={styles.recourse} key={id}>
                    <strong>{gite.name}</strong>
                    <p>
                      {gite.profil[langue]}
                      {capacite !== null ? ` · ${t.personnes(capacite)}` : ""}
                    </p>
                    <Link
                      href={lien(langue, `/reserver?gite=${id}`)}
                      className="btn btn-primary"
                      style={{ marginTop: 12, width: "100%" }}
                    >
                      {t.choisir(gite.name)}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** Le tunnel ne peut pas s'ouvrir (base injoignable, réglages absents) : il le dit, sans prix de repli. */
export function TunnelIndisponible({ langue, nomGite }: { langue: Langue; nomGite: string }) {
  const t = TEXTES[langue];
  return (
    <>
      <EnteteTunnel langue={langue} />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>
            <h1>{t.indisponible}</h1>
            <p className={styles.stateBlockSub}>{t.pasEnLigne(nomGite)}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href={lien(langue, "/contact")}>{t.contacter}</Link>
              <Link className="btn btn-ghost" href={lien(langue, "/gites")}>{t.voirGites}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
