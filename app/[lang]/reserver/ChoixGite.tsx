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
  optionInvalide: string;
  optionInvalideSub: string;
  autresDates: string;
}> = {
  fr: {
    quelGite: "Quel gîte souhaitez-vous réserver ?",
    personnes: (n) => `${n} personnes`,
    choisir: (nom) => `Choisir ${nom}`,
    indisponible: "La réservation en ligne est momentanément indisponible.",
    pasEnLigne: (nom) => `Il n'est pas possible de réserver ${nom} en ligne pour le moment.`,
    contacter: "Nous contacter",
    voirGites: "Voir les gîtes",
    optionInvalide: "Ce lien n'est plus valable.",
    optionInvalideSub: "L'option a pris fin ou a déjà servi à réserver. Vous pouvez choisir d'autres dates, ou nous appeler.",
    autresDates: "Choisir des dates",
  },
  en: {
    quelGite: "Which gîte would you like to book?",
    personnes: (n) => `${n} people`,
    choisir: (nom) => `Choose ${nom}`,
    indisponible: "Online booking is temporarily unavailable.",
    pasEnLigne: (nom) => `${nom} cannot be booked online for the moment.`,
    contacter: "Contact us",
    voirGites: "See the gîtes",
    optionInvalide: "This link is no longer valid.",
    optionInvalideSub: "The option has ended or has already been used to book. You can choose other dates, or call us.",
    autresDates: "Choose dates",
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

/** Lien d'une option qui ne garde plus ses dates : échue, levée, ou déjà utilisée (Phase 5, lot 4). */
export function OptionInvalide({ langue }: { langue: Langue }) {
  const t = TEXTES[langue];
  return (
    <>
      <EnteteTunnel langue={langue} />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>
            <h1>{t.optionInvalide}</h1>
            <p className={styles.stateBlockSub}>{t.optionInvalideSub}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href={lien(langue, "/reserver")}>{t.autresDates}</Link>
              <Link className="btn btn-ghost" href={lien(langue, "/contact")}>{t.contacter}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
