// LA SYNCHRONISATION DES CALENDRIERS avec Gîtes de France, Airbnb et Booking
// (Phase 7, D-12, D-44 ; choix du gérant du 26 novembre 2026).
//
// LE SITE EST LE CALENDRIER CENTRAL. Chaque plateforme reçoit un lien du site
// (un par gîte et par plateforme) qui montre toutes les nuits prises : vendues
// sur le site, fermées, gardées par une option, vendues sur les AUTRES
// plateformes. Elle ne voit pas ses propres séjours (elle les connaît), ni
// les blocages de 20 minutes d'un paiement en cours (trop courts pour des
// plateformes qui relisent toutes les quelques heures).
//
// DANS L'AUTRE SENS, le site lit le lien de chaque plateforme :
//   - à chaque passage des tâches (lib/taches.ts, toutes les 15 minutes) ;
//   - quand un client arrive sur l'écran de paiement (relireAvantPaiement,
//     POST /api/reservations) : si les dates viennent d'être prises
//     ailleurs, il voit l'écran « dates prises ». Une plateforme qui ne
//     répond pas en 4 secondes ne bloque pas le client (décision 3 A) ;
//   - quand les propriétaires collent un lien (il n'est enregistré que s'il
//     se lit).
// Une lecture remplace ce que le site savait de cette plateforme : les
// séjours nouveaux prennent leurs nuits, les séjours disparus (annulés) les
// rendent. UNE LECTURE RATÉE NE CHANGE RIEN : les nuits connues restent prises
// (libérer sur une panne, ce serait vendre deux fois) ; un lien qui ne se lit
// plus depuis 2 heures apparaît dans « À traiter ».
//
// UNE NUIT D'UNE PLATEFORME prend :
//   - une nuit libre, ou une ligne provisoire échue ;
//   - une nuit bloquée par un paiement EN COURS sur le site : la plateforme
//     l'a vendue d'abord. Le paiement, s'il aboutit, est remboursé avec
//     l'explication « dates prises » (lib/paiement.ts, vendreNuits) ;
// et ne prend jamais une nuit vendue sur le site, fermée, gardée par une
// option ou vendue sur une autre plateforme. C'est un DOUBLON : le site ne
// touche à rien, il envoie une alerte « À TRAITER » (une par séjour de la
// plateforme) et la ligne reste dans « À traiter » jusqu'à ce qu'une des deux
// réservations soit annulée. Le client du site a été prévenu, avant de payer,
// qu'il serait averti d'un doublon dans `doublon_delai_heures` heures
// (réglage, 24) : l'alerte dit aux propriétaires si ce délai court encore.
import { randomBytes } from "node:crypto";

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { calendriers, gites, PLATEFORMES, reglages, sejours_plateformes, type Plateforme } from "@/db/schema";
import { inscrireProbleme } from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis } from "@/lib/dates-civiles";
import { journaliser, type Acteur } from "@/lib/gestion/journal";
import { ecrireIcal, lireIcal, plagesDeNuits, type Plage } from "@/lib/ical";
import { NOMS_PLATEFORMES, ORDRE_DETENTEURS, type Detenteur } from "@/lib/plateformes";
import type { Executeur } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";

/** Jusqu'où les nuits sont échangées : trois ans (les tarifs vont au plus à 36 mois). */
const HORIZON_JOURS = 1096;
/** Attente d'une plateforme pendant les tâches et quand un lien est collé. */
const DELAI_TACHES_MS = 15_000;
/** Attente d'une plateforme quand un client arrive sur l'écran de paiement. */
export const DELAI_PAIEMENT_MS = 4_000;
/** Au-delà, un lien qui ne se lit plus apparaît dans « À traiter ». */
export const LIEN_EN_PANNE_MS = 2 * 3_600_000;
const TAILLE_MAX = 5_000_000;
const FORME_JETON = /^[0-9a-f]{48}$/;

// ─── Lire un lien ────────────────────────────────────────────────────────────

/** Le texte derrière un lien ; lève si la plateforme ne répond pas (à temps), ou mal. */
export type Lecteur = (lien: string, delaiMs: number) => Promise<string>;

export const lecteurReseau: Lecteur = async (lien, delaiMs) => {
  const reponse = await fetch(lien, {
    signal: AbortSignal.timeout(delaiMs),
    redirect: "follow",
    cache: "no-store",
    headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.5" },
  });
  if (!reponse.ok) throw new Error(`la plateforme répond « ${reponse.status} »`);
  if (!reponse.url.startsWith("https://")) throw new Error("la plateforme renvoie vers une adresse non sécurisée");
  if (Number(reponse.headers.get("content-length") ?? 0) > TAILLE_MAX) throw new Error("calendrier trop volumineux");
  const corps = await reponse.arrayBuffer();
  if (corps.byteLength > TAILLE_MAX) throw new Error("calendrier trop volumineux");
  return new TextDecoder("utf-8").decode(corps);
};

function erreurLisible(erreur: unknown, delaiMs: number): string {
  if (erreur instanceof Error && (erreur.name === "TimeoutError" || erreur.name === "AbortError")) {
    return `la plateforme n'a pas répondu en ${Math.round(delaiMs / 1000)} secondes`;
  }
  if (erreur instanceof TypeError) return "adresse injoignable";
  return messageErreur(erreur);
}

type Lecture = { ok: true; plages: Plage[] } | { ok: false; erreur: string };

async function lireLien(lien: string, lire: Lecteur, delaiMs: number): Promise<Lecture> {
  let texte: string;
  try {
    texte = await lire(lien, delaiMs);
  } catch (erreur) {
    return { ok: false, erreur: erreurLisible(erreur, delaiMs) };
  }
  const plages = lireIcal(texte);
  return plages ? { ok: true, plages } : { ok: false, erreur: "ce lien ne donne pas un calendrier (iCal)" };
}

/** Le lien collé, tel qu'il sera lu (« webcal:// » devient « https:// ») ; `null` s'il n'est pas une adresse https. */
export function normaliserLien(brut: string): string | null {
  const l = brut.trim().replace(/^webcal:\/\//i, "https://");
  if (l.length > 2000 || !/^https:\/\/\S+$/i.test(l)) return null;
  try {
    const u = new URL(l);
    return u.protocol === "https:" && u.hostname ? u.href : null;
  } catch {
    return null;
  }
}

// ─── Les calendriers d'un gîte ───────────────────────────────────────────────

export interface CalendrierGite {
  id: string;
  plateforme: Plateforme;
  nom: string;
  /** Chemin du lien du site à donner à la plateforme (à préfixer par l'adresse du site). */
  cheminExport: string;
  lienImport: string | null;
  luA: Date | null;
  erreur: string | null;
  /** Séjours à venir annoncés par la plateforme. */
  sejours: number;
}

/** Les trois calendriers d'un gîte, créés au premier appel (jeton du lien du site tiré au hasard). */
export async function calendriersDuGite(giteId: string, maintenant: Date = new Date()): Promise<CalendrierGite[]> {
  const db = getDb();
  for (const plateforme of PLATEFORMES) {
    await db
      .insert(calendriers)
      .values({ gite_id: giteId, plateforme, jeton_export: randomBytes(24).toString("hex") })
      .onConflictDoNothing({ target: [calendriers.gite_id, calendriers.plateforme] });
  }
  const auj = aujourdhuiParis(maintenant);
  const lignes = await db
    .select({
      c: calendriers,
      sejours: sql<number>`(select count(*)::int from ${sejours_plateformes}
                             where ${sejours_plateformes.calendrier_id} = ${calendriers.id}
                               and ${sejours_plateformes.depart} > ${auj}::date)`,
    })
    .from(calendriers)
    .where(eq(calendriers.gite_id, giteId));
  return PLATEFORMES.flatMap((p) => {
    const l = lignes.find((x) => x.c.plateforme === p);
    if (!l) return [];
    return [
      {
        id: l.c.id,
        plateforme: p,
        nom: NOMS_PLATEFORMES[p],
        cheminExport: `/api/calendrier/${l.c.jeton_export}.ics`,
        lienImport: l.c.lien_import,
        luA: l.c.lu_at,
        erreur: l.c.erreur,
        sejours: l.sejours,
      },
    ];
  });
}

export type IssueLien = { ok: true; message: string } | { ok: false; message: string };

/**
 * Les propriétaires collent (ou effacent) le lien d'une plateforme. Un lien
 * n'est enregistré que s'il se lit : ses séjours prennent aussitôt leurs
 * nuits. Effacé : les nuits à venir de cette plateforme sont libérées.
 */
export async function enregistrerLienImport(
  calendrierId: string,
  brut: string,
  acteur: Acteur,
  lire: Lecteur = lecteurReseau,
  maintenant: Date = new Date(),
): Promise<IssueLien> {
  const db = getDb();
  const [cal] = await db.select().from(calendriers).where(eq(calendriers.id, calendrierId));
  if (!cal) return { ok: false, message: "Calendrier introuvable." };
  const nom = NOMS_PLATEFORMES[cal.plateforme];

  if (!brut.trim()) {
    if (!cal.lien_import) return { ok: true, message: `Aucun lien ${nom} enregistré.` };
    await db.transaction(async (tx) => {
      await verrouiller(tx, cal.id);
      await tx.update(calendriers).set({ lien_import: null, lu_at: null, erreur: null, updated_at: new Date() }).where(eq(calendriers.id, cal.id));
      await remplacer(tx, cal, [], aujourdhuiParis(maintenant));
      await journaliser(tx, { table: "calendriers", ligne: cal.id, action: "lien_retire", acteur, details: { plateforme: cal.plateforme } });
    });
    return { ok: true, message: `Lien ${nom} retiré : les nuits venues ${/^[AEIOU]/.test(nom) ? `d'${nom}` : `de ${nom}`} sont libérées.` };
  }

  const lien = normaliserLien(brut);
  if (!lien) return { ok: false, message: "Le lien doit être une adresse qui commence par https:// (ou webcal://)." };
  const lecture = await lireLien(lien, lire, DELAI_TACHES_MS);
  if (!lecture.ok) return { ok: false, message: `Ce lien n'a pas pu être lu : ${lecture.erreur}. Rien n'est enregistré.` };

  const doublons = await appliquer({ ...cal, lien_import: lien }, lecture.plages, maintenant, async (tx) => {
    await tx.update(calendriers).set({ lien_import: lien, updated_at: new Date() }).where(eq(calendriers.id, cal.id));
    await journaliser(tx, {
      table: "calendriers",
      ligne: cal.id,
      action: cal.lien_import ? "lien_modifie" : "lien_ajoute",
      acteur,
      // L'adresse complète porte la clé de la plateforme : seul le domaine est noté.
      details: { plateforme: cal.plateforme, domaine: new URL(lien).hostname },
    });
  });
  const auj = aujourdhuiParis(maintenant);
  const n = lecture.plages.filter((p) => p.depart > auj).length;
  return {
    ok: true,
    message:
      `Lien ${nom} enregistré : ${n === 0 ? "aucun séjour à venir" : n === 1 ? "1 séjour à venir" : `${n} séjours à venir`}.` +
      (doublons > 0 ? ` Attention : ${doublons === 1 ? "un séjour tombe" : `${doublons} séjours tombent`} sur des nuits déjà prises (voir « À traiter »).` : ""),
  };
}

// ─── Appliquer une lecture ───────────────────────────────────────────────────

type LigneCalendrier = typeof calendriers.$inferSelect;

/** Une lecture à la fois par calendrier (tâches, écran de paiement, lien collé). */
async function verrouiller(tx: Executeur, calendrierId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendrier:${calendrierId}`}))`);
}

const litteral = (jours: string[]) => `{${jours.join(",")}}`;

/** Les nuits [arrivee, depart[ comprises entre aujourd'hui et l'horizon. */
function nuitsDe(plages: Plage[], auj: string): string[] {
  const fin = ajouterJours(auj, HORIZON_JOURS);
  const nuits = new Set<string>();
  for (const p of plages) {
    for (let n = p.arrivee < auj ? auj : p.arrivee; n < p.depart && n < fin; n = ajouterJours(n, 1)) nuits.add(n);
  }
  return [...nuits].sort();
}

/** Remplace les séjours à venir de la plateforme et leurs nuits ; renvoie les séjours retenus. */
async function remplacer(tx: Executeur, cal: LigneCalendrier, plages: Plage[], auj: string): Promise<Plage[]> {
  const cles = new Set<string>();
  const sejours = plages.filter((p) => {
    const cle = `${p.arrivee}|${p.depart}`;
    if (p.depart <= auj || cles.has(cle)) return false;
    cles.add(cle);
    return true;
  });
  await tx.execute(sql`
    delete from sejours_plateformes s
     where s.calendrier_id = ${cal.id}::uuid
       and not exists (select 1 from jsonb_to_recordset(${JSON.stringify(sejours)}::jsonb) as e(arrivee date, depart date)
                        where e.arrivee = s.arrivee and e.depart = s.depart)`);
  if (sejours.length) {
    await tx
      .insert(sejours_plateformes)
      .values(sejours.map((p) => ({ calendrier_id: cal.id, arrivee: p.arrivee, depart: p.depart })))
      .onConflictDoNothing();
  }

  const nuits = nuitsDe(sejours, auj);
  await tx.execute(sql`
    delete from disponibilites
     where gite_id = ${cal.gite_id}::uuid and source = ${cal.plateforme} and reservation_id is null
       and statut = 'reserve' and date >= ${auj}::date
       and not (date = any(${litteral(nuits)}::date[]))`);
  if (nuits.length) {
    await tx.execute(sql`
      insert into disponibilites (gite_id, date, statut, source, reservation_id, verrou_expire_at)
      select ${cal.gite_id}::uuid, nuit, 'reserve', ${cal.plateforme}, null, null
        from unnest(${litteral(nuits)}::date[]) as nuit
      on conflict (gite_id, date) do update
         set statut = 'reserve',
             source = excluded.source,
             reservation_id = null,
             verrou_expire_at = null,
             option_id = null,
             created_at = now()
       where disponibilites.verrou_expire_at <= now() or disponibilites.statut = 'verrou'`);
  }
  return sejours;
}

/**
 * Applique une lecture réussie dans UNE transaction : séjours et nuits
 * remplacés, lecture notée, doublons signalés. `avant` s'exécute d'abord, dans
 * la même transaction. Renvoie le nombre de séjours en doublon.
 */
async function appliquer(
  cal: LigneCalendrier,
  plages: Plage[],
  maintenant: Date,
  avant?: (tx: Executeur) => Promise<void>,
): Promise<number> {
  const auj = aujourdhuiParis(maintenant);
  return getDb().transaction(async (tx) => {
    await verrouiller(tx, cal.id);
    if (avant) await avant(tx);
    const sejours = await remplacer(tx, cal, plages, auj);
    await tx.update(calendriers).set({ lu_at: maintenant, erreur: null }).where(eq(calendriers.id, cal.id));

    const [r] = await tx.select({ heures: reglages.doublon_delai_heures }).from(reglages).where(eq(reglages.id, 1));
    if (!r) throw new Error("ligne de réglages absente");
    const [gite] = await tx.select({ nom: gites.nom }).from(gites).where(eq(gites.id, cal.gite_id));
    let doublons = 0;
    for (const p of sejours) {
      const detenteurs = await detenteursDe(tx, cal.gite_id, cal.plateforme, p, auj, r.heures);
      if (!detenteurs.length) continue;
      doublons += 1;
      const [s] = await tx
        .select({ id: sejours_plateformes.id })
        .from(sejours_plateformes)
        .where(and(eq(sejours_plateformes.calendrier_id, cal.id), eq(sejours_plateformes.arrivee, p.arrivee), eq(sejours_plateformes.depart, p.depart)));
      if (!s) continue;
      const directe = detenteurs.find((d) => d.genre === "directe");
      // Une alerte par séjour de la plateforme (clé du courriel) : les lectures suivantes n'en renvoient pas.
      await inscrireProbleme(tx, "doublon", s.id, directe?.genre === "directe" ? directe.reservationId : null, {
        plateforme: cal.plateforme,
        gite: gite?.nom ?? "",
        arrivee: p.arrivee,
        depart: p.depart,
        detenteurs,
        delaiHeures: r.heures,
        vuLe: maintenant.toISOString(),
      });
    }
    return doublons;
  });
}

export type BilanSynchronisation = { lus: number; echecs: number; doublons: number };

/**
 * Lit les liens des plateformes (tous, ou ceux d'un gîte) et applique chaque
 * lecture réussie. Les plateformes sont interrogées en même temps.
 */
export async function synchroniserCalendriers(
  maintenant: Date = new Date(),
  lire: Lecteur = lecteurReseau,
  giteId: string | null = null,
  delaiMs: number = DELAI_TACHES_MS,
): Promise<BilanSynchronisation> {
  const db = getDb();
  const bilan: BilanSynchronisation = { lus: 0, echecs: 0, doublons: 0 };
  const liste = await db
    .select()
    .from(calendriers)
    .where(and(isNotNull(calendriers.lien_import), giteId ? eq(calendriers.gite_id, giteId) : undefined));
  const lectures = await Promise.all(liste.map(async (cal) => ({ cal, lecture: await lireLien(cal.lien_import!, lire, delaiMs) })));
  for (const { cal, lecture } of lectures) {
    try {
      if (lecture.ok) {
        bilan.doublons += await appliquer(cal, lecture.plages, maintenant);
        bilan.lus += 1;
      } else {
        await db.update(calendriers).set({ erreur: lecture.erreur.slice(0, 300) }).where(eq(calendriers.id, cal.id));
        bilan.echecs += 1;
        console.warn(`[synchronisation] ${NOMS_PLATEFORMES[cal.plateforme]} (gîte ${cal.gite_id}) : ${lecture.erreur}`);
      }
    } catch (erreur) {
      bilan.echecs += 1;
      console.error(`[synchronisation] calendrier ${cal.id} : ${messageErreur(erreur)}`);
    }
  }
  return bilan;
}

/**
 * Le client arrive sur l'écran de paiement : relire tout de suite les
 * plateformes de ce gîte, 4 secondes au plus. Ne lève jamais : une panne ici
 * ne doit pas empêcher de réserver (décision 3 A) ; le paiement, lui, reste
 * protégé par l'index unique des nuits.
 */
export async function relireAvantPaiement(slug: string, lire: Lecteur = lecteurReseau): Promise<void> {
  try {
    const [g] = await getDb().select({ id: gites.id }).from(gites).where(eq(gites.slug, slug));
    if (g) await synchroniserCalendriers(new Date(), lire, g.id, DELAI_PAIEMENT_MS);
  } catch (erreur) {
    console.error(`[synchronisation] relecture avant paiement (${slug}) : ${messageErreur(erreur)}`);
  }
}

// ─── Les doublons ────────────────────────────────────────────────────────────

/** Les occupants des nuits d'un séjour de la plateforme, autres qu'elle-même (hors paiements en cours). */
export async function detenteursDe(
  ex: Executeur,
  giteId: string,
  plateforme: Plateforme,
  p: Plage,
  auj: string,
  delaiHeures: number,
): Promise<Detenteur[]> {
  const r = await ex.execute<{
    statut: string;
    source: string;
    reservation_id: string | null;
    reference: string | null;
    client_prenom: string | null;
    client_nom: string | null;
    paye_le: Date | string | null;
    option_client: string | null;
  }>(sql`
    select distinct d.statut, d.source, d.reservation_id::text as reservation_id, r.reference, r.client_prenom, r.client_nom,
           r.date_paiement_acompte as paye_le, o.client_nom as option_client
      from disponibilites d
      left join reservations r on r.id = d.reservation_id
      left join options_sejour o on o.id = d.option_id
     where d.gite_id = ${giteId}::uuid
       and d.date >= greatest(${p.arrivee}::date, ${auj}::date) and d.date < ${p.depart}::date
       and d.statut <> 'verrou' and (d.verrou_expire_at is null or d.verrou_expire_at > now())
       and d.source <> ${plateforme}`);
  const vus = new Set<string>();
  const detenteurs: Detenteur[] = [];
  for (const l of r.rows) {
    let d: Detenteur;
    if (l.statut === "bloque") d = { genre: "ferme" };
    else if (l.statut === "option") d = { genre: "option", client: l.option_client ?? "" };
    else if (l.source !== "directe") d = { genre: "plateforme", plateforme: l.source as Plateforme };
    else {
      const payeLe = l.paye_le ? new Date(l.paye_le) : null;
      d = {
        genre: "directe",
        reservationId: l.reservation_id ?? "",
        reference: l.reference ?? "",
        client: [l.client_prenom, (l.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client",
        payeLe: payeLe?.toISOString() ?? null,
        finDelai: payeLe ? new Date(payeLe.getTime() + delaiHeures * 3_600_000).toISOString() : null,
      };
    }
    const cle = JSON.stringify(d);
    if (!vus.has(cle)) {
      vus.add(cle);
      detenteurs.push(d);
    }
  }
  return detenteurs.sort((a, b) => ORDRE_DETENTEURS.indexOf(a.genre) - ORDRE_DETENTEURS.indexOf(b.genre));
}

export interface Doublon {
  sejourId: string;
  plateforme: Plateforme;
  gite: string;
  arrivee: string;
  depart: string;
  detenteurs: Detenteur[];
  /** Première lecture du séjour de la plateforme. */
  vuLe: Date;
}

/** Les séjours à venir des plateformes qui tombent sur des nuits déjà prises (« À traiter »). */
export async function doublonsEnCours(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<Doublon[]> {
  const auj = aujourdhuiParis(maintenant);
  const [r] = await ex.select({ heures: reglages.doublon_delai_heures }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  const sejours = await ex
    .select({ s: sejours_plateformes, giteId: calendriers.gite_id, plateforme: calendriers.plateforme, gite: gites.nom })
    .from(sejours_plateformes)
    .innerJoin(calendriers, eq(calendriers.id, sejours_plateformes.calendrier_id))
    .innerJoin(gites, eq(gites.id, calendriers.gite_id))
    .where(and(isNotNull(calendriers.lien_import), sql`${sejours_plateformes.depart} > ${auj}::date`))
    .orderBy(sejours_plateformes.arrivee);
  const doublons: Doublon[] = [];
  for (const { s, giteId, plateforme, gite } of sejours) {
    const detenteurs = await detenteursDe(ex, giteId, plateforme, s, auj, r.heures);
    if (detenteurs.length) doublons.push({ sejourId: s.id, plateforme, gite, arrivee: s.arrivee, depart: s.depart, detenteurs, vuLe: s.created_at });
  }
  return doublons;
}

export interface LienEnPanne {
  calendrierId: string;
  plateforme: Plateforme;
  gite: string;
  /** Dernière lecture réussie ; `null` : jamais lu. */
  luA: Date | null;
  erreur: string | null;
}

/** Les liens de plateforme qui ne se lisent plus depuis 2 heures (« À traiter »). */
export async function liensEnPanne(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<LienEnPanne[]> {
  const limite = new Date(maintenant.getTime() - LIEN_EN_PANNE_MS);
  const lignes = await ex
    .select({ c: calendriers, gite: gites.nom })
    .from(calendriers)
    .innerJoin(gites, eq(gites.id, calendriers.gite_id))
    .where(and(isNotNull(calendriers.lien_import), sql`(${calendriers.lu_at} is null or ${calendriers.lu_at} < ${limite.toISOString()}::timestamptz)`));
  return lignes.map(({ c, gite }) => ({ calendrierId: c.id, plateforme: c.plateforme, gite, luA: c.lu_at, erreur: c.erreur }));
}

export interface SejourPlateforme {
  id: string;
  plateforme: Plateforme;
  gite: string;
  arrivee: string;
  depart: string;
}

/** Les séjours des plateformes reliées qui arrivent ou partent entre deux jours inclus (accueil du back-office). */
export async function sejoursPlateformes(
  du: string,
  au: string,
  selon: "arrivee" | "arrivee_ou_depart",
  ex: Executeur = getDb(),
): Promise<SejourPlateforme[]> {
  const lignes = await ex
    .select({ s: sejours_plateformes, plateforme: calendriers.plateforme, gite: gites.nom })
    .from(sejours_plateformes)
    .innerJoin(calendriers, eq(calendriers.id, sejours_plateformes.calendrier_id))
    .innerJoin(gites, eq(gites.id, calendriers.gite_id))
    .where(
      and(
        isNotNull(calendriers.lien_import),
        selon === "arrivee"
          ? sql`${sejours_plateformes.arrivee} between ${du}::date and ${au}::date`
          : sql`(${sejours_plateformes.arrivee} between ${du}::date and ${au}::date
                 or ${sejours_plateformes.depart} between ${du}::date and ${au}::date)`,
      ),
    )
    .orderBy(sejours_plateformes.arrivee);
  return lignes.map(({ s, plateforme, gite }) => ({ id: s.id, plateforme, gite, arrivee: s.arrivee, depart: s.depart }));
}

// ─── Le lien du site ─────────────────────────────────────────────────────────

/** Le calendrier iCal donné à une plateforme, ou `null` si le jeton est inconnu. */
export async function calendrierExporte(jeton: string, maintenant: Date = new Date()): Promise<string | null> {
  if (!FORME_JETON.test(jeton)) return null;
  const db = getDb();
  const [cal] = await db.select().from(calendriers).where(eq(calendriers.jeton_export, jeton));
  if (!cal) return null;
  const auj = aujourdhuiParis(maintenant);
  const nuits = await db.execute<{ date: string }>(sql`
    select date::text as date
      from disponibilites
     where gite_id = ${cal.gite_id}::uuid
       and date >= ${auj}::date and date < ${ajouterJours(auj, HORIZON_JOURS)}::date
       and statut <> 'verrou' and (verrou_expire_at is null or verrou_expire_at > now())
       and source <> ${cal.plateforme}
     order by date`);
  return ecrireIcal(cal.gite_id, plagesDeNuits(nuits.rows.map((n) => n.date)), maintenant);
}

/** Le délai annoncé au client pour être prévenu d'un doublon, en heures (CGV, tunnel, confirmation). */
export async function delaiDoublonHeures(ex: Executeur = getDb()): Promise<number> {
  const [r] = await ex.select({ heures: reglages.doublon_delai_heures }).from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r.heures;
}
