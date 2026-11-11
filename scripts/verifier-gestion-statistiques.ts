// CONTRÔLE DES STATISTIQUES du back-office (Phase 5, lot 6), sur la base de
// TEST uniquement.
//
// Des séjours d'essai en 2045, loin de tous les autres contrôles, aux chiffres
// connus d'avance :
//   1. les départements retrouvés par le code postal ;
//   2. nuits louées par mois (séjour à cheval sur deux mois, sur deux années),
//      séjours hors taxe au mois de l'arrivée, tentatives et annulations
//      écartées ;
//   3. réservations : nombre, durée moyenne, délai moyen ;
//   4. provenance : langue, pays saisis de trois façons, départements ;
//   5. cautions retenues (une retenue pas encore faite ne compte pas) ;
//   6. commissions évitées : réglage vide, puis 15 %, bornes de la saisie ;
//   7. registre de la taxe de séjour : l'année, puis juin (un séjour commencé
//      le 28 juin compte en entier en juin) ;
//   8. (--http, serveur sur 3001) la page, fermée sans session.
//
// Les séjours d'essai (référence STATS-ESSAI-…) sont supprimés au début et à
// la fin ; le taux de commission est remis à sa valeur d'avant.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-gestion-statistiques.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { departementDuCodePostal } from "../lib/departements";
import type { Acteur } from "../lib/gestion/journal";
import { enregistrerRubrique } from "../lib/gestion/reglages";
import { empreinte as empreinteJeton } from "../lib/gestion/secrets";
import { lireStatistiques, type PageStatistiques } from "../lib/gestion/statistiques";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const db = getDb();
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const COMPTE_HTTP = "http-statistiques@example.invalid";
const APPAREIL = "00000000-0000-0000-0000-0000000000dd";
const ACTEUR: Acteur = { appareilId: APPAREIL, description: "Firefox sur Windows", ip: "192.0.2.92" };

interface Essai {
  ref: string;
  gite: "armu" | "laphine" | "maison-vieille";
  statut: string;
  arrivee: string;
  depart: string;
  prix: string;
  menage: string;
  options: string;
  taxe: string;
  adultes: number;
  enfants?: number;
  bebes?: number;
  langue: "fr" | "en";
  pays: string;
  cp: string;
  reserveLe: string;
}

// Séjours de 2045. Délais : A 60 jours, B 10, C 10, D 28, H 3.
const ESSAIS: Essai[] = [
  { ref: "A", gite: "armu", statut: "confirmee", arrivee: "2045-03-04", depart: "2045-03-11", prix: "450.00", menage: "80.00", options: "0", taxe: "10.50", adultes: 2, enfants: 1, bebes: 1, langue: "fr", pays: "France", cp: "07100", reserveLe: "2045-01-03" },
  { ref: "B", gite: "armu", statut: "terminee", arrivee: "2045-06-28", depart: "2045-07-05", prix: "700.00", menage: "80.00", options: "0", taxe: "14.00", adultes: 2, langue: "en", pays: "Belgique", cp: "1000", reserveLe: "2045-06-18" },
  { ref: "C", gite: "laphine", statut: "confirmee", arrivee: "2045-06-10", depart: "2045-06-14", prix: "300.50", menage: "60.00", options: "25.50", taxe: "6.00", adultes: 3, langue: "fr", pays: "france", cp: "69003", reserveLe: "2045-05-31" },
  { ref: "D", gite: "maison-vieille", statut: "confirmee", arrivee: "2045-12-29", depart: "2046-01-02", prix: "400.00", menage: "90.00", options: "0", taxe: "8.00", adultes: 2, langue: "fr", pays: " FRANCE ", cp: "20090", reserveLe: "2045-12-01" },
  { ref: "H", gite: "laphine", statut: "confirmee", arrivee: "2045-10-04", depart: "2045-10-06", prix: "150.00", menage: "60.00", options: "0", taxe: "2.00", adultes: 2, langue: "en", pays: "BELGIQUE", cp: "1050", reserveLe: "2045-10-01" },
  // Écartés : une tentative jamais payée, une réservation annulée.
  { ref: "E", gite: "laphine", statut: "en_attente_paiement", arrivee: "2045-08-01", depart: "2045-08-08", prix: "500.00", menage: "60.00", options: "0", taxe: "9.00", adultes: 2, langue: "fr", pays: "France", cp: "75011", reserveLe: "2045-07-01" },
  { ref: "F", gite: "armu", statut: "annulee", arrivee: "2045-09-01", depart: "2045-09-08", prix: "500.00", menage: "80.00", options: "0", taxe: "9.00", adultes: 2, langue: "fr", pays: "France", cp: "75011", reserveLe: "2045-07-01" },
];

async function nettoyer(): Promise<void> {
  const resas = sql`select id from reservations where reference like 'STATS-ESSAI-%'`;
  await db.execute(sql`delete from retenues where reservation_id in (${resas})`);
  await db.execute(sql`delete from reservations where reference like 'STATS-ESSAI-%'`);
  await db.execute(sql`delete from audit_logs where details->>'appareil_id' = ${APPAREIL}`);
  await db.execute(sql`delete from comptes_gestion where courriel = ${COMPTE_HTTP}`);
}

async function inserer(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const e of ESSAIS) {
    const r = await db.execute(sql`
      insert into reservations (gite_id, reference, statut, date_arrivee, date_depart, client_prenom, client_nom, client_email,
                                nb_adultes, nb_enfants, nb_bebes, prix_location, forfait_menage, options, taxe_sejour,
                                taux_acompte, delai_solde_jours, delai_remboursement_solde_heures, delai_virement_caution_jours,
                                langue, client_pays, client_code_postal, created_at)
      values ((select id from gites where slug = ${e.gite}), ${`STATS-ESSAI-${e.ref}`}, ${e.statut}, ${e.arrivee}::date, ${e.depart}::date,
              'Client', ${e.ref}, 'statistiques@example.invalid', ${e.adultes}, ${e.enfants ?? 0}, ${e.bebes ?? 0},
              ${e.prix}::numeric, ${e.menage}::numeric, ${e.options}::numeric, ${e.taxe}::numeric, 30, 30, 48, 3,
              ${e.langue}, ${e.pays}, ${e.cp}, ${`${e.reserveLe} 12:00:00+01`}::timestamptz)
      returning id::text as id`);
    ids.set(e.ref, (r.rows[0] as { id: string }).id);
  }
  // Une retenue faite (B), une pas encore faite (A) : seule la première compte.
  await db.execute(sql`insert into retenues (reservation_id, montant, motif, moyen, acteur, faite_at)
                        values (${ids.get("B")}::uuid, 120.00, 'Verre cassé', 'carte', 'essai', '2045-07-06 10:00:00+02')`);
  await db.execute(sql`insert into retenues (reservation_id, montant, motif, moyen, acteur)
                        values (${ids.get("A")}::uuid, 50.00, 'En attente', 'carte', 'essai')`);
  return ids;
}

function mois(page: PageStatistiques, cle: "nuits" | "sejours", nom: string): number[] {
  const g = page.gites.find((x) => x.nom === nom)!;
  return page[cle].find((v) => v.giteId === g.id)!.mois;
}

const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function controler(ids: Map<string, string>): Promise<void> {
  console.log("--- 1. Départements");
  const cas: Array<[string | null, string | null]> = [
    ["07100", "07"], ["20090", "2A"], ["20200", "2B"], ["97400", "974"], ["97500", null], ["1000", null], [" 69 003", "69"], [null, null],
  ];
  noter(cas.every(([cp, dep]) => departementDuCodePostal(cp) === dep), "code postal → département (Corse, outre-mer, étranger)", cas.map(([cp]) => departementDuCodePostal(cp)));

  const s = await lireStatistiques({ annee: "2045" });
  console.log("--- 2. Nuits et séjours");
  noter(s.annee === 2045 && s.annees.includes(2045), "année choisie, et proposée", s.annees);
  noter(egal(mois(s, "nuits", "L'Armu"), [0, 0, 7, 0, 0, 3, 4, 0, 0, 0, 0, 0]), "L'Armu : 7 nuits en mars ; le séjour du 28 juin : 3 en juin, 4 en juillet ; l'annulation de septembre écartée", mois(s, "nuits", "L'Armu"));
  noter(egal(mois(s, "nuits", "LaPhine"), [0, 0, 0, 0, 0, 4, 0, 0, 0, 2, 0, 0]), "LaPhine : la tentative d'août écartée", mois(s, "nuits", "LaPhine"));
  noter(egal(mois(s, "nuits", "La Maison Vieille"), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]), "Maison Vieille : 3 nuits en décembre, la 4e est en 2046", mois(s, "nuits", "La Maison Vieille"));
  noter(egal(mois(s, "sejours", "L'Armu"), [0, 0, 53000, 0, 0, 78000, 0, 0, 0, 0, 0, 0]), "séjours L'Armu : 530 € en mars, 780 € en juin (tout le séjour au mois de l'arrivée)", mois(s, "sejours", "L'Armu"));
  noter(egal(mois(s, "sejours", "LaPhine"), [0, 0, 0, 0, 0, 38600, 0, 0, 0, 21000, 0, 0]), "séjours LaPhine : 386 € en juin (300,50 + 60 + 25,50), 210 € en octobre ; taxe de séjour à part", mois(s, "sejours", "LaPhine"));
  const s2046 = await lireStatistiques({ annee: "2046" });
  noter(mois(s2046, "nuits", "La Maison Vieille")[0] === 1 && mois(s2046, "sejours", "La Maison Vieille")[0] === 0, "2046 : la nuit du 1er janvier y compte, le séjour non (arrivé en 2045)", mois(s2046, "nuits", "La Maison Vieille"));

  console.log("--- 3. Réservations");
  const parNom = (nom: string) => s.reservations.parGite.find((c) => c.giteId === s.gites.find((g) => g.nom === nom)!.id)!;
  noter(parNom("L'Armu").nombre === 2 && parNom("L'Armu").dureeMoyenne === 7 && parNom("L'Armu").delaiMoyen === 35, "L'Armu : 2 séjours, 7 nuits, réservés 35 jours avant en moyenne", parNom("L'Armu"));
  noter(parNom("LaPhine").nombre === 2 && parNom("LaPhine").dureeMoyenne === 3 && parNom("LaPhine").delaiMoyen === 6.5, "LaPhine : 2 séjours, 3 nuits, 6,5 jours", parNom("LaPhine"));
  const t = s.reservations.total;
  noter(t.nombre === 5 && Math.abs((t.dureeMoyenne ?? 0) - 4.8) < 1e-9 && Math.abs((t.delaiMoyen ?? 0) - 22.2) < 1e-9, "les trois gîtes : 5 séjours, 4,8 nuits, 22,2 jours", t);

  console.log("--- 4. Provenance");
  const pv = s.provenance;
  noter(pv.langues.fr === 3 && pv.langues.en === 2, "langue du site : 3 en français, 2 en anglais", pv.langues);
  noter(egal(pv.pays, [{ libelle: "France", nombre: 3 }, { libelle: "Belgique", nombre: 2 }]), "« France », « france », « FRANCE » ensemble ; « Belgique », « BELGIQUE » ensemble", pv.pays);
  noter(
    egal(pv.departements, [{ code: "07", nom: "Ardèche", nombre: 1 }, { code: "2A", nom: "Corse-du-Sud", nombre: 1 }, { code: "69", nom: "Rhône", nombre: 1 }]) && pv.franceSansDepartement === 0,
    "départements des clients en France",
    pv.departements,
  );

  console.log("--- 5. Cautions retenues");
  noter(s.retenues.length === 1 && s.retenues[0].montant === 12000 && s.retenues[0].reservationId === ids.get("B") && s.retenues[0].date === "2045-07-06", "une retenue de 120 € ; celle pas encore faite ne compte pas", s.retenues);

  console.log("--- 6. Commissions évitées");
  const avant = ((await db.execute(sql`select commission_taux from reglages where id = 1`)).rows[0] as { commission_taux: number | null }).commission_taux;
  try {
    noter((await enregistrerRubrique("statistiques", { commission_taux: "51" }, ACTEUR)).issue === "erreurs", "51 % : refusé");
    const virgule = await enregistrerRubrique("statistiques", { commission_taux: "15,5" }, ACTEUR);
    noter(virgule.issue === "erreurs" && JSON.stringify(virgule).includes("Un nombre entier, sans virgule."), "15,5 % : refusé, un nombre entier", virgule);
    noter((await enregistrerRubrique("statistiques", { commission_taux: "" }, ACTEUR)).issue !== "erreurs", "vide : accepté");
    const sansTaux = (await lireStatistiques({ annee: "2045" })).commission;
    noter(sansTaux.taux === null && sansTaux.montant === null && sansTaux.base === 239600, "sans taux : rien n'est chiffré ; base 2 396 €", sansTaux);
    noter((await enregistrerRubrique("statistiques", { commission_taux: "15" }, ACTEUR)).issue === "fait", "15 % : enregistré");
    const avec = (await lireStatistiques({ annee: "2045" })).commission;
    noter(avec.taux === 15 && avec.montant === 35940, "15 % de 2 396 € : 359,40 € évités", avec);
  } finally {
    await db.execute(sql`update reglages set commission_taux = ${avant} where id = 1`);
  }

  console.log("--- 7. Registre de la taxe de séjour");
  const r = s.registre;
  noter(r.du === "2045-01-01" && r.au === "2045-12-31", "par défaut : l'année entière", { du: r.du, au: r.au });
  noter(egal(r.lignes.map((l) => l.reference), ["STATS-ESSAI-A", "STATS-ESSAI-C", "STATS-ESSAI-B", "STATS-ESSAI-H", "STATS-ESSAI-D"]), "une ligne par séjour payé, dans l'ordre des arrivées ; tentative et annulation absentes", r.lignes.map((l) => l.reference));
  const a = r.lignes[0];
  noter(a.nuits === 7 && a.adultes === 2 && a.mineurs === 2 && a.nuitees === 14 && a.taxe === 1050, "séjour A : 7 nuits, 2 adultes, 2 mineurs exonérés, 14 nuitées, 10,50 €", a);
  noter(r.nuitees === 52 && r.taxe === 4050, "total : 52 nuitées, 40,50 €", { nuitees: r.nuitees, taxe: r.taxe });
  const juin = (await lireStatistiques({ annee: "2045", du: "2045-06-01", au: "2045-06-30" })).registre;
  noter(egal(juin.lignes.map((l) => l.reference), ["STATS-ESSAI-C", "STATS-ESSAI-B"]) && juin.taxe === 2000, "juin : le séjour du 28 juin au 5 juillet compte en entier en juin", juin.lignes.map((l) => l.reference));
}

async function partieHttp(): Promise<void> {
  console.log("--- 8. Page (serveur sur 3001)");
  const sans = await fetch(`${ORIGINE}/gestion/statistiques`, { redirect: "manual" });
  noter(sans.status === 307 || sans.status === 303, "/gestion/statistiques sans session : renvoi à la connexion", sans.status);
  const jeton = `essai-statistiques-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values (${COMPTE_HTTP}) returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description) values (${compte.id}::uuid, ${empreinteJeton(`app-${jeton}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinteJeton(jeton)})`);
  const r = await fetch(`${ORIGINE}/gestion/statistiques?annee=2045&du=2045-06-01&au=2045-06-30`, { headers: { cookie: `gestion_session=${jeton}` } });
  const html = await r.text();
  noter(
    r.status === 200 && html.includes("Nuits louées") && html.includes("Corse-du-Sud (2A)") && html.includes("STATS-ESSAI-B") && !html.includes("STATS-ESSAI-H"),
    "la page : tableaux, départements, registre de juin",
    r.status,
  );
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  await nettoyer();
  try {
    const ids = await inserer();
    await controler(ids);
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
