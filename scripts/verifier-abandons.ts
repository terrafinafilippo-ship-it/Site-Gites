// Contrôle de l'EFFACEMENT DES TENTATIVES ABANDONNÉES (Phase 4, lot 3,
// D-31 ; docs/06-avant-premier-client.md, point 12), sur la base de TEST,
// prestataire simulé.
//
//   1. durée non réglée (vide) : rien n'est effacé, même très ancien ;
//   2. durée de 7 jours : une tentative de 8 jours (caution par carte) est
//      effacée — paiement annulé chez le prestataire, fiche client supprimée,
//      paiements, nuits et réservation effacés, ligne `audit_logs` sans nom
//      ni courriel ; une tentative de 6 jours reste ;
//   3. ce qui n'est jamais effacé : une tentative payée chez le prestataire
//      mais pas encore constatée, une tentative remboursée (payée trop tard),
//      une réservation confirmée ancienne ;
//   4. fiche client impossible à supprimer : la tentative est effacée quand
//      même, l'identifiant de la fiche reste dans `audit_logs` ;
//   5. retour en arrière du client : fiche client supprimée, aucune ligne
//      `audit_logs` (ce n'est pas l'effacement automatique).
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; le réglage modifié est rétabli.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-abandons.ts
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { dureeConservationAbandons, effacerAbandons } from "../lib/abandons";
import { LEGAL_DOCS } from "../lib/data/legal";
import { remplacerEmetteurContrat, remplacerEmetteurFacture } from "../lib/courriels-envoi";
import { remplacerMessagerie } from "../lib/messagerie";
import { remplacerPrestataire } from "../lib/stripe";
import { abandonnerTentative } from "../lib/tunnel";
import { coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans, tenter } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "abandon@example.invalid";
const db = getDb();
const CLIENT = coordonnees(EMAIL_ESSAI, "Camille", "Abandon");

async function vieillir(id: string, jours: number): Promise<void> {
  await db.execute(sql`update reservations set created_at = now() - make_interval(days => ${jours}) where id = ${id}::uuid`);
}

async function existe(id: string): Promise<boolean> {
  const r = await db.execute(sql`select 1 from reservations where id = ${id}::uuid`);
  return r.rows.length > 0;
}

async function restes(id: string): Promise<{ paiements: number; nuits: number }> {
  const r = await db.execute(sql`
    select (select count(*)::int from paiements where reservation_id = ${id}::uuid) as paiements,
           (select count(*)::int from disponibilites where reservation_id = ${id}::uuid) as nuits`);
  return r.rows[0] as { paiements: number; nuits: number };
}

async function trace(id: string): Promise<{ acteur: string; details: Record<string, unknown> } | null> {
  const r = await db.execute(sql`
    select acteur, details from audit_logs
     where table_cible = 'reservations' and action = 'effacement_tentative' and ligne_id = ${id}`);
  return (r.rows[0] as { acteur: string; details: Record<string, unknown> } | undefined) ?? null;
}

async function regler(jours: number | null): Promise<void> {
  await db.execute(sql`update reglages set abandon_conservation_jours = ${jours} where id = 1`);
}

/** Le texte de la politique de confidentialité, avec la durée lue en base, comme la page. */
async function confidentialite(): Promise<string> {
  const corps = LEGAL_DOCS.privacy.body;
  return typeof corps === "string" ? corps : corps({ abandonJours: await dureeConservationAbandons(), doublonHeures: 24 });
}

const idsEssai: string[] = [];

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
  if (idsEssai.length > 0) {
    await db.execute(sql`delete from audit_logs where action = 'effacement_tentative'
                           and ligne_id in (${sql.join(idsEssai.map((i) => sql`${i}`), sql`, `)})`);
  }
}

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  remplacerPrestataire(p);
  remplacerMessagerie(new MessagerieSimulee());
  remplacerEmetteurFacture({
    emettre: async () => ({ ok: false, status: 409, message: "factures hors de ce contrôle" }),
    pdf: async () => Buffer.from(""),
  });
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });

  console.log("--- 1. durée non réglée");
  await regler(null);
  const vieille = await tenter(p, CLIENT, "armu", samediDans(20), "carte");
  idsEssai.push(vieille.t.id);
  await vieillir(vieille.t.id, 400);
  const b0 = await effacerAbandons(new Date(), p);
  noter(b0.desactive && b0.effacees === 0, "réglage vide : rien n'est effacé", b0);
  noter(await existe(vieille.t.id), "… même une tentative de 400 jours");
  noter((await confidentialite()).includes("jamais payée : conservée jusqu'à ce que vous en demandiez l'effacement"), "confidentialité : réglage vide, aucune durée annoncée");

  console.log("--- 2. durée de 7 jours");
  await regler(7);
  noter((await confidentialite()).includes("jamais payée : effacée automatiquement au bout de 7 jours"), "confidentialité : la page annonce les 7 jours du réglage");
  const huit = await tenter(p, CLIENT, "laphine", samediDans(20), "carte");
  const six = await tenter(p, CLIENT, "maison-vieille", samediDans(20), "cheque");
  idsEssai.push(huit.t.id, six.t.id);
  await vieillir(huit.t.id, 8);
  await vieillir(six.t.id, 6);
  const clientHuit = (await p.lirePaiement(huit.paiementId)).customerId;
  noter(clientHuit !== null, "contrôle : la tentative par carte a une fiche client chez le prestataire");
  const annulationsAvant = p.annulations;
  const b1 = await effacerAbandons(new Date(), p);
  noter(!(await existe(huit.t.id)), "tentative de 8 jours : effacée");
  noter((await restes(huit.t.id)).paiements === 0 && (await restes(huit.t.id)).nuits === 0, "… ses paiements et ses nuits aussi", await restes(huit.t.id));
  noter((await p.lirePaiement(huit.paiementId)).statut === "annule" && p.annulations > annulationsAvant, "… son paiement annulé chez le prestataire d'abord");
  noter(clientHuit !== null && p.clientsOublies.includes(clientHuit), "… sa fiche client supprimée chez le prestataire", p.clientsOublies);
  const t8 = await trace(huit.t.id);
  noter(
    t8?.acteur === "systeme" && t8.details.reference === huit.t.reference && typeof t8.details.creee_le === "string",
    "… une ligne audit_logs : référence et date de création",
    t8,
  );
  const tJson = JSON.stringify(t8 ?? {});
  noter(!tJson.includes(EMAIL_ESSAI) && !tJson.includes("Camille") && !tJson.includes("Abandon"), "… sans nom ni courriel", t8);
  noter(!(await existe(vieille.t.id)), "la tentative de 400 jours aussi, une fois la durée réglée");
  noter(await existe(six.t.id), "tentative de 6 jours : gardée");
  noter(b1.effacees === 2 && b1.erreurs === 0 && !b1.desactive, "bilan : deux effacées", b1);

  console.log("--- 3. ce qui n'est jamais effacé");
  const payee = await tenter(p, CLIENT, "armu", samediDans(22), "carte");
  idsEssai.push(payee.t.id);
  p.regler(payee.paiementId); // payée chez le prestataire, pas encore constatée
  await vieillir(payee.t.id, 30);
  const remboursee = await tenter(p, CLIENT, "laphine", samediDans(22), "cheque");
  idsEssai.push(remboursee.t.id);
  await db.execute(sql`update paiements set statut = 'rembourse', motif_remboursement = 'essai : payé trop tard'
                        where reservation_id = ${remboursee.t.id}::uuid`);
  await vieillir(remboursee.t.id, 30);
  const confirmee = await reserver(p, CLIENT, "maison-vieille", samediDans(22), "cheque");
  idsEssai.push(confirmee.id);
  await vieillir(confirmee.id, 30);
  const oubliesAvant = p.clientsOublies.length;
  const b2 = await effacerAbandons(new Date(), p);
  noter(await existe(payee.t.id), "payée chez le prestataire, pas encore constatée : gardée");
  noter(p.clientsOublies.length === oubliesAvant, "… et sa fiche client n'est pas supprimée");
  noter(await existe(remboursee.t.id), "payée trop tard puis remboursée : gardée (question au juriste)");
  noter(await existe(confirmee.id), "réservation confirmée ancienne : jamais touchée");
  noter(
    b2.effacees === 0 && b2.engagees === 1,
    "bilan : la remboursée n'est même pas examinée ; la payée non constatée est vue engagée",
    b2,
  );

  console.log("--- 4. fiche client impossible à supprimer");
  const panne = await tenter(p, CLIENT, "armu", samediDans(24), "carte");
  idsEssai.push(panne.t.id);
  await vieillir(panne.t.id, 10);
  p.panneClient = true;
  const b3 = await effacerAbandons(new Date(), p);
  p.panneClient = false;
  const clientPanne = (await p.lirePaiement(panne.paiementId)).customerId;
  noter(!(await existe(panne.t.id)) && b3.effacees === 1, "la tentative est effacée quand même", b3);
  noter((await trace(panne.t.id))?.details.client_stripe === clientPanne, "… l'identifiant de la fiche reste dans audit_logs, pour la supprimer à la main");

  console.log("--- 5. retour en arrière du client");
  const retour = await tenter(p, CLIENT, "laphine", samediDans(24), "carte");
  idsEssai.push(retour.t.id);
  const clientRetour = (await p.lirePaiement(retour.paiementId)).customerId;
  noter((await abandonnerTentative(retour.t.id)) === "ABANDONNEE", "retour en arrière : tentative effacée");
  noter(clientRetour !== null && p.clientsOublies.includes(clientRetour), "… fiche client supprimée");
  noter((await trace(retour.t.id)) === null, "… aucune ligne audit_logs (geste du client)");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit et efface des réservations.');
  }
  const avant = (await db.execute(sql`select abandon_conservation_jours as j from reglages where id = 1`)).rows[0] as {
    j: number | null;
  };
  await nettoyer();
  try {
    await controles();
  } finally {
    await nettoyer();
    await regler(avant.j);
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
