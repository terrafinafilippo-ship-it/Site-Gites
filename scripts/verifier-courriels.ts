// Contrôle des COURRIELS du site (Phase 3, lot 4), sur la base de TEST.
//
// Tout est SIMULÉ : le prestataire de paiement, la messagerie (rien ne part,
// les messages sont gardés en mémoire) et l'émission du contrat (le moteur PDF
// ne se charge pas sous tsx ; le vrai contrat est vérifié par le serveur, dans
// verifier-paiement.ts --http). La logique, elle, est la vraie :
//   1. paiement constaté deux fois → UNE confirmation, UNE alerte « réservation » ;
//   2. envoi : contrat créé juste avant, lien de signature dans le courriel,
//      lien « Ma réservation » en second bouton,
//      faits de la réservation, expéditeur et adresse de réponse des réglages ;
//      l'alerte cite le numéro du contrat ; un second passage n'envoie rien ;
//   3. client anglophone : courriel en anglais, contrat annoncé en français ;
//   4. panne d'envoi : nouvel essai plus tard ; échec définitif → alerte
//      « À TRAITER — courriel non parti » ;
//   5. contrat impossible à créer : la confirmation part sans le lien au
//      troisième essai, alerte, puis courriel « contrat à signer » quand la
//      création aboutit ;
//   6. paiement intégral : contrat créé et envoyé comme les autres (lot 5) ;
//   7. paiement arrivé sur des dates reprises : courriel de remboursement et
//      alerte ; paiement inconnu du site : alerte seule ;
//   8. alerte « contrat signé » ; alerte coupée : rien n'est inscrit ;
//   9. garde des adresses de test et texte échappé dans le HTML.
// Depuis la Phase 4 (lot 1), chaque paiement inscrit aussi sa facture
// (émission simulée ici, contrôlée par scripts/verifier-solde.ts).
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les alertes de la base de test sont
// dirigées vers une adresse réservée aux essais.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-courriels.ts
import "../db/env";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import type { ContratEmis, ResultatEmission } from "../lib/contrat";
import { inscrireSignature } from "../lib/courriels";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { texteConfirmation } from "../lib/courriels-textes";
import type { Coordonnees } from "../lib/coordonnees";
import { ajouterJours, aujourdhuiParis, jourSemaineIso } from "../lib/dates-civiles";
import {
  adresseDeTest,
  MessagerieDuSite,
  MessagerieFichier,
  remplacerMessagerie,
  type Envoi,
  type Message,
  type Messagerie,
} from "../lib/messagerie";
import { constaterPaiement, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import {
  remplacerPrestataire,
  type AvisPaiement,
  type EtatEnregistrement,
  type DemandePaiement,
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

const EMAIL_ESSAI = "courriels@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const db = getDb();

// ─── Simulations ─────────────────────────────────────────────────────────────

class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    this.n += 1;
    const id = `pi_courriel_${this.n}_${Date.now()}`;
    this.paiements.set(id, {
      id, statut: "en_attente", montant: d.montant, devise: "eur",
      customerId: d.enregistrerCarte ? `cus_${this.n}` : null, paymentMethodId: null,
      reservationId: d.reservationId, typePaiement: d.type, clientSecret: `${id}_secret`, dernierRefus: null, expireLe: null, montantEncaisse: 0,
    });
    return { id, clientSecret: `${id}_secret`, customerId: d.enregistrerCarte ? `cus_${this.n}` : null };
  }
  async prelever(): Promise<EtatPaiement> {
    throw new Error("prélèvement non simulé ici (scripts/verifier-solde.ts)");
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
    return { id: `re_${id}` };
  }
  async oublierCarte(): Promise<void> {}
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
  payer(id: string): void {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    this.paiements.set(id, { ...e, statut: "reussi", paymentMethodId: `pm_${id}` });
  }
  orphelin(montant: number): string {
    const id = `pi_courriel_orphelin_${Date.now()}`;
    this.paiements.set(id, {
      id, statut: "reussi", montant, devise: "eur", customerId: null, paymentMethodId: null,
      reservationId: null, typePaiement: null, clientSecret: `${id}_secret`, dernierRefus: null, expireLe: null, montantEncaisse: 0,
    });
    return id;
  }
}

class MessagerieSimulee implements Messagerie {
  readonly envoyes: Message[] = [];
  /** Destinataires en panne : nombre d'échecs restants (Infinity : toujours). */
  readonly pannes = new Map<string, number>();

  async envoyer(m: Message): Promise<Envoi> {
    const restant = this.pannes.get(m.destinataire) ?? 0;
    if (restant > 0) {
      this.pannes.set(m.destinataire, restant - 1);
      throw new Error("Brevo injoignable (simulé)");
    }
    this.envoyes.push(m);
    return { voie: "fichier", reference: `simule-${this.envoyes.length}` };
  }
  vider(): Message[] {
    return this.envoyes.splice(0);
  }
}

class EmetteurSimule {
  emis = 0;
  enPanne = false;
  private readonly contrats = new Map<string, ContratEmis>();

  async emettre(reservationId: string): Promise<ResultatEmission> {
    if (this.enPanne) return { ok: false, status: 502, message: "Rendu PDF échoué (simulé)" };
    const deja = this.contrats.get(reservationId);
    if (deja) return { ok: true, contrat: deja };
    this.emis += 1;
    const contrat = { id: `doc-${this.emis}`, numero: `CTR-SIMULE-${String(this.emis).padStart(3, "0")}`, token: `jeton${this.emis}` };
    this.contrats.set(reservationId, contrat);
    return { ok: true, contrat };
  }
  async existant(reservationId: string): Promise<ContratEmis | null> {
    return this.contrats.get(reservationId) ?? null;
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

const COORDONNEES: Coordonnees = {
  locataire: { civilite: "", prenom: "Camille", nom: "Essai" },
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

async function tenter(
  gite: "armu" | "laphine" | "maison-vieille",
  arrivee: string,
  reglement: { moyenCaution: string; modeSolde: string | null },
  langue: "fr" | "en" = "fr",
): Promise<Tentative> {
  const r = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    COORDONNEES,
    null,
    reglement,
    langue,
  );
  if (!r.ok) throw new Error(`tentative refusée (${gite}, ${arrivee}) : ${JSON.stringify(r)}`);
  return r;
}

async function payer(t: Tentative, p: PrestataireSimule): Promise<string> {
  const { paiementId } = await ouvrirPaiement(
    {
      reservationId: t.id, reference: t.reference, montant: t.devis.aRegler,
      paiementIntegral: t.devis.paiementIntegral, enregistrerCarte: carteEnregistree(t.choix),
      client: t.client, description: `essai ${t.reference}`,
    },
    p,
  );
  p.payer(paiementId);
  await constaterPaiement(paiementId, p);
  return paiementId;
}

interface LigneCourriel extends Record<string, unknown> {
  objet: string;
  destinataire: string;
  statut: string;
  tentatives: number;
  voie: string | null;
  sujet: string | null;
  genre: string | null;
}

async function courrielsDe(reservationId: string | null, paiementId?: string): Promise<LigneCourriel[]> {
  const filtre = reservationId
    ? sql`reservation_id = ${reservationId}::uuid`
    : sql`reservation_id is null and donnees->>'paiementId' = ${paiementId ?? ""}`;
  return (
    await db.execute(sql`
      select objet, destinataire, statut, tentatives, voie, sujet, donnees->>'genre' as genre
        from courriels where ${filtre} order by created_at, objet`)
  ).rows as LigneCourriel[];
}

/** Rend dus NOS courriels en attente (sans attendre le délai du nouvel essai). */
const rendreDus = () =>
  db.execute(sql`update courriels set prochain_essai_at = now()
                  where statut = 'a_envoyer' and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids})
                         or (reservation_id is null and donnees->>'paiementId' like 'pi_courriel_%')
                         or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

// ─── Contrôles ───────────────────────────────────────────────────────────────

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  const m = new MessagerieSimulee();
  const e = new EmetteurSimule();
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurContrat(e);
  remplacerEmetteurFacture({
    emettre: async (_id, type) => ({
      ok: true,
      facture: { numero: "FAC-SIMULE-001", type, montant: 0, chemin: "factures/FAC-SIMULE-001.pdf" },
    }),
    pdf: async () => Buffer.from("%PDF-simule"),
  });

  console.log("--- 1. paiement constaté : inscription");
  const a = await tenter("armu", samediDans(30), { moyenCaution: "carte", modeSolde: "prelevement" });
  const piA = await payer(a, p);
  await constaterPaiement(piA, p);
  await Promise.all([constaterPaiement(piA, p), constaterPaiement(piA, p)]);
  const inscrits = await courrielsDe(a.id);
  noter(
    inscrits.filter((c) => c.objet === "confirmation").length === 1 &&
      inscrits.filter((c) => c.objet === "alerte_reservation").length === 1 &&
      inscrits.filter((c) => c.objet === "facture").length === 1 &&
      inscrits.length === 3,
    "paiement constaté quatre fois : une confirmation, une alerte « réservation » et une facture, pas plus",
    inscrits.map((c) => c.objet),
  );
  noter(
    inscrits.find((c) => c.objet === "confirmation")?.destinataire === EMAIL_ESSAI &&
      inscrits.find((c) => c.objet === "alerte_reservation")?.destinataire === PROPRIETAIRES,
    "confirmation au client, alerte aux destinataires réglés",
    inscrits.map((c) => c.destinataire),
  );
  noter(inscrits.every((c) => c.statut === "a_envoyer"), "rien n'est envoyé pendant le constat : tout attend l'envoi");

  console.log("--- 2. envoi : contrat, lien, faits, adresses");
  const bilan = await traiterCourriels(ORIGINE);
  const envoyes = m.vider();
  const conf = envoyes.find((x) => x.destinataire === EMAIL_ESSAI && x.etiquette === "confirmation");
  const alerte = envoyes.find((x) => x.destinataire === PROPRIETAIRES);
  noter(
    bilan.envoyes === 3 && envoyes.length === 3 && envoyes.some((x) => x.etiquette === "facture") && e.emis === 1,
    "trois courriels envoyés (confirmation, alerte, facture), un contrat créé",
    { bilan, emis: e.emis },
  );
  noter(
    conf?.sujet.startsWith(`Réservation ${a.reference} confirmée — L'Armu, `) === true,
    "sujet : « Réservation … confirmée — L'Armu, dates »",
    conf?.sujet,
  );
  noter(
    conf?.texte.includes("Signer mon contrat\nhttps://site.example/signer/jeton1") === true &&
      conf.html.includes('href="https://site.example/signer/jeton1"'),
    "lien de signature du contrat créé, dans le texte et le bouton",
    conf?.texte,
  );
  const [{ jeton }] = (
    await db.execute(sql`select jeton_suivi as jeton from reservations where id = ${a.id}::uuid`)
  ).rows as { jeton: string }[];
  noter(
    conf?.texte.includes(`Voir ma réservation\nhttps://site.example/suivi/${jeton}`) === true &&
      conf.html.includes(`href="https://site.example/suivi/${jeton}"`) &&
      conf.texte.indexOf("Signer mon contrat") < conf.texte.indexOf("Voir ma réservation"),
    "second bouton « Voir ma réservation », sous celui du contrat, avec le lien secret",
    conf?.texte,
  );
  noter(
    conf?.texte.includes("Votre réservation est confirmée.") === true &&
      conf.texte.includes(`Référence : ${a.reference}`) &&
      conf.texte.includes("Payé aujourd'hui : ") &&
      conf.texte.includes("(acompte)") &&
      conf.texte.includes("par prélèvement automatique") &&
      conf.texte.includes("Caution : ") &&
      conf.texte.startsWith("Bonjour Camille,"),
    "les faits : référence, payé, solde prélevé, caution ; « Bonjour Camille, »",
    conf?.texte,
  );
  noter(
    conf?.expediteur.email === "reservation@gitesdesamoyas.fr" &&
      conf.expediteur.nom === "Les Gîtes de Samoyas" &&
      conf.repondreA === "contact@gitesdesamoyas.fr" &&
      conf.texte.includes("Pour toute question : contact@gitesdesamoyas.fr"),
    "expéditeur reservation@, réponse à contact@ (réglages)",
    conf && { de: conf.expediteur, repondreA: conf.repondreA },
  );
  noter(
    alerte?.sujet.startsWith(`Réservation ${a.reference} — Camille ESSAI — L'Armu, `) === true &&
      alerte.texte.includes("Contrat : CTR-SIMULE-001, envoyé au client pour signature") &&
      alerte.texte.includes(`Courriel : ${EMAIL_ESSAI}`),
    "alerte « réservation » : client, faits, numéro du contrat",
    alerte?.texte,
  );
  const apres = await courrielsDe(a.id);
  noter(
    apres.every((c) => c.statut === "envoye" && c.voie === "fichier" && c.tentatives === 1 && c.sujet),
    "journal : « envoyé », voie, sujet gardé",
    apres,
  );
  const second = await traiterCourriels(ORIGINE);
  noter(second.envoyes === 0 && m.envoyes.length === 0 && e.emis === 1, "second passage : rien n'est renvoyé, aucun autre contrat", second);

  console.log("--- 3. client anglophone");
  const en = await tenter("laphine", samediDans(30), { moyenCaution: "cheque", modeSolde: "lien" }, "en");
  await payer(en, p);
  await traiterCourriels(ORIGINE);
  const confEn = m.vider().find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    confEn?.sujet.startsWith(`Booking ${en.reference} confirmed — LaPhine, `) === true &&
      confEn.texte.startsWith("Hello Camille,") &&
      confEn.texte.includes("Your contract (in French) is to be signed online:") &&
      confEn.texte.includes("Sign my contract\nhttps://site.example/signer/") &&
      confEn.texte.includes("View my booking\nhttps://site.example/en/suivi/") &&
      confEn.texte.includes("through a link we will send you") &&
      confEn.texte.includes("cheque handed over on arrival"),
    "courriel en anglais ; contrat annoncé en français",
    confEn?.texte,
  );

  console.log("--- 4. panne d'envoi, puis échec définitif");
  const panne = await tenter("maison-vieille", samediDans(30), { moyenCaution: "cheque", modeSolde: "lien" });
  await payer(panne, p);
  m.pannes.set(EMAIL_ESSAI, 1);
  const b1 = await traiterCourriels(ORIGINE);
  const confPanne = (await courrielsDe(panne.id)).find((c) => c.objet === "confirmation");
  noter(
    b1.reportes === 1 && confPanne?.statut === "a_envoyer" && confPanne.tentatives === 1,
    "Brevo injoignable : la confirmation reste « à envoyer », un essai compté",
    { b1, confPanne },
  );
  const avant = m.envoyes.length;
  await traiterCourriels(ORIGINE);
  noter(
    m.envoyes.filter((x) => x.destinataire === EMAIL_ESSAI && x.etiquette === "confirmation").length === 0,
    "pas de nouvel essai avant le délai (1 minute)",
    { avant, apres: m.envoyes.length },
  );
  await rendreDus();
  await traiterCourriels(ORIGINE);
  const auDelai = m.vider();
  noter(auDelai.some((x) => x.destinataire === EMAIL_ESSAI), "au délai suivant : envoyée", {
    envoyes: auDelai.map((x) => `${x.destinataire} ${x.sujet}`),
    journal: await courrielsDe(panne.id),
  });

  const perdu = await tenter("armu", samediDans(32), { moyenCaution: "cheque", modeSolde: "lien" });
  await payer(perdu, p);
  m.pannes.set(EMAIL_ESSAI, Infinity);
  for (let i = 0; i < 6; i += 1) {
    await traiterCourriels(ORIGINE);
    await rendreDus();
  }
  m.pannes.delete(EMAIL_ESSAI);
  const lignesPerdu = await courrielsDe(perdu.id);
  noter(
    lignesPerdu.find((c) => c.objet === "confirmation")?.statut === "echec" &&
      lignesPerdu.find((c) => c.objet === "confirmation")?.tentatives === 6,
    "six échecs : la confirmation est abandonnée (« echec »)",
    lignesPerdu,
  );
  await traiterCourriels(ORIGINE);
  const alerteNonParti = m
    .vider()
    .find((x) => x.sujet.startsWith("À TRAITER — courriel non parti") && x.texte.includes("la confirmation de réservation"));
  noter(
    alerteNonParti?.destinataire === PROPRIETAIRES &&
      alerteNonParti.texte.includes("la confirmation de réservation") &&
      alerteNonParti.texte.includes("Prévenir le client par téléphone"),
    "alerte « À TRAITER — courriel non parti » aux propriétaires",
    alerteNonParti?.texte,
  );

  console.log("--- 5. contrat impossible à créer");
  const sansContrat = await tenter("laphine", samediDans(32), { moyenCaution: "carte", modeSolde: "lien" });
  await payer(sansContrat, p);
  e.enPanne = true;
  await traiterCourriels(ORIGINE);
  await rendreDus();
  await traiterCourriels(ORIGINE);
  noter(!m.envoyes.some((x) => x.etiquette === "confirmation"), "deux échecs du contrat : la confirmation attend");
  await rendreDus();
  await traiterCourriels(ORIGINE);
  const sansLien = m.vider();
  const confSansLien = sansLien.find((x) => x.etiquette === "confirmation");
  noter(
    confSansLien?.texte.includes("Votre contrat vous sera envoyé par courriel.") === true && !confSansLien.texte.includes("/signer/"),
    "troisième échec : la confirmation part sans le lien, contrat annoncé",
    confSansLien?.texte,
  );
  await traiterCourriels(ORIGINE);
  const alertesContrat = [...sansLien, ...m.vider()];
  noter(
    alertesContrat.some((x) => x.sujet.startsWith("À TRAITER — contrat non créé") && x.texte.includes("Rendu PDF échoué (simulé)")),
    "alerte « À TRAITER — contrat non créé », avec l'erreur",
    alertesContrat.map((x) => x.sujet),
  );
  const relance = (await courrielsDe(sansContrat.id)).find((c) => c.objet === "contrat");
  noter(relance?.statut === "a_envoyer", "un courriel « contrat à signer » est inscrit, pour plus tard", relance);
  e.enPanne = false;
  await rendreDus();
  await traiterCourriels(ORIGINE);
  const contratEnvoye = m.vider().find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    contratEnvoye?.sujet === `Votre contrat à signer — réservation ${sansContrat.reference}` &&
      contratEnvoye.texte.includes("/signer/jeton"),
    "création réussie : le client reçoit le lien de son contrat",
    contratEnvoye?.sujet,
  );

  console.log("--- 6. paiement intégral");
  const emisAvant = e.emis;
  const integral = await tenter("maison-vieille", samediDans(2), { moyenCaution: "virement", modeSolde: null });
  noter(integral.devis.paiementIntegral, "arrivée dans moins de 30 jours : paiement intégral", integral.devis.paiementIntegral);
  await payer(integral, p);
  const objetsIntegral = (await courrielsDe(integral.id)).map((c) => `${c.objet}${c.genre ? `:${c.genre}` : ""}`).sort();
  noter(
    JSON.stringify(objetsIntegral) === JSON.stringify(["alerte_reservation", "confirmation", "facture"]),
    "inscrits : confirmation, alerte « réservation » et facture, plus d'alerte « contrat à envoyer à la main » (lot 5)",
    objetsIntegral,
  );
  await traiterCourriels(ORIGINE);
  const lotIntegral = m.vider();
  noter(e.emis === emisAvant + 1, "le contrat est créé, comme pour un acompte (contrat v3)", e.emis - emisAvant);
  const confIntegral = lotIntegral.find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    confIntegral?.texte.includes("/signer/jeton") === true && confIntegral?.texte.includes("(totalité du séjour)") === true,
    "confirmation : totalité payée, lien de signature du contrat",
    confIntegral?.texte,
  );
  noter(
    !lotIntegral.some((x) => x.sujet.includes("à envoyer à la main")) &&
      lotIntegral.some((x) => x.texte.includes(`Contrat : CTR-SIMULE-${String(e.emis).padStart(3, "0")}, envoyé au client pour signature`)),
    "alertes : aucune « À TRAITER », l'alerte « réservation » cite le contrat",
    lotIntegral.map((x) => x.sujet),
  );

  console.log("--- 7. remboursements");
  const retard = await tenter("laphine", samediDans(34), { moyenCaution: "cheque", modeSolde: "lien" });
  const { paiementId: piRetard } = await ouvrirPaiement(
    {
      reservationId: retard.id, reference: retard.reference, montant: retard.devis.aRegler,
      paiementIntegral: false, enregistrerCarte: false, client: retard.client, description: "essai",
    },
    p,
  );
  await db.execute(sql`update disponibilites set verrou_expire_at = now() - interval '1 minute'
                        where reservation_id = ${retard.id}::uuid and statut = 'verrou'`);
  await tenter("laphine", samediDans(34), { moyenCaution: "cheque", modeSolde: "lien" });
  p.payer(piRetard);
  await constaterPaiement(piRetard, p);
  await constaterPaiement(piRetard, p);
  const objetsRetard = (await courrielsDe(retard.id)).map((c) => c.objet).sort();
  noter(
    JSON.stringify(objetsRetard) === JSON.stringify(["alerte_probleme", "remboursement"]),
    "dates reprises : un courriel de remboursement et une alerte, même constaté deux fois",
    objetsRetard,
  );
  await traiterCourriels(ORIGINE);
  const lotRetard = m.vider();
  const rembourse = lotRetard.find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    rembourse?.sujet.includes("a été remboursé — réservation") === true &&
      rembourse.texte.includes("ont été réservées par un autre client pendant votre paiement") &&
      rembourse.texte.includes("a été intégralement remboursé") &&
      rembourse.texte.includes("Choisir d'autres dates : https://site.example/reserver?gite=laphine"),
    "au client : dates prises, remboursé, autres dates",
    rembourse?.texte,
  );
  noter(
    lotRetard.some(
      (x) => x.sujet.startsWith("À TRAITER — paiement remboursé, Camille ESSAI, LaPhine") && x.texte.includes("Appeler le client"),
    ),
    "aux propriétaires : « À TRAITER — paiement remboursé », appeler le client",
    lotRetard.map((x) => x.sujet),
  );
  const piOrphelin = p.orphelin(12345);
  await constaterPaiement(piOrphelin, p);
  await constaterPaiement(piOrphelin, p);
  noter((await courrielsDe(null, piOrphelin)).length === 1, "paiement inconnu du site, constaté deux fois : une alerte seule");
  await traiterCourriels(ORIGINE);
  noter(
    m.vider().some((x) => x.sujet === "À TRAITER — paiement remboursé, paiement inconnu du site" && x.texte.includes("123,45 €")),
    "alerte : paiement inconnu du site, montant",
  );

  console.log("--- 8. contrat signé, alerte coupée");
  await inscrireSignature(db, a.id, "CTR-SIMULE-001");
  await inscrireSignature(db, a.id, "CTR-SIMULE-001");
  await traiterCourriels(ORIGINE);
  const signes = m.vider();
  noter(
    signes.length === 1 && signes[0].sujet.startsWith("Contrat CTR-SIMULE-001 signé — Camille ESSAI — L'Armu, "),
    "alerte « contrat signé », une seule",
    signes.map((x) => x.sujet),
  );
  await db.execute(sql`update alertes set active = false where type = 'reservation'`);
  const coupe = await tenter("maison-vieille", samediDans(34), { moyenCaution: "cheque", modeSolde: "lien" });
  await payer(coupe, p);
  await db.execute(sql`update alertes set active = true where type = 'reservation'`);
  noter(
    (await courrielsDe(coupe.id)).map((c) => c.objet).sort().join() === "confirmation,facture",
    "alerte « réservation » coupée : seules la confirmation et la facture sont inscrites",
    (await courrielsDe(coupe.id)).map((c) => c.objet),
  );
  await traiterCourriels(ORIGINE);
  m.vider();

  console.log("--- 9. adresses de test, texte échappé");
  noter(
    adresseDeTest("a@example.invalid") && adresseDeTest("b@sous.example.com") && adresseDeTest("c@test") &&
      !adresseDeTest("contact@gitesdesamoyas.fr") && !adresseDeTest("quelqu.un@gmail.com"),
    "adresses réservées aux essais reconnues, vraies adresses non",
  );
  const dossier = await mkdtemp(path.join(tmpdir(), "courriels-"));
  const ancienneCle = process.env.BREVO_API_KEY;
  const ancienDossier = process.env.COURRIELS_DOSSIER;
  try {
    process.env.BREVO_API_KEY = "xkeysib-factice-jamais-utilisee";
    process.env.COURRIELS_DOSSIER = dossier;
    const envoi = await new MessagerieDuSite().envoyer({
      expediteur: { email: "reservation@gitesdesamoyas.fr", nom: "Essai" },
      repondreA: "contact@gitesdesamoyas.fr",
      destinataire: "client@example.invalid",
      sujet: "Essai",
      html: "<p>essai</p>",
      texte: "essai",
      etiquette: "confirmation",
    });
    noter(envoi.voie === "fichier", "avec une clé Brevo, une adresse de test part quand même dans un fichier", envoi);
    const contenu = await readFile(envoi.reference, "utf8");
    noter(contenu.includes("À : client@example.invalid") && contenu.includes("<p>essai</p>"), "le fichier porte les en-têtes et le corps");
    const fichier = await new MessagerieFichier(dossier).envoyer({
      expediteur: { email: "x@example.invalid", nom: "X" }, repondreA: "y@example.invalid", destinataire: "z@example.invalid",
      sujet: "S", html: "<p>h</p>", texte: "t", etiquette: "contrat",
    });
    noter(fichier.voie === "fichier", "sans clé : fichier");
  } finally {
    if (ancienneCle === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = ancienneCle;
    if (ancienDossier === undefined) delete process.env.COURRIELS_DOSSIER;
    else process.env.COURRIELS_DOSSIER = ancienDossier;
    await rm(dossier, { recursive: true, force: true });
  }
  const echappe = texteConfirmation(
    "fr",
    { reference: "SAM-X", prenom: "Zoé <script>", gite: "L'Armu", arrivee: "2027-03-06", depart: "2027-03-13" },
    { reference: "Référence : SAM-X", sejour: "s", voyageurs: "v", paye: "p", solde: null, caution: null },
    null,
    "https://site.example/suivi/0123",
    "contact@gitesdesamoyas.fr",
  );
  noter(
    echappe.html.includes("Bonjour Zoé &lt;script&gt;,") && !echappe.html.includes("<script>"),
    "un nom avec des balises est échappé dans le HTML",
  );
  noter(echappe.sujet === "Réservation SAM-X confirmée — L'Armu, 6 au 13 mars 2027", "dates du sujet : « 6 au 13 mars 2027 »", echappe.sujet);
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations, des paiements et des courriels.');
  }
  // Base de test : les alertes vont à une adresse réservée aux essais, et les
  // courriels en attente d'autres essais sont mis de côté pour la journée :
  // chaque envoi compté ici est le nôtre.
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  await nettoyer();
  await db.execute(sql`update courriels set prochain_essai_at = now() + interval '1 day' where statut = 'a_envoyer'`);
  try {
    await controles();
  } finally {
    await db.execute(sql`update alertes set active = true`);
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
