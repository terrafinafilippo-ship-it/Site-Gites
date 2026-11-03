// Contrôle de la CAUTION PAR VIREMENT et de la FIN DES SÉJOURS sans carte
// (Phase 4, lot 3, D-31), sur la base de TEST, prestataire et messagerie
// SIMULÉS, temps fixé (chaque passage des tâches reçoit son heure de Paris).
//
// Sur l'exemple de Camille (arrivée A un samedi, départ A + 7, caution par
// virement, date limite DL = A − 3) :
//   1. cas normal : courriel des coordonnées 10 jours avant DL (pas la
//      veille), une seule fois ; son texte (compte, référence, mise en garde
//      contre les faux RIB, RIB demandé, restitution) ; les coordonnées sur
//      « Ma réservation » de ce jour à DL inclus ; alerte « à vérifier » le lendemain de DL à 8 h (pas à
//      7 h 45) ; alerte « à rendre » le lendemain + 2 du départ à 8 h ;
//      séjour « terminé » au troisième jour à 8 h (pas à 7 h 59) ;
//   2. compte absent, puis IBAN faux : aucun courriel, une alerte « À
//      TRAITER » ; le compte saisi, le courriel part ; compte retiré entre
//      l'inscription et l'envoi : abandonné, alerte ;
//   3. passage manqué : rattrapé jusqu'à DL, plus après ;
//   4. client anglais : courriel en anglais ;
//   5. chèque : aucun courriel ni alerte ; séjour « terminé » ;
//   6. réservation annulée : rien ;
//   7. le tunnel refuse le virement quand DL est passée, l'accepte le jour même.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les réglages modifiés sont rétablis.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-virement.ts
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { traiterCautions } from "../lib/caution";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { fmtDateAvecJour } from "../lib/format";
import { ibanLisible, ibanValide } from "../lib/iban";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { chargerReservationAvecGite } from "../lib/reservations";
import { remplacerPrestataire } from "../lib/stripe";
import { enregistrerTentative } from "../lib/tunnel";
import { lireEtatVirement, traiterVirements } from "../lib/virement";
import { aParis, coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "virement@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const IBAN_ESSAI = "FR7630006000011234567890189";
const db = getDb();
const CAMILLE = coordonnees(EMAIL_ESSAI, "Camille", "Virement");

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

async function envoyer(m: MessagerieSimulee): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now()
                        where statut = 'a_envoyer' and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);
  await traiterCourriels(ORIGINE, 200);
  return m.vider();
}

async function statutDe(id: string): Promise<string> {
  const r = await db.execute(sql`select statut from reservations where id = ${id}::uuid`);
  return (r.rows[0] as { statut: string }).statut;
}

async function etatVirement(id: string, jour: string) {
  const resa = await chargerReservationAvecGite(id);
  return resa ? lireEtatVirement(db, resa, jour) : null;
}

async function poserCompte(iban: string | null): Promise<void> {
  await db.execute(sql`update reglages set virement_titulaire = ${iban ? "COMPTE D'ESSAI" : null},
                         virement_iban = ${iban}, virement_bic = ${iban ? "AGRIFRPP882" : null} where id = 1`);
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

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
  await poserCompte(IBAN_ESSAI);

  console.log("--- 0. IBAN : clé de contrôle");
  noter(ibanValide(IBAN_ESSAI), "IBAN d'exemple des documentations bancaires : valide");
  noter(!ibanValide("FR7630006000011234567890188"), "un chiffre changé : refusé");
  noter(!ibanValide("FR76 3000 6000 0112 3456 7890 189"), "avec des espaces : refusé (écrit sans espaces en base)");
  noter(ibanLisible(IBAN_ESSAI) === "FR76 3000 6000 0112 3456 7890 189", "affiché par groupes de quatre", ibanLisible(IBAN_ESSAI));

  console.log("--- 1. cas normal (Camille)");
  const a = await reserver(p, CAMILLE, "armu", samediDans(10), "virement");
  await envoyer(m); // confirmation, alertes de la réservation
  const A = a.devis.arrivee;
  const D = a.devis.depart;
  const DL = ajouterJours(A, -3);
  const J = ajouterJours(DL, -10);
  noter(a.devis.dateLimiteVirementCaution === DL, "date limite du virement : 3 jours avant l'arrivée", a.devis.dateLimiteVirementCaution);

  await traiterVirements(aParis(ajouterJours(J, -1), "23:45"));
  noter(compter(await courrielsDe(a.id), "caution_virement") === 0, "la veille du jour du courriel : rien");
  noter((await etatVirement(a.id, ajouterJours(J, -1))) === null, "… et rien sur « Ma réservation »");
  const b1 = await traiterVirements(aParis(J, "00:15"));
  await traiterVirements(aParis(J, "08:00"));
  noter(compter(await courrielsDe(a.id), "caution_virement") === 1, "10 jours avant la date limite : courriel des coordonnées, une seule fois");
  noter(b1.sansCompte === 0 && b1.erreurs === 0, "bilan sans erreur", b1);
  const envoyes = await envoyer(m);
  const courriel = envoyes.find((e) => e.destinataire === EMAIL_ESSAI);
  noter(
    !!courriel && courriel.sujet.includes("coordonnées bancaires") && courriel.sujet.includes(a.reference),
    "sujet : coordonnées bancaires et référence",
    courriel?.sujet,
  );
  const texte = courriel?.texte ?? "";
  noter(texte.includes("FR76 3000 6000 0112 3456 7890 189") && texte.includes("COMPTE D'ESSAI") && texte.includes("AGRIFRPP882"), "texte : titulaire, IBAN lisible, BIC");
  noter(texte.includes(`Référence à indiquer : ${a.reference}`), "texte : la référence à indiquer");
  noter(texte.includes(fmtDateAvecJour(DL, "fr")), "texte : la date limite", fmtDateAvecJour(DL, "fr"));
  noter(texte.includes("en joignant votre RIB"), "texte : le RIB demandé en réponse");
  noter(texte.includes("Nos coordonnées bancaires ne changent pas"), "texte : la mise en garde contre les faux RIB");
  noter(texte.includes(fmtDateAvecJour(ajouterJours(D, 3), "fr")), "texte : restitution au plus tard 3 jours après le départ");
  noter(courriel?.repondreA !== undefined && courriel.repondreA.includes("@"), "« Répondre » écrit à l'adresse de réponse des réglages", courriel?.repondreA);

  const page = await etatVirement(a.id, J);
  noter(page?.etat === "virement" && page.compte.iban === IBAN_ESSAI && page.dateLimite === DL, "« Ma réservation » : les coordonnées dès le jour du courriel", page);
  noter((await etatVirement(a.id, DL))?.etat === "virement", "… jusqu'à la date limite incluse");
  noter((await etatVirement(a.id, ajouterJours(DL, 1))) === null, "… plus le lendemain");

  await traiterVirements(aParis(ajouterJours(DL, 1), "07:45"));
  noter(compter(await courrielsDe(a.id), "alerte_caution", "virement_a_verifier") === 0, "lendemain de la date limite à 7 h 45 : pas encore d'alerte");
  await traiterVirements(aParis(ajouterJours(DL, 1), "08:00"));
  await traiterVirements(aParis(ajouterJours(DL, 2), "08:00"));
  noter(compter(await courrielsDe(a.id), "alerte_caution", "virement_a_verifier") === 1, "à 8 h : alerte « vérifiez que le virement est arrivé », une seule fois");
  const alerteVerif = (await envoyer(m)).find((e) => e.destinataire === PROPRIETAIRES);
  noter(
    !!alerteVerif && alerteVerif.sujet.startsWith("Caution par virement à vérifier") && alerteVerif.texte.includes(a.reference),
    "alerte envoyée aux propriétaires, avec la référence",
    alerteVerif?.sujet,
  );

  await traiterVirements(aParis(ajouterJours(D, 2), "07:59"));
  noter(compter(await courrielsDe(a.id), "alerte_caution", "virement_a_rendre") === 0, "veille du délai de restitution à 7 h 59 : rien");
  await traiterVirements(aParis(ajouterJours(D, 2), "08:00"));
  noter(compter(await courrielsDe(a.id), "alerte_caution", "virement_a_rendre") === 1, "à 8 h : alerte « caution à rendre »");
  const alerteRendre = (await envoyer(m)).find((e) => e.destinataire === PROPRIETAIRES);
  noter(
    !!alerteRendre && alerteRendre.sujet.startsWith("Caution par virement à rendre") &&
      alerteRendre.texte.includes(fmtDateAvecJour(ajouterJours(D, 3), "fr")),
    "alerte : rendre au plus tard le troisième jour après le départ",
    alerteRendre?.sujet,
  );

  await traiterCautions(aParis(ajouterJours(D, 3), "07:59"), p);
  noter((await statutDe(a.id)) === "confirmee", "troisième jour à 7 h 59 : séjour encore « confirmé »");
  const fin = await traiterCautions(aParis(ajouterJours(D, 3), "08:00"), p);
  noter((await statutDe(a.id)) === "terminee" && fin.terminees >= 1, "à 8 h : séjour « terminé »", fin);
  await traiterVirements(aParis(ajouterJours(D, 3), "09:00"));
  noter(compter(await courrielsDe(a.id), "alerte_caution", "virement_a_rendre") === 1, "aucune alerte de plus après la fin du séjour");

  console.log("--- 2. compte absent, IBAN faux, compte retiré avant l'envoi");
  await poserCompte(null);
  const b = await reserver(p, CAMILLE, "laphine", samediDans(11), "virement");
  await envoyer(m);
  const Jb = ajouterJours(b.devis.dateLimiteVirementCaution, -10);
  const bb = await traiterVirements(aParis(Jb, "00:15"));
  await traiterVirements(aParis(Jb, "06:00"));
  let lignes = await courrielsDe(b.id);
  noter(compter(lignes, "caution_virement") === 0, "sans compte : aucun courriel au client");
  noter(compter(lignes, "alerte_probleme", "virement_coordonnees_absentes") === 1 && bb.sansCompte === 1, "… une alerte « À TRAITER », une seule fois", bb);
  noter((await etatVirement(b.id, Jb)) === null, "… et rien sur « Ma réservation »");
  const alerteAbsent = (await envoyer(m)).find((e) => e.destinataire === PROPRIETAIRES);
  noter(!!alerteAbsent && alerteAbsent.sujet.startsWith("À TRAITER — coordonnées bancaires absentes"), "objet de l'alerte", alerteAbsent?.sujet);
  await poserCompte("FR7630006000011234567890188");
  await traiterVirements(aParis(Jb, "07:00"));
  noter(compter(await courrielsDe(b.id), "caution_virement") === 0, "IBAN à la clé fausse : traité comme absent");
  await poserCompte(IBAN_ESSAI);
  await traiterVirements(aParis(ajouterJours(Jb, 1), "00:15"));
  noter(compter(await courrielsDe(b.id), "caution_virement") === 1, "compte saisi : le courriel part au passage suivant");
  await poserCompte(null);
  await envoyer(m);
  lignes = await courrielsDe(b.id);
  noter(
    lignes.find((c) => c.objet === "caution_virement")?.statut === "echec" &&
      compter(lignes, "alerte_probleme", "virement_coordonnees_absentes") === 1,
    "compte retiré entre l'inscription et l'envoi : courriel abandonné, l'alerte existe déjà",
    lignes,
  );
  await poserCompte(IBAN_ESSAI);

  console.log("--- 3. passage manqué");
  const c = await reserver(p, CAMILLE, "maison-vieille", samediDans(12), "virement");
  await envoyer(m);
  const DLc = c.devis.dateLimiteVirementCaution;
  await traiterVirements(aParis(ajouterJours(DLc, 1), "00:15"));
  noter(compter(await courrielsDe(c.id), "caution_virement") === 0, "premier passage après la date limite : plus de courriel");
  const c2 = await reserver(p, CAMILLE, "armu", samediDans(13), "virement");
  await envoyer(m);
  await traiterVirements(aParis(c2.devis.dateLimiteVirementCaution, "23:45"));
  noter(compter(await courrielsDe(c2.id), "caution_virement") === 1, "premier passage le jour de la date limite : courriel rattrapé");

  console.log("--- 4. client anglais");
  const e = await reserver(p, CAMILLE, "laphine", samediDans(14), "virement", "en");
  await envoyer(m);
  await traiterVirements(aParis(ajouterJours(e.devis.dateLimiteVirementCaution, -10), "00:15"));
  const anglais = (await envoyer(m)).find((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    !!anglais && anglais.sujet.startsWith("Your security deposit by bank transfer") &&
      anglais.texte.includes(`Reference to give: ${e.reference}`) && anglais.texte.includes("IBAN: FR76") &&
      anglais.texte.includes("Our bank details do not change"),
    "courriel en anglais",
    anglais?.sujet,
  );

  console.log("--- 5. chèque");
  const f = await reserver(p, CAMILLE, "maison-vieille", samediDans(15), "cheque");
  await envoyer(m);
  const Af = f.devis.arrivee;
  const Df = f.devis.depart;
  for (const [jour, heure] of [[ajouterJours(Af, -13), "08:00"], [ajouterJours(Af, -2), "08:00"], [ajouterJours(Df, 2), "08:00"]] as const) {
    await traiterVirements(aParis(jour, heure));
  }
  lignes = await courrielsDe(f.id);
  noter(compter(lignes, "caution_virement") === 0 && compter(lignes, "alerte_caution") === 0, "aucun courriel ni alerte (rien d'automatique pour le chèque)", lignes);
  noter((await etatVirement(f.id, ajouterJours(Af, -5))) === null, "rien sur « Ma réservation »");
  await traiterCautions(aParis(ajouterJours(Df, 3), "08:00"), p);
  noter((await statutDe(f.id)) === "terminee", "séjour « terminé » au troisième jour à 8 h");

  console.log("--- 6. réservation annulée");
  const g = await reserver(p, CAMILLE, "armu", samediDans(16), "virement");
  await envoyer(m);
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${g.id}::uuid`);
  const DLg = g.devis.dateLimiteVirementCaution;
  await traiterVirements(aParis(ajouterJours(DLg, -10), "08:00"));
  await traiterVirements(aParis(ajouterJours(DLg, 1), "08:00"));
  await traiterVirements(aParis(ajouterJours(g.devis.depart, 2), "08:00"));
  await traiterCautions(aParis(ajouterJours(g.devis.depart, 3), "08:00"), p);
  lignes = await courrielsDe(g.id);
  noter(compter(lignes, "caution_virement") === 0 && compter(lignes, "alerte_caution") === 0, "aucun courriel ni alerte", lignes);
  noter((await statutDe(g.id)) === "annulee", "reste « annulée »");

  console.log("--- 7. le tunnel et la date limite du virement");
  const proche = ajouterJours(aujourdhuiParis(), 2);
  const refus = await enregistrerTentative(
    "laphine",
    { arrivee: proche, depart: ajouterJours(proche, 7), adultes: 2, enfants: 0, bebes: 0 },
    CAMILLE,
    null,
    { moyenCaution: "virement", modeSolde: null },
    "fr",
  );
  noter(
    !refus.ok && refus.raison === "REGLEMENT" && refus.message.startsWith("La caution par virement n'est plus possible"),
    "arrivée dans 2 jours (date limite passée) : virement refusé par le serveur",
    refus,
  );
  const limite = ajouterJours(aujourdhuiParis(), 3);
  const accepte = await enregistrerTentative(
    "maison-vieille",
    { arrivee: limite, depart: ajouterJours(limite, 7), adultes: 2, enfants: 0, bebes: 0 },
    CAMILLE,
    null,
    { moyenCaution: "virement", modeSolde: null },
    "fr",
  );
  noter(
    accepte.ok && accepte.devis.virementPossible && accepte.devis.dateLimiteVirementCaution === aujourdhuiParis(),
    "arrivée dans 3 jours (date limite aujourd'hui) : virement accepté",
    accepte.ok ? accepte.devis.dateLimiteVirementCaution : accepte,
  );
  const carte = await enregistrerTentative(
    "armu",
    { arrivee: ajouterJours(proche, 14), depart: ajouterJours(proche, 21), adultes: 2, enfants: 0, bebes: 0 },
    CAMILLE,
    null,
    { moyenCaution: "cheque", modeSolde: null },
    "fr",
  );
  noter(carte.ok, "contrôle : une autre tentative au chèque reste acceptée", carte);
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et modifie les réglages.');
  }
  const avant = (
    await db.execute(sql`select virement_titulaire as t, virement_iban as i, virement_bic as b from reglages where id = 1`)
  ).rows[0] as { t: string | null; i: string | null; b: string | null };
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  await nettoyer();
  try {
    await controles();
  } finally {
    await nettoyer();
    await db.execute(sql`update reglages set virement_titulaire = ${avant.t}, virement_iban = ${avant.i},
                           virement_bic = ${avant.b} where id = 1`);
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
