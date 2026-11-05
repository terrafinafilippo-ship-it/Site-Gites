// LA CONNEXION AU BACK-OFFICE (Phase 5, lot 1, D-32). Logique sans témoins ni
// redirections : app/gestion/actions.ts lit et pose les témoins (cookies) et
// appelle ces fonctions, que scripts/verifier-gestion.ts appelle aussi.
//
// Le parcours (choix du gérant du 3 novembre 2026) :
//   1. adresse et mot de passe ;
//   2. appareil RECONNU (connecté dans les `gestion_appareil_jours` derniers
//      jours, chaque connexion relançant le délai) : la session s'ouvre ;
//   3. appareil inconnu, ou oublié : un code à 6 chiffres part à l'adresse du
//      compte (contact@), valable `gestion_code_minutes`, `gestion_essais_max`
//      essais ; le bon code fait de l'appareil un appareil reconnu ;
//   4. la session se ferme après `gestion_inactivite_heures` sans activité :
//      on retape le mot de passe, sans code.
//
// Échecs (mot de passe ou code faux, demande de lien) comptés PAR ADRESSE IP :
// après `gestion_essais_max`, `gestion_attente_minutes` d'attente. L'adresse
// est la dernière de X-Forwarded-For, celle qu'écrit le proxy de Coolify
// (app/gestion/outils.ts).
//
// Les heures sont comparées à l'horloge de la BASE (`now()`), comme les
// courriels. Les réponses ne disent jamais si une adresse a un compte.
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  appareils_gestion,
  codes_gestion,
  comptes_gestion,
  essais_gestion,
  liens_gestion,
  reglages,
  sessions_gestion,
} from "@/db/schema";
import { texteCodeGestion, texteLienGestion, type Contenu } from "@/lib/courriels-textes";
import { messagerie } from "@/lib/messagerie";
import type { Executeur } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";

import { journaliser, type Acteur } from "./journal";
import {
  decrireAppareil,
  defautMotDePasse,
  empreinte,
  empreinteCode,
  empreinteMotDePasse,
  leurre,
  motDePasseCorrespond,
  nouveauCode,
  nouveauJeton,
  type RefusMotDePasse,
} from "./secrets";

export interface ReglagesConnexion {
  appareilJours: number;
  inactiviteHeures: number;
  essaisMax: number;
  attenteMinutes: number;
  codeMinutes: number;
  lienMinutes: number;
}

export async function lireReglagesConnexion(ex: Executeur = getDb()): Promise<ReglagesConnexion> {
  const [r] = await ex
    .select({
      appareilJours: reglages.gestion_appareil_jours,
      inactiviteHeures: reglages.gestion_inactivite_heures,
      essaisMax: reglages.gestion_essais_max,
      attenteMinutes: reglages.gestion_attente_minutes,
      codeMinutes: reglages.gestion_code_minutes,
      lienMinutes: reglages.gestion_lien_minutes,
    })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r;
}

export function normaliserCourriel(courriel: string): string {
  return courriel.trim().toLowerCase();
}

/** Ce que la requête dit du visiteur. */
export interface Visiteur {
  ip: string;
  userAgent: string | null;
}

// ─── Échecs par adresse IP ───────────────────────────────────────────────────

/** Fin de l'attente si l'adresse est bloquée, sinon null. */
export async function attenteEnCours(ex: Executeur, ip: string): Promise<Date | null> {
  const [e] = await ex
    .select({ jusqua: essais_gestion.bloque_jusqu_a })
    .from(essais_gestion)
    .where(and(eq(essais_gestion.ip, ip), gt(essais_gestion.bloque_jusqu_a, sql`now()`)));
  return e?.jusqua ?? null;
}

/** Compte un échec ; au `essaisMax`-ième, bloque l'adresse et repart de zéro. Rend la fin de l'attente si elle commence. */
async function noterEchec(ex: Executeur, ip: string, r: ReglagesConnexion): Promise<Date | null> {
  const [e] = await ex
    .insert(essais_gestion)
    .values({ ip, echecs: 1 })
    .onConflictDoUpdate({
      target: essais_gestion.ip,
      set: { echecs: sql`${essais_gestion.echecs} + 1`, updated_at: sql`now()` },
    })
    .returning({ echecs: essais_gestion.echecs });
  if (e.echecs < r.essaisMax) return null;
  const [b] = await ex
    .update(essais_gestion)
    .set({ echecs: 0, bloque_jusqu_a: sql`now() + make_interval(mins => ${r.attenteMinutes})`, updated_at: sql`now()` })
    .where(eq(essais_gestion.ip, ip))
    .returning({ jusqua: essais_gestion.bloque_jusqu_a });
  await journaliser(ex, { table: "essais_gestion", ligne: ip, action: "adresse_bloquee", acteur: "visiteur", details: { ip, minutes: r.attenteMinutes } });
  return b?.jusqua ?? null;
}

async function effacerEchecs(ex: Executeur, ip: string): Promise<void> {
  await ex.delete(essais_gestion).where(eq(essais_gestion.ip, ip));
}

// ─── Courriels envoyés tout de suite ─────────────────────────────────────────

async function envoyer(ex: Executeur, destinataire: string, contenu: Contenu, etiquette: string): Promise<boolean> {
  const [r] = await ex
    .select({ email: reglages.courriel_expediteur, nom: reglages.courriel_expediteur_nom, reponse: reglages.courriel_reponse })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  try {
    await messagerie().envoyer({
      expediteur: { email: r.email, nom: r.nom },
      repondreA: r.reponse,
      destinataire,
      sujet: contenu.sujet,
      html: contenu.html,
      texte: contenu.texte,
      etiquette,
    });
    return true;
  } catch (erreur) {
    console.error(`[gestion] ${etiquette} non parti à ${destinataire} :`, messageErreur(erreur));
    return false;
  }
}

// ─── Sessions et appareils ───────────────────────────────────────────────────

async function ouvrirSession(ex: Executeur, compteId: string, appareilId: string): Promise<string> {
  const jeton = nouveauJeton();
  await ex.insert(sessions_gestion).values({ compte_id: compteId, appareil_id: appareilId, empreinte_jeton: empreinte(jeton) });
  return jeton;
}

/** L'appareil, s'il est reconnu pour ce compte. Un appareil oublié (délai dépassé) est effacé. */
async function appareilReconnu(
  ex: Executeur,
  compteId: string,
  jetonAppareil: string | null,
  r: ReglagesConnexion,
): Promise<{ id: string; description: string } | null> {
  if (!jetonAppareil) return null;
  const [a] = await ex
    .select({
      id: appareils_gestion.id,
      description: appareils_gestion.description,
      reconnu: sql<boolean>`${appareils_gestion.derniere_connexion_at} > now() - make_interval(days => ${r.appareilJours})`,
    })
    .from(appareils_gestion)
    .where(and(eq(appareils_gestion.empreinte_jeton, empreinte(jetonAppareil)), eq(appareils_gestion.compte_id, compteId)));
  if (!a) return null;
  if (!a.reconnu) {
    await ex.delete(appareils_gestion).where(eq(appareils_gestion.id, a.id));
    return null;
  }
  return { id: a.id, description: a.description };
}

export type IssueConnexion =
  | { issue: "attente"; jusqua: Date }
  | { issue: "refus" }
  | { issue: "session"; jetonSession: string }
  | { issue: "code"; jetonAttente: string }
  | { issue: "envoi_impossible" };

/** Étape 1 : adresse et mot de passe. */
export async function connecter(
  e: { courriel: string; motDePasse: string; jetonAppareil: string | null } & Visiteur,
): Promise<IssueConnexion> {
  const db = getDb();
  const r = await lireReglagesConnexion(db);
  await nettoyerConnexion(db, r);
  const bloque = await attenteEnCours(db, e.ip);
  if (bloque) return { issue: "attente", jusqua: bloque };

  const [compte] = await db
    .select()
    .from(comptes_gestion)
    .where(eq(comptes_gestion.courriel, normaliserCourriel(e.courriel)));
  // Même calcul qu'il y ait un compte ou non : le temps de réponse ne trahit rien.
  const bon = await motDePasseCorrespond(e.motDePasse, compte?.empreinte_mot_de_passe ?? (await leurre()));
  if (!compte || !compte.empreinte_mot_de_passe || !bon) {
    const jusqua = await noterEchec(db, e.ip, r);
    return jusqua ? { issue: "attente", jusqua } : { issue: "refus" };
  }
  await effacerEchecs(db, e.ip);

  const appareil = await appareilReconnu(db, compte.id, e.jetonAppareil, r);
  if (appareil) {
    return db.transaction(async (tx) => {
      await tx.update(appareils_gestion).set({ derniere_connexion_at: sql`now()` }).where(eq(appareils_gestion.id, appareil.id));
      return { issue: "session" as const, jetonSession: await ouvrirSession(tx, compte.id, appareil.id) };
    });
  }

  // Appareil inconnu : un code, à l'adresse du compte. Un nouveau code annule le précédent.
  const jetonAttente = nouveauJeton();
  const code = nouveauCode();
  const description = decrireAppareil(e.userAgent);
  await db.transaction(async (tx) => {
    await tx
      .update(codes_gestion)
      .set({ utilise_at: sql`now()` })
      .where(and(eq(codes_gestion.compte_id, compte.id), isNull(codes_gestion.utilise_at)));
    await tx.insert(codes_gestion).values({
      compte_id: compte.id,
      empreinte_jeton: empreinte(jetonAttente),
      empreinte_code: empreinteCode(code, jetonAttente),
      description,
      expire_at: sql`now() + make_interval(mins => ${r.codeMinutes})`,
    });
  });
  const parti = await envoyer(db, compte.courriel, texteCodeGestion(code, new Date(), description, r.codeMinutes), "gestion_code");
  return parti ? { issue: "code", jetonAttente } : { issue: "envoi_impossible" };
}

export type IssueCode =
  | { issue: "attente"; jusqua: Date }
  | { issue: "expire" }
  | { issue: "refus"; restants: number }
  | { issue: "session"; jetonSession: string; jetonAppareil: string };

/** Étape 2, sur un appareil inconnu : le code reçu par courriel. */
export async function validerCode(e: { jetonAttente: string | null; code: string } & Visiteur): Promise<IssueCode> {
  const db = getDb();
  const r = await lireReglagesConnexion(db);
  const bloque = await attenteEnCours(db, e.ip);
  if (bloque) return { issue: "attente", jusqua: bloque };
  if (!e.jetonAttente) return { issue: "expire" };

  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(codes_gestion)
      .where(
        and(
          eq(codes_gestion.empreinte_jeton, empreinte(e.jetonAttente!)),
          isNull(codes_gestion.utilise_at),
          gt(codes_gestion.expire_at, sql`now()`),
        ),
      )
      .for("update");
    if (!c) return { issue: "expire" as const };

    const saisi = e.code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(saisi) || empreinteCode(saisi, e.jetonAttente!) !== c.empreinte_code) {
      const essais = c.essais + 1;
      await tx
        .update(codes_gestion)
        .set({ essais, ...(essais >= r.essaisMax ? { utilise_at: sql`now()` } : {}) })
        .where(eq(codes_gestion.id, c.id));
      const jusqua = await noterEchec(tx, e.ip, r);
      if (jusqua) return { issue: "attente" as const, jusqua };
      return essais >= r.essaisMax ? { issue: "expire" as const } : { issue: "refus" as const, restants: r.essaisMax - essais };
    }

    await tx.update(codes_gestion).set({ utilise_at: sql`now()` }).where(eq(codes_gestion.id, c.id));
    await effacerEchecs(tx, e.ip);
    const jetonAppareil = nouveauJeton();
    const [a] = await tx
      .insert(appareils_gestion)
      .values({ compte_id: c.compte_id, empreinte_jeton: empreinte(jetonAppareil), description: c.description })
      .returning({ id: appareils_gestion.id });
    await journaliser(tx, {
      table: "appareils_gestion",
      ligne: a.id,
      action: "nouvel_appareil",
      acteur: { appareilId: a.id, description: c.description, ip: e.ip },
    });
    return { issue: "session" as const, jetonSession: await ouvrirSession(tx, c.compte_id, a.id), jetonAppareil };
  });
}

/** La session en cours, telle que les pages et les actions la lisent. */
export interface Session {
  sessionId: string;
  compteId: string;
  courriel: string;
  appareilId: string;
  appareil: string;
}

/**
 * La session du témoin, si elle est encore ouverte ; null sinon (et elle est
 * effacée). L'activité relance la session et la reconnaissance de l'appareil,
 * au plus une fois par minute.
 */
export async function lireSession(jetonSession: string | null): Promise<Session | null> {
  if (!jetonSession) return null;
  const db = getDb();
  const r = await lireReglagesConnexion(db);
  const [s] = await db
    .select({
      sessionId: sessions_gestion.id,
      compteId: sessions_gestion.compte_id,
      courriel: comptes_gestion.courriel,
      appareilId: appareils_gestion.id,
      appareil: appareils_gestion.description,
      ouverte: sql<boolean>`${sessions_gestion.derniere_activite_at} > now() - make_interval(hours => ${r.inactiviteHeures})`,
      aRelancer: sql<boolean>`${sessions_gestion.derniere_activite_at} < now() - interval '1 minute'`,
    })
    .from(sessions_gestion)
    .innerJoin(comptes_gestion, eq(comptes_gestion.id, sessions_gestion.compte_id))
    .innerJoin(appareils_gestion, eq(appareils_gestion.id, sessions_gestion.appareil_id))
    .where(eq(sessions_gestion.empreinte_jeton, empreinte(jetonSession)));
  if (!s) return null;
  if (!s.ouverte) {
    await db.delete(sessions_gestion).where(eq(sessions_gestion.id, s.sessionId));
    return null;
  }
  if (s.aRelancer) {
    await db.update(sessions_gestion).set({ derniere_activite_at: sql`now()` }).where(eq(sessions_gestion.id, s.sessionId));
    await db.update(appareils_gestion).set({ derniere_connexion_at: sql`now()` }).where(eq(appareils_gestion.id, s.appareilId));
  }
  return { sessionId: s.sessionId, compteId: s.compteId, courriel: s.courriel, appareilId: s.appareilId, appareil: s.appareil };
}

export function acteurDe(s: Session, ip: string): Acteur {
  return { appareilId: s.appareilId, description: s.appareil, ip };
}

export async function fermerSession(jetonSession: string | null): Promise<void> {
  if (!jetonSession) return;
  await getDb().delete(sessions_gestion).where(eq(sessions_gestion.empreinte_jeton, empreinte(jetonSession)));
}

export interface AppareilListe {
  id: string;
  description: string;
  derniereConnexion: Date;
  creeLe: Date;
  /** Date où il sera oublié s'il ne se connecte plus. */
  oublieLe: Date;
}

export async function listerAppareils(compteId: string): Promise<AppareilListe[]> {
  const db = getDb();
  const r = await lireReglagesConnexion(db);
  const lignes = await db
    .select({
      id: appareils_gestion.id,
      description: appareils_gestion.description,
      derniereConnexion: appareils_gestion.derniere_connexion_at,
      creeLe: appareils_gestion.created_at,
      oublieLe: sql<string>`${appareils_gestion.derniere_connexion_at} + make_interval(days => ${r.appareilJours})`,
    })
    .from(appareils_gestion)
    .where(
      and(
        eq(appareils_gestion.compte_id, compteId),
        sql`${appareils_gestion.derniere_connexion_at} > now() - make_interval(days => ${r.appareilJours})`,
      ),
    )
    .orderBy(sql`${appareils_gestion.derniere_connexion_at} desc`);
  return lignes.map((l) => ({ ...l, oublieLe: new Date(l.oublieLe) }));
}

/** Retire un appareil : ses sessions se ferment, il redemandera un code. */
export async function retirerAppareil(session: Session, appareilId: string, acteur: Acteur): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [a] = await tx
      .delete(appareils_gestion)
      .where(and(eq(appareils_gestion.id, appareilId), eq(appareils_gestion.compte_id, session.compteId)))
      .returning({ id: appareils_gestion.id, description: appareils_gestion.description });
    if (!a) return false;
    await journaliser(tx, { table: "appareils_gestion", ligne: a.id, action: "appareil_retire", acteur, details: { description: a.description } });
    return true;
  });
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

/** Crée le lien et l'envoie. Un nouveau lien annule le précédent. */
async function envoyerLien(ex: Executeur, compte: { id: string; courriel: string }, origine: string, premier: boolean): Promise<boolean> {
  const r = await lireReglagesConnexion(ex);
  const jeton = nouveauJeton();
  await ex
    .update(liens_gestion)
    .set({ utilise_at: sql`now()` })
    .where(and(eq(liens_gestion.compte_id, compte.id), isNull(liens_gestion.utilise_at)));
  await ex.insert(liens_gestion).values({
    compte_id: compte.id,
    empreinte_jeton: empreinte(jeton),
    expire_at: sql`now() + make_interval(mins => ${r.lienMinutes})`,
  });
  const lien = `${origine.replace(/\/$/, "")}/gestion/mot-de-passe?jeton=${encodeURIComponent(jeton)}`;
  return envoyer(ex, compte.courriel, texteLienGestion(lien, r.lienMinutes, premier), "gestion_lien");
}

/**
 * « Mot de passe oublié » : la réponse est la même qu'il y ait un compte ou
 * non. Chaque demande compte comme un échec de l'adresse IP (pas de rafale).
 */
export async function demanderLien(e: { courriel: string; origine: string } & Visiteur): Promise<{ issue: "attente"; jusqua: Date } | { issue: "fait" }> {
  const db = getDb();
  const r = await lireReglagesConnexion(db);
  const bloque = await attenteEnCours(db, e.ip);
  if (bloque) return { issue: "attente", jusqua: bloque };
  await noterEchec(db, e.ip, r);
  const [compte] = await db
    .select({ id: comptes_gestion.id, courriel: comptes_gestion.courriel })
    .from(comptes_gestion)
    .where(eq(comptes_gestion.courriel, normaliserCourriel(e.courriel)));
  if (compte) {
    await journaliser(db, { table: "comptes_gestion", ligne: compte.id, action: "lien_demande", acteur: "visiteur", details: { ip: e.ip } });
    await envoyerLien(db, compte, e.origine, false);
  }
  return { issue: "fait" };
}

/**
 * Commande `npm run gestion:compte` : crée le compte s'il manque, puis envoie
 * le lien pour choisir le mot de passe. Ne touche jamais au mot de passe actuel.
 */
export async function creerCompte(courriel: string, origine: string): Promise<{ cree: boolean; parti: boolean }> {
  const db = getDb();
  const adresse = normaliserCourriel(courriel);
  const [existant] = await db.select().from(comptes_gestion).where(eq(comptes_gestion.courriel, adresse));
  let compte = existant;
  if (!compte) {
    [compte] = await db.insert(comptes_gestion).values({ courriel: adresse }).returning();
    await journaliser(db, { table: "comptes_gestion", ligne: compte.id, action: "compte_cree", acteur: "commande", details: { courriel: adresse } });
  }
  const parti = await envoyerLien(db, compte, origine, !compte.empreinte_mot_de_passe);
  return { cree: !existant, parti };
}

/** Le lien est-il encore valable ? (la page ne montre le formulaire que s'il l'est) */
export async function lienValable(jeton: string | null): Promise<boolean> {
  if (!jeton) return false;
  const [l] = await getDb()
    .select({ id: liens_gestion.id })
    .from(liens_gestion)
    .where(and(eq(liens_gestion.empreinte_jeton, empreinte(jeton)), isNull(liens_gestion.utilise_at), gt(liens_gestion.expire_at, sql`now()`)));
  return Boolean(l);
}

export type IssueMotDePasse = { issue: "expire" } | { issue: "invalide"; refus: RefusMotDePasse } | { issue: "fait" };

/**
 * Choisit le mot de passe par le lien. Toutes les sessions se ferment et
 * tous les appareils sont oubliés : on change un mot de passe quand on a un doute.
 */
export async function choisirMotDePasse(e: { jeton: string | null; motDePasse: string; confirmation: string } & Visiteur): Promise<IssueMotDePasse> {
  if (!e.jeton) return { issue: "expire" };
  const defaut = defautMotDePasse(e.motDePasse);
  if (defaut) return { issue: "invalide", refus: defaut };
  if (e.motDePasse !== e.confirmation) return { issue: "invalide", refus: "different" };
  const nouvelle = await empreinteMotDePasse(e.motDePasse);

  return getDb().transaction(async (tx) => {
    const [l] = await tx
      .select()
      .from(liens_gestion)
      .where(and(eq(liens_gestion.empreinte_jeton, empreinte(e.jeton!)), isNull(liens_gestion.utilise_at), gt(liens_gestion.expire_at, sql`now()`)))
      .for("update");
    if (!l) return { issue: "expire" as const };
    await tx.update(liens_gestion).set({ utilise_at: sql`now()` }).where(eq(liens_gestion.id, l.id));
    await tx
      .update(comptes_gestion)
      .set({ empreinte_mot_de_passe: nouvelle, mot_de_passe_change_at: sql`now()` })
      .where(eq(comptes_gestion.id, l.compte_id));
    // Les sessions partent avec les appareils (cascade).
    await tx.delete(appareils_gestion).where(eq(appareils_gestion.compte_id, l.compte_id));
    await tx
      .update(codes_gestion)
      .set({ utilise_at: sql`now()` })
      .where(and(eq(codes_gestion.compte_id, l.compte_id), isNull(codes_gestion.utilise_at)));
    await journaliser(tx, {
      table: "comptes_gestion",
      ligne: l.compte_id,
      action: "mot_de_passe_change",
      acteur: "visiteur",
      details: { ip: e.ip, appareil: decrireAppareil(e.userAgent) },
    });
    return { issue: "fait" as const };
  });
}

/** Ménage à chaque connexion : codes, liens, sessions et appareils périmés, échecs anciens. */
async function nettoyerConnexion(db: Executeur, r: ReglagesConnexion): Promise<void> {
  await db.delete(codes_gestion).where(lt(codes_gestion.expire_at, sql`now() - interval '1 day'`));
  await db.delete(liens_gestion).where(lt(liens_gestion.expire_at, sql`now() - interval '1 day'`));
  await db.delete(sessions_gestion).where(lt(sessions_gestion.derniere_activite_at, sql`now() - make_interval(hours => ${r.inactiviteHeures})`));
  await db.delete(appareils_gestion).where(lt(appareils_gestion.derniere_connexion_at, sql`now() - make_interval(days => ${r.appareilJours})`));
  await db
    .delete(essais_gestion)
    .where(
      and(
        lt(essais_gestion.updated_at, sql`now() - interval '1 day'`),
        or(isNull(essais_gestion.bloque_jusqu_a), lt(essais_gestion.bloque_jusqu_a, sql`now()`)),
      ),
    );
}
