import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isGiteId } from "@/lib/data/gites";
import { aujourdhuiParis, ajouterJours } from "@/lib/dates-civiles";
import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure, fmtPrix } from "@/lib/format";
import { langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import { calculerMontants } from "@/lib/montants";
import { constaterRetour, lirePaiementEnregistre } from "@/lib/paiement";
import type { ModeSolde, MoyenCaution } from "@/lib/reglement";
import { chargerReservationAvecGite, type ReservationAvecGite } from "@/lib/reservations";
import { abandonnerTentative, autresGitesLibres, type Alternative } from "@/lib/tunnel";
import EnteteTunnel from "../EnteteTunnel";
import styles from "../page.module.css";

// RETOUR DE PAIEMENT (Phase 3, lot 3). Le client arrive ici après avoir payé
// dans le champ de Stripe, ou après une redirection de sa banque (3-D Secure) :
// Stripe ajoute à l'adresse l'identifiant du paiement et son secret, que seul
// le navigateur qui a payé connaît. La page REVÉRIFIE le paiement chez Stripe
// (lib/paiement.ts) avant d'afficher quoi que ce soit, puis montre :
//   - paiement reçu : les faits de la réservation, rien d'autre (écran validé
//     le 20 octobre 2026 : aucune promesse non confirmée) ;
//   - dates reprises pendant le paiement : remboursement intégral, autres
//     gîtes libres au prix recalculé (cadrage du 13 octobre 2026) ;
//   - paiement non abouti : la tentative est abandonnée (dates libérées), et
//     le client reprend sa réservation avec les mêmes dates.
// Le courriel de confirmation et le contrat à signer arrivent au lot 4 : la
// phrase qui les annonce n'apparaîtra qu'avec eux.

export const dynamic = "force-dynamic";

type Parametres = Record<string, string | string[] | undefined>;

const CONTACTS = "Patricia +33 6 79 33 23 51 · Nicolas +33 6 66 89 96 24";

const TEXTES: Bilingue<{
  titrePage: string;
  confirmeTitre: string;
  reference: (ref: string) => string;
  referenceAide: string;
  sejour: (gite: string, du: string, heureArrivee: string, au: string, heureDepart: string) => string;
  voyageurs: (adultes: number, enfants: number, bebes: number) => string;
  paye: (montant: string, total: boolean, date: string | null) => string;
  solde: (montant: string, date: string, mode: ModeSolde | null) => string;
  caution: (montant: string, moyen: MoyenCaution | null, dateVirement: string | null) => string;
  question: string;
  rembourseTitre: string;
  rembourseFait: (montant: string) => string;
  rembourseEnCours: (montant: string) => string;
  autresGites: string;
  duAu: (du: string, au: string) => string;
  ttc: string;
  choisir: (nom: string) => string;
  aucunAutre: string;
  autresDates: string;
  aide: string;
  enCoursTitre: string;
  enCoursTexte: string;
  nonAboutiTitre: string;
  nonAboutiTexte: string;
  reprendre: string;
  verifTitre: string;
  verifTexte: string;
}> = {
  fr: {
    titrePage: "Votre réservation",
    confirmeTitre: "Paiement reçu — merci !",
    reference: (ref) => `Référence : ${ref}`,
    referenceAide: "(à rappeler si vous nous contactez)",
    sejour: (gite, du, ha, au, hd) => `${gite} · du ${du} (arrivée ${ha}) au ${au} (départ ${hd})`,
    voyageurs: (a, e, b) =>
      [`${a} adulte${a > 1 ? "s" : ""}`, e ? `${e} enfant${e > 1 ? "s" : ""}` : "", b ? `${b} bébé${b > 1 ? "s" : ""}` : ""]
        .filter(Boolean)
        .join(" · "),
    paye: (montant, total, date) =>
      `${date ? `Payé le ${date}` : "Payé aujourd'hui"} : ${montant} (${total ? "totalité du séjour" : "acompte"})`,
    solde: (montant, date, mode) =>
      `Solde : ${montant} à régler au plus tard le ${date}, ${
        mode === "prelevement" ? "par prélèvement automatique" : "par un lien que nous vous enverrons"
      }`,
    caution: (montant, moyen, dateVirement) =>
      moyen === "carte"
        ? `Caution : ${montant}, par carte, bloquée la veille du départ`
        : moyen === "cheque"
          ? `Caution : ${montant}, chèque remis à l'arrivée`
          : moyen === "virement" && dateVirement
            ? `Caution : ${montant}, virement reçu au plus tard le ${dateVirement}`
            : `Caution : ${montant}`,
    question: "Une question ?",
    rembourseTitre: "Ces dates ont été prises pendant votre paiement.",
    rembourseFait: (montant) => `Votre paiement de ${montant} a été intégralement remboursé.`,
    rembourseEnCours: (montant) => `Le remboursement intégral de votre paiement de ${montant} est en cours.`,
    autresGites: "Les autres gîtes libres aux mêmes dates",
    duAu: (du, au) => `Du ${du} au ${au}`,
    ttc: "TTC",
    choisir: (nom) => `Choisir ${nom}`,
    aucunAutre: "Aucun autre gîte n'est libre à ces dates pour ce nombre de voyageurs.",
    autresDates: "Choisir d'autres dates",
    aide: "Nous écrire pour de l'aide",
    enCoursTitre: "Votre banque traite le paiement.",
    enCoursTexte: "Rechargez cette page dans quelques instants pour voir sa confirmation.",
    nonAboutiTitre: "Votre paiement n'a pas abouti.",
    nonAboutiTexte: "Aucune somme n'a été prélevée, et vos dates ne sont plus bloquées.",
    reprendre: "Reprendre ma réservation",
    verifTitre: "Nous n'avons pas pu vérifier votre paiement.",
    verifTexte: `Rechargez cette page dans quelques instants. Si le problème continue, appelez-nous : ${CONTACTS}.`,
  },
  en: {
    titrePage: "Your booking",
    confirmeTitre: "Payment received — thank you!",
    reference: (ref) => `Reference: ${ref}`,
    referenceAide: "(please quote it if you contact us)",
    sejour: (gite, du, ha, au, hd) => `${gite} · from ${du} (arrival ${ha}) to ${au} (departure ${hd})`,
    voyageurs: (a, e, b) =>
      [`${a} adult${a > 1 ? "s" : ""}`, e ? `${e} ${e > 1 ? "children" : "child"}` : "", b ? `${b} bab${b > 1 ? "ies" : "y"}` : ""]
        .filter(Boolean)
        .join(" · "),
    paye: (montant, total, date) =>
      `${date ? `Paid on ${date}` : "Paid today"}: ${montant} (${total ? "full stay" : "down payment"})`,
    solde: (montant, date, mode) =>
      `Balance: ${montant} to be paid by ${date} at the latest, ${
        mode === "prelevement" ? "by automatic payment" : "through a link we will send you"
      }`,
    caution: (montant, moyen, dateVirement) =>
      moyen === "carte"
        ? `Security deposit: ${montant}, by card, held the day before departure`
        : moyen === "cheque"
          ? `Security deposit: ${montant}, cheque handed over on arrival`
          : moyen === "virement" && dateVirement
            ? `Security deposit: ${montant}, transfer received by ${dateVirement} at the latest`
            : `Security deposit: ${montant}`,
    question: "A question?",
    rembourseTitre: "These dates were taken while you were paying.",
    rembourseFait: (montant) => `Your payment of ${montant} has been refunded in full.`,
    rembourseEnCours: (montant) => `The full refund of your payment of ${montant} is in progress.`,
    autresGites: "The other gîtes available on the same dates",
    duAu: (du, au) => `From ${du} to ${au}`,
    ttc: "incl. tax",
    choisir: (nom) => `Choose ${nom}`,
    aucunAutre: "No other gîte is available on these dates for this number of guests.",
    autresDates: "Choose other dates",
    aide: "Write to us for help",
    enCoursTitre: "Your bank is processing the payment.",
    enCoursTexte: "Reload this page in a few moments to see its confirmation.",
    nonAboutiTitre: "Your payment did not go through.",
    nonAboutiTexte: "Nothing has been charged, and your dates are no longer held.",
    reprendre: "Resume my booking",
    verifTitre: "We could not check your payment.",
    verifTexte: `Reload this page in a few moments. If the problem continues, call us: ${CONTACTS}.`,
  },
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return {
    ...metadonnees(langue, "/reserver/confirmation", TEXTES[langue].titrePage),
    robots: { index: false, follow: false },
  };
}

function texte(p: Parametres, cle: string): string | null {
  const v = p[cle];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Valeur lue dans le détail du calcul figé avec la réservation (lib/devis.ts, detailCalcul). */
function detail<T>(resa: ReservationAvecGite, cle: string, garde: (v: unknown) => v is T): T | null {
  const v = resa.detail_calcul?.[cle];
  return garde(v) ? v : null;
}
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const estDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Lien vers le tunnel avec les dates et les voyageurs de la réservation. */
function lienTunnel(langue: Langue, resa: ReservationAvecGite, slug: string, etape: boolean): string {
  const p = new URLSearchParams({
    gite: slug,
    arrivee: resa.date_arrivee,
    depart: resa.date_depart,
    adultes: String(resa.nb_adultes),
    enfants: String(resa.nb_enfants),
    bebes: String(resa.nb_bebes),
  });
  if (etape) p.set("etape", "coordonnees");
  return lien(langue, `/reserver?${p.toString()}`);
}

function Cadre({ langue, children }: { langue: Langue; children: ReactNode }) {
  return (
    <>
      <EnteteTunnel langue={langue} />
      <section>
        <div className="wrap" style={{ paddingBlock: 56 }}>
          <div className={styles.stateBlock}>{children}</div>
        </div>
      </section>
    </>
  );
}

function Tete({ ton, titre, sous }: { ton: "info" | "warning" | "error"; titre: string; sous?: string }) {
  return (
    <div className={styles.stateBlockHead}>
      <div className={`${styles.stateBlockIcon} ${styles[ton]}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          {ton === "info" ? (
            <polyline points="20 6 9 17 4 12" />
          ) : (
            <>
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </>
          )}
        </svg>
      </div>
      <div>
        <h1>{titre}</h1>
        {sous && <p className={styles.stateBlockSub}>{sous}</p>}
      </div>
    </div>
  );
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Parametres>;
}) {
  const langue = langueDe((await params).lang);
  const t = TEXTES[langue];
  const p = await searchParams;
  const paiementId = texte(p, "payment_intent");
  const secret = texte(p, "payment_intent_client_secret");
  if (!paiementId || !secret) notFound();

  let retour: Awaited<ReturnType<typeof constaterRetour>>;
  try {
    retour = await constaterRetour(paiementId, secret);
  } catch (erreur) {
    console.error(
      `[reserver/confirmation] VÉRIFICATION IMPOSSIBLE (${paiementId}) :`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return (
      <Cadre langue={langue}>
        <Tete ton="warning" titre={t.verifTitre} sous={t.verifTexte} />
      </Cadre>
    );
  }
  if (!retour) notFound();
  const { issue } = retour;

  // Paiement que le site ne connaît plus (tentative abandonnée) : seulement ce que dit Stripe.
  if (issue.issue === "INCONNU") {
    return (
      <Cadre langue={langue}>
        {retour.statut === "reussi" ? (
          <Tete ton="warning" titre={t.rembourseTitre} sous={t.rembourseEnCours(fmtEuro(retour.montant, langue))} />
        ) : (
          <>
            <Tete ton="warning" titre={t.nonAboutiTitre} sous={t.nonAboutiTexte} />
            <Link className="btn btn-primary" href={lien(langue, "/reserver")}>{t.reprendre}</Link>
          </>
        )}
      </Cadre>
    );
  }

  const resa = await chargerReservationAvecGite(issue.reservationId);
  const slug = resa?.gites?.slug;
  if (!resa || !slug || !isGiteId(slug)) notFound();
  const nomGite = resa.gites?.nom ?? slug;
  const date = (iso: string) => fmtDateLongue(iso, langue);

  if (issue.issue === "EN_COURS") {
    return (
      <Cadre langue={langue}>
        <Tete ton="info" titre={t.enCoursTitre} sous={t.enCoursTexte} />
        <p>{t.reference(resa.reference)} {t.referenceAide}</p>
      </Cadre>
    );
  }

  if (issue.issue === "EN_ATTENTE" || issue.issue === "ECHOUE" || issue.issue === "ANNULE") {
    // Le client repart du tunnel : ses dates ne doivent pas rester bloquées par sa propre tentative.
    await abandonnerTentative(resa.id).catch((erreur: unknown) =>
      console.error(
        `[reserver/confirmation] abandon de ${resa.id} :`,
        erreur instanceof Error ? erreur.message : erreur,
      ),
    );
    return (
      <Cadre langue={langue}>
        <Tete ton="warning" titre={t.nonAboutiTitre} sous={t.nonAboutiTexte} />
        <Link className="btn btn-primary" href={lienTunnel(langue, resa, slug, true)}>{t.reprendre}</Link>
      </Cadre>
    );
  }

  const paiement = await lirePaiementEnregistre(paiementId);
  const montantPaye = paiement?.montant ?? retour.montant;

  if (issue.issue === "REMBOURSEE") {
    let alternatives: Alternative[] = [];
    try {
      alternatives = await autresGitesLibres(slug, {
        arrivee: resa.date_arrivee,
        depart: resa.date_depart,
        adultes: resa.nb_adultes,
        enfants: resa.nb_enfants,
        bebes: resa.nb_bebes,
      });
    } catch (erreur) {
      console.error("[reserver/confirmation] autres gîtes :", erreur instanceof Error ? erreur.message : erreur);
    }
    const montant = fmtEuro(montantPaye, langue);
    return (
      <Cadre langue={langue}>
        <Tete
          ton="warning"
          titre={t.rembourseTitre}
          sous={issue.remboursementFait ? t.rembourseFait(montant) : t.rembourseEnCours(montant)}
        />
        {alternatives.length > 0 ? (
          <>
            <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 8, marginBottom: 8, fontSize: 22 }}>
              {t.autresGites}
            </h3>
            <div className={styles.recourses}>
              {alternatives.map((a) => (
                <div className={styles.recourse} key={a.slug}>
                  <strong>{a.nom}</strong>
                  <p>
                    {t.duAu(date(resa.date_arrivee), date(resa.date_depart))} · {fmtEuro(a.total, langue)} {t.ttc}
                  </p>
                  <Link href={lienTunnel(langue, resa, a.slug, false)} className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                    {t.choisir(a.nom)}
                  </Link>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>{t.aucunAutre}</p>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href={lien(langue, `/reserver?gite=${slug}`)}>{t.autresDates}</Link>
          <Link className="btn btn-ghost" href={lien(langue, "/contact")}>{t.aide}</Link>
        </div>
      </Cadre>
    );
  }

  // ── Paiement reçu : les faits, rien d'autre ──
  const total = resa.paiement_integral;
  const datePaiement = paiement?.datePaiement
    ? new Date(paiement.datePaiement).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })
    : null;
  const payeAujourdhui = datePaiement === null || datePaiement === aujourdhuiParis();
  const caution = detail(resa, "caution", estNombre) ?? resa.gites?.caution ?? null;
  const dateVirement = detail(resa, "dateLimiteVirementCaution", estDate);
  const solde = calculerMontants(resa).solde;
  const heure = (h: string | null) => (h ? fmtHeure(h.slice(0, 5), langue) : "");

  return (
    <Cadre langue={langue}>
      <Tete ton="info" titre={t.confirmeTitre} />
      <ul className={styles.confirmation}>
        <li>
          <strong>{t.reference(resa.reference)}</strong> {t.referenceAide}
        </li>
        <li>
          {t.sejour(
            nomGite,
            fmtDateAvecJour(resa.date_arrivee, langue),
            heure(resa.heure_arrivee),
            fmtDateAvecJour(resa.date_depart, langue),
            heure(resa.heure_depart),
          )}{" "}
          · {t.voyageurs(resa.nb_adultes, resa.nb_enfants, resa.nb_bebes)}
        </li>
        <li>{t.paye(fmtEuro(montantPaye, langue), total, payeAujourdhui || !datePaiement ? null : date(datePaiement))}</li>
        {!total && (
          <li>
            {t.solde(
              fmtEuro(solde, langue),
              date(ajouterJours(resa.date_arrivee, -resa.delai_solde_jours)),
              resa.mode_solde,
            )}
          </li>
        )}
        {caution !== null && (
          <li>{t.caution(fmtPrix(caution, langue), resa.moyen_caution, dateVirement ? date(dateVirement) : null)}</li>
        )}
        <li>
          {t.question} {CONTACTS}
        </li>
      </ul>
    </Cadre>
  );
}
