import type { Metadata } from "next";
import Link from "next/link";

import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { NOM_SITE } from "@/lib/i18n/metadonnees";
import { CONTACTS, LIBELLES_RECAP, recapitulatif } from "@/lib/recapitulatif";
import { getStorage } from "@/lib/storage";
import { chargerSuivi, type ContratSuivi } from "@/lib/suivi";
import FormulaireLien from "../FormulaireLien";
import styles from "../page.module.css";

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

export default async function SuiviPage({ params }: { params: Promise<{ lang: string; jeton: string }> }) {
  const { lang, jeton } = await params;
  const langue = langueDe(lang);
  const t = TEXTES[langue];
  const suivi = await chargerSuivi(jeton);

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
            {faits.solde && <li>{faits.solde}</li>}
            {faits.caution && <li>{faits.caution}</li>}
          </ul>
        </div>

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
