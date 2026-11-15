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
//     depuis D-41, seulement sur demande du client, depuis le back-office ;
//     tâches automatiques (lib/solde.ts) → préavis du prélèvement, lien pour
//     payer le solde, rappel, solde impayé (client et alerte « À TRAITER ») ;
//   - Phase 4, lot 2 (D-16) : caution bloquée, à valider, levée (client),
//     alerte « caution » et alertes « À TRAITER » (lib/caution.ts) ; lien
//     pour enregistrer une carte (art. 6.6) ; paiement contesté (avis de Stripe).
//   - Phase 4, lot 3 (D-31) : caution par virement (lib/virement.ts) — les
//     coordonnées bancaires au client, les alertes « virement à vérifier » et
//     « virement à rendre », l'alerte « coordonnées bancaires absentes » ;
//   - Phase 5, lot 4 : option posée au téléphone → son lien au client ;
//     back-office → facture ou contrat signé renvoyés (même document, même
//     numéro, une clé nouvelle à chaque renvoi).
//   - Phase 6 (D-40) : tâches automatiques (lib/avis.ts) → l'invitation à
//     donner son avis ; avis déposé → alerte « avis » ; avis retiré depuis le
//     back-office → son motif au client.
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
import type { EntrepriseFacture } from "@/lib/montants";
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
  | "facture_non_emise"
  // Phase 4, lot 2 : préautorisation de la caution refusée (ou authentification
  // exigée), montant de caution absent, préautorisation restée sans réponse ;
  // paiement contesté par un client auprès de sa banque.
  | "caution_refusee"
  | "caution_montant_absent"
  | "caution_a_verifier"
  | "contestation"
  // Phase 4, lot 3 : le compte qui reçoit la caution par virement n'est pas
  // saisi (ou son IBAN est faux) — le client n'a pas reçu les coordonnées.
  | "virement_coordonnees_absentes"
  // Phase 5, lot 1 : le compte de virement a été modifié depuis le back-office.
  | "virement_compte_modifie";

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
  // Plus de facture automatique (D-41) : elle se fait sur demande du client,
  // depuis le back-office (inscrireFactureDemandee).
}

/**
 * Facture demandée par le client (D-41), depuis le back-office : émise à
 * l'envoi du courriel et jointe en PDF (lib/courriels-envoi.ts), au nom de
 * l'entreprise si elle est donnée. `quand` distingue deux demandes (une
 * facture refusée à l'émission peut être redemandée) ; la facture, elle,
 * reste unique par réservation et par type.
 */
export async function inscrireFactureDemandee(
  executeur: Executeur,
  reservationId: string,
  type: "total" | "retenue",
  entreprise: EntrepriseFacture | null,
  quand: Date,
): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "facture",
    cle: `facture:${reservationId}:${type}:demande:${quand.toISOString()}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    donnees: { type, ...(entreprise ? { entreprise } : {}) },
  });
  return true;
}

/**
 * Réservation annulée depuis le back-office (Phase 5, lot 5, D-42) : le
 * courriel au client (ce qui est rendu, et comment), une fois par réservation.
 */
export async function inscrireAnnulation(executeur: Executeur, reservationId: string): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "annulation",
    cle: `annulation:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
  return true;
}

/**
 * Tout est remboursé et une facture avait été faite (D-41, réponse 3 A) :
 * l'avoir part au client, une fois par réservation. Il naît à l'envoi
 * (lib/avoirs.ts), qui refait les contrôles. `renvoi` : « Renvoyer au
 * client » (page Documents), le même avoir sous une clé nouvelle.
 */
export async function inscrireAvoir(executeur: Executeur, reservationId: string, renvoi?: Date): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "avoir",
    cle: renvoi ? `avoir:${reservationId}:renvoi:${renvoi.toISOString()}` : `avoir:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
  return true;
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

// ─── Caution par carte (Phase 4, lot 2, D-16) ────────────────────────────────

/** Courriel de la caution au client, un de chaque par réservation. */
async function inscrireCautionClient(
  executeur: Executeur,
  reservationId: string,
  objet:
    | "caution_bloquee"
    | "caution_a_valider"
    | "caution_liberee"
    | "caution_carte"
    | "caution_virement"
    | "caution_retenue"
    | "caution_recue"
    | "caution_rendue",
  donnees: Record<string, unknown> = {},
): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet,
    cle: `${objet}:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    donnees,
  });
}

/**
 * Ce que dit l'alerte « caution » aux propriétaires. Par virement (Phase 4,
 * lot 3) : vérifier qu'il est arrivé, le lendemain de sa date limite ; le
 * rendre, la veille du délai de restitution.
 */
export const QUOI_CAUTION = ["bloquee", "levee_demain", "carte_enregistree", "virement_a_verifier", "virement_a_rendre"] as const;
export type QuoiCaution = (typeof QUOI_CAUTION)[number];

/** Alerte « caution » (choix du gérant des 2 et 3 novembre 2026), une de chaque par réservation. */
export async function inscrireAlerteCaution(executeur: Executeur, reservationId: string, quoi: QuoiCaution): Promise<void> {
  await alerter(executeur, "caution", "alerte_caution", `${quoi}:${reservationId}`, reservationId, { quoi });
}

/** Caution bloquée sur la carte : courriel au client (le jour même, art. 6.2) et court message aux propriétaires. */
export async function inscrireCautionBloquee(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_bloquee");
  await inscrireAlerteCaution(executeur, reservationId, "bloquee");
}

/**
 * Préautorisation refusée, ou authentification exigée : lien au client pour
 * la valider, alerte « À TRAITER » aux propriétaires. Une seule fois : le site
 * ne réessaie pas tout seul (choix du gérant du 2 novembre 2026).
 */
export async function inscrireCautionAValider(
  executeur: Executeur,
  reservationId: string,
  refus: string | null,
): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_a_valider", { refus });
  await inscrireProbleme(executeur, "caution_refusee", reservationId, reservationId, { refus });
}

/** Préautorisation levée : rien n'a été débité. */
export async function inscrireCautionLiberee(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_liberee");
}

/** Caution non constituée à l'arrivée (art. 6.6) : le lien pour enregistrer une carte. */
export async function inscrireCarteCaution(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_carte");
}

/** Caution par virement : les coordonnées bancaires et la demande du RIB du client (D-31). */
export async function inscrireCautionVirement(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_virement");
}

/**
 * Retenue sur la caution (Phase 5, lot 2) : montant, motif et justificatifs
 * au client. Une seule par réservation.
 */
export async function inscrireCautionRetenue(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_retenue");
}

/** Caution par chèque ou virement notée reçue par les propriétaires (réponse 5 A du cadrage du lot 2). */
export async function inscrireCautionRecue(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_recue");
}

/** Caution par chèque ou virement notée rendue entière (une retenue a son propre courriel). */
export async function inscrireCautionRendue(executeur: Executeur, reservationId: string): Promise<void> {
  await inscrireCautionClient(executeur, reservationId, "caution_rendue");
}

/**
 * « Renvoyer le lien de signature » (back-office, Phase 5, lot 2) : le même
 * courriel « contrat à signer », sous une clé nouvelle à chaque renvoi.
 */
export async function inscrireContratRenvoye(executeur: Executeur, reservationId: string, quand: Date): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "contrat",
    cle: `contrat:${reservationId}:renvoi:${quand.toISOString()}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
  return true;
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

// ─── Back-office, lot 4 : option, documents renvoyés ─────────────────────────

/** Option posée au téléphone (Phase 5, lot 4) : le lien personnel vers le tunnel. */
export async function inscrireOption(
  executeur: Executeur,
  o: { optionId: string; destinataire: string; langue: "fr" | "en" },
): Promise<void> {
  await inscrire(executeur, {
    objet: "option",
    cle: `option:${o.optionId}`,
    reservationId: null,
    destinataire: o.destinataire,
    langue: o.langue,
    donnees: { optionId: o.optionId },
  });
}

/**
 * « Renvoyer au client » une facture déjà émise : le même courriel, le même
 * PDF, le même numéro (lib/factures.ts réutilise la facture existante).
 */
export async function inscrireFactureRenvoyee(
  executeur: Executeur,
  reservationId: string,
  type: TypeFacture,
  quand: Date,
): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "facture",
    cle: `facture:${reservationId}:${type}:renvoi:${quand.toISOString()}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    donnees: { type, renvoi: true },
  });
  return true;
}

/** « Renvoyer au client » le contrat signé, en pièce jointe. */
export async function inscrireContratSigne(executeur: Executeur, reservationId: string, quand: Date): Promise<boolean> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return false;
  await inscrire(executeur, {
    objet: "contrat_signe",
    cle: `contrat_signe:${reservationId}:${quand.toISOString()}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
  return true;
}

// ─── Avis des clients (Phase 6, D-40) ────────────────────────────────────────

/** L'invitation à donner son avis, après le départ (lib/avis.ts) : une par réservation. */
export async function inscrireAvisInvitation(executeur: Executeur, reservationId: string): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet: "avis_invitation",
    cle: `avis_invitation:${reservationId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
  });
}

/** L'avis retiré par les propriétaires : son motif au client. */
export async function inscrireAvisRetrait(executeur: Executeur, reservationId: string, avisId: string): Promise<void> {
  const c = await client(executeur, reservationId);
  if (!c?.email) return;
  await inscrire(executeur, {
    objet: "avis_retrait",
    cle: `avis_retrait:${avisId}`,
    reservationId,
    destinataire: c.email,
    langue: c.langue === "en" ? "en" : "fr",
    donnees: { avisId },
  });
}

/** Un client vient de laisser un avis, publié tout de suite : alerte « avis ». */
export async function inscrireAlerteAvis(executeur: Executeur, reservationId: string, avisId: string): Promise<void> {
  await alerter(executeur, "avis", "alerte_avis", avisId, reservationId, { avisId });
}
