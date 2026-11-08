// Contrôle du CALENDRIER, DES FICHES DES GÎTES ET DES DOCUMENTS du
// back-office (Phase 5, lot 4), sur la base de TEST, prestataire et
// messagerie SIMULÉS.
//
//   1. le seed ne touche plus un gîte existant (réponse 11 A) ;
//   2. la fiche d'un gîte : bornes, récapitulatif, rien d'écrit avant la
//      confirmation, empreinte périmée, journal, nouvelle caution dans le
//      tunnel ;
//   3. fermer des nuits : bornes, passé refusé, nuits prises (et par qui),
//      verrou expiré repris, calendrier du mois, rouvrir (le passé reste) ;
//   4. l'OPTION posée au téléphone : refus, nuits fermées aux autres et
//      libres pour son client, courriel et lien, tunnel par le lien, retour
//      en arrière sans perdre les nuits, paiement (nuits vendues, option
//      utilisée), échéance (nuits libres, lien refusé, courriel abandonné),
//      levée ;
//   5. les documents : liste, recherche, année, PDF, renvoi d'une facture
//      (même numéro), du lien de signature, du contrat signé en pièce jointe,
//      client sans adresse ;
//   6. (--http, serveur sur 3001) les trois pages et le PDF, fermés sans
//      session ; la page du lien d'option ; le refus du tunnel.
//
// Les documents de ce contrôle portent des numéros d'ESSAI (« CTR-ESSAI- »,
// « ESSAI- ») : aucun numéro légal n'est frappé, la série FAC n'est pas
// touchée (règle 1).
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les fiches et réglages modifiés sont
// rétablis.
//
// Lancer : DB_CIBLE=test STORAGE_PATH=./.data/documents-test npx tsx scripts/verifier-gestion-calendrier.ts [--http]
import "../db/env";

import { spawnSync } from "node:child_process";

import { sql } from "drizzle-orm";

import { closeDb, getDb, getPool } from "../db";
import { numericDepuisCentimes } from "../lib/centimes";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { lireNuitsPrises } from "../lib/disponibilites";
import { fermerNuits, leverOption, lireCalendrierGestion, poserOption, rouvrirNuits } from "../lib/gestion/calendrier";
import { cheminDocument, libelleRenvoi, listerDocuments, renvoyerDocument } from "../lib/gestion/documents";
import { enregistrerGite, lireGitesGestion, lireSaisieGite, type SaisieGite } from "../lib/gestion/gites";
import type { Acteur } from "../lib/gestion/journal";
import { empreinte as empreinteJeton } from "../lib/gestion/secrets";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { ficheContrat, type Reservation } from "../lib/montants";
import { dernierJourOption, lireOptionParJeton } from "../lib/options-sejour";
import { constaterPaiement, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import { cheminContratSigne, getStorage } from "../lib/storage";
import { remplacerPrestataire } from "../lib/stripe";
import { abandonnerTentative, chargerDonneesTunnel, enregistrerTentative, nuitsBloquees, optionValable } from "../lib/tunnel";
import { chargerTarifsFictifs } from "./parcours/tarifs-fictifs";
import { coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans, tenter, type Gite } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL = "gestion-calendrier@example.invalid";
const EMAIL_OPTION = "option-durand@example.invalid";
const EMAIL_OPTION_EN = "option-smith@example.invalid";
const COMPTE_HTTP = "http-calendrier@example.invalid";
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000cc", description: "Safari sur iPhone", ip: "192.0.2.91" };
const AUJ = aujourdhuiParis();
const p = new PrestataireSimule();
const m = new MessagerieSimulee();

// Les séjours de ce contrôle, loin des autres contrôles.
const FERME_DU = ajouterJours(samediDans(33), 2); // un lundi
const FERME_AU = ajouterJours(FERME_DU, 3); // le jeudi : 4 nuits
const RESA = samediDans(35);
const OPTION_1 = samediDans(37);
const OPTION_2 = samediDans(39);
const OPTION_3 = samediDans(41);

async function envoyer(): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now()
                        where statut = 'a_envoyer' and destinataire in (${EMAIL}, ${EMAIL_OPTION}, ${EMAIL_OPTION_EN})`);
  await traiterCourriels(ORIGINE, 300);
  return m.vider();
}

async function giteId(slug: Gite): Promise<string> {
  const r = await db.execute(sql`select id::text as id from gites where slug = ${slug}`);
  return (r.rows[0] as { id: string }).id;
}

async function compter(requete: ReturnType<typeof sql>): Promise<number> {
  return ((await db.execute(requete)).rows[0] as { n: number }).n;
}

async function journal(ligne: string, action: string): Promise<Record<string, unknown> | null> {
  const r = await db.execute(sql`select details from audit_logs where ligne_id = ${ligne} and action = ${action} order by created_at desc limit 1`);
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
}

const SEJOUR = (arrivee: string, adultes = 2) => ({ arrivee, depart: ajouterJours(arrivee, 7), adultes, enfants: 0, bebes: 0 });
const REGLEMENT = { moyenCaution: "carte", modeSolde: "lien" } as const;

// ─── 1. Le seed ──────────────────────────────────────────────────────────────

async function seed(armu: string): Promise<void> {
  console.log("--- 1. Le seed ne touche plus un gîte existant");
  const avant = (await db.execute(sql`select capacite_max, caution::text as caution from gites where id = ${armu}::uuid`)).rows[0] as Record<string, unknown>;
  await db.execute(sql`update gites set caution = 123.45, capacite_max = 3 where id = ${armu}::uuid`);
  const r = spawnSync("npx tsx db/seed.ts", { env: { ...process.env, DB_CIBLE: "test" }, encoding: "utf8", shell: true });
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  noter(r.status === 0 && sortie.includes("Déjà en base, laissé tel quel : L'Armu (07G310700).") && sortie.includes("Seed terminé : 3 gîte(s) en base."), "le seed dit qu'il laisse L'Armu tel quel", sortie.slice(-400));
  const apres = (await db.execute(sql`select capacite_max, caution::text as caution from gites where id = ${armu}::uuid`)).rows[0] as Record<string, unknown>;
  noter(apres.caution === "123.45" && apres.capacite_max === 3, "la caution et la capacité saisies au back-office survivent au seed", apres);
  await db.execute(sql`update gites set caution = ${avant.caution as string}::numeric, capacite_max = ${avant.capacite_max as number} where id = ${armu}::uuid`);
}

// ─── 2. La fiche d'un gîte ───────────────────────────────────────────────────

async function fiches(): Promise<void> {
  console.log("--- 2. La fiche d'un gîte");
  const base: SaisieGite = { capacite: "4", menage: "80", caution: "500", equipements: "Sauna privatif", telephone: "06 79 33 23 51", spa: true };
  const refus = (s: Partial<SaisieGite>) => {
    const r = lireSaisieGite({ ...base, ...s });
    return r.ok ? "" : r.message;
  };
  noter(refus({ capacite: "0" }).startsWith("La capacité va de 1 à 20") && refus({ capacite: "21" }) !== "" && refus({ capacite: "2,5" }) !== "", "capacité 0, 21, 2,5 : refusées");
  noter(refus({ menage: "abc" }).startsWith("Le ménage n'est pas valable") && refus({ menage: "1000" }) !== "" && refus({ menage: "0" }) === "", "ménage : texte et 1 000 € refusés, 0 € accepté");
  noter(refus({ caution: "0" }).startsWith("La caution n'est pas valable") && refus({ caution: "10000" }) !== "" && refus({ caution: "500,50" }) === "", "caution : 0 et 10 000 € refusés, 500,50 € accepté");
  noter(refus({ telephone: "" }).includes("imprimé au contrat") && refus({ equipements: "x".repeat(301) }).includes("300 caractères"), "téléphone vide, équipements trop longs : refusés");
  const lu = lireSaisieGite({ ...base, menage: "80,5", equipements: "  Sauna   privatif " });
  noter(lu.ok && lu.valeurs.menage === 8050 && lu.valeurs.equipements === "Sauna privatif", "« 80,5 » → 8 050 centimes ; espaces resserrés", lu);

  const mv = (await lireGitesGestion()).find((g) => g.nom === "La Maison Vieille")!;
  const saisieMv: SaisieGite = {
    capacite: String(mv.capacite),
    menage: "95",
    caution: "650",
    equipements: mv.equipements,
    telephone: mv.telephone,
    spa: !mv.spa,
  };
  const plan = await enregistrerGite(mv.id, saisieMv, ACTEUR, null);
  noter(
    plan.etape === "plan" &&
      plan.lignes[0] === "Ménage : 80,00 € → 95,00 €." &&
      plan.lignes[1] === "Caution : 500,00 € → 650,00 €." &&
      plan.lignes[2] === `Spa : ${mv.spa ? "oui → non" : "non → oui"}.` &&
      plan.lignes.includes("Les réservations déjà faites gardent leur ménage et leur caution.") &&
      plan.lignes.some((l) => l.includes("un contrat déjà envoyé garde ce qu'il a imprimé")) &&
      plan.lignes.at(-1) === "Le site affiche le changement tout de suite.",
    "récapitulatif : ménage, caution, spa, ce qui vaut pour qui",
    plan,
  );
  noter((await lireGitesGestion()).find((g) => g.id === mv.id)!.menage === 8000, "rien d'écrit avant la confirmation");
  const perime = await enregistrerGite(mv.id, saisieMv, ACTEUR, "0".repeat(32));
  noter(perime.etape === "plan" && perime.message === "La fiche a changé entre-temps : relisez avant de confirmer.", "empreinte périmée : le récapitulatif revient", perime);
  // Écart E-9 : un contrat émis imprime la fiche figée sur la réservation.
  const giteJoint = { capacite_max: 6, equipements_specifiques: "Sauna privatif", a_spa: true, contact_arrivee_tel: "06 00 00 00 00" };
  const figee = ficheContrat({ contrat_capacite_max: 4, contrat_equipements: null, contrat_a_spa: false, contrat_contact_arrivee_tel: "04 75 00 00 00", gites: giteJoint } as unknown as Reservation);
  const pasEmis = ficheContrat({ contrat_capacite_max: null, contrat_equipements: null, contrat_a_spa: null, contrat_contact_arrivee_tel: null, gites: giteJoint } as unknown as Reservation);
  noter(
    figee.capacite_max === 4 && figee.a_spa === false && figee.equipements_specifiques === null && figee.contact_arrivee_tel === "04 75 00 00 00" &&
      pasEmis.capacite_max === 6 && pasEmis.equipements_specifiques === "Sauna privatif" && pasEmis.a_spa === true,
    "contrat émis : la fiche figée sur la réservation, pas celle du gîte ; pas encore émis : celle du gîte",
    { figee, pasEmis },
  );
  const fait = plan.etape === "plan" ? await enregistrerGite(mv.id, saisieMv, ACTEUR, plan.empreinte) : null;
  const relu = (await lireGitesGestion()).find((g) => g.id === mv.id)!;
  noter(fait?.etape === "fait" && relu.menage === 9500 && relu.caution === 65000 && relu.spa === !mv.spa, "confirmé : ménage, caution et spa enregistrés", relu);
  const j = await journal(mv.id, "gite_modifie");
  noter((j?.details as { apres?: { caution?: number } })?.apres?.caution === 65000, "journal : avant et après", j);
  const tunnel = await chargerDonneesTunnel("maison-vieille");
  noter(tunnel.donnees.gite.caution === 65000 && tunnel.donnees.gite.forfaitMenage === 9500, "le tunnel lit la nouvelle caution et le nouveau ménage", tunnel.donnees.gite);
  noter((await enregistrerGite(mv.id, saisieMv, ACTEUR, null)).etape === "fait", "rien de changé : « Aucun changement »");
  // Retour aux valeurs de départ.
  const retour = { ...saisieMv, menage: numericDepuisCentimes(mv.menage), caution: numericDepuisCentimes(mv.caution), spa: mv.spa };
  const planRetour = await enregistrerGite(mv.id, retour, ACTEUR, null);
  if (planRetour.etape === "plan") await enregistrerGite(mv.id, retour, ACTEUR, planRetour.empreinte);
  noter((await lireGitesGestion()).find((g) => g.id === mv.id)!.caution === mv.caution, "fiche rétablie");
}

// ─── 3. Fermer, rouvrir ──────────────────────────────────────────────────────

async function fermer(armu: string, laphine: string): Promise<string> {
  console.log("--- 3. Fermer des nuits");
  const hier = ajouterJours(AUJ, -1);
  noter((await fermerNuits({ giteId: armu, du: hier, au: AUJ }, ACTEUR)).message.startsWith("Les nuits passées ne se bloquent pas"), "commencer hier : refusé");
  noter((await fermerNuits({ giteId: armu, du: FERME_AU, au: FERME_DU }, ACTEUR)).message === "Le dernier jour est avant le premier.", "dernier jour avant le premier : refusé");
  noter((await fermerNuits({ giteId: armu, du: FERME_DU, au: ajouterJours(FERME_DU, 366) }, ACTEUR)).message === "Un an au plus d'un seul geste.", "plus d'un an : refusé");
  noter((await fermerNuits({ giteId: "pas-un-gite", du: FERME_DU, au: FERME_AU }, ACTEUR)).message === "Choisissez un gîte.", "sans gîte : refusé");

  const f = await fermerNuits({ giteId: armu, du: FERME_DU, au: FERME_AU }, ACTEUR);
  noter(f.ok && f.message.includes("L'Armu : nuits bloquées du lundi") && f.message.includes("inclus (4 nuits)") && f.message.includes("au matin et commencer le vendredi"), "fermé : 4 nuits, et ce que cela veut dire", f.message);
  const prises = await lireNuitsPrises(db, armu, FERME_DU, ajouterJours(FERME_AU, 1));
  noter(prises.length === 4, "les 4 nuits sont prises pour le site", prises);
  noter((await journal(armu, "nuits_fermees"))?.details !== undefined, "journal : nuits fermées");
  const encore = await fermerNuits({ giteId: armu, du: ajouterJours(FERME_DU, 2), au: ajouterJours(FERME_AU, 2) }, ACTEUR);
  noter(!encore.ok && encore.message.includes("sont déjà bloquées") && encore.message.startsWith("Rien n'est bloqué"), "chevauchement : rien n'est fermé, et pourquoi", encore.message);
  noter((await lireNuitsPrises(db, armu, FERME_DU, ajouterJours(FERME_AU, 3))).length === 4, "aucune nuit de plus");

  const r = await reserver(p, coordonnees(EMAIL, "Rémi", "Réservé"), "armu", RESA, "carte");
  const surResa = await fermerNuits({ giteId: armu, du: ajouterJours(RESA, -1), au: ajouterJours(RESA, 2) }, ACTEUR);
  noter(!surResa.ok && surResa.message.includes(`sont réservées par Rémi RÉSERVÉ (${r.reference})`), "sur une réservation : refusé, avec le client et la référence", surResa.message);
  noter((await compter(sql`select count(*)::int as n from disponibilites where gite_id = ${armu}::uuid and date = ${ajouterJours(RESA, -1)}::date`)) === 0, "la nuit libre de la demande n'a pas été fermée");

  // Un verrou expiré (client parti sans payer) ne bloque pas la fermeture.
  const v = await tenter(p, coordonnees(EMAIL, "Vera", "Verrou"), "laphine", RESA, "carte");
  await db.execute(sql`update disponibilites set verrou_expire_at = now() - interval '1 minute' where reservation_id = ${v.t.id}::uuid`);
  const surVerrou = await fermerNuits({ giteId: laphine, du: RESA, au: ajouterJours(RESA, 1) }, ACTEUR);
  noter(surVerrou.ok, "verrou expiré : la nuit est reprise et fermée", surVerrou.message);
  await rouvrirNuits({ giteId: laphine, du: RESA, au: ajouterJours(RESA, 1) }, ACTEUR);

  const cal = await lireCalendrierGestion(FERME_DU.slice(0, 7));
  const ligneArmu = cal.lignes.find((l) => l.giteId === armu)!;
  noter(ligneArmu.jours.find((j) => j.date === FERME_DU)?.case.etat === "ferme" && ligneArmu.jours.length >= 28, "calendrier du mois : nuit fermée", ligneArmu.jours.find((j) => j.date === FERME_DU));
  noter(cal.blocs.some((b) => b.giteId === armu && b.du === FERME_DU && b.au === FERME_AU), "liste des nuits fermées : le bloc entier");
  const calResa = await lireCalendrierGestion(RESA.slice(0, 7));
  const caseResa = calResa.lignes.find((l) => l.giteId === armu)!.jours.find((j) => j.date === RESA)?.case;
  noter(caseResa?.etat === "reserve" && caseResa.reservationId === r.id && caseResa.client === "Rémi RÉSERVÉ", "calendrier : nuit réservée, client et lien vers la fiche", caseResa);

  const ro = await rouvrirNuits({ giteId: armu, du: FERME_DU, au: FERME_AU }, ACTEUR);
  noter(ro.ok && ro.message.startsWith("L'Armu : 4 nuits débloquées"), "rouvrir : les 4 nuits", ro.message);
  noter((await lireNuitsPrises(db, armu, FERME_DU, ajouterJours(FERME_AU, 1))).length === 0, "les nuits sont libres");
  noter((await rouvrirNuits({ giteId: armu, du: FERME_DU, au: FERME_AU }, ACTEUR)).message === "Ces nuits ne sont plus bloquées.", "rouvrir deux fois : rien à faire");
  // Un bloc commencé hier : seules les nuits à venir rouvrent.
  await db.execute(sql`insert into disponibilites (gite_id, date, statut, source)
                        select ${armu}::uuid, d::date, 'bloque', 'directe'
                          from generate_series(${hier}::date, ${ajouterJours(AUJ, 1)}::date, interval '1 day') d
                        on conflict do nothing`);
  const roPasse = await rouvrirNuits({ giteId: armu, du: hier, au: ajouterJours(AUJ, 1) }, ACTEUR);
  noter(roPasse.ok && roPasse.message.startsWith("L'Armu : 2 nuits débloquées"), "bloc commencé hier : 2 nuits rouvertes", roPasse.message);
  noter((await compter(sql`select count(*)::int as n from disponibilites where gite_id = ${armu}::uuid and date = ${hier}::date and statut = 'bloque'`)) === 1, "la nuit d'hier reste telle quelle");
  await db.execute(sql`delete from disponibilites where gite_id = ${armu}::uuid and date = ${hier}::date and statut = 'bloque'`);
  return r.id;
}

// ─── 4. Les options ──────────────────────────────────────────────────────────

async function options(armu: string, laphine: string, mv: string): Promise<void> {
  console.log("--- 4. L'option posée au téléphone");
  const saisie = { giteId: armu, arrivee: OPTION_1, depart: ajouterJours(OPTION_1, 7), nom: "M. Durand", email: EMAIL_OPTION, langue: "fr" };
  noter((await poserOption({ ...saisie, nom: " " }, ACTEUR)).message.startsWith("Indiquez le nom du client"), "sans nom : refusé");
  noter((await poserOption({ ...saisie, email: "durand" }, ACTEUR)).message === "Le courriel du client n'est pas valable.", "courriel mal formé : refusé");
  noter((await poserOption({ ...saisie, depart: OPTION_1 }, ACTEUR)).message === "Le départ doit être après l'arrivée.", "départ le jour de l'arrivée : refusé");
  const surResa = await poserOption({ ...saisie, arrivee: RESA, depart: ajouterJours(RESA, 7) }, ACTEUR);
  noter(!surResa.ok && surResa.message.startsWith("Le site refuserait ces dates à M. Durand :"), "sur des nuits réservées : refusé, avec la raison du site", surResa.message);

  const o = await poserOption(saisie, ACTEUR);
  const dernierJour = ajouterJours(AUJ, 3);
  noter(o.ok && o.message.includes("gardée pour M. Durand jusqu'au") && o.message.endsWith(`Le lien part à ${EMAIL_OPTION}.`), "option posée", o.message);
  const ligneO = (await db.execute(sql`select id::text as id, jeton, expire_at from options_sejour where client_email = ${EMAIL_OPTION} order by created_at desc limit 1`)).rows[0] as { id: string; jeton: string; expire_at: Date };
  noter(dernierJourOption(new Date(ligneO.expire_at)) === dernierJour, "gardée jusqu'à la fin du jour « aujourd'hui + 3 », heure de Paris", { expire: ligneO.expire_at, dernierJour });
  noter((await compter(sql`select count(*)::int as n from disponibilites where option_id = ${ligneO.id}::uuid and statut = 'option' and verrou_expire_at = ${new Date(ligneO.expire_at).toISOString()}::timestamptz`)) === 7, "7 nuits en option, avec l'échéance de l'option");
  noter((await journal(ligneO.id, "option_posee")) !== null, "journal : option posée");

  const mails = await envoyer();
  const mail = mails.find((x) => x.destinataire === EMAIL_OPTION);
  noter(mail?.sujet.startsWith("Votre option — L'Armu, du ") === true && mail.texte.startsWith("Bonjour M. Durand,"), "courriel : sujet et salutation", mail?.sujet);
  noter(mail?.texte.includes(`${ORIGINE}/reserver?option=${ligneO.jeton}`) === true && mail.texte.includes("Réserver ces dates") && mail.texte.includes("inclus. Pour confirmer votre réservation"), "courriel : le lien personnel et la date limite", mail?.texte);

  // Fermé aux autres.
  noter((await lireNuitsPrises(db, armu, OPTION_1, ajouterJours(OPTION_1, 7))).length === 7, "pour le site : 7 nuits prises");
  const autre = await enregistrerTentative("armu", SEJOUR(OPTION_1), coordonnees(EMAIL, "Autre", "Client"), null, REGLEMENT);
  noter(!autre.ok && autre.raison === "DATES_PRISES", "un autre client : dates prises", autre.ok ? "" : autre.raison);
  const ferme = await fermerNuits({ giteId: armu, du: OPTION_1, au: ajouterJours(OPTION_1, 1) }, ACTEUR);
  noter(!ferme.ok && ferme.message.includes("sont gardées par l'option de M. Durand"), "fermer ces nuits : refusé, l'option est nommée", ferme.message);
  const cal = await lireCalendrierGestion(OPTION_1.slice(0, 7));
  const caseO = cal.lignes.find((l) => l.giteId === armu)!.jours.find((j) => j.date === OPTION_1)?.case;
  noter(caseO?.etat === "option" && caseO.client === "M. Durand" && caseO.dernierJour === dernierJour, "calendrier : case « option », client et échéance", caseO);
  noter(cal.options.some((x) => x.id === ligneO.id && x.dernierJour === dernierJour) || (await lireCalendrierGestion(undefined)).options.some((x) => x.id === ligneO.id), "liste des options en cours");

  // Libre pour son client.
  noter((await lireNuitsPrises(db, armu, OPTION_1, ajouterJours(OPTION_1, 7), ligneO.id)).length === 0, "pour le client de l'option : nuits libres");
  noter((await lireOptionParJeton(ligneO.jeton))?.etat === "en_cours" && (await lireOptionParJeton("f".repeat(64))) === null && (await lireOptionParJeton("pas-un-jeton")) === null, "jeton : en cours ; inconnu ou mal formé : rien");
  noter((await optionValable(ligneO.jeton, "armu", { arrivee: OPTION_1, depart: ajouterJours(OPTION_1, 6) })) === null && (await optionValable(ligneO.jeton, "laphine", SEJOUR(OPTION_1))) === null, "autres dates ou autre gîte : le lien ne vaut pas");
  const mauvaises = await enregistrerTentative("armu", SEJOUR(ajouterJours(OPTION_1, 1)), coordonnees(EMAIL_OPTION, "Paul", "Durand"), null, REGLEMENT, "fr", ligneO.jeton);
  noter(!mauvaises.ok && mauvaises.raison === "OPTION", "tunnel avec le lien mais d'autres dates : refusé", mauvaises);

  const t1 = await enregistrerTentative("armu", SEJOUR(OPTION_1), coordonnees(EMAIL_OPTION, "Paul", "Durand"), null, REGLEMENT, "fr", ligneO.jeton);
  noter(t1.ok, "tunnel par le lien : la tentative est enregistrée", t1);
  if (!t1.ok) return;
  noter((await nuitsBloquees(t1.id)) === 0 && (await compter(sql`select count(*)::int as n from disponibilites where option_id = ${ligneO.id}::uuid`)) === 7, "aucun verrou : l'option garde toujours les 7 nuits");
  noter((await compter(sql`select count(*)::int as n from reservations where id = ${t1.id}::uuid and option_id = ${ligneO.id}::uuid`)) === 1, "la réservation désigne l'option");
  await abandonnerTentative(t1.id, { p });
  noter((await compter(sql`select count(*)::int as n from disponibilites where option_id = ${ligneO.id}::uuid and statut = 'option'`)) === 7, "retour en arrière : les nuits restent gardées pour lui");

  const t2 = await enregistrerTentative("armu", SEJOUR(OPTION_1), coordonnees(EMAIL_OPTION, "Paul", "Durand"), null, REGLEMENT, "fr", ligneO.jeton);
  if (!t2.ok) return noter(false, "seconde tentative par le lien", t2);
  const { paiementId } = await ouvrirPaiement(
    { reservationId: t2.id, reference: t2.reference, montant: t2.devis.aRegler, paiementIntegral: t2.devis.paiementIntegral, enregistrerCarte: carteEnregistree(t2.choix), client: t2.client, description: "essai option" },
    p,
  );
  p.regler(paiementId);
  const issue = await constaterPaiement(paiementId, p);
  noter(issue.issue === "CONFIRMEE", "paiement : réservation confirmée", issue);
  noter((await compter(sql`select count(*)::int as n from disponibilites where reservation_id = ${t2.id}::uuid and statut = 'reserve' and option_id is null`)) === 7, "les 7 nuits sont vendues à la réservation");
  noter((await lireOptionParJeton(ligneO.jeton))?.etat === "utilisee", "l'option est marquée utilisée");
  const apres = await enregistrerTentative("armu", SEJOUR(OPTION_1), coordonnees(EMAIL_OPTION, "Paul", "Durand"), null, REGLEMENT, "fr", ligneO.jeton);
  noter(!apres.ok && apres.raison === "OPTION", "le lien ne sert plus", apres);
  noter((await leverOption(ligneO.id, ACTEUR)).message === "Le client a déjà réservé avec cette option.", "lever une option utilisée : refusé");
  await envoyer();

  console.log("--- 4b. Échéance d'une option");
  const o2 = await poserOption({ ...saisie, giteId: laphine, arrivee: OPTION_2, depart: ajouterJours(OPTION_2, 7) }, ACTEUR);
  noter(o2.ok, "deuxième option posée (LaPhine)", o2.message);
  const l2 = (await db.execute(sql`select id::text as id, jeton from options_sejour where gite_id = ${laphine}::uuid and date_arrivee = ${OPTION_2}::date and levee_at is null`)).rows[0] as { id: string; jeton: string };
  // L'échéance passe avant l'envoi du courriel.
  await db.execute(sql`update options_sejour set expire_at = now() - interval '1 second' where id = ${l2.id}::uuid`);
  await db.execute(sql`update disponibilites set verrou_expire_at = now() - interval '1 second' where option_id = ${l2.id}::uuid`);
  await envoyer();
  const c2 = (await db.execute(sql`select statut, derniere_erreur from courriels where cle = ${`option:${l2.id}`}`)).rows[0] as { statut: string; derniere_erreur: string };
  noter(c2.statut === "echec" && c2.derniere_erreur === "option echue au moment de l'envoi", "courriel d'une option échue : abandonné, pas envoyé", c2);
  noter((await lireNuitsPrises(db, laphine, OPTION_2, ajouterJours(OPTION_2, 7))).length === 0, "option échue : les nuits sont libres");
  noter((await lireOptionParJeton(l2.jeton))?.etat === "echue", "le lien d'une option échue ne garde plus rien");
  const lienEchu = await enregistrerTentative("laphine", SEJOUR(OPTION_2), coordonnees(EMAIL_OPTION, "Paul", "Durand"), null, REGLEMENT, "fr", l2.jeton);
  noter(!lienEchu.ok && lienEchu.raison === "OPTION", "tunnel par un lien échu : refusé", lienEchu);
  const t3 = await enregistrerTentative("laphine", SEJOUR(OPTION_2), coordonnees(EMAIL, "Nadia", "Nouvelle"), null, REGLEMENT);
  noter(t3.ok && (await nuitsBloquees(t3.id)) === 7, "un autre client reprend les nuits de l'option échue", t3);
  if (t3.ok) await abandonnerTentative(t3.id, { p });

  console.log("--- 4c. Lever une option (anglais)");
  const o3 = await poserOption({ giteId: mv, arrivee: OPTION_3, depart: ajouterJours(OPTION_3, 7), nom: "Mr Smith", email: EMAIL_OPTION_EN, langue: "en" }, ACTEUR);
  noter(o3.ok, "option en anglais posée (La Maison Vieille)", o3.message);
  const mailEn = (await envoyer()).find((x) => x.destinataire === EMAIL_OPTION_EN);
  noter(mailEn?.sujet.startsWith("Your option — La Maison Vieille, ") === true && mailEn.texte.startsWith("Hello Mr Smith,") && mailEn.texte.includes(`${ORIGINE}/en/reserver?option=`), "courriel en anglais, lien vers la page anglaise", mailEn?.texte);
  const l3 = (await db.execute(sql`select id::text as id from options_sejour where client_email = ${EMAIL_OPTION_EN}`)).rows[0] as { id: string };
  const levee = await leverOption(l3.id, ACTEUR);
  noter(levee.ok && levee.message.startsWith("Option de Mr Smith levée : La Maison Vieille est de nouveau libre du samedi"), "levée", levee.message);
  noter((await compter(sql`select count(*)::int as n from disponibilites where option_id = ${l3.id}::uuid`)) === 0 && (await lireNuitsPrises(db, mv, OPTION_3, ajouterJours(OPTION_3, 7))).length === 0, "les nuits sont libres");
  noter((await leverOption(l3.id, ACTEUR)).message === "Cette option n'est plus en cours.", "lever deux fois : refusé");
  noter((await journal(l3.id, "option_levee")) !== null, "journal : option levée");
}

// ─── 5. Les documents ────────────────────────────────────────────────────────

async function docs(resaId: string): Promise<void> {
  console.log("--- 5. Les documents");
  const ref = ((await db.execute(sql`select reference from reservations where id = ${resaId}::uuid`)).rows[0] as { reference: string }).reference;
  const numeroContrat = `CTR-ESSAI-${ref}`;
  const numeroFacture = `ESSAI-${ref}`;
  await db.execute(sql`insert into documents (reservation_id, type, numero, url_pdf, statut, token)
                        values (${resaId}::uuid, 'contrat_location', ${numeroContrat}, ${`contrats/${resaId}/${numeroContrat}.pdf`}, 'genere', ${`jeton-essai-${resaId}`})`);
  await db.execute(sql`insert into factures (numero, type, reservation_id, montant_ttc, pdf_url, donnees)
                        values (${numeroFacture}, 'acompte', ${resaId}::uuid, 123.45, null, '{}'::jsonb)`);
  const contrat = ((await db.execute(sql`select id::text as id from documents where numero = ${numeroContrat}`)).rows[0] as { id: string }).id;
  const facture = ((await db.execute(sql`select id::text as id from factures where numero = ${numeroFacture}`)).rows[0] as { id: string }).id;

  const parRef = await listerDocuments(null, ref);
  noter(parRef.lignes.length === 2 && parRef.lignes.some((l) => l.numero === numeroContrat && l.signeLe === null) && parRef.lignes.some((l) => l.numero === numeroFacture && l.montant === 12345 && l.libelle === "Facture d'acompte"), "recherche par référence : le contrat et la facture", parRef.lignes);
  noter((await listerDocuments(null, "Rémi")).lignes.filter((l) => l.reference === ref).length === 2, "recherche par prénom du client");
  noter((await listerDocuments(Number(AUJ.slice(0, 4)), ref)).lignes.length === 2 && (await listerDocuments(2001, ref)).lignes.length === 0, "filtre par année");
  noter((await listerDocuments(null, "")).annees.includes(Number(AUJ.slice(0, 4))), "les années proposées");
  noter((await cheminDocument("contrat", contrat)) === `contrats/${resaId}/${numeroContrat}.pdf` && (await cheminDocument("facture", facture)) === null, "PDF : le contrat envoyé ; facture sans PDF : rien");
  noter(libelleRenvoi({ sorte: "contrat", signeLe: null }) === "Renvoyer le lien de signature" && libelleRenvoi({ sorte: "facture", signeLe: null }) === "Renvoyer au client", "libellés des boutons");

  const rf = await renvoyerDocument("facture", facture, ACTEUR);
  noter(rf.ok && rf.message === `La facture ${numeroFacture} part à ${EMAIL}.`, "renvoyer la facture", rf.message);
  const cf = (await db.execute(sql`select cle, donnees from courriels where reservation_id = ${resaId}::uuid and objet = 'facture' and cle like '%:renvoi:%'`)).rows as { cle: string; donnees: { type: string } }[];
  noter(cf.length === 1 && cf[0].donnees.type === "acompte", "un courriel « facture » de plus, même type (même numéro à l'envoi)", cf);
  const envoyes = await envoyer();
  const mf = envoyes.find((x) => x.etiquette === "facture");
  noter(mf?.piecesJointes?.[0]?.nom === "FAC-SIMULE.pdf", "la facture part en pièce jointe (émetteur simulé : la facture existante)", mf?.piecesJointes?.map((x) => x.nom));
  noter((await journal(resaId, "facture_renvoyee"))?.details !== undefined, "journal : facture renvoyée");

  const rc = await renvoyerDocument("contrat", contrat, ACTEUR);
  noter(rc.ok && rc.message === `Le lien de signature part à ${EMAIL}.`, "contrat pas signé : le lien de signature", rc.message);

  await db.execute(sql`update documents set statut = 'signe', date_signature = now() where id = ${contrat}::uuid`);
  const chemin = cheminContratSigne(resaId, numeroContrat);
  await getStorage().upload(chemin, Buffer.from("%PDF-1.4 essai"), { contentType: "application/pdf", overwrite: true });
  noter((await cheminDocument("contrat", contrat)) === chemin, "PDF : le contrat signé");
  const rs = await renvoyerDocument("contrat", contrat, ACTEUR);
  noter(rs.ok && rs.message === `Le contrat signé ${numeroContrat} part à ${EMAIL}.`, "renvoyer le contrat signé", rs.message);
  const ms = (await envoyer()).find((x) => x.etiquette === "contrat_signe");
  noter(
    ms?.sujet === `Votre contrat signé ${numeroContrat} — réservation ${ref}` &&
      ms.piecesJointes?.[0]?.nom === `${numeroContrat}-signe.pdf` &&
      ms.texte.includes(`Voici votre contrat de location n° ${numeroContrat} pour L'Armu, du `) &&
      ms.texte.includes("Il est joint à ce courriel (PDF)."),
    "courriel du contrat signé, PDF joint",
    ms?.texte,
  );
  noter((await journal(resaId, "contrat_renvoye"))?.details !== undefined, "journal : contrat renvoyé");

  await db.execute(sql`update reservations set client_email = null where id = ${resaId}::uuid`);
  noter((await renvoyerDocument("facture", facture, ACTEUR)).message.startsWith("Le client n'a pas d'adresse de courriel"), "client sans adresse : refusé");
  await db.execute(sql`update reservations set client_email = ${EMAIL} where id = ${resaId}::uuid`);
  await getStorage().delete(chemin);
}

// ─── 6. Pages ────────────────────────────────────────────────────────────────

async function partieHttp(armu: string): Promise<void> {
  console.log("--- 6. Pages (serveur sur 3001)");
  for (const chemin of ["/gestion/calendrier", "/gestion/gites", "/gestion/documents", "/gestion/documents/pdf?sorte=contrat&id=00000000-0000-0000-0000-000000000000"]) {
    const sans = await fetch(`${ORIGINE}${chemin}`, { redirect: "manual" });
    noter(sans.status === 307 || sans.status === 303, `${chemin} sans session : renvoi à la connexion`, sans.status);
  }
  const jeton = `essai-calendrier-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values (${COMPTE_HTTP}) returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description) values (${compte.id}::uuid, ${empreinteJeton(`app-${jeton}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinteJeton(jeton)})`);
  const cookie = { cookie: `gestion_session=${jeton}` };
  const pages: Array<[string, string]> = [
    ["/gestion/calendrier", "Bloquer des nuits"],
    [`/gestion/calendrier?mois=${OPTION_1.slice(0, 7)}`, "Poser une option"],
    ["/gestion/gites", "Vérifier les changements"],
    ["/gestion/documents", "Toutes les années"],
  ];
  for (const [chemin, attendu] of pages) {
    const r = await fetch(`${ORIGINE}${chemin}`, { headers: cookie });
    const html = await r.text();
    noter(r.status === 200 && html.includes(attendu), `${chemin} : la page`, { status: r.status, attendu });
  }
  const inconnu = await fetch(`${ORIGINE}/gestion/documents/pdf?sorte=contrat&id=00000000-0000-0000-0000-000000000000`, { headers: cookie, redirect: "manual" });
  noter(inconnu.status === 404, "PDF d'un document inconnu : 404", inconnu.status);
  const contrat = (await db.execute(sql`select d.id::text as id from documents d join reservations r on r.id = d.reservation_id
                                         where r.client_email = ${EMAIL} and d.numero like 'CTR-ESSAI-%'`)).rows[0] as { id: string } | undefined;
  const ouvrir = await fetch(`${ORIGINE}/gestion/documents/pdf?sorte=contrat&id=${contrat?.id}`, { headers: cookie, redirect: "manual" });
  const vers = ouvrir.headers.get("location") ?? "";
  noter(ouvrir.status === 303 && vers.includes("/api/documents/contrats/") && vers.includes("-signe.pdf?token="), "« Ouvrir le PDF » : renvoi vers le lien signé du contrat signé", { status: ouvrir.status, vers });

  // Le lien d'une option, côté client.
  const o = await poserOption({ giteId: armu, arrivee: OPTION_3, depart: ajouterJours(OPTION_3, 7), nom: "M. Lien", email: EMAIL_OPTION, langue: "fr" }, ACTEUR);
  const l = (await db.execute(sql`select jeton from options_sejour where client_nom = 'M. Lien' and levee_at is null order by created_at desc limit 1`)).rows[0] as { jeton: string } | undefined;
  if (!o.ok || !l) return noter(false, "option pour la page du lien", o.message);
  const page = await (await fetch(`${ORIGINE}/reserver?option=${l.jeton}`)).text();
  noter(page.includes("Ces dates sont gardées pour vous jusqu") && !page.includes("Choisissez vos dates dans le calendrier"), "page du lien : dates gardées, pas de calendrier");
  const faux = await (await fetch(`${ORIGINE}/reserver?option=${"0".repeat(64)}`)).text();
  noter(faux.includes("Ce lien n&#x27;est plus valable."), "lien inconnu : « Ce lien n'est plus valable. »");
  const api = await fetch(`${ORIGINE}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gite: "armu", ...SEJOUR(OPTION_3), coordonnees: coordonnees(EMAIL_OPTION, "Paul", "Lien"), reglement: REGLEMENT, langue: "fr", option: "0".repeat(64) }),
  });
  const corps = (await api.json()) as { code?: string; error?: string };
  noter(api.status === 409 && corps.code === "OPTION_INVALIDE" && corps.error?.startsWith("Ce lien d'option n'est plus valable") === true, "tunnel avec un faux jeton : 409, « lien plus valable »", corps);
  const levee = (await db.execute(sql`select id::text as id from options_sejour where client_nom = 'M. Lien' and levee_at is null`)).rows[0] as { id: string };
  await leverOption(levee.id, ACTEUR);
}

async function nettoyer(): Promise<void> {
  const emails = sql`(${EMAIL}, ${EMAIL_OPTION}, ${EMAIL_OPTION_EN})`;
  const resas = sql`select id from reservations where client_email in ${emails}`;
  const opts = sql`select id from options_sejour where client_email in ${emails}`;
  await db.execute(sql`delete from courriels where reservation_id in (${resas}) or destinataire in ${emails}`);
  await db.execute(sql`delete from factures where numero like 'ESSAI-%' and reservation_id in (${resas})`);
  await db.execute(sql`delete from documents where reservation_id in (${resas})`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${resas}) or option_id in (${opts})`);
  await db.execute(sql`delete from paiements where reservation_id in (${resas})`);
  await db.execute(sql`delete from audit_logs where details->>'appareil_id' = ${typeof ACTEUR === "string" ? "" : ACTEUR.appareilId}`);
  await db.execute(sql`delete from audit_logs where ligne_id in (select id::text from reservations where client_email in ${emails})`);
  await db.execute(sql`delete from reservations where client_email in ${emails}`);
  await db.execute(sql`delete from options_sejour where client_email in ${emails}`);
  await db.execute(sql`delete from disponibilites where statut = 'bloque' and date between ${ajouterJours(AUJ, -1)}::date and ${ajouterJours(AUJ, 1)}::date`);
  await db.execute(sql`delete from disponibilites where statut = 'bloque' and date between ${samediDans(33)}::date and ${samediDans(43)}::date`);
  await db.execute(sql`delete from comptes_gestion where courriel = ${COMPTE_HTTP}`);
  await db.execute(sql`update reglages set option_duree_jours = 3 where id = 1`);
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  remplacerPrestataire(p);
  remplacerMessagerie(m);
  remplacerEmetteurFacture({
    emettre: async () => ({ ok: true, facture: { id: "f", numero: "FAC-SIMULE", type: "acompte", montant: 12345, chemin: "factures/simule.pdf" } }),
    pdf: async () => Buffer.from("%PDF-1.4 simulé"),
  });
  remplacerEmetteurContrat({
    emettre: async () => ({ ok: true, contrat: { id: "doc", numero: "CTR-SIMULE-001", token: "jeton" } }),
    existant: async () => null,
  });
  await chargerTarifsFictifs(getPool());
  await nettoyer();
  try {
    const [armu, laphine, mv] = [await giteId("armu"), await giteId("laphine"), await giteId("maison-vieille")];
    await seed(armu);
    await fiches();
    const resaId = await fermer(armu, laphine);
    await options(armu, laphine, mv);
    await docs(resaId);
    if (process.argv.includes("--http")) await partieHttp(armu);
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
