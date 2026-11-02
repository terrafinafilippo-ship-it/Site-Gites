// INSCRIPTION des courriels du site (Phase 3, lot 4) dans le journal
// `courriels`, DANS LA TRANSACTION de l'événement qui en est la cause :
//   - paiement constaté (lib/paiement.ts) → confirmation au client (avec le
//     contrat à signer, séjour payé en une fois compris depuis le lot 5) et
//     alerte « réservation » ;
//   - remboursement décidé (lib/paiement.ts) → courriel au client, alerte
//     « À TRAITER » ;
//   - contrat signé (POST /api/contrats/signer) → alerte « signature » ;
//   - lien « Ma réservation » redemandé (lib/suivi.ts) → courriel au client ;
//   - Phase 4, lot 1 (D-28, D-29) : paiement constaté → la facture en PDF ;
//     tâches automatiques (lib/solde.ts) → préavis du prélèvement, lien pour
//     payer le solde, rappel, solde impayé (client et alerte « À TRAITER »).
// L'ENVOI est ailleurs (lib/courriels-envoi.ts), après la réponse : ce module
// ne fait qu'écrire, sans réseau, et reste léger (lib/paiement.ts l'importe).
//
// IDEMPOTENT : chaque courriel a une clé unique (`cle`) ; inscrire deux fois
// le même événement ne fait rien de plus.
//
// Choix du gérant (24 et 27 octobre 2026) : les courriels au client sont dans
// sa langue et ne disent que des faits ; les alertes vont aux destinataires
// réglés dans `alertes` (contact@ au départ), en français.
import { eq } from "drizzle-orm";

import { alertes, courriels, reservations, type ObjetCourriel, type TypeAlerte, type TypeFacture } from "@/db/schema";
import type { Executeur } from "@/lib/reservations";

/** Ce qu'une alerte « À TRAITER » signale. */
export type GenreProbleme =
  | "remboursement"
  | "contrat_non_cree"
  | "courriel_non_parti"
  // Phase 4, lot 1 : solde impayé (prélèvement refusé ou date limite passée),
  // prélèvement resté sans réponse du prestataire.
  | "solde_impaye"
  | "solde_a_verifier"
  // Facture refusée à l'émission (aucun numéro frappé) : le client ne l'a pas reçue.
  | "facture_non_emise";

async function inscrire(
  executeur: Executeur,
  c: {
    objet: ObjetCourriel;
    cle: string;
    reservationId: string | null;
    destinataire: string;
    langue: "fr" | "en";
    donnees?: Record<string, unknown>;
    apresMinutes?: number;
  },
): Promise<void> {
  await executeur
    .insert(courriels)
    .values({
      objet: c.objet,
      cle: c.cle,
      reservation_id: c.reservationId,
      destinataire: c.destinataire,
      langue: c.langue,
      donnees: c.donnees ?? {},
      prochain_essai_at: new Date(Date.now() + (c.apresMinutes ?? 0) * 60_000),
    })
    .onConflictDoNothing({ target: courriels.cle });
}

/** Destinataires d'une alerte active ; aucun si elle est coupée ou absente. */
async function destinatairesAlerte(executeur: Executeur, type: TypeAlerte): Promise<string[]> {
  const [ligne] = await executeur.select().from(alertes).where(eq(alertes.type, type));
  return ligne?.active ? ligne.destinataires : [];
}

async function client(executeur: Executeur, reservationId: string) {
  const [r] = await executeur
    .select({ email: reservations.client_email, langue: reservations.langue, integral: reservations.paiement_integral })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  return r ?? null;
}

async function alerter(
  executeur: Executeur,
  type: TypeAlerte,
  objet: ObjetCourriel,
  sujetCle: string,
  reservationId: string | null,
  donnees: Record<string, unknown> = {},
): Promise<void> {
  for (const destinataire of await destinatairesAlerte(executeur, type)) {
    await inscrire(executeur, {
      objet,
      cle: `${objet}:${sujetCle}:${destinataire}`,
      reservationId,
      destinataire,
      langue: "fr",
      donnees,
    });
  }
}

/** Alerte « À TRAITER — … » aux propriétaires. `sujetCle` identifie le problème (une alerte par problème). */
export async function inscrireProbleme(
  executeur: Executeur,
  genre: GenreProbleme,
  sujetCle: string,
  reservationId: string | null,
  donnees: Record<string, unknown> = {},
): Promise<void> {
  await alerter(executeur, "probleme", "alerte_probleme", `${genre}:${sujetCle}`, reservationId, { genre, ...donnees });
}

/** Paiement constaté, réservation confirmée : confirmation au client et alerte « réservation ». */
export async function inscrireApresPaiement(executeur: Executeur, reservationId: string): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c) return;
  if (c.email) {
    await inscrire(executeur, {
      objet: "confirmation",
      cle: `confirmation:${reservationId}`,
      reservationId,
      destinataire: c.email,
      langue: c.langue === "en" ? "en" : "fr",
    });
  }
  await alerter(executeur, "reservation", "alerte_reservation", reservationId, reservationId);
  // La facture de ce paiement (D-29) : unique pour un séjour payé en une fois.
  await inscrireFacture(executeur, reservationId, c.integral ? "total" : "acompte");
}

/**
 * Paiement constaté → sa facture, émise à l'envoi du courriel et jointe en
 * PDF (lib/courriels-envoi.ts). Une par réservation et par type.
 */
export async function inscrireFacture(executeur: Executeur, reservationId: string, type: TypeFacture): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet: "facture",
    cle: `facture:${reservationId}:${type}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    donnees: { type },
  });
}

/** Courriels du solde au client, un de chaque par réservation (D-28). */
export type ObjetSolde = "solde_preavis" | "solde_lien" | "solde_rappel";

export async function inscrireSolde(executeur: Executeur, reservationId: string, objet: ObjetSolde): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet,
    cle: `${objet}:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
}

/** Pourquoi le solde est impayé : prélèvement refusé (code de la banque), ou date limite passée. */
export type MotifImpaye = { motif: "refus"; refus: string | null } | { motif: "echeance" };

/**
 * Solde impayé (D-28) : courriel au client avec le lien pour payer, et
 * alerte « À TRAITER » aux propriétaires. Une seule fois par réservation ;
 * la seconde alerte (`relance`) a sa propre clé.
 */
export async function inscrireImpaye(executeur: Executeur, reservationId: string, m: MotifImpaye): Promise<void> {
  const c = await client(executeur, reservationId);
  if (c?.email) {
    await inscrire(executeur, {
      objet: "solde_impaye",
      cle: `solde_impaye:${reservationId}`,
      reservationId,
      destinataire: c.email,
      langue: c.langue === "en" ? "en" : "fr",
      donnees: { ...m },
    });
  }
  await inscrireProbleme(executeur, "solde_impaye", reservationId, reservationId, { ...m, relance: false });
}

/** Seconde alerte : le solde n'est toujours pas payé `jours` jours après la première. */
export async function inscrireRelanceImpaye(
  executeur: Executeur,
  reservationId: string,
  m: MotifImpaye,
  jours: number,
): Promise<void> {
  await inscrireProbleme(executeur, "solde_impaye", `${reservationId}:relance`, reservationId, {
    ...m,
    relance: true,
    jours,
  });
}

/**
 * Contrat non créé au moment de la confirmation : un courriel « contrat à
 * signer » le créera et l'enverra plus tard, retenté jusqu'à ce qu'il aboutisse.
 */
export async function inscrireContratARelancer(
  executeur: Executeur,
  reservationId: string,
  apresMinutes: number,
): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet: "contrat",
    cle: `contrat:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    apresMinutes,
  });
}

/**
 * Paiement reçu mais remboursé (dates reprises, montant inattendu, paiement
 * inconnu) : courriel au client s'il est connu, alerte « À TRAITER ».
 */
export async function inscrireRemboursement(
  executeur: Executeur,
  r: { reservationId: string | null; paiementId: string; motif: string; datesPrises: boolean; montant: number },
): Promise<void> {
  const donnees = { paiementId: r.paiementId, motif: r.motif, datesPrises: r.datesPrises, montant: r.montant };
  if (r.reservationId) {
    const c = await client(executeur, r.reservationId);
    if (c?.email) {
      await inscrire(executeur, {
        objet: "remboursement",
        cle: `remboursement:${r.paiementId}`,
        reservationId: r.reservationId,
        destinataire: c.email,
        langue: c.langue === "en" ? "en" : "fr",
        donnees,
      });
    }
  }
  await inscrireProbleme(executeur, "remboursement", r.paiementId, r.reservationId, donnees);
}

/**
 * Lien « Ma réservation » redemandé par le formulaire (D-25) : un courriel par
 * réservation, dans sa langue. `demande` identifie la demande (la limite par
 * adresse compte les demandes, pas les courriels).
 */
export async function inscrireLienSuivi(
  executeur: Executeur,
  l: { reservationId: string; destinataire: string; langue: "fr" | "en"; demande: string },
): Promise<void> {
  await inscrire(executeur, {
    objet: "lien_suivi",
    cle: `lien_suivi:${l.reservationId}:${l.demande}`,
    reservationId: l.reservationId,
    destinataire: l.destinataire,
    langue: l.langue,
    donnees: { demande: l.demande },
  });
}

/** Contrat signé : alerte « signature ». */
export async function inscrireSignature(executeur: Executeur, reservationId: string, numero: string): Promise<void> {
  await alerter(executeur, "signature", "alerte_signature", reservationId, reservationId, { numero });
}
