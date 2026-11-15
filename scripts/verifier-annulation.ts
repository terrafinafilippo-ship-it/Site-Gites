// Contrôle de l'ANNULATION depuis le back-office (Phase 5, lot 5, D-42), sur
// la base de TEST.
//
//   1. refus : qui annule inconnu, date du préavis absente ou future, absence
//      avant l'arrivée ;
//   2. le client annule avant la date du solde, acompte par carte : le
//      récapitulatif, l'empreinte, l'annulation (statut, nuits libérées,
//      paiement du solde ouvert annulé, remboursement sur la carte une seule
//      fois, journal), le courriel, « Ma réservation », pas d'avoir sans
//      facture, pas deux annulations ;
//   3. acompte par carte, solde par virement, une facture : la carte d'abord,
//      le reste par virement ; « À traiter » ; « Remboursement fait » ;
//      l'avoir part, avec le PDF ;
//   4. Stripe refuse : le remboursement passe en virement ;
//   5. Stripe en panne : remboursement retenté par les tâches, jamais deux
//      fois ;
//   6. le client absent : tout gardé sauf la taxe ; les statistiques ;
//   7. la caution : bloquée sur la carte, levée ; reçue par chèque, à rendre
//      tout de suite ;
//   8. (--http, serveur sur 3001) le VRAI avoir, par /api/factures : numéro
//      AV, PDF lu (pypdf), idempotence, refus sans numéro consommé ; les
//      pages : la fiche annulée, le formulaire d'annulation, « Documents »,
//      « Ma réservation ».
//
// Les parties 1 à 7 simulent le prestataire, la messagerie et l'émission
// (le moteur PDF ne se charge pas sous tsx) ; la logique est la vraie.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin.
//
// Lancer : DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx tsx scripts/verifier-annulation.ts [--http]
import "../db/env";

import { execFileSync } from "node:child_process";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { traiterRemboursements } from "../lib/annulation";
import { centimesDepuisNumeric } from "../lib/centimes";
import {
  remplacerEmetteurAvoir,
  remplacerEmetteurContrat,
  remplacerEmetteurFacture,
  traiterCourriels,
} from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { fmtDateFr, fmtEuro } from "../lib/format";
import { listerATraiter } from "../lib/gestion/a-traiter";
import { empreinte } from "../lib/gestion/secrets";
import { annulerReservation, maintenantCivil, noterRemboursementFait } from "../lib/gestion/annulation";
import { noterCautionRecue, noterCautionRendue } from "../lib/gestion/cautions";
import type { Acteur } from "../lib/gestion/journal";
import { noterSoldeVirement } from "../lib/gestion/solde-virement";
import { lireStatistiques } from "../lib/gestion/statistiques";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { calculerMontants, partageAnnulation } from "../lib/montants";
import { chargerReservationAvecGite } from "../lib/reservations";
import { lireEtatSolde, ouvrirSolde } from "../lib/solde";
import { getStorage } from "../lib/storage";
import { remplacerPrestataire } from "../lib/stripe";
import { chargerSuivi, lienSuivi } from "../lib/suivi";
import { coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL = "annulation-essai@example.invalid";
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000fb", description: "Firefox sur Windows", ip: "192.0.2.91" };
const AUJ = aujourdhuiParis();
/** Espaces fines et insécables ramenées à des espaces. */
const plat = (s: string) => s.replace(/[  ]/g, " ");

const p = new PrestataireSimule();
const m = new MessagerieSimulee();
const avoirsEmis: string[] = [];

async function envoyer(): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now() where statut = 'a_envoyer' and destinataire = ${EMAIL}`);
  await traiterCourriels(ORIGINE, 300);
  return m.vider().filter((x) => x.destinataire === EMAIL);
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL}`);
  await db.execute(sql`delete from remboursements where reservation_id in (${ids})`);
  await db.execute(sql`delete from annulations where reservation_id in (${ids})`);
  await db.execute(sql`delete from avoirs where reservation_id in (${ids})`);
  await db.execute(sql`delete from documents where reservation_id in (${ids})`);
  await db.execute(sql`delete from factures where reservation_id in (${ids})`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from audit_logs where ligne_id in (select id::text from reservations where client_email = ${EMAIL})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL}`);
  await db.execute(sql`delete from comptes_gestion where courriel = 'http-annulation@example.invalid'`);
}

const resaDe = async (id: string) => (await chargerReservationAvecGite(id))!;
const mouvements = async (id: string) =>
  (await db.execute(sql`select id, mode, montant::text as montant, statut, reference_externe, erreur from remboursements
                         where reservation_id = ${id}::uuid order by created_at`)).rows as {
    id: string; mode: string; montant: string; statut: string; reference_externe: string | null; erreur: string | null;
  }[];
const nuits = async (id: string) =>
  ((await db.execute(sql`select count(*)::int as n from disponibilites where reservation_id = ${id}::uuid`)).rows[0] as { n: number }).n;
const courriels = async (id: string, objet: string) =>
  ((await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${id}::uuid and objet = ${objet}`)).rows[0] as { n: number }).n;

/** Récapitulatif puis confirmation. */
async function annuler(id: string, initiative: string, prevenuLe = "") {
  const plan = await annulerReservation(id, { initiative, prevenuLe }, ACTEUR, null, p);
  if (plan.etape !== "plan") return { plan, fait: plan };
  const fait = await annulerReservation(id, { initiative, prevenuLe }, ACTEUR, plan.empreinte, p);
  return { plan, fait };
}

interface Ids {
  sansFacture: string;
  avecFacture: string;
}

async function controles(): Promise<Ids> {
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });
  remplacerEmetteurFacture({
    emettre: async (_id, type) => ({ ok: true, facture: { numero: "FAC-SIMULE-001", type, montant: 1, chemin: "factures/x.pdf" } }),
    pdf: async () => Buffer.from("%PDF-simule"),
  });
  remplacerEmetteurAvoir({
    emettre: async (id) => {
      avoirsEmis.push(id);
      return { ok: true, avoir: { numero: "AV-SIMULE-001", montant: 12345, chemin: "avoirs/AV-SIMULE-001.pdf" } };
    },
    pdf: async () => Buffer.from("%PDF-simule"),
  });

  console.log("--- 1. Refus");
  const a = await reserver(p, coordonnees(EMAIL, "Camille", "Annule"), "armu", samediDans(44), "carte");
  await envoyer();
  const refus = async (initiative: string, prevenuLe: string) => {
    const r = await annulerReservation(a.id, { initiative, prevenuLe }, ACTEUR, null, p);
    return r.etape === "refus" ? r.message : `(${r.etape})`;
  };
  noter((await refus("autre", "")) === "Indiquez qui annule.", "qui annule inconnu : refusé");
  noter((await refus("client", "")) === "Indiquez quand le client a prévenu (date et heure).", "client sans date du préavis : refusé");
  noter(
    (await refus("client", `${ajouterJours(AUJ, 1)}T10:00`)) === "La date où le client a prévenu ne peut pas être dans le futur.",
    "date du préavis dans le futur : refusée",
  );
  noter(
    (await refus("client", "2020-01-01T10:00")) === "La date où le client a prévenu précède la réservation.",
    "date du préavis avant la réservation : refusée",
  );
  const arriveeA = (await resaDe(a.id)).date_arrivee;
  noter(
    (await refus("absence", "")) === `Le client ne peut être déclaré absent qu'à partir du jour de l'arrivée (${fmtDateFr(arriveeA)}).`,
    "client absent avant le jour de l'arrivée : refusé",
  );

  console.log("--- 2. Le client annule avant la date du solde (acompte par carte)");
  const resaA = await resaDe(a.id);
  const mA = calculerMontants(resaA);
  const ouvert = await ouvrirSolde(a.id, p);
  noter(ouvert.ok, "un paiement du solde est ouvert (le client a ouvert le lien)", ouvert);
  const prevenu = maintenantCivil();
  const planA = await annulerReservation(a.id, { initiative: "client", prevenuLe: prevenu }, ACTEUR, null, p);
  const limiteSolde = ajouterJours(resaA.date_arrivee, -resaA.delai_solde_jours);
  const [h, mn] = prevenu.slice(11, 16).split(":");
  const lignesA = [
    `Annulation à la demande du client, qui a prévenu le ${fmtDateFr(prevenu.slice(0, 10))} à ${Number(h)} h ${mn}.`,
    `Prévenu au plus tard le ${fmtDateFr(limiteSolde)}, date limite du solde : tout est remboursé (l'article 7.2 du contrat).`,
    `Payé : ${fmtEuro(mA.acompte)}. Gardé : ${fmtEuro(0)}. Remboursé : ${fmtEuro(mA.acompte)}, dont ${fmtEuro(mA.acompte - Math.round(mA.base * 0.3))} de taxe de séjour.`,
    `Remboursé sur la carte bancaire du client : ${fmtEuro(mA.acompte)}, par le site dès la confirmation.`,
    `Les nuits du ${fmtDateFr(resaA.date_arrivee)} au ${fmtDateFr(resaA.date_depart)} redeviennent libres.`,
    "Le solde ne sera pas demandé au client.",
    `Le client reçoit un courriel d'annulation à ${EMAIL}.`,
    "C'est définitif : la réservation ne pourra pas être rétablie.",
  ];
  noter(
    planA.etape === "plan" && JSON.stringify(planA.lignes.map(plat)) === JSON.stringify(lignesA.map(plat)),
    "récapitulatif : qui, règle et date, payé / gardé / remboursé, carte, nuits, solde, courriel, définitif",
    planA.etape === "plan" ? planA.lignes : planA,
  );
  const faux = await annulerReservation(a.id, { initiative: "client", prevenuLe: prevenu }, ACTEUR, "0".repeat(32), p);
  noter(
    faux.etape === "plan" && faux.message === "L'annulation a changé : relisez avant de confirmer." && (await resaDe(a.id)).statut === "confirmee",
    "empreinte fausse : rien n'est annulé",
    faux,
  );
  const nuitsAvant = await nuits(a.id);
  const faitA = await annulerReservation(a.id, { initiative: "client", prevenuLe: prevenu }, ACTEUR, planA.etape === "plan" ? planA.empreinte : null, p);
  noter(
    faitA.etape === "fait" && plat(faitA.message) === plat(`La réservation est annulée. Remboursé sur la carte : ${fmtEuro(mA.acompte)}.`),
    "confirmé : « La réservation est annulée. Remboursé sur la carte : … »",
    faitA,
  );
  noter((await resaDe(a.id)).statut === "annulee" && nuitsAvant === 7 && (await nuits(a.id)) === 0, "statut « annulée », les 7 nuits libérées", nuitsAvant);
  const soldeOuvert = (await db.execute(sql`select statut from paiements where reservation_id = ${a.id}::uuid and type = 'solde'`)).rows as { statut: string }[];
  noter(soldeOuvert.length === 1 && soldeOuvert[0].statut === "annule" && p.annulations >= 1, "le paiement du solde ouvert est annulé chez Stripe", soldeOuvert);
  const mvA = await mouvements(a.id);
  const refA = p.remboursements.filter((r) => r.cle === `annulation-${mvA[0]?.id}`);
  noter(
    mvA.length === 1 && mvA[0].mode === "carte" && mvA[0].statut === "fait" && centimesDepuisNumeric(mvA[0].montant) === mA.acompte &&
      refA.length === 1 && refA[0].montant === mA.acompte && mvA[0].reference_externe === refA[0].ref,
    "remboursé sur la carte : le montant exact, une seule fois, référence de Stripe gardée",
    { mvA, refA },
  );
  const an = (await db.execute(sql`select initiative, prevenu_le::text as prevenu, paye::text as paye, conserve::text as conserve, rembourse::text as rembourse
                                    from annulations where reservation_id = ${a.id}::uuid`)).rows[0] as Record<string, string> | undefined;
  noter(
    an?.initiative === "client" && an.prevenu.startsWith(prevenu.replace("T", " ")) && centimesDepuisNumeric(an.paye) === mA.acompte &&
      centimesDepuisNumeric(an.conserve) === 0 && centimesDepuisNumeric(an.rembourse) === mA.acompte,
    "annulation enregistrée : qui, date du préavis, payé, gardé, remboursé",
    an,
  );
  const jr = (await db.execute(sql`select details from audit_logs where ligne_id = ${a.id} and action = 'reservation_annulee'`)).rows[0] as
    | { details: Record<string, unknown> }
    | undefined;
  noter(
    jr?.details.regle === "avant_solde" && jr.details.rembourse === mA.acompte && jr.details.appareil_id === "00000000-0000-0000-0000-0000000000fb",
    "journal : réservation annulée, règle, montants, appareil",
    jr,
  );
  const envA = await envoyer();
  const cA = envA.find((x) => x.etiquette === "annulation");
  const texteA = plat(cA?.texte ?? "");
  noter(
    !!cA && cA.sujet === `Votre réservation est annulée — réservation ${resaA.reference}` &&
      texteA.includes(`Votre séjour à L'Armu, du `) &&
      texteA.includes(plat(`Nous vous remboursons ${fmtEuro(mA.acompte)}, dont `)) &&
      texteA.includes("sur la carte bancaire utilisée pour le paiement") && !texteA.includes("virement") && !texteA.includes("avoir"),
    "courriel d'annulation : sujet, séjour, montant rendu, sur la carte, ni virement ni avoir",
    cA?.texte,
  );
  noter((await courriels(a.id, "avoir")) === 0 && avoirsEmis.length === 0, "aucune facture : pas d'avoir");
  const suiviA = await chargerSuivi(resaA.jeton_suivi!);
  noter(suiviA.etat === "annulee" && suiviA.rembourse === mA.acompte && suiviA.fait, "« Ma réservation » : annulée, remboursé, fait", suiviA.etat);
  const deux = await annulerReservation(a.id, { initiative: "bailleur", prevenuLe: "" }, ACTEUR, null, p);
  noter(deux.etape === "refus" && deux.message === "Réservation au statut « annulee » : elle ne peut pas être annulée.", "deuxième annulation : refusée", deux);

  console.log("--- 3. Acompte par carte, solde par virement, une facture");
  const b = await reserver(p, coordonnees(EMAIL, "Bruno", "Virement"), "laphine", samediDans(45), "cheque");
  await envoyer();
  const soldeB = (await lireEtatSolde(db, await resaDe(b.id)))!;
  await noterSoldeVirement(b.id, { date: AUJ, montant: soldeB.montant, reference: "VIR ANNULATION" }, ACTEUR, p);
  await noterCautionRecue(b.id, AUJ, ACTEUR);
  const mB = calculerMontants(await resaDe(b.id));
  await db.execute(sql`select * from creer_facture(${b.id}::uuid, 'total', ${(mB.totalTtc / 100).toFixed(2)}::numeric, '{}'::jsonb, null)`);
  const { plan: planB, fait: faitB } = await annuler(b.id, "bailleur");
  const lignesB = planB.etape === "plan" ? planB.lignes.map(plat) : [];
  noter(
    lignesB.includes(plat(`Remboursé sur la carte bancaire du client : ${fmtEuro(mB.acompte)}, par le site dès la confirmation.`)) &&
      lignesB.includes(plat(`À rembourser par virement, depuis votre banque : ${fmtEuro(mB.solde)}. Cliquez ensuite « Remboursement fait ».`)) &&
      lignesB.some((l) => l.startsWith("Une facture a été faite (FAC-") && l.endsWith(plat(`un avoir de ${fmtEuro(mB.totalTtc)} partira au client une fois tout remboursé.`))) &&
      lignesB.includes(plat(`La caution reçue par chèque (${fmtEuro((await resaDe(b.id)).caution ?? 0)}) est à rendre au client : elle apparaît dans « À traiter ».`)),
    "récapitulatif : la carte d'abord, le solde par virement, l'avoir annoncé, la caution à rendre",
    lignesB,
  );
  noter(
    faitB.etape === "fait" &&
      plat(faitB.message) ===
        plat(`La réservation est annulée. Remboursé sur la carte : ${fmtEuro(mB.acompte)}. À rembourser par virement : ${fmtEuro(mB.solde)} — cliquez « Remboursement fait » une fois le virement parti.`),
    "confirmé : la carte remboursée, le virement à faire",
    faitB,
  );
  const taches = await listerATraiter();
  const tB = taches.filter((t) => t.reservationId === b.id).map((t) => t.titre);
  noter(tB.includes("Remboursement à faire par virement") && tB.includes("Caution à rendre"), "« À traiter » : remboursement par virement, caution à rendre", tB);
  const envB = await envoyer();
  const texteB = plat(envB.find((x) => x.etiquette === "annulation")?.texte ?? "");
  noter(
    texteB.includes(plat(`Nous vous remboursons ${fmtEuro(mB.totalTtc)}`)) &&
      texteB.includes(plat(`${fmtEuro(mB.solde)} par virement bancaire : merci de nous envoyer vos coordonnées bancaires (RIB) en réponse à ce courriel.`)) &&
      texteB.includes("Vous recevrez un avoir une fois le remboursement terminé."),
    "courriel : la part par virement (RIB demandé), l'avoir annoncé",
    texteB,
  );
  noter((await courriels(b.id, "avoir")) === 0, "virement pas encore fait : pas d'avoir");
  const mvB = await mouvements(b.id);
  const carteB = mvB.find((x) => x.mode === "carte")!;
  const virB = mvB.find((x) => x.mode === "virement")!;
  const surCarte = await noterRemboursementFait(carteB.id, ACTEUR);
  noter(!surCarte.ok && surCarte.message === "Ce remboursement se fait sur la carte, par le site.", "« Remboursement fait » sur la carte : refusé", surCarte);
  const fait = await noterRemboursementFait(virB.id, ACTEUR);
  noter(fait.ok && plat(fait.message) === plat(`Remboursement de ${fmtEuro(mB.solde)} noté fait. Tout est remboursé.`), "« Remboursement fait » : noté, tout est remboursé", fait);
  const encore = await noterRemboursementFait(virB.id, ACTEUR);
  noter(!encore.ok && encore.message === "Ce remboursement est déjà noté fait.", "deuxième clic : refusé", encore);
  const envB2 = await envoyer();
  const avB = envB2.find((x) => x.etiquette === "avoir");
  const numeroFacB = ((await db.execute(sql`select numero from factures where reservation_id = ${b.id}::uuid`)).rows[0] as { numero: string }).numero;
  noter(
    !!avB && avB.sujet === `Votre avoir AV-SIMULE-001 — réservation ${(await resaDe(b.id)).reference}` &&
      avB.texte.includes(`Il se rapporte à la facture n° ${numeroFacB}.`) && avB.piecesJointes?.[0]?.nom === "AV-SIMULE-001.pdf" &&
      avoirsEmis.length === 1 && avoirsEmis[0] === b.id,
    "tout remboursé : l'avoir part, avec la facture citée et le PDF",
    avB?.texte,
  );
  noter(!(await listerATraiter()).some((t) => t.cle === `remboursement_virement:${virB.id}`), "« À traiter » : la ligne du virement disparaît");
  const rendue = await noterCautionRendue(b.id, ACTEUR);
  noter(rendue.ok, "caution par chèque rendue tout de suite, avant la date du départ", rendue);

  console.log("--- 4. Stripe refuse de rembourser la carte");
  const c = await reserver(p, coordonnees(EMAIL, "Chloé", "Refus"), "maison-vieille", samediDans(46), "cheque");
  await envoyer();
  p.refusRemboursement = true;
  const { fait: faitC } = await annuler(c.id, "bailleur");
  p.refusRemboursement = false;
  const mC = calculerMontants(await resaDe(c.id));
  const mvC = await mouvements(c.id);
  noter(
    faitC.etape === "fait" && plat(faitC.message).includes(plat(`La banque a refusé de rembourser la carte. À rembourser par virement : ${fmtEuro(mC.acompte)}`)) &&
      mvC.length === 1 && mvC[0].mode === "virement" && mvC[0].statut === "a_faire" && (mvC[0].erreur ?? "").includes("charge_expired_for_refund"),
    "refus de Stripe : le remboursement passe en virement, la raison gardée",
    { faitC, mvC },
  );

  console.log("--- 5. Stripe en panne");
  const d = await reserver(p, coordonnees(EMAIL, "Denis", "Panne"), "armu", samediDans(47), "cheque");
  await envoyer();
  p.panneRemboursement = true;
  const { fait: faitD } = await annuler(d.id, "bailleur");
  const mD = calculerMontants(await resaDe(d.id));
  noter(
    faitD.etape === "fait" && plat(faitD.message).includes(plat(`Le remboursement sur la carte (${fmtEuro(mD.acompte)}) n'a pas encore abouti : le site le retente tout seul.`)),
    "panne de Stripe : « n'a pas encore abouti : le site le retente tout seul »",
    faitD,
  );
  noter((await mouvements(d.id))[0]?.statut === "a_faire", "le remboursement reste à faire, en carte");
  p.panneRemboursement = false;
  const bilan = await traiterRemboursements(p);
  const mvD = await mouvements(d.id);
  noter(bilan.faits >= 1 && mvD[0].statut === "fait", "tâches : le remboursement retenté aboutit", bilan);
  await traiterRemboursements(p);
  noter(p.remboursements.filter((r) => r.cle === `annulation-${mvD[0].id}`).length === 1, "jamais remboursé deux fois");

  console.log("--- 6. Le client ne s'est pas présenté");
  const e = await reserver(p, coordonnees(EMAIL, "Emma", "Absente"), "laphine", samediDans(48), "cheque");
  await envoyer();
  // Le séjour a commencé hier.
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, -1)}::date, date_depart = ${ajouterJours(AUJ, 6)}::date where id = ${e.id}::uuid`);
  const resaE = await resaDe(e.id);
  const attenduE = partageAnnulation(resaE, calculerMontants(resaE).acompte, "absence", null);
  const { fait: faitE } = await annuler(e.id, "absence");
  const anE = (await db.execute(sql`select conserve::text as c, rembourse::text as r from annulations where reservation_id = ${e.id}::uuid`)).rows[0] as
    | { c: string; r: string }
    | undefined;
  noter(
    faitE.etape === "fait" && attenduE.regle === "absence" && centimesDepuisNumeric(anE?.c ?? "0") === attenduE.conserve &&
      centimesDepuisNumeric(anE?.r ?? "0") === attenduE.rembourse && attenduE.rembourse === attenduE.taxeRemboursee,
    "absent : tout gardé sauf la part de taxe de séjour de l'acompte",
    { anE, attenduE },
  );
  const stats = await lireStatistiques({ annee: AUJ.slice(0, 4) });
  noter(stats.conserveAnnulations >= attenduE.conserve, "statistiques : la somme gardée compte dans les séjours", stats.conserveAnnulations);

  console.log("--- 7. Caution bloquée sur la carte");
  const f = await reserver(p, coordonnees(EMAIL, "Félix", "Caution"), "maison-vieille", samediDans(49), "carte");
  await envoyer();
  const pi = { id: `pi_caution_lot5_${Date.now()}` };
  p.paiements.set(pi.id, {
    id: pi.id, statut: "bloque", montant: 50000, devise: "eur", customerId: null, paymentMethodId: null,
    reservationId: f.id, typePaiement: "caution", clientSecret: null, dernierRefus: null, expireLe: null, montantEncaisse: 0,
  });
  await db.execute(sql`insert into paiements (reservation_id, type, montant, statut, prestataire, reference_externe, expire_at)
                       values (${f.id}::uuid, 'caution', 500.00, 'bloque', 'simule', ${pi.id}, now() + interval '5 days')`);
  const { plan: planF, fait: faitF } = await annuler(f.id, "bailleur");
  const lignesF = planF.etape === "plan" ? planF.lignes.map(plat) : [];
  const caution = (await db.execute(sql`select statut from paiements where reservation_id = ${f.id}::uuid and type = 'caution'`)).rows[0] as { statut: string };
  noter(
    lignesF.includes(plat(`La caution bloquée sur la carte (${fmtEuro(50000)}) est levée.`)) && faitF.etape === "fait" && caution.statut === "libere",
    "caution bloquée : annoncée, puis levée (rien n'est débité)",
    { lignesF, caution },
  );

  return { sansFacture: a.id, avecFacture: b.id };
}

// ─── Par le serveur (--http) : le vrai avoir ──────────────────────────────────

function textePdf(octets: Buffer): string {
  const code = "import sys,io,pypdf;r=pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read()));sys.stdout.buffer.write('\\n'.join(p.extract_text() for p in r.pages).encode('utf-8'))";
  return plat(execFileSync("python", ["-c", code], { input: octets }).toString("utf-8"));
}

async function dernierAv(): Promise<number> {
  const r = await db.execute(sql`select coalesce(max(dernier_numero), 0)::int as n from compteurs_documents
                                  where serie = 'AV' and annee = extract(year from now() at time zone 'Europe/Paris')::int`);
  return (r.rows[0] as { n: number }).n;
}

async function partieHttp(ids: Ids): Promise<void> {
  console.log(`--- 8. Le vrai avoir (${ORIGINE})`);
  const secret = process.env.DOCUMENT_SERVICE_SECRET;
  if (!secret) throw new Error("DOCUMENT_SERVICE_SECRET absent de .env.local");
  const emettre = async (reservationId: string) => {
    const r = await fetch(`${ORIGINE}/api/factures`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-secret": secret },
      body: JSON.stringify({ reservationId, type: "avoir" }),
    });
    return { status: r.status, corps: (await r.json()) as { numero?: string; error?: string } };
  };

  const avant = await dernierAv();
  const sans = await emettre(ids.sansFacture);
  noter(sans.status === 409 && (await dernierAv()) === avant, "sans facture : 409, aucun numéro AV consommé", sans);

  const a = await emettre(ids.avecFacture);
  const ligne = a.corps.numero
    ? ((await db.execute(sql`select montant::text as montant, pdf_url, donnees from avoirs where numero = ${a.corps.numero}`)).rows[0] as
        | { montant: string; pdf_url: string; donnees: Record<string, unknown> }
        | undefined)
    : undefined;
  const resaB = (await chargerReservationAvecGite(ids.avecFacture))!;
  const mB = calculerMontants(resaB);
  const numeroFac = ((await db.execute(sql`select numero from factures where reservation_id = ${ids.avecFacture}::uuid`)).rows[0] as { numero: string }).numero;
  noter(
    a.status === 200 && /^AV-\d{4}-\d{3}$/.test(a.corps.numero ?? "") && centimesDepuisNumeric(ligne?.montant ?? "0") === mB.totalTtc &&
      (await dernierAv()) === avant + 1,
    "avoir émis : numéro AV-AAAA-NNN, montant = remboursé",
    { a, montant: ligne?.montant },
  );
  const pdf = ligne ? textePdf(await getStorage().read(ligne.pdf_url)) : "";
  noter(
    pdf.includes(`N° ${a.corps.numero}`) && pdf.includes(`Se rapporte à la facture n° ${numeroFac}`) &&
      pdf.includes("Annulation par le bailleur ou pour force majeure") && pdf.includes("les articles 7.3 et 7.4 du contrat") &&
      pdf.includes("Carte bancaire, le ") && pdf.includes("Virement bancaire, le ") && pdf.includes(plat(fmtEuro(mB.totalTtc))) &&
      pdf.includes("Exonération de TVA") && pdf.includes("261 D 4°") && !pdf.includes("MEDICYS"),
    "PDF : numéro, facture corrigée, motif et article, carte et virement, montant, TVA",
    pdf.slice(0, 1200),
  );
  const bis = await emettre(ids.avecFacture);
  noter(bis.status === 200 && bis.corps.numero === a.corps.numero && (await dernierAv()) === avant + 1, "deuxième appel : le même avoir, aucun numéro de plus", bis);

  // Les pages, avec une session posée directement en base.
  const jeton = `essai-annulation-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values ('http-annulation@example.invalid') returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description)
                                            values (${compte.id}::uuid, ${empreinte(`app-${jeton}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinte(jeton)})`);
  const cookie = { cookie: `gestion_session=${jeton}` };
  const fiche = await fetch(`${ORIGINE}/gestion/reservations/${ids.avecFacture}`, { headers: cookie });
  const fh = plat((await fiche.text()).replace(/<!-- -->/g, ""));
  noter(
    fiche.status === 200 && fh.includes("<h2>Annulation</h2>") && fh.includes("Annulation par le bailleur ou pour force majeure") &&
      fh.includes(`Avoir ${a.corps.numero}`) && fh.includes("Par virement") && !fh.includes("Annuler la réservation"),
    "fiche annulée : l'annulation, les remboursements, l'avoir ; plus de bouton d'annulation",
    fiche.status,
  );
  const g = await reserver(p, coordonnees(EMAIL, "Gaëlle", "Formulaire"), "armu", samediDans(50), "carte");
  const ficheG = await fetch(`${ORIGINE}/gestion/reservations/${g.id}`, { headers: cookie });
  const gh = await ficheG.text();
  noter(
    ficheG.status === 200 && gh.includes("Annuler la réservation") && gh.includes('name="initiative"') && gh.includes('type="datetime-local"'),
    "fiche confirmée : le formulaire « Annuler la réservation » (qui annule, date du préavis)",
    ficheG.status,
  );
  const docs = await fetch(`${ORIGINE}/gestion/documents`, { headers: cookie });
  noter(docs.status === 200 && (await docs.text()).includes(a.corps.numero ?? "?"), "page Documents : l'avoir y figure", docs.status);
  const suivi = await fetch(lienSuivi(ORIGINE, "fr", resaB.jeton_suivi!));
  const sh = plat((await suivi.text()).replace(/<!-- -->/g, ""));
  noter(
    suivi.status === 200 && sh.includes("Cette réservation est annulée.") && sh.includes(plat(`${fmtEuro(mB.totalTtc)} vous ont été remboursés.`)),
    "« Ma réservation » : « Cette réservation est annulée. » et le montant remboursé",
    suivi.status,
  );
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  await nettoyer();
  try {
    const ids = await controles();
    if (process.argv.includes("--http")) await partieHttp(ids);
  } finally {
    await nettoyer();
  }
  console.log(`\n${nbCas} cas, ${echecs} échec${echecs > 1 ? "s" : ""}.`);
  if (echecs) process.exitCode = 1;
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
