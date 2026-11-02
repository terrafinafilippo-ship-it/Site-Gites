// Le PRESTATAIRE DE PAIEMENT, vu du site : créer un paiement, prélever le
// solde sur la carte enregistrée (Phase 4), le lire, l'annuler, le rembourser,
// oublier une carte, lire un avis de Stripe ; et pour la caution (Phase 4,
// lot 2, D-16) : bloquer le montant sur la carte enregistrée (préautorisation
// à capture manuelle), la lever (annulation), enregistrer une carte sans
// paiement (art. 6.6 du contrat).
//
// Tout le reste du code passe par l'interface `Prestataire` : la logique de
// réservation (lib/paiement.ts) ne connaît pas Stripe, et le contrôle
// scripts/verifier-paiement.ts la rejoue avec un prestataire simulé, sans
// réseau ni clé.
//
// MODE TEST SEULEMENT (Phase 3) : une clé réelle (sk_live_…) est REFUSÉE. Le
// passage aux clés réelles est une décision de mise en ligne (Phase 6), pas un
// changement de variable d'environnement.
//
// Variables (noms dans .env.example ; valeurs dans .env.local, jamais dans git) :
//   STRIPE_SECRET_KEY                    [SECRET] sk_test_…
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   [PUBLIC] pk_test_… (lue par le navigateur)
//   STRIPE_WEBHOOK_SECRET                [SECRET] whsec_… (avis de Stripe)
//
// MONTANTS : Stripe compte en centimes entiers, comme le site. Aucune conversion.
import Stripe from "stripe";

/** Le paiement ne peut pas être créé : clé absente ou refusée, Stripe injoignable. */
export class PaiementIndisponible extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PaiementIndisponible";
  }
}

export interface DemandePaiement {
  reservationId: string;
  reference: string;
  /** Centimes. */
  montant: number;
  type: "acompte" | "total" | "solde";
  /** Caution par carte : la carte est enregistrée pour la caution et, si choisi, le solde (D-16). */
  enregistrerCarte: boolean;
  client: { email: string; nom: string };
  description: string;
  /**
   * Solde payé par le lien (Phase 4) : rang du paiement du solde de la
   * réservation (1, puis 2 si le premier a été annulé…), dans la clé
   * d'idempotence. Sans objet pour l'acompte et le total.
   */
  essai?: number;
}

/** Préautorisation de la caution sur la carte enregistrée, sans le client (D-16). */
export interface DemandeCaution {
  reservationId: string;
  reference: string;
  /** Centimes. */
  montant: number;
  customerId: string;
  paymentMethodId: string;
  description: string;
}

/** Enregistrement d'une carte sans paiement (caution non constituée à l'arrivée, art. 6.6). */
export interface DemandeEnregistrement {
  reservationId: string;
  reference: string;
  /** Client Stripe déjà créé pour la réservation, sinon un nouveau. */
  customerId: string | null;
  client: { email: string; nom: string };
}

/** Où en est un enregistrement de carte (SetupIntent). */
export interface EtatEnregistrement {
  id: string;
  statut: "en_attente" | "en_cours" | "reussi" | "echoue" | "annule";
  customerId: string | null;
  paymentMethodId: string | null;
  reservationId: string | null;
  clientSecret: string | null;
}

/** Prélèvement du solde sur la carte enregistrée, sans le client (D-16, D-28). */
export interface DemandePrelevement {
  reservationId: string;
  reference: string;
  /** Centimes. */
  montant: number;
  customerId: string;
  paymentMethodId: string;
  email: string;
  description: string;
}

export interface PaiementCree {
  id: string;
  clientSecret: string;
  customerId: string | null;
}

/**
 * État d'un paiement chez le prestataire :
 *   - 'en_attente' : carte à saisir, à confirmer ou authentification en cours ;
 *   - 'en_cours'   : la banque traite ;
 *   - 'reussi'     : argent reçu ;
 *   - 'echoue'     : dernier essai refusé (le client peut réessayer) ;
 *   - 'annule'     : annulé, ne peut plus aboutir ;
 *   - 'bloque'     : caution seulement, montant bloqué sur la carte, à
 *                    encaisser ou à lever (préautorisation, `requires_capture`).
 */
export type StatutPrestataire = "en_attente" | "en_cours" | "reussi" | "echoue" | "annule" | "bloque";

export interface EtatPaiement {
  id: string;
  statut: StatutPrestataire;
  /** Centimes. */
  montant: number;
  devise: string;
  customerId: string | null;
  paymentMethodId: string | null;
  /** Réservation inscrite à la création (métadonnée). */
  reservationId: string | null;
  /** Type inscrit à la création (métadonnée) : « acompte », « total » ou « solde ». */
  typePaiement: string | null;
  clientSecret: string | null;
  /** Code du dernier refus (« card_declined »…), pour le journal. */
  dernierRefus: string | null;
  /** Caution bloquée : date limite de la banque pour l'encaisser (`capture_before`). */
  expireLe: Date | null;
  /** Centimes réellement encaissés (caution retenue en partie : le montant retenu). */
  montantEncaisse: number;
}

/** Avis de Stripe reçu sur /api/stripe/webhook, signature vérifiée. */
export type AvisPaiement =
  | { genre: "paiement"; evenement: string; paiementId: string }
  /** Carte enregistrée sans paiement (art. 6.6). */
  | { genre: "enregistrement"; evenement: string; enregistrementId: string }
  /** Paiement contesté par le client auprès de sa banque. */
  | {
      genre: "contestation";
      evenement: string;
      contestationId: string;
      paiementId: string | null;
      /** Centimes. */
      montant: number;
      motif: string;
    };

export interface Prestataire {
  readonly nom: string;
  creerPaiement(demande: DemandePaiement): Promise<PaiementCree>;
  /**
   * Prélève le solde sur la carte enregistrée, tout de suite. Renvoie l'état
   * obtenu, refus de la banque compris (« echoue ») ; LÈVE si le prestataire
   * ne répond pas. Idempotent : un nouvel appel pour la même réservation
   * renvoie le même paiement, il ne prélève jamais deux fois.
   */
  prelever(demande: DemandePrelevement): Promise<EtatPaiement>;
  /**
   * Bloque la caution sur la carte enregistrée (préautorisation), tout de
   * suite, sans le client. Renvoie l'état obtenu : « bloque », ou refus de la
   * banque (« echoue », authentification exigée comprise) ; LÈVE si le
   * prestataire ne répond pas. Idempotent : une préautorisation par réservation.
   */
  bloquerCaution(demande: DemandeCaution): Promise<EtatPaiement>;
  /** Enregistre une carte sans paiement : le client la saisit sur sa page. Idempotent par réservation. */
  creerEnregistrement(demande: DemandeEnregistrement): Promise<EtatEnregistrement>;
  lireEnregistrement(id: string): Promise<EtatEnregistrement>;
  lirePaiement(id: string): Promise<EtatPaiement>;
  /**
   * Annule si possible ; renvoie l'état obtenu (« reussi » si l'argent était
   * déjà reçu). Une caution bloquée est LEVÉE : rien n'est débité.
   */
  annulerPaiement(id: string): Promise<EtatPaiement>;
  /** Remboursement INTÉGRAL. Idempotent : un second appel ne rembourse pas deux fois. */
  rembourser(id: string, motif: string): Promise<{ id: string }>;
  /** La carte n'est plus conservée (réservation non honorée). */
  oublierCarte(paymentMethodId: string): Promise<void>;
  /** Avis signé de Stripe, ou `null` s'il ne concerne pas un paiement. LÈVE si la signature est fausse. */
  lireAvis(corps: string, signature: string | null): AvisPaiement | null;
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

function cleSecrete(): string {
  const cle = process.env.STRIPE_SECRET_KEY ?? "";
  if (!cle) throw new PaiementIndisponible("STRIPE_SECRET_KEY absente (.env.local)");
  if (!cle.startsWith("sk_test_") && !cle.startsWith("rk_test_")) {
    throw new PaiementIndisponible(
      "clé Stripe refusée : seule une clé de TEST (sk_test_…) est acceptée tant que le site n'est pas mis en ligne",
    );
  }
  return cle;
}

function statutStripe(pi: Stripe.PaymentIntent): StatutPrestataire {
  switch (pi.status) {
    case "succeeded":
      return "reussi";
    case "processing":
      return "en_cours";
    case "canceled":
      return "annule";
    case "requires_payment_method":
      return pi.last_payment_error ? "echoue" : "en_attente";
    case "requires_capture":
      // Préautorisation de la caution : seul paiement à capture manuelle.
      return "bloque";
    default:
      // requires_confirmation, requires_action.
      return "en_attente";
  }
}

function idDe(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Date limite d'encaissement d'une préautorisation, lue sur la charge (jamais recalculée, D-16). */
function expirationDe(pi: Stripe.PaymentIntent): Date | null {
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const avant = charge.payment_method_details?.card?.capture_before;
  return typeof avant === "number" ? new Date(avant * 1000) : null;
}

function etatDe(pi: Stripe.PaymentIntent): EtatPaiement {
  return {
    id: pi.id,
    statut: statutStripe(pi),
    montant: pi.amount,
    devise: pi.currency,
    customerId: idDe(pi.customer),
    paymentMethodId: idDe(pi.payment_method),
    reservationId: pi.metadata?.reservation_id ?? null,
    typePaiement: pi.metadata?.type ?? null,
    clientSecret: pi.client_secret,
    dernierRefus: pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? null,
    expireLe: expirationDe(pi),
    montantEncaisse: pi.amount_received ?? 0,
  };
}

function etatEnregistrementDe(si: Stripe.SetupIntent): EtatEnregistrement {
  const statut: EtatEnregistrement["statut"] =
    si.status === "succeeded"
      ? "reussi"
      : si.status === "processing"
        ? "en_cours"
        : si.status === "canceled"
          ? "annule"
          : si.status === "requires_payment_method" && si.last_setup_error
            ? "echoue"
            : "en_attente";
  return {
    id: si.id,
    statut,
    customerId: idDe(si.customer),
    paymentMethodId: idDe(si.payment_method),
    reservationId: si.metadata?.reservation_id ?? null,
    clientSecret: si.client_secret,
  };
}

/** La charge est lue avec le paiement : elle porte la date limite d'une préautorisation. */
const AVEC_CHARGE = ["latest_charge"];

const EVENEMENTS_SUIVIS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
  // Caution bloquée (préautorisation confirmée, par les tâches ou par le client).
  "payment_intent.amount_capturable_updated",
]);
const EVENEMENTS_ENREGISTREMENT = new Set(["setup_intent.succeeded", "setup_intent.setup_failed"]);

class PrestataireStripe implements Prestataire {
  readonly nom = "stripe";
  private client: Stripe | null = null;

  private stripe(): Stripe {
    if (!this.client) this.client = new Stripe(cleSecrete(), { maxNetworkRetries: 2 });
    return this.client;
  }

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    const stripe = this.stripe();
    try {
      // Un Customer seulement si la carte est conservée : c'est à lui qu'elle
      // est rattachée. Clé d'idempotence = réservation (et, pour le solde,
      // son rang) : un nouvel essai réseau ne crée ni un second client ni un
      // second paiement. Une clé PAR SORTE de paiement : sinon Stripe
      // renverrait l'acompte quand on lui demande le solde.
      const customer = d.enregistrerCarte
        ? await stripe.customers.create(
            { email: d.client.email, name: d.client.nom, metadata: { reservation_id: d.reservationId, reference: d.reference } },
            { idempotencyKey: `client-${d.reservationId}` },
          )
        : null;
      const pi = await stripe.paymentIntents.create(
        {
          amount: d.montant,
          currency: "eur",
          payment_method_types: ["card"],
          customer: customer?.id,
          setup_future_usage: d.enregistrerCarte ? "off_session" : undefined,
          description: d.description,
          receipt_email: d.client.email,
          metadata: { reservation_id: d.reservationId, reference: d.reference, type: d.type },
        },
        {
          idempotencyKey:
            d.type === "solde" ? `solde-${d.reservationId}-${d.essai ?? 1}` : `paiement-${d.reservationId}`,
        },
      );
      if (!pi.client_secret) throw new Error(`paiement ${pi.id} sans client_secret`);
      return { id: pi.id, clientSecret: pi.client_secret, customerId: customer?.id ?? null };
    } catch (erreur) {
      throw new PaiementIndisponible(
        `création du paiement Stripe (${d.reference}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        { cause: erreur },
      );
    }
  }

  async prelever(d: DemandePrelevement): Promise<EtatPaiement> {
    const stripe = this.stripe();
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: d.montant,
          currency: "eur",
          customer: d.customerId,
          payment_method: d.paymentMethodId,
          payment_method_types: ["card"],
          // Le client n'est pas là : sa banque ne peut pas lui demander de
          // s'authentifier. Si elle l'exige, le prélèvement est refusé et le
          // client reçoit le lien (lib/solde.ts) : le même paiement se règle
          // alors en ligne, avec authentification.
          off_session: true,
          confirm: true,
          description: d.description,
          receipt_email: d.email,
          metadata: { reservation_id: d.reservationId, reference: d.reference, type: "solde" },
        },
        // Un seul prélèvement par réservation : un nouvel appel (panne entre
        // la réponse et l'écriture en base) reçoit la même réponse.
        { idempotencyKey: `prelevement-${d.reservationId}` },
      );
      return etatDe(pi);
    } catch (erreur) {
      // Refus de la banque (carte refusée, authentification exigée) : Stripe
      // renvoie le paiement créé, dans l'état « à régler ». Ce n'est pas une panne.
      if (erreur instanceof Stripe.errors.StripeError && erreur.payment_intent) {
        return etatDe(erreur.payment_intent);
      }
      throw new PaiementIndisponible(
        `prélèvement du solde (${d.reference}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        { cause: erreur },
      );
    }
  }

  async bloquerCaution(d: DemandeCaution): Promise<EtatPaiement> {
    const stripe = this.stripe();
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: d.montant,
          currency: "eur",
          customer: d.customerId,
          payment_method: d.paymentMethodId,
          payment_method_types: ["card"],
          // Préautorisation : les fonds sont bloqués, rien n'est débité tant
          // que la caution n'est pas retenue (D-16, art. 6.3 du contrat).
          capture_method: "manual",
          // Le client n'est pas là. Si sa banque exige qu'il s'authentifie, la
          // préautorisation est refusée et il la valide sur sa page (lib/caution.ts).
          off_session: true,
          confirm: true,
          description: d.description,
          metadata: { reservation_id: d.reservationId, reference: d.reference, type: "caution" },
          expand: AVEC_CHARGE,
        },
        // Une seule préautorisation par réservation : un nouvel appel reçoit la même réponse.
        { idempotencyKey: `caution-${d.reservationId}` },
      );
      return etatDe(pi);
    } catch (erreur) {
      // Refus de la banque ou authentification exigée : Stripe renvoie la
      // préautorisation créée, « à régler ». Ce n'est pas une panne.
      if (erreur instanceof Stripe.errors.StripeError && erreur.payment_intent) {
        return etatDe(erreur.payment_intent);
      }
      throw new PaiementIndisponible(
        `préautorisation de la caution (${d.reference}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        { cause: erreur },
      );
    }
  }

  async creerEnregistrement(d: DemandeEnregistrement): Promise<EtatEnregistrement> {
    const stripe = this.stripe();
    try {
      const customerId =
        d.customerId ??
        (
          await stripe.customers.create(
            { email: d.client.email, name: d.client.nom, metadata: { reservation_id: d.reservationId, reference: d.reference } },
            // Clé propre à la caution : celle de l'acompte (client-…) a pu servir avec d'autres paramètres.
            { idempotencyKey: `client-caution-${d.reservationId}` },
          )
        ).id;
      const si = await stripe.setupIntents.create(
        {
          customer: customerId,
          payment_method_types: ["card"],
          usage: "off_session",
          description: `Caution ${d.reference}`,
          metadata: { reservation_id: d.reservationId, reference: d.reference, type: "caution" },
        },
        { idempotencyKey: `enregistrement-${d.reservationId}` },
      );
      return etatEnregistrementDe(si);
    } catch (erreur) {
      throw new PaiementIndisponible(
        `enregistrement de carte (${d.reference}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        { cause: erreur },
      );
    }
  }

  async lireEnregistrement(id: string): Promise<EtatEnregistrement> {
    return etatEnregistrementDe(await this.stripe().setupIntents.retrieve(id));
  }

  async lirePaiement(id: string): Promise<EtatPaiement> {
    return etatDe(await this.stripe().paymentIntents.retrieve(id, { expand: AVEC_CHARGE }));
  }

  async annulerPaiement(id: string): Promise<EtatPaiement> {
    const stripe = this.stripe();
    const etat = await this.lirePaiement(id);
    // Déjà reçu, en traitement ou déjà annulé : rien à annuler, on dit où il en est.
    if (etat.statut === "reussi" || etat.statut === "en_cours" || etat.statut === "annule") return etat;
    try {
      // Une caution bloquée est levée : le client ne paie rien (D-16).
      return etatDe(
        await stripe.paymentIntents.cancel(id, {
          cancellation_reason: etat.statut === "bloque" ? "requested_by_customer" : "abandoned",
          expand: AVEC_CHARGE,
        }),
      );
    } catch (erreur) {
      // Le paiement a pu aboutir entre la lecture et l'annulation : l'état relu fait foi.
      const relu = await this.lirePaiement(id);
      if (relu.statut === "annule" || relu.statut === "reussi" || relu.statut === "en_cours") return relu;
      throw erreur;
    }
  }

  async rembourser(id: string, motif: string): Promise<{ id: string }> {
    const remboursement = await this.stripe().refunds.create(
      { payment_intent: id, reason: "requested_by_customer", metadata: { motif } },
      { idempotencyKey: `remboursement-${id}` },
    );
    return { id: remboursement.id };
  }

  async oublierCarte(paymentMethodId: string): Promise<void> {
    try {
      await this.stripe().paymentMethods.detach(paymentMethodId);
    } catch (erreur) {
      // Déjà détachée (essai précédent dont la réponse s'est perdue) : le but est atteint.
      if (erreur instanceof Stripe.errors.StripeInvalidRequestError && /not attached/i.test(erreur.message)) return;
      throw erreur;
    }
  }

  lireAvis(corps: string, signature: string | null): AvisPaiement | null {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!secret) throw new PaiementIndisponible("STRIPE_WEBHOOK_SECRET absente : avis de Stripe refusé");
    if (!signature) throw new Error("avis sans signature");
    const evenement = this.stripe().webhooks.constructEvent(corps, signature, secret);
    if (evenement.type === "charge.dispute.created") {
      const litige = evenement.data.object;
      return {
        genre: "contestation",
        evenement: evenement.type,
        contestationId: litige.id,
        paiementId: idDe(litige.payment_intent),
        montant: litige.amount,
        motif: litige.reason,
      };
    }
    const objet = evenement.data.object as { id?: unknown; object?: unknown };
    if (typeof objet.id !== "string") return null;
    if (EVENEMENTS_ENREGISTREMENT.has(evenement.type) && objet.object === "setup_intent") {
      return { genre: "enregistrement", evenement: evenement.type, enregistrementId: objet.id };
    }
    if (!EVENEMENTS_SUIVIS.has(evenement.type) || objet.object !== "payment_intent") return null;
    return { genre: "paiement", evenement: evenement.type, paiementId: objet.id };
  }
}

/**
 * Le paiement est-il configuré (clés de TEST présentes) ? Vérifié à
 * l'ouverture du tunnel : sans paiement possible, le tunnel ne s'ouvre pas,
 * plutôt que de laisser le client tout saisir pour échouer à l'étape 4.
 * La clé publique est lue ici, au moment de la requête, et passée au
 * navigateur par la page (nom de variable calculé : Next.js n'inline pas la
 * valeur au build).
 */
export function configurationPaiement(): { ok: true; clePublique: string } | { ok: false; raison: string } {
  try {
    cleSecrete();
  } catch (erreur) {
    return { ok: false, raison: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const nom = ["NEXT_PUBLIC", "STRIPE_PUBLISHABLE_KEY"].join("_");
  const clePublique = process.env[nom] ?? "";
  if (!clePublique) return { ok: false, raison: `${nom} absente (.env.local)` };
  if (!clePublique.startsWith("pk_test_")) {
    return { ok: false, raison: "clé publique Stripe refusée : seule une clé de TEST (pk_test_…) est acceptée" };
  }
  return { ok: true, clePublique };
}

// ─── Prestataire courant ─────────────────────────────────────────────────────

let courant: Prestataire | null = null;

/** Le prestataire du site (Stripe). Les clés ne sont lues qu'au premier appel réel. */
export function prestataire(): Prestataire {
  if (!courant) courant = new PrestataireStripe();
  return courant;
}

/** POUR LES CONTRÔLES SEULEMENT (scripts/verifier-paiement.ts) : prestataire simulé. */
export function remplacerPrestataire(p: Prestataire): void {
  courant = p;
}
