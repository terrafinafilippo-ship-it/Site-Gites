// Les deux réservations de test et les MONTANTS ATTENDUS, en centimes entiers.
//
// C'est le point de vérité des contrôles de non-régression : toute phase
// suivante doit retrouver ces montants au centime. Ils viennent de la session A
// (15 septembre 2026) et ont été retrouvés à l'identique en session B — voir
// docs/journal-phases.md. Ne les modifier que sur décision métier explicite,
// jamais pour « faire passer » un test.
//
// Réservation 1 (L'Armu) : AVEC options, sert à contrôler l'itemisation.
// Réservation 2 (LaPhine) : SANS option, sert à contrôler qu'aucune ligne
// « Options » n'apparaît, et à éprouver la garde du cas B (réservation
// modifiée après émission de la facture d'acompte).

export const REFERENCE_ARMU = "TEST-2026-ARMU-001";
export const REFERENCE_LAPHINE = "TEST-2026-LAPHINE-002";

/** Montants attendus d'une réservation, en CENTIMES ENTIERS. */
export interface MontantsAttendus {
  prixLocation: number;
  forfaitMenage: number;
  options: number;
  sousTotal: number;
  taxeSejour: number;
  totalTtc: number;
  acompte: number;
  solde: number;
  caution: number;
}

export interface ReservationReference {
  reference: string;
  slugGite: string;
  giteNom: string;
  /** null : le forfait ménage vient du gîte (cas nominal). */
  forfaitMenageReservation: number | null;
  tauxTaxeSejour: string; // taux, pas un montant
  client: {
    civilite: string; nom: string; prenom: string; adresse: string;
    codePostal: string; ville: string; pays: string; email: string; telephone: string;
  };
  conjoint?: { civilite: string; nom: string; prenom: string };
  dateArrivee: string;
  dateDepart: string;
  heureArrivee: string | null;
  heureDepart: string | null;
  heureLimiteArrivee: string | null;
  nbAdultes: number;
  nbEnfants: number;
  nbBebes: number;
  occupantsMajeurs: string;
  modePaiement: string;
  referenceTransaction: string;
  datePaiementAcompte: string | null;
  attendu: MontantsAttendus;
}

export const RESERVATIONS_REFERENCE: ReservationReference[] = [
  {
    reference: REFERENCE_ARMU,
    slugGite: "armu",
    giteNom: "L'Armu",
    forfaitMenageReservation: null,
    tauxTaxeSejour: "5.50",
    client: {
      civilite: "Mme", nom: "Durand", prenom: "Camille", adresse: "12 rue des Lilas",
      codePostal: "69003", ville: "Lyon", pays: "France",
      email: "camille.durand@example.invalid", telephone: "06 12 34 56 78",
    },
    conjoint: { civilite: "M.", nom: "Durand", prenom: "Julien" },
    dateArrivee: "2026-10-17",
    dateDepart: "2026-10-24",
    heureArrivee: "17:00",
    heureDepart: "10:00",
    heureLimiteArrivee: "20:00",
    nbAdultes: 2,
    nbEnfants: 1,
    nbBebes: 0,
    occupantsMajeurs: "Camille DURAND, Julien DURAND",
    modePaiement: "Carte bancaire",
    referenceTransaction: "TEST-PAY-0001",
    datePaiementAcompte: "2026-09-15T18:28:23.118Z",
    attendu: {
      prixLocation: 45730, // 457,30 €
      forfaitMenage: 8000, // 80,00 € (valeur du gîte)
      options: 2550, // 25,50 €
      sousTotal: 56280, // 562,80 €
      taxeSejour: 1386, // 13,86 €
      totalTtc: 57666, // 576,66 €
      acompte: 17300, // 173,00 €
      solde: 40366, // 403,66 €
      caution: 40000, // 400,00 € (valeur du gîte, non facturée)
    },
  },
  {
    reference: REFERENCE_LAPHINE,
    slugGite: "laphine",
    giteNom: "LaPhine",
    forfaitMenageReservation: null,
    tauxTaxeSejour: "5.50",
    client: {
      civilite: "M.", nom: "Martin", prenom: "Thomas", adresse: "8 avenue de la Gare",
      codePostal: "38000", ville: "Grenoble", pays: "France",
      email: "thomas.martin@example.invalid", telephone: "07 98 76 54 32",
    },
    dateArrivee: "2026-11-07",
    dateDepart: "2026-11-14",
    heureArrivee: null,
    heureDepart: null,
    heureLimiteArrivee: null,
    nbAdultes: 2,
    nbEnfants: 0,
    nbBebes: 0,
    occupantsMajeurs: "Thomas MARTIN",
    modePaiement: "Carte bancaire",
    referenceTransaction: "TEST-PAY-0002",
    datePaiementAcompte: null,
    attendu: {
      prixLocation: 62000, // 620,00 €
      forfaitMenage: 8000, // 80,00 €
      options: 0, // aucune option
      sousTotal: 70000, // 700,00 €
      taxeSejour: 1540, // 15,40 €
      totalTtc: 71540, // 715,40 €
      acompte: 21462, // 214,62 €
      solde: 50078, // 500,78 €
      caution: 50000, // 500,00 €
    },
  },
];

export function reservationReference(reference: string): ReservationReference {
  const r = RESERVATIONS_REFERENCE.find((x) => x.reference === reference);
  if (!r) {
    throw new Error(
      `Référence inconnue « ${reference} ». Attendu : ${RESERVATIONS_REFERENCE.map((x) => x.reference).join(" ou ")}.`,
    );
  }
  return r;
}

/** Prix de location utilisé pour éprouver la garde du cas B (409). */
export const PRIX_MODIFIE_CAS_B = 70000; // centimes (700,00 €)
