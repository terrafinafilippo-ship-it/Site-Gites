// DEVIS d'un séjour : tout ce que le client paie, et ce qu'il règle aujourd'hui.
//
// Module PUR, exécuté à deux endroits avec les mêmes données :
//   - dans le NAVIGATEUR (app/reserver), pour afficher le prix dès le choix des
//     dates et marquer dans le calendrier les jours possibles ;
//   - sur le SERVEUR (app/api/reservations), au moment de bloquer les dates :
//     c'est le seul calcul qui engage. Ce que le navigateur affiche ne sert
//     jamais à encaisser.
//
// Il ASSEMBLE les calculs existants sans en refaire aucun : prix du séjour
// (lib/tarification.ts), taxe de séjour (lib/taxe-sejour.ts), acompte et
// solde (lib/montants.ts, le calcul des documents). La date du jour est
// FOURNIE : un module pur ne lit pas l'horloge, et ce n'est pas le navigateur
// du client qui décide du délai minimum avant l'arrivée.
//
// Les refus portent DEUX textes : `message`, la phrase montrée au client, et
// `detail`, la cause technique écrite dans le journal du serveur.
//
// MONTANTS EN CENTIMES ENTIERS.

import { DELAI_SOLDE_DEFAUT } from "@/lib/constantes";
import { ajouterJours, jourSemaineIso, jourUtc, nombreDeNuits, nomJourIso } from "@/lib/dates-civiles";
import { montantsDesPostes, type Montants } from "@/lib/montants";
import {
  calculerSejour,
  resoudrePeriodes,
  type DonneesTarification,
  type MotifRefus,
  type PeriodeResolue,
  type PrixSejour,
  type RefusSejour,
} from "@/lib/tarification";
import { calculerTaxeSejour, type DetailTaxe, type RefusTaxe, type ReglageTaxe } from "@/lib/taxe-sejour";

// ─── Données d'entrée ─────────────────────────────────────────────────────────

/** Réglages généraux du tunnel (table reglages, migration 0004). */
export interface ReglagesTunnel {
  dureeBlocageMinutes: number;
  /** 1 = l'arrivée se réserve au plus tard la veille. */
  delaiReservationJours: number;
  /** « HH:MM ». */
  heureArrivee: string;
  heureDepart: string;
  heureLimiteArrivee: string;
  /** Un enfant de moins de cet âge est un bébé. */
  bebeAgeLimite: number;
  /** Nombre de bébés qui ne comptent pas dans la capacité ; les suivants prennent une place. */
  bebesHorsCapacite: number;
  /** Lits bébé disponibles dans un gîte. */
  litsBebe: number;
}

/** Le gîte réservé, tel qu'en base. Montants en centimes. */
export interface GiteTunnel {
  slug: string;
  nom: string;
  capaciteMax: number;
  forfaitMenage: number;
  caution: number;
}

/** Tout ce que le devis lit. Sérialisable en JSON : le serveur le passe au navigateur. */
export interface DonneesDevis {
  tarification: DonneesTarification;
  /** Réglages de taxe de séjour DE CE GÎTE. */
  taxes: ReglageTaxe[];
  gite: GiteTunnel;
  reglages: ReglagesTunnel;
  /** Nuits déjà prises (aaaa-mm-jj) : vendues, fermées, ou bloquées par un paiement en cours. */
  nuitsPrises: string[];
  /** Date du jour à Paris (aaaa-mm-jj). */
  aujourdhui: string;
}

export interface Occupants {
  adultes: number;
  enfants: number;
  bebes: number;
}

export interface DemandeDevis extends Occupants {
  arrivee: string;
  depart: string;
}

/** Données prêtes à l'emploi : périodes résolues une fois, nuits prises indexées. */
export interface ContexteDevis {
  donnees: DonneesDevis;
  periodes: PeriodeResolue[];
  prises: ReadonlySet<string>;
}

export function preparerDevis(donnees: DonneesDevis): ContexteDevis {
  return {
    donnees,
    periodes: resoudrePeriodes(donnees.tarification, donnees.gite.slug),
    prises: new Set(donnees.nuitsPrises),
  };
}

// ─── Résultats ────────────────────────────────────────────────────────────────

export interface Devis {
  gite: string;
  arrivee: string;
  depart: string;
  nbNuits: number;
  occupants: Occupants;
  prix: PrixSejour;
  taxe: DetailTaxe;
  /** Sous-total, total, acompte et solde : le calcul exact des documents. */
  montants: Montants;
  /** Paiement intégral à la réservation (D-20) : la date limite du solde est atteinte. */
  paiementIntegral: boolean;
  /** Ce que le client règle aujourd'hui : l'acompte, ou le total. */
  aRegler: number;
  /** Date limite du solde (aaaa-mm-jj) ; `null` en paiement intégral. */
  dateLimiteSolde: string | null;
  caution: number;
  /** Plus de bébés que de lits bébé : signalé au client, sans refus. */
  litsBebeInsuffisants: boolean;
}

export type MotifRefusDevis =
  | MotifRefus
  | RefusTaxe["motif"]
  | "SANS_ADULTE"
  | "CAPACITE_DEPASSEE"
  | "ARRIVEE_TROP_PROCHE"
  | "NUITS_PRISES";

export interface RefusDevis {
  motif: MotifRefusDevis;
  /** Phrase montrée au client. */
  message: string;
  /** Cause technique, pour le journal du serveur. */
  detail: string;
  /**
   * Vrai si le refus vient d'une DONNÉE que les propriétaires n'ont pas
   * saisie (prix, barème, taxe) : le serveur le journalise comme une anomalie.
   * Faux pour une règle que le client peut respecter en changeant sa demande.
   */
  donneeManquante: boolean;
}

export type ResultatDevis = { ok: true; devis: Devis } | { ok: false; refus: RefusDevis };

// ─── Phrases ──────────────────────────────────────────────────────────────────

const OCCUPANTS_MAXIMUM_TECHNIQUE = 50;

/** « samedi », « vendredi ou samedi », « lundi, mardi ou samedi ». */
function listeJours(jours: readonly number[]): string {
  const noms = [...jours].sort((a, b) => a - b).map(nomJourIso);
  if (noms.length <= 1) return noms.join("");
  return `${noms.slice(0, -1).join(", ")} ou ${noms[noms.length - 1]}`;
}

/** « 17 octobre 2026 ». Date civile lue en UTC : aucun décalage de fuseau. */
export function dateLongue(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function refusDeSejour(r: RefusSejour): RefusDevis {
  switch (r.motif) {
    case "DATES_INVALIDES":
      return { motif: r.motif, message: "Ces dates ne sont pas valides.", detail: r.message, donneeManquante: false };
    case "NUIT_SANS_TARIF":
      return {
        motif: r.motif,
        message: `La nuit du ${dateLongue(r.date)} n'est pas ouverte à la réservation en ligne.`,
        detail: r.message,
        donneeManquante: false,
      };
    case "NUIT_SANS_PRIX":
    case "BAREME_ABSENT":
      return {
        motif: r.motif,
        message: `La nuit du ${dateLongue(r.date)} n'est pas ouverte à la réservation en ligne.`,
        detail: r.message,
        donneeManquante: true,
      };
    case "ARRIVEE_NON_AUTORISEE":
      return {
        motif: r.motif,
        message: `En « ${r.tarifNom} », les arrivées se font le ${listeJours(r.joursAutorises)}.`,
        detail: r.message,
        donneeManquante: false,
      };
    case "DEPART_NON_AUTORISE":
      return {
        motif: r.motif,
        message: `En « ${r.tarifNom} », les départs se font le ${listeJours(r.joursAutorises)}.`,
        detail: r.message,
        donneeManquante: false,
      };
    case "SEJOUR_TROP_COURT":
      return {
        motif: r.motif,
        message: `En « ${r.tarifNom} », un séjour compte au moins ${r.minimum} nuits.`,
        detail: r.message,
        donneeManquante: false,
      };
  }
}

function refusDeTaxe(r: RefusTaxe): RefusDevis {
  return {
    motif: r.motif,
    message: "La réservation en ligne n'est pas possible pour ces dates.",
    detail: `taxe de séjour : ${r.message}`,
    donneeManquante: r.motif === "TAXE_NON_DEFINIE" || r.motif === "REGLAGE_INCOMPLET",
  };
}

// ─── Contrôles ────────────────────────────────────────────────────────────────

function entierEntre(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
}

/** Places occupées : chaque adulte et enfant, et les bébés au-delà de ceux qui ne comptent pas. */
export function placesOccupees(o: Occupants, reglages: ReglagesTunnel): number {
  return o.adultes + o.enfants + Math.max(0, o.bebes - reglages.bebesHorsCapacite);
}

/** Refus lié aux voyageurs seuls, ou `null`. */
export function controlerOccupants(ctx: ContexteDevis, o: Occupants): RefusDevis | null {
  const { gite, reglages } = ctx.donnees;
  const max = OCCUPANTS_MAXIMUM_TECHNIQUE;
  if (!entierEntre(o.adultes, 0, max) || !entierEntre(o.enfants, 0, max) || !entierEntre(o.bebes, 0, max)) {
    return {
      motif: "OCCUPANTS_INVALIDES",
      message: "Le nombre de voyageurs n'est pas valide.",
      detail: `occupants reçus : ${JSON.stringify(o)}`,
      donneeManquante: false,
    };
  }
  if (o.adultes < 1) {
    return {
      motif: "SANS_ADULTE",
      message: "Une réservation compte au moins un adulte.",
      detail: "aucun adulte",
      donneeManquante: false,
    };
  }
  const places = placesOccupees(o, reglages);
  if (places > gite.capaciteMax) {
    const hors = reglages.bebesHorsCapacite;
    const precision =
      o.bebes > 0 && hors > 0
        ? hors === 1
          ? ` Un bébé de moins de ${reglages.bebeAgeLimite} ans n'est pas compté ; les suivants le sont.`
          : ` ${hors} bébés de moins de ${reglages.bebeAgeLimite} ans ne sont pas comptés ; les suivants le sont.`
        : "";
    return {
      motif: "CAPACITE_DEPASSEE",
      message: `${gite.nom} accueille ${gite.capaciteMax} personnes au plus.${precision}`,
      detail: `${places} places demandées pour une capacité de ${gite.capaciteMax}`,
      donneeManquante: false,
    };
  }
  return null;
}

/** Première date d'arrivée réservable aujourd'hui. */
export function premiereArriveePossible(ctx: ContexteDevis): string {
  const { aujourdhui, reglages } = ctx.donnees;
  return ajouterJours(aujourdhui, reglages.delaiReservationJours);
}

/**
 * Contrôle des DATES seules (délai, nuits libres, tarif, règles), sans les
 * voyageurs : sert au devis et au calendrier, qui marque les départs possibles.
 */
export function controlerDates(
  ctx: ContexteDevis,
  arrivee: string,
  depart: string,
): { ok: true; prix: PrixSejour } | { ok: false; refus: RefusDevis } {
  try {
    jourUtc(arrivee);
    jourUtc(depart);
  } catch (erreur) {
    return {
      ok: false,
      refus: {
        motif: "DATES_INVALIDES",
        message: "Ces dates ne sont pas valides.",
        detail: (erreur as Error).message,
        donneeManquante: false,
      },
    };
  }

  const premiere = premiereArriveePossible(ctx);
  if (arrivee < premiere) {
    const delai = ctx.donnees.reglages.delaiReservationJours;
    const message =
      arrivee < ctx.donnees.aujourdhui
        ? "La date d'arrivée est passée."
        : delai === 1
          ? "Une arrivée se réserve au plus tard la veille."
          : `Une arrivée se réserve au plus tard ${delai} jours avant.`;
    return {
      ok: false,
      refus: {
        motif: "ARRIVEE_TROP_PROCHE",
        message,
        detail: `arrivée ${arrivee}, première arrivée possible ${premiere}`,
        donneeManquante: false,
      },
    };
  }

  const nbNuits = nombreDeNuits(arrivee, depart);
  for (let i = 0; i < nbNuits; i += 1) {
    const nuit = ajouterJours(arrivee, i);
    if (ctx.prises.has(nuit)) {
      return {
        ok: false,
        refus: {
          motif: "NUITS_PRISES",
          message: `La nuit du ${dateLongue(nuit)} est déjà prise.`,
          detail: `nuit ${nuit} prise`,
          donneeManquante: false,
        },
      };
    }
  }

  const sejour = calculerSejour(ctx.periodes, arrivee, depart);
  return sejour.ok ? { ok: true, prix: sejour.prix } : { ok: false, refus: refusDeSejour(sejour.refus) };
}

// ─── Devis ────────────────────────────────────────────────────────────────────

export function devisSejour(ctx: ContexteDevis, demande: DemandeDevis): ResultatDevis {
  const { gite, reglages, taxes, aujourdhui } = ctx.donnees;
  const occupants: Occupants = { adultes: demande.adultes, enfants: demande.enfants, bebes: demande.bebes };

  const refusOccupants = controlerOccupants(ctx, occupants);
  if (refusOccupants) return { ok: false, refus: refusOccupants };

  const dates = controlerDates(ctx, demande.arrivee, demande.depart);
  if (!dates.ok) return dates;
  const prix = dates.prix;

  // Taxe : tous les voyageurs sont des occupants ; seuls les adultes paient.
  const taxe = calculerTaxeSejour({
    arrivee: demande.arrivee,
    depart: demande.depart,
    prixHebergement: prix.total,
    forfaitMenage: gite.forfaitMenage,
    nbOccupants: occupants.adultes + occupants.enfants + occupants.bebes,
    nbAssujettis: occupants.adultes,
    nbBebes: occupants.bebes,
    reglages: taxes,
  });
  if (!taxe.ok) return { ok: false, refus: refusDeTaxe(taxe.refus) };

  const montants = montantsDesPostes({
    prixLocation: prix.total,
    forfaitMenage: gite.forfaitMenage,
    options: 0,
    taxeSejour: taxe.taxe.total,
  });

  // D-20 : la date limite du solde atteinte, le client paie le total.
  const dateLimite = ajouterJours(demande.arrivee, -DELAI_SOLDE_DEFAUT);
  const paiementIntegral = aujourdhui >= dateLimite;

  return {
    ok: true,
    devis: {
      gite: gite.slug,
      arrivee: demande.arrivee,
      depart: demande.depart,
      nbNuits: prix.nbNuits,
      occupants,
      prix,
      taxe: taxe.taxe,
      montants,
      paiementIntegral,
      aRegler: paiementIntegral ? montants.totalTtc : montants.acompte,
      dateLimiteSolde: paiementIntegral ? null : dateLimite,
      caution: gite.caution,
      litsBebeInsuffisants: occupants.bebes > reglages.litsBebe,
    },
  };
}

// ─── Calendrier ───────────────────────────────────────────────────────────────

export interface EtatJour {
  date: string;
  /** La nuit qui commence ce jour est prise. */
  prise: boolean;
  /** La nuit qui commence ce jour n'a pas de prix pour ce gîte : pas réservable en ligne. */
  sansTarif: boolean;
  /** Un séjour peut commencer ce jour : délai respecté, nuit libre et tarifée, jour d'arrivée autorisé. */
  arriveePossible: boolean;
}

function periodeDuJour(periodes: readonly PeriodeResolue[], date: string): PeriodeResolue | undefined {
  return periodes.find((p) => p.debut <= date && date < p.fin);
}

/** État de `nbJours` jours consécutifs à partir de `du`. */
export function joursDuCalendrier(ctx: ContexteDevis, du: string, nbJours: number): EtatJour[] {
  const premiere = premiereArriveePossible(ctx);
  const jours: EtatJour[] = [];
  for (let i = 0; i < nbJours; i += 1) {
    const date = ajouterJours(du, i);
    const periode = periodeDuJour(ctx.periodes, date);
    const sansTarif = !periode || periode.prixNuit === null || periode.bareme === null;
    const prise = ctx.prises.has(date);
    jours.push({
      date,
      prise,
      sansTarif,
      arriveePossible:
        !prise && !sansTarif && date >= premiere && periode !== undefined &&
        periode.regles.joursArrivee.includes(jourSemaineIso(date)),
    });
  }
  return jours;
}

/** Vrai si un séjour du `arrivee` au `depart` est possible (voyageurs mis à part). */
export function datesPossibles(ctx: ContexteDevis, arrivee: string, depart: string): boolean {
  return depart > arrivee && controlerDates(ctx, arrivee, depart).ok;
}

// ─── Instantané enregistré avec la réservation ───────────────────────────────

/** Version du format de `reservations.detail_calcul`. */
export const DETAIL_CALCUL_FORMAT_VERSION = 1;

/**
 * Ce qui est figé dans `reservations.detail_calcul` : le devis entier, avec deux
 * champs d'auto-description, comme l'instantané des factures. Il explique les
 * montants de la réservation (nuit par nuit, étape par étape de la taxe) ; il
 * ne les remplace pas.
 */
export function detailCalcul(devis: Devis, reglages: ReglagesTunnel): Record<string, unknown> {
  return {
    ...devis,
    reglages,
    unite: "centimes",
    formatVersion: DETAIL_CALCUL_FORMAT_VERSION,
  };
}
