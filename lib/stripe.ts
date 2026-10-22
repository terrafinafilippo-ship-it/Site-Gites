// Le PRESTATAIRE DE PAIEMENT, vu du site : créer un paiement, le lire,
// l'annuler, le rembourser, oublier une carte, lire un avis de Stripe.
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
  type: "acompte" | "total";
  /** Caution par carte : la carte est enregistrée pour la caution et, si choisi, le solde (D-16). */
  enregistrerCarte: boolean;
  client: { email: string; nom: string };
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
 *   - 'annule'     : annulé, ne peut plus aboutir.
 */
export type StatutPrestataire = "en_attente" | "en_cours" | "reussi" | "echoue" | "annule";

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
  clientSecret: string | null;
  /** Code du dernier refus (« card_declined »…), pour le journal. */
  dernierRefus: string | null;
}

/** Avis de Stripe reçu sur /api/stripe/webhook, signature vérifiée. */
export interface AvisPaiement {
  evenement: string;
  paiementId: string;
}

export interface Prestataire {
  readonly nom: string;
  creerPaiement(demande: DemandePaiement): Promise<PaiementCree>;
  lirePaiement(id: string): Promise<EtatPaiement>;
  /** Annule si possible ; renvoie l'état obtenu (« reussi » si l'argent était déjà reçu). */
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
    default:
      // requires_confirmation, requires_action ; requires_capture n'arrive pas
      // (encaissement immédiat) et serait traité comme une attente.
      return "en_attente";
  }
}

function idDe(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
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
    clientSecret: pi.client_secret,
    dernierRefus: pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? null,
  };
}

const EVENEMENTS_SUIVIS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
]);

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
      // est rattachée. Clé d'idempotence = réservation : un nouvel essai réseau
      // ne crée ni un second client ni un second paiement.
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
        { idempotencyKey: `paiement-${d.reservationId}` },
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

  async lirePaiement(id: string): Promise<EtatPaiement> {
    return etatDe(await this.stripe().paymentIntents.retrieve(id));
  }

  async annulerPaiement(id: string): Promise<EtatPaiement> {
    const stripe = this.stripe();
    const pi = await stripe.paymentIntents.retrieve(id);
    const etat = etatDe(pi);
    // Déjà reçu, en traitement ou déjà annulé : rien à annuler, on dit où il en est.
    if (etat.statut === "reussi" || etat.statut === "en_cours" || etat.statut === "annule") return etat;
    try {
      return etatDe(await stripe.paymentIntents.cancel(id, { cancellation_reason: "abandoned" }));
    } catch (erreur) {
      // Le paiement a pu aboutir entre la lecture et l'annulation : l'état relu fait foi.
      const relu = etatDe(await stripe.paymentIntents.retrieve(id));
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
    await this.stripe().paymentMethods.detach(paymentMethodId);
  }

  lireAvis(corps: string, signature: string | null): AvisPaiement | null {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!secret) throw new PaiementIndisponible("STRIPE_WEBHOOK_SECRET absente : avis de Stripe refusé");
    if (!signature) throw new Error("avis sans signature");
    const evenement = this.stripe().webhooks.constructEvent(corps, signature, secret);
    if (!EVENEMENTS_SUIVIS.has(evenement.type)) return null;
    const objet = evenement.data.object as { id?: unknown; object?: unknown };
    if (objet.object !== "payment_intent" || typeof objet.id !== "string") return null;
    return { evenement: evenement.type, paiementId: objet.id };
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
