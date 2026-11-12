// LES AVIS DES CLIENTS (Phase 6, D-40).
//
// Exemple : Camille Durand séjourne à L'Armu du samedi 20 au samedi 27 mars
// 2027. Choix du gérant du 12 novembre 2026 :
//   - dimanche 28 mars (`avis_courriel_jours` = 1, le lendemain du départ), au
//     premier passage des tâches automatiques : courriel avec un lien
//     personnel, /avis/{jeton}, ouvert jusqu'au 26 avril (`avis_lien_jours` =
//     30 jours après le départ). Le jeton est celui de « Ma réservation »
//     (reservations.jeton_suivi) : un seul secret par réservation ;
//   - elle donne une note de 1 à 5 et, si elle le veut, un commentaire ; l'avis
//     est publié tout de suite sur la page du gîte, signé « Camille D. », avec
//     le mois du séjour et la date de l'avis. Un seul avis par réservation ;
//   - les propriétaires reçoivent l'alerte « nouvel avis ». Ils ne peuvent le
//     retirer que pour un motif de la politique des avis (MOTIFS_RETRAIT) ;
//     Camille reçoit alors un courriel qui dit le motif ;
//   - pas de réponse publique des propriétaires (réponse 4 B) ;
//   - l'avis est effacé `DUREE_AVIS_ANS` après son dépôt (lib/avis-regles.ts).
//
// Le lien ne s'ouvre qu'à partir du jour du départ : le jeton de « Ma
// réservation » ne permet pas de noter un séjour pas encore fait.
//
// Les avis des autres sites (Gîtes de France) ne sont pas ici : leurs
// chiffres sont saisis sur la fiche de chaque gîte (gites.gdf_*).
import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { avis, gites, reglages, reservations, type MotifRetrait } from "@/db/schema";
import { COMMENTAIRE_MAX, DUREE_AVIS_ANS, LIBELLES_MOTIF } from "@/lib/avis-regles";
import { inscrireAlerteAvis, inscrireAvisInvitation, inscrireAvisRetrait } from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis } from "@/lib/dates-civiles";
import { journaliser, type Acteur } from "@/lib/gestion/journal";
import type { IssuePlan } from "@/lib/gestion/tarifs";
import { fmtDateLongue } from "@/lib/format";
import { lien, type Langue } from "@/lib/i18n/langues";
import type { Executeur } from "@/lib/reservations";
import { messageErreur } from "@/lib/route-helpers";
import { FORME_JETON } from "@/lib/suivi";

// Durée de publication, longueur du commentaire, motifs de retrait : des
// promesses écrites, dans lib/avis-regles.ts.
export { COMMENTAIRE_MAX, DUREE_AVIS_ANS, LIBELLES_MOTIF } from "@/lib/avis-regles";

const STATUTS_SEJOUR = ["confirmee", "terminee"] as const;

export function cheminAvis(langue: Langue, jeton: string): string {
  return lien(langue, `/avis/${jeton}`);
}

export function lienAvis(origine: string, langue: Langue, jeton: string): string {
  return `${origine.replace(/\/$/, "")}${cheminAvis(langue, jeton)}`;
}

/** « Camille D. » : le prénom, l'initiale du nom. */
export function signatureAvis(prenom: string | null, nom: string | null): string {
  const p = (prenom ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const n = (nom ?? "").trim();
  const initiale = n ? `${Array.from(n)[0].toLocaleUpperCase("fr-FR")}.` : "";
  return [p, initiale].filter(Boolean).join(" ") || "Client";
}

interface DelaisAvis {
  courriel: number;
  lien: number;
}

async function lireDelais(ex: Executeur): Promise<DelaisAvis> {
  const [r] = await ex
    .select({ courriel: reglages.avis_courriel_jours, lien: reglages.avis_lien_jours })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r;
}

/** Dernier jour où le lien de l'avis s'ouvre : départ + `avis_lien_jours`. */
export function finLienAvis(depart: string, jours: number): string {
  return ajouterJours(depart, jours);
}

// ─── Le lien du client ───────────────────────────────────────────────────────

export type LienAvis =
  | { etat: "invalide" }
  | {
      etat: "ouvert" | "depose";
      reservationId: string;
      giteId: string;
      gite: string;
      slug: string;
      arrivee: string;
      depart: string;
      signature: string;
      langue: Langue;
      finValidite: string;
    };

/**
 * Ce que montre /avis/{jeton}. Jeton inconnu, séjour annulé ou pas encore
 * fini, lien expiré : la même réponse, « lien non valable ». Un curieux
 * n'apprend rien.
 */
export async function lireLienAvis(jeton: string, aujourdhui: string = aujourdhuiParis(), ex: Executeur = getDb()): Promise<LienAvis> {
  if (!FORME_JETON.test(jeton)) return { etat: "invalide" };
  const [r] = await ex
    .select({
      id: reservations.id,
      statut: reservations.statut,
      arrivee: reservations.date_arrivee,
      depart: reservations.date_depart,
      prenom: reservations.client_prenom,
      nom: reservations.client_nom,
      langue: reservations.langue,
      giteId: gites.id,
      gite: gites.nom,
      slug: gites.slug,
      avisId: avis.id,
    })
    .from(reservations)
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .leftJoin(avis, eq(avis.reservation_id, reservations.id))
    .where(eq(reservations.jeton_suivi, jeton));
  if (!r || !(STATUTS_SEJOUR as readonly string[]).includes(r.statut)) return { etat: "invalide" };
  const { lien: jours } = await lireDelais(ex);
  const fin = finLienAvis(r.depart, jours);
  if (aujourdhui < r.depart || aujourdhui > fin) return { etat: "invalide" };
  return {
    etat: r.avisId ? "depose" : "ouvert",
    reservationId: r.id,
    giteId: r.giteId,
    gite: r.gite,
    slug: r.slug,
    arrivee: r.arrivee,
    depart: r.depart,
    signature: signatureAvis(r.prenom, r.nom),
    langue: r.langue === "en" ? "en" : "fr",
    finValidite: fin,
  };
}

// ─── Le dépôt ────────────────────────────────────────────────────────────────

export type IssueDepot =
  | { issue: "publie"; slug: string }
  | { issue: "deja" }
  | { issue: "invalide" }
  | { issue: "refus"; champ: "note" | "commentaire" };

/** Le commentaire tel qu'il sera publié : retours à la ligne gardés, caractères de contrôle retirés. */
export function commentairePropre(brut: string): string | null {
  const t = brut
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t === "" ? null : t;
}

/**
 * Dépose l'avis du client : contrôle, écriture, alerte aux propriétaires, dans
 * une transaction. Un second dépôt pour la même réservation répond « deja ».
 */
export async function deposerAvis(
  jeton: string,
  saisie: { note: unknown; commentaire: unknown },
  maintenant: Date = new Date(),
): Promise<IssueDepot> {
  const note = typeof saisie.note === "number" ? saisie.note : Number.NaN;
  if (!Number.isInteger(note) || note < 1 || note > 5) return { issue: "refus", champ: "note" };
  if (saisie.commentaire !== undefined && saisie.commentaire !== null && typeof saisie.commentaire !== "string") {
    return { issue: "refus", champ: "commentaire" };
  }
  const commentaire = typeof saisie.commentaire === "string" ? commentairePropre(saisie.commentaire) : null;
  if (commentaire !== null && Array.from(commentaire).length > COMMENTAIRE_MAX) return { issue: "refus", champ: "commentaire" };

  return getDb().transaction(async (tx) => {
    const l = await lireLienAvis(jeton, aujourdhuiParis(maintenant), tx);
    if (l.etat === "invalide") return { issue: "invalide" as const };
    if (l.etat === "depose") return { issue: "deja" as const };
    // Deux envois simultanés : la ligne de la réservation les met l'un après l'autre.
    await tx.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, l.reservationId)).for("update");
    const [cree] = await tx
      .insert(avis)
      .values({
        reservation_id: l.reservationId,
        gite_id: l.giteId,
        note,
        commentaire,
        signature: l.signature,
        langue: l.langue,
        date_sejour: l.arrivee,
        created_at: maintenant,
      })
      .onConflictDoNothing({ target: avis.reservation_id })
      .returning({ id: avis.id });
    if (!cree) return { issue: "deja" as const };
    await inscrireAlerteAvis(tx, l.reservationId, cree.id);
    return { issue: "publie" as const, slug: l.slug };
  });
}

// ─── Les tâches automatiques ─────────────────────────────────────────────────

export interface BilanAvis {
  /** Séjours dans la fenêtre de l'invitation (le courriel n'est inscrit qu'une fois). */
  examines: number;
  /** Avis effacés, publiés depuis plus de DUREE_AVIS_ANS. */
  effaces: number;
  erreurs: number;
}

/**
 * Un passage des tâches sur les avis : l'invitation, du jour prévu à la fin
 * de validité du lien (un passage manqué est rattrapé, jamais au-delà) ; puis
 * l'effacement des avis trop anciens.
 */
export async function traiterAvis(maintenant: Date = new Date()): Promise<BilanAvis> {
  const db = getDb();
  const bilan: BilanAvis = { examines: 0, effaces: 0, erreurs: 0 };
  const aujourdhui = aujourdhuiParis(maintenant);
  const delais = await lireDelais(db);

  const aInviter = await db
    .select({ id: reservations.id })
    .from(reservations)
    .leftJoin(avis, eq(avis.reservation_id, reservations.id))
    .where(
      and(
        inArray(reservations.statut, [...STATUTS_SEJOUR]),
        isNull(avis.id),
        sql`${reservations.client_email} is not null`,
        sql`${reservations.date_depart} <= ${ajouterJours(aujourdhui, -delais.courriel)}::date`,
        sql`${reservations.date_depart} >= ${ajouterJours(aujourdhui, -delais.lien)}::date`,
      ),
    );
  for (const r of aInviter) {
    bilan.examines += 1;
    try {
      await inscrireAvisInvitation(db, r.id);
    } catch (erreur) {
      bilan.erreurs += 1;
      console.error(`[avis] réservation ${r.id} : ${messageErreur(erreur)}`);
    }
  }

  const effaces = await db
    .delete(avis)
    .where(sql`${avis.created_at} < ${maintenant.toISOString()}::timestamptz - make_interval(years => ${DUREE_AVIS_ANS}::int)`)
    .returning({ id: avis.id });
  bilan.effaces = effaces.length;
  return bilan;
}

// ─── Ce que montre le site ───────────────────────────────────────────────────

export interface AvisPublie {
  id: string;
  note: number;
  commentaire: string | null;
  signature: string;
  /** Arrivée du séjour (aaaa-mm-jj) : le site en affiche le mois. */
  dateSejour: string;
  /** Jour du dépôt, à Paris (aaaa-mm-jj). */
  publieLe: string;
}

export interface ResumeAvis {
  nombre: number;
  /** Moyenne arrondie au dixième, en centièmes (470 = 4,7/5) ; `null` sans avis. */
  moyenneCentiemes: number | null;
}

/** Moyenne au dixième, en entiers (4 + 5 + 5 = 14 sur 3 → 470). */
export function resumer(notes: readonly number[]): ResumeAvis {
  if (notes.length === 0) return { nombre: 0, moyenneCentiemes: null };
  const somme = notes.reduce((s, n) => s + n, 0);
  return { nombre: notes.length, moyenneCentiemes: Math.round((somme * 10) / notes.length) * 10 };
}

/** Les avis publiés (non retirés), du plus récent au plus ancien, par gîte (clé : id du gîte). */
export async function lireAvisPublies(ex: Executeur = getDb()): Promise<Map<string, AvisPublie[]>> {
  const lignes = await ex
    .select({
      id: avis.id,
      giteId: avis.gite_id,
      note: avis.note,
      commentaire: avis.commentaire,
      signature: avis.signature,
      dateSejour: avis.date_sejour,
      creeLe: avis.created_at,
    })
    .from(avis)
    .where(isNull(avis.retire_at))
    .orderBy(desc(avis.created_at));
  const parGite = new Map<string, AvisPublie[]>();
  for (const l of lignes) {
    const liste = parGite.get(l.giteId) ?? [];
    liste.push({
      id: l.id,
      note: l.note,
      commentaire: l.commentaire,
      signature: l.signature,
      dateSejour: l.dateSejour,
      publieLe: aujourdhuiParis(l.creeLe),
    });
    parGite.set(l.giteId, liste);
  }
  return parGite;
}

// ─── Le back-office ──────────────────────────────────────────────────────────

export interface LigneAvisGestion {
  id: string;
  reservationId: string;
  reference: string;
  client: string;
  gite: string;
  arrivee: string;
  depart: string;
  note: number;
  commentaire: string | null;
  signature: string;
  publieLe: Date;
  retireLe: Date | null;
  motif: MotifRetrait | null;
}

/** Tous les avis, du plus récent au plus ancien, retirés compris. */
export async function lireAvisGestion(): Promise<LigneAvisGestion[]> {
  const lignes = await getDb()
    .select({ a: avis, r: reservations, gite: gites.nom })
    .from(avis)
    .innerJoin(reservations, eq(reservations.id, avis.reservation_id))
    .innerJoin(gites, eq(gites.id, avis.gite_id))
    .orderBy(desc(avis.created_at));
  return lignes.map(({ a, r, gite }) => ({
    id: a.id,
    reservationId: r.id,
    reference: r.reference,
    client: [r.client_prenom, (r.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client",
    gite,
    arrivee: r.date_arrivee,
    depart: r.date_depart,
    note: a.note,
    commentaire: a.commentaire,
    signature: a.signature,
    publieLe: a.created_at,
    retireLe: a.retire_at,
    motif: a.motif_retrait,
  }));
}

/**
 * Retire un avis pour l'un des motifs de la politique des avis, en deux temps
 * comme les autres gestes définitifs du back-office : sans `confirmation`, le
 * récapitulatif ; avec, le retrait. L'avis disparaît du site, le client
 * reçoit le motif par courriel, le journal garde qui l'a retiré.
 */
export async function retirerAvis(
  avisId: string,
  motif: string,
  acteur: Acteur,
  confirmation: string | null,
  maintenant: Date = new Date(),
): Promise<IssuePlan> {
  if (!(motif in LIBELLES_MOTIF)) return { etape: "refus", message: "Choisissez le motif du retrait." };
  const m = motif as MotifRetrait;
  return getDb().transaction(async (tx) => {
    const [a] = await tx.select().from(avis).where(eq(avis.id, avisId)).for("update");
    if (!a) return { etape: "refus" as const, message: "Avis introuvable." };
    if (a.retire_at) return { etape: "refus" as const, message: "Cet avis est déjà retiré." };
    const lignes = [
      `Avis signé ${a.signature}, ${a.note}/5, publié le ${fmtDateLongue(aujourdhuiParis(a.created_at))}.`,
      `Motif : ${LIBELLES_MOTIF[m].fr}.`,
      "L'avis disparaît du site tout de suite et le client reçoit ce motif par courriel. C'est définitif.",
    ];
    const empreinte = createHash("sha256").update(JSON.stringify([avisId, m])).digest("hex").slice(0, 32);
    if (confirmation === null) return { etape: "plan" as const, lignes, empreinte };
    if (confirmation !== empreinte) return { etape: "plan" as const, lignes, empreinte, message: "Le retrait a changé : relisez avant de confirmer." };
    await tx.update(avis).set({ retire_at: maintenant, motif_retrait: m }).where(eq(avis.id, avisId));
    await journaliser(tx, { table: "avis", ligne: avisId, action: "avis_retire", acteur, details: { motif: m, reservation_id: a.reservation_id } });
    await inscrireAvisRetrait(tx, a.reservation_id, avisId);
    return { etape: "fait" as const, message: "Avis retiré. Le client va recevoir le motif par courriel." };
  });
}
