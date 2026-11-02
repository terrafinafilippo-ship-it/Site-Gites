// Le PAIEMENT d'une réservation du tunnel (Phase 3, lot 3) : l'ouvrir, le
// constater, rembourser quand la réservation ne peut pas être honorée.
//
// LE SERVEUR NE CROIT QUE LE PRESTATAIRE. Le navigateur dit « c'est payé » ;
// le site relit le paiement chez Stripe avant de confirmer quoi que ce soit.
// Deux chemins y mènent, et un seul compte :
//   - le RETOUR du client (page /reserver/confirmation), immédiat ;
//   - l'AVIS de Stripe (/api/stripe/webhook), qui arrive même si le client a
//     fermé sa page.
// `constaterPaiement` est donc IDEMPOTENT : la ligne `paiements` est
// verrouillée (FOR UPDATE), et un paiement déjà constaté n'est jamais traité
// deux fois.
//
// PAIEMENT ARRIVÉ APRÈS LA FIN DU BLOCAGE (D-21, cadrage du 13 octobre 2026) :
//   - nuits encore libres → réservation confirmée normalement ;
//   - nuits prises entre-temps → remboursement intégral automatique, la carte
//     n'est pas conservée, la réservation passe « annulée », et la page de
//     retour propose les autres gîtes libres au prix recalculé.
//
// COURRIELS (lot 4) : inscrits DANS la transaction qui confirme ou décide le
// remboursement (lib/courriels.ts), envoyés ensuite (lib/courriels-envoi.ts).
// Un constat répété n'inscrit rien de plus.
//
// SOLDE (Phase 4, lot 1, D-28) : le même constat sert au paiement du solde
// (prélèvement ou lien, lib/solde.ts). Il ne touche pas aux nuits ni au statut
// de la réservation, déjà confirmée : il inscrit le paiement reçu et sa
// facture. Un solde reçu pour une réservation qui n'est plus confirmée est
// remboursé, sans courriel au client (les propriétaires sont alertés) et sans
// oublier la carte, qui sert encore à la caution.
//
// MONTANTS EN CENTIMES ENTIERS.
import { timingSafeEqual } from "node:crypto";

import { and, desc, eq, inArray, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { paiements, reservations, textes_accord, type StatutPaiement } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { inscrireApresPaiement, inscrireFacture, inscrireProbleme, inscrireRemboursement } from "@/lib/courriels";
import { leverBlocage, vendreNuits } from "@/lib/disponibilites";
import type { Langue } from "@/lib/i18n/langues";
import type { ModeleAccord } from "@/lib/reglement";
import type { Executeur } from "@/lib/reservations";
import { prestataire, type EtatPaiement, type Prestataire } from "@/lib/stripe";

/** Mode de paiement inscrit sur la réservation (et repris par les factures). */
const MODE_PAIEMENT_CARTE = "Carte bancaire";

// ─── Texte d'accord ──────────────────────────────────────────────────────────

/** Version du texte d'accord pour la carte en vigueur à `jour` dans `langue`, ou `null`. */
export async function lireTexteAccord(
  executeur: Executeur,
  langue: Langue,
  jour: string,
): Promise<ModeleAccord | null> {
  const [ligne] = await executeur
    .select()
    .from(textes_accord)
    .where(
      and(eq(textes_accord.objet, "carte"), eq(textes_accord.langue, langue), lte(textes_accord.en_vigueur_depuis, jour)),
    )
    .orderBy(desc(textes_accord.en_vigueur_depuis))
    .limit(1);
  return ligne ? { id: ligne.id, langue, modele: ligne.modele, modeleSolde: ligne.modele_solde } : null;
}

// ─── Ouverture ───────────────────────────────────────────────────────────────

export interface PaiementOuvert {
  paiementId: string;
  clientSecret: string;
}

/**
 * Crée le paiement chez le prestataire pour une tentative qui vient d'être
 * enregistrée (dates bloquées), et sa ligne `paiements` « en_attente ».
 * Le montant est celui du devis du SERVEUR. LÈVE PaiementIndisponible si le
 * prestataire ne répond pas : l'appelant abandonne alors la tentative.
 */
export async function ouvrirPaiement(
  t: {
    reservationId: string;
    reference: string;
    montant: number;
    paiementIntegral: boolean;
    enregistrerCarte: boolean;
    client: { email: string; nom: string };
    description: string;
  },
  p: Prestataire = prestataire(),
): Promise<PaiementOuvert> {
  const type = t.paiementIntegral ? "total" : "acompte";
  const cree = await p.creerPaiement({
    reservationId: t.reservationId,
    reference: t.reference,
    montant: t.montant,
    type,
    enregistrerCarte: t.enregistrerCarte,
    client: t.client,
    description: t.description,
  });
  await getDb().transaction(async (tx) => {
    await tx.insert(paiements).values({
      reservation_id: t.reservationId,
      type,
      montant: numericDepuisCentimes(t.montant),
      statut: "en_attente",
      prestataire: p.nom,
      reference_externe: cree.id,
    });
    if (cree.customerId) {
      await tx
        .update(reservations)
        .set({ stripe_customer_id: cree.customerId })
        .where(eq(reservations.id, t.reservationId));
    }
  });
  return { paiementId: cree.id, clientSecret: cree.clientSecret };
}

// ─── Abandon ─────────────────────────────────────────────────────────────────

/**
 * Le client revient en arrière : ses paiements encore ouverts sont annulés
 * chez le prestataire AVANT que la tentative soit supprimée. Renvoie `false`
 * si l'un d'eux a déjà abouti ou est en traitement : la réservation est alors
 * engagée et ne se supprime pas (l'avis de Stripe la confirmera).
 */
export async function annulerPaiementsOuverts(
  executeur: Executeur,
  reservationId: string,
  p: Prestataire = prestataire(),
): Promise<boolean> {
  const ouverts = await executeur
    .select({ reference: paiements.reference_externe })
    .from(paiements)
    .where(and(eq(paiements.reservation_id, reservationId), inArray(paiements.statut, ["en_attente", "echoue"])));
  for (const { reference } of ouverts) {
    if (!reference) continue;
    const etat = await p.annulerPaiement(reference);
    if (etat.statut === "reussi" || etat.statut === "en_cours") return false;
  }
  return true;
}

// ─── Constat ─────────────────────────────────────────────────────────────────

export type IssuePaiement =
  /** Payé, nuits vendues : la réservation est confirmée. */
  | { issue: "CONFIRMEE"; reservationId: string }
  /** Solde payé (Phase 4) : inscrit, sa facture suit par courriel. */
  | { issue: "SOLDE_RECU"; reservationId: string }
  /** Pas encore payé (carte à saisir, authentification, refus) : rien n'est engagé. */
  | { issue: "EN_ATTENTE" | "EN_COURS" | "ECHOUE" | "ANNULE"; reservationId: string }
  /** Payé, mais la réservation ne peut pas être honorée : remboursé (ou à retenter). */
  | { issue: "REMBOURSEE"; reservationId: string; remboursementFait: boolean }
  /** Paiement inconnu du site. */
  | { issue: "INCONNU" };

class ARembourser extends Error {
  constructor(readonly motif: string) {
    super(motif);
  }
}

/** Début du motif d'un paiement arrivé sur des dates reprises par un autre client. */
const MOTIF_DATES_PRISES = "paiement arrivé après la fin du blocage";

const STATUT_EN_BASE: Record<Exclude<EtatPaiement["statut"], "reussi">, StatutPaiement> = {
  en_attente: "en_attente",
  en_cours: "en_attente",
  echoue: "echoue",
  annule: "annule",
};

const ISSUE_EN_ATTENTE = {
  en_attente: "EN_ATTENTE",
  en_cours: "EN_COURS",
  echoue: "ECHOUE",
  annule: "ANNULE",
} as const;

/**
 * Constate l'état d'un paiement et en tire les conséquences, une seule fois.
 * Appelée par la page de retour et par l'avis de Stripe, dans n'importe quel
 * ordre, autant de fois qu'on veut.
 */
export async function constaterPaiement(paiementId: string, p: Prestataire = prestataire()): Promise<IssuePaiement> {
  const etat = await p.lirePaiement(paiementId);
  const db = getDb();

  let issue: IssuePaiement;
  let confirmeeIci = false;
  try {
    issue = await db.transaction(async (tx) => {
      const [ligne] = await tx
        .select()
        .from(paiements)
        .where(eq(paiements.reference_externe, paiementId))
        .for("update");
      if (!ligne) {
        // Prélèvement du solde dont l'avis de Stripe arrive avant que les
        // tâches aient inscrit sa référence (lib/solde.ts) : à reprendre (la
        // route de l'avis répond 500, Stripe le renverra), jamais remboursé.
        if (etat.statut === "reussi" && etat.typePaiement === "solde" && etat.reservationId) {
          throw new Error(`solde ${paiementId} pas encore inscrit par les tâches : à reprendre`);
        }
        if (etat.statut === "reussi") throw new ARembourser("paiement reçu pour une réservation inconnue du site");
        return { issue: "INCONNU" } as const;
      }
      const reservationId = ligne.reservation_id;
      if (ligne.type === "solde") return constaterSolde(tx, ligne, etat);
      if (ligne.statut === "reussi") return { issue: "CONFIRMEE", reservationId } as const;
      if (ligne.statut === "rembourse") return { issue: "REMBOURSEE", reservationId, remboursementFait: true } as const;
      if (ligne.statut === "a_rembourser") throw new ARembourser(ligne.motif_remboursement ?? "remboursement à retenter");

      if (etat.statut !== "reussi") {
        const statut = STATUT_EN_BASE[etat.statut];
        if (statut !== ligne.statut) await tx.update(paiements).set({ statut }).where(eq(paiements.id, ligne.id));
        return { issue: ISSUE_EN_ATTENTE[etat.statut], reservationId } as const;
      }

      // Payé. Le montant reçu doit être celui demandé, au centime.
      const attendu = centimesDepuisNumeric(ligne.montant);
      if (etat.montant !== attendu || etat.devise !== "eur") {
        throw new ARembourser(`montant reçu ${etat.montant} ${etat.devise}, attendu ${attendu} eur`);
      }
      const [resa] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
      if (!resa || resa.statut !== "en_attente_paiement") {
        throw new ARembourser(`réservation au statut « ${resa?.statut ?? "absente"} » au moment du paiement`);
      }

      // Les nuits sont-elles toujours à elle ? Sinon, l'exception annule toute
      // la transaction, y compris les nuits libres que vendreNuits vient d'écrire.
      const vente = await vendreNuits(tx, {
        giteId: resa.gite_id,
        reservationId,
        arrivee: resa.date_arrivee,
        depart: resa.date_depart,
      });
      if (!vente.ok) {
        throw new ARembourser(
          `${MOTIF_DATES_PRISES}, nuits reprises par une autre réservation (${vente.nuitsPrises.join(", ")})`,
        );
      }

      const carte = resa.moyen_caution === "carte";
      await tx
        .update(reservations)
        .set({
          statut: "confirmee",
          mode_paiement: MODE_PAIEMENT_CARTE,
          reference_transaction: paiementId,
          date_paiement_acompte: new Date(),
          stripe_customer_id: carte ? etat.customerId : null,
          stripe_payment_method_id: carte ? etat.paymentMethodId : null,
        })
        .where(eq(reservations.id, reservationId));
      await tx
        .update(paiements)
        .set({ statut: "reussi", date_paiement: new Date() })
        .where(eq(paiements.id, ligne.id));
      await inscrireApresPaiement(tx, reservationId);
      confirmeeIci = true;
      return { issue: "CONFIRMEE", reservationId } as const;
    });
  } catch (erreur) {
    if (!(erreur instanceof ARembourser)) throw erreur;
    return rembourser(paiementId, etat, erreur.motif, p);
  }

  if (confirmeeIci) console.info(`[paiement] réservation confirmée (${paiementId})`);
  return issue;
}

type LignePaiement = typeof paiements.$inferSelect;

/**
 * Constat d'un paiement du SOLDE (ligne verrouillée par l'appelant). Payé :
 * inscrit, et sa facture. La réservation doit être confirmée (ou terminée) ;
 * sinon remboursement intégral.
 */
async function constaterSolde(tx: Executeur, ligne: LignePaiement, etat: EtatPaiement): Promise<IssuePaiement> {
  const reservationId = ligne.reservation_id;
  if (ligne.statut === "reussi") return { issue: "SOLDE_RECU", reservationId };
  if (ligne.statut === "rembourse") return { issue: "REMBOURSEE", reservationId, remboursementFait: true };
  if (ligne.statut === "a_rembourser") throw new ARembourser(ligne.motif_remboursement ?? "remboursement à retenter");

  if (etat.statut !== "reussi") {
    const statut = STATUT_EN_BASE[etat.statut];
    if (statut !== ligne.statut) await tx.update(paiements).set({ statut }).where(eq(paiements.id, ligne.id));
    return { issue: ISSUE_EN_ATTENTE[etat.statut], reservationId };
  }

  const attendu = centimesDepuisNumeric(ligne.montant);
  if (etat.montant !== attendu || etat.devise !== "eur") {
    throw new ARembourser(`solde : montant reçu ${etat.montant} ${etat.devise}, attendu ${attendu} eur`);
  }
  const [resa] = await tx
    .select({ statut: reservations.statut })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .for("update");
  if (!resa || (resa.statut !== "confirmee" && resa.statut !== "terminee")) {
    throw new ARembourser(`solde reçu pour une réservation au statut « ${resa?.statut ?? "absente"} »`);
  }
  await tx.update(paiements).set({ statut: "reussi", date_paiement: new Date() }).where(eq(paiements.id, ligne.id));
  await inscrireFacture(tx, reservationId, "solde");
  console.info(`[paiement] solde reçu (${etat.id})`);
  return { issue: "SOLDE_RECU", reservationId };
}

/**
 * Remboursement intégral d'un paiement reçu qui ne peut pas être honoré.
 * L'intention est écrite AVANT d'appeler le prestataire ('a_rembourser') ; le
 * prestataire est appelé avec une clé d'idempotence ; une panne entre les deux
 * se rattrape au constat suivant.
 */
async function rembourser(
  paiementId: string,
  etat: EtatPaiement,
  motif: string,
  p: Prestataire,
): Promise<IssuePaiement> {
  const db = getDb();
  console.error(`[paiement] PROBLÈME À TRAITER — remboursement intégral de ${paiementId} : ${motif}`);

  let solde = false;
  const reservationId = await db.transaction(async (tx) => {
    const [ligne] = await tx
      .select()
      .from(paiements)
      .where(eq(paiements.reference_externe, paiementId))
      .for("update");
    const courriel = {
      paiementId,
      motif,
      datesPrises: motif.startsWith(MOTIF_DATES_PRISES),
      montant: etat.montant,
    };
    if (!ligne) {
      // Paiement inconnu du site : alerte aux propriétaires seulement (une par paiement).
      await inscrireRemboursement(tx, { reservationId: null, ...courriel });
      return null;
    }
    solde = ligne.type === "solde";
    if (solde && ligne.statut !== "a_rembourser" && ligne.statut !== "rembourse") {
      // Solde : la réservation n'est pas touchée (elle n'était déjà plus
      // confirmée) ; les propriétaires appellent le client.
      await tx
        .update(paiements)
        .set({ statut: "a_rembourser", motif_remboursement: motif })
        .where(eq(paiements.id, ligne.id));
      await inscrireProbleme(tx, "remboursement", paiementId, ligne.reservation_id, courriel);
    } else if (ligne.statut !== "a_rembourser" && ligne.statut !== "rembourse") {
      await tx
        .update(paiements)
        .set({ statut: "a_rembourser", motif_remboursement: motif })
        .where(eq(paiements.id, ligne.id));
      // La réservation n'est pas honorée : annulée, et ses nuits encore bloquées libérées.
      await tx
        .update(reservations)
        .set({ statut: "annulee", stripe_payment_method_id: null })
        .where(and(eq(reservations.id, ligne.reservation_id), eq(reservations.statut, "en_attente_paiement")));
      await leverBlocage(tx, ligne.reservation_id);
      await inscrireRemboursement(tx, { reservationId: ligne.reservation_id, ...courriel });
    }
    return ligne.reservation_id;
  });

  try {
    const r = await p.rembourser(paiementId, motif);
    if (reservationId) {
      await db
        .update(paiements)
        .set({ statut: "rembourse", reference_remboursement: r.id, date_remboursement: new Date() })
        .where(eq(paiements.reference_externe, paiementId));
    }
  } catch (erreur) {
    console.error(
      `[paiement] REMBOURSEMENT À RETENTER pour ${paiementId} :`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return reservationId
      ? { issue: "REMBOURSEE", reservationId, remboursementFait: false }
      : { issue: "INCONNU" };
  }

  // La carte n'a plus de raison d'être conservée. Un échec ici ne coûte rien
  // au client (aucune opération ne sera faite dessus) : journalisé seulement.
  // Sauf pour un solde : la carte enregistrée sert encore à la caution.
  if (!solde && etat.paymentMethodId && etat.customerId) {
    try {
      await p.oublierCarte(etat.paymentMethodId);
    } catch (erreur) {
      console.error(
        `[paiement] carte non détachée après remboursement (${paiementId}) :`,
        erreur instanceof Error ? erreur.message : erreur,
      );
    }
  }
  return reservationId ? { issue: "REMBOURSEE", reservationId, remboursementFait: true } : { issue: "INCONNU" };
}

// ─── Retour du client ────────────────────────────────────────────────────────

/** Comparaison en temps constant du secret de paiement présenté par le navigateur. */
function memeSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Retour du client après paiement : seul le navigateur qui a payé connaît le
 * secret du paiement (Stripe l'ajoute à l'adresse de retour). Sans lui, la
 * page ne dit rien : `null`. L'état chez le prestataire accompagne l'issue :
 * pour un paiement que le site ne connaît plus (tentative abandonnée), il dit
 * seulement s'il y a eu de l'argent.
 */
export async function constaterRetour(
  paiementId: string,
  secret: string,
  p: Prestataire = prestataire(),
): Promise<{ issue: IssuePaiement; statut: EtatPaiement["statut"]; montant: number } | null> {
  const etat = await p.lirePaiement(paiementId);
  if (!etat.clientSecret || !memeSecret(etat.clientSecret, secret)) return null;
  return { issue: await constaterPaiement(paiementId, p), statut: etat.statut, montant: etat.montant };
}

/** Le paiement de la réservation tel qu'enregistré (montant en centimes), pour la page de retour. */
export async function lirePaiementEnregistre(
  paiementId: string,
): Promise<{ type: string; montant: number; datePaiement: Date | null } | null> {
  const [ligne] = await getDb()
    .select({ type: paiements.type, montant: paiements.montant, date: paiements.date_paiement })
    .from(paiements)
    .where(eq(paiements.reference_externe, paiementId));
  return ligne ? { type: ligne.type, montant: centimesDepuisNumeric(ligne.montant), datePaiement: ligne.date } : null;
}
