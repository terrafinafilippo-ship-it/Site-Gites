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
import type { ContratData } from '@/components/pdf/ContratPDF';
import type { GiteRow, ReservationAvecGite } from '@/lib/reservations';
import {
  TAUX_ACOMPTE,
  TAUX_SOLDE,
  FORFAIT_MENAGE_DEFAUT,
  DELAI_SOLDE_DEFAUT,
  CAUTION_DEFAUT,
  HEURE_ARRIVEE_DEFAUT,
  HEURE_DEPART_DEFAUT,
  HEURE_LIMITE_ARRIVEE_DEFAUT,
  DELAI_TOLERANCE_COMMERCIALE_DEFAUT,
} from '@/lib/constantes';
import {
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
  acompte: number; // 30 % du total TTC (taxe de séjour incluse), arrondi au centime
  solde: number; // totalTtc − acompte (70 % du total TTC)
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
 *   - acompte = TAUX_ACOMPTE % du TOTAL TTC (taxe de séjour incluse)
 *   - solde   = totalTtc − acompte
 *   - la taxe de séjour est FOURNIE par la réservation, jamais recalculée ici.
 *
 * Le solde est dérivé de `totalTtc − acompte` (et non d'un second pourcentage) :
 * en centimes entiers, acompte + solde = totalTtc est exact par construction.
 */
export function calculerMontants(resa: Reservation): Montants {
  const gite = resa.gites ?? undefined;

  // Entrées en centimes entiers (frontière franchie dans lib/reservations.ts).
  const prixLocation = resa.prix_location ?? 0;
  const forfaitMenage =
    resa.forfait_menage ?? gite?.forfait_menage ?? FORFAIT_MENAGE_DEFAUT;
  const options = resa.options ?? 0;
  const taxeSejour = resa.taxe_sejour ?? 0;

  // Additions d'entiers : exactes, aucun arrondi.
  const base = prixLocation + forfaitMenage + options;
  const totalTtc = base + taxeSejour;
  // SEUL arrondi du modèle : conversion du TAUX d'acompte en montant. Le `/ 100`
  // porte sur le taux (30 % → 0,3), pas sur un montant ; Math.round ramène le
  // résultat à un entier de centimes.
  const acompte = Math.round(totalTtc * (TAUX_ACOMPTE / 100));
  const solde = totalTtc - acompte;

  return { base, acompte, solde, taxeSejour, totalTtc, forfaitMenage, options };
}

// ─── Contexte de génération (fourni par la route après creer_facture) ─────────
export interface FactureContext {
  type: 'acompte' | 'solde';
  // numéro + date d'émission AUTORITAIRES, issus de la ligne `factures`
  numeroFacture: string;
  dateEmission: string; // déjà formaté FR
  datePaiement: string; // date/heure d'encaissement formatée
  // rappel de la facture d'acompte (obligatoire pour le solde)
  factureAcompte?: {
    numero: string;
    datePaiement: string; // date d'encaissement de l'acompte, formatée
    montant: number; // centimes, lu sur la ligne `factures` de l'acompte
  };
}

/**
 * Construit l'objet de données du PDF (forme exacte de FactureAcompteData ou
 * FactureSoldeData) à partir de la réservation, du gîte joint, des montants
 * calculés et du contexte (numéro/date issus de creer_facture).
 */
export function mapFactureData(
  resa: Reservation,
  montants: Montants,
  ctx: FactureContext,
): FactureAcompteData | FactureSoldeData {
  return ctx.type === 'acompte'
    ? mapAcompteData(resa, montants, ctx)
    : mapSoldeData(resa, montants, ctx);
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
    tauxTaxeSejour: resa.taux_taxe_sejour ?? 0,
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

    tauxAcompte: TAUX_ACOMPTE,
    montantAcompte: m.acompte,
    montantSolde: m.solde,
    delaiSolde: DELAI_SOLDE_DEFAUT,
    dateButoirSolde: minusDaysFr(dateArriveeIso, DELAI_SOLDE_DEFAUT),

    modePaiement: resa.mode_paiement ?? '',
    datePaiement: ctx.datePaiement,
    referenceTransaction: resa.reference_transaction ?? '',
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

    modePaiement: resa.mode_paiement ?? '',
    datePaiement: ctx.datePaiement,
    referenceTransaction: resa.reference_transaction ?? '',
  };
}

// ─── Mapping CONTRAT ───────────────────────────────────────────────────────────
/**
 * Construit l'objet `ContratData` à partir de la réservation, du gîte joint, des
 * montants calculés et du numéro/date de contrat (fournis par la route).
 *
 * Les champs du tampon de signature (SES) sont laissés vides (signature ultérieure).
 */
export function mapContratData(
  resa: Reservation,
  montants: Montants,
  ctx: { numeroContrat: string; dateEmission: string },
): ContratData {
  const gite = resa.gites ?? undefined;
  const dateArriveeIso = resa.date_arrivee ?? '';

  return {
    ...champsCommuns(resa),
    numeroContrat: ctx.numeroContrat,
    dateEmission: ctx.dateEmission,

    // champsCommuns ne fournit pas le téléphone (absent des factures)
    clientTelephone: resa.client_telephone ?? '',

    // Caractéristiques du gîte (back-office > défauts entreprise)
    giteCapaciteMax: gite?.capacite_max ?? 0,
    giteEquipementsSpecifiques: gite?.equipements_specifiques ?? '',
    giteASpa: gite?.a_spa ?? false,
    cautionMontant: gite?.caution ?? CAUTION_DEFAUT,

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

    tauxAcompte: TAUX_ACOMPTE,
    montantAcompte: montants.acompte,
    tauxSolde: TAUX_SOLDE,
    montantSolde: montants.solde,
    delaiSolde: DELAI_SOLDE_DEFAUT,
    dateButoirSolde: minusDaysFr(dateArriveeIso, DELAI_SOLDE_DEFAUT),

    delaiToleranceCommerciale: DELAI_TOLERANCE_COMMERCIALE_DEFAUT,
    contactArriveeTel: gite?.contact_arrivee_tel ?? '',

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
//  - caution : gîte (base) > CAUTION_DEFAUT ; le gîte étant toujours joint,
//    la valeur par défaut ne doit jamais apparaître dans un contrat réel.
// ─────────────────────────────────────────────────────────────────────────────
