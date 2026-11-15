// Outils communs aux contrôles du lot 3 de la Phase 4 (verifier-virement.ts,
// verifier-abandons.ts) : un prestataire de paiement et une messagerie
// SIMULÉS, le temps de Paris, une réservation payée en quelques lignes.
// Les contrôles plus anciens gardent leurs propres simulations.
import { ajouterJours, aujourdhuiParis, heureParis, jourSemaineIso } from "../lib/dates-civiles";
import type { Coordonnees } from "../lib/coordonnees";
import type { Envoi, Message, Messagerie } from "../lib/messagerie";
import { constaterPaiement, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import { RemboursementRefuse } from "../lib/stripe";
import type {
  AvisPaiement,
  DemandePaiement,
  EtatEnregistrement,
  EtatPaiement,
  PaiementCree,
  Prestataire,
} from "../lib/stripe";
import { enregistrerTentative, type ResultatTentative } from "../lib/tunnel";

export class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();
  readonly cartesOubliees: string[] = [];
  readonly clientsOublies: string[] = [];
  annulations = 0;
  /** Vrai : la suppression d'une fiche client échoue (prestataire injoignable). */
  panneClient = false;

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    this.n += 1;
    const id = `pi_lot3_${this.n}_${Date.now()}`;
    const customerId = d.enregistrerCarte ? `cus_lot3_${this.n}_${Date.now()}` : null;
    this.paiements.set(id, {
      id, statut: "en_attente", montant: d.montant, devise: "eur", customerId, paymentMethodId: null,
      reservationId: d.reservationId, typePaiement: d.type, clientSecret: `${id}_secret_ok`,
      dernierRefus: null, expireLe: null, montantEncaisse: 0,
    });
    return { id, clientSecret: `${id}_secret_ok`, customerId };
  }
  async lirePaiement(id: string): Promise<EtatPaiement> {
    const etat = this.paiements.get(id);
    if (!etat) throw new Error(`paiement simulé inconnu : ${id}`);
    return { ...etat };
  }
  async annulerPaiement(id: string): Promise<EtatPaiement> {
    const etat = await this.lirePaiement(id);
    if (etat.statut === "reussi" || etat.statut === "en_cours" || etat.statut === "annule") return etat;
    this.annulations += 1;
    this.paiements.set(id, { ...etat, statut: "annule" });
    return { ...etat, statut: "annule" };
  }
  async oublierCarte(pm: string): Promise<void> {
    this.cartesOubliees.push(pm);
  }
  async oublierClient(customerId: string): Promise<void> {
    if (this.panneClient) throw new Error("prestataire injoignable (simulé)");
    this.clientsOublies.push(customerId);
  }
  async prelever(): Promise<EtatPaiement> {
    throw new Error("prélèvement : hors de ce contrôle");
  }
  async bloquerCaution(): Promise<EtatPaiement> {
    throw new Error("caution par carte : hors de ce contrôle");
  }
  async creerEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("enregistrement de carte : hors de ce contrôle");
  }
  async lireEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("enregistrement de carte : hors de ce contrôle");
  }
  /** Retenue sur une caution bloquée (Phase 5, lot 2) : une seule fois. */
  async encaisserCaution(id: string, montant: number): Promise<EtatPaiement> {
    const e = await this.lirePaiement(id);
    if (e.statut !== "bloque") return e;
    const fait = { ...e, statut: "reussi" as const, montantEncaisse: montant };
    this.paiements.set(id, fait);
    return { ...fait };
  }
  /** Remboursements faits (annulation, Phase 5, lot 5) : un par clé d'idempotence. */
  readonly remboursements: { ref: string; paiement: string; montant: number | null; cle: string }[] = [];
  /** Vrai : Stripe refuse de rembourser (paiement trop ancien, carte close…). */
  refusRemboursement = false;
  /** Vrai : Stripe ne répond pas (panne). */
  panneRemboursement = false;
  async rembourser(id: string, _motif: string, partiel?: { montant: number; cle: string }): Promise<{ id: string }> {
    if (this.panneRemboursement) throw new Error("prestataire injoignable (simulé)");
    if (this.refusRemboursement) throw new RemboursementRefuse("charge_expired_for_refund (simulé)");
    const cle = partiel?.cle ?? `remboursement-${id}`;
    const deja = this.remboursements.find((r) => r.cle === cle);
    if (deja) return { id: deja.ref };
    const ref = `re_lot5_${this.remboursements.length + 1}_${Date.now()}`;
    this.remboursements.push({ ref, paiement: id, montant: partiel?.montant ?? null, cle });
    return { id: ref };
  }
  lireAvis(): AvisPaiement | null {
    return null;
  }

  /** Le client paie. */
  regler(id: string): void {
    const e = this.paiements.get(id)!;
    this.paiements.set(id, { ...e, statut: "reussi", paymentMethodId: `pm_${id}` });
  }
}

export class MessagerieSimulee implements Messagerie {
  readonly envoyes: Message[] = [];
  async envoyer(m: Message): Promise<Envoi> {
    this.envoyes.push(m);
    return { voie: "fichier", reference: `simule-${this.envoyes.length}` };
  }
  vider(): Message[] {
    return this.envoyes.splice(0);
  }
}

/** Prochain samedi au moins `semaines` semaines après aujourd'hui. */
export function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

/** L'instant `iso` à `hhmm`, heure de Paris (heure d'été ou d'hiver). */
export function aParis(iso: string, hhmm: string): Date {
  for (const decalage of ["+01:00", "+02:00"]) {
    const d = new Date(`${iso}T${hhmm}:00${decalage}`);
    if (heureParis(d) === hhmm && aujourdhuiParis(d) === iso) return d;
  }
  throw new Error(`heure de Paris introuvable : ${iso} ${hhmm}`);
}

export function coordonnees(email: string, prenom: string, nom: string): Coordonnees {
  return {
    locataire: { civilite: "", prenom, nom },
    email,
    telephone: "06 00 00 00 00",
    adresse: "1 rue de l'Essai",
    codePostal: "07100",
    ville: "Savas",
    pays: "France",
    colocataire: null,
    autresAdultes: [{ prenom: "Second", nom: "Adulte" }],
  };
}

export type Tentative = Extract<ResultatTentative, { ok: true }>;
export type Gite = "armu" | "laphine" | "maison-vieille";

/** Une tentative (réservation « en attente de paiement ») et son paiement ouvert chez le prestataire. */
export async function tenter(
  p: PrestataireSimule,
  c: Coordonnees,
  gite: Gite,
  arrivee: string,
  moyenCaution: "carte" | "cheque" | "virement",
  langue: "fr" | "en" = "fr",
): Promise<{ t: Tentative; paiementId: string }> {
  const t = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    c,
    null,
    { moyenCaution, modeSolde: "lien" },
    langue,
  );
  if (!t.ok) throw new Error(`tentative refusée (${gite}, ${arrivee}) : ${JSON.stringify(t)}`);
  const { paiementId } = await ouvrirPaiement(
    {
      reservationId: t.id, reference: t.reference, montant: t.devis.aRegler,
      paiementIntegral: t.devis.paiementIntegral, enregistrerCarte: carteEnregistree(t.choix),
      client: t.client, description: `essai ${t.reference}`,
    },
    p,
  );
  return { t, paiementId };
}

/** Une réservation payée (acompte) et confirmée. */
export async function reserver(
  p: PrestataireSimule,
  c: Coordonnees,
  gite: Gite,
  arrivee: string,
  moyenCaution: "carte" | "cheque" | "virement",
  langue: "fr" | "en" = "fr",
): Promise<Tentative> {
  const { t, paiementId } = await tenter(p, c, gite, arrivee, moyenCaution, langue);
  p.regler(paiementId);
  const issue = await constaterPaiement(paiementId, p);
  if (issue.issue !== "CONFIRMEE") throw new Error(`réservation non confirmée : ${JSON.stringify(issue)}`);
  return t;
}
