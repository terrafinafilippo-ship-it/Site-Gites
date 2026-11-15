// LES DOCUMENTS dans le back-office (Phase 5, lot 4), cadrage du 7 novembre
// 2026 :
//   - une page avec tous les contrats et toutes les factures (numéro, client,
//     date, montant, état), une recherche par numéro, nom ou référence, un
//     filtre par année (réponse 4 A) ;
//   - « Ouvrir le PDF » : un lien signé de courte durée, demandé au moment du
//     clic (app/gestion/documents/pdf) ;
//   - « Renvoyer au client » : LE MÊME document, au même numéro, jamais un
//     nouveau — la facture par son courriel habituel (lib/factures.ts
//     réutilise la facture émise), le contrat signé en pièce jointe, le lien
//     de signature si le contrat n'est pas encore signé. Toujours à l'adresse
//     enregistrée sur la réservation (réponse 6 A) : on la corrige d'abord sur
//     la fiche si elle a changé.
// Pas d'export pour le comptable pour l'instant (réponse 5 B).
//
// Phase 5, lot 5 (D-42) : les avoirs (suite AV) s'y ajoutent, ouverts et
// renvoyés comme une facture.
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { avoirs, documents, factures, gites, reservations, type TypeFacture } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { inscrireAvoir, inscrireContratSigne, inscrireFactureRenvoyee } from "@/lib/courriels";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { isUuid } from "@/lib/route-helpers";
import { cheminContratSigne } from "@/lib/storage";

import type { IssueGeste } from "./cautions";
import { journaliser, type Acteur } from "./journal";
import { renvoyerLienSignature } from "./reservations";

export const LIBELLES_FACTURE: Record<TypeFacture, string> = {
  acompte: "Facture d'acompte",
  solde: "Facture de solde",
  total: "Facture du séjour",
  retenue: "Facture de retenue sur la caution",
};

export type SorteDocument = "contrat" | "facture" | "avoir";

export interface LigneDocument {
  sorte: SorteDocument;
  id: string;
  numero: string;
  libelle: string;
  reservationId: string;
  reference: string;
  client: string;
  email: string | null;
  gite: string;
  /** Date d'émission, aaaa-mm-jj. */
  date: string;
  /** Centimes ; `null` pour un contrat. */
  montant: number | null;
  /** Contrat : signé (date) ou non ; `null` pour une facture. */
  signeLe: string | null;
  pdf: boolean;
}

const LIMITE = 300;

/** Libellé du bouton « Renvoyer » d'un document (page Documents, fiche d'une réservation). */
export function libelleRenvoi(d: { sorte: SorteDocument; signeLe: string | null }): string {
  return d.sorte === "contrat" && !d.signeLe ? "Renvoyer le lien de signature" : "Renvoyer au client";
}

function nomClient(prenom: string | null, nom: string | null): string {
  return [prenom, (nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client";
}

function motif(recherche: string): string | null {
  const q = recherche.trim().slice(0, 80);
  return q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

export async function listerDocuments(annee: number | null, recherche: string): Promise<{ lignes: LigneDocument[]; annees: number[] }> {
  const db = getDb();
  const m = motif(recherche);
  const filtreClient = (numero: SQL): SQL | undefined =>
    m
      ? sql`(${numero} ilike ${m} or ${reservations.reference} ilike ${m} or ${reservations.client_nom} ilike ${m} or ${reservations.client_prenom} ilike ${m})`
      : undefined;

  const contrats = await db
    .select({ d: documents, r: reservations, gite: gites.nom })
    .from(documents)
    .innerJoin(reservations, eq(reservations.id, documents.reservation_id))
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(
      and(
        eq(documents.type, "contrat_location"),
        annee ? sql`extract(year from ${documents.created_at} at time zone 'Europe/Paris') = ${annee}` : undefined,
        filtreClient(sql`${documents.numero}`),
      ),
    )
    .orderBy(desc(documents.created_at))
    .limit(LIMITE);

  const facs = await db
    .select({ f: factures, r: reservations, gite: gites.nom })
    .from(factures)
    .innerJoin(reservations, eq(reservations.id, factures.reservation_id))
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(
      and(
        annee ? sql`extract(year from ${factures.date_emission}) = ${annee}` : undefined,
        filtreClient(sql`${factures.numero}`),
      ),
    )
    .orderBy(desc(factures.date_emission), desc(factures.numero))
    .limit(LIMITE);

  const avs = await db
    .select({ a: avoirs, r: reservations, gite: gites.nom })
    .from(avoirs)
    .innerJoin(reservations, eq(reservations.id, avoirs.reservation_id))
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(
      and(
        annee ? sql`extract(year from ${avoirs.date_emission}) = ${annee}` : undefined,
        filtreClient(sql`${avoirs.numero}`),
      ),
    )
    .orderBy(desc(avoirs.date_emission), desc(avoirs.numero))
    .limit(LIMITE);

  const lignes: LigneDocument[] = [
    ...contrats.map(({ d, r, gite }) => ({
      sorte: "contrat" as const,
      id: d.id,
      numero: d.numero,
      libelle: "Contrat de location",
      reservationId: r.id,
      reference: r.reference,
      client: nomClient(r.client_prenom, r.client_nom),
      email: r.client_email,
      gite,
      date: aujourdhuiParis(d.created_at),
      montant: null,
      signeLe: d.statut === "signe" && d.date_signature ? aujourdhuiParis(d.date_signature) : null,
      pdf: true,
    })),
    ...facs.map(({ f, r, gite }) => ({
      sorte: "facture" as const,
      id: f.id,
      numero: f.numero,
      libelle: LIBELLES_FACTURE[f.type] ?? "Facture",
      reservationId: r.id,
      reference: r.reference,
      client: nomClient(r.client_prenom, r.client_nom),
      email: r.client_email,
      gite,
      date: String(f.date_emission).slice(0, 10),
      montant: centimesDepuisNumeric(f.montant_ttc),
      signeLe: null,
      pdf: f.pdf_url !== null,
    })),
    ...avs.map(({ a, r, gite }) => ({
      sorte: "avoir" as const,
      id: a.id,
      numero: a.numero,
      libelle: "Avoir",
      reservationId: r.id,
      reference: r.reference,
      client: nomClient(r.client_prenom, r.client_nom),
      email: r.client_email,
      gite,
      date: String(a.date_emission).slice(0, 10),
      montant: centimesDepuisNumeric(a.montant),
      signeLe: null,
      pdf: a.pdf_url !== null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));

  const ans = await db.execute<{ annee: number }>(sql`
    select distinct annee::int as annee from (
      select extract(year from created_at at time zone 'Europe/Paris') as annee from documents where type = 'contrat_location'
      union select extract(year from date_emission) from factures
      union select extract(year from date_emission) from avoirs
    ) a order by annee desc`);

  return { lignes: lignes.slice(0, LIMITE), annees: ans.rows.map((a) => Number(a.annee)) };
}

/**
 * Chemin du PDF dans le stockage : le contrat signé s'il l'est, sinon celui
 * envoyé à la signature ; la facture émise. `null` si rien à ouvrir.
 */
export async function cheminDocument(sorte: SorteDocument, id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const db = getDb();
  if (sorte === "contrat") {
    const [d] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.type, "contrat_location")));
    if (!d) return null;
    return d.statut === "signe" ? cheminContratSigne(d.reservation_id, d.numero) : d.url_pdf;
  }
  if (sorte === "avoir") {
    const [a] = await db.select({ pdf: avoirs.pdf_url }).from(avoirs).where(eq(avoirs.id, id));
    return a?.pdf ?? null;
  }
  const [f] = await db.select({ pdf: factures.pdf_url }).from(factures).where(eq(factures.id, id));
  return f?.pdf ?? null;
}

/** « Renvoyer au client » : le même document, à l'adresse de la réservation. */
export async function renvoyerDocument(
  sorte: SorteDocument,
  id: string,
  acteur: Acteur,
  maintenant: Date = new Date(),
): Promise<IssueGeste & { reservationId?: string }> {
  if (!isUuid(id)) return { ok: false, message: "Document introuvable." };
  const db = getDb();
  if (sorte === "facture") {
    return db.transaction(async (tx) => {
      const [l] = await tx
        .select({ f: factures, email: reservations.client_email })
        .from(factures)
        .innerJoin(reservations, eq(reservations.id, factures.reservation_id))
        .where(eq(factures.id, id));
      if (!l) return { ok: false, message: "Facture introuvable." };
      if (!(await inscrireFactureRenvoyee(tx, l.f.reservation_id, l.f.type, maintenant))) {
        return { ok: false, message: "Le client n'a pas d'adresse de courriel : corrigez-la d'abord sur la fiche de la réservation." };
      }
      await journaliser(tx, { table: "reservations", ligne: l.f.reservation_id, action: "facture_renvoyee", acteur, details: { numero: l.f.numero } });
      return { ok: true, message: `La facture ${l.f.numero} part à ${l.email}.`, reservationId: l.f.reservation_id };
    });
  }

  if (sorte === "avoir") {
    return db.transaction(async (tx) => {
      const [l] = await tx
        .select({ a: avoirs, email: reservations.client_email })
        .from(avoirs)
        .innerJoin(reservations, eq(reservations.id, avoirs.reservation_id))
        .where(eq(avoirs.id, id));
      if (!l) return { ok: false, message: "Avoir introuvable." };
      if (!(await inscrireAvoir(tx, l.a.reservation_id, maintenant))) {
        return { ok: false, message: "Le client n'a pas d'adresse de courriel : corrigez-la d'abord sur la fiche de la réservation." };
      }
      await journaliser(tx, { table: "reservations", ligne: l.a.reservation_id, action: "avoir_renvoye", acteur, details: { numero: l.a.numero } });
      return { ok: true, message: `L'avoir ${l.a.numero} part à ${l.email}.`, reservationId: l.a.reservation_id };
    });
  }

  const [d] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.type, "contrat_location")));
  if (!d) return { ok: false, message: "Contrat introuvable." };
  if (d.statut !== "signe") {
    const r = await renvoyerLienSignature(d.reservation_id, acteur, maintenant);
    return { ...r, reservationId: d.reservation_id };
  }
  return db.transaction(async (tx) => {
    const [r] = await tx.select({ email: reservations.client_email }).from(reservations).where(eq(reservations.id, d.reservation_id));
    if (!(await inscrireContratSigne(tx, d.reservation_id, maintenant))) {
      return { ok: false, message: "Le client n'a pas d'adresse de courriel : corrigez-la d'abord sur la fiche de la réservation." };
    }
    await journaliser(tx, { table: "reservations", ligne: d.reservation_id, action: "contrat_renvoye", acteur, details: { numero: d.numero } });
    return { ok: true, message: `Le contrat signé ${d.numero} part à ${r?.email}.`, reservationId: d.reservation_id };
  });
}
