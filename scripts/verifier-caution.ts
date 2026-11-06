// Contrôle de la CAUTION PAR CARTE (Phase 4, lot 2, D-16), sur la base de TEST.
//
// Partie 1, prestataire et messagerie SIMULÉS, temps fixé (chaque passage
// des tâches reçoit son heure de Paris) :
//   1. cas normal : montant figé à la réservation (le gîte peut changer le
//      sien), préautorisation la veille du départ à 18 h (pas à 17 h 45), une
//      seule ; courriels du jour même ; alerte la veille de la levée à 8 h ;
//      levée le troisième jour à 8 h, réservation « terminée », carte effacée ;
//   2. refusée : lien au client et alerte « À TRAITER » une seule fois, pas
//      de nouvel essai ; le client valide (même paiement) : bloquée ; les
//      courriels devenus faux ne partent pas ;
//   3. authentification exigée, jamais validée (client anglais) : close à la
//      levée, aucun courriel de levée, carte effacée ;
//   4. montant absent : alerte, rien n'est bloqué ; le contrat le refuse ;
//   5. réponse perdue : rejouée avec la même clé (un seul blocage) ; avis de
//      Stripe arrivé avant la référence : à reprendre ; sans réponse depuis
//      plus de 20 heures : alerte, pas de rejeu ;
//   6. retenue faite dans le tableau de bord Stripe : constatée, carte effacée ;
//   7. réservation annulée, caution à 0 € : carte effacée (tout de suite, ou
//      7 jours après le départ), rien n'est bloqué ;
//   8. article 6.6 : lien « enregistrer une carte », texte d'accord recopié,
//      carte enregistrée, puis préautorisation la veille du départ ;
//   9. passage de la veille manqué : rattrapé le jour du départ ;
//  10. paiement contesté : alerte « À TRAITER ».
// Partie 2 (--stripe) : Stripe en MODE TEST, trois cartes — normale,
// 4000 0027 6000 3184 (authentification toujours exigée) et une carte
// refusée — : état enregistré, ce que voit le client, carte détachée.
// Partie 3 (--http) : la route de validation et la page, par le serveur.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-caution.ts [--stripe] [--http]
import "../db/env";

import { sql } from "drizzle-orm";
import Stripe from "stripe";

import { closeDb, getDb } from "../db";
import {
  constaterEnregistrement,
  demanderCarteCaution,
  lireEtatCaution,
  ouvrirCaution,
  traiterCautions,
} from "../lib/caution";
import type { Coordonnees } from "../lib/coordonnees";
import { inscrireProbleme } from "../lib/courriels";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis, heureParis, jourSemaineIso } from "../lib/dates-civiles";
import { remplacerMessagerie, type Envoi, type Message, type Messagerie } from "../lib/messagerie";
import { cautionDe } from "../lib/montants";
import { constaterPaiement, constaterRetour, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import { chargerReservationAvecGite } from "../lib/reservations";
import {
  PaiementIndisponible,
  prestataire,
  remplacerPrestataire,
  type AvisPaiement,
  type DemandeCaution,
  type DemandeEnregistrement,
  type DemandePaiement,
  type EtatEnregistrement,
  type EtatPaiement,
  type PaiementCree,
  type Prestataire,
} from "../lib/stripe";
import { enregistrerTentative, type ResultatTentative } from "../lib/tunnel";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "caution@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const db = getDb();
/** Le vrai prestataire (Stripe), gardé avant d'installer le simulé. */
const STRIPE_REEL = prestataire();

// ─── Simulations ─────────────────────────────────────────────────────────────

class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();
  readonly enregistrements = new Map<string, EtatEnregistrement>();
  /** Préautorisations créées, par réservation (la clé d'idempotence de Stripe). */
  readonly cautions = new Map<string, string>();
  appelsCaution = 0;
  readonly cartesOubliees: string[] = [];
  /** Réponse de la banque à la prochaine préautorisation. */
  banque: "ok" | "refus" | "authentification" = "ok";
  /** La préautorisation est créée chez « Stripe » mais la réponse se perd. */
  reponsePerdue = false;

  private nouveau(e: Partial<EtatPaiement> & { montant: number; reservationId: string; typePaiement: string }): EtatPaiement {
    this.n += 1;
    const id = `pi_caution_${this.n}_${Date.now()}`;
    const etat: EtatPaiement = {
      id, statut: "en_attente", devise: "eur", customerId: null, paymentMethodId: null,
      clientSecret: `${id}_secret_ok`, dernierRefus: null, expireLe: null, montantEncaisse: 0, ...e,
    };
    this.paiements.set(id, etat);
    return etat;
  }

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    const e = this.nouveau({ montant: d.montant, reservationId: d.reservationId, typePaiement: d.type });
    const customerId = d.enregistrerCarte ? `cus_${e.id}` : null;
    this.paiements.set(e.id, { ...e, customerId });
    return { id: e.id, clientSecret: e.clientSecret!, customerId };
  }
  async prelever(): Promise<EtatPaiement> {
    throw new Error("solde : hors de ce contrôle");
  }
  async bloquerCaution(d: DemandeCaution): Promise<EtatPaiement> {
    this.appelsCaution += 1;
    let id = this.cautions.get(d.reservationId);
    if (!id) {
      const statut = this.banque === "ok" ? "bloque" : "echoue";
      id = this.nouveau({
        montant: d.montant, reservationId: d.reservationId, typePaiement: "caution", statut,
        customerId: d.customerId, paymentMethodId: d.paymentMethodId,
        dernierRefus: this.banque === "refus" ? "card_declined" : this.banque === "authentification" ? "authentication_required" : null,
        // Visa, transaction du marchand : 4 jours 18 heures (D-16).
        expireLe: statut === "bloque" ? new Date(Date.now() + (4 * 24 + 18) * 3_600_000) : null,
      }).id;
      this.cautions.set(d.reservationId, id);
    }
    if (this.reponsePerdue) {
      this.reponsePerdue = false;
      throw new PaiementIndisponible("réponse perdue (simulé)");
    }
    return { ...this.paiements.get(id)! };
  }
  async creerEnregistrement(d: DemandeEnregistrement): Promise<EtatEnregistrement> {
    const existant = [...this.enregistrements.values()].find((e) => e.reservationId === d.reservationId);
    if (existant) return { ...existant };
    const id = `seti_${d.reservationId.slice(0, 8)}_${Date.now()}`;
    const e: EtatEnregistrement = {
      id, statut: "en_attente", customerId: d.customerId ?? `cus_caution_${id}`, paymentMethodId: null,
      reservationId: d.reservationId, clientSecret: `${id}_secret_ok`,
    };
    this.enregistrements.set(id, e);
    return { ...e };
  }
  async lireEnregistrement(id: string): Promise<EtatEnregistrement> {
    const e = this.enregistrements.get(id);
    if (!e) throw new Error(`enregistrement simulé inconnu : ${id}`);
    return { ...e };
  }
  async lirePaiement(id: string): Promise<EtatPaiement> {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    return { ...e };
  }
  async annulerPaiement(id: string): Promise<EtatPaiement> {
    const e = await this.lirePaiement(id);
    if (e.statut === "reussi" || e.statut === "annule") return e;
    this.paiements.set(id, { ...e, statut: "annule" });
    return this.lirePaiement(id);
  }
  async encaisserCaution(): Promise<EtatPaiement> {
    throw new Error("retenue de caution : hors de ce contrôle");
  }
  async rembourser(id: string): Promise<{ id: string }> {
    return { id: `re_${id}` };
  }
  async oublierCarte(pm: string): Promise<void> {
    this.cartesOubliees.push(pm);
  }
  async oublierClient(): Promise<void> {}
  lireAvis(): AvisPaiement | null {
    return null;
  }
  // Ce que font le client, sa banque ou le tableau de bord Stripe.
  regler(id: string): void {
    const e = this.paiements.get(id)!;
    this.paiements.set(id, { ...e, statut: "reussi", paymentMethodId: `pm_${id}` });
  }
  valider(id: string): void {
    const e = this.paiements.get(id)!;
    this.paiements.set(id, { ...e, statut: "bloque", dernierRefus: null, expireLe: new Date(Date.now() + 7 * 86_400_000) });
  }
  encaisser(id: string, montant: number): void {
    const e = this.paiements.get(id)!;
    this.paiements.set(id, { ...e, statut: "reussi", montantEncaisse: montant });
  }
  enregistrer(id: string): void {
    const e = this.enregistrements.get(id)!;
    this.enregistrements.set(id, { ...e, statut: "reussi", paymentMethodId: `pm_${id}` });
  }
}

class MessagerieSimulee implements Messagerie {
  readonly envoyes: Message[] = [];
  async envoyer(m: Message): Promise<Envoi> {
    this.envoyes.push(m);
    return { voie: "fichier", reference: `simule-${this.envoyes.length}` };
  }
  vider(): Message[] {
    return this.envoyes.splice(0);
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

/** L'instant `iso` à `hhmm`, heure de Paris (heure d'été ou d'hiver). */
function aParis(iso: string, hhmm: string): Date {
  for (const decalage of ["+01:00", "+02:00"]) {
    const d = new Date(`${iso}T${hhmm}:00${decalage}`);
    if (heureParis(d) === hhmm && aujourdhuiParis(d) === iso) return d;
  }
  throw new Error(`heure de Paris introuvable : ${iso} ${hhmm}`);
}

const COORDONNEES: Coordonnees = {
  locataire: { civilite: "", prenom: "Camille", nom: "Caution" },
  email: EMAIL_ESSAI,
  telephone: "06 00 00 00 00",
  adresse: "1 rue de l'Essai",
  codePostal: "07100",
  ville: "Savas",
  pays: "France",
  colocataire: null,
  autresAdultes: [{ prenom: "Second", nom: "Adulte" }],
};

type Tentative = Extract<ResultatTentative, { ok: true }>;
type Gite = "armu" | "laphine" | "maison-vieille";

/** Une réservation payée (acompte), confirmée ; carte enregistrée pour une caution par carte. */
async function reserver(
  p: PrestataireSimule,
  gite: Gite,
  arrivee: string,
  moyenCaution: "carte" | "cheque" | "virement",
  langue: "fr" | "en" = "fr",
): Promise<Tentative> {
  const t = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    COORDONNEES,
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
  p.regler(paiementId);
  const issue = await constaterPaiement(paiementId, p);
  if (issue.issue !== "CONFIRMEE") throw new Error(`réservation non confirmée : ${JSON.stringify(issue)}`);
  return t;
}

const departDe = (t: Tentative) => t.devis.depart;

interface LigneCaution {
  statut: string;
  montant: string;
  ref: string | null;
  expire: Date | null;
  retenu: string | null;
  liberation: Date | null;
}
async function caution(reservationId: string): Promise<LigneCaution | null> {
  const r = await db.execute(sql`
    select statut, montant::text as montant, reference_externe as ref, expire_at as expire,
           montant_retenu::text as retenu, date_liberation as liberation
      from paiements where reservation_id = ${reservationId}::uuid and type = 'caution'`);
  return (r.rows[0] as unknown as LigneCaution | undefined) ?? null;
}

async function resaEnBase(id: string) {
  const r = await db.execute(sql`
    select statut, caution::text as caution, stripe_payment_method_id as pm, stripe_customer_id as customer,
           accord_carte_texte as accord, carte_caution_demandee_at as demandee
      from reservations where id = ${id}::uuid`);
  return r.rows[0] as {
    statut: string; caution: string | null; pm: string | null; customer: string | null;
    accord: string | null; demandee: Date | null;
  };
}

interface LigneCourriel extends Record<string, unknown> {
  objet: string;
  statut: string;
  genre: string | null;
  quoi: string | null;
  derniere_erreur: string | null;
}
async function courrielsDe(reservationId: string): Promise<LigneCourriel[]> {
  return (
    await db.execute(sql`
      select objet, statut, donnees->>'genre' as genre, donnees->>'quoi' as quoi, derniere_erreur
        from courriels where reservation_id = ${reservationId}::uuid order by created_at, cle`)
  ).rows as LigneCourriel[];
}
const compter = (lignes: LigneCourriel[], objet: string, filtre?: string) =>
  lignes.filter((c) => c.objet === objet && (filtre === undefined || c.genre === filtre || c.quoi === filtre)).length;

/** Envoie NOS courriels en attente (le client et les propriétaires). */
async function envoyer(m: MessagerieSimulee): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now()
                        where statut = 'a_envoyer' and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);
  await traiterCourriels(ORIGINE, 200);
  return m.vider();
}

async function etatCaution(id: string) {
  const resa = await chargerReservationAvecGite(id);
  return resa ? lireEtatCaution(db, resa, aujourdhuiParis()) : null;
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

// ─── Partie 1 : simulée ──────────────────────────────────────────────────────

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  const m = new MessagerieSimulee();
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurFacture({
    emettre: async () => ({ ok: false, status: 409, message: "factures hors de ce contrôle" }),
    pdf: async () => Buffer.from(""),
  });
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });

  console.log("--- 1. cas normal");
  const [{ caution: cautionGite }] = (await db.execute(sql`select caution::text as caution from gites where slug = 'armu'`))
    .rows as Array<{ caution: string }>;
  const a = await reserver(p, "armu", samediDans(10), "carte");
  await envoyer(m); // confirmation, alertes de la réservation
  noter((await resaEnBase(a.id)).caution === cautionGite, "montant de la caution figé sur la réservation (celui du gîte)", (await resaEnBase(a.id)).caution);
  // Le gîte change sa caution après la réservation : celle de Camille ne bouge pas.
  await db.execute(sql`update gites set caution = caution + 100 where slug = 'armu'`);
  try {
    const d = departDe(a);
    const veille = ajouterJours(d, -1);
    const e0 = await etatCaution(a.id);
    noter(e0?.etat === "prevue" && e0.date === veille, "page : caution prévue la veille du départ", e0);
    let b = await traiterCautions(aParis(veille, "17:45"), p);
    noter(b.bloquees === 0 && (await caution(a.id)) === null, "veille à 17 h 45 : rien n'est bloqué", b);
    b = await traiterCautions(aParis(veille, "18:00"), p);
    const c1 = await caution(a.id);
    noter(b.bloquees === 1 && c1?.statut === "bloque" && c1.expire !== null, "veille à 18 h : caution bloquée, date limite de la banque enregistrée", { b, c1 });
    noter(c1?.montant === cautionGite, "le montant bloqué est celui de la réservation, pas celui du gîte modifié", c1?.montant);
    await traiterCautions(aParis(veille, "18:15"), p);
    noter(p.appelsCaution === 1, "passage suivant : aucune seconde préautorisation", p.appelsCaution);
    let c = await courrielsDe(a.id);
    noter(compter(c, "caution_bloquee") === 1 && compter(c, "alerte_caution", "bloquee") === 1, "courriel au client et court message aux propriétaires, une fois", c.map((x) => x.objet));
    let envois = await envoyer(m);
    const bloquee = envois.find((x) => x.destinataire === EMAIL_ESSAI);
    noter(
      !!bloquee && bloquee.sujet.startsWith("Caution de ") && bloquee.sujet.includes("bloquée sur votre carte") &&
        bloquee.texte.includes("aucune somme n'est débitée") && bloquee.texte.includes(`levée au plus tard le mardi`),
      "courriel « caution bloquée » : montant, rien de débité, levée au plus tard le mardi",
      bloquee?.sujet,
    );
    const alerteBloquee = envois.find((x) => x.destinataire === PROPRIETAIRES);
    noter(
      !!alerteBloquee && alerteBloquee.sujet.startsWith("Caution bloquée — ") && alerteBloquee.texte.includes("Levée automatique le mardi") &&
        alerteBloquee.texte.includes("vers 8 h 00") && alerteBloquee.texte.includes("La banque garde les fonds jusqu'au"),
      "alerte « caution bloquée » : levée automatique et date limite de la banque",
      alerteBloquee?.texte,
    );
    const e1 = await etatCaution(a.id);
    noter(e1?.etat === "bloquee" && e1.levee === ajouterJours(d, 3), "page : caution bloquée, levée au plus tard 3 jours après le départ", e1);

    await traiterCautions(aParis(ajouterJours(d, 2), "07:59"), p);
    noter(compter(await courrielsDe(a.id), "alerte_caution", "levee_demain") === 0, "lundi à 7 h 59 : pas encore d'alerte");
    await traiterCautions(aParis(ajouterJours(d, 2), "08:00"), p);
    c = await courrielsDe(a.id);
    noter(compter(c, "alerte_caution", "levee_demain") === 1, "lundi à 8 h : alerte « levée demain »");
    envois = await envoyer(m);
    const demain = envois.find((x) => x.sujet.startsWith("Caution levée demain"));
    noter(
      !!demain && demain.texte.includes("sera levée automatiquement demain, mardi") && demain.texte.includes("tableau de bord Stripe") &&
        demain.texte.includes("article 6.5"),
      "alerte « levée demain » : quand, comment retenir d'ici là, définitif ensuite",
      demain?.texte,
    );
    b = await traiterCautions(aParis(ajouterJours(d, 3), "07:59"), p);
    noter(b.levees === 0 && (await caution(a.id))?.statut === "bloque", "mardi à 7 h 59 : pas encore levée", b);
    b = await traiterCautions(aParis(ajouterJours(d, 3), "08:00"), p);
    const c2 = await caution(a.id);
    const r2 = await resaEnBase(a.id);
    noter(b.levees === 1 && c2?.statut === "libere" && c2.liberation !== null, "mardi à 8 h : caution levée", { b, c2 });
    noter(r2.statut === "terminee", "la réservation passe « terminée »", r2.statut);
    noter(b.cartesEffacees === 1 && r2.pm === null && p.cartesOubliees.length === 1, "la carte est supprimée chez Stripe dans le même passage", { b, pm: r2.pm });
    envois = await envoyer(m);
    const levee = envois.find((x) => x.destinataire === EMAIL_ESSAI);
    noter(
      !!levee && levee.sujet.startsWith("Caution levée") && levee.texte.includes("aucune somme n'a été débitée") &&
        levee.texte.includes("Les données de votre carte ont été supprimées."),
      "courriel « caution levée » : rien de débité, carte supprimée",
      levee?.texte,
    );
    const e2 = await etatCaution(a.id);
    noter(e2?.etat === "levee", "page : caution levée", e2);
    b = await traiterCautions(aParis(ajouterJours(d, 3), "08:15"), p);
    noter(b.levees === 0 && b.cartesEffacees === 0 && p.cartesOubliees.length === 1, "passage suivant : plus rien à faire", b);
  } finally {
    await db.execute(sql`update gites set caution = caution - 100 where slug = 'armu'`);
  }

  console.log("--- 2. préautorisation refusée, puis validée par le client");
  const r = await reserver(p, "laphine", samediDans(10), "carte");
  await envoyer(m);
  const dr = departDe(r);
  p.banque = "refus";
  let b = await traiterCautions(aParis(ajouterJours(dr, -1), "18:00"), p);
  p.banque = "ok";
  const cr = await caution(r.id);
  noter(b.refusees === 1 && cr?.statut === "echoue" && cr.ref !== null, "refusée : état « échoué », référence gardée", { b, cr });
  let c = await courrielsDe(r.id);
  noter(compter(c, "caution_a_valider") === 1 && compter(c, "alerte_probleme", "caution_refusee") === 1, "lien au client et alerte « À TRAITER »", c.map((x) => x.objet));
  await traiterCautions(aParis(ajouterJours(dr, -1), "18:15"), p);
  c = await courrielsDe(r.id);
  noter(p.appelsCaution === 2 && compter(c, "caution_a_valider") === 1, "le site ne réessaie pas, et n'écrit rien de plus", p.appelsCaution);
  const er = await etatCaution(r.id);
  noter(er?.etat === "a_valider", "page : caution à valider", er);
  const o = await ouvrirCaution(r.id, null, p);
  noter(o.ok && o.mode === "paiement" && o.clientSecret === `${cr?.ref}_secret_ok`, "validation : la MÊME préautorisation est rouverte", o);
  p.valider(cr!.ref!);
  const retour = await constaterRetour(cr!.ref!, `${cr!.ref}_secret_ok`, p);
  noter(retour?.issue.issue === "CAUTION" && "statut" in retour.issue && retour.issue.statut === "bloque", "retour du client : caution bloquée", retour?.issue);
  noter((await caution(r.id))?.statut === "bloque", "en base : bloquée");
  const envoisR = await envoyer(m);
  c = await courrielsDe(r.id);
  noter(
    c.find((x) => x.objet === "caution_a_valider")?.statut === "echec" &&
      c.find((x) => x.genre === "caution_refusee")?.statut === "echec" &&
      envoisR.some((x) => x.sujet.includes("bloquée sur votre carte")),
    "validée avant l'envoi : le lien et l'alerte devenus faux ne partent pas, « caution bloquée » part",
    c.map((x) => [x.objet, x.genre, x.statut]),
  );
  const o2 = await ouvrirCaution(r.id, null, p);
  noter(!o2.ok && o2.raison === "bloquee", "plus rien à valider une fois bloquée", o2);

  console.log("--- 3. authentification exigée, jamais validée (client anglais)");
  const s = await reserver(p, "maison-vieille", samediDans(10), "carte", "en");
  await envoyer(m);
  const ds = departDe(s);
  p.banque = "authentification";
  await traiterCautions(aParis(ajouterJours(ds, -1), "18:30"), p);
  p.banque = "ok";
  const envoisS = await envoyer(m);
  const aValider = envoisS.find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    !!aValider && aValider.sujet.startsWith("Your security deposit could not be held") &&
      aValider.texte.includes("Your bank asks you to confirm") && aValider.texte.includes("Confirm my deposit"),
    "courriel en anglais : la banque demande une confirmation, bouton pour valider",
    aValider?.texte,
  );
  const alerteS = envoisS.find((x) => x.sujet.startsWith("À TRAITER — caution non bloquée"));
  noter(
    !!alerteS && alerteS.texte.includes("demande une authentification du client") && alerteS.texte.includes("Le site ne réessaie pas"),
    "alerte « À TRAITER — caution non bloquée » : quoi faire",
    alerteS?.texte,
  );
  b = await traiterCautions(aParis(ajouterJours(ds, 3), "08:00"), p);
  const cs = await caution(s.id);
  const rs = await resaEnBase(s.id);
  // (Le même passage lève aussi la caution du cas 2, qui part le même jour.)
  noter(cs?.statut === "annule" && cs.liberation === null, "à la levée : préautorisation close, jamais bloquée", { cs, b });
  noter(rs.pm === null && rs.statut === "terminee", "carte supprimée, réservation terminée", rs);
  noter(compter(await courrielsDe(s.id), "caution_liberee") === 0, "aucun courriel « caution levée » (rien n'avait été bloqué)");
  noter((await etatCaution(s.id)) === null, "page : plus rien à dire sur la caution");

  console.log("--- 4. montant de caution absent");
  const z = await reserver(p, "armu", samediDans(12), "carte");
  await envoyer(m);
  await db.execute(sql`update reservations set caution = null where id = ${z.id}::uuid`);
  b = await traiterCautions(aParis(ajouterJours(departDe(z), -1), "18:00"), p);
  noter(b.bloquees === 0 && (await caution(z.id)) === null, "rien n'est bloqué (jamais de valeur par défaut)", b);
  c = await courrielsDe(z.id);
  noter(compter(c, "alerte_probleme", "caution_montant_absent") === 1, "alerte « À TRAITER — caution non bloquée (montant absent) »");
  let refusContrat = false;
  try {
    cautionDe((await chargerReservationAvecGite(z.id))!);
  } catch {
    refusContrat = true;
  }
  noter(refusContrat, "le contrat refuse une réservation sans montant de caution");
  noter((await etatCaution(z.id)) === null, "page : aucun bloc de caution sans montant");

  console.log("--- 5. réponse perdue, avis de Stripe en avance, plus de 20 heures");
  const q = await reserver(p, "laphine", samediDans(12), "carte");
  await envoyer(m);
  const dq = ajouterJours(departDe(q), -1);
  p.reponsePerdue = true;
  b = await traiterCautions(aParis(dq, "18:00"), p);
  const cq = await caution(q.id);
  noter(b.erreurs === 1 && cq?.statut === "en_attente" && cq.ref === null, "réponse perdue : trace sans référence, erreur journalisée", { b, cq });
  // La trace porte l'heure du passage simulé (le contrôle n'est pas à l'heure de l'horloge).
  const dater = (id: string, quand: Date) =>
    db.execute(sql`update paiements set created_at = ${quand.toISOString()}::timestamptz where reservation_id = ${id}::uuid and type = 'caution'`);
  await dater(q.id, aParis(dq, "18:00"));
  const piQ = p.cautions.get(q.id)!;
  let aReprendre = false;
  try {
    await constaterPaiement(piQ, p);
  } catch {
    aReprendre = true;
  }
  noter(aReprendre, "avis de Stripe arrivé avant la référence : à reprendre (jamais remboursé)");
  b = await traiterCautions(aParis(dq, "18:15"), p);
  noter(b.bloquees === 1 && (await caution(q.id))?.ref === piQ && p.cautions.size >= 1, "passage suivant : rejouée avec la même clé, une seule préautorisation", b);
  const v = await reserver(p, "maison-vieille", samediDans(12), "carte");
  await envoyer(m);
  const dv = ajouterJours(departDe(v), -1);
  p.reponsePerdue = true;
  await traiterCautions(aParis(dv, "18:00"), p);
  const appels = p.appelsCaution;
  // Demandée la veille à 10 h (passage simulé), réponse jamais inscrite ; le lendemain à 7 h : 21 heures.
  await dater(v.id, aParis(dv, "10:00"));
  await traiterCautions(aParis(departDe(v), "07:00"), p);
  noter(p.appelsCaution === appels, "sans réponse depuis plus de 20 heures : pas de nouvel appel", p.appelsCaution - appels);
  noter(compter(await courrielsDe(v.id), "alerte_probleme", "caution_a_verifier") === 1, "alerte « À TRAITER — caution à vérifier »");

  console.log("--- 6. retenue faite dans le tableau de bord Stripe");
  const piR = (await caution(q.id))!.ref!;
  p.encaisser(piR, 15000);
  const issueR = await constaterPaiement(piR, p);
  const cR = await caution(q.id);
  noter(issueR.issue === "CAUTION" && cR?.statut === "retenu" && cR.retenu === "150.00", "retenue constatée : 150,00 € retenus", { issueR, cR });
  b = await traiterCautions(aParis(dq, "18:30"), p);
  noter((await resaEnBase(q.id)).pm === null, "carte supprimée dès la retenue");
  const eR = await etatCaution(q.id);
  noter(eR?.etat === "retenue" && eR.retenu === 15000, "page : montant retenu", eR);
  const repete = await constaterPaiement(piR, p);
  noter(repete.issue === "CAUTION" && (await caution(q.id))?.retenu === "150.00", "constat répété : rien de plus");

  console.log("--- 7. réservation annulée, caution à 0 €");
  const n = await reserver(p, "armu", samediDans(14), "carte");
  await envoyer(m);
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${n.id}::uuid`);
  b = await traiterCautions(aParis(ajouterJours(departDe(n), -1), "18:00"), p);
  noter((await resaEnBase(n.id)).pm === null && (await caution(n.id)) === null, "annulée : carte supprimée tout de suite, rien n'est bloqué", b);
  const zero = await reserver(p, "laphine", samediDans(14), "carte");
  await envoyer(m);
  await db.execute(sql`update reservations set caution = 0 where id = ${zero.id}::uuid`);
  const d0 = departDe(zero);
  await traiterCautions(aParis(ajouterJours(d0, -1), "18:00"), p);
  noter((await caution(zero.id)) === null && (await etatCaution(zero.id)) === null, "caution à 0 € : rien n'est bloqué, aucun bloc");
  await traiterCautions(aParis(ajouterJours(d0, 6), "12:00"), p);
  noter((await resaEnBase(zero.id)).pm !== null, "6 jours après le départ : carte encore gardée");
  await traiterCautions(aParis(ajouterJours(d0, 7), "00:15"), p);
  noter((await resaEnBase(zero.id)).pm === null, "7 jours après le départ : carte supprimée");

  console.log("--- 8. caution non constituée à l'arrivée (article 6.6)");
  const k = await reserver(p, "maison-vieille", samediDans(14), "cheque");
  await envoyer(m);
  noter((await etatCaution(k.id)) === null, "caution par chèque : aucun bloc de caution");
  const dmd = await demanderCarteCaution(k.id);
  noter(dmd.ok && (await resaEnBase(k.id)).demandee !== null, "le lien « enregistrer une carte » est demandé", dmd);
  let envoisK = await envoyer(m);
  const lienCarte = envoisK.find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    !!lienCarte && lienCarte.texte.includes("Le chèque de caution") && lienCarte.texte.includes("article 6.6") &&
      lienCarte.texte.includes("Enregistrer ma carte"),
    "courriel : chèque non remis, article 6.6, bouton",
    lienCarte?.texte,
  );
  const ek = await etatCaution(k.id);
  noter(ek?.etat === "carte_a_enregistrer" && ek.moyen === "cheque", "page : carte à enregistrer", ek);
  noter((await ouvrirCaution(k.id, null, p)).ok === false, "sans texte d'accord, la carte n'est pas proposée");
  const accord = { id: (await db.execute(sql`select id from textes_accord where langue = 'fr' order by en_vigueur_depuis desc limit 1`)).rows[0].id as string, texte: "TEXTE D'ACCORD LU" };
  const ok = await ouvrirCaution(k.id, accord, p);
  noter(ok.ok && ok.mode === "enregistrement", "enregistrement de carte ouvert", ok);
  const rk = await resaEnBase(k.id);
  noter(rk.accord === "TEXTE D'ACCORD LU" && rk.customer !== null, "texte d'accord recopié sur la réservation, client Stripe enregistré", rk);
  const seti = [...p.enregistrements.values()].find((e) => e.reservationId === k.id)!;
  p.enregistrer(seti.id);
  const ik = await constaterEnregistrement(seti.id, p);
  noter(ik.issue === "CARTE_ENREGISTREE" && (await resaEnBase(k.id)).pm === `pm_${seti.id}`, "carte enregistrée sur la réservation", ik);
  noter((await constaterEnregistrement(seti.id, p)).issue === "CARTE_ENREGISTREE" && compter(await courrielsDe(k.id), "alerte_caution", "carte_enregistree") === 1, "constat répété : une seule alerte");
  envoisK = await envoyer(m);
  noter(envoisK.some((x) => x.sujet.startsWith("Carte enregistrée pour la caution") && x.texte.includes("à partir de 18 h 00")), "alerte « carte enregistrée » : préautorisation la veille à 18 h");
  noter((await etatCaution(k.id))?.etat === "prevue", "page : préautorisation prévue");
  noter((await demanderCarteCaution(k.id)).ok === false, "nouvelle demande refusée : carte déjà enregistrée");
  b = await traiterCautions(aParis(ajouterJours(departDe(k), -1), "18:00"), p);
  noter((await caution(k.id))?.statut === "bloque", "préautorisation la veille du départ, comme une caution par carte", b);
  await envoyer(m);

  console.log("--- 9. passage de la veille manqué");
  const w = await reserver(p, "armu", samediDans(16), "carte");
  await envoyer(m);
  b = await traiterCautions(aParis(departDe(w), "07:00"), p);
  noter((await caution(w.id))?.statut === "bloque", "rattrapé le matin du départ", b);
  await envoyer(m);

  console.log("--- 10. paiement contesté");
  await inscrireProbleme(db, "contestation", `dp_essai_${Date.now()}`, w.id, { paiementId: "pi_x", type: "acompte", montant: 17300, motif: "fraudulent" });
  const envoisC = await envoyer(m);
  const contest = envoisC.find((x) => x.sujet.startsWith("À TRAITER — paiement contesté"));
  noter(!!contest && contest.texte.includes("173,00 €") && contest.texte.includes("rubrique Litiges"), "alerte « paiement contesté » : montant, où répondre", contest?.texte);
}

// ─── Partie 2 : Stripe en mode test, trois cartes ────────────────────────────

async function partieStripe(): Promise<void> {
  console.log("--- 11. Stripe en mode test : trois cartes");
  const cle = process.env.STRIPE_SECRET_KEY ?? "";
  if (!cle.startsWith("sk_test_")) {
    noter(false, "clé Stripe de TEST absente de .env.local (STRIPE_SECRET_KEY) : caution réelle non vérifiée");
    return;
  }
  const stripe = new Stripe(cle);
  const p = STRIPE_REEL;
  remplacerPrestataire(p);

  /** Réservation confirmée par un vrai paiement (carte Visa de test, enregistrée). */
  const reserverReel = async (gite: Gite, arrivee: string) => {
    const t = await enregistrerTentative(
      gite,
      { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
      COORDONNEES,
      null,
      { moyenCaution: "carte", modeSolde: "lien" },
      "fr",
    );
    if (!t.ok) throw new Error(`tentative refusée : ${JSON.stringify(t)}`);
    const { paiementId } = await ouvrirPaiement(
      {
        reservationId: t.id, reference: t.reference, montant: t.devis.aRegler, paiementIntegral: false,
        enregistrerCarte: true, client: t.client, description: `essai caution ${t.reference}`,
      },
      p,
    );
    await stripe.paymentIntents.confirm(paiementId, { payment_method: "pm_card_visa", return_url: `${ORIGINE}/reserver/confirmation` });
    const issue = await constaterPaiement(paiementId, p);
    if (issue.issue !== "CONFIRMEE") throw new Error(`réservation non confirmée : ${JSON.stringify(issue)}`);
    return t;
  };
  /** Remplace la carte enregistrée par une carte de test (rattachée au même client Stripe). */
  const changerCarte = async (id: string, carte: string) => {
    const r = await resaEnBase(id);
    const pm = await stripe.paymentMethods.attach(carte, { customer: r.customer! });
    await db.execute(sql`update reservations set stripe_payment_method_id = ${pm.id} where id = ${id}::uuid`);
    return pm.id;
  };
  const detachee = async (pm: string) => (await stripe.paymentMethods.retrieve(pm)).customer === null;

  // Carte normale.
  const a = await reserverReel("armu", samediDans(22));
  const pmA = (await resaEnBase(a.id)).pm!;
  await traiterCautions(aParis(ajouterJours(departDe(a), -1), "18:30"), p);
  const cA = await caution(a.id);
  const piA = cA?.ref ? await stripe.paymentIntents.retrieve(cA.ref) : null;
  noter(
    cA?.statut === "bloque" && piA?.status === "requires_capture" && piA.capture_method === "manual" && piA.amount_received === 0,
    "carte normale : préautorisation chez Stripe (à encaisser, rien de débité)",
    { cA, statut: piA?.status },
  );
  noter(!!cA?.expire && new Date(cA.expire).getTime() > Date.now(), "date limite de la banque lue chez Stripe et enregistrée", cA?.expire);
  noter((await etatCaution(a.id))?.etat === "bloquee", "ce que voit le client : caution bloquée");
  await traiterCautions(aParis(ajouterJours(departDe(a), 3), "08:30"), p);
  noter((await caution(a.id))?.statut === "libere" && (await stripe.paymentIntents.retrieve(cA!.ref!)).status === "canceled", "levée : préautorisation annulée chez Stripe");
  noter(await detachee(pmA), "la carte n'est plus attachée au client Stripe");
  noter((await etatCaution(a.id))?.etat === "levee", "ce que voit le client : caution levée");

  // 4000 0027 6000 3184 : authentification toujours exigée.
  const b = await reserverReel("laphine", samediDans(22));
  const pmB = await changerCarte(b.id, "pm_card_authenticationRequired");
  await traiterCautions(aParis(ajouterJours(departDe(b), -1), "18:30"), p);
  const cB = await caution(b.id);
  noter(cB?.statut === "echoue", "carte 3184 : préautorisation refusée hors session (authentification exigée)", cB);
  noter(compter(await courrielsDe(b.id), "caution_a_valider") === 1 && compter(await courrielsDe(b.id), "alerte_probleme", "caution_refusee") === 1, "lien au client et alerte « À TRAITER »");
  noter((await etatCaution(b.id))?.etat === "a_valider", "ce que voit le client : caution à valider");
  const oB = await ouvrirCaution(b.id, null, p);
  noter(oB.ok && oB.mode === "paiement" && oB.clientSecret.startsWith(cB?.ref ?? "?"), "validation : la même préautorisation", oB.ok);
  // Le client valide sur sa page avec une autre carte (la fenêtre 3-D Secure ne se rejoue pas sans navigateur).
  await stripe.paymentIntents.confirm(cB!.ref!, { payment_method: "pm_card_visa", return_url: `${ORIGINE}/suivi` });
  const rB = await constaterRetour(cB!.ref!, oB.ok ? oB.clientSecret : "", p);
  noter(rB?.issue.issue === "CAUTION" && (await caution(b.id))?.statut === "bloque", "après validation : caution bloquée", rB?.issue);
  await traiterCautions(aParis(ajouterJours(departDe(b), 3), "08:30"), p);
  noter((await caution(b.id))?.statut === "libere" && (await detachee(pmB)), "levée, carte détachée");

  // Carte refusée (rattachée, mais tout paiement échoue).
  const c = await reserverReel("maison-vieille", samediDans(22));
  const pmC = await changerCarte(c.id, "pm_card_chargeCustomerFail");
  await traiterCautions(aParis(ajouterJours(departDe(c), -1), "18:30"), p);
  const cC = await caution(c.id);
  noter(cC?.statut === "echoue", "carte refusée : préautorisation refusée", cC);
  const [refus] = (await db.execute(sql`select donnees->>'refus' as refus from courriels where reservation_id = ${c.id}::uuid and objet = 'caution_a_valider'`)).rows as Array<{ refus: string | null }>;
  noter(!!refus?.refus && refus.refus !== "authentication_required", "code de refus de la banque enregistré", refus);
  await traiterCautions(aParis(ajouterJours(departDe(c), 3), "08:30"), p);
  noter((await caution(c.id))?.statut === "annule" && (await detachee(pmC)), "à la levée : close, carte détachée");
}

// ─── Partie 3 : par le serveur ───────────────────────────────────────────────

async function partieHttp(): Promise<void> {
  const base = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
  console.log(`--- 12. par le serveur (${base})`);
  const valider = async (corps: unknown) =>
    (await fetch(`${base}/api/suivi/caution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    })).status;
  noter((await valider({ jeton: "0".repeat(64) })) === 404, "valider la caution avec un lien inconnu : 404");
  noter((await valider({})) === 400, "sans jeton : 400");
  // Une réservation dont la caution est bloquée : la page le dit.
  const [r] = (await db.execute(sql`
    select r.jeton_suivi as jeton from reservations r join paiements p on p.reservation_id = r.id
     where r.client_email = ${EMAIL_ESSAI} and p.type = 'caution' and p.statut = 'bloque' limit 1`)).rows as Array<{ jeton: string }>;
  if (!r) {
    noter(false, "aucune caution bloquée à afficher");
    return;
  }
  const page = await (await fetch(`${base}/suivi/${r.jeton}`)).text();
  noter(page.includes("Votre caution") && page.includes("Bloquée") && page.includes("aucune somme n&#x27;est débitée"), "page « Ma réservation » : bloc « Votre caution », bloquée");
  noter((await valider({ jeton: r.jeton })) === 409, "rien à valider sur une caution bloquée : 409");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et des paiements.');
  }
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  await nettoyer();
  try {
    await controles();
    if (process.argv.includes("--stripe")) await partieStripe();
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
