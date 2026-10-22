// Contrôle du PAIEMENT d'une réservation du tunnel (Phase 3, lot 3), sur la
// base de TEST.
//
// Partie 1 — la logique (lib/paiement.ts, lib/tunnel.ts) avec un prestataire
// SIMULÉ : aucun réseau, aucune clé. Elle rejoue ce que Stripe peut répondre,
// dans l'ordre qu'il veut :
//   1. paiement ouvert « en attente », carte conservée seulement pour une
//      caution par carte ;
//   2. refus de la banque, puis paiement réussi : réservation confirmée, nuits
//      vendues, constat répété sans effet (retour client ET avis de Stripe) ;
//   3. paiement arrivé après la fin du blocage : nuits encore libres →
//      confirmé ; nuits reprises par un autre → remboursement intégral,
//      réservation annulée, carte oubliée, l'autre client garde ses nuits ;
//   4. remboursement en panne puis rattrapé, sans jamais rembourser deux fois ;
//   5. montant inattendu, paiement inconnu du site : remboursés ;
//   6. retour en arrière : paiement annulé chez le prestataire avant la
//      suppression ; paiement déjà abouti → la réservation est gardée ;
//   7. secret de retour faux : la page ne dit rien.
//
// Partie 2 (option --http, lancée par lancer.sh) — le serveur et STRIPE EN
// MODE TEST, avec les clés de .env.local : tunnel ouvert, paiement réel par
// carte de test, page de confirmation, carte refusée, avis signé de Stripe.
// Sans clés de test, la partie 2 ÉCHOUE en le disant : elle ne passe jamais
// en silence.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin. Suppose la tarification d'essai chargée
// par scripts/parcours/reinitialiser.ts.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-paiement.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";
import Stripe from "stripe";

import { closeDb, getDb } from "../db";
import { numericDepuisCentimes } from "../lib/centimes";
import type { Coordonnees } from "../lib/coordonnees";
import { ajouterJours, aujourdhuiParis, jourSemaineIso } from "../lib/dates-civiles";
import { constaterPaiement, constaterRetour, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import {
  remplacerPrestataire,
  type AvisPaiement,
  type DemandePaiement,
  type EtatPaiement,
  type PaiementCree,
  type Prestataire,
} from "../lib/stripe";
import { abandonnerTentative, enregistrerTentative, nuitsBloquees, type ResultatTentative } from "../lib/tunnel";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "paiement@example.invalid";
const db = getDb();

// ─── Prestataire simulé ──────────────────────────────────────────────────────

class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();
  readonly remboursements: string[] = [];
  readonly cartesOubliees: string[] = [];
  annulations = 0;
  /** Nombre d'échecs à simuler sur les prochains remboursements. */
  pannesRemboursement = 0;

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    this.n += 1;
    const id = `pi_simule_${this.n}_${Date.now()}`;
    const customerId = d.enregistrerCarte ? `cus_simule_${this.n}` : null;
    this.paiements.set(id, {
      id,
      statut: "en_attente",
      montant: d.montant,
      devise: "eur",
      customerId,
      paymentMethodId: null,
      reservationId: d.reservationId,
      clientSecret: `${id}_secret_ok`,
      dernierRefus: null,
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

  async rembourser(id: string): Promise<{ id: string }> {
    if (this.pannesRemboursement > 0) {
      this.pannesRemboursement -= 1;
      throw new Error("prestataire injoignable (simulé)");
    }
    // Idempotent comme Stripe avec sa clé : un second appel ne rembourse pas deux fois.
    if (!this.remboursements.includes(id)) this.remboursements.push(id);
    return { id: `re_${id}` };
  }

  async oublierCarte(paymentMethodId: string): Promise<void> {
    this.cartesOubliees.push(paymentMethodId);
  }

  lireAvis(): AvisPaiement | null {
    return null;
  }

  /** Le client paie (ou sa banque refuse). */
  regler(id: string, statut: "reussi" | "echoue" | "en_cours", montant?: number): void {
    const etat = this.paiements.get(id);
    if (!etat) throw new Error(`paiement simulé inconnu : ${id}`);
    this.paiements.set(id, {
      ...etat,
      statut,
      montant: montant ?? etat.montant,
      paymentMethodId: statut === "reussi" ? `pm_simule_${id}` : etat.paymentMethodId,
    });
  }

  /** Un paiement que le site n'a pas ouvert (ou dont il a perdu la trace). */
  orphelin(montant: number): string {
    const id = `pi_orphelin_${Date.now()}`;
    this.paiements.set(id, {
      id, statut: "reussi", montant, devise: "eur", customerId: null, paymentMethodId: null,
      reservationId: null, clientSecret: `${id}_secret_ok`, dernierRefus: null,
    });
    return id;
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

/** Prochain samedi au moins `semaines` semaines après aujourd'hui. */
function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

const COORDONNEES: Coordonnees = {
  locataire: { civilite: "", prenom: "Essai", nom: "Paiement" },
  email: EMAIL_ESSAI,
  telephone: "06 00 00 00 00",
  adresse: "1 rue de l'Essai",
  codePostal: "07100",
  ville: "Savas",
  pays: "France",
  colocataire: null,
  autresAdultes: [{ prenom: "Second", nom: "Adulte" }],
};

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

type Tentative = Extract<ResultatTentative, { ok: true }>;

async function tenter(
  gite: "armu" | "laphine" | "maison-vieille",
  arrivee: string,
  reglement: { moyenCaution: string; modeSolde: string | null },
): Promise<Tentative> {
  const r = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    COORDONNEES,
    null,
    reglement,
  );
  if (!r.ok) throw new Error(`tentative refusée (${gite}, ${arrivee}) : ${JSON.stringify(r)}`);
  return r;
}

async function ouvrir(t: Tentative, p: Prestataire): Promise<string> {
  const { paiementId } = await ouvrirPaiement(
    {
      reservationId: t.id,
      reference: t.reference,
      montant: t.devis.aRegler,
      paiementIntegral: t.devis.paiementIntegral,
      enregistrerCarte: carteEnregistree(t.choix),
      client: t.client,
      description: `essai ${t.reference}`,
    },
    p,
  );
  return paiementId;
}

async function ligne<T extends Record<string, unknown>>(requete: ReturnType<typeof sql>): Promise<T | undefined> {
  return (await db.execute(requete)).rows[0] as T | undefined;
}

const etatResa = (id: string) =>
  ligne<{
    statut: string; mode_paiement: string | null; reference_transaction: string | null;
    paye: string | null; customer: string | null; pm: string | null;
  }>(sql`
    select statut, mode_paiement, reference_transaction, date_paiement_acompte as paye,
           stripe_customer_id as customer, stripe_payment_method_id as pm
      from reservations where id = ${id}::uuid`);

const etatPaiement = (pi: string) =>
  ligne<{ statut: string; type: string; montant: string; motif: string | null; remb: string | null }>(sql`
    select statut, type, montant::text, motif_remboursement as motif, reference_remboursement as remb
      from paiements where reference_externe = ${pi}`);

const nuitsVendues = async (id: string) =>
  (await ligne<{ n: number }>(sql`
    select count(*)::int as n from disponibilites where reservation_id = ${id}::uuid and statut = 'reserve'`))?.n ?? 0;

/** Le blocage d'une tentative a expiré (le client a mis trop longtemps). */
const expirer = (id: string) =>
  db.execute(sql`update disponibilites set verrou_expire_at = now() - interval '1 minute'
                  where reservation_id = ${id}::uuid and statut = 'verrou'`);

// ─── Partie 1 : la logique, prestataire simulé ───────────────────────────────

async function partieLogique(): Promise<void> {
  const p = new PrestataireSimule();
  remplacerPrestataire(p);

  console.log("--- 1. ouverture du paiement");
  const a = await tenter("armu", samediDans(10), { moyenCaution: "cheque", modeSolde: "lien" });
  const piA = await ouvrir(a, p);
  const pA = await etatPaiement(piA);
  noter(
    pA?.statut === "en_attente" && pA.type === "acompte" && pA.montant === numericDepuisCentimes(a.devis.aRegler),
    `paiement ouvert « en attente » : acompte de ${a.devis.aRegler} centimes`,
    pA,
  );
  noter((await etatResa(a.id))?.customer === null, "caution par chèque : aucune carte conservée (pas de client Stripe)");

  const b = await tenter("laphine", samediDans(10), { moyenCaution: "carte", modeSolde: "prelevement" });
  const piB = await ouvrir(b, p);
  noter((await etatResa(b.id))?.customer?.startsWith("cus_simule_") === true, "caution par carte : client Stripe créé, carte à conserver");
  noter(b.accordCarte?.includes("le prélèvement du solde de") === true, "le texte d'accord accompagne la tentative");

  const integral = await tenter("maison-vieille", samediDans(2), { moyenCaution: "virement", modeSolde: "prelevement" });
  const piI = await ouvrir(integral, p);
  noter(
    integral.devis.paiementIntegral && integral.choix.modeSolde === null && (await etatPaiement(piI))?.type === "total",
    "arrivée dans moins de 30 jours : paiement « total », pas de solde (le choix reçu est ignoré)",
    integral.choix,
  );

  console.log("--- 2. refus, puis paiement réussi");
  noter((await constaterPaiement(piA, p)).issue === "EN_ATTENTE", "rien de payé : en attente, rien d'engagé");
  p.regler(piA, "echoue");
  noter((await constaterPaiement(piA, p)).issue === "ECHOUE", "refus de la banque : constaté");
  noter((await etatPaiement(piA))?.statut === "echoue" && (await nuitsBloquees(a.id)) === 7, "après un refus, les nuits restent bloquées pour le client");
  p.regler(piA, "reussi");
  const [c1, c2] = await Promise.all([constaterPaiement(piA, p), constaterPaiement(piA, p)]);
  noter(c1.issue === "CONFIRMEE" && c2.issue === "CONFIRMEE", "retour client et avis de Stripe en même temps : tous deux « confirmée »", [c1, c2]);
  const rA = await etatResa(a.id);
  noter(
    rA?.statut === "confirmee" && rA.mode_paiement === "Carte bancaire" && rA.reference_transaction === piA && rA.paye !== null,
    "réservation confirmée : mode, référence et date du paiement inscrits",
    rA,
  );
  noter((await nuitsVendues(a.id)) === 7 && (await nuitsBloquees(a.id)) === 0, "les 7 nuits passent de bloquées à vendues");
  noter(rA?.pm === null, "caution par chèque : aucune carte enregistrée sur la réservation", rA?.pm);
  const payeAvant = String(rA?.paye);
  noter((await constaterPaiement(piA, p)).issue === "CONFIRMEE", "constat répété : toujours « confirmée »");
  noter(String((await etatResa(a.id))?.paye) === payeAvant, "constat répété : rien n'est réécrit");
  noter((await abandonnerTentative(a.id)) === "ENGAGEE", "une réservation payée ne s'abandonne pas");

  p.regler(piB, "reussi");
  await constaterPaiement(piB, p);
  const rB = await etatResa(b.id);
  noter(rB?.statut === "confirmee" && rB.pm === `pm_simule_${piB}` && rB.customer !== null, "caution par carte : carte enregistrée (client et moyen de paiement)", rB);

  console.log("--- 3. paiement arrivé après la fin du blocage");
  const libre = await tenter("armu", samediDans(12), { moyenCaution: "cheque", modeSolde: "lien" });
  const piLibre = await ouvrir(libre, p);
  await expirer(libre.id);
  p.regler(piLibre, "reussi");
  noter((await constaterPaiement(piLibre, p)).issue === "CONFIRMEE", "blocage expiré, nuits encore libres : réservation confirmée");
  noter((await nuitsVendues(libre.id)) === 7, "… et ses 7 nuits vendues");

  const retard = await tenter("laphine", samediDans(12), { moyenCaution: "carte", modeSolde: "lien" });
  const piRetard = await ouvrir(retard, p);
  await expirer(retard.id);
  const autre = await tenter("laphine", samediDans(12), { moyenCaution: "cheque", modeSolde: "lien" });
  noter((await nuitsBloquees(autre.id)) === 7, "un autre client bloque les mêmes nuits après l'échéance");
  p.regler(piRetard, "reussi");
  const issueRetard = await constaterPaiement(piRetard, p);
  noter(issueRetard.issue === "REMBOURSEE" && issueRetard.remboursementFait, "le premier paie trop tard : remboursé intégralement", issueRetard);
  noter(p.remboursements.filter((id) => id === piRetard).length === 1, "un seul remboursement chez le prestataire");
  const pRetard = await etatPaiement(piRetard);
  noter(pRetard?.statut === "rembourse" && pRetard.remb === `re_${piRetard}` && pRetard.motif !== null, "paiement « remboursé », motif et référence du remboursement inscrits", pRetard);
  const rRetard = await etatResa(retard.id);
  noter(rRetard?.statut === "annulee" && rRetard.pm === null, "réservation annulée, aucune carte enregistrée", rRetard);
  noter(p.cartesOubliees.includes(`pm_simule_${piRetard}`), "la carte n'est plus conservée chez le prestataire");
  noter((await nuitsBloquees(autre.id)) === 7 && (await nuitsVendues(retard.id)) === 0, "l'autre client garde ses nuits ; rien n'est vendu au premier");
  noter((await constaterPaiement(piRetard, p)).issue === "REMBOURSEE" && p.remboursements.length === 1, "constat répété : rien de plus");

  console.log("--- 4. remboursement en panne, puis rattrapé");
  const panne = await tenter("maison-vieille", samediDans(14), { moyenCaution: "cheque", modeSolde: "lien" });
  const piPanne = await ouvrir(panne, p);
  await expirer(panne.id);
  const prise = await tenter("maison-vieille", samediDans(14), { moyenCaution: "cheque", modeSolde: "lien" });
  p.regler(piPanne, "reussi");
  p.pannesRemboursement = 1;
  const i1 = await constaterPaiement(piPanne, p);
  noter(i1.issue === "REMBOURSEE" && !i1.remboursementFait, "prestataire injoignable : remboursement à retenter", i1);
  noter((await etatPaiement(piPanne))?.statut === "a_rembourser", "l'intention est écrite (« a_rembourser ») avant l'appel");
  const i2 = await constaterPaiement(piPanne, p);
  noter(i2.issue === "REMBOURSEE" && i2.remboursementFait && (await etatPaiement(piPanne))?.statut === "rembourse", "constat suivant (avis de Stripe) : remboursement fait", i2);
  noter(p.remboursements.filter((id) => id === piPanne).length === 1, "toujours un seul remboursement");
  await abandonnerTentative(prise.id);

  console.log("--- 5. montant inattendu, paiement inconnu");
  const montant = await tenter("armu", samediDans(16), { moyenCaution: "cheque", modeSolde: "lien" });
  const piMontant = await ouvrir(montant, p);
  p.regler(piMontant, "reussi", montant.devis.aRegler - 1);
  const iMontant = await constaterPaiement(piMontant, p);
  noter(iMontant.issue === "REMBOURSEE" && (await etatResa(montant.id))?.statut === "annulee", "montant reçu différent d'un centime : remboursé, réservation non confirmée", iMontant);
  noter((await nuitsBloquees(montant.id)) === 0 && (await nuitsVendues(montant.id)) === 0, "… et ses nuits libérées");
  const orphelin = p.orphelin(12345);
  const iOrphelin = await constaterPaiement(orphelin, p);
  noter(iOrphelin.issue === "INCONNU" && p.remboursements.includes(orphelin), "paiement reçu inconnu du site : remboursé", iOrphelin);

  console.log("--- 6. retour en arrière");
  const retour = await tenter("laphine", samediDans(16), { moyenCaution: "carte", modeSolde: "lien" });
  const piRetour = await ouvrir(retour, p);
  const annulationsAvant = p.annulations;
  noter((await abandonnerTentative(retour.id)) === "ABANDONNEE", "abandon : accepté");
  noter(p.annulations === annulationsAvant + 1 && (await p.lirePaiement(piRetour)).statut === "annule", "le paiement est annulé chez le prestataire avant la suppression");
  noter((await etatPaiement(piRetour)) === undefined && (await etatResa(retour.id)) === undefined, "tentative et paiement supprimés, avec les coordonnées");
  const paye = await tenter("laphine", samediDans(18), { moyenCaution: "cheque", modeSolde: "lien" });
  const piPaye = await ouvrir(paye, p);
  p.regler(piPaye, "reussi");
  noter((await abandonnerTentative(paye.id)) === "ENGAGEE", "paiement abouti mais pas encore constaté : l'abandon est refusé");
  noter((await constaterPaiement(piPaye, p)).issue === "CONFIRMEE", "… et le constat suivant confirme la réservation");

  console.log("--- 7. page de retour");
  noter((await constaterRetour(piPaye, "mauvais-secret", p)) === null, "secret de paiement faux : rien n'est dit");
  const bon = await constaterRetour(piPaye, `${piPaye}_secret_ok`, p);
  noter(bon?.issue.issue === "CONFIRMEE", "secret exact : l'issue est donnée", bon);
}

// ─── Partie 2 : serveur et Stripe en mode test ───────────────────────────────

async function partieHttp(): Promise<void> {
  const base = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
  console.log(`--- 8. par le serveur (${base}) et Stripe en mode test`);
  const cle = process.env.STRIPE_SECRET_KEY ?? "";
  const clePublique = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!cle.startsWith("sk_test_") || !clePublique.startsWith("pk_test_")) {
    noter(false, "clés Stripe de TEST absentes de .env.local (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : paiement réel non vérifié");
    return;
  }
  const stripe = new Stripe(cle);

  const page = async (chemin: string) => {
    const r = await fetch(`${base}${chemin}`, { redirect: "manual" });
    return { status: r.status, texte: await r.text() };
  };
  const poster = async (corps: unknown) => {
    const r = await fetch(`${base}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    return { status: r.status, corps: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const tunnel = await page("/reserver?gite=armu");
  noter(tunnel.status === 200 && tunnel.texte.includes("Quand venez-vous"), "tunnel ouvert (clés de test reconnues)", tunnel.status);

  const arrivee = samediDans(20);
  const demande = {
    gite: "armu", arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0,
    coordonnees: COORDONNEES, langue: "fr",
  };
  const sansChoix = await poster(demande);
  noter(sansChoix.status === 400 && sansChoix.corps.code === "REGLEMENT_INVALIDE", "POST sans choix de caution : 400 (rien n'est pré-choisi)", sansChoix.corps);

  const ok = await poster({ ...demande, reglement: { moyenCaution: "carte", modeSolde: "prelevement" } });
  const secret = String(ok.corps.clientSecret ?? "");
  const pi = secret.split("_secret_")[0];
  noter(ok.status === 201 && pi.startsWith("pi_"), "POST complet : 201, paiement ouvert chez Stripe", ok.status);
  noter(typeof ok.corps.accordCarte === "string" && String(ok.corps.accordCarte).includes("Stripe"), "le texte d'accord est renvoyé pour l'affichage");
  if (ok.status !== 201) return;
  const intent = await stripe.paymentIntents.retrieve(pi);
  noter(
    intent.amount === (ok.corps.devis as { aRegler: number }).aRegler && intent.currency === "eur" &&
      intent.setup_future_usage === "off_session" && typeof intent.customer === "string",
    "chez Stripe : montant du devis du serveur, en euros, carte à conserver pour un client",
    { amount: intent.amount, sfu: intent.setup_future_usage },
  );

  // Le client paie avec la carte de test Visa (ce que fait le champ de Stripe dans la page).
  await stripe.paymentIntents.confirm(pi, { payment_method: "pm_card_visa", return_url: `${base}/reserver/confirmation` });
  const confirmation = await page(
    `/reserver/confirmation?payment_intent=${pi}&payment_intent_client_secret=${encodeURIComponent(secret)}`,
  );
  noter(confirmation.status === 200 && confirmation.texte.includes("Paiement reçu"), "page de retour : « Paiement reçu »", confirmation.status);
  noter(confirmation.texte.includes(String(ok.corps.reference)), "… avec la référence de la réservation");
  const r = await etatResa(String(ok.corps.id));
  noter(r?.statut === "confirmee" && (r.pm ?? "").startsWith("pm_"), "réservation confirmée en base, carte enregistrée", r);
  noter((await page(`/reserver/confirmation?payment_intent=${pi}&payment_intent_client_secret=faux`)).status === 404, "retour avec un faux secret : 404");

  // Carte refusée.
  const arrivee2 = samediDans(22);
  const refus = await poster({ ...demande, arrivee: arrivee2, depart: ajouterJours(arrivee2, 7), reglement: { moyenCaution: "cheque", modeSolde: "lien" } });
  const secret2 = String(refus.corps.clientSecret ?? "");
  const pi2 = secret2.split("_secret_")[0];
  let refusee = false;
  try {
    await stripe.paymentIntents.confirm(pi2, { payment_method: "pm_card_chargeDeclined" });
  } catch {
    refusee = true;
  }
  noter(refusee, "carte de test refusée par la banque");
  const nonAbouti = await page(
    `/reserver/confirmation?payment_intent=${pi2}&payment_intent_client_secret=${encodeURIComponent(secret2)}`,
  );
  noter(nonAbouti.status === 200 && nonAbouti.texte.includes("n'a pas abouti"), "page de retour : « n'a pas abouti »", nonAbouti.status);
  noter((await etatResa(String(refus.corps.id))) === undefined, "la tentative est abandonnée : dates libérées, coordonnées supprimées");
  noter((await stripe.paymentIntents.retrieve(pi2)).status === "canceled", "le paiement est annulé chez Stripe");

  // Avis de Stripe signé.
  const secretAvis = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const corpsAvis = JSON.stringify({
    id: "evt_essai", object: "event", type: "payment_intent.succeeded", data: { object: { id: pi, object: "payment_intent" } },
  });
  const signature = secretAvis
    ? stripe.webhooks.generateTestHeaderString({ payload: corpsAvis, secret: secretAvis })
    : "t=0,v1=absente";
  const avis = await fetch(`${base}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body: corpsAvis,
  });
  if (secretAvis) {
    noter(avis.status === 200, "avis signé de Stripe pour un paiement déjà constaté : 200, sans effet", avis.status);
    const falsifie = await fetch(`${base}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": signature },
      body: corpsAvis.replace("evt_essai", "evt_falsifie"),
    });
    noter(falsifie.status === 400, "avis falsifié : 400", falsifie.status);
  } else {
    noter(avis.status === 503, "STRIPE_WEBHOOK_SECRET absente : avis refusé (503)", avis.status);
  }
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et des paiements.');
  }
  await nettoyer();
  try {
    await partieLogique();
    if (process.argv.includes("--http")) await partieHttp();
  } finally {
    await nettoyer();
  }
}

main()
  .then(() => {
    console.log(echecs === 0 ? `\n${nbCas} cas, tous passent.` : `\n${nbCas} cas, ${echecs} en échec.`);
    process.exitCode = echecs === 0 ? 0 : 1;
  })
  .catch((erreur) => {
    console.error("ERREUR :", erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
