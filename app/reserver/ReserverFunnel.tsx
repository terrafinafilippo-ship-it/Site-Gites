"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import type { GiteData } from "@/lib/data/gites";
import styles from "./page.module.css";

export type FunnelState =
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "success"
  | "conflict"
  | "refused"
  | "3ds-failed";

const ALL_STATES: FunnelState[] = [
  "step1", "step2", "step3", "step4", "success", "conflict", "refused", "3ds-failed",
];

/* ===== Réservation de démonstration (single source of truth, cf. reserver.html) ===== */
const BOOKING = {
  start: "sam. 11 juil. 2026",
  end: "sam. 18 juil. 2026",
  nights: 7,
  season: "Moyenne saison",
  nightPrice: 111.43,
  cleaning: 80,
  taxRate: 0.055,
};

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function compute() {
  const nights = BOOKING.nights * BOOKING.nightPrice;
  const subtotal = nights + BOOKING.cleaning;
  // Taxe de séjour : 5,5 % appliquée à l'hébergement + ménage (= brief : 47,30 €)
  const tax = subtotal * BOOKING.taxRate;
  const total = subtotal + tax;
  const deposit = total * 0.3;
  const balance = total - deposit;
  return { nights, subtotal, tax, total, deposit, balance };
}

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

/* ===== Mini calendrier (affichage statique de juillet 2026) ===== */
function MiniCal() {
  const dayNames = ["L", "M", "M", "J", "V", "S", "D"];
  const m = new Date(2026, 6, 1);
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const firstDow = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;

  const cells: ReactNode[] = dayNames.map((d, i) => (
    <div className={`${styles.mcDay} ${styles.dayname}`} key={`dn-${i}`}>{d}</div>
  ));
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div className={`${styles.mcDay} ${styles.empty}`} key={`e-${i}`} />);
  }
  for (let d = 1; d <= days; d++) {
    let cls = "";
    if (d < 5) cls = styles.past;
    else if (d >= 21 && d <= 26) cls = styles.busy;
    else if (d === 11) cls = `${styles.start} ${styles.inRange}`;
    else if (d === 18) cls = `${styles.end} ${styles.inRange}`;
    else if (d > 11 && d < 18) cls = styles.inRange;
    cells.push(
      <div className={`${styles.mcDay}${cls ? ` ${cls}` : ""}`} key={d}>{d}</div>
    );
  }

  return (
    <div className={styles.miniCal}>
      <div className={styles.miniCalNav}>
        <button aria-label="Mois précédent" type="button">{ChevronLeft}</button>
        <span className={styles.miniCalTitle}>Juillet 2026</span>
        <button aria-label="Mois suivant" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
      <div className={styles.miniCalGrid}>{cells}</div>
    </div>
  );
}

/* ===== Champ d'une étape coordonnées ===== */
function Field({ label, required, name, type = "text", error }: {
  label: string;
  required?: boolean;
  name: string;
  type?: string;
  error: string;
}) {
  return (
    <div className={styles.field}>
      <label>
        {label} {required && <span>*</span>}
      </label>
      <input type={type} name={name} defaultValue="" />
      <div className={styles.fieldError}>{error}</div>
    </div>
  );
}

export default function ReserverFunnel({ gite }: { gite: GiteData }) {
  const [state, setState] = useState<FunnelState>("step1");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [baby, setBaby] = useState(0);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [overlay, setOverlay] = useState<"processing" | "3ds" | null>(null);

  const c = compute();
  const stepIndex = { step1: 1, step2: 2, step3: 3, step4: 4 }[state as "step1"] as number | undefined;
  const isStep = stepIndex !== undefined;

  const goTo = (next: FunnelState) => {
    setState(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const pay = () => {
    setOverlay("processing");
    setTimeout(() => {
      setOverlay("3ds");
      setTimeout(() => {
        setOverlay(null);
        goTo("success");
      }, 1800);
    }, 1500);
  };

  const stepperButton = (value: number, set: (n: number) => void, delta: number, max: number) => (
    <button type="button" onClick={() => set(Math.max(0, Math.min(max, value + delta)))}>
      {delta < 0 ? "−" : "+"}
    </button>
  );

  /* ===== Recap sidebar (réutilisé sur les 4 étapes) ===== */
  const recap = (
    <aside className={styles.recap}>
      <div className={styles.recapHead}>
        <div className={styles.recapImg}>
          <ImageSlot placeholder={gite.name} />
        </div>
        <div>
          <div className={styles.recapName}>{gite.name}</div>
          <div className={styles.recapSub}>{gite.target}</div>
        </div>
      </div>
      <dl>
        <div><dt>Arrivée</dt><dd>{BOOKING.start.replace(/^\w+\.\s/, "")}</dd></div>
        <div><dt>Départ</dt><dd>{BOOKING.end.replace(/^\w+\.\s/, "")}</dd></div>
        <div><dt>Voyageurs</dt><dd>{adults + children} pers.{baby ? " + bébé" : ""}</dd></div>
        <div><dt>Saison</dt><dd>{BOOKING.season}</dd></div>
      </dl>
      <div className={styles.recapLines}>
        <div className={styles.recapLine}><dt>{BOOKING.nights} nuits × {fmt(BOOKING.nightPrice)}</dt><dd>{fmt(c.nights)}</dd></div>
        <div className={styles.recapLine}><dt>Ménage</dt><dd>{fmt(BOOKING.cleaning)}</dd></div>
        <div className={styles.recapLine}><dt>Taxe séjour 5,5 %</dt><dd>{fmt(c.tax)}</dd></div>
      </div>
      <div className={styles.recapTotal}>
        <dt>Total TTC</dt>
        <dd>{fmt(c.total)}</dd>
      </div>
      <div className={styles.recapDeposit}>
        <strong>Acompte 30 %</strong>
        {fmt(c.deposit)} aujourd&apos;hui
      </div>
      <div className={styles.recapCaution}>
        Caution Swikly 500 € · empreinte J-7 · non débitée sauf dégât. Solde de {fmt(c.balance)} prélevé J-30.
      </div>
    </aside>
  );

  return (
    <>
      {/* Slim funnel header */}
      <header className={styles.funnelHeader}>
        <div className={`wrap ${styles.funnelHeaderRow}`}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" style={{ height: 72, width: "auto" }} />
          </Link>
          <Link className={styles.funnelQuit} href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
            Quitter la réservation
          </Link>
        </div>
      </header>

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
                  Sélectionnez vos dates dans le calendrier — les nuits déjà réservées apparaissent rayées.
                </p>

                <div className={styles.fieldGroup}>
                  <h3>Vos dates</h3>
                  <div className={styles.dates}>
                    <div className={`${styles.dateCard} ${styles.isActive}`}>
                      <div className={styles.dateCardLabel}>Arrivée</div>
                      <div className={styles.dateCardValue}>{BOOKING.start}</div>
                      <div className={styles.dateCardSub}>À partir de 16h</div>
                    </div>
                    <div className={styles.dateCard}>
                      <div className={styles.dateCardLabel}>Départ</div>
                      <div className={styles.dateCardValue}>{BOOKING.end}</div>
                      <div className={styles.dateCardSub}>Avant 10h</div>
                    </div>
                  </div>
                  <MiniCal />
                </div>

                <div className={styles.fieldGroup}>
                  <h3>Voyageurs</h3>
                  <div className={styles.stepperRow}>
                    <div className={styles.stepperRowInfo}>
                      <strong>Adultes</strong>
                      <small>13 ans et plus</small>
                    </div>
                    <div className={styles.stepper}>
                      {stepperButton(adults, setAdults, -1, 10)}
                      <span>{adults}</span>
                      {stepperButton(adults, setAdults, 1, 10)}
                    </div>
                  </div>
                  <div className={styles.stepperRow}>
                    <div className={styles.stepperRowInfo}>
                      <strong>Enfants</strong>
                      <small>2 à 12 ans</small>
                    </div>
                    <div className={styles.stepper}>
                      {stepperButton(children, setChildren, -1, 10)}
                      <span>{children}</span>
                      {stepperButton(children, setChildren, 1, 10)}
                    </div>
                  </div>
                  <div className={styles.stepperRow}>
                    <div className={styles.stepperRowInfo}>
                      <strong>Lit bébé</strong>
                      <small>Moins de 2 ans · inclus sans surcoût</small>
                    </div>
                    <div className={styles.stepper}>
                      {stepperButton(baby, setBaby, -1, 1)}
                      <span>{baby}</span>
                      {stepperButton(baby, setBaby, 1, 1)}
                    </div>
                  </div>
                </div>

                <div className={styles.stepActions}>
                  <span />
                  <button className="btn btn-primary" onClick={() => goTo("step2")}>
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
                      <Field label="Prénom" required name="firstname" error="Veuillez indiquer votre prénom." />
                      <Field label="Nom" required name="lastname" error="Veuillez indiquer votre nom." />
                    </div>
                    <div className={styles.fieldRow}>
                      <Field label="Email" required name="email" type="email" error="Adresse email invalide." />
                      <Field label="Téléphone" required name="phone" type="tel" error="Format invalide." />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <h3>Adresse postale</h3>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <Field label="Adresse" required name="address" error="Veuillez indiquer votre adresse." />
                    </div>
                    <div className={styles.fieldRow}>
                      <Field label="Code postal" required name="zip" error="Code postal invalide." />
                      <Field label="Ville" required name="city" error="Veuillez indiquer la ville." />
                    </div>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <div className={styles.field}>
                        <label>Pays</label>
                        <select name="country" defaultValue="France">
                          <option>France</option>
                          <option>Belgique</option>
                          <option>Suisse</option>
                          <option>Italie</option>
                          <option>Allemagne</option>
                          <option>Pays-Bas</option>
                          <option>Royaume-Uni</option>
                          <option>Autre</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </form>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step1")}>
                    {ChevronLeft}
                    Retour
                  </button>
                  <button className="btn btn-primary" onClick={() => goTo("step3")}>
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
      {state === "step3" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>Quelques options pour votre séjour</h1>
                <p className={styles.stepLead}>
                  Aucune n&apos;est obligatoire — choisissez ce qui vous fait plaisir.
                </p>

                <div className={styles.fieldGroup}>
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
                  <p style={{ fontSize: 13, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.6 }}>
                    Une demande particulière (panier d&apos;accueil, soin à domicile, transfert) ?
                    Écrivez-nous à l&apos;arrivée — nous nous arrangeons sur place.
                  </p>
                </div>

                <div className={styles.detailedRecap}>
                  <h4>Récapitulatif détaillé</h4>
                  <div className={styles.drLine}>
                    <div>
                      <strong>7 nuits × 111,43 €</strong>
                      <small>Moyenne saison · {gite.name}</small>
                    </div>
                    <span>780,00 €</span>
                  </div>
                  <div className={styles.drLine}>
                    <div>
                      <strong>Forfait ménage</strong>
                      <small>Final, inclus dans le total</small>
                    </div>
                    <span>80,00 €</span>
                  </div>
                  <div className={styles.drLine}>
                    <div>
                      <strong>Taxe de séjour</strong>
                      <small>5,5 % TTC</small>
                    </div>
                    <span>{fmt(c.tax)}</span>
                  </div>
                  <div className={styles.drTotal}>
                    <span>Total TTC</span>
                    <strong>{fmt(c.total)}</strong>
                  </div>
                  <div className={styles.drDeposit}>
                    <span>
                      <strong>À régler maintenant — acompte 30 %</strong>
                      <small>Le solde sera prélevé J-30 sur la même carte.</small>
                    </span>
                    <em>{fmt(c.deposit)}</em>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.5 }}>
                    Caution Swikly de 500 € : empreinte bancaire prélevée J-7 et libérée 7 jours après
                    votre départ. <strong>Non débitée</strong> sauf dégât constaté.
                  </p>
                </div>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step2")}>
                    {ChevronLeft}
                    Retour
                  </button>
                  <button className="btn btn-primary" onClick={() => goTo("step4")}>
                    Procéder au paiement
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
      {state === "step4" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>Paiement de l&apos;acompte</h1>
                <p className={styles.stepLead}>
                  Le récapitulatif ci-contre est figé. Vous réglez 30 % aujourd&apos;hui, le solde
                  J-30 sera prélevé sur la même carte.
                </p>

                <div className={styles.stripeBlock}>
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
                    <p>Les champs CB sont injectés par Stripe — aucun numéro n&apos;est traité par notre site.</p>
                    <div className={styles.stripeMockCards}>
                      <i>VISA</i><i>MC</i><i>AMEX</i><i>CB</i><i>3-D&nbsp;SECURE</i>
                    </div>
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
                      , le barème d&apos;annulation et la politique de caution Swikly.{" "}
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
                  <button className={styles.stepBack} onClick={() => goTo("step3")}>
                    {ChevronLeft}
                    Retour
                  </button>
                  <button className="btn btn-primary" disabled={!cgvAccepted} onClick={pay}>
                    Payer l&apos;acompte de {fmt(c.deposit)}
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

      {/* ============== SUCCESS ============== */}
      {state === "success" && (
        <section>
          <div className={styles.successBanner}>
            <div className="wrap">
              <div className={styles.successBannerCheck}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1>Votre séjour est confirmé.</h1>
              <p className={styles.successBannerSub}>
                Un email récapitulatif vient de partir vers votre boîte. Vous recevrez ensuite votre
                contrat eIDAS à signer sous 48 heures.
              </p>
              <div className={styles.successBannerRef}>
                <div>
                  <span>Numéro de réservation</span>
                  <strong>SAM-2026-07-LP-4271</strong>
                </div>
              </div>
            </div>
          </div>

          <section className={styles.nextSteps}>
            <div className="wrap">
              <h2>Prochaines étapes</h2>
              <div className={styles.stepList}>
                <div className={styles.stepCard}>
                  <div className={styles.stepCardNum}>1</div>
                  <div>
                    <h4>Contrat à signer en ligne</h4>
                    <p>Signature électronique eIDAS, sans imprimer. Le lien arrive dans les minutes qui suivent.</p>
                    <div className={styles.stepCardWhen}>Sous 48 heures</div>
                  </div>
                </div>
                <div className={styles.stepCard}>
                  <div className={styles.stepCardNum}>2</div>
                  <div>
                    <h4>Empreinte caution Swikly</h4>
                    <p>500 € pré-autorisés, non débités. Libérés 7 jours après votre départ sauf dégât.</p>
                    <div className={styles.stepCardWhen}>J − 7</div>
                  </div>
                </div>
                <div className={styles.stepCard}>
                  <div className={styles.stepCardNum}>3</div>
                  <div>
                    <h4>Solde du séjour</h4>
                    <p>Prélèvement automatique du solde sur la carte utilisée aujourd&apos;hui — 635,11 € restants.</p>
                    <div className={styles.stepCardWhen}>J − 30</div>
                  </div>
                </div>
                <div className={styles.stepCard}>
                  <div className={styles.stepCardNum}>4</div>
                  <div>
                    <h4>Coordonnées d&apos;arrivée</h4>
                    <p>Adresse précise, code de la boîte à clés, numéros directs, infos pratiques — tout en un email.</p>
                    <div className={styles.stepCardWhen}>J − 3</div>
                  </div>
                </div>
              </div>

              <div className={styles.successActions}>
                <Link className="btn btn-primary" href="/suivi/SAM-2026-07-LP-4271">
                  Suivre ma réservation
                  {ArrowRight}
                </Link>
                <a className="btn btn-secondary" href="#">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 3v12" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="4" y1="20" x2="20" y2="20" />
                  </svg>
                  Télécharger le récap PDF
                </a>
                <Link className="btn btn-ghost" href="/">Retour à l&apos;accueil</Link>
              </div>
            </div>
          </section>
        </section>
      )}

      {/* ============== CONFLICT ============== */}
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
                    Pendant que vous remplissiez vos coordonnées, un autre hôte a finalisé sa
                    réservation sur la même période.
                  </p>
                </div>
              </div>
              <div className={styles.noCharge}>
                {NoChargeCheck}
                Aucun débit · 0,00 €
              </div>
              <p style={{ marginBottom: 8 }}>Voici trois alternatives au même gîte, aux dates les plus proches :</p>
              <div className={styles.altDates}>
                <button className={styles.altDate}>
                  <small>1 semaine plus tôt</small>
                  <strong>4 → 11 juil. 2026</strong>
                  <em>780,00 € TTC</em>
                </button>
                <button className={styles.altDate}>
                  <small>1 semaine plus tard</small>
                  <strong>18 → 25 juil. 2026</strong>
                  <em>920,00 € TTC · haute saison</em>
                </button>
                <button className={styles.altDate}>
                  <small>2 semaines plus tard</small>
                  <strong>25 juil. → 1ᵉʳ août 2026</strong>
                  <em>920,00 € TTC · haute saison</em>
                </button>
              </div>
              <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 32, marginBottom: 8, fontSize: 22 }}>
                Ou les deux autres gîtes, aux dates initiales
              </h3>
              <div className={styles.recourses}>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 21V9l9-6 9 6v12" /><path d="M9 21V12h6v9" />
                  </svg>
                  <strong>L&apos;Armu — couple, 2 pers.</strong>
                  <p>Disponible 11 → 18 juillet · jacuzzi véranda · 690 € TTC</p>
                  <Link href="/reserver?gite=armu" className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                    Choisir L&apos;Armu
                  </Link>
                </div>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 21V9l9-6 9 6v12" /><path d="M9 21V12h6v9" />
                  </svg>
                  <strong>La Maison Vieille — 4 pers. + sauna</strong>
                  <p>Disponible 11 → 18 juillet · spa et sauna · 960 € TTC</p>
                  <Link href="/reserver?gite=maison-vieille" className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                    Choisir La Maison Vieille
                  </Link>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <Link className="btn btn-ghost" href="/contact">Nous écrire pour de l&apos;aide</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== REFUSED ============== */}
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

      {/* ============== 3DS FAILED ============== */}
      {state === "3ds-failed" && (
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
                <button className="btn btn-primary" onClick={() => goTo("step4")}>Reprendre le paiement</button>
                <Link className="btn btn-ghost" href="/contact">Nous appeler</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Processing overlay */}
      {overlay === "processing" && (
        <div className={styles.overlay} role="dialog" aria-live="assertive">
          <div className={styles.overlayCard}>
            <div className={styles.overlayIcon}><div className={styles.spinner} /></div>
            <h3>Traitement en cours</h3>
            <p>Ne fermez pas cette page. Nous communiquons avec votre banque pour valider l&apos;acompte.</p>
          </div>
        </div>
      )}

      {/* 3DS overlay */}
      {overlay === "3ds" && (
        <div className={styles.overlay} role="dialog">
          <div className={styles.overlayCard}>
            <div className={styles.overlayIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <h3>Authentification bancaire requise</h3>
            <p>
              Validez l&apos;opération dans votre application bancaire ou via le code reçu par SMS.
              <br />
              Cette fenêtre se fermera dès la confirmation reçue.
            </p>
            <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
              <div className={styles.spinner} />
              <span style={{ color: "var(--color-gray-medium)", fontSize: 13, alignSelf: "center" }}>
                En attente de votre banque…
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sélecteur d'état — dev uniquement */}
      {process.env.NODE_ENV === "development" && (
        <div className={styles.devSwitcher}>
          <span>⚙ État</span>
          <select value={state} onChange={(e) => goTo(e.target.value as FunnelState)}>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
