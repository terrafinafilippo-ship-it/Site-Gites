// Contrôle des FACTURES SUR DEMANDE (D-41, 14 novembre 2026), sur la base de
// TEST.
//
//   1. la saisie « Au nom d'une entreprise » : vide, incomplète, SIREN ;
//   2. séjour payé en deux fois : aucune facture après les paiements ; refus
//      tant que le solde n'est pas reçu ; récapitulatif, empreinte, courriel
//      inscrit, journal ; pas deux demandes à la fois ; courriel envoyé avec
//      le PDF ; facture déjà faite : « Renvoyer la facture » ;
//   3. séjour payé en une fois, au nom d'une entreprise ;
//   4. facture de retenue : refusée sans retenue, puis faite ;
//   5. réservation annulée : refusée ;
//   6. (--http, serveur sur 3001) les VRAIES factures, par /api/factures :
//      deux paiements listés, entreprise et SIREN, facture de retenue et sa
//      phrase de TVA, idempotence, refus sans numéro consommé, suite sans
//      trou ; le texte des PDF est lu (pypdf).
//
// Les parties 1 à 5 simulent le prestataire, la messagerie et l'émission
// (le moteur PDF ne se charge pas sous tsx) ; la logique est la vraie.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin.
//
// Lancer : DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx tsx scripts/verifier-factures.ts [--http]
import "../db/env";

import { execFileSync } from "node:child_process";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { centimesDepuisNumeric } from "../lib/centimes";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { fmtEuro } from "../lib/format";
import { noterCautionRecue, retenirCaution } from "../lib/gestion/cautions";
import { demanderFacture, lireEntrepriseSaisie, type SaisieEntreprise } from "../lib/gestion/factures";
import type { Acteur } from "../lib/gestion/journal";
import { noterSoldeVirement } from "../lib/gestion/solde-virement";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { calculerMontants, type EntrepriseFacture } from "../lib/montants";
import { chargerReservationAvecGite } from "../lib/reservations";
import { lireEtatSolde } from "../lib/solde";
import { getStorage } from "../lib/storage";
import { remplacerPrestataire } from "../lib/stripe";
import { coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL = "factures-essai@example.invalid";
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000fa", description: "Firefox sur Windows", ip: "192.0.2.90" };
const AUJ = aujourdhuiParis();

const p = new PrestataireSimule();
const m = new MessagerieSimulee();

/** L'émetteur simulé : note chaque appel, renvoie une facture fictive. */
const appels: { type: string; entreprise: EntrepriseFacture | null }[] = [];

async function envoyer(): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now() where statut = 'a_envoyer' and destinataire = ${EMAIL}`);
  await traiterCourriels(ORIGINE, 300);
  return m.vider().filter((x) => x.destinataire === EMAIL);
}

async function courrielsFacture(id: string): Promise<{ statut: string; donnees: Record<string, unknown> }[]> {
  const r = await db.execute(sql`select statut, donnees from courriels where reservation_id = ${id}::uuid and objet = 'facture' order by created_at`);
  return r.rows as { statut: string; donnees: Record<string, unknown> }[];
}

const SAISIE_VIDE: SaisieEntreprise = { raisonSociale: "", adresse: "", codePostal: "", ville: "", pays: "", siren: "" };
const SAISIE_ENTREPRISE: SaisieEntreprise = {
  raisonSociale: "  Ateliers   Essai SAS ",
  adresse: "12 rue de l'Essai",
  codePostal: "69002",
  ville: "Lyon",
  pays: "",
  siren: "123456789",
};

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL}`);
  await db.execute(sql`delete from retenues where reservation_id in (${ids})`);
  await db.execute(sql`delete from documents where reservation_id in (${ids})`);
  await db.execute(sql`delete from factures where reservation_id in (${ids})`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from audit_logs where ligne_id in (select id::text from reservations where client_email = ${EMAIL})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL}`);
}

/** Le séjour vient de finir : arrivée il y a 7 jours, départ aujourd'hui. */
async function sejourFini(id: string): Promise<void> {
  await db.execute(sql`update reservations set date_arrivee = ${ajouterJours(AUJ, -7)}::date, date_depart = ${AUJ}::date where id = ${id}::uuid`);
}

interface Ids {
  deuxFois: string;
  integral: string;
  retenue: string;
}

async function controles(): Promise<Ids> {
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });
  remplacerEmetteurFacture({
    emettre: async (_id, type, entreprise) => {
      appels.push({ type, entreprise: entreprise ?? null });
      return { ok: true, facture: { numero: "FAC-SIMULE-042", type, montant: type === "retenue" ? 12000 : 98765, chemin: "factures/FAC-SIMULE-042.pdf" } };
    },
    pdf: async () => Buffer.from("%PDF-simule"),
  });

  console.log("--- 1. Au nom d'une entreprise : la saisie");
  const vide = lireEntrepriseSaisie(SAISIE_VIDE);
  noter("entreprise" in vide && vide.entreprise === null, "rien de saisi : facture au nom du client");
  const complete = lireEntrepriseSaisie(SAISIE_ENTREPRISE);
  noter(
    "entreprise" in complete &&
      JSON.stringify(complete.entreprise) ===
        JSON.stringify({ raisonSociale: "Ateliers Essai SAS", adresse: "12 rue de l'Essai", codePostal: "69002", ville: "Lyon", pays: "France", siren: "123 456 789" }),
    "saisie complète : espaces nettoyés, pays « France » par défaut, SIREN « 123 456 789 »",
    complete,
  );
  const msg = (s: Partial<SaisieEntreprise>) => {
    const r = lireEntrepriseSaisie({ ...SAISIE_ENTREPRISE, ...s });
    return "refus" in r ? r.refus : "";
  };
  noter(msg({ adresse: " " }) === "Indiquez l'adresse.", "sans adresse : refusé");
  noter(msg({ ville: "" }) === "Indiquez la ville.", "sans ville : refusé");
  noter(msg({ siren: "12345678" }).startsWith("Le SIREN compte 9 chiffres"), "SIREN de 8 chiffres : refusé");
  noter(msg({ siren: "12345678A" }).startsWith("Le SIREN compte 9 chiffres"), "SIREN avec une lettre : refusé");
  noter(msg({ raisonSociale: "x".repeat(121) }).includes("dépasse 120 caractères"), "nom trop long : refusé");
  noter(msg({ raisonSociale: "" }).startsWith("Indiquez le nom de l'entreprise"), "adresse sans nom d'entreprise : refusé");
  const sansSiren = lireEntrepriseSaisie({ ...SAISIE_ENTREPRISE, siren: "" });
  noter("entreprise" in sansSiren && sansSiren.entreprise?.siren === null, "SIREN facultatif");

  console.log("--- 2. Séjour payé en deux fois");
  const a = await reserver(p, coordonnees(EMAIL, "Camille", "Essai"), "armu", samediDans(46), "carte");
  await envoyer();
  noter((await courrielsFacture(a.id)).length === 0, "paiement de l'acompte : aucune facture (D-41)");
  const avantSolde = await demanderFacture(a.id, "total", null, ACTEUR, null);
  noter(avantSolde.etape === "refus" && avantSolde.message.startsWith("Le solde n'est pas encore reçu"), "solde pas reçu : refusé", avantSolde);
  const solde = (await lireEtatSolde(db, (await chargerReservationAvecGite(a.id))!))!;
  const sv = await noterSoldeVirement(a.id, { date: AUJ, montant: solde.montant, reference: "VIR ESSAI FACTURE" }, ACTEUR, p);
  noter(sv.ok && (await courrielsFacture(a.id)).length === 0, "solde reçu par virement : toujours aucune facture", sv);
  const totalA = calculerMontants((await chargerReservationAvecGite(a.id))!).totalTtc;
  const plan = await demanderFacture(a.id, "total", null, ACTEUR, null);
  const lignesAttendues = [
    `Facture du séjour : ${fmtEuro(totalA)}, au nom de Camille ESSAI.`,
    `Envoyée par courriel à ${EMAIL}.`,
    "Elle reçoit le prochain numéro de facture et ne pourra plus être supprimée.",
  ];
  noter(
    plan.etape === "plan" && JSON.stringify(plan.lignes) === JSON.stringify(lignesAttendues),
    "récapitulatif : montant, au nom du client, adresse du courriel, « ne pourra plus être supprimée »",
    plan,
  );
  const faux = await demanderFacture(a.id, "total", null, ACTEUR, "0".repeat(32));
  noter(faux.etape === "plan" && faux.message === "La facture a changé : relisez avant de confirmer." && (await courrielsFacture(a.id)).length === 0, "empreinte fausse : rien n'est inscrit", faux);
  const fait = await demanderFacture(a.id, "total", null, ACTEUR, plan.etape === "plan" ? plan.empreinte : null);
  const inscrits = await courrielsFacture(a.id);
  noter(
    fait.etape === "fait" && fait.message === `La facture est créée et part à ${EMAIL} dans un instant.` &&
      inscrits.length === 1 && inscrits[0].donnees.type === "total" && !("entreprise" in inscrits[0].donnees),
    "confirmé : un courriel « facture » inscrit (séjour, au nom du client)",
    { fait, inscrits },
  );
  const jr = await db.execute(sql`select details from audit_logs where ligne_id = ${a.id} and action = 'facture_demandee'`);
  const dj = (jr.rows[0] as { details: Record<string, unknown> } | undefined)?.details;
  noter(dj?.type === "total" && dj.entreprise === null && dj.appareil_id === "00000000-0000-0000-0000-0000000000fa", "journal : facture demandée, par quel appareil", jr.rows);
  const double = await demanderFacture(a.id, "total", null, ACTEUR, null);
  noter(double.etape === "refus" && double.message === "Cette facture est déjà en cours d'envoi.", "deuxième demande pendant l'envoi : refusée", double);
  const envA = await envoyer();
  const facA = envA.find((x) => x.etiquette === "facture");
  noter(
    !!facA && facA.sujet.startsWith("Votre facture FAC-SIMULE-042 — réservation ") && facA.texte.includes("Voici la facture de votre séjour, réglé en totalité") &&
      facA.piecesJointes?.[0]?.nom === "FAC-SIMULE-042.pdf",
    "courriel envoyé : sujet, phrase, PDF joint",
    facA?.sujet,
  );
  noter(appels.length === 1 && appels[0].type === "total" && appels[0].entreprise === null, "émission demandée pour la facture du séjour, sans entreprise", appels);
  await db.execute(sql`insert into factures (numero, type, reservation_id, montant_ttc, donnees) values ('ESSAI-FACT-001', 'total', ${a.id}::uuid, 1.00, '{}'::jsonb)`);
  const existe = await demanderFacture(a.id, "total", null, ACTEUR, null);
  noter(existe.etape === "refus" && existe.message === "La facture ESSAI-FACT-001 existe déjà : utilisez « Renvoyer la facture ».", "facture déjà faite : « Renvoyer la facture »", existe);
  await db.execute(sql`delete from factures where numero = 'ESSAI-FACT-001'`);

  console.log("--- 3. Séjour payé en une fois, au nom d'une entreprise");
  const b = await reserver(p, coordonnees(EMAIL, "Bruno", "Integral"), "laphine", samediDans(2), "virement");
  await envoyer();
  noter((await chargerReservationAvecGite(b.id))?.paiement_integral === true && (await courrielsFacture(b.id)).length === 0, "payé en une fois : aucune facture (D-41)");
  const ent = (complete as { entreprise: EntrepriseFacture }).entreprise;
  const planB = await demanderFacture(b.id, "total", ent, ACTEUR, null);
  noter(
    planB.etape === "plan" && planB.lignes[0].endsWith("au nom de Ateliers Essai SAS.") &&
      planB.lignes[1] === "Adresse : 12 rue de l'Essai, 69002 Lyon, France — SIREN 123 456 789.",
    "récapitulatif : nom de l'entreprise, adresse et SIREN",
    planB,
  );
  const autreEnt = await demanderFacture(b.id, "total", { ...ent, raisonSociale: "Autre SARL" }, ACTEUR, planB.etape === "plan" ? planB.empreinte : null);
  noter(autreEnt.etape === "plan" && autreEnt.message !== undefined, "entreprise changée entre le récapitulatif et la confirmation : à relire", autreEnt);
  await demanderFacture(b.id, "total", ent, ACTEUR, planB.etape === "plan" ? planB.empreinte : null);
  const inscritsB = await courrielsFacture(b.id);
  const memes = (x: unknown, y: unknown) => JSON.stringify(x, Object.keys(ent).sort()) === JSON.stringify(y, Object.keys(ent).sort());
  noter(inscritsB.length === 1 && memes(inscritsB[0].donnees.entreprise, ent), "courriel inscrit avec l'entreprise", inscritsB);
  await envoyer();
  noter(appels.length === 2 && memes(appels[1].entreprise, ent), "émission demandée au nom de l'entreprise", appels[1]);

  console.log("--- 4. Facture de retenue");
  const c = await reserver(p, coordonnees(EMAIL, "Chloé", "Retenue"), "maison-vieille", samediDans(48), "cheque");
  await envoyer();
  const sansRetenue = await demanderFacture(c.id, "retenue", null, ACTEUR, null);
  noter(sansRetenue.etape === "refus" && sansRetenue.message.startsWith("Aucune retenue"), "sans retenue : refusé", sansRetenue);
  await noterCautionRecue(c.id, AUJ, ACTEUR);
  await sejourFini(c.id);
  const ret = await retenirCaution(c.id, { montant: 12000, motif: "Vitre de la cuisine cassée", fichiers: [] }, ACTEUR, p);
  noter(ret.ok, "retenue de 120 € sur le chèque", ret);
  await envoyer();
  const planC = await demanderFacture(c.id, "retenue", null, ACTEUR, null);
  noter(
    planC.etape === "plan" && planC.lignes[0].replace(/ | /g, " ") === "Facture de la retenue sur la caution : 120,00 €, au nom de Chloé RETENUE.",
    "récapitulatif : 120,00 €, au nom du client",
    planC,
  );
  await demanderFacture(c.id, "retenue", null, ACTEUR, planC.etape === "plan" ? planC.empreinte : null);
  const envC = await envoyer();
  const facC = envC.find((x) => x.etiquette === "facture");
  noter(
    !!facC && facC.texte.replace(/ | /g, " ").includes("Voici la facture de la retenue sur votre dépôt de garantie : 120,00 €."),
    "courriel : « Voici la facture de la retenue sur votre dépôt de garantie : 120,00 €. »",
    facC?.texte,
  );
  noter(appels.length === 3 && appels[2].type === "retenue", "émission demandée pour la retenue", appels[2]);

  console.log("--- 5. Réservation annulée");
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${c.id}::uuid`);
  const annulee = await demanderFacture(c.id, "total", null, ACTEUR, null);
  noter(annulee.etape === "refus" && annulee.message === "Réservation au statut « annulee » : pas de facture.", "réservation annulée : refusée", annulee);
  await db.execute(sql`update reservations set statut = 'terminee' where id = ${c.id}::uuid`);

  return { deuxFois: a.id, integral: b.id, retenue: c.id };
}

// ─── Par le serveur (--http) : les vraies factures ────────────────────────────

/** Le texte d'un PDF (pypdf), espaces fines ramenées à des espaces. */
function textePdf(octets: Buffer): string {
  const code = "import sys,io,pypdf;r=pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read()));sys.stdout.buffer.write('\\n'.join(p.extract_text() for p in r.pages).encode('utf-8'))";
  return execFileSync("python", ["-c", code], { input: octets }).toString("utf-8").replace(/[  ]/g, " ");
}

async function dernierNumero(): Promise<number> {
  const r = await db.execute(sql`select coalesce(max(dernier_numero), 0)::int as n from compteurs_documents
                                  where serie = 'FAC' and annee = extract(year from now() at time zone 'Europe/Paris')::int`);
  return (r.rows[0] as { n: number }).n;
}

async function partieHttp(ids: Ids): Promise<void> {
  console.log(`--- 6. Les vraies factures (${ORIGINE})`);
  const secret = process.env.DOCUMENT_SERVICE_SECRET;
  if (!secret) throw new Error("DOCUMENT_SERVICE_SECRET absent de .env.local");
  const emettre = async (reservationId: string, type: string, entreprise?: EntrepriseFacture) => {
    const r = await fetch(`${ORIGINE}/api/factures`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-secret": secret },
      body: JSON.stringify({ reservationId, type, ...(entreprise ? { entreprise } : {}) }),
    });
    return { status: r.status, corps: (await r.json()) as { numero?: string; error?: string } };
  };
  const ligneFacture = async (numero: string) =>
    (await db.execute(sql`select type, montant_ttc::text as montant, pdf_url, donnees from factures where numero = ${numero}`)).rows[0] as
      | { type: string; montant: string; pdf_url: string; donnees: Record<string, unknown> }
      | undefined;

  // Une réservation pas entièrement payée : refusée, aucun numéro consommé.
  const nonPayee = await reserver(p, coordonnees(EMAIL, "Denis", "Nonpaye"), "armu", samediDans(50), "carte");
  const avantRefus = await dernierNumero();
  const refus = await emettre(nonPayee.id, "total");
  noter(refus.status === 409 && (await dernierNumero()) === avantRefus, "séjour pas entièrement payé : 409, aucun numéro consommé", refus);

  const a = await emettre(ids.deuxFois, "total");
  const fa = a.corps.numero ? await ligneFacture(a.corps.numero) : undefined;
  const resaA = (await chargerReservationAvecGite(ids.deuxFois))!;
  const mA = calculerMontants(resaA);
  const paiementsA = fa?.donnees.paiements as { objet: string; mode: string; reference: string; montant: number }[] | undefined;
  noter(
    a.status === 200 && fa?.type === "total" && centimesDepuisNumeric(fa.montant) === mA.totalTtc && fa.donnees.formatVersion === 4,
    "facture du séjour payé en deux fois : émise, montant = total, instantané format 4",
    { a, fa: fa && { ...fa, donnees: undefined } },
  );
  noter(
    paiementsA?.length === 2 && paiementsA[0].objet === "Acompte" && paiementsA[0].montant === mA.acompte &&
      paiementsA[1].objet === "Solde" && paiementsA[1].montant === mA.solde && paiementsA[1].mode === "Virement bancaire" &&
      paiementsA[1].reference === "VIR ESSAI FACTURE",
    "les deux paiements listés : acompte (carte), solde (virement, référence du relevé)",
    paiementsA,
  );
  const pdfA = fa ? textePdf(await getStorage().read(fa.pdf_url)) : "";
  noter(
    pdfA.replace(/ /g, "").includes("PAIEMENTSREÇUS") && pdfA.indexOf("Acompte :") < pdfA.indexOf("Solde :") && pdfA.includes("Acompte :") && pdfA.includes("Solde :") && pdfA.includes("Virement bancaire") &&
      pdfA.includes("Le séjour est intégralement réglé.") && !pdfA.includes("Bienvenue"),
    "PDF : « Paiements reçus », acompte et solde, « Le séjour est intégralement réglé. »",
    pdfA.slice(0, 400),
  );
  const aBis = await emettre(ids.deuxFois, "total");
  noter(aBis.status === 200 && aBis.corps.numero === a.corps.numero, "deuxième appel : la même facture, le même numéro", aBis);
  const acompteApres = await emettre(ids.deuxFois, "acompte");
  noter(acompteApres.status === 409, "facture du séjour faite : plus de facture d'acompte", acompteApres);

  const ent = (lireEntrepriseSaisie(SAISIE_ENTREPRISE) as { entreprise: EntrepriseFacture }).entreprise;
  const b = await emettre(ids.integral, "total", ent);
  const fb = b.corps.numero ? await ligneFacture(b.corps.numero) : undefined;
  const pdfB = fb ? textePdf(await getStorage().read(fb.pdf_url)) : "";
  noter(
    b.status === 200 && fb?.donnees.clientRaisonSociale === "Ateliers Essai SAS" && fb.donnees.clientSiren === "123 456 789" &&
      (fb.donnees.paiements as unknown[]).length === 1,
    "séjour payé en une fois, au nom de l'entreprise : raison sociale, SIREN, un seul paiement",
    fb?.donnees,
  );
  noter(
    pdfB.includes("Ateliers Essai SAS") && pdfB.includes("SIREN : 123 456 789") && pdfB.includes("69002 Lyon") && !pdfB.includes("Bruno") &&
      !pdfB.replace(/ /g, "").includes("PAIEMENTSREÇUS"),
    "PDF : l'entreprise à la place du client, bloc « Paiement » unique",
    pdfB.slice(0, 400),
  );

  const c = await emettre(ids.retenue, "retenue");
  const fc = c.corps.numero ? await ligneFacture(c.corps.numero) : undefined;
  const pdfC = fc ? textePdf(await getStorage().read(fc.pdf_url)) : "";
  const cautionC = (await chargerReservationAvecGite(ids.retenue))!.caution ?? 0;
  noter(
    c.status === 200 && fc?.type === "retenue" && centimesDepuisNumeric(fc.montant) === 12000 && fc.donnees.montantRestitue === cautionC - 12000,
    "facture de retenue : 120,00 €, le reste restitué",
    fc && { ...fc, donnees: undefined },
  );
  noter(
    pdfC.includes("Retenue sur le dépôt de garantie") && pdfC.includes("Vitre de la cuisine cassée") &&
      pdfC.includes("Somme non soumise à la TVA : dédommagement d'un dégât, sans service rendu en échange.") && !pdfC.includes("261 D"),
    "PDF : objet, motif, phrase de TVA de la retenue (pas l'article 261 D 4°)",
    pdfC.slice(0, 600),
  );

  const suffixe = (n?: string) => Number(n?.split("-").pop());
  noter(
    suffixe(b.corps.numero) === suffixe(a.corps.numero) + 1 && suffixe(c.corps.numero) === suffixe(b.corps.numero) + 1,
    "trois factures, trois numéros qui se suivent, sans trou",
    [a.corps.numero, b.corps.numero, c.corps.numero],
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
