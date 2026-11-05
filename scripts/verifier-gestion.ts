// Contrôle de la CONNEXION AU BACK-OFFICE et de l'ÉCRAN DES RÉGLAGES
// (Phase 5, lot 1, D-32), sur la base de TEST, courriels simulés.
//
//   1. les secrets : empreinte du mot de passe, code, description d'appareil ;
//   2. la commande de création du compte : lien envoyé, aucun jeton en clair ;
//   3. le mot de passe choisi par le lien : trop court, différent, lien usé ;
//   4. la connexion : mot de passe faux, appareil inconnu → code par courriel,
//      bon et mauvais code, appareil reconnu → session sans code ;
//   5. la reconnaissance glissante de 30 jours, l'inactivité de 8 heures ;
//   6. les échecs par adresse IP (5 puis 15 minutes), les essais du code ;
//   7. retirer un appareil, changer le mot de passe (tout est déconnecté),
//      « mot de passe oublié » ;
//   8. les réglages : bornes, champs liés, IBAN, journal avant/après, alerte
//      « compte de virement modifié », conditions du contrat intouchables ;
//   9. les destinataires des alertes ;
//  10. (--http, serveur sur 3001) /gestion fermé sans session, jamais indexé,
//      pages réglages et appareils ouvertes avec une session.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Le compte d'essai et
// ses traces sont effacés au début et à la fin ; les réglages et les alertes
// modifiés sont rétablis.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-gestion.ts [--http]
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import { traiterCourriels } from "../lib/courriels-envoi";
import { texteCodeGestion, texteLienGestion } from "../lib/courriels-textes";
import {
  choisirMotDePasse,
  connecter,
  creerCompte,
  demanderLien,
  lienValable,
  lireSession,
  listerAppareils,
  retirerAppareil,
  validerCode,
  type IssueConnexion,
} from "../lib/gestion/connexion";
import type { Acteur } from "../lib/gestion/journal";
import { enregistrerAlertes, enregistrerRubrique, noteEnCentiemes } from "../lib/gestion/reglages";
import {
  decrireAppareil,
  defautMotDePasse,
  empreinteMotDePasse,
  motDePasseCorrespond,
  nouveauCode,
} from "../lib/gestion/secrets";
import { remplacerMessagerie, type Message } from "../lib/messagerie";
import { MessagerieSimulee } from "./simulations";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const db = getDb();
const courrier = new MessagerieSimulee();
remplacerMessagerie(courrier);

const ADRESSE = "gestion@example.invalid";
const ORIGINE = process.env.PARCOURS_BASE_URL ?? "http://localhost:3001";
const UA_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MOT = "le chêne de Samoyas a cent ans";
const NOUVEAU_MOT = "trois gîtes et un spa au soleil";
const IP = (n: number) => `192.0.2.${n}`;
const debut = new Date();

function jetonDuLien(m: Message | undefined): string | null {
  const t = m?.texte.match(/\/gestion\/mot-de-passe\?jeton=([A-Za-z0-9_%-]+)/);
  return t ? decodeURIComponent(t[1]) : null;
}

function codeDu(m: Message | undefined): string | null {
  return m?.texte.match(/Votre code : (\d{6})/)?.[1] ?? null;
}

async function compte(): Promise<{ id: string; empreinte: string | null }> {
  const r = await db.execute(sql`select id, empreinte_mot_de_passe as empreinte from comptes_gestion where courriel = ${ADRESSE}`);
  return r.rows[0] as { id: string; empreinte: string | null };
}

async function trace(action: string): Promise<Record<string, unknown> | null> {
  const r = await db.execute(sql`
    select acteur, details from audit_logs where action = ${action} and created_at >= ${debut.toISOString()}::timestamptz
     order by created_at desc limit 1`);
  return (r.rows[0] as Record<string, unknown> | undefined) ?? null;
}

async function nettoyer(): Promise<void> {
  await db.execute(sql`delete from comptes_gestion where courriel = ${ADRESSE}`);
  await db.execute(sql`delete from essais_gestion where ip like '192.0.2.%'`);
  await db.execute(sql`delete from courriels where cle like 'alerte_probleme:virement_compte_modifie:%'`);
}

/** Session ouverte depuis un appareil inconnu : mot de passe, puis code. */
async function sessionNeuve(ip: string, ua = UA_WINDOWS): Promise<{ jetonSession: string; jetonAppareil: string }> {
  courrier.vider();
  const r = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip, userAgent: ua });
  if (r.issue !== "code") throw new Error(`connexion attendue en « code », obtenu ${r.issue}`);
  const v = await validerCode({ jetonAttente: r.jetonAttente, code: codeDu(courrier.vider()[0]) ?? "", ip, userAgent: ua });
  if (v.issue !== "session") throw new Error(`code refusé : ${v.issue}`);
  return v;
}

async function partieSecrets(): Promise<void> {
  console.log("\n— 1. Secrets");
  const e = await empreinteMotDePasse(MOT);
  noter(e.startsWith("scrypt$131072$8$1$") && !e.includes(MOT), "empreinte scrypt, coût écrit, pas de mot de passe en clair");
  noter(await motDePasseCorrespond(MOT, e), "le bon mot de passe correspond");
  noter(!(await motDePasseCorrespond(`${MOT}.`, e)), "un mot de passe voisin ne correspond pas");
  noter((await empreinteMotDePasse(MOT)) !== e, "deux empreintes du même mot de passe diffèrent (sel)");
  noter(!(await motDePasseCorrespond(MOT, "scrypt$abc")), "une empreinte illisible ne correspond à rien");
  noter(defautMotDePasse("court") === "court" && defautMotDePasse(" espace devant ok") === "espace" && defautMotDePasse(MOT) === null, "règles du mot de passe : 12 caractères, pas d'espace au bord");
  noter(Array.from({ length: 50 }, nouveauCode).every((c) => /^\d{6}$/.test(c)), "codes : toujours 6 chiffres");
  noter(
    decrireAppareil(UA_WINDOWS) === "Chrome sur Windows" &&
      decrireAppareil(UA_IPHONE) === "Safari sur iPhone" &&
      decrireAppareil("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0") === "Firefox sur Linux" &&
      decrireAppareil(`${UA_WINDOWS} Edg/130.0`) === "Edge sur Windows" &&
      decrireAppareil(null) === "Navigateur inconnu",
    "description des appareils",
  );
}

async function partieCompte(): Promise<void> {
  console.log("\n— 2. Création du compte");
  courrier.vider();
  const r = await creerCompte(`  ${ADRESSE.toUpperCase()} `, ORIGINE);
  const m = courrier.vider();
  noter(r.cree && r.parti && m.length === 1 && m[0].destinataire === ADRESSE, "compte créé (adresse en minuscules), un courriel au compte", { r, n: m.length });
  noter(m[0]?.sujet === "Choisir le mot de passe — gestion des Gîtes de Samoyas", "sujet du lien", m[0]?.sujet);
  noter(
    Boolean(m[0]?.texte.includes("Il est valable 1 heure et ne sert qu'une fois.")) &&
      Boolean(m[0]?.texte.includes("ignorez ce courriel.")) &&
      !m[0]?.texte.includes("mot de passe actuel"),
    "texte du premier lien (aucun mot de passe actuel)",
  );
  const jeton = jetonDuLien(m[0]);
  const c = await compte();
  noter(c.empreinte === null, "pas de mot de passe avant le lien");
  const enClair = await db.execute(sql`select count(*)::int as n from liens_gestion where empreinte_jeton = ${jeton ?? ""}`);
  noter(Boolean(jeton) && (enClair.rows[0] as { n: number }).n === 0 && (await lienValable(jeton)), "lien valable, la base n'a que son empreinte");
  noter((await trace("compte_cree"))?.acteur === "commande", "journal : compte créé par la commande");

  const r2 = await creerCompte(ADRESSE, ORIGINE);
  const jeton2 = jetonDuLien(courrier.vider()[0]);
  noter(!r2.cree && !(await lienValable(jeton)) && (await lienValable(jeton2)), "seconde commande : pas de second compte, l'ancien lien est annulé");

  console.log("\n— 3. Choisir le mot de passe");
  const v = { ip: IP(1), userAgent: UA_WINDOWS };
  noter((await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ...v })).issue === "refus", "connexion refusée tant que le mot de passe n'est pas choisi");
  await db.execute(sql`delete from essais_gestion where ip like '192.0.2.%'`);
  const court = await choisirMotDePasse({ jeton: jeton2, motDePasse: "trop court", confirmation: "trop court", ...v });
  noter(court.issue === "invalide" && court.refus === "court", "mot de passe trop court refusé", court);
  const diff = await choisirMotDePasse({ jeton: jeton2, motDePasse: MOT, confirmation: `${MOT}!`, ...v });
  noter(diff.issue === "invalide" && diff.refus === "different", "confirmation différente refusée", diff);
  noter((await choisirMotDePasse({ jeton: jeton2, motDePasse: MOT, confirmation: MOT, ...v })).issue === "fait", "mot de passe enregistré");
  noter((await choisirMotDePasse({ jeton: jeton2, motDePasse: MOT, confirmation: MOT, ...v })).issue === "expire", "le lien ne sert qu'une fois");
  const c2 = await compte();
  noter(Boolean(c2.empreinte?.startsWith("scrypt$")) && (await trace("mot_de_passe_change")) !== null, "empreinte en base, journal « mot de passe changé »");
}

async function partieConnexion(): Promise<{ jetonSession: string; jetonAppareil: string }> {
  console.log("\n— 4. Connexion");
  const v = { ip: IP(2), userAgent: UA_WINDOWS };
  noter((await connecter({ courriel: ADRESSE, motDePasse: "mauvais mot de passe", jetonAppareil: null, ...v })).issue === "refus", "mot de passe faux : refus");
  noter((await connecter({ courriel: "inconnu@example.invalid", motDePasse: MOT, jetonAppareil: null, ...v })).issue === "refus", "adresse inconnue : le même refus");
  const n = await db.execute(sql`select echecs from essais_gestion where ip = ${IP(2)}`);
  noter((n.rows[0] as { echecs: number } | undefined)?.echecs === 2, "deux échecs comptés pour cette adresse IP");

  courrier.vider();
  const r = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ...v });
  const m = courrier.vider();
  noter(r.issue === "code" && m.length === 1, "appareil inconnu : un code part par courriel", r.issue);
  const code = codeDu(m[0]);
  noter(m[0]?.sujet === "Code de connexion — gestion des Gîtes de Samoyas", "sujet du code", m[0]?.sujet);
  noter(
    Boolean(code) &&
      Boolean(m[0]?.texte.includes("Il est valable 10 minutes.")) &&
      Boolean(m[0]?.texte.includes("depuis un appareil inconnu (Chrome sur Windows).")) &&
      Boolean(m[0]?.texte.includes("changez le mot de passe : quelqu'un le connaît.")),
    "texte du code : durée, appareil, consigne",
  );
  const echecsApres = await db.execute(sql`select count(*)::int as n from essais_gestion where ip = ${IP(2)}`);
  noter((echecsApres.rows[0] as { n: number }).n === 0, "le bon mot de passe efface les échecs de l'adresse");
  const enClair = await db.execute(sql`select count(*)::int as n from codes_gestion where empreinte_code = ${code ?? ""}`);
  noter((enClair.rows[0] as { n: number }).n === 0, "le code n'est pas en clair dans la base");
  if (r.issue !== "code" || !code) throw new Error("impossible de poursuivre sans code");

  const faux = code === "000000" ? "111111" : "000000";
  const mauvais = await validerCode({ jetonAttente: r.jetonAttente, code: faux, ...v });
  noter(mauvais.issue === "refus" && mauvais.restants === 4, "mauvais code : refus, 4 essais restants", mauvais);
  noter((await validerCode({ jetonAttente: "autre-navigateur", code, ...v })).issue === "expire", "le bon code depuis un autre navigateur ne sert à rien");
  const bon = await validerCode({ jetonAttente: r.jetonAttente, code: `${code.slice(0, 3)} ${code.slice(3)}`, ...v });
  noter(bon.issue === "session", "bon code (avec une espace au milieu) : session ouverte", bon.issue);
  if (bon.issue !== "session") throw new Error("session attendue");
  noter((await validerCode({ jetonAttente: r.jetonAttente, code, ...v })).issue === "expire", "le code ne sert qu'une fois");
  const t = await trace("nouvel_appareil");
  noter(t?.acteur === "gestion (Chrome sur Windows)" && (t.details as { ip?: string }).ip === IP(2), "journal : nouvel appareil, avec son adresse IP", t);

  const s = await lireSession(bon.jetonSession);
  noter(s?.courriel === ADRESSE && s.appareil === "Chrome sur Windows", "la session se lit, avec son appareil", s);
  noter((await lireSession("jeton-inconnu")) === null && (await lireSession(null)) === null, "un jeton inconnu n'ouvre rien");

  courrier.vider();
  const reconnu = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: bon.jetonAppareil, ...v });
  noter(reconnu.issue === "session" && courrier.vider().length === 0, "appareil reconnu : session sans code, aucun courriel", reconnu.issue);
  return bon;
}

async function partieDurees(appareil: { jetonSession: string; jetonAppareil: string }): Promise<void> {
  console.log("\n— 5. Reconnaissance de 30 jours, inactivité de 8 heures");
  const v = { ip: IP(3), userAgent: UA_WINDOWS };
  const vieillirAppareil = (jours: number) =>
    db.execute(sql`update appareils_gestion set derniere_connexion_at = now() - make_interval(days => ${jours})
                    where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  await vieillirAppareil(29);
  const r29 = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: appareil.jetonAppareil, ...v });
  const frais = await db.execute(sql`select bool_and(derniere_connexion_at > now() - interval '1 minute') as frais from appareils_gestion
                                      where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  noter(r29.issue === "session" && (frais.rows[0] as { frais: boolean }).frais, "dernière connexion il y a 29 jours : pas de code, et les 30 jours repartent", r29.issue);

  // Même si le dernier CODE date de plus de 30 jours : seule compte la dernière connexion.
  await db.execute(sql`update codes_gestion set created_at = now() - interval '200 days'
                        where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  await db.execute(sql`update appareils_gestion set created_at = now() - interval '200 days'
                        where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  noter(
    (await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: appareil.jetonAppareil, ...v })).issue === "session",
    "appareil reconnu depuis 200 jours, connecté souvent : toujours pas de code",
  );

  await vieillirAppareil(31);
  courrier.vider();
  const r31 = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: appareil.jetonAppareil, ...v });
  noter(r31.issue === "code" && courrier.vider().length === 1, "aucune connexion depuis 31 jours : appareil oublié, code redemandé", r31.issue);
  const restant = await db.execute(sql`select count(*)::int as n from appareils_gestion
                                        where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  noter((restant.rows[0] as { n: number }).n === 0, "l'appareil oublié est effacé (et ses sessions avec lui)");

  const neuf = await sessionNeuve(IP(3));
  const vieillirSession = (heures: number) =>
    db.execute(sql`update sessions_gestion set derniere_activite_at = now() - make_interval(hours => ${heures})
                    where appareil_id in (select id from appareils_gestion where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE}))`);
  await vieillirSession(7);
  const s7 = await lireSession(neuf.jetonSession);
  const relance = await db.execute(sql`select bool_and(derniere_activite_at > now() - interval '1 minute') as ok from sessions_gestion
                                        where appareil_id in (select id from appareils_gestion where compte_id = (select id from comptes_gestion where courriel = ${ADRESSE}))`);
  noter(s7 !== null && (relance.rows[0] as { ok: boolean }).ok, "7 heures sans activité : la session tient, et repart");
  await vieillirSession(9);
  noter((await lireSession(neuf.jetonSession)) === null, "9 heures sans activité : session fermée");
  courrier.vider();
  noter(
    (await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: neuf.jetonAppareil, ...v })).issue === "session" && courrier.vider().length === 0,
    "après l'inactivité : mot de passe seul, sans code",
  );
}

async function partieEchecs(): Promise<void> {
  console.log("\n— 6. Échecs par adresse IP et essais du code");
  const faux = { courriel: ADRESSE, motDePasse: "pas le bon mot de passe", jetonAppareil: null, userAgent: UA_WINDOWS };
  const issues: IssueConnexion["issue"][] = [];
  for (let i = 0; i < 5; i += 1) issues.push((await connecter({ ...faux, ip: IP(10) })).issue);
  noter(issues.slice(0, 4).every((x) => x === "refus") && issues[4] === "attente", "5e échec : attente", issues);
  const bloque = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip: IP(10), userAgent: UA_WINDOWS });
  noter(bloque.issue === "attente", "pendant l'attente, même le bon mot de passe est refusé");
  if (bloque.issue === "attente") {
    const minutes = (bloque.jusqua.getTime() - Date.now()) / 60_000;
    noter(minutes > 14 && minutes <= 15.1, "l'attente dure 15 minutes", minutes);
  }
  noter((await trace("adresse_bloquee")) !== null, "journal : adresse bloquée");
  const ailleurs = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip: IP(11), userAgent: UA_WINDOWS });
  noter(ailleurs.issue === "code", "depuis une autre adresse, le compte n'est pas bloqué", ailleurs.issue);
  await db.execute(sql`update essais_gestion set bloque_jusqu_a = now() - interval '1 second' where ip = ${IP(10)}`);
  noter((await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip: IP(10), userAgent: UA_WINDOWS })).issue === "code", "l'attente finie, la connexion reprend");

  courrier.vider();
  const r = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip: IP(12), userAgent: UA_WINDOWS });
  const code = codeDu(courrier.vider()[0]);
  if (r.issue !== "code" || !code) throw new Error("code attendu");
  const faux6 = code === "000000" ? "111111" : "000000";
  const suite: string[] = [];
  // Une adresse IP par essai : on contrôle le compteur du CODE, pas celui de l'adresse.
  for (let i = 0; i < 5; i += 1) suite.push((await validerCode({ jetonAttente: r.jetonAttente, code: faux6, ip: IP(20 + i), userAgent: UA_WINDOWS })).issue);
  noter(suite.slice(0, 4).every((x) => x === "refus") && suite[4] === "expire", "5 mauvais codes : le code est perdu", suite);
  noter((await validerCode({ jetonAttente: r.jetonAttente, code, ip: IP(30), userAgent: UA_WINDOWS })).issue === "expire", "même le bon code ne sert plus");

  courrier.vider();
  const r2 = await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: null, ip: IP(13), userAgent: UA_WINDOWS });
  const code2 = codeDu(courrier.vider()[0]);
  if (r2.issue !== "code" || !code2) throw new Error("code attendu");
  await db.execute(sql`update codes_gestion set expire_at = now() - interval '1 second' where utilise_at is null
                        and compte_id = (select id from comptes_gestion where courriel = ${ADRESSE})`);
  noter((await validerCode({ jetonAttente: r2.jetonAttente, code: code2, ip: IP(13), userAgent: UA_WINDOWS })).issue === "expire", "code de plus de 10 minutes : refusé");
}

async function partieAppareils(): Promise<void> {
  console.log("\n— 7. Appareils, changement de mot de passe, mot de passe oublié");
  const pc = await sessionNeuve(IP(40));
  const tel = await sessionNeuve(IP(41), UA_IPHONE);
  const sPc = await lireSession(pc.jetonSession);
  if (!sPc) throw new Error("session attendue");
  const liste = await listerAppareils(sPc.compteId);
  noter(liste.some((a) => a.description === "Safari sur iPhone") && liste.some((a) => a.description === "Chrome sur Windows"), "la liste montre l'ordinateur et le téléphone");
  const idTel = (await lireSession(tel.jetonSession))?.appareilId ?? "";
  const acteur: Acteur = { appareilId: sPc.appareilId, description: sPc.appareil, ip: IP(40) };
  noter(await retirerAppareil(sPc, idTel, acteur), "retirer le téléphone");
  noter((await lireSession(tel.jetonSession)) === null && (await lireSession(pc.jetonSession)) !== null, "le téléphone est déconnecté, l'ordinateur non");
  courrier.vider();
  noter(
    (await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: tel.jetonAppareil, ip: IP(41), userAgent: UA_IPHONE })).issue === "code",
    "le téléphone retiré redemande un code",
  );
  noter((await trace("appareil_retire"))?.acteur === "gestion (Chrome sur Windows)", "journal : appareil retiré, depuis l'ordinateur");
  noter(!(await retirerAppareil({ ...sPc, compteId: "00000000-0000-0000-0000-000000000000" }, sPc.appareilId, acteur)), "on ne retire pas l'appareil d'un autre compte");

  courrier.vider();
  noter((await demanderLien({ courriel: "inconnu@example.invalid", origine: ORIGINE, ip: IP(42), userAgent: UA_WINDOWS })).issue === "fait" && courrier.vider().length === 0, "mot de passe oublié, adresse inconnue : même réponse, aucun courriel");
  noter((await demanderLien({ courriel: ADRESSE, origine: ORIGINE, ip: IP(42), userAgent: UA_WINDOWS })).issue === "fait", "mot de passe oublié, adresse du compte");
  const m = courrier.vider();
  noter(m.length === 1 && Boolean(m[0].texte.includes("le mot de passe actuel reste valable.")), "le lien part, avec « le mot de passe actuel reste valable »");
  const n = await db.execute(sql`select echecs from essais_gestion where ip = ${IP(42)}`);
  noter((n.rows[0] as { echecs: number } | undefined)?.echecs === 2, "chaque demande de lien compte pour l'adresse IP (pas de rafale)");
  noter(
    (await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: pc.jetonAppareil, ip: IP(43), userAgent: UA_WINDOWS })).issue === "session",
    "tant que le lien n'est pas utilisé, l'ancien mot de passe marche",
  );
  noter((await choisirMotDePasse({ jeton: jetonDuLien(m[0]), motDePasse: NOUVEAU_MOT, confirmation: NOUVEAU_MOT, ip: IP(43), userAgent: UA_WINDOWS })).issue === "fait", "nouveau mot de passe enregistré");
  const restants = await db.execute(sql`select (select count(*)::int from appareils_gestion a join comptes_gestion c on c.id = a.compte_id where c.courriel = ${ADRESSE}) as appareils,
                                               (select count(*)::int from sessions_gestion s join comptes_gestion c on c.id = s.compte_id where c.courriel = ${ADRESSE}) as sessions`);
  noter(
    JSON.stringify(restants.rows[0]) === JSON.stringify({ appareils: 0, sessions: 0 }) && (await lireSession(pc.jetonSession)) === null,
    "tout est déconnecté et tous les appareils sont oubliés",
    restants.rows[0],
  );
  noter((await connecter({ courriel: ADRESSE, motDePasse: MOT, jetonAppareil: pc.jetonAppareil, ip: IP(44), userAgent: UA_WINDOWS })).issue === "refus", "l'ancien mot de passe ne marche plus");
  courrier.vider();
  noter((await connecter({ courriel: ADRESSE, motDePasse: NOUVEAU_MOT, jetonAppareil: pc.jetonAppareil, ip: IP(44), userAgent: UA_WINDOWS })).issue === "code", "le nouveau marche, avec un code (appareil oublié)");
}

async function partieReglages(): Promise<void> {
  console.log("\n— 8. Réglages");
  const sauvegarde = (await db.execute(sql`select * from reglages where id = 1`)).rows[0] as Record<string, unknown>;
  const acteur: Acteur = { appareilId: "00000000-0000-0000-0000-000000000001", description: "Chrome sur Windows", ip: IP(50) };
  try {
    const h = await enregistrerRubrique("horaires", { heure_arrivee: "18:00", heure_limite_arrivee: "17:00", heure_depart: "09:00" }, acteur);
    noter(h.issue === "erreurs" && Boolean(h.erreurs.heure_limite_arrivee), "arrivée au plus tard avant l'heure d'arrivée : refusé", h);
    const c = await enregistrerRubrique("caution_carte", { caution_heure_blocage: "18:00", caution_heure_alerte: "08:00", caution_heure_liberation: "12:00" }, acteur);
    noter(c.issue === "erreurs" && Boolean(c.erreurs.caution_heure_liberation), "levée de la caution à midi : refusée (avant midi)", c);
    const t0 = await enregistrerRubrique("tunnel", { duree_blocage_minutes: "0", delai_reservation_jours: "1" }, acteur);
    noter(t0.issue === "erreurs" && Boolean(t0.erreurs.duree_blocage_minutes), "durée de blocage à 0 : refusée (entre 1 et 120)");
    const t1 = await enregistrerRubrique("tunnel", { duree_blocage_minutes: "2,5", delai_reservation_jours: "1" }, acteur);
    noter(t1.issue === "erreurs", "nombre à virgule refusé");
    const ancienne = Number(sauvegarde.duree_blocage_minutes);
    const nouvelle = ancienne === 25 ? 26 : 25;
    const t2 = await enregistrerRubrique(
      "tunnel",
      // taux_acompte n'est pas un champ de la rubrique : il est ignoré.
      { duree_blocage_minutes: String(nouvelle), delai_reservation_jours: String(sauvegarde.delai_reservation_jours), taux_acompte: "50" },
      acteur,
    );
    noter(t2.issue === "fait" && JSON.stringify(t2.changes) === '["duree_blocage_minutes"]', "durée de blocage enregistrée, seul ce réglage change", t2);
    const relu = (await db.execute(sql`select duree_blocage_minutes, taux_acompte from reglages where id = 1`)).rows[0] as Record<string, number>;
    noter(relu.duree_blocage_minutes === nouvelle && relu.taux_acompte === sauvegarde.taux_acompte, "en base : nouvelle durée, taux d'acompte intact", relu);
    const j = await trace("reglage_modifie");
    noter(
      (() => {
        const ch = (j?.details as { changements?: Record<string, { avant: unknown; apres: unknown }> })?.changements ?? {};
        return Object.keys(ch).join() === "duree_blocage_minutes" && ch.duree_blocage_minutes.avant === ancienne && ch.duree_blocage_minutes.apres === nouvelle;
      })() &&
        j?.acteur === "gestion (Chrome sur Windows)",
      "journal : valeur avant et après, appareil",
      j,
    );
    const t3 = await enregistrerRubrique("tunnel", { duree_blocage_minutes: String(nouvelle), delai_reservation_jours: String(sauvegarde.delai_reservation_jours) }, acteur);
    noter(t3.issue === "fait" && t3.changes.length === 0, "rien de changé : rien d'écrit");
    noter((await enregistrerRubrique("contrat", { taux_acompte: "50" }, acteur)).issue === "erreurs", "les conditions du contrat ne sont pas une rubrique modifiable");

    // Compte de virement.
    const vir = (titulaire: string, iban: string, bic = "") => ({ virement_titulaire: titulaire, virement_iban: iban, virement_bic: bic, virement_courriel_jours: "10" });
    const mauvais = await enregistrerRubrique("virement", vir("SARL DE LA VOUTE", "FR76 3000 6000 0112 3456 7890 188"), acteur);
    noter(mauvais.issue === "erreurs" && Boolean(mauvais.erreurs.virement_iban), "IBAN à la clé fausse : refusé");
    const seul = await enregistrerRubrique("virement", vir("SARL DE LA VOUTE", ""), acteur);
    noter(seul.issue === "erreurs" && Boolean(seul.erreurs.virement_iban), "titulaire sans IBAN : refusé");
    noter((await enregistrerRubrique("virement", vir("SARL DE LA VOUTE", "FR7630006000011234567890189", "AGRI"), acteur)).issue === "erreurs", "BIC mal formé : refusé");
    await db.execute(sql`update reglages set virement_titulaire = 'COMPTE D''ESSAI', virement_iban = 'FR7630006000011234567890189', virement_bic = null where id = 1`);
    await db.execute(sql`delete from courriels where cle like 'alerte_probleme:virement_compte_modifie:%'`);
    // IBAN d'exemple de la documentation des banques (clé valable), écrit avec espaces et minuscules.
    const ok = await enregistrerRubrique("virement", vir("SARL DE LA VOUTE", "fr14 2004 1010 0505 0001 3m02 606", "psstfrppxxx"), acteur);
    const v = (await db.execute(sql`select virement_titulaire, virement_iban, virement_bic from reglages where id = 1`)).rows[0];
    noter(
      ok.issue === "fait" && JSON.stringify(v) === JSON.stringify({ virement_titulaire: "SARL DE LA VOUTE", virement_iban: "FR1420041010050500013M02606", virement_bic: "PSSTFRPPXXX" }),
      "IBAN et BIC enregistrés sans espaces, en majuscules",
      v,
    );
    const alertes = (await db.execute(sql`select destinataire, donnees from courriels where cle like 'alerte_probleme:virement_compte_modifie:%'`)).rows as {
      destinataire: string;
      donnees: Record<string, unknown>;
    }[];
    noter(
      alertes.length >= 1 &&
        alertes.every((a) => a.donnees.genre === "virement_compte_modifie") &&
        (alertes[0].donnees.avant as { titulaire?: string })?.titulaire === "COMPTE D'ESSAI" &&
        (alertes[0].donnees.avant as { iban?: string })?.iban === "FR7630006000011234567890189",
      "alerte « compte de virement modifié » inscrite, avec l'ancien compte",
      alertes,
    );
    courrier.vider();
    await traiterCourriels(ORIGINE, 50);
    const m = courrier.vider().find((x) => x.etiquette === "alerte_probleme" && x.sujet.includes("compte de virement"));
    noter(m?.sujet === "À TRAITER — le compte de virement a été modifié", "sujet de l'alerte", m?.sujet);
    noter(
      Boolean(m?.texte.includes("Avant : FR76 •••• 0189 (COMPTE D'ESSAI). Après : FR14 •••• 2606 (SARL DE LA VOUTE).")) &&
        Boolean(m?.texte.includes("depuis Chrome sur Windows")) &&
        !m?.texte.includes("FR1420041010050500013M02606"),
      "texte : ancien et nouveau compte masqués, appareil",
      m?.texte,
    );
    noter(Boolean(m?.texte.includes("Ce qu'il faut faire : Si ce changement ne vient pas de vous, changez le mot de passe de la gestion")), "texte : ce qu'il faut faire");
    const vide = await enregistrerRubrique("virement", vir("", ""), acteur);
    const apresVide = (await db.execute(sql`select donnees from courriels where cle like 'alerte_probleme:virement_compte_modifie:%' order by created_at desc limit 1`)).rows[0] as {
      donnees: Record<string, unknown>;
    };
    noter(vide.issue === "fait" && apresVide.donnees.apres === null, "compte vidé : alerte aussi (après : aucun compte)");
    const delai = await enregistrerRubrique("virement", { ...vir("", ""), virement_courriel_jours: "9" }, acteur);
    const avantN = (await db.execute(sql`select count(*)::int as n from courriels where cle like 'alerte_probleme:virement_compte_modifie:%'`)).rows[0] as { n: number };
    noter(delai.issue === "fait" && avantN.n === alertes.length * 2, "changer seulement le délai du courriel : aucune alerte de plus", avantN);

    // Avis.
    noter(noteEnCentiemes("4,97") === 497 && noteEnCentiemes("4.9") === 490 && noteEnCentiemes("5") === 500 && noteEnCentiemes("5,5") === null && noteEnCentiemes("4,975") === null, "note des avis : « 4,97 » → 497, au plus 5, deux décimales");
    const a1 = await enregistrerRubrique("avis", { avis_note_centiemes: "4,9", avis_nombre: "", avis_recommandation_pct: "" }, acteur);
    noter(a1.issue === "erreurs", "note sans nombre d'avis : refusée");
    const a2 = await enregistrerRubrique("avis", { avis_note_centiemes: "4,98", avis_nombre: "47", avis_recommandation_pct: "100" }, acteur);
    const av = (await db.execute(sql`select avis_note_centiemes, avis_nombre from reglages where id = 1`)).rows[0];
    noter(a2.issue === "fait" && JSON.stringify(av) === JSON.stringify({ avis_note_centiemes: 498, avis_nombre: 47 }), "avis enregistrés (498 centièmes)", av);
    const ab = await enregistrerRubrique("abandons", { abandon_conservation_jours: "" }, acteur);
    const j0 = (await db.execute(sql`select abandon_conservation_jours as j from reglages where id = 1`)).rows[0] as { j: unknown };
    noter(ab.issue === "fait" && j0.j === null, "tentatives abandonnées : vide accepté (rien n'est effacé)");
  } finally {
    const colonnes = Object.keys(sauvegarde).filter((c) => c !== "id");
    await db.execute(
      sql.raw(
        `update reglages set ${colonnes
          .map((c) => {
            const v = sauvegarde[c];
            if (v === null) return `"${c}" = null`;
            if (Array.isArray(v)) return `"${c}" = '{${v.join(",")}}'`;
            if (v instanceof Date) return `"${c}" = '${v.toISOString()}'`;
            return `"${c}" = '${String(v).replace(/'/g, "''")}'`;
          })
          .join(", ")} where id = 1`,
      ),
    );
  }
}

async function partieAlertes(): Promise<void> {
  console.log("\n— 9. Destinataires des alertes");
  const avant = (await db.execute(sql`select type, active, destinataires from alertes`)).rows as { type: string; active: boolean; destinataires: string[] }[];
  const acteur: Acteur = { appareilId: "00000000-0000-0000-0000-000000000001", description: "Chrome sur Windows", ip: IP(50) };
  const saisie = (modif: Record<string, string> = {}) => ({
    ...Object.fromEntries(avant.flatMap((a) => [[`${a.type}_destinataires`, a.destinataires.join("\n")], ...(a.active ? [[`${a.type}_active`, "on"]] : [])])),
    ...modif,
  });
  try {
    const vide = await enregistrerAlertes(saisie({ probleme_active: "on", probleme_destinataires: "" }), acteur);
    noter(vide.issue === "erreurs" && Boolean(vide.erreurs.probleme_destinataires), "alerte active sans adresse : refusée");
    const mal = await enregistrerAlertes(saisie({ signature_destinataires: "pas-une-adresse" }), acteur);
    noter(mal.issue === "erreurs" && Boolean(mal.erreurs.signature_destinataires), "adresse mal formée : refusée");
    const ok = await enregistrerAlertes(saisie({ signature_destinataires: "Proprietaires@example.invalid, second@example.invalid" }), acteur);
    const sig = (await db.execute(sql`select destinataires from alertes where type = 'signature'`)).rows[0] as { destinataires: string[] };
    noter(ok.issue === "fait" && JSON.stringify(sig.destinataires) === '["proprietaires@example.invalid","second@example.invalid"]', "deux adresses, en minuscules", sig);
    noter((await trace("alerte_modifiee")) !== null, "journal : alerte modifiée");
  } finally {
    for (const a of avant) {
      await db.execute(sql`update alertes set active = ${a.active}, destinataires = ${sql.raw(`'{${a.destinataires.join(",")}}'`)} where type = ${a.type}`);
    }
  }
}

function partieTextes(): void {
  console.log("\n— Textes des courriels de la gestion");
  const code = texteCodeGestion("482913", new Date("2026-11-03T20:14:00Z"), "Chrome sur Windows", 10);
  noter(
    code.texte ===
      "Votre code : 482913\n\nIl est valable 10 minutes.\n\nIl a été demandé le mardi 3 novembre 2026 à 21 h 14, depuis un appareil inconnu (Chrome sur Windows).\n\n" +
        "Si personne parmi vous ne vient de se connecter, ne donnez ce code à personne et changez le mot de passe : quelqu'un le connaît.",
    "texte du code, mot pour mot (heure de Paris)",
    code.texte,
  );
  const lien = texteLienGestion("https://exemple.invalid/gestion/mot-de-passe?jeton=abc", 90, false);
  noter(lien.texte.includes("Il est valable 90 minutes") && lien.html.includes("Choisir le mot de passe</a>"), "lien : durée en minutes, bouton");
}

async function partieHttp(): Promise<void> {
  console.log("\n— 10. Pages (serveur sur 3001)");
  const base = ORIGINE;
  const sans = await fetch(`${base}/gestion`, { redirect: "manual" });
  noter(sans.status === 307 && (sans.headers.get("location") ?? "").endsWith("/gestion/connexion"), "/gestion sans session : renvoi à la connexion", sans.status);
  noter(sans.headers.get("x-robots-tag") === "noindex, nofollow", "en-tête X-Robots-Tag", sans.headers.get("x-robots-tag"));
  const connexion = await fetch(`${base}/gestion/connexion`);
  const html = await connexion.text();
  noter(connexion.status === 200 && html.includes("Se connecter") && html.includes('name="robots" content="noindex, nofollow"'), "page de connexion, balise robots");
  noter(!html.includes("CookieBanner") && !html.includes("Réserver"), "aucun élément du site public sur la page de connexion");
  const fr = await fetch(`${base}/fr/gestion`, { redirect: "manual" });
  noter(fr.status === 301 && (fr.headers.get("location") ?? "").endsWith("/gestion"), "/fr/gestion renvoie à /gestion", fr.status);
  const faux = await fetch(`${base}/gestion/reglages`, { redirect: "manual", headers: { cookie: "gestion_session=faux" } });
  noter(faux.status === 307 && (faux.headers.get("location") ?? "").includes("/gestion/connexion"), "témoin inventé : renvoi à la connexion", faux.status);

  const s = await sessionNeuve(IP(60));
  const cookie = { cookie: `gestion_session=${s.jetonSession}` };
  const reglages = await fetch(`${base}/gestion/reglages`, { headers: cookie });
  const r = await reglages.text();
  noter(
    reglages.status === 200 && r.includes("Caution par virement") && r.includes("Conditions du contrat") && r.includes("Texte d&#x27;accord pour la carte"),
    "page des réglages avec une session",
    reglages.status,
  );
  const appareils = await fetch(`${base}/gestion/appareils`, { headers: cookie });
  noter(appareils.status === 200 && (await appareils.text()).includes("(cet appareil)"), "page des appareils : cet appareil est signalé");
  noter((await fetch(`${base}/gestion/code`, { redirect: "manual" })).status === 307, "/gestion/code sans étape précédente : renvoi à la connexion");
  const lien = await fetch(`${base}/gestion/mot-de-passe?jeton=inconnu`);
  noter((await lien.text()).includes("Ce lien n&#x27;est plus valable"), "lien inconnu : « plus valable »");
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") throw new Error('DB_CIBLE doit valoir "test".');
  await nettoyer();
  try {
    await partieSecrets();
    await partieCompte();
    const appareil = await partieConnexion();
    await partieDurees(appareil);
    await partieEchecs();
    await partieAppareils();
    // La suite repart de l'ancien mot de passe.
    await db.execute(sql`update comptes_gestion set empreinte_mot_de_passe = ${await empreinteMotDePasse(MOT)} where courriel = ${ADRESSE}`);
    await partieReglages();
    await partieAlertes();
    partieTextes();
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
