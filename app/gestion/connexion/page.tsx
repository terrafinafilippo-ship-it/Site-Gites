import Link from "next/link";

import { actionConnexion } from "../actions";
import styles from "../gestion.module.css";

export const dynamic = "force-dynamic";

const ERREURS: Record<string, string> = {
  refus: "Adresse ou mot de passe incorrect.",
  envoi: "Le code n'a pas pu être envoyé par courriel. Réessayez dans quelques minutes.",
  code_expire: "Le code n'est plus valable. Reconnectez-vous pour en recevoir un nouveau.",
};

const INFOS: Record<string, string> = {
  deconnecte: "Vous êtes déconnecté.",
  mot_de_passe: "Le mot de passe est enregistré. Tous les appareils ont été déconnectés : connectez-vous.",
  appareil_retire: "Cet appareil a été retiré : il redemandera un code à la prochaine connexion.",
};

export default async function PageConnexion({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const erreur =
    q.erreur === "attente"
      ? `Trop d'essais depuis cette adresse. Réessayez après ${q.jusqua ?? "quelques minutes"}.`
      : q.erreur
        ? ERREURS[q.erreur]
        : undefined;
  const info = q.info ? INFOS[q.info] : undefined;

  return (
    <main className={styles.etroite}>
      <h1>Gestion des gîtes</h1>
      {erreur && <p className={`${styles.message} ${styles.ko}`} role="alert">{erreur}</p>}
      {info && <p className={`${styles.message} ${styles.ok}`}>{info}</p>}
      <form action={actionConnexion} className={styles.carte}>
        <div className={styles.champ}>
          <label htmlFor="courriel">Adresse</label>
          <input id="courriel" name="courriel" type="email" autoComplete="username" required className={styles.large} />
        </div>
        <div className={styles.champ}>
          <label htmlFor="mot_de_passe">Mot de passe</label>
          <input id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="current-password" required className={styles.large} />
        </div>
        <button type="submit" className={styles.bouton}>Se connecter</button>
      </form>
      <p className={styles.liens}>
        <Link href="/gestion/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
    </main>
  );
}
