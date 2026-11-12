// Contrôle des AVIS DES CLIENTS (Phase 6, D-40), sur la base de TEST,
// prestataire et messagerie SIMULÉS, temps fixé (chaque passage des tâches et
// chaque dépôt reçoit son heure de Paris).
//
// Sur l'exemple de Camille (L'Armu, arrivée A un samedi, départ D = A + 7) :
//   0. la signature (« Camille D. »), la moyenne au dixième, le commentaire
//      nettoyé ;
//   1. l'invitation : rien le jour du départ, une seule le lendemain ; son
//      texte (lien personnel, signature, fin de validité) ; un délai réglé à
//      3 jours la décale ;
//   2. le lien : fermé la veille du départ, ouvert de D à D + 30, fermé à
//      D + 31 ; jeton mal formé ou inconnu : fermé ;
//   3. le dépôt : notes et commentaires refusés, avant le départ refusé ;
//      publié une fois (signature, langue, date du séjour, commentaire
//      nettoyé), un second dépôt répond « déjà » ; l'alerte aux propriétaires ;
//      une invitation inscrite avant le dépôt n'est pas envoyée après ;
//   4. ce que montre le site : l'avis publié, du plus récent au plus ancien ;
//   5. passage manqué : rattrapé jusqu'à D + 30, plus après ;
//   6. client anglais : invitation en anglais, lien /en/avis/ ;
//   7. séjour annulé : ni invitation ni lien ;
//   8. le retrait : motif inconnu refusé, récapitulatif, empreinte périmée,
//      retrait, journal, courriel au client avec le motif ; « à la demande de
//      son auteur » en anglais ; un second retrait refusé ;
//   9. l'effacement après 3 ans, pas un jour avant ;
//  10. (--http, serveur sur 3001) la page de l'avis, POST /api/avis, la fiche
//      du gîte qui montre l'avis, la politique, robots.txt ; la page « Avis »
//      et la fiche des gîtes du back-office, fermées sans session.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin ; les réglages modifiés sont rétablis.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-avis.ts [--http]
import "../db/env";

import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import {
  commentairePropre,
  deposerAvis,
  lireAvisPublies,
  lireLienAvis,
  resumer,
  retirerAvis,
  signatureAvis,
  traiterAvis,
} from "../lib/avis";
import { remplacerEmetteurContrat, remplacerEmetteurFacture, traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours } from "../lib/dates-civiles";
import { fmtDateLongue } from "../lib/format";
import type { Acteur } from "../lib/gestion/journal";
import { empreinte as empreinteJeton } from "../lib/gestion/secrets";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { remplacerPrestataire } from "../lib/stripe";
import { aParis, coordonnees, MessagerieSimulee, PrestataireSimule, reserver, samediDans } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "avis@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const SERVEUR = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const ACTEUR: Acteur = { appareilId: "00000000-0000-0000-0000-0000000000dd", description: "Firefox sur Windows", ip: "192.0.2.92" };
const db = getDb();
const CAMILLE = coordonnees(EMAIL_ESSAI, "Camille", "Durand");
const COMPTE_HTTP = "avis-http@example.invalid";

async function jetonDe(id: string): Promise<string> {
  return ((await db.execute(sql`select jeton_suivi as j from reservations where id = ${id}::uuid`)).rows[0] as { j: string }).j;
}

async function invitations(id: string): Promise<number> {
  const r = await db.execute(sql`select count(*)::int as n from courriels where reservation_id = ${id}::uuid and objet = 'avis_invitation'`);
  return (r.rows[0] as { n: number }).n;
}

async function envoyer(m: MessagerieSimulee): Promise<Message[]> {
  await db.execute(sql`update courriels set prochain_essai_at = now()
                        where statut = 'a_envoyer' and destinataire in (${EMAIL_ESSAI}, ${PROPRIETAIRES})`);
  await traiterCourriels(ORIGINE, 200);
  return m.vider();
}

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from avis where reservation_id in (${ids})`);
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
  const compte = sql`select id from comptes_gestion where courriel = ${COMPTE_HTTP}`;
  await db.execute(sql`delete from sessions_gestion where compte_id in (${compte})`);
  await db.execute(sql`delete from appareils_gestion where compte_id in (${compte})`);
  await db.execute(sql`delete from comptes_gestion where courriel = ${COMPTE_HTTP}`);
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

  console.log("--- 0. signature, moyenne, commentaire");
  noter(signatureAvis("Camille", "Durand") === "Camille D.", "« Camille D. »", signatureAvis("Camille", "Durand"));
  noter(signatureAvis("  Jean-Pierre  ", "de La Tour") === "Jean-Pierre D.", "particule : « Jean-Pierre D. »", signatureAvis("  Jean-Pierre  ", "de La Tour"));
  noter(signatureAvis("Élodie", "élan") === "Élodie É.", "initiale accentuée en capitale", signatureAvis("Élodie", "élan"));
  noter(signatureAvis(null, "Durand") === "D." && signatureAvis("Camille", null) === "Camille" && signatureAvis(null, null) === "Client", "prénom ou nom absents");
  noter(resumer([4, 5, 5]).moyenneCentiemes === 470 && resumer([4, 4, 5]).moyenneCentiemes === 430, "4, 5, 5 → 4,7 ; 4, 4, 5 → 4,3 (au dixième)");
  noter(resumer([]).moyenneCentiemes === null && resumer([]).nombre === 0 && resumer([5]).moyenneCentiemes === 500, "sans avis : pas de moyenne ; un 5 → 5");
  noter(commentairePropre("  Très bien.\r\n\r\n\r\n\r\nMerci\u0007 ") === "Très bien.\n\nMerci" && commentairePropre(" \n ") === null, "commentaire : lignes vides resserrées, caractère de contrôle retiré, vide → absent");

  console.log("--- 1. l'invitation (Camille, L'Armu)");
  const a = await reserver(p, CAMILLE, "armu", samediDans(10), "cheque");
  await envoyer(m);
  const A = a.devis.arrivee;
  const D = a.devis.depart;
  const jeton = await jetonDe(a.id);
  await traiterAvis(aParis(D, "23:45"));
  noter((await invitations(a.id)) === 0, "le jour du départ : pas d'invitation");
  await traiterAvis(aParis(ajouterJours(D, 1), "00:15"));
  await traiterAvis(aParis(ajouterJours(D, 1), "08:00"));
  noter((await invitations(a.id)) === 1, "le lendemain : une invitation, une seule", await invitations(a.id));
  const [invit] = (await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI);
  noter(invit?.sujet === "Votre avis sur L'Armu", "sujet : « Votre avis sur L'Armu »", invit?.sujet);
  noter(
    !!invit &&
      invit.texte.includes(`${ORIGINE}/avis/${jeton}`) &&
      invit.texte.includes("signé « Camille D. »") &&
      invit.texte.includes(`valable jusqu'au ${fmtDateLongue(ajouterJours(D, 30))}`) &&
      invit.texte.includes("Bonjour Camille,"),
    "texte : lien personnel, signature, fin de validité",
    invit?.texte,
  );

  console.log("--- 2. le lien");
  noter((await lireLienAvis(jeton, ajouterJours(D, -1))).etat === "invalide", "la veille du départ : fermé");
  const ouvert = await lireLienAvis(jeton, D);
  noter(ouvert.etat === "ouvert" && ouvert.gite === "L'Armu" && ouvert.signature === "Camille D." && ouvert.finValidite === ajouterJours(D, 30), "le jour du départ : ouvert", ouvert);
  noter((await lireLienAvis(jeton, ajouterJours(D, 30))).etat === "ouvert", "D + 30 : ouvert");
  noter((await lireLienAvis(jeton, ajouterJours(D, 31))).etat === "invalide", "D + 31 : fermé");
  noter((await lireLienAvis("zz", D)).etat === "invalide" && (await lireLienAvis(randomBytes(32).toString("hex"), D)).etat === "invalide", "jeton mal formé ou inconnu : fermé");

  console.log("--- 3. le dépôt");
  const jour = aParis(ajouterJours(D, 1), "10:00");
  const refus = async (s: { note: unknown; commentaire: unknown }) => (await deposerAvis(jeton, s, jour)).issue;
  noter((await refus({ note: 0, commentaire: "" })) === "refus" && (await refus({ note: 6, commentaire: "" })) === "refus", "notes 0 et 6 : refusées");
  noter((await refus({ note: 4.5, commentaire: "" })) === "refus" && (await refus({ note: "5", commentaire: "" })) === "refus", "note 4,5 ou en texte : refusée");
  noter((await refus({ note: 5, commentaire: "a".repeat(2001) })) === "refus" && (await refus({ note: 5, commentaire: 12 })) === "refus", "commentaire de 2 001 caractères ou non textuel : refusé");
  noter((await deposerAvis(jeton, { note: 5, commentaire: "" }, aParis(ajouterJours(D, -1), "10:00"))).issue === "invalide", "avant le départ : refusé");
  // Une invitation inscrite avant le dépôt ne part pas après (Camille a déposé entre-temps).
  await db.execute(sql`update courriels set statut = 'a_envoyer', envoye_at = null, voie = null where reservation_id = ${a.id}::uuid and objet = 'avis_invitation'`);
  const depot = await deposerAvis(jeton, { note: 4, commentaire: "Très bien.\r\n\r\n\r\nMerci" }, jour);
  noter(depot.issue === "publie" && depot.issue === "publie" && depot.slug === "armu", "publié", depot);
  const ligne = (await db.execute(sql`select note, commentaire, signature, langue, date_sejour::text as sejour, retire_at from avis where reservation_id = ${a.id}::uuid`)).rows[0] as Record<string, unknown>;
  noter(
    ligne?.note === 4 && ligne.commentaire === "Très bien.\n\nMerci" && ligne.signature === "Camille D." && ligne.langue === "fr" && ligne.sejour === A && ligne.retire_at === null,
    "l'avis : note, commentaire nettoyé, signature, langue, date du séjour",
    ligne,
  );
  noter((await deposerAvis(jeton, { note: 5, commentaire: "" }, jour)).issue === "deja", "second dépôt : « déjà »");
  noter((await lireLienAvis(jeton, ajouterJours(D, 2))).etat === "depose", "le lien dit maintenant « déjà déposé »");
  const apresDepot = await envoyer(m);
  const alerte = apresDepot.find((x) => x.destinataire === PROPRIETAIRES);
  noter(
    alerte?.sujet === "Nouvel avis 4/5 — Camille DURAND — L'Armu" && alerte.texte.includes("Commentaire : « Très bien.") && alerte.texte.includes(`${ORIGINE}/gestion/avis`),
    "alerte aux propriétaires : note, commentaire, lien vers la gestion",
    alerte?.sujet,
  );
  noter(!apresDepot.some((x) => x.destinataire === EMAIL_ESSAI), "l'invitation restée en attente n'est pas partie");
  const abandon = (await db.execute(sql`select statut, derniere_erreur from courriels where reservation_id = ${a.id}::uuid and objet = 'avis_invitation'`)).rows[0] as Record<string, unknown>;
  noter(abandon?.derniere_erreur === "avis déjà déposé", "… abandonnée : « avis déjà déposé »", abandon);

  console.log("--- 4. ce que montre le site");
  const giteArmu = ((await db.execute(sql`select id from gites where slug = 'armu'`)).rows[0] as { id: string }).id;
  const publies = (await lireAvisPublies()).get(giteArmu) ?? [];
  const publie = publies.find((x) => x.signature === "Camille D." && x.dateSejour === A);
  noter(!!publie && publie.note === 4 && publie.publieLe === ajouterJours(D, 1), "l'avis est publié, daté du jour du dépôt", publie);

  console.log("--- 5. passage manqué, délai réglé");
  const b = await reserver(p, CAMILLE, "laphine", samediDans(13), "cheque");
  await envoyer(m);
  const Db = b.devis.depart;
  await traiterAvis(aParis(ajouterJours(Db, 31), "09:00"));
  noter((await invitations(b.id)) === 0, "à D + 31 : trop tard, pas d'invitation");
  await traiterAvis(aParis(ajouterJours(Db, 30), "09:00"));
  noter((await invitations(b.id)) === 1, "à D + 30 : rattrapée");
  await db.execute(sql`update reglages set avis_courriel_jours = 3 where id = 1`);
  const c = await reserver(p, CAMILLE, "maison-vieille", samediDans(16), "cheque");
  await envoyer(m);
  const Dc = c.devis.depart;
  await traiterAvis(aParis(ajouterJours(Dc, 2), "09:00"));
  const avant3 = await invitations(c.id);
  await traiterAvis(aParis(ajouterJours(Dc, 3), "09:00"));
  noter(avant3 === 0 && (await invitations(c.id)) === 1, "délai réglé à 3 jours : rien à D + 2, l'invitation à D + 3");
  await db.execute(sql`update reglages set avis_courriel_jours = 1 where id = 1`);
  await envoyer(m);

  console.log("--- 6. client anglais");
  const e = await reserver(p, CAMILLE, "laphine", samediDans(19), "cheque", "en");
  await envoyer(m);
  const jetonEn = await jetonDe(e.id);
  await traiterAvis(aParis(ajouterJours(e.devis.depart, 1), "09:00"));
  const [invitEn] = (await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    invitEn?.sujet === "Your review of LaPhine" && invitEn.texte.includes(`${ORIGINE}/en/avis/${jetonEn}`) && invitEn.texte.includes("signed “Camille D.”"),
    "invitation en anglais, lien /en/avis/",
    invitEn?.sujet,
  );

  console.log("--- 7. séjour annulé");
  const f = await reserver(p, CAMILLE, "armu", samediDans(22), "cheque");
  await envoyer(m);
  await db.execute(sql`update reservations set statut = 'annulee' where id = ${f.id}::uuid`);
  await traiterAvis(aParis(ajouterJours(f.devis.depart, 1), "09:00"));
  noter((await invitations(f.id)) === 0, "pas d'invitation");
  noter((await lireLienAvis(await jetonDe(f.id), ajouterJours(f.devis.depart, 1))).etat === "invalide", "lien fermé");

  console.log("--- 8. le retrait");
  const idAvis = ((await db.execute(sql`select id from avis where reservation_id = ${a.id}::uuid`)).rows[0] as { id: string }).id;
  noter((await retirerAvis(idAvis, "mauvaise_note", ACTEUR, null)).etape === "refus", "motif inconnu : refusé");
  const plan = await retirerAvis(idAvis, "injurieux", ACTEUR, null);
  noter(
    plan.etape === "plan" &&
      plan.lignes[0] === `Avis signé Camille D., 4/5, publié le ${fmtDateLongue(ajouterJours(D, 1))}.` &&
      plan.lignes[1] === "Motif : propos injurieux, diffamatoires ou discriminatoires." &&
      plan.lignes[2].includes("C'est définitif"),
    "récapitulatif : l'avis, le motif, définitif",
    plan,
  );
  noter((await lireAvisPublies()).get(giteArmu)?.some((x) => x.id === idAvis) === true, "rien de retiré avant la confirmation");
  const perime = await retirerAvis(idAvis, "injurieux", ACTEUR, "0".repeat(32));
  noter(perime.etape === "plan" && !!perime.message, "empreinte périmée : le récapitulatif revient", perime);
  const fait = plan.etape === "plan" ? await retirerAvis(idAvis, "injurieux", ACTEUR, plan.empreinte) : null;
  noter(fait?.etape === "fait", "retiré", fait);
  noter(!((await lireAvisPublies()).get(giteArmu) ?? []).some((x) => x.id === idAvis), "le site ne le montre plus");
  const journal = (await db.execute(sql`select acteur, details->>'motif' as motif from audit_logs where table_cible = 'avis' and ligne_id = ${idAvis} order by created_at desc limit 1`)).rows[0] as Record<string, unknown>;
  noter(journal?.acteur === "gestion (Firefox sur Windows)" && journal.motif === "injurieux", "journal : qui, quel motif", journal);
  const [retrait] = (await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    retrait?.sujet === "Votre avis sur L'Armu a été retiré" &&
      retrait.texte.includes(`Votre avis du ${fmtDateLongue(ajouterJours(D, 1))} sur L'Armu a été retiré du site, pour le motif suivant : propos injurieux, diffamatoires ou discriminatoires.`) &&
      retrait.texte.includes(`${ORIGINE}/legal/avis`),
    "courriel au client : le motif, la politique des avis",
    retrait?.texte,
  );
  noter((await retirerAvis(idAvis, "hors_sujet", ACTEUR, null)).etape === "refus", "second retrait : refusé");
  const depotEn = await deposerAvis(jetonEn, { note: 5, commentaire: null }, aParis(ajouterJours(e.devis.depart, 2), "10:00"));
  const idEn = ((await db.execute(sql`select id from avis where reservation_id = ${e.id}::uuid`)).rows[0] as { id: string }).id;
  const planEn = await retirerAvis(idEn, "demande_auteur", ACTEUR, null);
  if (planEn.etape === "plan") await retirerAvis(idEn, "demande_auteur", ACTEUR, planEn.empreinte);
  const [retraitEn] = (await envoyer(m)).filter((x) => x.destinataire === EMAIL_ESSAI);
  noter(
    depotEn.issue === "publie" && retraitEn?.sujet === "Your review of LaPhine has been removed" && retraitEn.texte.includes("has been removed from our website, at your request."),
    "à la demande de son auteur, en anglais",
    retraitEn?.texte,
  );

  console.log("--- 9. l'effacement après 3 ans");
  const idB = (await deposerAvis(await jetonDe(b.id), { note: 3, commentaire: null }, aParis(ajouterJours(b.devis.depart, 5), "10:00"))).issue;
  const maintenant = new Date();
  await db.execute(sql`update avis set created_at = ${maintenant.toISOString()}::timestamptz - interval '3 years' + interval '1 day' where reservation_id = ${b.id}::uuid`);
  await db.execute(sql`update avis set created_at = ${maintenant.toISOString()}::timestamptz - interval '3 years' - interval '1 day' where reservation_id = ${a.id}::uuid`);
  const bilan = await traiterAvis(maintenant);
  const restants = (await db.execute(sql`select reservation_id::text as r from avis where reservation_id in (${a.id}::uuid, ${b.id}::uuid)`)).rows as { r: string }[];
  noter(idB === "publie" && bilan.effaces === 1 && restants.length === 1 && restants[0].r === b.id, "3 ans et un jour : effacé ; un jour de moins : gardé", { bilan, restants });

  if (process.argv.includes("--http")) await partieHttp(p, m);
}

// ─── 10. Par le serveur ──────────────────────────────────────────────────────

async function partieHttp(p: PrestataireSimule, m: MessagerieSimulee): Promise<void> {
  console.log(`--- 10. par le serveur (${SERVEUR})`);
  // Un séjour fini hier : le lien est ouvert aujourd'hui, pour de vrai.
  const g = await reserver(p, CAMILLE, "armu", samediDans(25), "cheque");
  await envoyer(m);
  const nuits = (await db.execute(sql`select date_arrivee::text as a, date_depart::text as d from reservations where id = ${g.id}::uuid`)).rows[0] as { a: string; d: string };
  const decalage = Math.round((Date.parse(nuits.d) - Date.now()) / 86_400_000) + 1;
  await db.execute(sql`update reservations set date_arrivee = date_arrivee - ${decalage}::int, date_depart = date_depart - ${decalage}::int where id = ${g.id}::uuid`);
  await db.execute(sql`delete from disponibilites where reservation_id = ${g.id}::uuid`);
  const jeton = await jetonDe(g.id);

  const page = await fetch(`${SERVEUR}/avis/${jeton}`);
  const html = await page.text();
  noter(page.status === 200 && html.includes("Votre avis sur") && html.includes("Camille D.") && html.includes("noindex"), "la page de l'avis s'ouvre, signée, non indexée", page.status);
  const inconnu = await fetch(`${SERVEUR}/avis/${randomBytes(32).toString("hex")}`);
  noter((await inconnu.text()).includes("Ce lien n'est pas valable ou a expiré."), "jeton inconnu : « lien non valable »");
  const poster = (corps: unknown) => fetch(`${SERVEUR}/api/avis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  noter((await poster({ jeton: randomBytes(32).toString("hex"), note: 5 })).status === 404, "POST, jeton inconnu : 404");
  noter((await poster({ jeton, note: 7 })).status === 400, "POST, note 7 : 400");
  const ok = await poster({ jeton, note: 5, commentaire: "Vue superbe, accueil parfait." });
  noter(ok.status === 200 && ((await ok.json()) as { slug?: string }).slug === "armu", "POST valable : 200, publié", ok.status);
  noter((await poster({ jeton, note: 4 })).status === 409, "POST répété : 409");
  noter((await (await fetch(`${SERVEUR}/avis/${jeton}`)).text()).includes("Vous avez déjà donné votre avis sur ce séjour."), "la page dit « déjà donné »");
  const fiche = await (await fetch(`${SERVEUR}/gites/armu`)).text();
  noter(fiche.includes("Vue superbe, accueil parfait.") && fiche.includes("Avis vérifiés") && fiche.includes("/legal/avis"), "la fiche de L'Armu montre l'avis, le contrôle et la politique");
  const politique = await fetch(`${SERVEUR}/legal/avis`);
  noter(politique.status === 200 && (await politique.text()).includes("Les seuls motifs de retrait"), "la politique des avis s'affiche");
  const robots = await (await fetch(`${SERVEUR}/robots.txt`)).text();
  noter(robots.includes("Disallow: /avis/") && robots.includes("Disallow: /en/avis/"), "robots.txt écarte les pages d'avis");

  // Le back-office.
  const sans = await fetch(`${SERVEUR}/gestion/avis`, { redirect: "manual" });
  noter(sans.status === 307 || sans.status === 303, "/gestion/avis sans session : renvoi à la connexion", sans.status);
  const secret = `essai-avis-${Date.now()}`;
  const [compte] = (await db.execute(sql`insert into comptes_gestion (courriel) values (${COMPTE_HTTP}) returning id`)).rows as { id: string }[];
  const [appareil] = (await db.execute(sql`insert into appareils_gestion (compte_id, empreinte_jeton, description) values (${compte.id}::uuid, ${empreinteJeton(`app-${secret}`)}, 'Essai') returning id`)).rows as { id: string }[];
  await db.execute(sql`insert into sessions_gestion (compte_id, appareil_id, empreinte_jeton) values (${compte.id}::uuid, ${appareil.id}::uuid, ${empreinteJeton(secret)})`);
  const cookie = { cookie: `gestion_session=${secret}` };
  const gestion = await fetch(`${SERVEUR}/gestion/avis`, { headers: cookie });
  const htmlGestion = await gestion.text();
  noter(
    gestion.status === 200 && htmlGestion.includes("Vue superbe, accueil parfait.") && htmlGestion.includes("Retirer cet avis") && htmlGestion.includes("données personnelles"),
    "/gestion/avis : l'avis, le bouton de retrait, les motifs",
    gestion.status,
  );
  const fiches = await (await fetch(`${SERVEUR}/gestion/gites`, { headers: cookie })).text();
  noter(fiches.includes("Chiffres Gîtes de France affichés sur le site") && fiches.includes("gdf_lien"), "/gestion/gites : les chiffres Gîtes de France");
  const reglagesPage = await (await fetch(`${SERVEUR}/gestion/reglages`, { headers: cookie })).text();
  noter(reglagesPage.includes("Avis de vos clients") && reglagesPage.includes("Nouvel avis"), "/gestion/reglages : les délais des avis, l'alerte « Nouvel avis »");
  await envoyer(m);
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations et des avis, et modifie les réglages.');
  }
  const avant = (await db.execute(sql`select avis_courriel_jours as c from reglages where id = 1`)).rows[0] as { c: number };
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  await nettoyer();
  try {
    await controles();
  } finally {
    await nettoyer();
    await db.execute(sql`update reglages set avis_courriel_jours = ${avant.c} where id = 1`);
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
