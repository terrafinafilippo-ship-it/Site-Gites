// Calcul du PRIX DE LOCATION d'un séjour, à partir de la tarification en base.
//
// Module PUR : aucune lecture en base, aucune horloge. Tout arrive en
// paramètre, ce qui le rend vérifiable cas par cas sans serveur
// (npm run verify:tarification). La lecture vit dans lib/tarifs.ts.
//
// LE MODÈLE (décision D-17, docs/02-decisions.md) :
//
//   - Un TARIF porte un nom libre (« Basse saison ») et le prix d'UNE NUIT pour
//     chaque gîte. Il est associé à des PÉRIODES datées, qui ne se chevauchent
//     pas (contrainte d'exclusion en base) : une nuit relève d'au plus un tarif.
//   - Un BARÈME donne un coefficient par RANG de nuit dans le séjour (1re nuit,
//     2e nuit…). Au-delà de sa dernière case, chaque nuit vaut la MOYENNE des
//     coefficients du barème : le prix moyen par nuit cesse alors de baisser,
//     et deux semaines coûtent exactement deux fois une semaine.
//   - Prix d'une nuit = prix de la nuit DANS SA PROPRE PÉRIODE × coefficient de
//     son rang. Un séjour à cheval sur deux saisons ne pose donc aucun
//     problème : chaque nuit garde le prix de sa saison, le rang continue.
//   - Les RÈGLES (minimum de nuits, jours d'arrivée et de départ autorisés) et
//     le barème se résolvent dans l'ordre : période → tarif → réglage général.
//     Une valeur absente à un niveau est prise au niveau suivant ; une valeur
//     présente mais INVALIDE (barème incohérent) n'est jamais remplacée par
//     celle du niveau suivant : elle produit un refus.
//
// ARRONDI : le total est calculé en fractions EXACTES (BigInt) puis arrondi UNE
// seule fois au centime. Les montants par nuit et par ligne sont obtenus par
// ARRONDI CUMULÉ (montant de la nuit k = arrondi du cumul jusqu'à k − arrondi
// du cumul jusqu'à k−1) : leur somme égale exactement le total, au centime,
// comme acompte + solde = total sur les factures.
//
// UN REFUS N'EST PAS UNE ERREUR. Une nuit sans tarif, un jour d'arrivée non
// autorisé, un séjour trop court sont des situations prévues, rendues comme
// telles. Le tunnel ne poursuit jamais avec une valeur de repli (fiche de la
// Phase 3 : « le tunnel ne doit JAMAIS dégrader en silence »).
//
// MONTANTS EN CENTIMES ENTIERS (règle 3 de CLAUDE.md). Coefficients en
// dix-millièmes (0,85 → 8500), lus exactement par lib/decimaux.ts.

import { BIG_UN, BIG_ZERO, diviserArrondi } from "@/lib/decimaux";
import { ajouterJours, jourSemaineIso, nombreDeNuits, nomJourIso } from "@/lib/dates-civiles";

/** Échelle des coefficients : 10 000 = 1,0000. */
export const ECHELLE_COEFFICIENT = 10_000;

/** Garde technique contre une saisie absurde (pas une règle commerciale). */
const NUITS_MAXIMUM_TECHNIQUE = 366;

// ─── Données d'entrée ─────────────────────────────────────────────────────────

/** Règles effectives d'une nuit. */
export interface Regles {
  nuitsMinimum: number;
  /** Jours ISO autorisés (1 = lundi … 7 = dimanche). */
  joursArrivee: readonly number[];
  joursDepart: readonly number[];
}

/** Règles portées par un tarif ou une période : `null` = héritée du niveau suivant. */
export interface ReglesPartielles {
  nuitsMinimum: number | null;
  joursArrivee: readonly number[] | null;
  joursDepart: readonly number[] | null;
}

export interface TarifDonnees {
  id: string;
  nom: string;
  regles: ReglesPartielles;
  baremeId: string | null;
  /** Prix d'une nuit par gîte (clé : slug), en centimes. Gîte absent = pas de prix. */
  prixNuit: Partial<Record<string, number>>;
}

export interface PeriodeDonnees {
  id: string;
  tarifId: string;
  /** Première nuit de la période (incluse). */
  debut: string;
  /** Jour où la période s'arrête (EXCLU) : la première nuit de la suivante. */
  fin: string;
  regles: ReglesPartielles;
  baremeId: string | null;
}

/**
 * La tarification telle que lue en base (lib/tarifs.ts), déjà convertie en
 * entiers. Sérialisable en JSON : elle passe par le cache de Next.js.
 */
export interface DonneesTarification {
  general: { regles: Regles; baremeId: string | null };
  /** Coefficients par barème, rang 1 en tête. Seuls les barèmes COHÉRENTS y figurent. */
  baremes: Record<string, number[]>;
  tarifs: TarifDonnees[];
  periodes: PeriodeDonnees[];
}

/** Une période résolue pour UN gîte : prix, règles et barème effectifs. */
export interface PeriodeResolue {
  debut: string;
  fin: string;
  tarifId: string;
  tarifNom: string;
  /** Centimes ; `null` = ce tarif n'a pas de prix pour ce gîte. */
  prixNuit: number | null;
  regles: Regles;
  /** `null` = aucun barème applicable, ou barème incohérent. */
  bareme: readonly number[] | null;
}

// ─── Résultats ────────────────────────────────────────────────────────────────

export interface NuitCalculee {
  date: string;
  /** Rang de la nuit dans le séjour, à partir de 1. */
  rang: number;
  tarifId: string;
  tarifNom: string;
  prixNuit: number;
  /** Coefficient appliqué, en fraction exacte (la moyenne du barème n'est pas décimale). */
  coefficient: { numerateur: number; denominateur: number };
  /** Centimes, par arrondi cumulé : la somme des nuits égale le total. */
  montant: number;
}

/** Nuits consécutives au même tarif : une ligne du récapitulatif. */
export interface LignePrix {
  tarifId: string;
  tarifNom: string;
  prixNuit: number;
  nbNuits: number;
  premiereNuit: string;
  derniereNuit: string;
  /** Centimes ; la somme des lignes égale le total. */
  montant: number;
}

export interface PrixSejour {
  arrivee: string;
  depart: string;
  nbNuits: number;
  /** Prix de location du séjour, en centimes, arrondi une seule fois. */
  total: number;
  lignes: LignePrix[];
  nuits: NuitCalculee[];
}

export type RefusSejour =
  | { motif: "DATES_INVALIDES"; message: string }
  | { motif: "NUIT_SANS_TARIF"; message: string; date: string }
  | { motif: "NUIT_SANS_PRIX"; message: string; date: string; tarifNom: string }
  | { motif: "BAREME_ABSENT"; message: string; date: string; tarifNom: string }
  | {
      motif: "ARRIVEE_NON_AUTORISEE" | "DEPART_NON_AUTORISE";
      message: string;
      jour: number;
      joursAutorises: readonly number[];
      tarifNom: string;
    }
  | { motif: "SEJOUR_TROP_COURT"; message: string; nbNuits: number; minimum: number; tarifNom: string };

export type MotifRefus = RefusSejour["motif"];

export type ResultatSejour = { ok: true; prix: PrixSejour } | { ok: false; refus: RefusSejour };

/**
 * Vrai si le refus vient d'une DONNÉE manquante (tarif, prix, barème) et non
 * d'une règle que le client peut respecter en changeant ses dates.
 */
export function refusParDonneeManquante(refus: RefusSejour): boolean {
  return (
    refus.motif === "NUIT_SANS_TARIF" ||
    refus.motif === "NUIT_SANS_PRIX" ||
    refus.motif === "BAREME_ABSENT"
  );
}

// ─── Fractions exactes ────────────────────────────────────────────────────────

interface Fraction {
  num: bigint;
  den: bigint;
}

const ZERO: Fraction = { num: BIG_ZERO, den: BIG_UN };

function pgcd(a: bigint, b: bigint): bigint {
  let x = a < BIG_ZERO ? -a : a;
  let y = b < BIG_ZERO ? -b : b;
  while (y !== BIG_ZERO) [x, y] = [y, x % y];
  return x;
}

function reduire(f: Fraction): Fraction {
  const g = pgcd(f.num, f.den);
  return g > BIG_UN ? { num: f.num / g, den: f.den / g } : f;
}

function additionner(a: Fraction, b: Fraction): Fraction {
  return reduire({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function arrondir(f: Fraction): number {
  return Number(diviserArrondi(f.num, f.den));
}

/**
 * Coefficient du rang `rang` (1 = première nuit) : la case du barème, ou, au-delà
 * de la dernière case, la moyenne de toutes les cases.
 */
function coefficientDuRang(bareme: readonly number[], rang: number): Fraction {
  if (rang <= bareme.length) {
    return reduire({ num: BigInt(bareme[rang - 1]), den: BigInt(ECHELLE_COEFFICIENT) });
  }
  const somme = bareme.reduce((s, c) => s + c, 0);
  return reduire({ num: BigInt(somme), den: BigInt(ECHELLE_COEFFICIENT * bareme.length) });
}

// ─── Résolution ───────────────────────────────────────────────────────────────

/**
 * Périodes résolues pour un gîte, triées par date de début : chaque période
 * reçoit le prix de son tarif pour ce gîte, et ses règles et son barème
 * effectifs (période → tarif → général).
 */
export function resoudrePeriodes(donnees: DonneesTarification, gite: string): PeriodeResolue[] {
  const tarifsParId = new Map(donnees.tarifs.map((t) => [t.id, t]));
  const g = donnees.general;
  return donnees.periodes
    .map((p): PeriodeResolue => {
      const t = tarifsParId.get(p.tarifId);
      if (!t) {
        // Impossible tant que la clé étrangère periodes.tarif_id existe.
        throw new Error(`période ${p.id} : tarif ${p.tarifId} introuvable`);
      }
      const baremeId = p.baremeId ?? t.baremeId ?? g.baremeId;
      return {
        debut: p.debut,
        fin: p.fin,
        tarifId: t.id,
        tarifNom: t.nom,
        prixNuit: t.prixNuit[gite] ?? null,
        regles: {
          nuitsMinimum: p.regles.nuitsMinimum ?? t.regles.nuitsMinimum ?? g.regles.nuitsMinimum,
          joursArrivee: p.regles.joursArrivee ?? t.regles.joursArrivee ?? g.regles.joursArrivee,
          joursDepart: p.regles.joursDepart ?? t.regles.joursDepart ?? g.regles.joursDepart,
        },
        bareme: baremeId === null ? null : (donnees.baremes[baremeId] ?? null),
      };
    })
    .sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
}

function periodeDeLaNuit(periodes: readonly PeriodeResolue[], date: string): PeriodeResolue | undefined {
  // Comparaison de chaînes « aaaa-mm-jj » : l'ordre lexical est l'ordre des dates.
  return periodes.find((p) => p.debut <= date && date < p.fin);
}

function listeJours(jours: readonly number[]): string {
  return jours.map(nomJourIso).join(", ");
}

// ─── Calcul d'un séjour ───────────────────────────────────────────────────────

/**
 * Prix de location d'un séjour (arrivée incluse, départ exclu), ou le motif
 * précis du refus. Les contrôles se font dans cet ordre : dates, puis données
 * (chaque nuit a un tarif, un prix et un barème), puis règles.
 *
 * Règles d'un séjour à cheval sur plusieurs périodes :
 *   - le jour d'ARRIVÉE obéit à la période de la première nuit ;
 *   - le jour de DÉPART obéit à la période de la dernière nuit ;
 *   - le MINIMUM de nuits est le plus exigeant des périodes traversées.
 */
export function calculerSejour(
  periodes: readonly PeriodeResolue[],
  arrivee: string,
  depart: string,
): ResultatSejour {
  let nbNuits: number;
  try {
    nbNuits = nombreDeNuits(arrivee, depart);
  } catch (erreur) {
    return { ok: false, refus: { motif: "DATES_INVALIDES", message: (erreur as Error).message } };
  }
  if (nbNuits < 1) {
    return {
      ok: false,
      refus: { motif: "DATES_INVALIDES", message: `le départ (${depart}) doit suivre l'arrivée (${arrivee})` },
    };
  }
  if (nbNuits > NUITS_MAXIMUM_TECHNIQUE) {
    return {
      ok: false,
      refus: { motif: "DATES_INVALIDES", message: `séjour de ${nbNuits} nuits, au-delà de ${NUITS_MAXIMUM_TECHNIQUE}` },
    };
  }

  // 1. Données : chaque nuit relève d'une période, avec un prix et un barème.
  const nuits: Array<{ date: string; periode: PeriodeResolue }> = [];
  for (let i = 0; i < nbNuits; i += 1) {
    const date = ajouterJours(arrivee, i);
    const periode = periodeDeLaNuit(periodes, date);
    if (!periode) {
      return {
        ok: false,
        refus: { motif: "NUIT_SANS_TARIF", message: `aucun tarif ne couvre la nuit du ${date}`, date },
      };
    }
    if (periode.prixNuit === null) {
      return {
        ok: false,
        refus: {
          motif: "NUIT_SANS_PRIX",
          message: `le tarif « ${periode.tarifNom} » n'a pas de prix pour ce gîte (nuit du ${date})`,
          date,
          tarifNom: periode.tarifNom,
        },
      };
    }
    if (periode.bareme === null) {
      return {
        ok: false,
        refus: {
          motif: "BAREME_ABSENT",
          message: `aucun barème valide pour le tarif « ${periode.tarifNom} » (nuit du ${date})`,
          date,
          tarifNom: periode.tarifNom,
        },
      };
    }
    nuits.push({ date, periode });
  }

  // 2. Règles.
  const premiere = nuits[0].periode;
  const derniere = nuits[nuits.length - 1].periode;

  const jourArrivee = jourSemaineIso(arrivee);
  if (!premiere.regles.joursArrivee.includes(jourArrivee)) {
    return {
      ok: false,
      refus: {
        motif: "ARRIVEE_NON_AUTORISEE",
        message: `arrivée un ${nomJourIso(jourArrivee)} refusée sur « ${premiere.tarifNom} » (autorisé : ${listeJours(premiere.regles.joursArrivee)})`,
        jour: jourArrivee,
        joursAutorises: premiere.regles.joursArrivee,
        tarifNom: premiere.tarifNom,
      },
    };
  }

  const jourDepart = jourSemaineIso(depart);
  if (!derniere.regles.joursDepart.includes(jourDepart)) {
    return {
      ok: false,
      refus: {
        motif: "DEPART_NON_AUTORISE",
        message: `départ un ${nomJourIso(jourDepart)} refusé sur « ${derniere.tarifNom} » (autorisé : ${listeJours(derniere.regles.joursDepart)})`,
        jour: jourDepart,
        joursAutorises: derniere.regles.joursDepart,
        tarifNom: derniere.tarifNom,
      },
    };
  }

  let minimum = 0;
  let tarifExigeant = premiere.tarifNom;
  for (const { periode } of nuits) {
    if (periode.regles.nuitsMinimum > minimum) {
      minimum = periode.regles.nuitsMinimum;
      tarifExigeant = periode.tarifNom;
    }
  }
  if (nbNuits < minimum) {
    return {
      ok: false,
      refus: {
        motif: "SEJOUR_TROP_COURT",
        message: `${nbNuits} nuit(s) : « ${tarifExigeant} » en exige au moins ${minimum}`,
        nbNuits,
        minimum,
        tarifNom: tarifExigeant,
      },
    };
  }

  // 3. Montants : somme exacte, arrondi cumulé.
  let cumul = ZERO;
  let arrondiPrecedent = 0;
  const nuitsCalculees: NuitCalculee[] = nuits.map(({ date, periode }, index) => {
    const rang = index + 1;
    const coefficient = coefficientDuRang(periode.bareme as readonly number[], rang);
    const prixNuit = periode.prixNuit as number;
    cumul = additionner(cumul, { num: BigInt(prixNuit) * coefficient.num, den: coefficient.den });
    const arrondiCumule = arrondir(cumul);
    const montant = arrondiCumule - arrondiPrecedent;
    arrondiPrecedent = arrondiCumule;
    return {
      date,
      rang,
      tarifId: periode.tarifId,
      tarifNom: periode.tarifNom,
      prixNuit,
      coefficient: { numerateur: Number(coefficient.num), denominateur: Number(coefficient.den) },
      montant,
    };
  });

  const lignes: LignePrix[] = [];
  for (const n of nuitsCalculees) {
    const courante = lignes[lignes.length - 1];
    if (courante && courante.tarifId === n.tarifId) {
      courante.nbNuits += 1;
      courante.derniereNuit = n.date;
      courante.montant += n.montant;
    } else {
      lignes.push({
        tarifId: n.tarifId,
        tarifNom: n.tarifNom,
        prixNuit: n.prixNuit,
        nbNuits: 1,
        premiereNuit: n.date,
        derniereNuit: n.date,
        montant: n.montant,
      });
    }
  }

  return {
    ok: true,
    prix: { arrivee, depart, nbNuits, total: arrondiPrecedent, lignes, nuits: nuitsCalculees },
  };
}

/**
 * Prix de `nbNuits` nuits consécutives à un même prix, avec un barème : la
 * somme exacte des coefficients des rangs 1 à nbNuits, arrondie une seule fois.
 * Sert à la grille publique (« la semaine » = 7 nuits).
 */
export function prixPourNuits(prixNuit: number, bareme: readonly number[], nbNuits: number): number {
  let somme = ZERO;
  for (let rang = 1; rang <= nbNuits; rang += 1) {
    const c = coefficientDuRang(bareme, rang);
    somme = additionner(somme, { num: BigInt(prixNuit) * c.num, den: c.den });
  }
  return arrondir(somme);
}

// ─── Grille publique ──────────────────────────────────────────────────────────

export interface PlageDates {
  debut: string;
  /** Exclu : jour du départ. */
  fin: string;
}

export interface LigneGrille {
  tarifId: string;
  tarifNom: string;
  /** Prix d'une nuit, en centimes. */
  prixNuit: number;
  /** Prix d'un séjour de 7 nuits au prix de ce tarif, barème appliqué, en centimes. */
  prixSemaine: number;
  /** Périodes à venir (ou en cours) de ce tarif, dans l'ordre. */
  plages: PlageDates[];
}

/**
 * Grille affichée sur la fiche d'un gîte : une ligne par tarif ayant au moins
 * une période qui n'est pas terminée au jour `aujourdhui`, dans l'ordre de sa
 * prochaine période.
 *
 * Le barème d'une ligne est celui du tarif, ou à défaut le barème général. Une
 * période qui porte son propre barème n'est pas reflétée dans la colonne « la
 * semaine » : la grille annonce le cas général, le tunnel calcule le cas exact.
 *
 * Les lignes inexploitables (pas de prix pour ce gîte, pas de barème) sont
 * ÉCARTÉES et décrites dans `anomalies`, que l'appelant journalise : la grille
 * ne montre jamais un prix que le tunnel refuserait de calculer.
 */
export function construireGrille(
  donnees: DonneesTarification,
  gite: string,
  aujourdhui: string,
): { lignes: LigneGrille[]; anomalies: string[] } {
  const anomalies: string[] = [];
  const lignes: LigneGrille[] = [];

  for (const tarif of donnees.tarifs) {
    const plages = donnees.periodes
      .filter((p) => p.tarifId === tarif.id && p.fin > aujourdhui)
      .map((p) => ({ debut: p.debut, fin: p.fin }))
      .sort((a, b) => (a.debut < b.debut ? -1 : 1));
    if (plages.length === 0) continue;

    const prixNuit = tarif.prixNuit[gite];
    if (prixNuit === undefined) {
      anomalies.push(`tarif « ${tarif.nom} » sans prix pour « ${gite} », alors qu'il a des périodes à venir`);
      continue;
    }
    const baremeId = tarif.baremeId ?? donnees.general.baremeId;
    const bareme = baremeId === null ? undefined : donnees.baremes[baremeId];
    if (!bareme) {
      anomalies.push(`tarif « ${tarif.nom} » sans barème valide (ni propre, ni général)`);
      continue;
    }
    lignes.push({
      tarifId: tarif.id,
      tarifNom: tarif.nom,
      prixNuit,
      prixSemaine: prixPourNuits(prixNuit, bareme, 7),
      plages,
    });
  }

  lignes.sort((a, b) => (a.plages[0].debut < b.plages[0].debut ? -1 : 1));
  return { lignes, anomalies };
}

/**
 * « À partir de … la semaine » : le MINIMUM des prix de semaine de la grille.
 * La page ne peut donc pas annoncer un plancher absent de sa propre grille.
 */
export function plancherSemaine(lignes: readonly LigneGrille[]): number | null {
  return lignes.length === 0 ? null : Math.min(...lignes.map((l) => l.prixSemaine));
}
