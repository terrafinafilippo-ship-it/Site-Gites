// Contrôle du SOLDE (Phase 4, lot 1, D-28), sur la base de TEST. Depuis D-41
// (14 novembre 2026), aucun paiement n'inscrit plus de facture : elle se fait
// sur demande du client (scripts/verifier-factures.ts) ; le courriel
// « facture » reste contrôlé ici (refus à l'émission, anglais).
//
// Le prestataire de paiement, la messagerie et l'émission des factures sont
// SIMULÉS (le moteur PDF ne se charge pas sous tsx ; la vraie facture est
// émise par le serveur, voir verifier-paiement.ts --http). La logique est la
// vraie, et le temps est fixé : chaque passage des tâches reçoit sa date.
//   1. prélèvement : préavis 7 jours avant, prélèvement le jour de la date
//      limite, une seule fois ; aucune facture (D-41) ;
//   2. prélèvement refusé : impayé (client et alerte) tout de suite, seconde
//      alerte 3 jours après, une seule ; le client paie ensuite par le lien,
//      sur le même paiement ;
//   3. lien : lien 7 jours avant, rappel la veille, impayé le lendemain de la
//      date limite ; paiement par le lien, réutilisé à chaque clic ; un
//      courriel d'impayé qui part après le paiement est abandonné ;
//   4. lien parti la veille de la date limite : pas de rappel le même jour ;
//   5. avis de Stripe arrivé avant la référence du prélèvement : à reprendre,
//      jamais remboursé ; le passage suivant termine, sans second prélèvement ;
//   6. prélèvement resté sans réponse plus de 20 heures : alerte, pas de rejeu ;
//   7. séjour payé en une fois, réservation annulée : rien ;
//   8. solde reçu pour une réservation annulée : remboursé, carte gardée,
//      alerte aux propriétaires seulement ;
//   9. facture refusée à l'émission : alerte « facture non émise » ;
//  10. les courriels : textes, pièce jointe, langue anglaise.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-solde.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import type { TypeFacture } from "../db/schema";
import type { Coordonnees } from "../lib/coordonnees";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis, jourSemaineIso } from "../lib/dates-civiles";
import type { ResultatFacture } from "../lib/factures";
import { remplacerMessagerie, type Envoi, type Message, type Messagerie } from "../lib/messagerie";
import { calculerMontants } from "../lib/montants";
import { constaterPaiement, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import { chargerReservationAvecGite } from "../lib/reservations";
import { dateLimiteSolde, lireEtatSolde, ouvrirSolde, traiterSoldes } from "../lib/solde";
import {
  PaiementIndisponible,
  remplacerPrestataire,
  type AvisPaiement,
  type EtatEnregistrement,
  type DemandePaiement,
  type DemandePrelevement,
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

const EMAIL_ESSAI = "solde@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const db = getDb();

// ─── Simulations ─────────────────────────────────────────────────────────────

class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();
  /** Prélèvements créés, par réservation (la clé d'idempotence de Stripe). */
  readonly prelevements = new Map<string, string>();
  readonly remboursements: string[] = [];
  readonly cartesOubliees: string[] = [];
  refuser = false;
  /** Le prélèvement est créé chez « Stripe » mais la réponse se perd. */
  reponsePerdue = false;
  /** Le prestataire ne répond pas du tout. */
  injoignable = false;

  private nouveau(montant: number, reservationId: string, type: string, statut: EtatPaiement["statut"]): EtatPaiement {
    this.n += 1;
    const id = `pi_solde_${this.n}_${Date.now()}`;
    const etat: EtatPaiement = {
      id, statut, montant, devise: "eur", customerId: null, paymentMethodId: null,
      reservationId, typePaiement: type, clientSecret: `${id}_secret_ok`, dernierRefus: statut === "echoue" ? "card_declined" : null, expireLe: null, montantEncaisse: 0,
    };
    this.paiements.set(id, etat);
    return etat;
  }

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    const e = this.nouveau(d.montant, d.reservationId, d.type, "en_attente");
    const customerId = d.enregistrerCarte ? `cus_${e.id}` : null;
    this.paiements.set(e.id, { ...e, customerId });
    return { id: e.id, clientSecret: `${e.id}_secret_ok`, customerId };
  }

  async prelever(d: DemandePrelevement): Promise<EtatPaiement> {
    if (this.injoignable) throw new PaiementIndisponible("prestataire injoignable (simulé)");
    let id = this.prelevements.get(d.reservationId);
    if (!id) {
      id = this.nouveau(d.montant, d.reservationId, "solde", this.refuser ? "echoue" : "reussi").id;
      this.prelevements.set(d.reservationId, id);
    }
    if (this.reponsePerdue) {
      this.reponsePerdue = false;
      throw new PaiementIndisponible("réponse perdue (simulé)");
    }
    return { ...this.paiements.get(id)! };
  }

  async lirePaiement(id: string): Promise<EtatPaiement> {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    return { ...e };
  }
  async annulerPaiement(id: string): Promise<EtatPaiement> {
    return this.lirePaiement(id);
  }
  async encaisserCaution(): Promise<EtatPaiement> {
    throw new Error("retenue de caution : hors de ce contrôle");
  }
  async rembourser(id: string): Promise<{ id: string }> {
    if (!this.remboursements.includes(id)) this.remboursements.push(id);
    return { id: `re_${id}` };
  }
  async oublierCarte(pm: string): Promise<void> {
    this.cartesOubliees.push(pm);
  }
  async oublierClient(): Promise<void> {}
  async bloquerCaution(): Promise<EtatPaiement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  async creerEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  async lireEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  lireAvis(): AvisPaiement | null {
    return null;
  }
  regler(id: string, statut: "reussi" | "echoue"): void {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    this.paiements.set(id, { ...e, statut, paymentMethodId: statut === "reussi" ? `pm_${id}` : e.paymentMethodId });
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

class EmetteurFactureSimule {
  readonly emises: string[] = [];
  refus = false;
  async emettre(reservationId: string, type: TypeFacture): Promise<ResultatFacture> {
    if (this.refus) return { ok: false, status: 409, message: "refus métier (simulé)." };
    const resa = await chargerReservationAvecGite(reservationId);
    if (!resa) return { ok: false, status: 404, message: "réservation introuvable" };
    const m = calculerMontants(resa);
    const cle = `${reservationId}:${type}`;
    if (!this.emises.includes(cle)) this.emises.push(cle);
    const numero = `FAC-SIMULE-${String(this.emises.indexOf(cle) + 1).padStart(3, "0")}`;
    const montant = type === "solde" ? m.solde : type === "total" ? m.totalTtc : m.acompte;
    return { ok: true, facture: { numero, type, montant, chemin: `factures/${numero}.pdf` } };
  }
  async pdf(): Promise<Buffer> {
    return Buffer.from("%PDF-simule");
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

/** Midi à Paris le jour `iso` (heure d'été ou d'hiver : le jour reste le bon). */
const midi = (iso: string) => new Date(`${iso}T11:00:00Z`);

const COORDONNEES: Coordonnees = {
  locataire: { civilite: "", prenom: "Camille", nom: "Solde" },
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

/** Une réservation payée (acompte), confirmée. */
async function reserver(
  p: PrestataireSimule,
  gite: "armu" | "laphine" | "maison-vieille",
  arrivee: string,
  reglement: { moyenCaution: string; modeSolde: string | null },
  langue: "fr" | "en" = "fr",
): Promise<Tentative> {
  const t = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    COORDONNEES,
    null,
    reglement,
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
  p.regler(paiementId, "reussi");
  const issue = await constaterPaiement(paiementId, p);
  if (issue.issue !== "CONFIRMEE") throw new Error(`réservation non confirmée : ${JSON.stringify(issue)}`);
  return t;
}

/**
 * Un passage des tâches le jour `iso` ; les courriels inscrits par ce passage
 * reçoivent ce jour pour date (le temps du contrôle n'est pas celui de l'horloge).
 */
async function passage(p: PrestataireSimule, iso: string) {
  const avant = new Date(Date.now() - 1000);
  const bilan = await traiterSoldes(midi(iso), p);
  // Seules les lignes nées pendant CE passage (à l'heure réelle) : celles déjà
  // datées d'un jour simulé (dans le futur) gardent leur date.
  const nees = sql`created_at between ${avant.toISOString()}::timestamptz and now() + interval '1 second'`;
  await db.execute(sql`update courriels set created_at = ${midi(iso).toISOString()}::timestamptz
                        where ${nees} and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);
  await db.execute(sql`update paiements set created_at = ${midi(iso).toISOString()}::timestamptz
                        where ${nees} and type = 'solde'
                          and reservation_id in (select id from reservations where client_email = ${EMAIL_ESSAI})`);
  return bilan;
}

interface LigneCourriel extends Record<string, unknown> {
  objet: string;
  cle: string;
  statut: string;
  genre: string | null;
  derniere_erreur: string | null;
}

async function courrielsDe(reservationId: string): Promise<LigneCourriel[]> {
  return (
    await db.execute(sql`
      select objet, cle, statut, donnees->>'genre' as genre, derniere_erreur
        from courriels where reservation_id = ${reservationId}::uuid order by created_at, cle`)
  ).rows as LigneCourriel[];
}

const compter = (lignes: LigneCourriel[], objet: string, genre?: string) =>
  lignes.filter((c) => c.objet === objet && (genre === undefined || c.genre === genre)).length;

async function lignesSolde(reservationId: string) {
  return (
    await db.execute(sql`
      select statut, montant::text as montant, reference_externe as ref, motif_remboursement as motif
        from paiements where reservation_id = ${reservationId}::uuid and type = 'solde' order by created_at`)
  ).rows as Array<{ statut: string; montant: string; ref: string | null; motif: string | null }>;
}

async function etatSolde(reservationId: string) {
  const resa = await chargerReservationAvecGite(reservationId);
  return resa ? lireEtatSolde(db, resa) : null;
}

async function limiteDe(t: Tentative): Promise<string> {
  const resa = await chargerReservationAvecGite(t.id);
  if (!resa) throw new Error("réservation absente");
  return dateLimiteSolde(resa);
}

const montantSolde = async (t: Tentative) => calculerMontants((await chargerReservationAvecGite(t.id))!).solde;

/** Envoie NOS courriels en attente (le client et les propriétaires). */
async function envoyer(m: MessagerieSimulee): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now()
                        where statut = 'a_envoyer' and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);
  await traiterCourriels(ORIGINE, 200);
  return m.vider();
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

// ─── Contrôles ───────────────────────────────────────────────────────────────

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  const m = new MessagerieSimulee();
  const f = new EmetteurFactureSimule();
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurFacture(f);
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });

  console.log("--- 1. prélèvement automatique");
  const a = await reserver(p, "armu", samediDans(10), { moyenCaution: "carte", modeSolde: "prelevement" });
  const limA = await limiteDe(a);
  const soldeA = await montantSolde(a);
  noter(compter(await courrielsDe(a.id), "facture") === 0, "paiement de l'acompte constaté : aucune facture inscrite (D-41)");
  await passage(p, ajouterJours(limA, -8));
  noter(compter(await courrielsDe(a.id), "solde_preavis") === 0, "8 jours avant la date limite : aucun préavis");
  await passage(p, ajouterJours(limA, -7));
  await passage(p, ajouterJours(limA, -7));
  noter(compter(await courrielsDe(a.id), "solde_preavis") === 1, "7 jours avant : un préavis, un seul malgré deux passages");
  const preavis = (await envoyer(m)).find((x) => x.etiquette === "solde_preavis");
  noter(
    !!preavis && preavis.sujet.startsWith("Prélèvement du solde le ") && preavis.texte.includes("sera prélevé le") &&
      preavis.texte.includes("Vous n'avez rien à faire."),
    "préavis envoyé : « Prélèvement du solde le … », la date et « Vous n'avez rien à faire. »",
    preavis?.sujet,
  );
  noter((await etatSolde(a.id))?.etat === "prelevement_prevu", "« Ma réservation » : prélèvement prévu");
  noter((await ouvrirSolde(a.id, p)).ok === false, "le lien ne s'ouvre pas avant la date d'un prélèvement prévu");
  await passage(p, ajouterJours(limA, -1));
  noter((await lignesSolde(a.id)).length === 0, "la veille : rien n'est prélevé");
  const bA = await passage(p, limA);
  const lA = await lignesSolde(a.id);
  noter(
    bA.preleves >= 1 && lA.length === 1 && lA[0].statut === "reussi" && lA[0].ref?.startsWith("pi_solde_") === true,
    "le jour de la date limite : prélevé, paiement « réussi » avec sa référence",
    lA,
  );
  noter(Number(lA[0]?.montant.replace(".", "")) === soldeA, `montant prélevé = solde (${soldeA} centimes)`, lA[0]?.montant);
  await passage(p, limA);
  await passage(p, ajouterJours(limA, 1));
  noter(p.prelevements.size === 1 && (await lignesSolde(a.id)).length === 1, "passages suivants : aucun second prélèvement");
  const cA = await courrielsDe(a.id);
  noter(compter(cA, "facture") === 0, "solde reçu : aucune facture inscrite (D-41)");
  noter(compter(cA, "solde_impaye") === 0 && compter(cA, "alerte_probleme") === 0, "aucun impayé, aucune alerte");
  noter((await etatSolde(a.id))?.etat === "paye", "« Ma réservation » : solde payé");

  const envA = await envoyer(m);
  noter(!envA.some((x) => x.etiquette === "facture"), "aucune facture envoyée (D-41 : sur demande du client)", envA.map((x) => x.etiquette));

  console.log("--- 2. prélèvement refusé");
  const b = await reserver(p, "laphine", samediDans(10), { moyenCaution: "carte", modeSolde: "prelevement" });
  const limB = await limiteDe(b);
  p.refuser = true;
  const bB = await passage(p, limB);
  p.refuser = false;
  const cB = await courrielsDe(b.id);
  noter(bB.refuses >= 1 && (await lignesSolde(b.id))[0]?.statut === "echoue", "refus de la banque : paiement « échoué »");
  noter(
    compter(cB, "solde_impaye") === 1 && compter(cB, "alerte_probleme", "solde_impaye") === 1,
    "impayé tout de suite : courriel au client et alerte aux propriétaires",
    cB.map((c) => c.cle),
  );
  await passage(p, ajouterJours(limB, 1));
  await passage(p, ajouterJours(limB, 2));
  noter(compter(await courrielsDe(b.id), "alerte_probleme", "solde_impaye") === 1, "1 et 2 jours après : pas de seconde alerte");
  await passage(p, ajouterJours(limB, 3));
  await passage(p, ajouterJours(limB, 4));
  noter(compter(await courrielsDe(b.id), "alerte_probleme", "solde_impaye") === 2, "3 jours après : seconde alerte, une seule");
  noter(p.prelevements.size === 2, "aucun nouveau prélèvement après un refus");
  const envB = await envoyer(m);
  const impB = envB.find((x) => x.etiquette === "solde_impaye");
  noter(
    !!impB && impB.sujet.startsWith("Solde non réglé") && impB.texte.includes("a été refusé par votre banque") &&
      impB.texte.includes("Payer le solde"),
    "courriel au client : refus de la banque, bouton « Payer le solde »",
    impB?.texte,
  );
  // Les deux alertes partent au même passage d'envoi : leur ordre n'est pas garanti.
  const alerteB = envB.filter((x) => x.etiquette === "alerte_probleme" && x.sujet.includes("solde"));
  const premiere = alerteB.find((x) => x.sujet.startsWith("À TRAITER — solde impayé"));
  const seconde = alerteB.find((x) => x.sujet.startsWith("À TRAITER — solde toujours impayé"));
  noter(
    alerteB.length === 2 && !!premiere && premiere.texte.includes("card_declined") && premiere.texte.includes("article 5.3") &&
      !!seconde && seconde.texte.includes("3 jours après"),
    "alertes : « solde impayé » (code de refus, article 5.3) et « solde toujours impayé »",
    alerteB.map((x) => x.sujet),
  );
  const ouvB = await ouvrirSolde(b.id, p);
  const piB = p.prelevements.get(b.id);
  noter(ouvB.ok && ouvB.clientSecret === `${piB}_secret_ok`, "le client paie par le lien : le MÊME paiement que le prélèvement refusé", ouvB);
  p.regler(piB!, "reussi");
  noter((await constaterPaiement(piB!, p)).issue === "SOLDE_RECU", "paiement constaté : « solde reçu »");
  noter((await etatSolde(b.id))?.etat === "paye" && (await lignesSolde(b.id)).length === 1, "solde payé, toujours une seule ligne");
  noter(compter(await courrielsDe(b.id), "facture") === 0, "aucune facture inscrite (D-41)");

  console.log("--- 3. paiement par le lien");
  const c = await reserver(p, "maison-vieille", samediDans(10), { moyenCaution: "cheque", modeSolde: "lien" });
  const limC = await limiteDe(c);
  await passage(p, ajouterJours(limC, -8));
  noter(compter(await courrielsDe(c.id), "solde_lien") === 0, "8 jours avant : rien");
  await passage(p, ajouterJours(limC, -7));
  noter(compter(await courrielsDe(c.id), "solde_lien") === 1, "7 jours avant : le lien");
  await passage(p, ajouterJours(limC, -2));
  noter(compter(await courrielsDe(c.id), "solde_rappel") === 0, "2 jours avant : pas de rappel");
  await passage(p, ajouterJours(limC, -1));
  await passage(p, ajouterJours(limC, -1));
  noter(compter(await courrielsDe(c.id), "solde_rappel") === 1, "la veille : un rappel, un seul");
  await passage(p, limC);
  noter(compter(await courrielsDe(c.id), "solde_impaye") === 0, "le jour de la date limite : pas encore impayé");
  const envC = await envoyer(m);
  const lienC = envC.find((x) => x.etiquette === "solde_lien");
  const rappelC = envC.find((x) => x.etiquette === "solde_rappel");
  noter(
    !!lienC && lienC.sujet.startsWith("Solde à régler au plus tard le ") && lienC.texte.includes("Payer le solde") &&
      lienC.texte.includes(`${ORIGINE}/suivi/`),
    "lien : « Solde à régler au plus tard le … », bouton vers « Ma réservation »",
    lienC?.sujet,
  );
  noter(!!rappelC && rappelC.sujet.startsWith("Rappel : solde à régler"), "rappel : « Rappel : solde à régler … »", rappelC?.sujet);
  await passage(p, ajouterJours(limC, 1));
  const cC = await courrielsDe(c.id);
  noter(
    compter(cC, "solde_impaye") === 1 && compter(cC, "alerte_probleme", "solde_impaye") === 1,
    "le lendemain de la date limite : impayé (client et alerte)",
  );
  const o1 = await ouvrirSolde(c.id, p);
  const o2 = await ouvrirSolde(c.id, p);
  noter(o1.ok && o2.ok && o1.clientSecret === o2.clientSecret && (await lignesSolde(c.id)).length === 1, "deux clics : le même paiement, une seule ligne", [o1, o2]);
  const piC = o1.ok ? o1.clientSecret.replace("_secret_ok", "") : "";
  p.regler(piC, "echoue");
  noter((await constaterPaiement(piC, p)).issue === "ECHOUE", "carte refusée sur la page : « échoué », rien d'autre");
  p.regler(piC, "reussi");
  noter((await constaterPaiement(piC, p)).issue === "SOLDE_RECU", "nouvel essai réussi : « solde reçu »");
  await passage(p, ajouterJours(limC, 4));
  noter(compter(await courrielsDe(c.id), "alerte_probleme", "solde_impaye") === 1, "solde payé : plus aucune relance");
  const envC2 = await envoyer(m);
  noter(
    !envC2.some((x) => x.etiquette === "solde_impaye") && !envC2.some((x) => x.etiquette === "facture"),
    "l'impayé encore en attente ne part pas (payé entre-temps) ; aucune facture (D-41)",
    envC2.map((x) => x.etiquette),
  );
  noter(
    (await courrielsDe(c.id)).some((x) => x.objet === "solde_impaye" && x.statut === "echec" && x.derniere_erreur === "solde payé entre-temps"),
    "… et il est noté « solde payé entre-temps »",
  );

  console.log("--- 4. lien parti la veille");
  const d = await reserver(p, "armu", samediDans(12), { moyenCaution: "virement", modeSolde: "lien" });
  const limD = await limiteDe(d);
  await passage(p, ajouterJours(limD, -1));
  await passage(p, limD);
  const cD = await courrielsDe(d.id);
  noter(compter(cD, "solde_lien") === 1 && compter(cD, "solde_rappel") === 0, "lien parti la veille : pas de rappel en plus", cD.map((x) => x.cle));

  console.log("--- 5. avis de Stripe avant la référence du prélèvement");
  const e = await reserver(p, "laphine", samediDans(12), { moyenCaution: "carte", modeSolde: "prelevement" });
  const limE = await limiteDe(e);
  p.reponsePerdue = true;
  const bE = await passage(p, limE);
  const lE = await lignesSolde(e.id);
  noter(bE.erreurs === 1 && lE.length === 1 && lE[0].ref === null && lE[0].statut === "en_attente", "réponse perdue : la trace reste, sans référence", lE);
  const piE = p.prelevements.get(e.id)!;
  let repris = false;
  try {
    await constaterPaiement(piE, p);
  } catch {
    repris = true;
  }
  noter(repris && !p.remboursements.includes(piE), "avis de Stripe arrivé avant : « à reprendre », rien n'est remboursé");
  noter((await etatSolde(e.id))?.etat === "en_cours", "« Ma réservation » : paiement en cours");
  await passage(p, limE);
  const lE2 = await lignesSolde(e.id);
  noter(lE2.length === 1 && lE2[0].ref === piE && lE2[0].statut === "reussi", "passage suivant : même paiement, référence inscrite, payé", lE2);
  noter((await constaterPaiement(piE, p)).issue === "SOLDE_RECU", "l'avis de Stripe repris : « solde reçu »");

  console.log("--- 6. prélèvement sans réponse depuis plus de 20 heures");
  const g = await reserver(p, "maison-vieille", samediDans(12), { moyenCaution: "carte", modeSolde: "prelevement" });
  const limG = await limiteDe(g);
  p.injoignable = true;
  await passage(p, limG);
  p.injoignable = false;
  noter((await lignesSolde(g.id))[0]?.ref === null, "prestataire injoignable : la trace reste, sans référence");
  await db.execute(sql`update paiements set created_at = ${midi(limG).toISOString()}::timestamptz - interval '21 hours'
                        where reservation_id = ${g.id}::uuid and type = 'solde'`);
  const avantG = p.prelevements.size;
  await passage(p, limG);
  const cG = await courrielsDe(g.id);
  noter(p.prelevements.size === avantG && compter(cG, "alerte_probleme", "solde_a_verifier") === 1, "21 heures après : aucun rejeu ; alerte « à vérifier dans Stripe »", cG.map((x) => x.cle));
  await passage(p, limG);
  noter(compter(await courrielsDe(g.id), "alerte_probleme", "solde_a_verifier") === 1, "… une seule alerte");

  console.log("--- 7. ce qui ne se suit pas");
  const integral = await reserver(p, "armu", samediDans(1), { moyenCaution: "carte", modeSolde: "prelevement" });
  noter(compter(await courrielsDe(integral.id), "facture") === 0, "séjour payé en une fois : aucune facture inscrite (D-41)");
  await passage(p, aujourdhuiParis());
  noter(
    (await courrielsDe(integral.id)).every((x) => !x.objet.startsWith("solde_")) && (await lignesSolde(integral.id)).length === 0,
    "séjour payé en une fois : aucun courriel du solde, aucun prélèvement",
  );
  const h = await reserver(p, "laphine", samediDans(14), { moyenCaution: "cheque", modeSolde: "lien" });
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${h.id}::uuid`);
  await passage(p, ajouterJours(await limiteDe(h), -7));
  noter(compter(await courrielsDe(h.id), "solde_lien") === 0, "réservation annulée : aucun lien");

  console.log("--- 8. solde reçu pour une réservation annulée");
  const i = await reserver(p, "maison-vieille", samediDans(14), { moyenCaution: "carte", modeSolde: "lien" });
  const oI = await ouvrirSolde(i.id, p);
  const piI = oI.ok ? oI.clientSecret.replace("_secret_ok", "") : "";
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${i.id}::uuid`);
  p.regler(piI, "reussi");
  const issueI = await constaterPaiement(piI, p);
  noter(issueI.issue === "REMBOURSEE" && issueI.remboursementFait && p.remboursements.includes(piI), "solde reçu, réservation annulée : remboursé", issueI);
  const cI = await courrielsDe(i.id);
  noter(
    compter(cI, "remboursement") === 0 && compter(cI, "alerte_probleme", "remboursement") === 1,
    "aucun courriel « réservation non enregistrée » au client ; alerte aux propriétaires",
    cI.map((x) => x.cle),
  );
  const carteI = await db.execute(sql`select stripe_payment_method_id as pm from reservations where id = ${i.id}::uuid`);
  noter(
    !p.cartesOubliees.includes(`pm_${piI}`) && (carteI.rows[0] as { pm: string | null }).pm !== null,
    "la carte enregistrée est gardée (caution)",
  );

  console.log("--- 9. facture refusée à l'émission");
  const j = await reserver(p, "armu", samediDans(16), { moyenCaution: "cheque", modeSolde: "lien" });
  await envoyer(m);
  await db.execute(sql`delete from courriels where reservation_id = ${j.id}::uuid and objet = 'facture'`);
  await db.execute(sql`insert into courriels (objet, cle, reservation_id, destinataire, langue, donnees)
                        values ('facture', ${`facture:${j.id}:acompte`}, ${j.id}::uuid, ${EMAIL_ESSAI}, 'fr', '{"type":"acompte"}')`);
  f.refus = true;
  const envJ = [...(await envoyer(m)), ...(await envoyer(m))];
  f.refus = false;
  const cJ = await courrielsDe(j.id);
  noter(
    cJ.some((x) => x.objet === "facture" && x.statut === "echec") && compter(cJ, "alerte_probleme", "facture_non_emise") === 1,
    "refus : courriel abandonné, alerte « facture non émise »",
    cJ.map((x) => `${x.cle} ${x.statut}`),
  );
  noter(
    envJ.some((x) => x.sujet.startsWith("À TRAITER — facture non émise")) && !envJ.some((x) => x.etiquette === "facture"),
    "l'alerte part aux propriétaires ; aucune facture au client",
    envJ.map((x) => x.sujet),
  );

  console.log("--- 10. en anglais");
  const k = await reserver(p, "laphine", samediDans(16), { moyenCaution: "carte", modeSolde: "prelevement" }, "en");
  const limK = await limiteDe(k);
  await passage(p, ajouterJours(limK, -7));
  const envK = (await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI);
  await passage(p, limK);
  // La facture du séjour, demandée par le client (D-41) : inscrite comme le fait le back-office.
  await db.execute(sql`insert into courriels (objet, cle, reservation_id, destinataire, langue, donnees)
                        values ('facture', ${`facture:${k.id}:total:essai`}, ${k.id}::uuid, ${EMAIL_ESSAI}, 'en', '{"type":"total"}')`);
  envK.push(...(await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI));
  const preavisK = envK.find((x) => x.etiquette === "solde_preavis");
  const factureK = envK.find((x) => x.etiquette === "facture" && x.texte.includes("paid in full"));
  noter(!!preavisK && preavisK.sujet.startsWith("Balance payment on "), "préavis en anglais", preavisK?.sujet);
  noter(
    !!factureK && factureK.sujet.startsWith("Your invoice ") && factureK.texte.includes("(PDF, in French)"),
    "facture en anglais, annoncée en français",
    factureK?.sujet,
  );
}

// ─── Par le serveur (--http) ─────────────────────────────────────────────────

async function partieHttp(): Promise<void> {
  const base = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
  console.log(`--- 11. par le serveur (${base})`);
  const taches = await fetch(`${base}/api/taches`, { method: "POST", headers: { "x-taches-secret": "faux" } });
  noter(taches.status === 401 || taches.status === 503, "réveil avec un faux secret : refusé (401, ou 503 sans secret configuré)", taches.status);
  const solde = async (corps: unknown) =>
    (await fetch(`${base}/api/suivi/solde`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    })).status;
  noter((await solde({ jeton: "0".repeat(64) })) === 404, "payer le solde avec un lien inconnu : 404");
  noter((await solde({})) === 400, "sans jeton : 400");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et des paiements.');
  }
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  await nettoyer();
  try {
    await controles();
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
