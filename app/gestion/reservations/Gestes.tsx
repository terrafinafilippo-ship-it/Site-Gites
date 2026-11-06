"use client";
// Les gestes du back-office sur une réservation (Phase 5, lot 2). Un geste
// définitif (libérer, retenir, solde reçu) passe par un second écran qui
// récapitule ce qui va se faire (réponse 1 A du cadrage du 6 novembre 2026).
import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { EtatGeste } from "../actions-reservations";
import styles from "../gestion.module.css";

type Action = (precedent: EtatGeste, f: FormData) => Promise<EtatGeste>;

const INITIAL: EtatGeste = { version: 0, ok: null, message: "" };

function Retour({ etat }: { etat: EtatGeste }) {
  if (etat.ok === null) return null;
  return (
    <p className={`${styles.message} ${etat.ok ? styles.ok : styles.ko}`} role={etat.ok ? undefined : "alert"}>
      {etat.message}
    </p>
  );
}

/** « 120 », « 120,5 » → « 120,50 € » ; null si mal formé. Sans calcul flottant. */
export function euros(saisie: string): string | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const entiers = m[1].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${entiers},${(m[2] ?? "").padEnd(2, "0")} €`;
}

/** Un bouton ; avec `confirmation`, un second clic après lecture de la phrase. */
export function GesteBouton({
  action,
  libelle,
  confirmation,
  discret,
}: {
  action: Action;
  libelle: string;
  confirmation?: string;
  discret?: boolean;
}) {
  const [etat, envoyer, enCours] = useActionState(action, INITIAL);
  const [aConfirmer, setAConfirmer] = useState(false);
  const classe = discret ? styles.boutonDiscret : styles.bouton;
  return (
    <div>
      <Retour etat={etat} />
      {etat.ok ? null : confirmation && aConfirmer ? (
        <form action={envoyer} className={styles.confirmation}>
          <p>
            <strong>{confirmation}</strong>
          </p>
          <div className={styles.ligne}>
            <button type="submit" className={classe} disabled={enCours}>
              {enCours ? "En cours…" : "Confirmer"}
            </button>
            <button type="button" className={styles.boutonSecondaire} onClick={() => setAConfirmer(false)} disabled={enCours}>
              Annuler
            </button>
          </div>
        </form>
      ) : confirmation ? (
        <button type="button" className={classe} onClick={() => setAConfirmer(true)}>
          {libelle}
        </button>
      ) : (
        <form action={envoyer}>
          <button type="submit" className={classe} disabled={enCours}>
            {enCours ? "En cours…" : libelle}
          </button>
        </form>
      )}
    </div>
  );
}

/** Un formulaire simple : les champs viennent de la page. */
export function GesteFormulaire({ action, libelle, children }: { action: Action; libelle: string; children: ReactNode }) {
  const [etat, envoyer, enCours] = useActionState(action, INITIAL);
  return (
    <div>
      <Retour etat={etat} />
      <form action={envoyer}>
        {children}
        <button type="submit" className={styles.bouton} disabled={enCours}>
          {enCours ? "Enregistrement…" : libelle}
        </button>
      </form>
    </div>
  );
}

const OCTETS_MAX = 10 * 1024 * 1024;

/**
 * Envoi sans remise à zéro du formulaire : après un refus (montant trop
 * élevé…), la saisie et les fichiers choisis restent en place.
 */
function envoyerSansEffacer(envoyer: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(() => envoyer(f));
  };
}

/** Retenir sur la caution : montant, motif, justificatifs, puis le récapitulatif à confirmer. */
export function FormulaireRetenue({
  action,
  caution,
  cautionTexte,
  client,
  moyen,
}: {
  action: Action;
  /** Centimes. */
  caution: number;
  cautionTexte: string;
  client: string;
  moyen: "carte" | "cheque" | "virement";
}) {
  const [etat, envoyer, enCours] = useActionState(action, INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);
  const [recap, setRecap] = useState<{ montant: string; motif: string; fichiers: string[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function verifier() {
    const f = new FormData(formulaire.current!);
    const saisie = String(f.get("montant") ?? "");
    const montant = euros(saisie);
    const motif = String(f.get("motif") ?? "").trim();
    const fichiers = (f.getAll("pieces") as File[]).filter((x) => x.size > 0);
    const total = fichiers.reduce((s, x) => s + x.size, 0);
    if (!montant) return setErreur("Le montant n'est pas valable (par exemple 120 ou 120,50).");
    if (!motif) return setErreur("Le motif est obligatoire : il part au client avec les justificatifs.");
    if (total > OCTETS_MAX) return setErreur("Les justificatifs dépassent 10 Mo en tout : réduisez la taille des photos.");
    setErreur(null);
    setRecap({ montant, motif, fichiers: fichiers.map((x) => x.name) });
  }

  if (etat.ok) return <Retour etat={etat} />;
  return (
    <div>
      <Retour etat={etat} />
      {erreur && (
        <p className={`${styles.message} ${styles.ko}`} role="alert">
          {erreur}
        </p>
      )}
      <form ref={formulaire} onSubmit={envoyerSansEffacer(envoyer)}>
        {/* Les champs restent montés pendant le récapitulatif : les fichiers choisis partent avec la confirmation. */}
        <div hidden={recap !== null}>
          <div className={styles.champ}>
            <label htmlFor="retenue-montant">Montant retenu (au plus {cautionTexte})</label>
            <input id="retenue-montant" name="montant" type="text" inputMode="decimal" autoComplete="off" required />
          </div>
          <div className={styles.champ}>
            <label htmlFor="retenue-motif">Motif (envoyé au client)</label>
            <textarea id="retenue-motif" name="motif" rows={3} maxLength={1000} required className={styles.large} />
          </div>
          <div className={styles.champ}>
            <label htmlFor="retenue-pieces">Justificatifs : photos, devis, facture (PDF ou photos, 10 Mo au plus en tout)</label>
            <input id="retenue-pieces" name="pieces" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" />
          </div>
          <button type="button" className={styles.boutonDiscret} onClick={verifier}>
            Retenir…
          </button>
        </div>
        {recap && (
          <div className={styles.confirmation}>
            <p>
              <strong>
                {moyen === "carte"
                  ? `Vous allez encaisser ${recap.montant} sur la carte de ${client}. C'est définitif.`
                  : `Vous notez une retenue de ${recap.montant} sur la caution de ${client} ; le reste est à lui rendre. C'est définitif.`}
              </strong>
            </p>
            <p>Motif envoyé au client : {recap.motif}</p>
            <p>
              Justificatifs joints : {recap.fichiers.length ? recap.fichiers.join(", ") : "aucun"}. Caution : {cautionTexte}.
            </p>
            <div className={styles.ligne}>
              <button type="submit" className={styles.boutonDiscret} disabled={enCours}>
                {enCours ? "En cours…" : "Confirmer la retenue"}
              </button>
              <button type="button" className={styles.boutonSecondaire} onClick={() => setRecap(null)} disabled={enCours}>
                Modifier
              </button>
            </div>
          </div>
        )}
      </form>
      {caution <= 0 && <p className={styles.aide}>Caution sans montant : rien à retenir.</p>}
    </div>
  );
}

/** Solde reçu par virement : date, montant (exactement le solde), référence, puis le récapitulatif à confirmer. */
export function FormulaireSoldeVirement({
  action,
  soldeTexte,
  soldeSaisi,
  aujourdhui,
}: {
  action: Action;
  soldeTexte: string;
  /** Le solde écrit comme on le tape (« 403,66 »). */
  soldeSaisi: string;
  aujourdhui: string;
}) {
  const [etat, envoyer, enCours] = useActionState(action, INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);
  const [recap, setRecap] = useState<{ montant: string; date: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function verifier() {
    const f = new FormData(formulaire.current!);
    const montant = euros(String(f.get("montant") ?? ""));
    const date = String(f.get("date") ?? "");
    if (!montant) return setErreur("Le montant n'est pas valable (par exemple 403,66).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErreur("Indiquez la date de réception du virement.");
    setErreur(null);
    setRecap({ montant, date: new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) });
  }

  if (etat.ok) return <Retour etat={etat} />;
  return (
    <div>
      <Retour etat={etat} />
      {erreur && (
        <p className={`${styles.message} ${styles.ko}`} role="alert">
          {erreur}
        </p>
      )}
      <form ref={formulaire} onSubmit={envoyerSansEffacer(envoyer)}>
        <div hidden={recap !== null}>
          <div className={styles.champ}>
            <label htmlFor="solde-date">Reçu le</label>
            <input id="solde-date" name="date" type="date" defaultValue={aujourdhui} max={aujourdhui} required />
          </div>
          <div className={styles.champ}>
            <label htmlFor="solde-montant">Montant reçu (exactement le solde : {soldeTexte})</label>
            <input id="solde-montant" name="montant" type="text" inputMode="decimal" defaultValue={soldeSaisi} autoComplete="off" required />
          </div>
          <div className={styles.champ}>
            <label htmlFor="solde-reference">Référence du virement, lue sur le relevé (facultative, imprimée sur la facture)</label>
            <input id="solde-reference" name="reference" type="text" maxLength={140} autoComplete="off" className={styles.large} />
          </div>
          <button type="button" className={styles.bouton} onClick={verifier}>
            Solde reçu par virement…
          </button>
        </div>
        {recap && (
          <div className={styles.confirmation}>
            <p>
              <strong>
                Vous notez le solde de {recap.montant} reçu par virement le {recap.date}. La facture de solde part au client. C&apos;est
                définitif.
              </strong>
            </p>
            <div className={styles.ligne}>
              <button type="submit" className={styles.bouton} disabled={enCours}>
                {enCours ? "En cours…" : "Confirmer"}
              </button>
              <button type="button" className={styles.boutonSecondaire} onClick={() => setRecap(null)} disabled={enCours}>
                Modifier
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
