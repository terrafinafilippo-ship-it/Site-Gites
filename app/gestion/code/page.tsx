import Link from "next/link";
import { redirect } from "next/navigation";

import { actionCode } from "../actions";
import styles from "../gestion.module.css";
import { CONNEXION, temoin, TEMOIN_ATTENTE } from "../outils";

export const dynamic = "force-dynamic";

export default async function PageCode({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Sans l'étape précédente (mot de passe tapé sur ce navigateur), rien à faire ici.
  if (!(await temoin(TEMOIN_ATTENTE))) redirect(CONNEXION);
  const q = await searchParams;
  const restants = Number(q.restants);
  const erreur =
    q.erreur === "refus"
      ? `Code incorrect.${Number.isInteger(restants) && restants > 0 ? ` Encore ${restants} essai${restants > 1 ? "s" : ""}.` : ""}`
      : undefined;

  return (
    <main className={styles.etroite}>
      <h1>Nouvel appareil</h1>
      <p>Cet appareil n&apos;est pas encore reconnu. Un code à 6 chiffres vient d&apos;être envoyé à l&apos;adresse de la gestion.</p>
      {erreur && <p className={`${styles.message} ${styles.ko}`} role="alert">{erreur}</p>}
      <form action={actionCode} className={styles.carte}>
        <div className={styles.champ}>
          <label htmlFor="code">Code reçu par courriel</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            className={styles.large}
          />
        </div>
        <button type="submit" className={styles.bouton}>Valider</button>
      </form>
      <p className={styles.liens}>
        <Link href={CONNEXION}>Recommencer</Link>
      </p>
    </main>
  );
}
