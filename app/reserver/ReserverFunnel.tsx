"use client";

// Tunnel de réservation : dates et voyageurs, coordonnées, récapitulatif,
// paiement.
//
// Le prix affiché est calculé ICI, par le même code que le serveur
// (lib/devis.ts), avec les données lues en base au chargement de la page. Il
// ne sert qu'à l'affichage : à l'arrivée sur l'écran de paiement, le serveur
// recalcule tout, enregistre la réservation et bloque les dates
// (POST /api/reservations). Revenir en arrière lève ce blocage
// (DELETE /api/reservations/{id}).
//
// Le paiement lui-même est branché au lot 3 (Stripe) : d'ici là, le bouton
// « Payer » reste inactif. Les écrans « refused » et « 3ds-failed » sont ceux
// du prototype, conservés pour le lot 3 et inaccessibles d'ici là.

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { DELAI_SOLDE_DEFAUT, TAUX_ACOMPTE } from "@/lib/constantes";
import { CIVILITES, nombreAutresAdultes, validerCoordonnees, type ErreursCoordonnees } from "@/lib/coordonnees";
import type { GiteData } from "@/lib/data/gites";
import {
  controlerDates,
  controlerOccupants,
  dateLongue,
  devisSejour,
  preparerDevis,
  type Devis,
  type Occupants,
} from "@/lib/devis";
import { fmtEuro, fmtHeureFr, fmtPrix, fmtTaux } from "@/lib/format";
import type { Alternative, DonneesTunnel } from "@/lib/tunnel";
import Calendrier from "./Calendrier";
import EnteteTunnel from "./EnteteTunnel";
import styles from "./page.module.css";

export type FunnelState = "step1" | "step2" | "step3" | "step4" | "conflict" | "refused" | "3ds-failed";

/** Dates et voyageurs pré-remplis par l'adresse de la page (lien vers un autre gîte libre). */
export interface DemandeInitiale {
  arrivee?: string;
  depart?: string;
  adultes?: number;
  enfants?: number;
  bebes?: number;
}

/** La réservation enregistrée par le serveur, dates bloquées. */
interface Tentative {
  id: string;
  reference: string;
  devis: Devis;
  prixModifie: boolean;
  /** Fin du blocage selon l'horloge du navigateur (durée reçue + heure de réception). */
  echeance: number;
}

interface Formulaire {
  civilite: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  coCivilite: string;
  coPrenom: string;
  coNom: string;
  autres: Array<{ prenom: string; nom: string }>;
}

const FORMULAIRE_VIDE: Formulaire = {
  civilite: "", prenom: "", nom: "", email: "", telephone: "",
  adresse: "", codePostal: "", ville: "", pays: "France",
  coCivilite: "", coPrenom: "", coNom: "", autres: [],
};

// ─── Mise en forme ───────────────────────────────────────────────────────────

/** « sam. 17 oct. 2026 ». Date civile lue en UTC : aucun décalage de fuseau. */
function dateCourte(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

function libelleVoyageurs(o: Occupants): string {
  const parties = [pluriel(o.adultes, "adulte")];
  if (o.enfants) parties.push(pluriel(o.enfants, "enfant"));
  if (o.bebes) parties.push(pluriel(o.bebes, "bébé"));
  return parties.join(" · ");
}

function minutesSecondes(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}

// ─── Icônes ──────────────────────────────────────────────────────────────────

const ArrowRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);
const ChevronLeft = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="15 6 9 12 15 18" />
  </svg>
);
const NoChargeCheck = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <polyline points="8 12 11 15 16 9" />
  </svg>
);

// ─── Petits composants ───────────────────────────────────────────────────────

function Champ({
  label,
  requis,
  valeur,
  onChange,
  erreur,
  type = "text",
  autoComplete,
}: {
  label: string;
  requis?: boolean;
  valeur: string;
  onChange: (v: string) => void;
  erreur?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className={`${styles.field}${erreur ? ` ${styles.hasError}` : ""}`}>
      <label>
        {label} {requis && <span>*</span>}
        <input
          type={type}
          value={valeur}
          autoComplete={autoComplete}
          aria-invalid={erreur ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <div className={styles.fieldError}>{erreur}</div>
    </div>
  );
}

function ChampCivilite({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.field}>
      <label>
        Civilité (facultatif)
        <select value={valeur} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {CIVILITES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Compteur({
  titre,
  detail,
  valeur,
  min,
  peutAjouter,
  onChange,
}: {
  titre: string;
  detail: string;
  valeur: number;
  min: number;
  peutAjouter: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className={styles.stepperRow}>
      <div className={styles.stepperRowInfo}>
        <strong>{titre}</strong>
        <small>{detail}</small>
      </div>
      <div className={styles.stepper}>
        <button type="button" aria-label={`${titre} : un de moins`} disabled={valeur <= min} onClick={() => onChange(valeur - 1)}>
          −
        </button>
        <span>{valeur}</span>
        <button type="button" aria-label={`${titre} : un de plus`} disabled={!peutAjouter} onClick={() => onChange(valeur + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

// ─── Tunnel ──────────────────────────────────────────────────────────────────

export default function ReserverFunnel({
  gite,
  donnees,
  initial,
}: {
  gite: GiteData;
  donnees: DonneesTunnel;
  initial: DemandeInitiale;
}) {
  const ctx = useMemo(() => preparerDevis(donnees), [donnees]);
  const { reglages } = donnees;
  const capacite = donnees.gite.capaciteMax;

  const [state, setState] = useState<FunnelState>("step1");
  const [arrivee, setArrivee] = useState<string | null>(initial.arrivee ?? null);
  const [depart, setDepart] = useState<string | null>(initial.arrivee && initial.depart ? initial.depart : null);
  const [adultes, setAdultes] = useState(Math.max(1, initial.adultes ?? Math.min(2, capacite)));
  const [enfants, setEnfants] = useState(initial.enfants ?? 0);
  const [bebes, setBebes] = useState(initial.bebes ?? 0);

  const [formulaire, setFormulaire] = useState<Formulaire>(FORMULAIRE_VIDE);
  const [avecColocataire, setAvecColocataire] = useState(false);
  const [erreurs, setErreurs] = useState<ErreursCoordonnees>({});

  const [tentative, setTentative] = useState<Tentative | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [maintenant, setMaintenant] = useState(0);

  // ── Devis du navigateur (affichage seulement) ──
  const occupants: Occupants = { adultes, enfants, bebes };
  const refusOccupants = controlerOccupants(ctx, occupants);
  const dates = arrivee && depart ? controlerDates(ctx, arrivee, depart) : null;
  const resultat = arrivee && depart && !refusOccupants && dates?.ok ? devisSejour(ctx, { arrivee, depart, ...occupants }) : null;
  const devisClient = resultat?.ok ? resultat.devis : null;
  const refusDates = dates && !dates.ok ? dates.refus : resultat && !resultat.ok ? resultat.refus : null;
  // Une fois les dates bloquées, c'est le devis du SERVEUR qui s'affiche.
  const devis = tentative?.devis ?? devisClient;

  const peutAjouter = (o: Partial<Occupants>) => controlerOccupants(ctx, { ...occupants, ...o }) === null;

  // ── Compte à rebours du blocage ──
  useEffect(() => {
    if (!tentative) return;
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuterie);
  }, [tentative]);
  const resteMs = tentative ? tentative.echeance - maintenant : 0;
  const blocageExpire = tentative !== null && maintenant > 0 && resteMs <= 0;

  const goTo = (next: FunnelState) => {
    setState(next);
    setMessage(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Coordonnées ──
  // Le second locataire est l'un des adultes : il n'existe qu'à partir de deux.
  const colocataireActif = avecColocataire && adultes >= 2;
  const nbAutres = nombreAutresAdultes(adultes, colocataireActif);
  const autres = Array.from({ length: nbAutres }, (_, i) => formulaire.autres[i] ?? { prenom: "", nom: "" });
  const majFormulaire = (champ: keyof Omit<Formulaire, "autres">) => (v: string) =>
    setFormulaire((f) => ({ ...f, [champ]: v }));
  const majAutre = (i: number, champ: "prenom" | "nom") => (v: string) =>
    setFormulaire((f) => {
      const liste = Array.from({ length: Math.max(f.autres.length, i + 1) }, (_, k) => f.autres[k] ?? { prenom: "", nom: "" });
      liste[i] = { ...liste[i], [champ]: v };
      return { ...f, autres: liste };
    });

  const coordonneesBrutes = () => ({
    locataire: { civilite: formulaire.civilite, prenom: formulaire.prenom, nom: formulaire.nom },
    email: formulaire.email,
    telephone: formulaire.telephone,
    adresse: formulaire.adresse,
    codePostal: formulaire.codePostal,
    ville: formulaire.ville,
    pays: formulaire.pays,
    colocataire: colocataireActif
      ? { civilite: formulaire.coCivilite, prenom: formulaire.coPrenom, nom: formulaire.coNom }
      : null,
    autresAdultes: autres,
  });

  const validerEtape2 = () => {
    const r = validerCoordonnees(coordonneesBrutes(), adultes);
    if (!r.ok) {
      setErreurs(r.erreurs);
      return;
    }
    setErreurs({});
    goTo("step3");
  };

  // ── Blocage et abandon ──
  async function abandonner(gardeConnexion = false) {
    if (!tentative) return;
    const id = tentative.id;
    setTentative(null);
    try {
      await fetch(`/api/reservations/${id}`, { method: "DELETE", keepalive: gardeConnexion });
    } catch {
      // Sans réponse, le blocage expire seul à son échéance.
    }
  }

  async function bloquer() {
    if (!devisClient || !arrivee || !depart) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gite: gite.id,
          arrivee,
          depart,
          adultes,
          enfants,
          bebes,
          coordonnees: coordonneesBrutes(),
          totalAttendu: devisClient.montants.totalTtc,
        }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      if (reponse.status === 201) {
        setTentative({
          id: String(corps.id),
          reference: String(corps.reference),
          devis: corps.devis as Devis,
          prixModifie: corps.prixModifie === true,
          echeance: Date.now() + Number(corps.dureeBlocageMinutes) * 60_000,
        });
        setCgvAccepted(false);
        goTo("step4");
        return;
      }
      if (reponse.status === 409 && corps.code === "DATES_PRISES") {
        setAlternatives((corps.alternatives as Alternative[] | undefined) ?? []);
        goTo("conflict");
        return;
      }
      if (reponse.status === 400 && corps.code === "CHAMPS_INVALIDES") {
        setErreurs((corps.erreurs as ErreursCoordonnees | undefined) ?? {});
        goTo("step2");
        return;
      }
      setMessage(typeof corps.error === "string" ? corps.error : "La réservation n'a pas pu être enregistrée.");
    } catch {
      setMessage("La connexion a échoué. Vérifiez votre réseau, puis réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  async function rebloquer() {
    await abandonner();
    // Retour au récapitulatif : un échec (dates prises entre-temps, panne) s'y affiche.
    goTo("step3");
    await bloquer();
  }

  // ── Récapitulatif latéral ──
  const recap = (
    <aside className={styles.recap}>
      <div className={styles.recapHead}>
        <div className={styles.recapImg}>
          <ImageSlot placeholder={gite.name} />
        </div>
        <div>
          <div className={styles.recapName}>{gite.name}</div>
          <div className={styles.recapSub}>{gite.profil} · {capacite} personnes</div>
        </div>
      </div>
      <dl>
        <div><dt>Arrivée</dt><dd>{arrivee ? dateCourte(arrivee) : "—"}</dd></div>
        <div><dt>Départ</dt><dd>{depart ? dateCourte(depart) : "—"}</dd></div>
        <div><dt>Voyageurs</dt><dd>{libelleVoyageurs(occupants)}</dd></div>
      </dl>
      {devis && (
        <>
          <div className={styles.recapLines}>
            {devis.prix.lignes.map((l) => (
              <div className={styles.recapLine} key={l.premiereNuit}>
                <dt>{l.tarifNom} · {pluriel(l.nbNuits, "nuit")}</dt>
                <dd>{fmtEuro(l.montant)}</dd>
              </div>
            ))}
            <div className={styles.recapLine}><dt>Forfait ménage</dt><dd>{fmtEuro(devis.montants.forfaitMenage)}</dd></div>
            <div className={styles.recapLine}><dt>Taxe de séjour</dt><dd>{fmtEuro(devis.montants.taxeSejour)}</dd></div>
          </div>
          <div className={styles.recapTotal}>
            <dt>Total TTC</dt>
            <dd>{fmtEuro(devis.montants.totalTtc)}</dd>
          </div>
          <div className={styles.recapDeposit}>
            <strong>{devis.paiementIntegral ? "Totalité du séjour" : `Acompte ${fmtTaux(TAUX_ACOMPTE)}`}</strong>
            {fmtEuro(devis.aRegler)} aujourd&apos;hui
          </div>
          <div className={styles.recapCaution}>
            Caution de {fmtPrix(devis.caution)} : préautorisation sur votre carte la veille du départ, sans débit sauf dégât constaté.{" "}
            {devis.dateLimiteSolde
              ? `Solde de ${fmtEuro(devis.montants.solde)} à régler au plus tard le ${dateLongue(devis.dateLimiteSolde)}.`
              : `Arrivée à moins de ${DELAI_SOLDE_DEFAUT} jours : le séjour se règle en totalité à la réservation.`}
          </div>
        </>
      )}
    </aside>
  );

  const stepIndex = { step1: 1, step2: 2, step3: 3, step4: 4 }[state as "step1"] as number | undefined;
  const isStep = stepIndex !== undefined;
  const lienAutreGite = (slug: string) => {
    const p = new URLSearchParams({
      gite: slug,
      arrivee: arrivee ?? "",
      depart: depart ?? "",
      adultes: String(adultes),
      enfants: String(enfants),
      bebes: String(bebes),
    });
    return `/reserver?${p.toString()}`;
  };

  return (
    <>
      <EnteteTunnel onQuitter={() => void abandonner(true)} />

      {/* Progress bar (masquée hors étapes) */}
      {isStep && (
        <section className={styles.progress}>
          <div className="wrap">
            <div className={styles.progressBar}>
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`${styles.progressSeg}${n < stepIndex! ? ` ${styles.isDone}` : n === stepIndex ? ` ${styles.isCurrent}` : ""}`}
                />
              ))}
            </div>
            <div className={styles.progressSteps}>
              {["Dates & voyageurs", "Coordonnées", "Options & récapitulatif", "Paiement"].map((lbl, i) => {
                const n = i + 1;
                return (
                  <div
                    key={lbl}
                    className={`${styles.progressStep}${n < stepIndex! ? ` ${styles.isDone}` : n === stepIndex ? ` ${styles.isCurrent}` : ""}`}
                  >
                    <span className={styles.num}>{n}</span>
                    <span className={styles.lbl}>{lbl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 1 ============== */}
      {state === "step1" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>Quand venez-vous, et combien êtes-vous&nbsp;?</h1>
                <p className={styles.stepLead}>
                  Choisissez vos dates dans le calendrier : les nuits déjà prises sont rayées.
                </p>

                <div className={styles.fieldGroup}>
                  <h3>Vos dates</h3>
                  <div className={styles.dates}>
                    <div className={`${styles.dateCard}${!arrivee || !depart ? ` ${styles.isActive}` : ""}`}>
                      <div className={styles.dateCardLabel}>Arrivée</div>
                      <div className={styles.dateCardValue}>{arrivee ? dateCourte(arrivee) : "À choisir"}</div>
                      <div className={styles.dateCardSub}>À partir de {fmtHeureFr(reglages.heureArrivee)}</div>
                    </div>
                    <div className={styles.dateCard}>
                      <div className={styles.dateCardLabel}>Départ</div>
                      <div className={styles.dateCardValue}>{depart ? dateCourte(depart) : "À choisir"}</div>
                      <div className={styles.dateCardSub}>Avant {fmtHeureFr(reglages.heureDepart)}</div>
                    </div>
                  </div>
                  <Calendrier
                    ctx={ctx}
                    horizon={donnees.horizon}
                    arrivee={arrivee}
                    depart={depart}
                    onChange={(a, d) => {
                      setArrivee(a);
                      setDepart(d);
                    }}
                  />
                  {donnees.horizon === null && (
                    <div className={styles.avis}>Aucune date n&apos;est encore ouverte à la réservation en ligne pour ce gîte.</div>
                  )}
                  {refusDates && <div className={styles.avis}>{refusDates.message}</div>}
                </div>

                <div className={styles.fieldGroup}>
                  <h3>Voyageurs</h3>
                  <Compteur
                    titre="Adultes"
                    detail="18 ans et plus"
                    valeur={adultes}
                    min={1}
                    peutAjouter={peutAjouter({ adultes: adultes + 1 })}
                    onChange={setAdultes}
                  />
                  <Compteur
                    titre="Enfants"
                    detail={`De ${reglages.bebeAgeLimite} à 17 ans`}
                    valeur={enfants}
                    min={0}
                    peutAjouter={peutAjouter({ enfants: enfants + 1 })}
                    onChange={setEnfants}
                  />
                  <Compteur
                    titre="Bébés"
                    detail={`Moins de ${reglages.bebeAgeLimite} ans`}
                    valeur={bebes}
                    min={0}
                    peutAjouter={peutAjouter({ bebes: bebes + 1 })}
                    onChange={setBebes}
                  />
                  <p className={styles.miniCalAide}>
                    {gite.name} accueille {capacite} personnes
                    {reglages.bebesHorsCapacite === 1
                      ? `, sans compter un bébé de moins de ${reglages.bebeAgeLimite} ans`
                      : reglages.bebesHorsCapacite > 1
                        ? `, sans compter ${reglages.bebesHorsCapacite} bébés de moins de ${reglages.bebeAgeLimite} ans`
                        : ""}
                    .
                  </p>
                  {refusOccupants && <div className={styles.avis}>{refusOccupants.message}</div>}
                  {bebes > reglages.litsBebe && (
                    <div className={styles.avisInfo}>
                      {reglages.litsBebe === 0
                        ? "Aucun lit bébé n'est disponible."
                        : reglages.litsBebe === 1
                          ? "Un seul lit bébé est disponible."
                          : `${reglages.litsBebe} lits bébé sont disponibles.`}
                    </div>
                  )}
                </div>

                <div className={styles.stepActions}>
                  <span />
                  <button className="btn btn-primary" disabled={!devisClient} onClick={() => goTo("step2")}>
                    Continuer
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 2 ============== */}
      {state === "step2" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>Vos coordonnées</h1>
                <p className={styles.stepLead}>
                  Nous vous transmettons toutes les informations pratiques par email — assurez-vous
                  qu&apos;il soit lisible.
                </p>

                <form onSubmit={(e) => e.preventDefault()} noValidate>
                  <div className={styles.fieldGroup}>
                    <h3>Identité</h3>
                    <div className={styles.fieldRow}>
                      <ChampCivilite valeur={formulaire.civilite} onChange={majFormulaire("civilite")} />
                      <span />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label="Prénom" requis valeur={formulaire.prenom} onChange={majFormulaire("prenom")} erreur={erreurs["locataire.prenom"]} autoComplete="given-name" />
                      <Champ label="Nom" requis valeur={formulaire.nom} onChange={majFormulaire("nom")} erreur={erreurs["locataire.nom"]} autoComplete="family-name" />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label="Email" requis type="email" valeur={formulaire.email} onChange={majFormulaire("email")} erreur={erreurs.email} autoComplete="email" />
                      <Champ label="Téléphone" requis type="tel" valeur={formulaire.telephone} onChange={majFormulaire("telephone")} erreur={erreurs.telephone} autoComplete="tel" />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <h3>Adresse postale</h3>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <Champ label="Adresse" requis valeur={formulaire.adresse} onChange={majFormulaire("adresse")} erreur={erreurs.adresse} autoComplete="street-address" />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label="Code postal" requis valeur={formulaire.codePostal} onChange={majFormulaire("codePostal")} erreur={erreurs.codePostal} autoComplete="postal-code" />
                      <Champ label="Ville" requis valeur={formulaire.ville} onChange={majFormulaire("ville")} erreur={erreurs.ville} autoComplete="address-level2" />
                    </div>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <Champ label="Pays" requis valeur={formulaire.pays} onChange={majFormulaire("pays")} erreur={erreurs.pays} autoComplete="country-name" />
                    </div>
                  </div>

                  {adultes >= 2 && (
                    <div className={styles.fieldGroup}>
                      <h3>Second locataire</h3>
                      <div className={styles.consentBlock}>
                        <label>
                          <input
                            type="checkbox"
                            checked={avecColocataire}
                            onChange={(e) => setAvecColocataire(e.target.checked)}
                          />
                          <span>Ajouter un second locataire au contrat (l&apos;un des adultes du séjour).</span>
                        </label>
                      </div>
                      {erreurs.colocataire && <div className={styles.avis}>{erreurs.colocataire}</div>}
                      {colocataireActif && (
                        <>
                          <div className={styles.fieldRow} style={{ marginTop: 16 }}>
                            <ChampCivilite valeur={formulaire.coCivilite} onChange={majFormulaire("coCivilite")} />
                            <span />
                          </div>
                          <div className={styles.fieldRow}>
                            <Champ label="Prénom" requis valeur={formulaire.coPrenom} onChange={majFormulaire("coPrenom")} erreur={erreurs["colocataire.prenom"]} />
                            <Champ label="Nom" requis valeur={formulaire.coNom} onChange={majFormulaire("coNom")} erreur={erreurs["colocataire.nom"]} />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {nbAutres > 0 && (
                    <div className={styles.fieldGroup}>
                      <h3>Les autres adultes du séjour</h3>
                      <p className={styles.miniCalAide} style={{ marginTop: 0, marginBottom: 14 }}>
                        Le contrat indique le nom de chaque adulte présent.
                      </p>
                      {autres.map((a, i) => (
                        <div className={styles.fieldRow} key={i}>
                          <Champ label={`Adulte ${i + 2} — prénom`} requis valeur={a.prenom} onChange={majAutre(i, "prenom")} erreur={erreurs[`autresAdultes.${i}.prenom`]} />
                          <Champ label="Nom" requis valeur={a.nom} onChange={majAutre(i, "nom")} erreur={erreurs[`autresAdultes.${i}.nom`]} />
                        </div>
                      ))}
                    </div>
                  )}
                </form>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step1")}>
                    {ChevronLeft}
                    Retour
                  </button>
                  <button className="btn btn-primary" onClick={validerEtape2}>
                    Continuer
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 3 ============== */}
      {state === "step3" && devis && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>Quelques options pour votre séjour</h1>
                <p className={styles.stepLead}>
                  Aucune n&apos;est obligatoire — choisissez ce qui vous fait plaisir.
                </p>

                <div className={styles.fieldGroup}>
                  {bebes > 0 && (
                    <>
                      <h3>Lit bébé</h3>
                      <div className={`${styles.optionCard} ${styles.isOn}`}>
                        <div className={styles.optionCardCheck}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div className={styles.optionCardBody}>
                          <div className={styles.optionCardName}>Lit bébé fourni</div>
                          <div className={styles.optionCardDesc}>
                            Lit et linge inclus, sans surcoût. Précisez-le nous si vous en avez besoin.
                          </div>
                        </div>
                        <div className={styles.optionCardPrice} style={{ color: "var(--color-gray-medium)" }}>
                          Inclus
                        </div>
                      </div>
                    </>
                  )}
                  <p style={{ fontSize: 13, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.6 }}>
                    Une demande particulière (panier d&apos;accueil, soin à domicile, transfert) ?
                    Écrivez-nous à l&apos;arrivée — nous nous arrangeons sur place.
                  </p>
                </div>

                <div className={styles.detailedRecap}>
                  <h4>Récapitulatif détaillé</h4>
                  {devis.prix.lignes.map((l) => (
                    <div className={styles.drLine} key={l.premiereNuit}>
                      <div>
                        <strong>{l.tarifNom} · {pluriel(l.nbNuits, "nuit")}</strong>
                        <small>
                          Nuits du {dateLongue(l.premiereNuit)}
                          {l.nbNuits > 1 ? ` au ${dateLongue(l.derniereNuit)}` : ""} · {gite.name}
                        </small>
                      </div>
                      <span>{fmtEuro(l.montant)}</span>
                    </div>
                  ))}
                  <div className={styles.drLine}>
                    <div>
                      <strong>Forfait ménage</strong>
                    </div>
                    <span>{fmtEuro(devis.montants.forfaitMenage)}</span>
                  </div>
                  <div className={styles.drLine}>
                    <div>
                      <strong>Taxe de séjour</strong>
                      <small>
                        {pluriel(devis.occupants.adultes, "adulte")} × {pluriel(devis.nbNuits, "nuit")}
                        {" "}· les mineurs ne la paient pas
                      </small>
                    </div>
                    <span>{fmtEuro(devis.montants.taxeSejour)}</span>
                  </div>
                  <div className={styles.drTotal}>
                    <span>Total TTC</span>
                    <strong>{fmtEuro(devis.montants.totalTtc)}</strong>
                  </div>
                  <div className={styles.drDeposit}>
                    <span>
                      <strong>
                        {devis.paiementIntegral
                          ? "À régler maintenant — totalité du séjour"
                          : `À régler maintenant — acompte ${fmtTaux(TAUX_ACOMPTE)}`}
                      </strong>
                      <small>
                        {devis.dateLimiteSolde
                          ? `Solde de ${fmtEuro(devis.montants.solde)} à régler au plus tard le ${dateLongue(devis.dateLimiteSolde)}.`
                          : `Arrivée à moins de ${DELAI_SOLDE_DEFAUT} jours : le séjour se règle en totalité.`}
                      </small>
                    </span>
                    <em>{fmtEuro(devis.aRegler)}</em>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.5 }}>
                    Caution de {fmtPrix(devis.caution)} : préautorisation sur votre
                    carte bancaire la veille de votre départ, levée au plus tard 3 jours après.{" "}
                    <strong>Non débitée</strong> sauf dégât constaté.
                  </p>
                </div>

                {message && <div className={styles.avis}>{message}</div>}
                <p className={styles.miniCalAide}>
                  À l&apos;étape suivante, vos dates sont bloquées pendant {reglages.dureeBlocageMinutes} minutes,
                  le temps du paiement.
                </p>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step2")}>
                    {ChevronLeft}
                    Retour
                  </button>
                  <button className="btn btn-primary" disabled={envoi} onClick={() => void bloquer()}>
                    {envoi ? "Enregistrement…" : "Procéder au paiement"}
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 4 ============== */}
      {state === "step4" && tentative && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>{tentative.devis.paiementIntegral ? "Paiement du séjour" : "Paiement de l’acompte"}</h1>
                <p className={styles.stepLead}>
                  Réservation {tentative.reference}.{" "}
                  {blocageExpire ? null : (
                    <>
                      Vos dates restent bloquées encore{" "}
                      <span className={styles.compteRebours}>{minutesSecondes(resteMs)}</span>.
                    </>
                  )}
                </p>

                {tentative.prixModifie && (
                  <div className={styles.avisInfo}>
                    Le prix a changé depuis votre choix : le total est désormais de {fmtEuro(tentative.devis.montants.totalTtc)}.
                  </div>
                )}
                {blocageExpire && (
                  <div className={styles.avis}>
                    Le délai de {reglages.dureeBlocageMinutes} minutes est écoulé : vos dates ne sont plus bloquées.{" "}
                    <button className="btn btn-secondary" style={{ marginTop: 12 }} disabled={envoi} onClick={() => void rebloquer()}>
                      Bloquer à nouveau mes dates
                    </button>
                  </div>
                )}
                {message && <div className={styles.avis}>{message}</div>}

                <div className={styles.stripeBlock} style={{ marginTop: 20 }}>
                  <div className={styles.stripeBlockHead}>
                    <h3>Carte bancaire</h3>
                    <span className={styles.secureTag}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="4" y="11" width="16" height="10" rx="1" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      Paiement sécurisé · Stripe
                    </span>
                  </div>
                  <div className={styles.stripeMock}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <rect x="2" y="6" width="20" height="13" rx="1.5" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <h4>Champs de carte Stripe Elements</h4>
                    <p>Le paiement en ligne n&apos;est pas encore ouvert.</p>
                  </div>
                </div>

                <div className={styles.consentBlock}>
                  <label>
                    <input
                      type="checkbox"
                      checked={cgvAccepted}
                      onChange={(e) => setCgvAccepted(e.target.checked)}
                    />
                    <span>
                      <strong>
                        J&apos;accepte les <Link href="/legal/cgv">conditions générales de vente</Link>
                      </strong>
                      , le barème d&apos;annulation et les conditions du dépôt de garantie.{" "}
                      <span className={styles.req}>*</span>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" />
                    <span>
                      J&apos;accepte d&apos;être recontacté(e) après mon séjour pour publier un avis
                      vérifié sur Gîtes de France.
                    </span>
                  </label>
                </div>

                <div className={styles.stepActions}>
                  <button
                    className={styles.stepBack}
                    disabled={envoi}
                    onClick={async () => {
                      await abandonner();
                      goTo("step3");
                    }}
                  >
                    {ChevronLeft}
                    Retour
                  </button>
                  {/* Paiement branché au lot 3 (Stripe) : bouton inactif jusque-là. */}
                  <button className="btn btn-primary" disabled>
                    Payer {fmtEuro(tentative.devis.aRegler)}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="4" y="11" width="16" height="10" rx="1" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </button>
                </div>

                <p style={{ fontSize: 12, color: "var(--color-gray-medium)", textAlign: "center", marginTop: 20 }}>
                  En cliquant Payer, vous serez peut-être redirigé(e) vers votre application bancaire
                  pour valider l&apos;opération (3-D Secure).
                </p>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== CONFLICT : dates prises entre le devis et le blocage ============== */}
      {state === "conflict" && (
        <section>
          <div className="wrap" style={{ paddingBlock: 56 }}>
            <div className={styles.stateBlock}>
              <div className={styles.stateBlockHead}>
                <div className={`${styles.stateBlockIcon} ${styles.warning}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                  </svg>
                </div>
                <div>
                  <h1>Ces dates viennent d&apos;être prises.</h1>
                  <p className={styles.stateBlockSub}>
                    Pendant que vous remplissiez vos coordonnées, une autre réservation a retenu
                    tout ou partie de ces nuits.
                  </p>
                </div>
              </div>
              <div className={styles.noCharge}>
                {NoChargeCheck}
                Aucun débit · 0,00 €
              </div>
              {alternatives.length > 0 ? (
                <>
                  <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 8, marginBottom: 8, fontSize: 22 }}>
                    Les autres gîtes libres aux mêmes dates
                  </h3>
                  <div className={styles.recourses}>
                    {alternatives.map((a) => (
                      <div className={styles.recourse} key={a.slug}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 21V9l9-6 9 6v12" /><path d="M9 21V12h6v9" />
                        </svg>
                        <strong>{a.nom}</strong>
                        <p>
                          {arrivee && depart ? `Du ${dateLongue(arrivee)} au ${dateLongue(depart)}` : ""} ·{" "}
                          {fmtEuro(a.total)} TTC
                        </p>
                        <a href={lienAutreGite(a.slug)} className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                          Choisir {a.nom}
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>Aucun autre gîte n&apos;est libre à ces dates pour ce nombre de voyageurs.</p>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setDepart(null);
                    setArrivee(null);
                    goTo("step1");
                  }}
                >
                  Choisir d&apos;autres dates
                </button>
                <Link className="btn btn-ghost" href="/contact">Nous écrire pour de l&apos;aide</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== REFUSED (lot 3 : paiement refusé par la banque) ============== */}
      {state === "refused" && (
        <section>
          <div className="wrap" style={{ paddingBlock: 56 }}>
            <div className={styles.stateBlock}>
              <div className={styles.stateBlockHead}>
                <div className={`${styles.stateBlockIcon} ${styles.error}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <h1>Votre paiement n&apos;a pas pu aboutir.</h1>
                  <p className={styles.stateBlockSub}>
                    Votre banque n&apos;a pas autorisé l&apos;opération. Ne vous inquiétez pas —
                    c&apos;est fréquent et ça se règle en quelques secondes.
                  </p>
                </div>
              </div>
              <div className={styles.noCharge}>
                {NoChargeCheck}
                Aucune somme prélevée · dates non bloquées
              </div>
              <p>Trois pistes pour finaliser votre séjour&nbsp;:</p>
              <div className={styles.recourses}>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <polyline points="21 4 21 10 15 10" />
                  </svg>
                  <strong>Réessayer maintenant</strong>
                  <p>Même carte, même paiement. Souvent ça passe au second essai si votre banque a juste demandé une confirmation.</p>
                  <button className="btn btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={() => goTo("step4")}>
                    Réessayer le paiement
                  </button>
                </div>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="6" width="20" height="13" rx="1.5" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <strong>Utiliser une autre carte</strong>
                  <p>Vous pouvez aussi tenter avec une autre carte. Aucun blocage : vos données saisies sont gardées.</p>
                  <button className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => goTo("step4")}>
                    Changer de carte
                  </button>
                </div>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.91.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </svg>
                  <strong>Nous appeler directement</strong>
                  <p>Patricia (+33 6 79 33 23 51) et Nicolas (+33 6 66 89 96 24) vous bloquent les dates à la voix.</p>
                  <Link href="/contact" className="btn btn-ghost" style={{ marginTop: 12, width: "100%" }}>
                    Voir nos coordonnées
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== 3DS FAILED (lot 3) ============== */}
      {state === "3ds-failed" && (
        <EchecAuthentification onReprendre={() => goTo("step4")} />
      )}
    </>
  );
}

/** Écran du prototype pour une authentification bancaire échouée : branché au lot 3. */
function EchecAuthentification({ onReprendre }: { onReprendre: () => void }): ReactNode {
  return (
    <section>
      <div className="wrap" style={{ paddingBlock: 56 }}>
        <div className={styles.stateBlock}>
          <div className={styles.stateBlockHead}>
            <div className={`${styles.stateBlockIcon} ${styles.info}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="11" width="14" height="10" rx="1" />
                <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                <circle cx="12" cy="16" r="1" />
              </svg>
            </div>
            <div>
              <h1>L&apos;authentification 3-D Secure n&apos;a pas abouti.</h1>
              <p className={styles.stateBlockSub}>
                Pas d&apos;inquiétude — votre banque attendait une confirmation et n&apos;en a
                pas reçu à temps. C&apos;est très fréquent.
              </p>
            </div>
          </div>
          <div className={styles.noCharge}>
            {NoChargeCheck}
            0 € débité — votre carte est intacte
          </div>
          <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 24, marginBottom: 8, fontSize: 22 }}>
            Trois choses à essayer dans l&apos;ordre
          </h3>
          <div className={styles.recourses}>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <strong>Ouvrir votre appli bancaire</strong>
              <p>Une notification y attend peut-être votre validation. Acceptez-la, puis revenez ici pour relancer.</p>
            </div>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <strong>Patienter 1 à 2 minutes</strong>
              <p>Si la validation se fait par SMS, il arrive avec un peu de délai. Réessayez ensuite avec la même carte.</p>
            </div>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="6" width="20" height="13" rx="1.5" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <strong>Essayer une autre carte</strong>
              <p>Si l&apos;échec se répète, basculez sur une autre carte. Vos informations sont conservées.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={onReprendre}>Reprendre le paiement</button>
            <Link className="btn btn-ghost" href="/contact">Nous appeler</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
