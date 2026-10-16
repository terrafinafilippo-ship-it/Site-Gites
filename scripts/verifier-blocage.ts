// Contrôle du BLOCAGE DES DATES pendant le paiement, sur la base de TEST.
//
//   1. Deux clients bloquent les mêmes nuits AU MÊME INSTANT : un seul gagne.
//   2. Un blocage expiré est repris ; une nuit vendue ou fermée ne l'est jamais.
//   3. Un séjour qui chevauche est refusé sans rien laisser derrière lui ; un
//      séjour qui commence le jour d'un départ est accepté.
//   4. Le parcours du tunnel (lib/tunnel.ts) : tentative enregistrée au prix du
//      devis, seconde tentative refusée avec les autres gîtes libres, abandon
//      qui libère tout.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées à la fin, et au début (reste d'un essai interrompu). Le point 4
// suppose la tarification d'essai chargée par scripts/parcours/reinitialiser.ts.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-blocage.ts
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { ajouterJours, aujourdhuiParis, jourSemaineIso } from "../lib/dates-civiles";
import { lireNuitsPrises, poserBlocage } from "../lib/disponibilites";
import { abandonnerTentative, enregistrerTentative, nuitsBloquees } from "../lib/tunnel";
import type { Coordonnees } from "../lib/coordonnees";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const PREFIXE = "BLOCAGE-TEST-";
const EMAIL_ESSAI = "blocage@example.invalid";
// Dates en 2099 pour les points 1 à 3 : aucune réservation réelle n'y existe.
const A = "2099-03-07";
const B = "2099-03-14";

const db = getDb();

async function nettoyer(): Promise<void> {
  await db.execute(sql`
    delete from disponibilites
     where reservation_id in (
             select id from reservations where reference like ${PREFIXE + "%"} or client_email = ${EMAIL_ESSAI})
        or (date >= '2099-01-01' and source = 'directe' and reservation_id is null)`);
  await db.execute(sql`
    delete from reservations where reference like ${PREFIXE + "%"} or client_email = ${EMAIL_ESSAI}`);
}

async function nouvelleReservation(giteId: string, nom: string, arrivee = A, depart = B): Promise<string> {
  const r = await db.execute<{ id: string }>(sql`
    insert into reservations (gite_id, reference, statut, date_arrivee, date_depart, client_nom, nb_adultes)
    values (${giteId}::uuid, ${PREFIXE + nom}, 'en_attente_paiement', ${arrivee}::date, ${depart}::date, ${nom}, 2)
    returning id`);
  return r.rows[0].id;
}

/** Bloque dans une transaction qui ATTEND avant de valider : le concurrent doit buter dessus. */
async function bloquerEnTransaction(
  giteId: string,
  reservationId: string,
  arrivee: string,
  depart: string,
  attenteSecondes = 0,
): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const r = await poserBlocage(tx, { giteId, reservationId, arrivee, depart, minutes: 20 });
      if (!r.ok) throw new Error("refus");
      if (attenteSecondes > 0) await tx.execute(sql`select pg_sleep(${attenteSecondes})`);
      return true;
    });
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === "refus") return false;
    throw erreur;
  }
}

async function nuitsDe(reservationId: string): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from disponibilites where reservation_id = ${reservationId}::uuid`);
  return r.rows[0].n;
}

/** Prochain samedi au moins `semaines` semaines après aujourd'hui. */
function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

// ── 5. Par le serveur (option --http, lancée par lancer.sh) ───────────────
// Pages et points d'entrée réels : codes de réponse, et deux POST simultanés.

async function verifierHttp(coordonnees: Coordonnees): Promise<void> {
  const base = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
  console.log(`--- par le serveur (${base})`);

  const page = async (chemin: string) => {
    const r = await fetch(`${base}${chemin}`, { redirect: "manual" });
    return { status: r.status, texte: await r.text() };
  };
  const choix = await page("/reserver");
  noter(choix.status === 200 && choix.texte.includes("Quel gîte souhaitez-vous réserver"), "/reserver sans gîte : écran de choix", choix.status);
  noter((await page("/reserver?gite=larmu")).status === 404, "/reserver?gite=larmu (ancien nom) : 404, pas LaPhine en silence");
  noter((await page("/reserver?gite=toString")).status === 404, "/reserver?gite=toString : 404");
  const tunnel = await page("/reserver?gite=armu");
  noter(tunnel.status === 200 && tunnel.texte.includes("Quand venez-vous"), "/reserver?gite=armu : tunnel ouvert", tunnel.status);
  const fiche = await page("/gites/armu");
  noter(fiche.status === 200 && fiche.texte.includes("Non réservable en ligne"), "fiche L'Armu : calendrier réel affiché", fiche.status);

  const poster = async (corps: unknown) => {
    const r = await fetch(`${base}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof corps === "string" ? corps : JSON.stringify(corps),
    });
    return { status: r.status, corps: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const arrivee = samediDans(7);
  const demande = { gite: "armu", arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0, coordonnees };

  noter((await poster("{pas du json")).status === 400, "POST corps illisible : 400");
  noter((await poster({ ...demande, gite: "larmu" })).status === 404, "POST gîte inconnu : 404");
  const incomplet = await poster({ ...demande, coordonnees: { ...coordonnees, email: "" } });
  noter(incomplet.status === 400 && incomplet.corps.code === "CHAMPS_INVALIDES", "POST sans e-mail : 400 CHAMPS_INVALIDES", incomplet.corps);
  const regle = await poster({ ...demande, bebes: 2 });
  noter(regle.status === 409 && regle.corps.code === "DEVIS_REFUSE", "POST 2 adultes + 2 bébés pour L'Armu : 409 DEVIS_REFUSE", regle.corps);

  const [p1, p2] = await Promise.all([poster(demande), poster(demande)]);
  const statuts = [p1.status, p2.status].sort();
  noter(statuts[0] === 201 && statuts[1] === 409, "deux POST simultanés sur les mêmes dates : un 201, un 409", statuts);
  const gagnant = p1.status === 201 ? p1 : p2;
  const perdant = p1.status === 201 ? p2 : p1;
  noter(perdant.corps.code === "DATES_PRISES", "le second reçoit DATES_PRISES et les autres gîtes libres", perdant.corps);

  const id = String(gagnant.corps.id);
  const supprimer = async (cible: string) =>
    (await fetch(`${base}/api/reservations/${cible}`, { method: "DELETE" })).status;
  noter((await supprimer(id)) === 200, "DELETE de la tentative : 200");
  noter((await supprimer(id)) === 404, "DELETE répété : 404");
  noter((await supprimer("pas-un-uuid")) === 400, "DELETE identifiant invalide : 400");
  const apres = await poster(demande);
  noter(apres.status === 201, "après l'abandon, les dates se bloquent à nouveau : 201", apres.status);
  if (apres.status === 201) await supprimer(String(apres.corps.id));

  // Limite anti-abus : 5 tentatives par adresse en 10 minutes. Adresse de
  // documentation (2001:db8::/32) tirée au hasard : une relance du parcours
  // ne retombe pas sur le compteur de la précédente.
  const adresse = `2001:db8::${Math.floor(Math.random() * 0xffff).toString(16)}:${Math.floor(Math.random() * 0xffff).toString(16)}`;
  const statutsLimite: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const r = await fetch(`${base}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": adresse },
      body: JSON.stringify(demande),
    });
    const corps = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    statutsLimite.push(r.status);
    if (r.status === 201) await supprimer(String(corps.id));
  }
  noter(
    statutsLimite.slice(0, 5).every((s) => s === 201) && statutsLimite[5] === 429,
    "même adresse : 5 tentatives acceptées, la 6e refusée (429)",
    statutsLimite,
  );
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et des blocages.');
  }
  await nettoyer();

  const gites = await db.execute<{ id: string; slug: string }>(sql`select id, slug from gites`);
  const armu = gites.rows.find((g) => g.slug === "armu")?.id;
  if (!armu) throw new Error("gîte armu absent : lancez d'abord npm run db:seed.");

  try {
    // ── 1. Simultanéité ────────────────────────────────────────────────────
    console.log("--- deux clients, les mêmes nuits, au même instant");
    const r1 = await nouvelleReservation(armu, "UN");
    const r2 = await nouvelleReservation(armu, "DEUX");
    const [g1, g2] = await Promise.all([
      bloquerEnTransaction(armu, r1, A, B, 0.5),
      bloquerEnTransaction(armu, r2, A, B, 0.5),
    ]);
    noter(Number(g1) + Number(g2) === 1, "un seul des deux blocages réussit", { g1, g2 });
    const gagnant = g1 ? r1 : r2;
    const perdant = g1 ? r2 : r1;
    noter((await nuitsDe(gagnant)) === 7 && (await nuitsDe(perdant)) === 0, "le gagnant tient 7 nuits, le perdant aucune");
    noter((await lireNuitsPrises(db, armu, A, B)).length === 7, "les 7 nuits sont lues comme prises");

    // ── 2. Expiration ──────────────────────────────────────────────────────
    console.log("--- blocage expiré, nuit vendue, nuit fermée");
    await db.execute(sql`
      update disponibilites set verrou_expire_at = now() - interval '1 minute'
       where reservation_id = ${gagnant}::uuid`);
    noter((await lireNuitsPrises(db, armu, A, B)).length === 0, "un blocage expiré est lu comme libre");
    const r3 = await nouvelleReservation(armu, "TROIS");
    noter(await bloquerEnTransaction(armu, r3, A, B), "un troisième client reprend les nuits expirées");
    noter((await nuitsDe(gagnant)) === 0 && (await nuitsDe(r3)) === 7, "les 7 nuits appartiennent désormais au troisième");

    const C = ajouterJours(B, 14);
    await db.execute(sql`
      insert into disponibilites (gite_id, date, statut, source) values (${armu}::uuid, ${C}::date, 'bloque', 'directe')`);
    const r4 = await nouvelleReservation(armu, "QUATRE", ajouterJours(C, -2), ajouterJours(C, 2));
    noter(!(await bloquerEnTransaction(armu, r4, ajouterJours(C, -2), ajouterJours(C, 2))), "une nuit fermée par les propriétaires n'est jamais reprise");
    noter((await nuitsDe(r4)) === 0, "le refus ne laisse aucune nuit bloquée (transaction annulée)");

    // ── 3. Chevauchement et séjours qui se touchent ───────────────────────
    console.log("--- chevauchement, séjours qui se touchent");
    const r5 = await nouvelleReservation(armu, "CINQ", ajouterJours(A, 3), ajouterJours(B, 3));
    noter(!(await bloquerEnTransaction(armu, r5, ajouterJours(A, 3), ajouterJours(B, 3))), "un séjour qui chevauche de 4 nuits est refusé");
    noter((await nuitsDe(r5)) === 0, "ses 3 nuits libres ne restent pas bloquées");
    const r6 = await nouvelleReservation(armu, "SIX", B, ajouterJours(B, 3));
    noter(await bloquerEnTransaction(armu, r6, B, ajouterJours(B, 3)), "un séjour qui arrive le jour d'un départ est accepté");

    // ── 4. Le tunnel de bout en bout ──────────────────────────────────────
    console.log("--- tunnel : tentative, seconde tentative, abandon");
    // Dans cinq semaines : dans les périodes d'essai, hors du paiement intégral.
    const arrivee = samediDans(5);
    const depart = ajouterJours(arrivee, 7);
    const demande = { arrivee, depart, adultes: 2, enfants: 0, bebes: 0 };
    const coordonnees: Coordonnees = {
      locataire: { civilite: "", prenom: "Essai", nom: "Blocage" },
      email: EMAIL_ESSAI,
      telephone: "06 00 00 00 00",
      adresse: "1 rue de l'Essai",
      codePostal: "07100",
      ville: "Savas",
      pays: "France",
      colocataire: null,
      autresAdultes: [{ prenom: "Second", nom: "Adulte" }],
    };

    const premiere = await enregistrerTentative("armu", demande, coordonnees, null);
    if (!premiere.ok) {
      noter(false, `tentative enregistrée (${arrivee} → ${depart})`, premiere);
      return;
    }
    noter(premiere.reference.startsWith(`SAM-${arrivee.slice(0, 4)}-`), `tentative enregistrée, référence ${premiere.reference}`);
    const ligne = await db.execute<{
      statut: string; prix_location: string; taxe_sejour: string; heure_arrivee: string;
      occupants_majeurs: string; detail: { formatVersion?: number; montants?: { totalTtc?: number } } | null;
    }>(sql`
      select statut, prix_location::text, taxe_sejour::text, heure_arrivee::text, occupants_majeurs,
             detail_calcul as detail
        from reservations where id = ${premiere.id}::uuid`);
    const l = ligne.rows[0];
    noter(l?.statut === "en_attente_paiement", "statut « en attente de paiement »", l?.statut);
    noter(
      l?.detail?.formatVersion === 1 && l.detail.montants?.totalTtc === premiere.devis.montants.totalTtc,
      "détail du calcul enregistré, total identique au devis",
      l?.detail?.montants,
    );
    noter(l?.heure_arrivee === "18:00:00" && l.occupants_majeurs === "Essai BLOCAGE, Second ADULTE", "horaires des réglages et occupants majeurs recopiés", l);
    noter((await nuitsBloquees(premiere.id)) === 7, "7 nuits bloquées");

    const seconde = await enregistrerTentative("armu", demande, coordonnees, null);
    noter(!seconde.ok && seconde.raison === "DATES_PRISES", "seconde tentative sur les mêmes dates : refusée", seconde.ok ? seconde.reference : seconde);
    const alternatives = !seconde.ok && seconde.raison === "DATES_PRISES" ? seconde.alternatives : [];
    noter(
      alternatives.length === 2 && alternatives.every((a) => a.slug !== "armu" && a.total > 0),
      "les deux autres gîtes sont proposés, prix recalculé",
      alternatives,
    );

    noter((await abandonnerTentative(premiere.id)) === "ABANDONNEE", "abandon : accepté");
    noter((await nuitsBloquees(premiere.id)) === 0, "abandon : les nuits sont libérées");
    const restante = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from reservations where id = ${premiere.id}::uuid`);
    noter(restante.rows[0].n === 0, "abandon : la tentative et les coordonnées sont supprimées");
    noter((await abandonnerTentative(premiere.id)) === "ABSENTE", "second abandon : réservation introuvable");

    await db.execute(sql`update reservations set statut = 'confirmee' where id = ${r6}::uuid`);
    noter((await abandonnerTentative(r6)) === "ENGAGEE", "une réservation confirmée ne s'abandonne pas");

    if (process.argv.includes("--http")) await verifierHttp(coordonnees);
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
