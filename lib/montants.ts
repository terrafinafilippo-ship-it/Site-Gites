// Logique métier de facturation : calcul des montants et mise en forme des
// données PDF à partir d'une réservation (ligne Drizzle + gîte joint).
//
// ⚠️ Aucun numéro de facture n'est construit ici : il provient exclusivement de
// la fonction SQL `creer_facture`. Ce module ne fait que du calcul et du mapping.
//
// MONTANTS : en mémoire, un montant est un ENTIER DE CENTIMES (576,66 € =
// 57666). Les colonnes numeric arrivent en texte et sont converties en
// centimes par lib/reservations.ts (centimesDepuisNumeric, lib/centimes.ts) :
// ici, tout est entier et exact, sans arrondi. Les TAUX (acompte, taxe de
// séjour) restent des décimaux : un taux n'est pas de l'argent. Ce fichier
// est le SEUL endroit qui calcule des montants ; l'affichage passe par
// fmtEuro (lib/format.ts), qui prend des centimes.

import type { FactureAcompteData } from '@/components/pdf/FactureAcomptePDF';
import type { FactureSoldeData } from '@/components/pdf/FactureSoldePDF';
import type { FactureTotalData, LignePaiementFacture } from '@/components/pdf/FactureTotalPDF';
import type { FactureRetenueData } from '@/components/pdf/FactureRetenuePDF';
import type { ContratData } from '@/components/pdf/ContratPDF';
import type { GiteRow, ReservationAvecGite } from '@/lib/reservations';
import {
  FORFAIT_MENAGE_DEFAUT,
  HEURE_ARRIVEE_DEFAUT,
  HEURE_DEPART_DEFAUT,
  HEURE_LIMITE_ARRIVEE_DEFAUT,
} from '@/lib/constantes';
import { ajouterJours, aujourdhuiParis } from '@/lib/dates-civiles';
import {
  fmtAvantArriveeFr,
  fmtDateFr,
  fmtHeureFr,
  computeNbNuits,
  minusDaysFr,
} from '@/lib/format';

// ─── Modèle de données ────────────────────────────────────────────────────────
// Les types dérivent du schéma Drizzle (db/schema/reservations.ts, gites.ts) :
// le schéma de Phase 0 fait foi, le code s'y adapte. Le gîte est joint par
// lib/reservations.ts sous la clé `gites`.
export type Reservation = ReservationAvecGite;
export type Gite = GiteRow;

// ─── Résultat du calcul (tous les champs en CENTIMES ENTIERS) ────────────────
export interface Montants {
  base: number; // sous-total = séjour + forfait ménage + options (hors taxe)
  acompte: number; // taux d'acompte de la réservation × total TTC (taxe incluse), arrondi au centime
  solde: number; // totalTtc − acompte
  taxeSejour: number; // valeur fournie par la réservation (jamais recalculée)
  totalTtc: number; // base + taxe de séjour
  forfaitMenage: number; // forfait effectivement appliqué
  options: number; // total des options
}

/**
 * Calcule les montants d'une réservation.
 *
 * Règle métier (validée le 12/06/2026) :
 *   - sous-total (base) = prix séjour + forfait ménage + options
 *   - total TTC = sous-total + taxe de séjour
 *   - acompte = taux d'acompte DE LA RÉSERVATION (figé à sa création,
 *     30 % jusqu'ici) appliqué au TOTAL TTC (taxe de séjour incluse)
 *   - solde   = totalTtc − acompte
 *   - la taxe de séjour est FOURNIE par la réservation, jamais recalculée ici.
 *   - paiement intégral (D-20) : le total est payé à la réservation, donc
 *     acompte = totalTtc et solde = 0, quel que soit le taux recopié.
 *
 * Le solde est dérivé de `totalTtc − acompte` (et non d'un second pourcentage) :
 * en centimes entiers, acompte + solde = totalTtc est exact par construction.
 */
export function calculerMontants(resa: Reservation): Montants {
  const gite = resa.gites ?? undefined;

  // Entrées en centimes entiers (frontière franchie dans lib/reservations.ts).
  return montantsDesPostes({
    prixLocation: resa.prix_location ?? 0,
    forfaitMenage: resa.forfait_menage ?? gite?.forfait_menage ?? FORFAIT_MENAGE_DEFAUT,
    options: resa.options ?? 0,
    taxeSejour: resa.taxe_sejour ?? 0,
  }, resa.paiement_integral ? 100 : resa.taux_acompte);
}

/**
 * Libellé de la ligne « taxe de séjour » des PDF (décision du 23 octobre 2026).
 *
 * - Réservation du tunnel (`taux_taxe_sejour` vide) : la taxe est calculée par
 *   adulte et par nuit (lib/taxe-sejour.ts), les mineurs ne paient pas →
 *   « Taxe de séjour — 2 adultes × 7 nuits (mineurs exonérés) ». Le libellé
 *   reste vrai quand le plafond joue, quand le taux change en cours de séjour
 *   ou pour un gîte classé (tarif fixe).
 * - Réservation calculée à l'ancienne (un taux unique sur la location) : son
 *   taux, qui explique son montant → « Taxe de séjour (5,5 %) ».
 */
export function libelleTaxeSejour(resa: Reservation): string {
  if (resa.taux_taxe_sejour !== null && resa.taux_taxe_sejour !== undefined) {
    return `Taxe de séjour (${resa.taux_taxe_sejour.toString().replace('.', ',')} %)`;
  }
  const adultes = resa.nb_adultes ?? 0;
  const nuits = computeNbNuits(resa.date_arrivee ?? '', resa.date_depart ?? '');
  return (
    `Taxe de séjour — ${adultes} adulte${adultes > 1 ? 's' : ''} × ` +
    `${nuits} nuit${nuits > 1 ? 's' : ''} (mineurs exonérés)`
  );
}

/** Les quatre postes d'un séjour, en CENTIMES ENTIERS. */
export interface PostesSejour {
  prixLocation: number;
  forfaitMenage: number;
  options: number;
  taxeSejour: number;
}

/**
 * Montants à partir des postes : le cœur de calculerMontants, appelé aussi par
 * le devis du tunnel (lib/devis.ts). Le client voit donc, avant de payer,
 * l'acompte exact que porteront sa facture et son contrat.
 *
 * `tauxAcompte` en pourcentage (30 = 30 %) : celui des réglages pour un devis,
 * celui de la réservation pour un document.
 */
export function montantsDesPostes(p: PostesSejour, tauxAcompte: number): Montants {
  if (!Number.isInteger(tauxAcompte) || tauxAcompte < 1 || tauxAcompte > 100) {
    throw new Error(`montantsDesPostes : taux d'acompte invalide (${tauxAcompte})`);
  }
  // Additions d'entiers : exactes, aucun arrondi.
  const base = p.prixLocation + p.forfaitMenage + p.options;
  const totalTtc = base + p.taxeSejour;
  // SEUL arrondi du modèle : conversion du TAUX d'acompte en montant. Le `/ 100`
  // porte sur le taux (30 % → 0,3), pas sur un montant ; Math.round ramène le
  // résultat à un entier de centimes.
  const acompte = Math.round(totalTtc * (tauxAcompte / 100));
  const solde = totalTtc - acompte;

  return {
    base,
    acompte,
    solde,
    taxeSejour: p.taxeSejour,
    totalTtc,
    forfaitMenage: p.forfaitMenage,
    options: p.options,
  };
}

/**
 * Somme que le Bailleur CONSERVE si le Locataire annule après la date limite du
 * solde, mais plus de `delai_remboursement_solde_heures` avant l'arrivée
 * (article 7.2 du contrat, D-26) : l'acompte, sans la taxe de séjour, qui est
 * remboursée dans tous les cas d'annulation. Soit le taux d'acompte DE LA
 * RÉSERVATION appliqué au prix hors taxe de séjour (`base`), arrondi au centime.
 *
 * Vaut aussi pour un séjour payé en une fois (D-20) : la part de l'acompte est
 * conservée, le reste remboursé.
 */
export function retenueAnnulation(resa: Reservation, montants: Montants): number {
  // Même conversion que l'acompte : le `/ 100` porte sur le TAUX, pas sur un montant.
  return Math.round(montants.base * (resa.taux_acompte / 100));
}

/**
 * Séjour payé en une fois PAR CHOIX du client (D-27), et non parce que
 * l'arrivée était trop proche (D-20) : la réservation a été faite AVANT la date
 * limite du solde. Déduit des dates, sans colonne : le tunnel impose le
 * paiement intégral exactement quand le jour de réservation atteint cette date
 * (lib/devis.ts). Le délai du solde est celui recopié sur la réservation.
 */
export function integralChoisi(resa: Reservation): boolean {
  if (!resa.paiement_integral || !resa.created_at || !resa.date_arrivee) return false;
  return aujourdhuiParis(resa.created_at) < ajouterJours(resa.date_arrivee, -resa.delai_solde_jours);
}

// ─── Contexte de génération (fourni par la route après creer_facture) ─────────
/**
 * Facture au nom d'une entreprise (D-41), saisie dans le back-office : elle
 * remplace, sur la facture, le nom et l'adresse de la personne qui a réservé.
 */
export interface EntrepriseFacture {
  raisonSociale: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  /** « 123 456 789 », ou null. */
  siren: string | null;
}

/** Relit une entreprise rangée telle quelle (données d'un courriel), ou null. */
export function lireEntreprise(v: unknown): EntrepriseFacture | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const texte = (x: unknown) => (typeof x === 'string' ? x : '');
  if (!texte(o.raisonSociale)) return null;
  return {
    raisonSociale: texte(o.raisonSociale),
    adresse: texte(o.adresse),
    codePostal: texte(o.codePostal),
    ville: texte(o.ville),
    pays: texte(o.pays),
    siren: texte(o.siren) || null,
  };
}

export interface FactureContext {
  // 'total' : facture unique du séjour entièrement payé (D-29, D-41) ;
  // 'retenue' : facture d'une retenue sur la caution (D-41).
  type: 'acompte' | 'solde' | 'total' | 'retenue';
  // numéro + date d'émission AUTORITAIRES, issus de la ligne `factures`
  numeroFacture: string;
  dateEmission: string; // déjà formaté FR
  datePaiement: string; // date d'encaissement formatée
  // Paiement facturé (Phase 4) : référence chez le prestataire du paiement
  // lui-même. Absente : celle inscrite sur la réservation (paiement de la
  // réservation, ou réservation saisie sans ligne `paiements`).
  referenceTransaction?: string;
  // Mode du paiement facturé quand il n'est pas celui de la réservation (solde
  // reçu par virement, Phase 5, lot 2). Absent : `reservations.mode_paiement`.
  modePaiement?: string;
  // rappel de la facture d'acompte (obligatoire pour le solde)
  factureAcompte?: {
    numero: string;
    datePaiement: string; // date d'encaissement de l'acompte, formatée
    montant: number; // centimes, lu sur la ligne `factures` de l'acompte
  };
  // Facture au nom d'une entreprise (D-41) ; absente : la personne qui a réservé.
  entreprise?: EntrepriseFacture;
  // Facture unique (D-41) : les paiements reçus, dans l'ordre.
  paiements?: LignePaiementFacture[];
  // Facture de retenue (D-41) : la ligne `retenues`, montants en centimes.
  retenue?: {
    motif: string;
    moyenCaution: string;
    dateRetenue: string;
    montantCaution: number;
    montantRetenu: number;
  };
}

/** Données d'une facture, selon son type. */
export type FactureData = FactureAcompteData | FactureSoldeData | FactureTotalData | FactureRetenueData;

/**
 * Construit l'objet de données du PDF (forme exacte de FactureAcompteData,
 * FactureSoldeData ou FactureTotalData) à partir de la réservation, du gîte
 * joint, des montants calculés et du contexte (numéro/date issus de creer_facture).
 */
/** Mode imprimé pour un solde reçu par virement, noté dans le back-office (Phase 5, lot 2). */
export const MODE_PAIEMENT_VIREMENT = 'Virement bancaire';

/**
 * Ce que la facture imprime du paiement qu'elle constate : pour un solde reçu
 * par virement, « Virement bancaire » et la référence lue sur le relevé (« — »
 * sans référence), jamais la carte ni la référence de l'acompte ; sinon la
 * référence du paiement chez le prestataire (absente : celle de la réservation).
 */
export function paiementImprime(
  p: { reference: string | null; prestataire: string | null } | null,
): { modePaiement?: string; referenceTransaction?: string } {
  if (p?.prestataire === 'virement') return { modePaiement: MODE_PAIEMENT_VIREMENT, referenceTransaction: p.reference ?? '—' };
  return { referenceTransaction: p?.reference ?? undefined };
}

export function mapFactureData(
  resa: Reservation,
  montants: Montants,
  ctx: FactureContext,
): FactureData {
  if (ctx.type === 'acompte') return mapAcompteData(resa, montants, ctx);
  if (ctx.type === 'total') return mapTotalData(resa, montants, ctx);
  if (ctx.type === 'retenue') return mapRetenueData(resa, ctx);
  return mapSoldeData(resa, montants, ctx);
}

/** Le destinataire imprimé quand la facture est au nom d'une entreprise (D-41). */
function champsEntreprise(e: EntrepriseFacture | undefined) {
  if (!e) return {};
  return {
    clientRaisonSociale: e.raisonSociale,
    ...(e.siren ? { clientSiren: e.siren } : {}),
    clientAdresse: e.adresse,
    clientCodePostal: e.codePostal,
    clientVille: e.ville,
    clientPays: e.pays,
  };
}

// Champs partagés client + gîte + séjour.
function champsCommuns(resa: Reservation) {
  const gite = resa.gites ?? undefined;
  const dateArriveeIso = resa.date_arrivee ?? '';
  const dateDepartIso = resa.date_depart ?? '';

  return {
    numeroContrat: resa.numero_contrat ?? '',

    clientCivilite: resa.client_civilite ?? '',
    clientNom: (resa.client_nom ?? '').toUpperCase(),
    clientPrenom: resa.client_prenom ?? '',
    clientCiviliteDeux: resa.client_civilite_conjoint ?? undefined,
    clientNomDeux: resa.client_nom_conjoint
      ? resa.client_nom_conjoint.toUpperCase()
      : undefined,
    clientPrenomDeux: resa.client_prenom_conjoint ?? undefined,
    clientAdresse: resa.client_adresse ?? '',
    clientCodePostal: resa.client_code_postal ?? '',
    clientVille: resa.client_ville ?? '',
    clientPays: resa.client_pays ?? 'France',
    clientEmail: resa.client_email ?? '',

    giteNom: gite?.nom ?? '',
    giteRefGdf: gite?.ref_gdf ?? '',
    giteAdresse: gite?.adresse ?? '',

    dateArrivee: fmtDateFr(dateArriveeIso),
    dateDepart: fmtDateFr(dateDepartIso),
    heureArrivee: fmtHeureFr(resa.heure_arrivee ?? HEURE_ARRIVEE_DEFAUT),
    heureDepart: fmtHeureFr(resa.heure_depart ?? HEURE_DEPART_DEFAUT),
    nbNuits: computeNbNuits(dateArriveeIso, dateDepartIso),
    nbAdultes: resa.nb_adultes ?? 0,

    prixLocation: resa.prix_location ?? 0,
    libelleTaxeSejour: libelleTaxeSejour(resa),
  };
}

function mapAcompteData(
  resa: Reservation,
  m: Montants,
  ctx: FactureContext,
): FactureAcompteData {
  const dateArriveeIso = resa.date_arrivee ?? '';
  return {
    ...champsCommuns(resa),
    numeroFacture: ctx.numeroFacture,
    dateEmission: ctx.dateEmission,

    forfaitMenage: m.forfaitMenage,
    montantOptions: m.options,
    sousTotal: m.base,
    montantTaxeSejour: m.taxeSejour,
    totalTtc: m.totalTtc,

    tauxAcompte: resa.taux_acompte,
    montantAcompte: m.acompte,
    montantSolde: m.solde,
    delaiSolde: resa.delai_solde_jours,
    dateButoirSolde: minusDaysFr(dateArriveeIso, resa.delai_solde_jours),

    modePaiement: resa.mode_paiement ?? '',
    datePaiement: ctx.datePaiement,
    referenceTransaction: ctx.referenceTransaction ?? resa.reference_transaction ?? '',
  };
}

function mapTotalData(
  resa: Reservation,
  m: Montants,
  ctx: FactureContext,
): FactureTotalData {
  return {
    ...champsCommuns(resa),
    ...champsEntreprise(ctx.entreprise),
    numeroFacture: ctx.numeroFacture,
    dateEmission: ctx.dateEmission,

    forfaitMenage: m.forfaitMenage,
    montantOptions: m.options,
    sousTotal: m.base,
    montantTaxeSejour: m.taxeSejour,
    totalTtc: m.totalTtc,

    // Sans ligne `paiements` (réservation saisie à la main) : un seul
    // paiement, celui inscrit sur la réservation, comme avant D-41.
    paiements: ctx.paiements ?? [
      {
        objet: 'Prix total du séjour',
        mode: ctx.modePaiement ?? resa.mode_paiement ?? '',
        date: ctx.datePaiement,
        reference: ctx.referenceTransaction ?? resa.reference_transaction ?? '',
        montant: m.totalTtc,
      },
    ],
  };
}

function mapRetenueData(resa: Reservation, ctx: FactureContext): FactureRetenueData {
  const r = ctx.retenue;
  if (!r) throw new Error('facture de retenue sans retenue');
  const communs = champsCommuns(resa);
  return {
    numeroContrat: communs.numeroContrat,
    clientCivilite: communs.clientCivilite,
    clientNom: communs.clientNom,
    clientPrenom: communs.clientPrenom,
    clientCiviliteDeux: communs.clientCiviliteDeux,
    clientNomDeux: communs.clientNomDeux,
    clientPrenomDeux: communs.clientPrenomDeux,
    clientAdresse: communs.clientAdresse,
    clientCodePostal: communs.clientCodePostal,
    clientVille: communs.clientVille,
    clientPays: communs.clientPays,
    clientEmail: communs.clientEmail,
    giteNom: communs.giteNom,
    giteRefGdf: communs.giteRefGdf,
    giteAdresse: communs.giteAdresse,
    dateArrivee: communs.dateArrivee,
    dateDepart: communs.dateDepart,
    ...champsEntreprise(ctx.entreprise),
    numeroFacture: ctx.numeroFacture,
    dateEmission: ctx.dateEmission,

    motif: r.motif,
    moyenCaution: r.moyenCaution,
    dateRetenue: r.dateRetenue,
    montantCaution: r.montantCaution,
    montantRetenu: r.montantRetenu,
    montantRestitue: r.montantCaution - r.montantRetenu,
  };
}

function mapSoldeData(
  resa: Reservation,
  m: Montants,
  ctx: FactureContext,
): FactureSoldeData {
  const acompte = ctx.factureAcompte;
  return {
    ...champsCommuns(resa),
    numeroFacture: ctx.numeroFacture,
    dateEmission: ctx.dateEmission,

    forfaitMenage: m.forfaitMenage,
    montantOptions: m.options,
    sousTotal: m.base,
    montantTaxeSejour: m.taxeSejour,
    totalTtc: m.totalTtc,

    numeroFactureAcompte: acompte?.numero ?? '',
    datePaiementAcompte: acompte?.datePaiement ?? '',
    montantAcompte: acompte?.montant ?? m.acompte,
    montantSolde: m.solde,

    modePaiement: ctx.modePaiement ?? resa.mode_paiement ?? '',
    datePaiement: ctx.datePaiement,
    referenceTransaction: ctx.referenceTransaction ?? resa.reference_transaction ?? '',
  };
}

// ─── Instantané jsonb (factures.donnees) ─────────────────────────────────────
/**
 * Version du format de l'instantané stocké dans factures.donnees :
 *   1 = montants en euros flottants (session A, jamais stocké en base réelle) ;
 *   2 = montants en CENTIMES ENTIERS + champs d'auto-description ;
 *   3 = idem, la taxe de séjour décrite par son libellé imprimé
 *       (`libelleTaxeSejour`) au lieu d'un taux (`tauxTaxeSejour`), le
 *       23 octobre 2026 ;
 *   4 = idem ; la facture unique liste ses paiements (`paiements`) au lieu
 *       d'un seul (`modePaiement`, `datePaiement`, `referenceTransaction`),
 *       une facture peut être au nom d'une entreprise (`clientRaisonSociale`,
 *       `clientSiren`), et la facture de retenue existe (D-41, 14 novembre 2026).
 */
export const INSTANTANE_FORMAT_VERSION = 4;

/**
 * Objet figé dans factures.donnees : les données exactes du PDF, en centimes,
 * avec deux champs d'auto-description pour qu'un lecteur futur ne puisse pas
 * se tromper d'unité. La ligne en base est le document légal ; cet instantané
 * doit suffire à le reconstituer (numéro et date d'émission réels compris).
 */
export function instantaneFacture(data: FactureData): Record<string, unknown> {
  return { ...data, unite: 'centimes', formatVersion: INSTANTANE_FORMAT_VERSION };
}

// ─── Mapping CONTRAT ───────────────────────────────────────────────────────────
/** Montant de la caution de la réservation, en centimes. LÈVE s'il est absent. */
export function cautionDe(resa: Reservation): number {
  if (resa.caution === null) throw new Error(`montant de la caution absent sur la réservation ${resa.reference}`);
  return resa.caution;
}

/** Ce que le contrat imprime de la fiche du gîte (écart E-9). */
export interface FicheContrat {
  capacite_max: number | null;
  equipements_specifiques: string | null;
  a_spa: boolean | null;
  a_sauna: boolean | null;
  contact_arrivee_tel: string | null;
}

/**
 * La fiche du gîte imprimée au contrat : celle figée sur la réservation quand
 * le contrat est émis (lib/contrat.ts, migration 0016), sinon celle du gîte —
 * c'est le cas au moment même de l'émission, qui la recopie alors.
 */
export function ficheContrat(resa: Reservation): FicheContrat {
  if (resa.contrat_capacite_max !== null) {
    return {
      capacite_max: resa.contrat_capacite_max,
      equipements_specifiques: resa.contrat_equipements,
      a_spa: resa.contrat_a_spa,
      a_sauna: resa.contrat_a_sauna,
      contact_arrivee_tel: resa.contrat_contact_arrivee_tel,
    };
  }
  const gite = resa.gites;
  return {
    capacite_max: gite?.capacite_max ?? null,
    equipements_specifiques: gite?.equipements_specifiques ?? null,
    a_spa: gite?.a_spa ?? null,
    a_sauna: gite?.a_sauna ?? null,
    contact_arrivee_tel: gite?.contact_arrivee_tel ?? null,
  };
}

/**
 * Construit l'objet `ContratData` à partir de la réservation, du gîte joint, des
 * montants calculés et du numéro/date de contrat (fournis par la route).
 *
 * Les champs du tampon de signature (SES) sont laissés vides (signature ultérieure).
 *
 * `contactEmail` : l'adresse de contact des réglages (`courriel_reponse`),
 * imprimée en tête du contrat et aux articles 14 et 15 (lib/contrat.ts, adresseContact).
 */
export function mapContratData(
  resa: Reservation,
  montants: Montants,
  ctx: { numeroContrat: string; dateEmission: string; contactEmail: string },
): ContratData {
  const fiche = ficheContrat(resa);
  const dateArriveeIso = resa.date_arrivee ?? '';
  const heureArrivee = resa.heure_arrivee ?? HEURE_ARRIVEE_DEFAUT;

  return {
    ...champsCommuns(resa),
    numeroContrat: ctx.numeroContrat,
    dateEmission: ctx.dateEmission,

    // champsCommuns ne fournit pas le téléphone (absent des factures)
    clientTelephone: resa.client_telephone ?? '',

    // Caractéristiques du gîte : figées sur la réservation à l'émission (E-9).
    giteCapaciteMax: fiche.capacite_max ?? 0,
    giteEquipementsSpecifiques: fiche.equipements_specifiques ?? '',
    giteASpa: fiche.a_spa ?? false,
    giteASauna: fiche.a_sauna ?? false,
    // Montant FIGÉ sur la réservation (Phase 4, lot 2), jamais une valeur par
    // défaut : lib/contrat.ts refuse de créer un contrat sans lui.
    cautionMontant: cautionDe(resa),

    heureLimiteArrivee: fmtHeureFr(
      resa.heure_limite_arrivee ?? HEURE_LIMITE_ARRIVEE_DEFAUT,
    ),
    nbEnfants: resa.nb_enfants ?? 0,
    nbBebes: resa.nb_bebes ?? 0,
    occupantsMajeurs: resa.occupants_majeurs ?? '',

    forfaitMenage: montants.forfaitMenage,
    montantOptions: montants.options,
    sousTotal: montants.base,
    montantTaxeSejour: montants.taxeSejour,
    totalTtc: montants.totalTtc,

    tauxAcompte: resa.taux_acompte,
    montantAcompte: montants.acompte,
    tauxSolde: 100 - resa.taux_acompte,
    montantSolde: montants.solde,
    delaiSolde: resa.delai_solde_jours,
    dateButoirSolde: minusDaysFr(dateArriveeIso, resa.delai_solde_jours),
    paiementIntegral: resa.paiement_integral,
    integralChoisi: integralChoisi(resa),
    modeSolde: resa.mode_solde ?? null,

    // Caution (art. 6, D-19) et annulation (art. 7.2, D-26) : délais figés sur la réservation.
    moyenCaution: resa.moyen_caution ?? null,
    delaiVirementCaution: resa.delai_virement_caution_jours,
    dateLimiteVirementCaution: minusDaysFr(dateArriveeIso, resa.delai_virement_caution_jours),
    delaiRemboursementSolde: resa.delai_remboursement_solde_heures,
    limiteRemboursementSolde: fmtAvantArriveeFr(dateArriveeIso, heureArrivee, resa.delai_remboursement_solde_heures),
    retenueAnnulation: retenueAnnulation(resa, montants),

    contactEmail: ctx.contactEmail,
    contactArriveeTel: fiche.contact_arrivee_tel ?? '',

    // Tampon de signature SES — renseigné par la route de signature.
    signatureSesId: undefined,
    dateSignature: undefined,
    adresseIpSignature: undefined,
    documentHash: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Décisions de calcul (validées) :
//  - L'acompte est calculé sur le TOTAL TTC, taxe de séjour incluse
//    (décision du 12/06/2026) ; solde = totalTtc − acompte.
//  - forfait_menage : réservation > gîte > FORFAIT_MENAGE_DEFAUT (8000 centimes).
//  - options : montant global reservations.options, sous l'intitulé générique
//    « Options » (la table n'a pas de libellé ; à nommer en Phase 5) ; la
//    ligne n'est affichée que si le montant est différent de zéro.
//  - caution : le montant figé sur la réservation (reservations.caution,
//    Phase 4, lot 2). Plus de valeur par défaut : un montant absent arrête
//    le contrat (lib/contrat.ts) et la préautorisation (lib/caution.ts).
// ─────────────────────────────────────────────────────────────────────────────
