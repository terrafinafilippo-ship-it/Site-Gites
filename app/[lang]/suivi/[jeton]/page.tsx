import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { after } from "next/server";

import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { NOM_SITE } from "@/lib/i18n/metadonnees";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { constaterRetour } from "@/lib/paiement";
import { CONTACTS, LIBELLES_RECAP, recapitulatif } from "@/lib/recapitulatif";
import type { EtatSolde } from "@/lib/solde";
import { getStorage } from "@/lib/storage";
import { chargerSuivi, type ContratSuivi } from "@/lib/suivi";
import FormulaireLien from "../FormulaireLien";
import styles from "../page.module.css";
import PayerSolde from "./PayerSolde";

// PAGE « MA RÉSERVATION » (Phase 3, lot 4, étape 3, D-25), ouverte par le
// lien secret du client : /suivi/{jeton}. Choix du gérant du 28 octobre 2026 :
//   - les faits, comme la confirmation, plus l'état du contrat (à signer avec
//     son bouton, ou signé avec le PDF à télécharger) ; aucune action qui
//     n'existe pas (modifier, annuler, changer de carte) ;
//   - l'adresse du gîte et les heures, dès le paiement ;
//   - réservation remboursée : « n'a pas pu être confirmée » ;
//   - lien inconnu, jamais payé ou expiré : une seule réponse, avec le
//     formulaire « Retrouver ma réservation » (seul endroit où il apparaît).
// Rien n'est inventé : pas de code de boîte à clés, de wifi ni de consignes
// d'accès, qui n'existent pas en base.
//
// Phase 4, lot 1 (D-28) : le bloc « Votre solde » (prélèvement prévu, à
// régler avec le bouton de paiement, payé). Après un paiement, Stripe ramène
// ici avec l'identifiant du paiement et son secret : la page le revérifie
// (constaterRetour) avant d'en dire quoi que ce soit.

// Données personnelles derrière un jeton : jamais en cache, jamais indexée,
// et l'adresse (qui porte le jeton) n'est pas transmise aux sites liés.
export const dynamic = "force-dynamic";

/** Validité du lien de téléchargement du contrat signé (1 h, comme la page de signature). */
const TTL_PDF = 60 * 60;

const TEXTES: Bilingue<{
  titrePage: string;
  surtitre: string;
  duAu: (du: string, au: string) => string;
  sejour: string;
  contrat: string;
  aVenir: string;
  aVenirTexte: string;
  aSigner: string;
  aSignerTexte: (numero: string) => string;
  signer: string;
  lienExpire: (numero: string) => string;
  signe: string;
  signeTexte: (numero: string, date: string | null) => string;
  telecharger: string;
  pdfIndisponible: string;
  arrivee: string;
  adresse: (a: string) => string;
  heureArrivee: (date: string, heure: string, limite: string | null) => string;
  heureDepart: (date: string, heure: string) => string;
  question: string;
  validite: (date: string) => string;
  invalideTitre: string;
  invalideTexte: string;
  rembourseTitre: string;
  rembourseFait: (montant: string) => string;
  rembourseEnCours: (montant: string) => string;
  autresDates: string;
  solde: string;
  soldeEtat: Record<EtatSolde["etat"], string>;
  soldePaye: (montant: string, date: string | null) => string;
  soldePrevu: (montant: string, date: string) => string;
  soldeAPayer: (montant: string, date: string, passee: boolean) => string;
  soldeRefuse: string;
  soldeEnCours: string;
  retourRecu: string;
  retourEnCours: string;
  retourEchec: string;
}> = {
  fr: {
    titrePage: "Ma réservation",
    surtitre: "Votre réservation",
    duAu: (du, au) => `Du ${du} au ${au}`,
    sejour: "Votre séjour",
    contrat: "Votre contrat",
    aVenir: "En préparation",
    aVenirTexte: "Votre contrat vous sera envoyé par courriel.",
    aSigner: "À signer",
    aSignerTexte: (numero) => `Contrat ${numero}, à signer en ligne.`,
    signer: "Signer mon contrat",
    lienExpire: (numero) =>
      `Contrat ${numero}, à signer. Le lien de signature a expiré : écrivez-nous pour en recevoir un nouveau.`,
    signe: "Signé",
    signeTexte: (numero, date) => (date ? `Contrat ${numero}, signé le ${date}.` : `Contrat ${numero}, signé.`),
    telecharger: "Télécharger le contrat signé (PDF)",
    pdfIndisponible: "Le téléchargement est momentanément indisponible : écrivez-nous pour recevoir une copie.",
    arrivee: "Votre arrivée",
    adresse: (a) => `Adresse : ${a}`,
    heureArrivee: (date, heure, limite) =>
      `Arrivée : ${date}, à partir de ${heure}${limite ? ` (au plus tard ${limite})` : ""}`,
    heureDepart: (date, heure) => `Départ : ${date}, ${heure}`,
    question: "Une question ?",
    validite: (date) => `Cette page reste accessible par ce lien jusqu'au ${date}.`,
    invalideTitre: "Ce lien n'est pas valable ou a expiré.",
    invalideTexte: "Vous pouvez recevoir à nouveau le lien de votre réservation par courriel.",
    rembourseTitre: "Cette réservation n'a pas pu être confirmée.",
    rembourseFait: (montant) => `Votre paiement de ${montant} a été intégralement remboursé.`,
    rembourseEnCours: (montant) => `Le remboursement intégral de votre paiement de ${montant} est en cours.`,
    autresDates: "Choisir d'autres dates",
    solde: "Votre solde",
    soldeEtat: { paye: "Payé", a_payer: "À régler", prelevement_prevu: "Prévu", en_cours: "En cours" },
    soldePaye: (m, date) => `Solde de ${m} payé${date ? ` le ${date}` : ""}.`,
    soldePrevu: (m, date) => `Solde de ${m}, prélevé le ${date} sur la carte enregistrée lors de votre réservation.`,
    soldeAPayer: (m, date, passee) =>
      passee ? `Solde de ${m}, qui était à régler au plus tard le ${date}.` : `Solde de ${m}, à régler au plus tard le ${date}.`,
    soldeRefuse: "Le prélèvement a été refusé par votre banque : vous pouvez régler le solde en ligne.",
    soldeEnCours: "Votre banque traite le paiement du solde. Rechargez cette page dans quelques instants.",
    retourRecu: "Paiement du solde reçu — merci ! Votre facture vous est envoyée par courriel.",
    retourEnCours: "Votre banque traite le paiement. Rechargez cette page dans quelques instants.",
    retourEchec: "Votre paiement n'a pas abouti : aucune somme n'a été prélevée.",
  },
  en: {
    titrePage: "My booking",
    surtitre: "Your booking",
    duAu: (du, au) => `From ${du} to ${au}`,
    sejour: "Your stay",
    contrat: "Your contract",
    aVenir: "Being prepared",
    aVenirTexte: "Your contract will be sent to you by email.",
    aSigner: "To be signed",
    aSignerTexte: (numero) => `Contract ${numero}, in French, to be signed online.`,
    signer: "Sign my contract",
    lienExpire: (numero) =>
      `Contract ${numero}, to be signed. The signing link has expired: write to us to receive a new one.`,
    signe: "Signed",
    signeTexte: (numero, date) => (date ? `Contract ${numero}, signed on ${date}.` : `Contract ${numero}, signed.`),
    telecharger: "Download the signed contract (PDF)",
    pdfIndisponible: "The download is temporarily unavailable: write to us to receive a copy.",
    arrivee: "Your arrival",
    adresse: (a) => `Address: ${a}`,
    heureArrivee: (date, heure, limite) =>
      `Arrival: ${date}, from ${heure}${limite ? ` (${limite} at the latest)` : ""}`,
    heureDepart: (date, heure) => `Departure: ${date}, ${heure}`,
    question: "A question?",
    validite: (date) => `This page remains available through this link until ${date}.`,
    invalideTitre: "This link is not valid or has expired.",
    invalideTexte: "You can receive the link to your booking again by email.",
    rembourseTitre: "This booking could not be confirmed.",
    rembourseFait: (montant) => `Your payment of ${montant} has been refunded in full.`,
    rembourseEnCours: (montant) => `The full refund of your payment of ${montant} is in progress.`,
    autresDates: "Choose other dates",
    solde: "Your balance",
    soldeEtat: { paye: "Paid", a_payer: "To be paid", prelevement_prevu: "Scheduled", en_cours: "Processing" },
    soldePaye: (m, date) => `Balance of ${m} paid${date ? ` on ${date}` : ""}.`,
    soldePrevu: (m, date) => `Balance of ${m}, charged on ${date} to the card saved when you booked.`,
    soldeAPayer: (m, date, passee) =>
      passee ? `Balance of ${m}, which was due by ${date}.` : `Balance of ${m}, to be paid by ${date} at the latest.`,
    soldeRefuse: "The charge was declined by your bank: you can pay the balance online.",
    soldeEnCours: "Your bank is processing the balance payment. Reload this page in a few moments.",
    retourRecu: "Balance payment received — thank you! Your invoice is being sent to you by email.",
    retourEnCours: "Your bank is processing the payment. Reload this page in a few moments.",
    retourEchec: "Your payment did not go through: nothing has been charged.",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return {
    title: `${TEXTES[langue].titrePage} — ${NOM_SITE}`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** Date civile à Paris (« 2026-10-28 ») d'un instant. */
function jourParis(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function heure(h: string | null, langue: Langue): string | null {
  return h ? fmtHeure(h.slice(0, 5), langue) : null;
}

function Contact({ langue, adresse }: { langue: Langue; adresse: string }) {
  return (
    <div className={styles.bloc}>
      <h2>{TEXTES[langue].question}</h2>
      <p>
        <a href={`mailto:${adresse}`}>{adresse}</a> · {CONTACTS}
      </p>
    </div>
  );
}

async function BlocContrat({ langue, contrat }: { langue: Langue; contrat: ContratSuivi }) {
  const t = TEXTES[langue];
  if (contrat.etat === "a_venir") {
    return (
      <>
        <span className={`${styles.etat} ${styles.attente}`}>{t.aVenir}</span>
        <p>{t.aVenirTexte}</p>
      </>
    );
  }
  if (contrat.etat === "a_signer") {
    return (
      <>
        <span className={`${styles.etat} ${styles.aFaire}`}>{t.aSigner}</span>
        {contrat.jeton ? (
          <>
            <p>{t.aSignerTexte(contrat.numero)}</p>
            <div className={styles.actions}>
              {/* Page de signature en français seulement (D-22). */}
              <a className="btn btn-primary" href={`/signer/${contrat.jeton}`} rel="noreferrer">
                {t.signer}
              </a>
            </div>
          </>
        ) : (
          <p>{t.lienExpire(contrat.numero)}</p>
        )}
      </>
    );
  }
  let pdf: string | null = null;
  try {
    pdf = await getStorage().getSignedUrl(contrat.chemin, TTL_PDF);
  } catch {
    pdf = null; // stockage mal configuré : la page reste lisible
  }
  return (
    <>
      <span className={`${styles.etat} ${styles.fait}`}>{t.signe}</span>
      <p>{t.signeTexte(contrat.numero, contrat.date ? fmtDateLongue(jourParis(contrat.date), langue) : null)}</p>
      {pdf ? (
        <div className={styles.actions}>
          <a className="btn btn-secondary" href={pdf} rel="noreferrer">
            {t.telecharger}
          </a>
        </div>
      ) : (
        <p className={styles.sous}>{t.pdfIndisponible}</p>
      )}
    </>
  );
}

function BlocSolde({ langue, jeton, solde }: { langue: Langue; jeton: string; solde: EtatSolde }) {
  const t = TEXTES[langue];
  const m = fmtEuro(solde.montant, langue);
  const classe = solde.etat === "paye" ? styles.fait : solde.etat === "a_payer" ? styles.aFaire : styles.attente;
  return (
    <div className={styles.bloc}>
      <h2>{t.solde}</h2>
      <span className={`${styles.etat} ${classe}`}>{t.soldeEtat[solde.etat]}</span>
      {solde.etat === "paye" && (
        <p>{t.soldePaye(m, solde.date ? fmtDateLongue(jourParis(solde.date), langue) : null)}</p>
      )}
      {solde.etat === "prelevement_prevu" && <p>{t.soldePrevu(m, fmtDateLongue(solde.dateLimite, langue))}</p>}
      {solde.etat === "en_cours" && <p>{t.soldeEnCours}</p>}
      {solde.etat === "a_payer" && (
        <>
          <p>{t.soldeAPayer(m, fmtDateLongue(solde.dateLimite, langue), jourParis(new Date()) > solde.dateLimite)}</p>
          {solde.refuse && <p className={styles.sous}>{t.soldeRefuse}</p>}
          <PayerSolde langue={langue} jeton={jeton} montant={solde.montant} />
        </>
      )}
    </div>
  );
}

type Parametres = Record<string, string | string[] | undefined>;

function texte(p: Parametres, cle: string): string | null {
  const v = p[cle];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function SuiviPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; jeton: string }>;
  searchParams: Promise<Parametres>;
}) {
  const { lang, jeton } = await params;
  const langue = langueDe(lang);
  const t = TEXTES[langue];
  let suivi = await chargerSuivi(jeton);

  // Retour d'un paiement du solde : revérifié chez Stripe, et seulement s'il
  // concerne CETTE réservation. Les courriels (facture) partent après la réponse.
  let retour: string | null = null;
  const p = await searchParams;
  const paiementId = texte(p, "payment_intent");
  const secret = texte(p, "payment_intent_client_secret");
  if (suivi.etat === "ouvert" && paiementId && secret) {
    try {
      const r = await constaterRetour(paiementId, secret);
      if (r && "reservationId" in r.issue && r.issue.reservationId === suivi.resa.id) {
        const issue = r.issue.issue;
        retour =
          issue === "SOLDE_RECU"
            ? t.retourRecu
            : issue === "EN_COURS"
              ? t.retourEnCours
              : issue === "ECHOUE" || issue === "ANNULE" || issue === "EN_ATTENTE"
                ? t.retourEchec
                : null;
        suivi = await chargerSuivi(jeton);
      }
    } catch (erreur) {
      console.error(`[suivi] vérification du paiement ${paiementId} impossible :`, erreur instanceof Error ? erreur.message : erreur);
      retour = t.retourEnCours;
    }
    const entetes = await headers();
    const origine =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      `${entetes.get("x-forwarded-proto") ?? "http"}://${entetes.get("host") ?? "localhost"}`;
    after(() => traiterCourriels(origine));
  }

  if (suivi.etat === "invalide") {
    return (
      <section className={styles.page}>
        <div className={`wrap ${styles.colonne}`}>
          <div className={styles.bloc}>
            <h1>{t.invalideTitre}</h1>
            <p className={styles.sous}>{t.invalideTexte}</p>
          </div>
          <FormulaireLien langue={langue} />
        </div>
      </section>
    );
  }

  const { resa } = suivi;
  const nomGite = resa.gites?.nom ?? "";
  const plage = t.duAu(fmtDateLongue(resa.date_arrivee, langue), fmtDateLongue(resa.date_depart, langue));
  const r = LIBELLES_RECAP[langue];

  if (suivi.etat === "rembourse") {
    const montant = fmtEuro(suivi.montant, langue);
    return (
      <section className={styles.page}>
        <div className={`wrap ${styles.colonne}`}>
          <div className={styles.bloc}>
            <h1>{t.rembourseTitre}</h1>
            <p>{suivi.fait ? t.rembourseFait(montant) : t.rembourseEnCours(montant)}</p>
            <p className={styles.sous}>
              {nomGite} · {plage} · {r.reference(resa.reference)}
            </p>
            {resa.gites?.slug && (
              <div className={styles.actions}>
                <Link className="btn btn-primary" href={lien(langue, `/reserver?gite=${resa.gites.slug}`)}>
                  {t.autresDates}
                </Link>
              </div>
            )}
          </div>
          <Contact langue={langue} adresse={suivi.contact} />
        </div>
      </section>
    );
  }

  const faits = recapitulatif(resa, langue, suivi.paiement);
  const ha = heure(resa.heure_arrivee, langue);
  const hd = heure(resa.heure_depart, langue);
  const hl = heure(resa.heure_limite_arrivee, langue);

  return (
    <section className={styles.page}>
      <div className={`wrap ${styles.colonne}`}>
        <div className={styles.bloc}>
          <span className="eyebrow">{t.surtitre}</span>
          <h1 style={{ marginTop: 10 }}>{nomGite}</h1>
          <p className={styles.sous}>{plage}</p>
        </div>

        {retour && (
          <p className={styles.recu} role="status">
            {retour}
          </p>
        )}

        <div className={styles.bloc}>
          <h2>{t.sejour}</h2>
          <ul className={styles.faits}>
            <li>
              <strong>{faits.reference}</strong> {r.referenceAide}
            </li>
            <li>
              {faits.sejour} · {faits.voyageurs}
            </li>
            <li>{faits.paye}</li>
            {/* Le solde a son bloc, qui dit où il en est. */}
            {faits.solde && !suivi.solde && <li>{faits.solde}</li>}
            {faits.caution && <li>{faits.caution}</li>}
          </ul>
        </div>

        {suivi.solde && <BlocSolde langue={langue} jeton={jeton} solde={suivi.solde} />}

        <div className={styles.bloc}>
          <h2>{t.contrat}</h2>
          <BlocContrat langue={langue} contrat={suivi.contrat} />
        </div>

        <div className={styles.bloc}>
          <h2>{t.arrivee}</h2>
          <ul className={styles.faits}>
            {resa.gites?.adresse && <li>{t.adresse(resa.gites.adresse)}</li>}
            {ha && <li>{t.heureArrivee(fmtDateAvecJour(resa.date_arrivee, langue), ha, hl)}</li>}
            {hd && <li>{t.heureDepart(fmtDateAvecJour(resa.date_depart, langue), hd)}</li>}
          </ul>
        </div>

        <Contact langue={langue} adresse={suivi.contact} />

        <p className={styles.note}>{t.validite(fmtDateLongue(suivi.finValidite, langue))}</p>
      </div>
    </section>
  );
}
