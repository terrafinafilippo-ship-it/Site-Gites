// Contrôle de la SYNCHRONISATION DES CALENDRIERS (Phase 7, D-44), sur la base
// de TEST. Les plateformes sont SIMULÉES : un lecteur qui renvoie le
// calendrier voulu, ou une panne. Le prestataire de paiement aussi.
//
//   1. le format iCal : lecture (jours, heures UTC, lignes repliées, annulé,
//      libre, sans fin), écriture, aller-retour, liens acceptés ;
//   2. les calendriers d'un gîte : trois lignes, jetons secrets, créés une fois ;
//   3. coller un lien : refusé s'il n'est pas https, illisible ou pas un
//      calendrier (rien n'est enregistré) ; accepté, ses séjours prennent
//      leurs nuits ; le journal ne garde que le domaine ;
//   4. le lien du site : nuits vendues sur le site, fermées, gardées par une
//      option et vendues ailleurs ; ni les siennes, ni un paiement en cours ;
//   5. l'écran de paiement : les dates d'une plateforme donnent « dates
//      prises », relues juste avant ; une plateforme muette ne bloque pas ;
//   6. une annulation sur la plateforme libère les nuits ; une lecture ratée
//      ne libère rien ;
//   7. un paiement en cours sur une nuit vendue ailleurs est remboursé ;
//   8. les doublons : réservation du site, nuits fermées — une alerte, une
//      seule, la ligne « À traiter », le texte selon le délai ; résolu quand
//      la réservation du site est annulée ;
//   9. un lien qui ne se lit plus depuis 2 heures ; l'accueil (7 prochains
//      jours, « Plus loin ») ; les CGV ; deux liens lus d'un passage ; lien retiré ;
//  10. (--http, serveur sur 3001) GET /api/calendrier/<jeton>.ics, la page des CGV.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les liens des plateformes sont retirés.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-synchronisation.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { texteAlerteProbleme, type Probleme } from "../lib/courriels-textes";
import { LEGAL_DOCS } from "../lib/data/legal";
import { ajouterJours, aujourdhuiParis } from "../lib/dates-civiles";
import { libererNuits } from "../lib/disponibilites";
import { listerATraiter, arriveesDeparts, sejoursAVenir } from "../lib/gestion/a-traiter";
import { fermerNuits } from "../lib/gestion/calendrier";
import { ecrireIcal, lireIcal, plagesDeNuits, type Plage } from "../lib/ical";
import { remplacerMessagerie } from "../lib/messagerie";
import { constaterPaiement } from "../lib/paiement";
import { remplacerPrestataire } from "../lib/stripe";
import {
  calendrierExporte,
  calendriersDuGite,
  doublonsEnCours,
  enregistrerLienImport,
  liensEnPanne,
  normaliserLien,
  relireAvantPaiement,
  synchroniserCalendriers,
  type Lecteur,
} from "../lib/synchronisation";
import { enregistrerTentative } from "../lib/tunnel";
import { coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans, tenter } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "synchro@example.invalid";
const CLIENT = coordonnees(EMAIL_ESSAI, "Camille", "Synchro");
const SERVEUR = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const db = getDb();

// ─── Plateformes simulées ────────────────────────────────────────────────────

const LIEN_AIRBNB = "https://www.airbnb.fr/calendar/ical/123.ics?s=cle-secrete";
const LIEN_BOOKING = "https://ical.booking.com/v1/export?t=autre-cle";

/** Ce que chaque lien renvoie : un calendrier, ou une erreur levée. */
const reponses = new Map<string, string | Error>();
const lecteur: Lecteur = async (lien) => {
  const r = reponses.get(lien);
  if (r === undefined) throw new TypeError("fetch failed");
  if (r instanceof Error) throw r;
  return r;
};
const compact = (iso: string) => iso.replace(/-/g, "");

/** Un calendrier comme Airbnb en donne : un VEVENT par séjour, en jours. */
function calendrierAirbnb(plages: Plage[]): string {
  const ev = plages.map((p, i) =>
    [
      "BEGIN:VEVENT",
      `DTEND;VALUE=DATE:${compact(p.depart)}`,
      `DTSTART;VALUE=DATE:${compact(p.arrivee)}`,
      `UID:airbnb-${i}@airbnb.com`,
      "SUMMARY:Reserved",
      "END:VEVENT",
    ].join("\r\n"),
  );
  return ["BEGIN:VCALENDAR", "PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN", "VERSION:2.0", ...ev, "END:VCALENDAR", ""].join("\r\n");
}

// ─── Base ────────────────────────────────────────────────────────────────────

async function idGite(slug: string): Promise<string> {
  const r = await db.execute<{ id: string }>(sql`select id::text as id from gites where slug = ${slug}`);
  if (!r.rows[0]) throw new Error(`gîte ${slug} absent de la base de test (db:seed)`);
  return r.rows[0].id;
}

async function nuits(giteId: string, du: string, au: string): Promise<{ date: string; statut: string; source: string }[]> {
  const r = await db.execute<{ date: string; statut: string; source: string }>(sql`
    select date::text as date, statut, source from disponibilites
     where gite_id = ${giteId}::uuid and date >= ${du}::date and date < ${au}::date order by date`);
  return r.rows;
}

async function alertesDoublon(): Promise<{ cle: string; reservation_id: string | null; donnees: Record<string, unknown> }[]> {
  const r = await db.execute<{ cle: string; reservation_id: string | null; donnees: Record<string, unknown> }>(sql`
    select cle, reservation_id::text as reservation_id, donnees from courriels
     where objet = 'alerte_probleme' and donnees->>'genre' = 'doublon'`);
  return r.rows;
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}
                          or (objet = 'alerte_probleme' and donnees->>'genre' = 'doublon')`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from sejours_plateformes`);
  await db.execute(sql`delete from disponibilites where source <> 'directe'`);
  await db.execute(sql`update calendriers set lien_import = null, lu_at = null, erreur = null`);
  await db.execute(sql`delete from audit_logs where table_cible = 'calendriers'`);
  for (const [du, au] of fermetures) {
    await db.execute(sql`delete from disponibilites where statut = 'bloque' and date >= ${du}::date and date <= ${au}::date
                           and gite_id = (select id from gites where slug = 'armu')`);
  }
}

/** Les nuits fermées par ce contrôle (premier et dernier jour), effacées à la fin. */
const fermetures: [string, string][] = [];

// ─── 1. Le format iCal ───────────────────────────────────────────────────────

function controlesIcal(): void {
  console.log("--- 1. le format iCal");
  const texte = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270306",
    "DTEND;VALUE=DATE:20270313",
    "SUMMARY:Reserved - Camille Dupont",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20270320T230000Z",
    "DTEND:20270323T090000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:2027",
    " 0401",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270410",
    "DTEND;VALUE=DATE:20270412",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270415",
    "DTEND;VALUE=DATE:20270416",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270501",
    "DURATION:P3D",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270230",
    "DTEND;VALUE=DATE:20270302",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const lu = lireIcal(texte);
  noter(
    JSON.stringify(lu) ===
      JSON.stringify([
        { arrivee: "2027-03-06", depart: "2027-03-13" },
        { arrivee: "2027-03-21", depart: "2027-03-23" },
        { arrivee: "2027-04-01", depart: "2027-04-02" },
        { arrivee: "2027-05-01", depart: "2027-05-04" },
      ]),
    "lecture : jours, heure UTC ramenée à Paris, ligne repliée sans fin (une nuit), DURATION ; annulé, libre et date impossible ignorés",
    lu,
  );
  noter(lireIcal("<html>Page introuvable</html>") === null, "un texte qui n'est pas un calendrier : refusé");
  noter(JSON.stringify(lireIcal("BEGIN:VCALENDAR\nEND:VCALENDAR")) === "[]", "un calendrier vide : aucun séjour (tout est annulé)");

  const plages = plagesDeNuits(["2027-03-08", "2027-03-06", "2027-03-07", "2027-03-07", "2027-03-10"]);
  noter(
    JSON.stringify(plages) === JSON.stringify([{ arrivee: "2027-03-06", depart: "2027-03-09" }, { arrivee: "2027-03-10", depart: "2027-03-11" }]),
    "nuits consécutives regroupées en plages",
    plages,
  );
  const ecrit = ecrireIcal("gite-essai", plages, new Date("2026-11-26T10:00:00Z"));
  noter(JSON.stringify(lireIcal(ecrit)) === JSON.stringify(plages), "écriture puis lecture : les mêmes plages");
  noter(
    ecrit.includes("\r\n") && ecrit.includes("SUMMARY:Indisponible") && ecrit.includes("UID:gite-essai-20270306-20270309@gitesdesamoyas.fr"),
    "écriture : lignes CRLF, « Indisponible », UID stable tiré du gîte et des dates",
  );
  noter(normaliserLien(" webcal://www.airbnb.fr/calendar/ical/1.ics?s=x ") === "https://www.airbnb.fr/calendar/ical/1.ics?s=x", "lien webcal:// lu en https://");
  noter(normaliserLien("http://exemple.fr/cal.ics") === null && normaliserLien("pas un lien") === null && normaliserLien("https://") === null, "lien http, ou qui n'est pas une adresse : refusé");
}

// ─── 2 à 9. Avec la base ─────────────────────────────────────────────────────

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  remplacerPrestataire(p);
  remplacerMessagerie(new MessagerieSimulee());
  const armu = await idGite("armu");
  const auj = aujourdhuiParis();

  // Les séjours des plateformes, dans des semaines qu'aucun autre contrôle n'occupe.
  const s1 = { arrivee: samediDans(26), depart: ajouterJours(samediDans(26), 3) };
  const s2 = { arrivee: samediDans(27), depart: ajouterJours(samediDans(27), 2) };
  const s3 = samediDans(28);
  const s4 = samediDans(29);
  const s5 = { arrivee: samediDans(31), depart: ajouterJours(samediDans(31), 2) };

  console.log("--- 2. les calendriers d'un gîte");
  const cals = await calendriersDuGite(armu);
  const encore = await calendriersDuGite(armu);
  noter(cals.map((c) => c.plateforme).join(",") === "gdf,airbnb,booking", "trois calendriers : Gîtes de France, Airbnb, Booking", cals.map((c) => c.plateforme));
  noter(cals.every((c) => /^\/api\/calendrier\/[0-9a-f]{48}\.ics$/.test(c.cheminExport)), "chaque lien du site porte un jeton secret de 48 caractères");
  noter(new Set(cals.map((c) => c.cheminExport)).size === 3, "un lien différent par plateforme");
  noter(JSON.stringify(encore.map((c) => c.id)) === JSON.stringify(cals.map((c) => c.id)), "rouvrir la fiche ne crée rien de plus");
  const airbnb = cals.find((c) => c.plateforme === "airbnb")!;
  const booking = cals.find((c) => c.plateforme === "booking")!;
  const jeton = (c: { cheminExport: string }) => c.cheminExport.slice("/api/calendrier/".length, -".ics".length);

  console.log("--- 3. coller un lien");
  const http = await enregistrerLienImport(airbnb.id, "http://www.airbnb.fr/x.ics", "commande", lecteur);
  noter(!http.ok && http.message.includes("https://"), "lien http : refusé", http);
  const muet = await enregistrerLienImport(airbnb.id, "https://injoignable.example/cal.ics", "commande", lecteur);
  noter(!muet.ok && muet.message.includes("adresse injoignable") && muet.message.includes("Rien n'est enregistré"), "lien injoignable : refusé, rien n'est enregistré", muet);
  reponses.set("https://www.airbnb.fr/page.html", "<html></html>");
  const page = await enregistrerLienImport(airbnb.id, "https://www.airbnb.fr/page.html", "commande", lecteur);
  noter(!page.ok && page.message.includes("ne donne pas un calendrier"), "une page web au lieu d'un calendrier : refusée", page);
  const [rien] = (await db.execute<{ lien: string | null }>(sql`select lien_import as lien from calendriers where id = ${airbnb.id}::uuid`)).rows;
  noter(rien.lien === null, "après trois refus, aucun lien enregistré");

  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s1, { arrivee: "2020-01-04", depart: "2020-01-11" }]));
  const ok = await enregistrerLienImport(airbnb.id, LIEN_AIRBNB, "commande", lecteur);
  noter(ok.ok && ok.message === "Lien Airbnb enregistré : 1 séjour à venir.", "lien Airbnb accepté : 1 séjour à venir (le séjour passé est ignoré)", ok);
  const n1 = await nuits(armu, s1.arrivee, s1.depart);
  noter(n1.length === 3 && n1.every((n) => n.statut === "reserve" && n.source === "airbnb"), "ses 3 nuits sont prises, au nom d'Airbnb", n1);
  const [journal] = (
    await db.execute<{ action: string; details: Record<string, unknown> }>(sql`
      select action, details from audit_logs where table_cible = 'calendriers' and ligne_id = ${airbnb.id} order by created_at desc limit 1`)
  ).rows;
  noter(
    journal?.action === "lien_ajoute" && journal.details.domaine === "www.airbnb.fr" && !JSON.stringify(journal.details).includes("cle-secrete"),
    "journal : lien ajouté, le domaine seulement (pas la clé du lien)",
    journal,
  );

  console.log("--- 4. le lien du site");
  await reserver(p, CLIENT, "armu", samediDans(23), "cheque");
  const ferme = await fermerNuits({ giteId: armu, du: s5.arrivee, au: s5.arrivee }, "commande");
  fermetures.push([s5.arrivee, s5.arrivee]);
  noter(ferme.ok, "une nuit fermée par les propriétaires", ferme);
  const enCours = await tenter(p, CLIENT, "armu", samediDans(28), "cheque");
  const pourBooking = lireIcal((await calendrierExporte(jeton(booking)))!)!;
  const pourAirbnb = lireIcal((await calendrierExporte(jeton(airbnb)))!)!;
  const contient = (plages: Plage[], jour: string) => plages.some((x) => x.arrivee <= jour && jour < x.depart);
  noter(contient(pourBooking, s1.arrivee) && !contient(pourAirbnb, s1.arrivee), "le séjour Airbnb est dans le lien donné à Booking, pas dans celui d'Airbnb");
  noter(contient(pourBooking, samediDans(23)) && contient(pourAirbnb, samediDans(23)), "la réservation du site est dans les deux liens");
  noter(contient(pourAirbnb, s5.arrivee), "la nuit fermée est dans le lien");
  noter(!contient(pourAirbnb, s3), "un paiement en cours (20 minutes) n'est pas dans le lien");
  noter((await calendrierExporte("0".repeat(48))) === null && (await calendrierExporte("abc")) === null, "jeton inconnu ou mal formé : aucun calendrier");
  const ical = (await calendrierExporte(jeton(airbnb)))!;
  noter(!ical.includes("Camille") && !ical.includes("Synchro") && !ical.includes(EMAIL_ESSAI), "aucun nom ni courriel dans le lien du site");

  console.log("--- 5. l'écran de paiement");
  const pris = await enregistrerTentative("armu", { arrivee: s1.arrivee, depart: s1.depart, adultes: 2, enfants: 0, bebes: 0 }, CLIENT, null, { moyenCaution: "cheque", modeSolde: "lien" });
  noter(!pris.ok && pris.raison === "DATES_PRISES", "dates vendues sur Airbnb : écran « dates prises »", pris.ok ? "acceptée" : pris.raison);
  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s1, s2]));
  await relireAvantPaiement("armu", lecteur);
  const relu = await enregistrerTentative("armu", { arrivee: s2.arrivee, depart: s2.depart, adultes: 2, enfants: 0, bebes: 0 }, CLIENT, null, { moyenCaution: "cheque", modeSolde: "lien" });
  noter(!relu.ok && relu.raison === "DATES_PRISES", "séjour Airbnb tout neuf : relu à l'arrivée sur l'écran de paiement, « dates prises »", relu.ok ? "acceptée" : relu.raison);
  const delai = Object.assign(new Error("délai"), { name: "TimeoutError" });
  reponses.set(LIEN_AIRBNB, delai);
  await relireAvantPaiement("armu", lecteur);
  const [panne] = (await db.execute<{ erreur: string | null }>(sql`select erreur from calendriers where id = ${airbnb.id}::uuid`)).rows;
  noter(panne.erreur === "la plateforme n'a pas répondu en 4 secondes", "plateforme muette avant le paiement : l'erreur est notée", panne);
  const libre = await enregistrerTentative("armu", { arrivee: samediDans(21), depart: ajouterJours(samediDans(21), 7), adultes: 2, enfants: 0, bebes: 0 }, CLIENT, null, { moyenCaution: "cheque", modeSolde: "lien" });
  noter(libre.ok, "… et le client peut réserver des dates libres quand même (décision 3 A)", libre.ok ? "" : libre);
  noter((await nuits(armu, s2.arrivee, s2.depart)).length === 2, "une lecture ratée ne libère rien");

  console.log("--- 6. annulation sur la plateforme");
  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s2]));
  const b1 = await synchroniserCalendriers(new Date(), lecteur);
  noter(b1.lus === 1 && b1.echecs === 0, "passage des tâches : le lien est lu", b1);
  noter((await nuits(armu, s1.arrivee, s1.depart)).length === 0, "séjour annulé sur Airbnb : ses nuits sont libérées");
  noter((await nuits(armu, s2.arrivee, s2.depart)).length === 2, "l'autre séjour garde les siennes");

  console.log("--- 7. paiement en cours sur une nuit vendue ailleurs");
  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s2, { arrivee: s3, depart: ajouterJours(s3, 2) }]));
  await synchroniserCalendriers(new Date(), lecteur);
  const n3 = await nuits(armu, s3, ajouterJours(s3, 2));
  noter(n3.every((n) => n.source === "airbnb"), "la nuit bloquée par un paiement en cours passe à Airbnb", n3);
  p.regler(enCours.paiementId);
  const issue = await constaterPaiement(enCours.paiementId, p);
  noter(issue.issue === "REMBOURSEE", "le paiement qui arrive ensuite est remboursé (« dates prises »)", issue);
  noter((await alertesDoublon()).length === 0, "ce n'est pas un doublon : aucune alerte doublon");

  console.log("--- 8. les doublons");
  const resa4 = await reserver(p, CLIENT, "armu", s4, "cheque");
  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s2, { arrivee: ajouterJours(s4, 2), depart: ajouterJours(s4, 4) }]));
  const b2 = await synchroniserCalendriers(new Date(), lecteur);
  noter(b2.doublons === 1, "séjour Airbnb sur une réservation du site : un doublon", b2);
  const n4 = await nuits(armu, ajouterJours(s4, 2), ajouterJours(s4, 4));
  noter(n4.every((n) => n.source === "directe" && n.statut === "reserve"), "le site ne touche pas à la réservation du site", n4);
  const a1 = await alertesDoublon();
  const d0 = (a1[0]?.donnees.detenteurs as { genre: string; reference: string; payeLe: string; finDelai: string }[] | undefined)?.[0];
  noter(a1.length > 0 && a1.every((a) => a.reservation_id === resa4.id), "une alerte « À TRAITER », rattachée à la réservation du site", a1.length);
  noter(
    d0?.genre === "directe" && d0.reference === resa4.reference && new Date(d0.finDelai).getTime() - new Date(d0.payeLe).getTime() === 24 * 3_600_000,
    "l'alerte nomme la réservation, et la fin du délai de 24 heures après son paiement",
    d0,
  );
  await synchroniserCalendriers(new Date(), lecteur);
  noter((await alertesDoublon()).length === a1.length, "lecture suivante : pas de seconde alerte pour le même séjour");
  const doublons = await doublonsEnCours();
  noter(doublons.length === 1 && doublons[0].detenteurs[0].genre === "directe", "doublon en cours, avec la réservation du site", doublons);
  const taches = await listerATraiter();
  const ligne = taches.find((t) => t.cle === `doublon:${doublons[0]?.sejourId}`);
  noter(
    !!ligne && ligne.titre === "Doublon possible avec Airbnb" && ligne.reservationId === resa4.id && ligne.gestes.includes("fiche"),
    "« À traiter » : « Doublon possible avec Airbnb », avec la fiche de la réservation",
    ligne,
  );

  const probleme = { ...(a1[0].donnees as unknown as Probleme), genre: "doublon" } as Extract<Probleme, { genre: "doublon" }>;
  const dans = texteAlerteProbleme(probleme, null, null);
  noter(
    dans.sujet.startsWith("À TRAITER — doublon possible avec Airbnb, L'Armu") && dans.texte.includes("Vous êtes dans le délai de 24 heures annoncé au client"),
    "courriel : dans le délai, annuler la réservation du site (article 7.4) ou le séjour Airbnb",
    dans.sujet,
  );
  const passe = texteAlerteProbleme({ ...probleme, vuLe: new Date(Date.now() + 25 * 3_600_000).toISOString() }, null, null);
  noter(passe.texte.includes("est passé : sa réservation est définitive. Annulez le séjour sur Airbnb."), "courriel : délai passé, annuler le séjour Airbnb", passe.texte);

  reponses.set(LIEN_AIRBNB, calendrierAirbnb([s2, { arrivee: ajouterJours(s4, 2), depart: ajouterJours(s4, 4) }, s5]));
  await synchroniserCalendriers(new Date(), lecteur);
  const ferme5 = (await doublonsEnCours()).find((d) => d.arrivee === s5.arrivee);
  noter(ferme5?.detenteurs[0].genre === "ferme", "séjour Airbnb sur une nuit fermée : doublon « nuits fermées »", ferme5);
  const tFerme = texteAlerteProbleme({ ...probleme, arrivee: s5.arrivee, depart: s5.depart, detenteurs: [{ genre: "ferme" }] }, null, null);
  noter(tFerme.texte.includes("Si ces nuits doivent rester fermées, annulez le séjour sur Airbnb"), "courriel : nuits fermées, garder ou rouvrir", tFerme.texte);

  await libererNuits(db, resa4.id);
  await synchroniserCalendriers(new Date(), lecteur);
  const resolu = await doublonsEnCours();
  noter(!resolu.some((d) => d.arrivee === ajouterJours(s4, 2)), "réservation du site annulée : le doublon disparaît, les nuits passent à Airbnb", resolu);
  noter((await nuits(armu, ajouterJours(s4, 2), ajouterJours(s4, 4))).every((n) => n.source === "airbnb"), "… nuits d'Airbnb");

  console.log("--- 9. lien en panne, accueil, CGV, deux liens, lien retiré");
  await db.execute(sql`update calendriers set lu_at = now() - interval '3 hours' where id = ${airbnb.id}::uuid`);
  const enPanne = await liensEnPanne();
  noter(enPanne.length === 1 && enPanne[0].plateforme === "airbnb", "lien lu il y a 3 heures : signalé", enPanne);
  const tPanne = (await listerATraiter()).find((t) => t.cle === `lien_calendrier:${airbnb.id}`);
  noter(!!tPanne && tPanne.titre === "Le calendrier Airbnb ne se lit plus" && tPanne.gestes.includes("gites"), "« À traiter » : « Le calendrier Airbnb ne se lit plus »", tPanne);
  await db.execute(sql`update calendriers set lu_at = now() - interval '1 hour' where id = ${airbnb.id}::uuid`);
  noter((await liensEnPanne()).length === 0, "lien lu il y a 1 heure : rien à signaler");

  const proche = { arrivee: ajouterJours(auj, 2), depart: ajouterJours(auj, 4) };
  reponses.set(LIEN_BOOKING, calendrierAirbnb([proche]));
  const maisonVieille = await calendriersDuGite(await idGite("maison-vieille"));
  const bookingMv = maisonVieille.find((c) => c.plateforme === "booking")!;
  const okBooking = await enregistrerLienImport(bookingMv.id, LIEN_BOOKING, "commande", lecteur);
  noter(okBooking.ok, "lien Booking de La Maison Vieille accepté", okBooking);
  const mouvements = await arriveesDeparts();
  noter(
    mouvements.arrivees.some((m) => m.client === "Booking" && m.reservationId === null && m.voyageurs === null && m.date === proche.arrivee),
    "accueil : l'arrivée Booking dans les 7 prochains jours, sans fiche ni nombre de personnes",
  );
  const loin = (await sejoursAVenir()).flatMap((x) => x.sejours);
  noter(loin.some((x) => x.client === "Airbnb" && x.arrivee === s2.arrivee && x.gite === "L'Armu"), "accueil : le séjour Airbnb dans « Plus loin »");

  const cgv = LEGAL_DOCS.cgv.body;
  const texteCgv = typeof cgv === "string" ? cgv : cgv({ abandonJours: null, doublonHeures: 24 });
  noter(
    texteCgv.includes("nous vous prévenons dans les 24 heures qui suivent votre paiement et nous vous remboursons intégralement (article 7.4 du contrat).") &&
      LEGAL_DOCS.cgv.meta.includes("version 7"),
    "CGV version 7 : la phrase du doublon, avec le délai réglé",
  );
  const cgv1 = typeof cgv === "string" ? cgv : cgv({ abandonJours: null, doublonHeures: 1 });
  noter(cgv1.includes("dans l'heure qui suit votre paiement"), "délai de 1 heure : « dans l'heure qui suit »");

  const bilan = await synchroniserCalendriers(new Date(), lecteur);
  noter(bilan.lus === 2 && bilan.echecs === 0, "passage suivant : les deux liens (L'Armu, La Maison Vieille) sont lus", bilan);

  const retire = await enregistrerLienImport(airbnb.id, "  ", "commande", lecteur);
  noter(retire.ok && retire.message === "Lien Airbnb retiré : les nuits venues d'Airbnb sont libérées.", "lien Airbnb effacé : retiré", retire);
  noter((await nuits(armu, s2.arrivee, s2.depart)).length === 0, "… les nuits venues d'Airbnb sont libérées");
}

// ─── 10. Par le serveur ──────────────────────────────────────────────────────

async function partieHttp(): Promise<void> {
  console.log("--- 10. par le serveur (--http)");
  const armu = await idGite("armu");
  const booking = (await calendriersDuGite(armu)).find((c) => c.plateforme === "booking")!;
  const r = await fetch(`${SERVEUR}${booking.cheminExport}`);
  const corps = await r.text();
  noter(
    r.status === 200 && (r.headers.get("content-type") ?? "").startsWith("text/calendar") && r.headers.get("cache-control") === "no-store",
    "GET du lien du site : 200, text/calendar, jamais mis en cache",
    { status: r.status, type: r.headers.get("content-type") },
  );
  noter(corps.startsWith("BEGIN:VCALENDAR") && lireIcal(corps) !== null, "… un calendrier iCal lisible");
  const inconnu = await fetch(`${SERVEUR}/api/calendrier/${"0".repeat(48)}.ics`);
  noter(inconnu.status === 404, "jeton inconnu : 404", inconnu.status);
  const cgv = await (await fetch(`${SERVEUR}/legal/cgv`)).text();
  noter(cgv.includes("dans les 24 heures qui suivent votre paiement"), "page des CGV : la phrase du doublon, délai lu en base");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit et efface des réservations et des calendriers.');
  }
  controlesIcal();
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
