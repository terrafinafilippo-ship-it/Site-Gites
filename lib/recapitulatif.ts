// LES FAITS d'une réservation payée, en une ligne chacun, en français et en
// anglais : référence, séjour, voyageurs, somme payée, solde, caution.
//
// Un seul domicile pour deux lecteurs : l'écran de confirmation
// (app/[lang]/reserver/confirmation) et le courriel de confirmation
// (lib/courriels-textes.ts). Écran validé le 20 octobre 2026, courriel le
// 27 octobre : les faits, aucune promesse ni formule commerciale.
import { aujourdhuiParis, ajouterJours } from "@/lib/dates-civiles";
import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure, fmtPrix } from "@/lib/format";
import type { Bilingue, Langue } from "@/lib/i18n/langues";
import { calculerMontants } from "@/lib/montants";
import type { ModeSolde, MoyenCaution } from "@/lib/reglement";
import type { ReservationAvecGite } from "@/lib/reservations";

/** Téléphones des propriétaires, tels qu'affichés au client. */
export const CONTACTS = "Patricia +33 6 79 33 23 51 · Nicolas +33 6 66 89 96 24";

export const LIBELLES_RECAP: Bilingue<{
  reference: (ref: string) => string;
  referenceAide: string;
  sejour: (gite: string, du: string, heureArrivee: string, au: string, heureDepart: string) => string;
  voyageurs: (adultes: number, enfants: number, bebes: number) => string;
  paye: (montant: string, total: boolean, date: string | null) => string;
  solde: (montant: string, date: string, mode: ModeSolde | null) => string;
  caution: (montant: string, moyen: MoyenCaution | null, dateVirement: string | null) => string;
  question: string;
}> = {
  fr: {
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
  },
  en: {
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
  },
};

/** Valeur lue dans le détail du calcul figé avec la réservation (lib/devis.ts, detailCalcul). */
function detail<T>(resa: ReservationAvecGite, cle: string, garde: (v: unknown) => v is T): T | null {
  const v = resa.detail_calcul?.[cle];
  return garde(v) ? v : null;
}
const estDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface Recapitulatif {
  reference: string;
  sejour: string;
  voyageurs: string;
  paye: string;
  /** null pour un paiement intégral. */
  solde: string | null;
  /** null si le montant de la caution est inconnu. */
  caution: string | null;
}

/**
 * Les lignes de faits d'une réservation payée. `paiement` : la somme payée
 * (centimes) et sa date ; payé aujourd'hui → « Payé aujourd'hui ».
 */
export function recapitulatif(
  resa: ReservationAvecGite,
  langue: Langue,
  paiement: { montant: number; datePaiement: Date | null },
): Recapitulatif {
  const l = LIBELLES_RECAP[langue];
  const date = (iso: string) => fmtDateLongue(iso, langue);
  const heure = (h: string | null) => (h ? fmtHeure(h.slice(0, 5), langue) : "");
  const datePaiement = paiement.datePaiement
    ? new Date(paiement.datePaiement).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })
    : null;
  const payeAujourdhui = datePaiement === null || datePaiement === aujourdhuiParis();
  // Montant figé sur la réservation (Phase 4, lot 2) ; null pour une saisie sans montant.
  const caution = resa.caution;
  const dateVirement = detail(resa, "dateLimiteVirementCaution", estDate);
  const total = resa.paiement_integral;

  return {
    reference: l.reference(resa.reference),
    sejour: l.sejour(
      resa.gites?.nom ?? "",
      fmtDateAvecJour(resa.date_arrivee, langue),
      heure(resa.heure_arrivee),
      fmtDateAvecJour(resa.date_depart, langue),
      heure(resa.heure_depart),
    ),
    voyageurs: l.voyageurs(resa.nb_adultes, resa.nb_enfants, resa.nb_bebes),
    paye: l.paye(fmtEuro(paiement.montant, langue), total, payeAujourdhui || !datePaiement ? null : date(datePaiement)),
    solde: total
      ? null
      : l.solde(
          fmtEuro(calculerMontants(resa).solde, langue),
          date(ajouterJours(resa.date_arrivee, -resa.delai_solde_jours)),
          resa.mode_solde,
        ),
    caution:
      caution === null ? null : l.caution(fmtPrix(caution, langue), resa.moyen_caution, dateVirement ? date(dateVirement) : null),
  };
}
