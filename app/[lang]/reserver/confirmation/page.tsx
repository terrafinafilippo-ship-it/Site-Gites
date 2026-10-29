import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { ReactNode } from "react";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { isGiteId } from "@/lib/data/gites";
import { fmtDateLongue, fmtEuro } from "@/lib/format";
import { langueDe, lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import { constaterRetour, lirePaiementEnregistre } from "@/lib/paiement";
import { CONTACTS, LIBELLES_RECAP, recapitulatif } from "@/lib/recapitulatif";
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
// Lot 4 : le courriel de confirmation et le contrat à signer partent juste
// après (lib/courriels.ts, envoi après la réponse) ; la page l'annonce. Les
// lignes de faits sont celles du courriel (lib/recapitulatif.ts).

export const dynamic = "force-dynamic";

type Parametres = Record<string, string | string[] | undefined>;

const TEXTES: Bilingue<{
  titrePage: string;
  confirmeTitre: string;
  contratEnvoye: (email: string) => string;
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
    contratEnvoye: (email) => `Votre contrat à signer vous est envoyé par courriel, à ${email}.`,
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
    contratEnvoye: (email) => `Your contract to sign is being sent to you by email, at ${email}.`,
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

  // Courriels inscrits par le constat (confirmation, contrat, alertes,
  // remboursement) : envoyés APRÈS la réponse, la page n'attend pas Brevo.
  const entetes = await headers();
  const origine =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    `${entetes.get("x-forwarded-proto") ?? "http"}://${entetes.get("host") ?? "localhost"}`;
  after(() => traiterCourriels(origine));

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
  const date = (iso: string) => fmtDateLongue(iso, langue);

  if (issue.issue === "EN_COURS") {
    return (
      <Cadre langue={langue}>
        <Tete ton="info" titre={t.enCoursTitre} sous={t.enCoursTexte} />
        <p>{LIBELLES_RECAP[langue].reference(resa.reference)} {LIBELLES_RECAP[langue].referenceAide}</p>
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
  const r = LIBELLES_RECAP[langue];
  const faits = recapitulatif(resa, langue, { montant: montantPaye, datePaiement: paiement?.datePaiement ?? null });
  const email = resa.client_email ?? "";

  return (
    <Cadre langue={langue}>
      <Tete ton="info" titre={t.confirmeTitre} />
      <ul className={styles.confirmation}>
        <li>
          <strong>{faits.reference}</strong> {r.referenceAide}
        </li>
        <li>
          {faits.sejour} · {faits.voyageurs}
        </li>
        <li>{faits.paye}</li>
        {faits.solde && <li>{faits.solde}</li>}
        {faits.caution && <li>{faits.caution}</li>}
        {email && <li>{t.contratEnvoye(email)}</li>}
        <li>
          {r.question} {CONTACTS}
        </li>
      </ul>
    </Cadre>
  );
}
