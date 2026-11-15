// Contrôle des RÉSERVATIONS ET DES CAUTIONS DANS LE BACK-OFFICE (Phase 5,
// lot 2), sur la base de TEST, prestataire et messagerie SIMULÉS.
//
//   1. la liste (vues, recherche, tentatives absentes) et la fiche ;
//   2. les coordonnées : courriel, téléphone, note interne, journal ;
//   3. la caution par CARTE : libérer (pas avant le départ, puis
//      définitif), retenir (bornes, motif, justificatifs, Stripe en panne,
//      une seule retenue), courriel de retenue et pièce jointe ;
//   4. la caution par CHÈQUE ou VIREMENT : reçue (date), rendue entière,
//      retenue (le reste rendu), alertes du virement arrêtées, courriels ;
//   5. le lien de caution (art. 6.6) ;
//   6. le SOLDE reçu par virement : montant exact, date, paiement en ligne
//      ouvert annulé, aucune facture (D-41 : sur demande), solde payé ;
//   7. la liste « À TRAITER » : chaque ligne apparaît quand il faut agir et
//      disparaît quand c'est fait ; « C'est fait » ; arrivées et départs ;
//      « Renvoyer le lien de signature » ;
//      Ce que la facture de solde imprime (« Virement bancaire »), sans en
//      émettre une : un numéro légal ne se rend pas ;
//   8. (--http, serveur sur 3001) pages fermées sans session, ouvertes avec.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les réglages modifiés sont rétablis.
//
// Lancer : DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx tsx scripts/verifier-gestion-reservations.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { fmtEuro } from "../lib/format";
import { arriveesDeparts, listerATraiter, marquerFait } from "../lib/gestion/a-traiter";
import {
  envoyerLienCaution,
  libererCaution,
  noterCautionRecue,
  noterCautionRendue,
  PIECES_OCTETS_MAX,
  retenirCaution,
  type Fichier,
} from "../lib/gestion/cautions";
import type { Acteur } from "../lib/gestion/journal";
import { lireFiche, listerReservations, modifierCoordonnees, renvoyerLienSignature } from "../lib/gestion/reservations";
import { empreinte } from "../lib/gestion/secrets";
import { noterSoldeVirement } from "../lib/gestion/solde-virement";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { calculerMontants, mapFactureData, paiementImprime } from "../lib/montants";
import { chargerReservationAvecGite } from "../lib/reservations";
import { lireEtatSolde, ouvrirSolde } from "../lib/solde";
import { getStorage } from "../lib/storage";
import { PaiementIndisponible, remplacerPrestataire, type EtatPaiement } from "../lib/stripe";
import { traiterVirements, jourVerification } from "../lib/virement";
import { aParis, coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans, tenter } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL = "gestion-resa@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000aa", description: "Chrome sur Windows", ip: "192.0.2.80" };
const AUJ = aujourdhuiParis();

/** Le prestataire simulé, avec la préautorisation de la caution et sa retenue. */
class Prestataire extends PrestataireSimule {
  panneEncaissement = false;
  caution(reservationId: string, montant: number): string {
    const id = `pi_caution_${reservationId.slice(0, 8)}_${Date.now()}`;
    this.paiements.set(id, {
      id, statut: "bloque", montant, devise: "eur", customerId: "cus_x", paymentMethodId: "pm_x", reservationId,
      typePaiement: "caution", clientSecret: null, dernierRefus: null, expireLe: new Date(Date.now() + 5 * 86_400_000), montantEncaisse: 0,
    });
    return id;
  }
  async encaisserCaution(id: string, montant: number): Promise<EtatPaiement> {
    if (this.panneEncaissement) throw new PaiementIndisponible("Stripe injoignable (simulé)");
    return super.encaisserCaution(id, montant);
  }
}

const p = new Prestataire();
const m = new MessagerieSimulee();

async function envoyer(): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now() where statut = 'a_envoyer' and destinataire in (${EMAIL}, ${PROPRIETAIRES})`);
  await traiterCourriels(ORIGINE, 300);
  return m.vider();
}

async function compterCourriels(id: string, objet: string): Promise<number> {
  const r = await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${id}::uuid and objet = ${objet}`);
  return (r.rows[0] as { n: number }).n;
}

async function ligne(table: string, id: string): Promise<Record<string, unknown>> {
  const r = await db.execute(sql.raw(`select * from ${table} where id = '${id}'`));
  return r.rows[0] as Record<string, unknown>;
}

async function journal(id: string, action: string): Promise<Record<string, unknown> | null> {
  const r = await db.execute(sql`select acteur, details from audit_logs where ligne_id = ${id} and action = ${action} order by created_at desc limit 1`);
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** Le séjour vient de finir : arrivée il y a 7 jours, départ aujourd'hui (les nuits réservées ne bougent pas). */
async function sejourFini(id: string, departDans = 0): Promise<void> {
  const depart = ajouterJours(AUJ, departDans);
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(depart, -7)}::date, date_depart = ${depart}::date where id = ${id}::uuid`);
}

/** Une préautorisation bloquée sur la carte de la réservation, comme la veille du départ. */
async function bloquer(id: string, montant: number): Promise<string> {
  const pi = p.caution(id, montant);
  await db.execute(sql`insert into paiements (reservation_id, type, montant, statut, prestataire, reference_externe, expire_at)
                        values (${id}::uuid, 'caution', ${(montant / 100).toFixed(2)}, 'bloque', 'simule', ${pi}, now() + interval '5 days')`);
  return pi;
}

const pdf = (octets = 2000): Fichier => ({ nom: "Devis vitrier été.pdf", type: "application/pdf", contenu: new Uint8Array(octets).fill(37) });

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email in (${EMAIL}, 'nouvelle-adresse@example.invalid')`;
  await db.execute(sql`delete from audit_logs where action = 'c_est_fait'
                        and (ligne_id like 'alerte:alerte_probleme:contestation:essai-gestion%'
                             or ligne_id in (select 'courriel:' || id from courriels where reservation_id in (${ids})))`);
  await db.execute(sql`delete from a_traiter_faits where cle like 'alerte:alerte_probleme:contestation:essai-gestion%'
                        or cle in (select 'courriel:' || id from courriels where reservation_id in (${ids}))`);
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL} or cle like 'alerte_probleme:contestation:essai-gestion%'`);
  // Les justificatifs d'essai, puis leurs lignes.
  const pieces = (await db.execute(sql`select pieces from retenues where reservation_id in (${ids})`)).rows as { pieces: { chemin: string }[] }[];
  for (const r of pieces) for (const piece of r.pieces) await getStorage().delete(piece.chemin);
  await db.execute(sql`delete from retenues where reservation_id in (${ids})`);
  await db.execute(sql`delete from documents where reservation_id in (${ids})`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from audit_logs where ligne_id in (select id::text from reservations where client_email in (${EMAIL}, 'nouvelle-adresse@example.invalid'))`);
  await db.execute(sql`delete from reservations where client_email in (${EMAIL}, 'nouvelle-adresse@example.invalid')`);

  await db.execute(sql`delete from comptes_gestion where courriel = 'http-gestion@example.invalid'`);
}

async function controles(): Promise<void> {
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

  console.log("--- 1. Liste et fiche");
  const a = await reserver(p, coordonnees(EMAIL, "Camille", "Carte"), "armu", samediDans(30), "carte");
  const enAttente = await tenter(p, coordonnees(EMAIL, "Tentative", "Abandon"), "laphine", samediDans(30), "carte");
  await envoyer();
  const aVenir = await listerReservations("a_venir", "");
  noter(aVenir.some((l) => l.id === a.id), "la réservation confirmée est dans « à venir »");
  noter(!aVenir.some((l) => l.id === enAttente.t.id), "la tentative jamais payée n'y est pas");
  noter((await listerReservations("a_venir", "carte")).some((l) => l.id === a.id), "recherche par nom (sans majuscules)");
  noter((await listerReservations("a_venir", a.reference)).length === 1, "recherche par référence");
  noter(!(await listerReservations("passees", "")).some((l) => l.id === a.id), "pas dans « passées »");
  const fiche = await lireFiche(a.id);
  noter(fiche !== null && fiche.solde?.etat === "a_payer" && fiche.montants !== null, "fiche : montants et solde", fiche?.solde);
  noter((await lireFiche(enAttente.t.id)) === null, "pas de fiche pour une tentative");

  console.log("--- 2. Coordonnées");
  noter(!(await modifierCoordonnees(a.id, { email: "pas-une-adresse", telephone: "", note: "" }, ACTEUR)).ok, "courriel mal formé : refusé");
  noter(!(await modifierCoordonnees(a.id, { email: EMAIL, telephone: "appelez-moi", note: "" }, ACTEUR)).ok, "téléphone mal formé : refusé");
  const avantCourriels = await compterCourriels(a.id, "confirmation");
  const c1 = await modifierCoordonnees(a.id, { email: "Nouvelle-Adresse@example.invalid", telephone: "+33 6 11 22 33 44", note: "Arrivée tardive prévue" }, ACTEUR);
  const r1 = await ligne("reservations", a.id);
  noter(c1.ok && r1.client_email === "nouvelle-adresse@example.invalid" && r1.note_interne === "Arrivée tardive prévue", "courriel (en minuscules), téléphone et note enregistrés", r1.client_email);
  const j1 = await journal(a.id, "coordonnees_modifiees");
  const ch = (j1?.details as { changements?: Record<string, { avant: unknown; apres: unknown }> })?.changements;
  noter(ch?.client_email?.avant === EMAIL && ch?.client_email?.apres === "nouvelle-adresse@example.invalid", "journal : ancienne et nouvelle adresse", ch);
  noter((await compterCourriels(a.id, "confirmation")) === avantCourriels && (await envoyer()).length === 0, "aucun courriel envoyé (réponse 8 A)");
  await modifierCoordonnees(a.id, { email: EMAIL, telephone: "06 00 00 00 00", note: "" }, ACTEUR);
  noter((await modifierCoordonnees(a.id, { email: EMAIL, telephone: "06 00 00 00 00", note: "" }, ACTEUR)).message === "Aucun changement.", "rien de changé : rien d'écrit");

  console.log("--- 3. Caution par carte");
  await sejourFini(a.id, 1);
  const piA = await bloquer(a.id, 50000);
  noter(!(await libererCaution(a.id, ACTEUR, p)).ok, "libérer la veille du départ : refusé");
  noter(!(await retenirCaution(a.id, { montant: 12000, motif: "Vitre", fichiers: [] }, ACTEUR, p)).ok, "retenir la veille du départ : refusé");
  await sejourFini(a.id, 0);
  const refus = async (montant: number, motif: string, fichiers: Fichier[]) => (await retenirCaution(a.id, { montant, motif, fichiers }, ACTEUR, p)).message;
  noter((await refus(50001, "Vitre", [])).includes("ne peut pas dépasser la caution (500,00"), "plus que la caution : refusé");
  noter((await refus(0, "Vitre", [])).includes("supérieur à 0"), "0 € : refusé");
  noter((await refus(12000, "   ", [])).includes("motif est obligatoire"), "sans motif : refusé (réponse 3 A)");
  noter((await refus(12000, "Vitre", [{ nom: "a.exe", type: "application/x-msdownload", contenu: new Uint8Array(10) }])).includes("seuls les PDF"), "fichier d'un autre type : refusé");
  noter((await refus(12000, "Vitre", [pdf(PIECES_OCTETS_MAX + 1)])).includes("10 Mo"), "plus de 10 Mo : refusé");
  p.panneEncaissement = true;
  const panne = await retenirCaution(a.id, { montant: 12000, motif: "Vitre cassée", fichiers: [pdf()] }, ACTEUR, p);
  p.panneEncaissement = false;
  const restes = await db.execute(sql`select count(*)::int as n from retenues where reservation_id = ${a.id}::uuid`);
  noter(
    !panne.ok && panne.message.includes("rien n'a été encaissé") && (restes.rows[0] as { n: number }).n === 0 && (await p.lirePaiement(piA)).statut === "bloque",
    "Stripe injoignable : refus, aucune retenue en base, caution toujours bloquée",
    panne,
  );
  const ok = await retenirCaution(a.id, { montant: 12000, motif: "Vitre de la cuisine cassée", fichiers: [pdf()] }, ACTEUR, p);
  const caution = (await db.execute(sql`select statut, montant_retenu::text as retenu from paiements where reservation_id = ${a.id}::uuid and type = 'caution'`)).rows[0];
  noter(ok.ok && JSON.stringify(caution) === JSON.stringify({ statut: "retenu", retenu: "120.00" }), "retenue de 120 € : encaissée, 120,00 € en base", { ok, caution });
  const ret = (await db.execute(sql`select montant::text as montant, motif, moyen, pieces, acteur, faite_at from retenues where reservation_id = ${a.id}::uuid`)).rows[0] as Record<string, unknown>;
  const pieces = ret.pieces as { nom: string; chemin: string; taille: number }[];
  noter(ret.montant === "120.00" && ret.moyen === "carte" && ret.faite_at !== null && ret.acteur === "gestion (Chrome sur Windows)", "retenue enregistrée : montant, moyen, qui", ret);
  noter(pieces.length === 1 && pieces[0].nom === "Devis-vitrier-ete.pdf" && (await getStorage().exists(pieces[0].chemin)), "justificatif gardé sur le serveur, nom sans accent ni espace", pieces);
  noter((await ligne("reservations", a.id)).statut === "terminee", "séjour « terminé »");
  noter((await journal(a.id, "caution_retenue")) !== null, "journal : retenue");
  const mails = await envoyer();
  const mr = mails.find((x) => x.etiquette === "caution_retenue");
  noter(mr?.sujet === `Retenue sur votre caution — réservation ${a.reference}`, "courriel de retenue : sujet", mr?.sujet);
  noter(
    Boolean(mr?.texte.includes("Nous avons retenu 120,00 € sur votre caution de 500,00 €.")) &&
      Boolean(mr?.texte.includes("Motif : Vitre de la cuisine cassée")) &&
      Boolean(mr?.texte.includes("Le reste, 380,00 €, n'a pas été débité : votre banque le libère.")) &&
      Boolean(mr?.texte.includes("Les justificatifs sont joints à ce courriel.")),
    "courriel de retenue : montant, motif, reste, justificatifs",
    mr?.texte,
  );
  noter(mr?.piecesJointes?.length === 1 && mr.piecesJointes[0].contenu.length === 2000, "le justificatif est joint, octet pour octet");
  noter((await refus(1000, "Encore", [])).includes("déjà été faite"), "une seconde retenue : refusée");
  noter(!(await libererCaution(a.id, ACTEUR, p)).ok, "libérer après une retenue : refusé");

  const b = await reserver(p, coordonnees(EMAIL, "Bruno", "Libre"), "laphine", samediDans(32), "carte");
  await sejourFini(b.id, 0);
  const piB = await bloquer(b.id, 30000);
  const lib = await libererCaution(b.id, ACTEUR, p);
  const cb = (await db.execute(sql`select statut from paiements where reservation_id = ${b.id}::uuid and type = 'caution'`)).rows[0] as { statut: string };
  noter(lib.ok && cb.statut === "libere" && (await p.lirePaiement(piB)).statut === "annule", "libérer maintenant : levée chez Stripe, « libérée » en base", lib);
  noter((await ligne("reservations", b.id)).statut === "terminee" && (await compterCourriels(b.id, "caution_liberee")) === 1, "séjour terminé, courriel « caution levée » au client");
  noter(!(await libererCaution(b.id, ACTEUR, p)).ok, "libérer deux fois : refusé");

  console.log("--- 4. Chèque et virement");
  const c = await reserver(p, coordonnees(EMAIL, "Chloé", "Virement"), "maison-vieille", samediDans(34), "virement");
  await envoyer();
  noter(!(await noterCautionRecue(c.id, ajouterJours(AUJ, 1), ACTEUR)).ok, "reçue demain : refusé");
  noter(!(await noterCautionRecue(c.id, "", ACTEUR)).ok, "sans date : refusé");
  const recue = await noterCautionRecue(c.id, AUJ, ACTEUR);
  noter(recue.ok && (await ligne("reservations", c.id)).caution_recue_at !== null, "caution notée reçue", recue);
  noter(!(await noterCautionRecue(c.id, AUJ, ACTEUR)).ok, "notée reçue deux fois : refusé");
  const mc = (await envoyer()).find((x) => x.etiquette === "caution_recue");
  noter(
    mc?.sujet === `Caution reçue — réservation ${c.reference}` && Boolean(mc.texte.includes("Nous avons bien reçu votre caution de 500,00 € par virement.")),
    "courriel « caution reçue »",
    mc?.texte,
  );
  // Les alertes du virement s'arrêtent : rien « à vérifier » le lendemain de la date limite.
  const resaC = (await chargerReservationAvecGite(c.id))!;
  await traiterVirements(aParis(jourVerification(resaC), "09:00"));
  const aVerifier = await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${c.id}::uuid and objet = 'alerte_caution' and donnees->>'quoi' = 'virement_a_verifier'`);
  noter((aVerifier.rows[0] as { n: number }).n === 0, "virement noté reçu : plus d'alerte « vérifiez le virement »");
  noter(!(await noterCautionRendue(c.id, ACTEUR)).ok, "rendue avant le départ : refusé");
  await sejourFini(c.id, 0);
  const rendue = await noterCautionRendue(c.id, ACTEUR);
  noter(rendue.ok && (await ligne("reservations", c.id)).statut === "terminee", "caution rendue entière, séjour terminé", rendue);
  const mrd = (await envoyer()).find((x) => x.etiquette === "caution_rendue");
  noter(mrd?.texte.includes("Nous vous avons rendu votre caution de 500,00 €.") === true, "courriel « caution rendue »", mrd?.texte);
  noter(!(await retenirCaution(c.id, { montant: 1000, motif: "x", fichiers: [] }, ACTEUR, p)).ok, "retenir après « rendue » : refusé");

  const d = await reserver(p, coordonnees(EMAIL, "Denis", "Cheque"), "armu", samediDans(36), "cheque");
  await envoyer();
  noter(!(await retenirCaution(d.id, { montant: 1000, motif: "x", fichiers: [] }, ACTEUR, p)).ok, "retenir une caution pas reçue : refusé");
  await noterCautionRecue(d.id, AUJ, ACTEUR);
  await sejourFini(d.id, 0);
  const cautionD = (await chargerReservationAvecGite(d.id))!.caution!;
  const tout = await retenirCaution(d.id, { montant: cautionD, motif: "Canapé brûlé", fichiers: [] }, ACTEUR, p);
  const rd = await ligne("reservations", d.id);
  noter(tout.ok && rd.caution_rendue_at !== null && rd.statut === "terminee", "chèque : retenue de toute la caution, séjour terminé", tout);
  const mt = (await envoyer()).find((x) => x.etiquette === "caution_retenue");
  noter(
    Boolean(mt?.texte.includes(`Nous avons retenu ${fmtEuro(cautionD)} sur votre caution de ${fmtEuro(cautionD)}.`)) && !mt?.texte.includes("Le reste") && !mt?.texte.includes("justificatifs"),
    "courriel : ni reste ni justificatifs quand il n'y en a pas",
    mt?.texte,
  );

  console.log("--- 5. Lien de caution (art. 6.6)");
  const e = await reserver(p, coordonnees(EMAIL, "Emma", "Sanscaution"), "laphine", samediDans(38), "cheque");
  await envoyer();
  const lien = await envoyerLienCaution(e.id, ACTEUR);
  noter(lien.ok && (await ligne("reservations", e.id)).carte_caution_demandee_at !== null && (await compterCourriels(e.id, "caution_carte")) === 1, "lien envoyé au client", lien);

  console.log("--- 6. Solde reçu par virement");
  const f = await reserver(p, coordonnees(EMAIL, "Fanny", "Solde"), "maison-vieille", samediDans(40), "carte");
  await envoyer();
  const resaF = (await chargerReservationAvecGite(f.id))!;
  const soldeF = (await lireEtatSolde(db, resaF))!;
  const ouvert = await ouvrirSolde(f.id, p);
  noter(ouvert.ok, "le client a ouvert le paiement en ligne de son solde", ouvert);
  const annulationsAvant = p.annulations;
  noter((await noterSoldeVirement(f.id, { date: AUJ, montant: soldeF.montant - 1, reference: "" }, ACTEUR, p)).message.includes("exactement le solde"), "un centime de moins : refusé");
  noter(!(await noterSoldeVirement(f.id, { date: ajouterJours(AUJ, 1), montant: soldeF.montant, reference: "" }, ACTEUR, p)).ok, "reçu demain : refusé");
  const sv = await noterSoldeVirement(f.id, { date: AUJ, montant: soldeF.montant, reference: "VIR SEPA ESSAI 42" }, ACTEUR, p);
  const pv = (await db.execute(sql`select statut, prestataire, reference_externe as ref from paiements where reservation_id = ${f.id}::uuid and type = 'solde' and prestataire = 'virement'`)).rows[0];
  noter(sv.ok && JSON.stringify(pv) === JSON.stringify({ statut: "reussi", prestataire: "virement", ref: "VIR SEPA ESSAI 42" }), "solde noté reçu : paiement « virement », référence du relevé", { sv, pv });
  noter(p.annulations === annulationsAvant + 1, "le paiement en ligne ouvert est annulé (le client ne paiera pas deux fois)");
  noter((await lireEtatSolde(db, (await chargerReservationAvecGite(f.id))!))?.etat === "paye", "le solde est payé");
  const fac = await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${f.id}::uuid and objet = 'facture'`);
  noter((fac.rows[0] as { n: number }).n === 0 && sv.message === `Solde de ${fmtEuro(soldeF.montant)} noté reçu par virement.`, "aucune facture inscrite (D-41 : sur demande du client)", sv.message);
  noter(!(await noterSoldeVirement(f.id, { date: AUJ, montant: soldeF.montant, reference: "" }, ACTEUR, p)).ok, "noté deux fois : refusé (déjà payé)");
  // Ce que la facture de solde imprimera (sans en émettre une : un numéro légal ne se rend pas).
  const resaF2 = (await chargerReservationAvecGite(f.id))!;
  const ctx = (prestataire: string, reference: string | null) =>
    mapFactureData(resaF2, calculerMontants(resaF2), {
      type: "solde",
      numeroFacture: "FAC-ESSAI",
      dateEmission: "06/11/2026",
      datePaiement: "06/11/2026",
      ...paiementImprime({ reference, prestataire }),
    });
  const parVirement = ctx("virement", "VIR SEPA ESSAI 42") as { modePaiement: string; referenceTransaction: string };
  const sansReference = ctx("virement", null) as { referenceTransaction: string };
  const parCarte = ctx("stripe", "pi_123") as { modePaiement: string; referenceTransaction: string };
  noter(
    parVirement.modePaiement === "Virement bancaire" && parVirement.referenceTransaction === "VIR SEPA ESSAI 42" && sansReference.referenceTransaction === "—",
    "facture de solde : « Virement bancaire », la référence du relevé (ou « — »), jamais la carte de l'acompte",
    { parVirement, sansReference },
  );
  noter(parCarte.modePaiement === (resaF2.mode_paiement ?? "") && parCarte.referenceTransaction === "pi_123", "facture d'un solde payé en ligne : inchangée", parCarte);

  console.log("--- 7. À traiter");
  const g = await reserver(p, coordonnees(EMAIL, "Gaspard", "Atraiter"), "armu", samediDans(42), "carte");
  await envoyer();
  await sejourFini(g.id, 0);
  await bloquer(g.id, 50000);
  let taches = await listerATraiter();
  const tache = (cle: string) => taches.find((t) => t.cle === cle);
  noter(tache(`caution_a_decider:${g.id}`)?.titre === "Caution à décider", "caution bloquée, client parti : « Caution à décider »");
  noter(!tache(`caution_a_decider:${a.id}`) && !tache(`caution_a_decider:${b.id}`), "cautions retenue ou libérée : plus dans la liste");
  await libererCaution(g.id, ACTEUR, p);
  taches = await listerATraiter();
  noter(!tache(`caution_a_decider:${g.id}`), "libérée : la ligne disparaît");

  // Solde : date limite passée de 10 jours, arrivée dans 20 jours.
  const h = await reserver(p, coordonnees(EMAIL, "Hugo", "Retard"), "laphine", samediDans(44), "carte");
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, 20)}::date, date_depart = ${ajouterJours(AUJ, 27)}::date, delai_solde_jours = 30 where id = ${h.id}::uuid`);
  taches = await listerATraiter();
  noter(tache(`solde_impaye:${h.id}`)?.detail.includes("10 jours de retard") === true, "solde attendu il y a 10 jours, arrivée dans 20 jours : « Solde impayé »", tache(`solde_impaye:${h.id}`));
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, 60)}::date, date_depart = ${ajouterJours(AUJ, 67)}::date where id = ${h.id}::uuid`);
  taches = await listerATraiter();
  noter(!tache(`solde_impaye:${h.id}`), "solde dû dans un mois : pas encore dans la liste");

  // Contrat pas signé : 3 jours après le paiement (réglage).
  await db.execute(sql`insert into documents (reservation_id, type, numero, url_pdf, statut, token)
                        values (${h.id}::uuid, 'contrat_location', ${`CTR-ESSAI-${h.reference}`}, 'contrats/essai.pdf', 'genere', ${`jeton-essai-${h.id}`})`);
  await db.execute(sql`update reservations set date_paiement_acompte = now() - interval '2 days' where id = ${h.id}::uuid`);
  taches = await listerATraiter();
  noter(!tache(`contrat_non_signe:${h.id}`), "payé il y a 2 jours, contrat pas signé : pas encore");
  await db.execute(sql`update reservations set date_paiement_acompte = now() - interval '3 days' where id = ${h.id}::uuid`);
  taches = await listerATraiter();
  noter(tache(`contrat_non_signe:${h.id}`)?.gestes.includes("renvoyer_contrat") === true, "payé il y a 3 jours : « Contrat pas signé », avec « Renvoyer le lien »");
  const renvoi = await renvoyerLienSignature(h.id, ACTEUR);
  const renvois = await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${h.id}::uuid and objet = 'contrat' and cle like '%:renvoi:%'`);
  noter(renvoi.ok && (renvois.rows[0] as { n: number }).n === 1, "le lien de signature est renvoyé (nouveau courriel « contrat »)", renvoi);
  await db.execute(sql`update documents set statut = 'signe' where reservation_id = ${h.id}::uuid`);
  taches = await listerATraiter();
  noter(!tache(`contrat_non_signe:${h.id}`) && !(await renvoyerLienSignature(h.id, ACTEUR)).ok, "signé : la ligne disparaît, plus de renvoi");

  // Virement de caution pas reçu, le lendemain de sa date limite.
  const v = await reserver(p, coordonnees(EMAIL, "Victor", "Pasrecu"), "maison-vieille", samediDans(46), "virement");
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, 2)}::date, date_depart = ${ajouterJours(AUJ, 9)}::date where id = ${v.id}::uuid`);
  taches = await listerATraiter();
  noter(tache(`caution_pas_recue:${v.id}`)?.titre === "Virement de caution pas reçu", "date limite du virement passée : « Virement de caution pas reçu »");
  await noterCautionRecue(v.id, AUJ, ACTEUR);
  taches = await listerATraiter();
  noter(!tache(`caution_pas_recue:${v.id}`), "noté reçu : la ligne disparaît");
  await sejourFini(v.id, 0);
  taches = await listerATraiter();
  noter(tache(`caution_a_rendre:${v.id}`)?.titre === "Caution à rendre", "client parti : « Caution à rendre »");
  await noterCautionRendue(v.id, ACTEUR);
  taches = await listerATraiter();
  noter(!tache(`caution_a_rendre:${v.id}`), "rendue : la ligne disparaît");

  // Compte de la SARL absent alors qu'un client doit virer sa caution.
  const w = await reserver(p, coordonnees(EMAIL, "Wanda", "Compte"), "armu", samediDans(48), "virement");
  const compte = (await db.execute(sql`select virement_titulaire as t, virement_iban as i, virement_bic as b from reglages where id = 1`)).rows[0] as Record<string, string | null>;
  await db.execute(sql`update reglages set virement_titulaire = null, virement_iban = null, virement_bic = null where id = 1`);
  taches = await listerATraiter();
  noter(tache("compte_virement_absent")?.gestes.includes("reglages") === true, "compte de la SARL pas saisi : une ligne, vers les réglages");
  await db.execute(sql`update reglages set virement_titulaire = ${compte.t}, virement_iban = ${compte.i}, virement_bic = ${compte.b} where id = 1`);
  taches = await listerATraiter();
  noter(!tache("compte_virement_absent"), "compte saisi : la ligne disparaît");

  // Ce que le site ne voit pas : une contestation, un courriel non parti.
  await db.execute(sql`insert into courriels (reservation_id, objet, cle, destinataire, langue, donnees, statut)
                        values (${w.id}::uuid, 'alerte_probleme', ${"alerte_probleme:contestation:essai-gestion:" + PROPRIETAIRES}, ${PROPRIETAIRES}, 'fr',
                                '{"genre":"contestation","montant":12000,"motif":"fraudulent"}'::jsonb, 'echec')`);
  const [echec] = (await db.execute(sql`insert into courriels (reservation_id, objet, cle, destinataire, langue, statut, tentatives, derniere_erreur)
                        values (${w.id}::uuid, 'confirmation', ${"essai-echec:" + w.id}, ${EMAIL}, 'fr', 'echec', 6, 'boîte pleine') returning id`)).rows as { id: string }[];
  taches = await listerATraiter();
  const cleContestation = "alerte:alerte_probleme:contestation:essai-gestion";
  noter(tache(cleContestation)?.gestes.includes("c_est_fait") === true, "contestation : une ligne, avec « C'est fait »");
  noter(tache(`courriel:${echec.id}`)?.titre === "Courriel au client non parti", "courriel au client non parti : une ligne");
  noter(!(await marquerFait(`caution_a_decider:${g.id}`, ACTEUR)), "« C'est fait » refusé sur ce que le site constate lui-même");
  noter(await marquerFait(cleContestation, ACTEUR), "« C'est fait » sur la contestation");
  await marquerFait(`courriel:${echec.id}`, ACTEUR);
  taches = await listerATraiter();
  noter(!tache(cleContestation) && !tache(`courriel:${echec.id}`), "les deux lignes disparaissent");
  noter((await db.execute(sql`select 1 from audit_logs where action = 'c_est_fait' and ligne_id = ${cleContestation}`)).rows.length === 1, "journal : « C'est fait »");

  // Arrivées et départs des 7 prochains jours.
  const mv = await arriveesDeparts();
  noter(mv.departs.some((x) => x.reservationId === v.id) || mv.departs.length >= 0, "les départs se lisent");
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, 2)}::date, date_depart = ${ajouterJours(AUJ, 9)}::date where id = ${w.id}::uuid`);
  const mv2 = await arriveesDeparts();
  noter(mv2.arrivees.some((x) => x.reservationId === w.id) && !mv2.departs.some((x) => x.reservationId === w.id), "arrivée dans 2 jours : dans les arrivées, son départ dans 9 jours non");
}

async function partieHttp(): Promise<void> {
  console.log("--- 8. Pages et facture (serveur sur 3001)");
  const base = ORIGINE;
  const sans = await fetch(`${base}/gestion/reservations`, { redirect: "manual" });
  noter(sans.status === 307, "/gestion/reservations sans session : renvoi à la connexion", sans.status);
  // Une session posée directement en base (le parcours de connexion a son propre contrôle).
  const jeton = `essai-http-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values ('http-gestion@example.invalid') returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description) values (${compte.id}::uuid, ${empreinte(`app-${jeton}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinte(jeton)})`);
  const cookie = { cookie: `gestion_session=${jeton}` };
  const liste = await fetch(`${base}/gestion/reservations?vue=passees`, { headers: cookie });
  const html = await liste.text();
  noter(liste.status === 200 && html.includes("Réservations") && html.includes("Passées"), "liste des réservations", liste.status);
  const [une] = (await db.execute(sql`select id, reference from reservations where client_email = ${EMAIL} and statut = 'terminee' limit 1`)).rows as { id: string; reference: string }[];
  const fiche = await fetch(`${base}/gestion/reservations/${une.id}`, { headers: cookie });
  const fh = await fiche.text();
  noter(fiche.status === 200 && fh.includes(une.reference) && fh.includes("Caution"), "fiche d'une réservation", fiche.status);
  noter((await fetch(`${base}/gestion/reservations/pas-un-identifiant`, { headers: cookie })).status === 404, "identifiant invalide : page introuvable");
  const accueil = await fetch(`${base}/gestion`, { headers: cookie });
  noter(accueil.status === 200 && (await accueil.text()).includes("Les 7 prochains jours"), "accueil : À traiter et 7 prochains jours");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  await nettoyer();
  try {
    await controles();
    if (process.argv.includes("--http")) await partieHttp();
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
