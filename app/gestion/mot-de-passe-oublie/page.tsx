import Link from "next/link";

import { actionLienOublie } from "../actions";
import styles from "../gestion.module.css";
import { CONNEXION } from "../outils";

export const dynamic = "force-dynamic";

export default async function PageMotDePasseOublie({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return (
    <main className={styles.etroite}>
      <h1>Mot de passe oublié</h1>
      {q.envoye ? (
        // La même phrase qu'il y ait un compte ou non : un curieux n'apprend rien.
        <p className={`${styles.message} ${styles.ok}`}>
          Si cette adresse est celle de la gestion, un lien pour choisir le mot de passe vient d&apos;y être envoyé.
        </p>
      ) : (
        <form action={actionLienOublie} className={styles.carte}>
          <p className={styles.aide}>Un lien pour choisir un nouveau mot de passe sera envoyé à l&apos;adresse de la gestion.</p>
          <div className={styles.champ}>
            <label htmlFor="courriel">Adresse</label>
            <input id="courriel" name="courriel" type="email" autoComplete="username" required className={styles.large} />
          </div>
          <button type="submit" className={styles.bouton}>Envoyer le lien</button>
        </form>
      )}
      <p className={styles.liens}>
        <Link href={CONNEXION}>Retour à la connexion</Link>
      </p>
    </main>
  );
}
