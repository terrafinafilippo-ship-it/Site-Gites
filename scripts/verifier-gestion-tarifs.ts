// Contrôle de l'ÉCRAN DES TARIFS du back-office (Phase 5, lot 3, D-34).
//
//   1. les règles pures, sans base : saisies (prix, pourcentages, taux, jours),
//      dates lisibles, découpage des périodes, jour de début, passé figé,
//      période en cours, suppression, copie d'une année, trous, état ;
//   2. sur la base de TEST : les prix (récapitulatif, rien d'écrit avant la
//      confirmation, empreinte périmée, doublon, prix invalide, nouveau tarif,
//      suppression), les périodes (ajout, découpage, jour refusé, période en
//      cours raccourcie puis rallongée, suppression, copie d'une année), les
//      barèmes, les règles générales, la taxe de séjour ;
//   3. « À traiter » : nuits sans tarif, tarif sans prix ;
//   4. (--http, serveur sur 3001) les cinq pages, fermées sans session.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". La tarification
// d'essai est rechargée au début et à la fin (scripts/parcours/tarifs-fictifs.ts).
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-gestion-tarifs.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb, getPool } from "../db";
import { aujourdhuiParis } from "../lib/dates-civiles";
import { listerATraiter } from "../lib/gestion/a-traiter";
import type { Acteur } from "../lib/gestion/journal";
import { empreinte as empreinteJeton } from "../lib/gestion/secrets";
import {
  ajouterTaxe,
  copierAnnee,
  enregistrerBareme,
  enregistrerGenerales,
  enregistrerPeriode,
  enregistrerTarif,
  lireTarifsGestion,
  modifierTaxe,
  supprimerBareme,
  supprimerPeriode,
  supprimerTarif,
  supprimerTaxe,
  type IssuePlan,
  type SaisieRegles,
  type SaisieTaxe,
} from "../lib/gestion/tarifs";
import {
  ajouterMois,
  coefficientNumeric,
  etatTarifs,
  joursSaisis,
  planCopie,
  planPeriode,
  planSuppression,
  plageLisible,
  pourcentEnDixMilliemes,
  pourcentLisible,
  prixSaisi,
  tauxSaisi,
  trous,
  type ContextePeriodes,
  type PeriodeGestion,
} from "../lib/gestion/tarifs-regles";
import type { DonneesTarification } from "../lib/tarification";
import { chargerTarifsFictifs } from "./parcours/tarifs-fictifs";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000bb", description: "Firefox sur Android", ip: "192.0.2.90" };
const GENERAL: SaisieRegles = { nuitsMinimum: "", arrivee: null, depart: null, baremeId: "" };

// ─── 1. Règles pures ─────────────────────────────────────────────────────────

function periode(id: string, tarifId: string, debut: string, fin: string): PeriodeGestion {
  return { id, tarifId, debut, fin, nuitsMinimum: null, joursArrivee: null, joursDepart: null, baremeId: null };
}

function reglesPures(): void {
  console.log("--- 1. Règles pures");
  noter(prixSaisi("75") === 7500 && prixSaisi("75,50") === 7550 && prixSaisi(" 1 200 ") === 120000, "prix : « 75 », « 75,50 », « 1 200 »");
  noter(prixSaisi("0,50") === null && prixSaisi("abc") === null && prixSaisi("10000") === null && prixSaisi("75,505") === null, "prix refusés : 0,50 €, texte, 10 000 €, trois décimales");
  noter(pourcentEnDixMilliemes("85") === 8500 && pourcentEnDixMilliemes("85,5") === 8550 && pourcentEnDixMilliemes("100 %") === 10000, "pourcentages : 85, 85,5, « 100 % »");
  noter(pourcentEnDixMilliemes("0") === null && pourcentEnDixMilliemes("250") === null && pourcentEnDixMilliemes("8,555") === null, "pourcentages refusés : 0, 250, trois décimales");
  noter(pourcentLisible(8550) === "85,5" && pourcentLisible(10000) === "100" && pourcentLisible(500) === "5", "pourcentages lisibles : 85,5 ; 100 ; 5");
  noter(coefficientNumeric(8550) === "0.8550" && coefficientNumeric(10000) === "1.0000" && coefficientNumeric(20000) === "2.0000", "coefficients écrits en base : 0.8550, 1.0000, 2.0000");
  noter(tauxSaisi("5", true) === "5.00" && tauxSaisi("5,5", true) === "5.50" && tauxSaisi("0", false) === "0.00", "taux : 5 → 5.00, 5,5 → 5.50, 0 accepté pour la taxe additionnelle");
  noter(tauxSaisi("0", true) === null && tauxSaisi("101", true) === null, "taux refusés : 0 (taux), 101");
  noter(joursSaisis([]) === null && String(joursSaisis(["6", "6", "1"])) === "1,6" && joursSaisis(["8"]) === null, "jours : vide refusé, doublons retirés, 8 refusé");
  noter(plageLisible("2027-05-01", "2027-05-29") === "du samedi 1er mai au samedi 29 mai 2027", "plage lisible", plageLisible("2027-05-01", "2027-05-29"));
  noter(plageLisible("2027-12-18", "2028-01-01") === "du samedi 18 décembre 2027 au samedi 1er janvier 2028", "plage à cheval sur deux ans", plageLisible("2027-12-18", "2028-01-01"));
  noter(ajouterMois("2027-01-31", 1) === "2027-02-28" && ajouterMois("2026-11-07", 12) === "2027-11-07", "ajouter des mois");

  const existantes = [
    periode("d", "basse", "2026-12-19", "2027-01-02"),
    periode("c", "basse", "2027-01-02", "2027-02-06"),
    periode("a", "moyenne", "2027-05-01", "2027-05-29"),
    periode("b", "haute", "2027-05-29", "2027-07-03"),
  ];
  const ctx: ContextePeriodes = { aujourdhui: "2027-01-06", jourDebut: 6, noms: { basse: "Basse saison", moyenne: "Moyenne saison", haute: "Haute saison" } };

  // Découpage (réponse 3 B).
  const coupe = planPeriode(existantes, periode("", "haute", "2027-05-15", "2027-05-22"), ctx);
  noter(
    coupe.ok &&
      JSON.stringify(coupe.operations.map((o) => o.op)) === '["dates","ecrire","ajouter"]' &&
      coupe.operations[0].op === "dates" && coupe.operations[0].fin === "2027-05-15" &&
      coupe.operations[2].op === "ajouter" && coupe.operations[2].periode.debut === "2027-05-22" && coupe.operations[2].periode.fin === "2027-05-29" && coupe.operations[2].periode.tarifId === "moyenne",
    "au milieu d'une autre : elle est coupée en deux",
    coupe,
  );
  noter(coupe.ok && coupe.lignes.some((l) => l === "Moyenne saison est coupée en deux : du samedi 1er mai au samedi 15 mai 2027, puis du samedi 22 mai au samedi 29 mai 2027."), "récapitulatif du découpage", coupe.ok && coupe.lignes);
  noter(coupe.ok && coupe.lignes.at(-1) === "Les réservations déjà faites gardent leur prix.", "récapitulatif : les réservations gardent leur prix");
  const chevauche = planPeriode(existantes, periode("", "basse", "2027-05-22", "2027-06-05"), ctx);
  noter(
    chevauche.ok && chevauche.operations.some((o) => o.op === "dates" && o.id === "a" && o.fin === "2027-05-22") && chevauche.operations.some((o) => o.op === "dates" && o.id === "b" && o.debut === "2027-06-05"),
    "à cheval sur deux : la première raccourcie, la seconde commence plus tard",
  );
  const recouvre = planPeriode(existantes, periode("", "basse", "2027-04-24", "2027-07-03"), ctx);
  noter(recouvre.ok && recouvre.operations.filter((o) => o.op === "supprimer").length === 2, "entièrement recouvertes : supprimées");
  const jeudi = planPeriode(existantes, periode("", "haute", "2027-05-13", "2027-05-22"), ctx);
  noter(!jeudi.ok && jeudi.message === "Une période commence un samedi : le jeudi 13 mai 2027 n'en est pas un.", "un jeudi : refusé", jeudi);
  noter(planPeriode(existantes, periode("", "haute", "2027-05-13", "2027-05-22"), { ...ctx, jourDebut: null }).ok, "n'importe quel jour : le jeudi passe");
  const finMardi = planPeriode(existantes, periode("", "haute", "2027-05-15", "2027-05-18"), ctx);
  noter(!finMardi.ok && finMardi.message.startsWith("Une période finit un samedi"), "fin un mardi : refusée");
  const passe = planPeriode(existantes, periode("", "haute", "2027-01-02", "2027-01-09"), ctx);
  noter(!passe.ok && passe.message.includes("avant aujourd'hui"), "commencer avant aujourd'hui : refusé");
  const figee = planPeriode(existantes, { ...existantes[0], fin: "2027-01-09" }, ctx);
  noter(!figee.ok && figee.message.includes("passée"), "période passée : figée");
  const tarifEnCours = planPeriode(existantes, { ...existantes[1], tarifId: "haute" }, ctx);
  noter(!tarifEnCours.ok && tarifEnCours.message.includes("seule sa date de fin"), "période en cours : le tarif ne change pas");
  const finEnCours = planPeriode(existantes, { ...existantes[1], fin: "2027-01-30" }, ctx);
  noter(
    finEnCours.ok && finEnCours.lignes.includes("Attention : les nuits du samedi 30 janvier au samedi 6 février 2027 n'auront plus de tarif et ne seront plus réservables."),
    "période en cours raccourcie : les nuits perdues sont annoncées",
    finEnCours.ok && finEnCours.lignes,
  );
  noter(!planPeriode(existantes, { ...existantes[2] }, ctx).ok, "rien de changé : « Aucun changement »");
  noter(!planSuppression(existantes, "c", ctx).ok && planSuppression(existantes, "a", ctx).ok, "suppression : refusée en cours, acceptée à venir");

  const copie = planCopie(existantes, 2027, ctx);
  noter(
    copie.ok && copie.operations.length === 3 && copie.operations[0].op === "ajouter" && copie.operations[0].periode.debut === "2028-01-01" &&
      copie.operations[1].op === "ajouter" && copie.operations[1].periode.debut === "2028-04-29",
    "copier 2027 sur 2028 : 52 semaines plus tard, le samedi reste un samedi",
    copie,
  );
  noter(!planCopie([...existantes, periode("z", "haute", "2028-05-06", "2028-05-13")], 2027, ctx).ok, "copie sur une année déjà remplie : refusée");
  noter(!planCopie(existantes, 2030, ctx).ok, "copie d'une année vide : refusée");

  const t = trous(existantes, "2027-01-06", "2027-12-31");
  noter(JSON.stringify(t) === '[{"debut":"2027-02-06","fin":"2027-05-01"},{"debut":"2027-07-03","fin":null}]', "trous : entre deux périodes, et après la dernière", t);
  noter(trous([], "2027-01-06", "2027-12-31").length === 1, "aucune période : un trou à partir d'aujourd'hui");

  // État : un tarif sans prix pour un gîte, une taxe manquante.
  const donnees: DonneesTarification = {
    general: { regles: { nuitsMinimum: 1, joursArrivee: [1, 2, 3, 4, 5, 6, 7], joursDepart: [1, 2, 3, 4, 5, 6, 7] }, baremeId: "g" },
    baremes: { g: [10000] },
    tarifs: [{ id: "basse", nom: "Basse saison", regles: { nuitsMinimum: null, joursArrivee: null, joursDepart: null }, baremeId: null, prixNuit: { armu: 7500 } }],
    periodes: [{ id: "c", tarifId: "basse", debut: "2027-01-02", fin: "2027-02-06", regles: { nuitsMinimum: null, joursArrivee: null, joursDepart: null }, baremeId: null }],
  };
  const taxe = { dateDebut: "2026-01-01", mode: "proportionnel" as const, taux: 500, plafond: 440, tarifFixe: null, taxeAdditionnelle: 1000, menageDansAssiette: false, bebesParmiOccupants: true, source: null };
  const etat = etatTarifs({ donnees, taxes: { armu: [taxe] }, gites: [{ slug: "armu", nom: "L'Armu" }], aujourdhui: "2027-01-06", horizon: "2027-03-06", jourDebut: 6 });
  noter(etat.reservableJusqua === "2027-02-06" && etat.problemes.length === 0 && etat.trous.length === 1, "état : réservable jusqu'au 6 février, puis un trou", etat);
  const etat2 = etatTarifs({ donnees, taxes: {}, gites: [{ slug: "armu", nom: "L'Armu" }, { slug: "laphine", nom: "LaPhine" }], aujourdhui: "2027-01-06", horizon: "2027-03-06", jourDebut: 6 });
  noter(etat2.reservableJusqua === null, "état : sans taxe ni prix pour un gîte, rien n'est réservable");
  noter(etat2.problemes.some((p) => p.startsWith("« Basse saison » n'a pas de prix pour LaPhine")) && etat2.problemes.some((p) => p.startsWith("Pas de taxe de séjour pour L'Armu")), "état : prix et taxe manquants signalés", etat2.problemes);
  const etat3 = etatTarifs({ donnees: { ...donnees, general: { ...donnees.general, baremeId: null } }, taxes: { armu: [taxe] }, gites: [{ slug: "armu", nom: "L'Armu" }], aujourdhui: "2027-01-06", horizon: "2027-03-06", jourDebut: 6 });
  noter(etat3.problemes.includes("Aucun barème général : choisissez-en un dans « Règles ».") && etat3.reservableJusqua === null, "état : pas de barème général");
}

// ─── 2. Sur la base de test ──────────────────────────────────────────────────

async function confirmer(faire: (c: string | null) => Promise<IssuePlan>): Promise<{ plan: IssuePlan; fin: IssuePlan }> {
  const plan = await faire(null);
  const fin = plan.etape === "plan" ? await faire(plan.empreinte) : plan;
  return { plan, fin };
}

async function idTarif(nom: string): Promise<string> {
  const r = await db.execute(sql`select id from tarifs where nom = ${nom}`);
  return (r.rows[0] as { id: string }).id;
}

async function prixDe(tarif: string, slug: string): Promise<string | null> {
  const r = await db.execute(sql`select p.prix_nuit from tarifs_prix p join tarifs t on t.id = p.tarif_id join gites g on g.id = p.gite_id where t.nom = ${tarif} and g.slug = ${slug}`);
  return (r.rows[0] as { prix_nuit: string } | undefined)?.prix_nuit ?? null;
}

async function periodesEntre(debut: string, fin: string): Promise<Array<{ nom: string; debut: string; fin: string }>> {
  const r = await db.execute(sql`select t.nom, p.date_debut::text as debut, p.date_fin::text as fin from periodes p join tarifs t on t.id = p.tarif_id
                                 where p.date_debut < ${fin}::date and p.date_fin > ${debut}::date order by p.date_debut`);
  return r.rows as Array<{ nom: string; debut: string; fin: string }>;
}

async function journalise(action: string): Promise<boolean> {
  return (await db.execute(sql`select 1 from audit_logs where action = ${action} and created_at > now() - interval '5 minutes'`)).rows.length > 0;
}

async function surLaBase(): Promise<void> {
  console.log("--- 2. Prix");
  const page = await lireTarifsGestion();
  const armu = page.gites.find((g) => g.slug === "armu")!;
  const laphine = page.gites.find((g) => g.slug === "laphine")!;
  const mv = page.gites.find((g) => g.slug === "maison-vieille")!;
  const basse = page.tarifs.find((t) => t.nom === "Basse saison (essai)")!;
  noter(page.tarifs.length === 5 && page.gites.length === 3, "lecture : 5 tarifs d'essai, 3 gîtes");
  noter(basse.prix[armu.id] === 7500 && basse.semaine[armu.id] === 45000, "L'Armu, basse saison : 75 € la nuit, 450 € la semaine", basse);
  noter(page.etat.trous.length === 0 && page.etat.problemes.length === 0 && page.etat.reservableJusqua === "2028-01-01", "état : tout est réservable jusqu'au 1er janvier 2028", page.etat);

  const prixBasse = (armuPrix: string) => ({ nom: basse.nom, prix: { [armu.id]: armuPrix, [laphine.id]: "112", [mv.id]: "115" }, regles: GENERAL });
  const plan = await enregistrerTarif(basse.id, prixBasse("80"), ACTEUR, null);
  noter(plan.etape === "plan" && plan.lignes[0] === "L'Armu : 75,00 € → 80,00 € la nuit, soit 450,00 € → 480,00 € la semaine.", "récapitulatif du prix (réponse 1 A)", plan);
  noter((await prixDe(basse.nom, "armu")) === "75.00", "rien n'est écrit avant la confirmation");
  const perime = await enregistrerTarif(basse.id, prixBasse("80"), ACTEUR, "empreinte-perimee");
  noter(perime.etape === "plan" && perime.message === "La tarification a changé entre-temps : relisez avant de confirmer.", "empreinte périmée : le récapitulatif revient", perime);
  const fait = plan.etape === "plan" ? await enregistrerTarif(basse.id, prixBasse("80"), ACTEUR, plan.empreinte) : plan;
  noter(fait.etape === "fait" && (await prixDe(basse.nom, "armu")) === "80.00", "confirmé : 80 € la nuit", fait);
  noter(await journalise("tarif_modifie"), "journal : tarif modifié");
  noter((await enregistrerTarif(basse.id, prixBasse("80"), ACTEUR, null)).etape === "fait", "même saisie : aucun changement");
  const doublon = await enregistrerTarif(basse.id, { ...prixBasse("80"), nom: "été (ESSAI)" }, ACTEUR, null);
  noter(doublon.etape === "refus" && doublon.message === "Un tarif s'appelle déjà « été (ESSAI) ».", "nom déjà pris (sans tenir compte des majuscules) : refusé", doublon);
  const invalide = await enregistrerTarif(basse.id, prixBasse("80,555"), ACTEUR, null);
  noter(invalide.etape === "refus" && invalide.message.startsWith("Le prix pour L'Armu n'est pas valable"), "prix mal formé : refusé", invalide);
  const sansJour = await enregistrerTarif(basse.id, { ...prixBasse("80"), regles: { ...GENERAL, arrivee: [] } }, ACTEUR, null);
  noter(sansJour.etape === "refus" && sansJour.message.startsWith("Cochez au moins un jour d'arrivée"), "règles propres sans jour : refusé");

  const nouveau = await confirmer((c) => enregistrerTarif(null, { nom: "Pont (essai)", prix: { [laphine.id]: "150" }, regles: { ...GENERAL, nuitsMinimum: "3" } }, ACTEUR, c));
  noter(
    nouveau.plan.etape === "plan" && nouveau.plan.lignes.includes("La Maison Vieille : pas de prix.") && nouveau.plan.lignes.includes("Minimum de nuits : comme le général → 3 nuits.") &&
      nouveau.plan.lignes.includes("Il n'a pas encore de période : ajoutez-en dans « Périodes » pour le mettre en vente."),
    "nouveau tarif : récapitulatif",
    nouveau.plan,
  );
  noter(nouveau.fin.etape === "fait" && (await prixDe("Pont (essai)", "laphine")) === "150.00" && (await prixDe("Pont (essai)", "armu")) === null, "nouveau tarif créé, un seul prix");
  const pont = await idTarif("Pont (essai)");
  noter((await supprimerTarif(pont, ACTEUR)).ok && (await db.execute(sql`select 1 from tarifs where id = ${pont}::uuid`)).rows.length === 0, "tarif sans période : supprimé");
  const refusSuppr = await supprimerTarif(basse.id, ACTEUR);
  noter(!refusSuppr.ok && refusSuppr.message.includes("sert encore à"), "tarif avec périodes : suppression refusée", refusSuppr);

  console.log("--- 2. Périodes");
  const haute = await idTarif("Haute saison (essai)");
  const decoupe = await confirmer((c) => enregistrerPeriode(null, { tarifId: haute, debut: "2027-05-08", fin: "2027-05-15", regles: GENERAL }, ACTEUR, c));
  noter(decoupe.plan.etape === "plan" && decoupe.plan.lignes[0] === "Nouvelle période : Haute saison (essai), du samedi 8 mai au samedi 15 mai 2027.", "ajout au milieu : récapitulatif", decoupe.plan);
  const mai = await periodesEntre("2027-05-01", "2027-05-29");
  noter(
    decoupe.fin.etape === "fait" &&
      JSON.stringify(mai.map((p) => [p.nom, p.debut, p.fin])) ===
        JSON.stringify([
          ["Moyenne saison (essai)", "2027-05-01", "2027-05-08"],
          ["Haute saison (essai)", "2027-05-08", "2027-05-15"],
          ["Moyenne saison (essai)", "2027-05-15", "2027-05-29"],
        ]),
    "en base : moyenne, haute, moyenne",
    mai,
  );
  noter(await journalise("periode_ajoutee"), "journal : période ajoutée");
  const jeudi = await enregistrerPeriode(null, { tarifId: haute, debut: "2027-05-13", fin: "2027-05-22", regles: GENERAL }, ACTEUR, null);
  noter(jeudi.etape === "refus" && jeudi.message.includes("jeudi 13 mai 2027"), "un jeudi : refusé (réponse 4)");

  // La basse saison en cours (31 octobre → 19 décembre 2026) : on avance sa fin, un trou apparaît dans « À traiter ».
  const enCours = (await db.execute(sql`select id, date_debut::text as debut, date_fin::text as fin from periodes where date_debut <= ${aujourdhuiParis()}::date and date_fin > ${aujourdhuiParis()}::date`)).rows[0] as
    | { id: string; debut: string; fin: string }
    | undefined;
  if (enCours) {
    const [p] = (await db.execute(sql`select tarif_id from periodes where id = ${enCours.id}::uuid`)).rows as Array<{ tarif_id: string }>;
    const plusTot = (await db.execute(sql`select (${enCours.fin}::date - 7)::text as d`)).rows[0] as { d: string };
    const changeTarif = await enregistrerPeriode(enCours.id, { tarifId: haute === p.tarif_id ? basse.id : haute, debut: enCours.debut, fin: enCours.fin, regles: GENERAL }, ACTEUR, null);
    noter(changeTarif.etape === "refus" && changeTarif.message.includes("seule sa date de fin"), "période en cours : son tarif ne change pas");
    const raccourcie = await confirmer((c) => enregistrerPeriode(enCours.id, { tarifId: p.tarif_id, debut: enCours.debut, fin: plusTot.d, regles: GENERAL }, ACTEUR, c));
    noter(raccourcie.plan.etape === "plan" && raccourcie.plan.lignes.some((l) => l.startsWith("Attention : les nuits du")), "période en cours raccourcie : les nuits perdues sont annoncées", raccourcie.plan);
    let taches = await listerATraiter();
    const trou = taches.find((t) => t.cle === `tarifs_trou:${plusTot.d}`);
    noter(trou?.titre === "Nuits sans tarif" && trou.detail.startsWith("Aucun tarif du ") && trou.gestes.includes("tarifs"), "« À traiter » : nuits sans tarif (réponse 6 A)", trou);
    await confirmer((c) => enregistrerPeriode(enCours.id, { tarifId: p.tarif_id, debut: enCours.debut, fin: enCours.fin, regles: GENERAL }, ACTEUR, c));
    taches = await listerATraiter();
    noter(!taches.some((t) => t.cle.startsWith("tarifs_trou:")), "fin rétablie : la ligne disparaît");
  } else {
    noter(false, "une période d'essai devrait couvrir aujourd'hui");
  }

  const an2028 = await confirmer((c) => enregistrerPeriode(null, { tarifId: haute, debut: "2028-01-01", fin: "2028-01-15", regles: GENERAL }, ACTEUR, c));
  noter(an2028.fin.etape === "fait", "période de janvier 2028 ajoutée");
  const idJanvier = ((await db.execute(sql`select id from periodes where date_debut = '2028-01-01'`)).rows[0] as { id: string }).id;
  const suppr = await confirmer((c) => supprimerPeriode(idJanvier, ACTEUR, c));
  noter(suppr.plan.etape === "plan" && suppr.plan.lignes.some((l) => l.startsWith("Attention")) && suppr.fin.etape === "fait" && (await periodesEntre("2028-01-01", "2028-01-15")).length === 0, "suppression : annoncée, puis faite");

  const avant2027 = (await db.execute(sql`select count(*)::int as n from periodes where extract(year from date_debut) = 2027`)).rows[0] as { n: number };
  const copie = await confirmer((c) => copierAnnee(2027, ACTEUR, c));
  const apres2028 = (await db.execute(sql`select count(*)::int as n from periodes where date_debut >= '2028-01-01'`)).rows[0] as { n: number };
  noter(copie.fin.etape === "fait" && apres2028.n === avant2027.n, `copie de 2027 sur 2028 : ${avant2027.n} périodes`, { copie: copie.fin, n: apres2028.n });
  const ete = await periodesEntre("2028-07-01", "2028-07-02");
  noter(ete[0]?.nom === "Été (essai)" && ete[0].debut === "2028-07-01", "l'été 2027 (samedi 3 juillet) devient le samedi 1er juillet 2028", ete);
  const encore = await copierAnnee(2027, ACTEUR, null);
  noter(encore.etape === "refus" && encore.message.startsWith("2028 a déjà une période"), "copier une seconde fois : refusé", encore);

  console.log("--- 2. Barèmes");
  const pageB = await lireTarifsGestion();
  const general = pageB.baremes.find((b) => b.id === pageB.general.baremeId)!;
  noter(general.coefficients.map(pourcentLisible).join(" ") === "100 100 90 85 80 75 70", "barème d'essai lu en pourcentages");
  const saisie = { nom: general.nom, pourcents: ["100", "100", "88", "85", "80", "75", "70", ""] };
  const bareme = await confirmer((c) => enregistrerBareme(general.id, saisie, ACTEUR, c));
  noter(
    bareme.plan.etape === "plan" && bareme.plan.lignes[0] === "3e nuit : 90 % → 88 %." && bareme.plan.lignes.some((l) => l.startsWith("« Basse saison (essai) », 7 nuits :") && l.includes("L'Armu 480,00 € → 478,40 €")),
    "récapitulatif du barème : la case et l'effet sur la semaine",
    bareme.plan,
  );
  noter(bareme.plan.etape === "plan" && bareme.plan.lignes.includes("Au-delà de la 7e nuit, chaque nuit vaut la moyenne des cases : 85,43 %."), "récapitulatif : la moyenne au-delà");
  const coef = (await db.execute(sql`select coefficient from baremes_coefficients where bareme_id = ${general.id}::uuid and rang = 3`)).rows[0] as { coefficient: string };
  noter(bareme.fin.etape === "fait" && coef.coefficient === "0.8800", "en base : 0.8800");
  const mauvais = await enregistrerBareme(general.id, { nom: general.nom, pourcents: ["100", "250"] }, ACTEUR, null);
  noter(mauvais.etape === "refus" && mauvais.message.startsWith("2e nuit : un pourcentage entre 1 et 200"), "250 % : refusé", mauvais);
  const autre = await confirmer((c) => enregistrerBareme(null, { nom: "Sans remise (essai)", pourcents: ["100"] }, ACTEUR, c));
  noter(autre.fin.etape === "fait", "nouveau barème créé");
  const idAutre = ((await db.execute(sql`select id from baremes where nom = 'Sans remise (essai)'`)).rows[0] as { id: string }).id;
  const refusB = await supprimerBareme(general.id, ACTEUR);
  noter(!refusB.ok && refusB.message.includes("le réglage général"), "barème général : suppression refusée", refusB);
  noter((await supprimerBareme(idAutre, ACTEUR)).ok, "barème inutilisé : supprimé");

  console.log("--- 2. Règles générales");
  const regles = await enregistrerGenerales({ nuitsMinimum: "2", arrivee: ["1", "6"], depart: ["6"], baremeId: general.id, jourDebut: "", horizonMois: "6" }, ACTEUR);
  const r = (await db.execute(sql`select nuits_minimum, jours_arrivee, periodes_jour_debut, tarifs_horizon_mois from reglages`)).rows[0] as Record<string, unknown>;
  noter(regles.ok && r.nuits_minimum === 2 && String(r.jours_arrivee) === "1,6" && r.periodes_jour_debut === null && r.tarifs_horizon_mois === 6, "règles générales enregistrées", r);
  noter(await journalise("reglage_modifie"), "journal : règles modifiées");
  const sansArrivee = await enregistrerGenerales({ nuitsMinimum: "2", arrivee: [], depart: ["6"], baremeId: general.id, jourDebut: "6", horizonMois: "6" }, ACTEUR);
  noter(!sansArrivee.ok && sansArrivee.message === "Cochez au moins un jour d'arrivée.", "aucun jour d'arrivée : refusé");
  noter(!(await enregistrerGenerales({ nuitsMinimum: "2", arrivee: ["6"], depart: ["6"], baremeId: general.id, jourDebut: "6", horizonMois: "40" }, ACTEUR)).ok, "horizon de 40 mois : refusé");
  await db.execute(sql`update reglages set tarifs_horizon_mois = 12, periodes_jour_debut = 6 where id = 1`);

  console.log("--- 2. Taxe de séjour");
  const taxe: SaisieTaxe = { gites: [armu.id, laphine.id, mv.id], dateDebut: "2027-01-01", mode: "proportionnel", taux: "5", plafond: "4,40", tarifFixe: "", additionnelle: "10", menage: false, bebes: true, source: "Essai" };
  const ajout = await confirmer((c) => ajouterTaxe(taxe, ACTEUR, c));
  noter(
    ajout.plan.etape === "plan" &&
      ajout.plan.lignes[0] === "À partir du vendredi 1er janvier 2027, pour L'Armu, La Maison Vieille et LaPhine :" &&
      ajout.plan.lignes.includes("5 % du prix de la nuit par personne, au plus 4,40 € par personne et par nuit, plus 10 % de taxe additionnelle.") &&
      ajout.plan.lignes.includes("Le site affichera : « 5,5 % du prix de la nuit par personne, au plus 4,84 € par adulte et par nuit ; mineurs exonérés »."),
    "nouvelle délibération : récapitulatif (réponse 9 A)",
    ajout.plan,
  );
  const n2027 = (await db.execute(sql`select count(*)::int as n from taxes_sejour where date_debut = '2027-01-01'`)).rows[0] as { n: number };
  noter(ajout.fin.etape === "fait" && n2027.n === 3, "trois lignes, une par gîte");
  const idArmu = ((await db.execute(sql`select id from taxes_sejour where date_debut = '2027-01-01' and gite_id = ${armu.id}::uuid`)).rows[0] as { id: string }).id;
  const corr = await confirmer((c) => modifierTaxe(idArmu, { ...taxe, dateDebut: "2027-02-01", taux: "4" }, ACTEUR, c));
  noter(corr.fin.etape === "fait" && ((await db.execute(sql`select taux from taxes_sejour where id = ${idArmu}::uuid`)).rows[0] as { taux: string }).taux === "4.00", "délibération à venir : corrigée");
  noter((await supprimerTaxe(idArmu, ACTEUR)).ok, "délibération à venir : supprimée");
  const idEnVigueur = ((await db.execute(sql`select id from taxes_sejour where date_debut = '2026-01-01' and gite_id = ${armu.id}::uuid`)).rows[0] as { id: string }).id;
  const figee = await modifierTaxe(idEnVigueur, taxe, ACTEUR, null);
  noter(figee.etape === "refus" && figee.message.startsWith("Cette délibération est déjà en vigueur"), "délibération en vigueur : figée");
  noter(!(await supprimerTaxe(idEnVigueur, ACTEUR)).ok, "délibération en vigueur : ne se supprime pas");
  const avantVigueur = await ajouterTaxe({ ...taxe, dateDebut: "2025-06-01" }, ACTEUR, null);
  noter(avantVigueur.etape === "refus" && avantVigueur.message.includes("en vigueur depuis le jeudi 1er janvier 2026"), "ligne glissée avant une délibération en vigueur : refusée", avantVigueur);
  const memeDate = await ajouterTaxe({ ...taxe, gites: [laphine.id], dateDebut: "2027-01-01" }, ACTEUR, null);
  noter(memeDate.etape === "refus" && memeDate.message.startsWith("LaPhine a déjà une délibération"), "même date pour un gîte : refusée");
  noter((await ajouterTaxe({ ...taxe, gites: [] }, ACTEUR, null)).etape === "refus", "aucun gîte coché : refusé");
  const fixeSans = await ajouterTaxe({ ...taxe, mode: "fixe", tarifFixe: "" }, ACTEUR, null);
  noter(fixeSans.etape === "refus" && fixeSans.message.startsWith("Le tarif par personne"), "mode fixe sans tarif : refusé");

  console.log("--- 3. « À traiter » : tarif sans prix");
  await db.execute(sql`delete from tarifs_prix where tarif_id = (select id from tarifs where nom = 'Été (essai)') and gite_id = ${mv.id}::uuid`);
  const taches = await listerATraiter();
  const incomplet = taches.find((t) => t.cle === "tarifs_incomplets");
  noter(incomplet?.detail.includes("« Été (essai) » n'a pas de prix pour La Maison Vieille") === true, "« À traiter » : tarifs incomplets", incomplet);
}

async function partieHttp(): Promise<void> {
  console.log("--- 4. Pages (serveur sur 3001)");
  const sans = await fetch(`${ORIGINE}/gestion/tarifs`, { redirect: "manual" });
  noter(sans.status === 307, "/gestion/tarifs sans session : renvoi à la connexion", sans.status);
  const jeton = `essai-tarifs-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values ('http-tarifs@example.invalid') returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description) values (${compte.id}::uuid, ${empreinteJeton(`app-${jeton}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinteJeton(jeton)})`);
  const cookie = { cookie: `gestion_session=${jeton}` };
  const pages: Array<[string, string]> = [
    ["/gestion/tarifs", "Prix d&#x27;une nuit"],
    ["/gestion/tarifs/periodes", "Copier 2027 sur 2028"],
    ["/gestion/tarifs/baremes", "Barème général (essai)"],
    ["/gestion/tarifs/regles", "Règles générales"],
    ["/gestion/tarifs/taxe", "Nouvelle délibération"],
  ];
  for (const [chemin, attendu] of pages) {
    const r = await fetch(`${ORIGINE}${chemin}`, { headers: cookie });
    const html = await r.text();
    noter(r.status === 200 && html.includes(attendu) && html.includes("Tout est réservable jusqu"), `${chemin} : la page et l'état`, { status: r.status, attendu });
  }
}

async function nettoyer(): Promise<void> {
  await chargerTarifsFictifs(getPool());
  await db.execute(sql`update reglages set tarifs_horizon_mois = 12 where id = 1`);
  await db.execute(sql`delete from comptes_gestion where courriel = 'http-tarifs@example.invalid'`);
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  reglesPures();
  await nettoyer();
  try {
    await surLaBase();
    if (process.argv.includes("--http")) {
      await nettoyer();
      await partieHttp();
    }
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
