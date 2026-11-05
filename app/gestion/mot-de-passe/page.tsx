import Link from "next/link";

import { lienValable } from "@/lib/gestion/connexion";
import { MOT_DE_PASSE_MIN, REFUS_MOT_DE_PASSE, type RefusMotDePasse } from "@/lib/gestion/secrets";

import { actionMotDePasse } from "../actions";
import styles from "../gestion.module.css";

export const dynamic = "force-dynamic";

export default async function PageMotDePasse({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const jeton = q.jeton ?? null;
  const valable = q.erreur !== "expire" && (await lienValable(jeton));
  // Seuls les refus connus s'affichent : l'adresse ne peut pas faire dire n'importe quoi à la page.
  const refus = q.erreur && Object.hasOwn(REFUS_MOT_DE_PASSE, q.erreur) ? REFUS_MOT_DE_PASSE[q.erreur as RefusMotDePasse] : null;

  return (
    <main className={styles.etroite}>
      <h1>Choisir le mot de passe</h1>
      {!valable ? (
        <p className={`${styles.message} ${styles.ko}`} role="alert">
          Ce lien n&apos;est plus valable (déjà utilisé, remplacé par un plus récent, ou expiré).{" "}
          <Link href="/gestion/mot-de-passe-oublie">Demander un nouveau lien</Link>.
        </p>
      ) : (
        <>
          {refus && <p className={`${styles.message} ${styles.ko}`} role="alert">{refus}</p>}
          <form action={actionMotDePasse} className={styles.carte}>
            <input type="hidden" name="jeton" value={jeton ?? ""} />
            <p className={styles.aide}>
              Au moins {MOT_DE_PASSE_MIN} caractères. Une phrase facile à retenir convient très bien. Une fois enregistré,
              tous les appareils sont déconnectés.
            </p>
            <div className={styles.champ}>
              <label htmlFor="mot_de_passe">Nouveau mot de passe</label>
              <input
                id="mot_de_passe"
                name="mot_de_passe"
                type="password"
                autoComplete="new-password"
                minLength={MOT_DE_PASSE_MIN}
                required
                className={styles.large}
              />
            </div>
            <div className={styles.champ}>
              <label htmlFor="confirmation">Le même, une seconde fois</label>
              <input
                id="confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={MOT_DE_PASSE_MIN}
                required
                className={styles.large}
              />
            </div>
            <button type="submit" className={styles.bouton}>Enregistrer</button>
          </form>
        </>
      )}
    </main>
  );
}
