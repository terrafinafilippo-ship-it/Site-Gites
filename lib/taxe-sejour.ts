// Calcul de la TAXE DE SÉJOUR d'un séjour. Module PUR : aucune lecture en base.
//
// LA RÈGLE, vérifiée le 14 octobre 2026 sur les deux sources officielles —
// délibération d'Annonay Rhône Agglo n° CC_2025_119 (26 juin 2025, applicable
// au 1er janvier 2026) et guide de facturation d'Ardèche Grand Air (édition
// janvier 2026). Détail et sources : docs/03-conformite.md § 7 bis.
//
//   Hébergement SANS CLASSEMENT (mode « proportionnel ») :
//     1. prix par nuit       = prix HT de la location ÷ nombre de nuits
//     2. prix de la nuitée   = prix par nuit ÷ nombre d'OCCUPANTS (mineurs compris)
//     3. tarif               = prix de la nuitée × taux (5 % à Savas)
//     4. plafond             : le tarif ne dépasse pas le plafond (4,40 €)
//     5. taxe additionnelle  = tarif × taux additionnel (10 %, départementale)
//     6. taxe                = (tarif + additionnelle) × nuits × ASSUJETTIS
//   Hébergement CLASSÉ (mode « fixe ») : le tarif de l'étape 3 est un montant
//   fixe par personne et par nuit ; les étapes 5 et 6 sont identiques.
//
//   « Lors de chaque calcul, procédez à l'arrondi au centième » (guide
//   officiel) : CHAQUE étape est arrondie au centime, la moitié vers le haut.
//   C'est ce qui reproduit au centime les deux exemples du guide (15,75 € et
//   9,68 €), rejoués par npm run verify:tarification.
//
// Les mineurs ne paient pas (art. L.2333-31 du CGCT) mais COMPTENT parmi les
// occupants à l'étape 2 : on divise par tous, on ne facture qu'aux assujettis.
//
// Taux, plafond, taxe additionnelle, mode et assiette (ménage compris ou non)
// sont des RÉGLAGES datés et propres à chaque gîte (table taxes_sejour) : une
// nouvelle délibération s'applique aux nuits à partir de sa date, sans toucher
// au code. Une nuit sans réglage applicable est un REFUS, jamais une taxe nulle.
//
// MONTANTS EN CENTIMES ENTIERS. Taux en centièmes de pour cent (5,00 % → 500).

import { ajouterJours, nombreDeNuits } from "@/lib/dates-civiles";
import { diviserArrondiEntier } from "@/lib/decimaux";

/** Échelle des taux : 10 000 = 100 %. */
const ECHELLE_TAUX = 10_000;

export type ModeTaxe = "proportionnel" | "fixe";

/** Un réglage de taxe de séjour pour un gîte, applicable à partir de `dateDebut`. */
export interface ReglageTaxe {
  dateDebut: string;
  mode: ModeTaxe;
  /** Mode proportionnel : taux en centièmes de pour cent (5 % → 500). */
  taux: number | null;
  /** Mode proportionnel : plafond par personne et par nuit, en centimes, AVANT taxe additionnelle. */
  plafond: number | null;
  /** Mode fixe : tarif par personne et par nuit, en centimes. */
  tarifFixe: number | null;
  /** Taxes additionnelles en centièmes de pour cent (10 % → 1000) ; 0 si aucune. */
  taxeAdditionnelle: number;
  /** Le forfait ménage entre-t-il dans le prix de la location retenu pour le calcul ? */
  menageDansAssiette: boolean;
  /** Référence de la délibération, pour le registre. */
  source: string | null;
}

export interface EntreeTaxe {
  arrivee: string;
  depart: string;
  /** Prix HT de la location (barème appliqué), en centimes. */
  prixHebergement: number;
  /** Forfait ménage, en centimes : n'entre dans le calcul que si le réglage le dit. */
  forfaitMenage: number;
  /** Toutes les personnes hébergées, mineurs compris. */
  nbOccupants: number;
  /** Personnes non exonérées (les majeurs). */
  nbAssujettis: number;
  /** Réglages du gîte, dans n'importe quel ordre. */
  reglages: readonly ReglageTaxe[];
}

/** Nuits consécutives soumises au même réglage. */
export interface SegmentTaxe {
  reglage: ReglageTaxe;
  premiereNuit: string;
  nbNuits: number;
  /** Étape 1, en centimes. */
  prixParNuit: number;
  /** Étape 2, en centimes. */
  prixNuitee: number;
  /** Étapes 3 et 4, en centimes. */
  tarif: number;
  /** Vrai si le plafond a été appliqué à l'étape 4. */
  plafonne: boolean;
  /** Étape 5, en centimes. */
  additionnelle: number;
  /** tarif + additionnelle, par assujetti et par nuit, en centimes. */
  tarifParPersonneNuit: number;
  /** Étape 6, en centimes. */
  montant: number;
}

export interface DetailTaxe {
  /** Taxe de séjour du séjour, en centimes. */
  total: number;
  segments: SegmentTaxe[];
}

export type RefusTaxe =
  | { motif: "DATES_INVALIDES"; message: string }
  | { motif: "OCCUPANTS_INVALIDES"; message: string }
  | { motif: "TAXE_NON_DEFINIE"; message: string; date: string }
  | { motif: "REGLAGE_INCOMPLET"; message: string; date: string };

export type ResultatTaxe = { ok: true; taxe: DetailTaxe } | { ok: false; refus: RefusTaxe };

function estEntierPositif(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/** Réglage applicable à une nuit : le plus récent dont la date de début est passée. */
function reglageDeLaNuit(tries: readonly ReglageTaxe[], date: string): ReglageTaxe | undefined {
  let applicable: ReglageTaxe | undefined;
  for (const r of tries) {
    if (r.dateDebut <= date) applicable = r;
    else break;
  }
  return applicable;
}

export function calculerTaxeSejour(entree: EntreeTaxe): ResultatTaxe {
  const { arrivee, depart, prixHebergement, forfaitMenage, nbOccupants, nbAssujettis } = entree;

  let nbNuits: number;
  try {
    nbNuits = nombreDeNuits(arrivee, depart);
  } catch (erreur) {
    return { ok: false, refus: { motif: "DATES_INVALIDES", message: (erreur as Error).message } };
  }
  if (nbNuits < 1) {
    return { ok: false, refus: { motif: "DATES_INVALIDES", message: "le départ doit suivre l'arrivée" } };
  }
  if (!estEntierPositif(prixHebergement) || !estEntierPositif(forfaitMenage)) {
    throw new Error("calculerTaxeSejour : montants attendus en centimes entiers positifs");
  }
  if (!Number.isSafeInteger(nbOccupants) || nbOccupants < 1 ||
      !Number.isSafeInteger(nbAssujettis) || nbAssujettis < 0 || nbAssujettis > nbOccupants) {
    return {
      ok: false,
      refus: {
        motif: "OCCUPANTS_INVALIDES",
        message: `occupants ${nbOccupants}, assujettis ${nbAssujettis} : il faut au moins un occupant, et pas plus d'assujettis que d'occupants`,
      },
    };
  }

  const tries = [...entree.reglages].sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));

  // Regroupement des nuits par réglage applicable.
  const groupes: Array<{ reglage: ReglageTaxe; premiereNuit: string; nbNuits: number }> = [];
  for (let i = 0; i < nbNuits; i += 1) {
    const date = ajouterJours(arrivee, i);
    const reglage = reglageDeLaNuit(tries, date);
    if (!reglage) {
      return {
        ok: false,
        refus: { motif: "TAXE_NON_DEFINIE", message: `aucun réglage de taxe de séjour pour la nuit du ${date}`, date },
      };
    }
    const courant = groupes[groupes.length - 1];
    if (courant && courant.reglage === reglage) courant.nbNuits += 1;
    else groupes.push({ reglage, premiereNuit: date, nbNuits: 1 });
  }

  const segments: SegmentTaxe[] = [];
  for (const { reglage, premiereNuit, nbNuits: nuitsDuSegment } of groupes) {
    // Étapes 1 et 2 : sur le séjour ENTIER (prix HT ÷ nuits ÷ occupants).
    const assiette = prixHebergement + (reglage.menageDansAssiette ? forfaitMenage : 0);
    const prixParNuit = diviserArrondiEntier(assiette, nbNuits);
    const prixNuitee = diviserArrondiEntier(prixParNuit, nbOccupants);

    // Étapes 3 et 4.
    let tarif: number;
    let plafonne = false;
    if (reglage.mode === "proportionnel") {
      if (reglage.taux === null || reglage.plafond === null) {
        return {
          ok: false,
          refus: {
            motif: "REGLAGE_INCOMPLET",
            message: `réglage du ${reglage.dateDebut} : taux ou plafond manquant en mode proportionnel`,
            date: premiereNuit,
          },
        };
      }
      const brut = diviserArrondiEntier(prixNuitee * reglage.taux, ECHELLE_TAUX);
      plafonne = brut > reglage.plafond;
      tarif = plafonne ? reglage.plafond : brut;
    } else {
      if (reglage.tarifFixe === null) {
        return {
          ok: false,
          refus: {
            motif: "REGLAGE_INCOMPLET",
            message: `réglage du ${reglage.dateDebut} : tarif fixe manquant`,
            date: premiereNuit,
          },
        };
      }
      tarif = reglage.tarifFixe;
    }

    // Étapes 5 et 6.
    const additionnelle = diviserArrondiEntier(tarif * reglage.taxeAdditionnelle, ECHELLE_TAUX);
    const tarifParPersonneNuit = tarif + additionnelle;
    segments.push({
      reglage,
      premiereNuit,
      nbNuits: nuitsDuSegment,
      prixParNuit,
      prixNuitee,
      tarif,
      plafonne,
      additionnelle,
      tarifParPersonneNuit,
      montant: tarifParPersonneNuit * nuitsDuSegment * nbAssujettis,
    });
  }

  return { ok: true, taxe: { total: segments.reduce((s, x) => s + x.montant, 0), segments } };
}

/** Réglage en vigueur à une date (pour l'affichage sur les fiches). */
export function reglageEnVigueur(reglages: readonly ReglageTaxe[], date: string): ReglageTaxe | null {
  const tries = [...reglages].sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));
  return reglageDeLaNuit(tries, date) ?? null;
}
