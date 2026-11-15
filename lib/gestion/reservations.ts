// LES RÉSERVATIONS DANS LE BACK-OFFICE (Phase 5, lot 2), cadrage du
// 6 novembre 2026 :
//   - la LISTE montre par défaut les séjours à venir et en cours ; les passés
//     et les annulés par un filtre ; une recherche par nom, courriel ou
//     référence ; les tentatives jamais payées n'y sont pas (réponse 7 A) ;
//   - la FICHE dit tout d'une réservation (client, séjour, montants,
//     paiements, caution, contrat et factures, courriels, journal) ;
//   - on n'y modifie que ce qui n'est écrit sur aucun document émis : le
//     téléphone, le courriel et une note interne (réponse 5 A du cadrage de la
//     phase). Un courriel changé vaut pour les courriels suivants ; l'ancien
//     reste au journal ; rien n'est envoyé (réponse 8 A).
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import {
  annulations,
  audit_logs,
  avoirs,
  courriels,
  documents,
  factures,
  gites,
  paiements,
  remboursements,
  reservations,
  retenues,
} from "@/db/schema";
import { lireEtatCaution, type EtatCaution } from "@/lib/caution";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { inscrireContratRenvoye } from "@/lib/courriels";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { calculerMontants, type Montants } from "@/lib/montants";
import { chargerReservationAvecGite, type ReservationAvecGite } from "@/lib/reservations";
import { lireEtatSolde, type EtatSolde } from "@/lib/solde";
import { FORME_EMAIL } from "@/lib/suivi";

import type { IssueGeste } from "./cautions";
import { journaliser, type Acteur } from "./journal";

export const VUES = ["a_venir", "passees", "annulees"] as const;
export type Vue = (typeof VUES)[number];

export interface LigneListe {
  id: string;
  reference: string;
  client: string;
  email: string | null;
  gite: string;
  arrivee: string;
  depart: string;
  voyageurs: number;
  statut: string;
  enCours: boolean;
}

export async function listerReservations(vue: Vue, recherche: string, maintenant: Date = new Date()): Promise<LigneListe[]> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const conditions: SQL[] = [];
  if (vue === "a_venir") {
    conditions.push(eq(reservations.statut, "confirmee"), sql`${reservations.date_depart} >= ${aujourdhui}::date`);
  } else if (vue === "passees") {
    conditions.push(
      inArray(reservations.statut, ["confirmee", "terminee"]),
      sql`(${reservations.date_depart} < ${aujourdhui}::date or ${reservations.statut} = 'terminee')`,
    );
  } else {
    conditions.push(eq(reservations.statut, "annulee"));
  }
  const q = recherche.trim().slice(0, 80);
  if (q) {
    const motif = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        ilike(reservations.reference, motif),
        ilike(reservations.client_nom, motif),
        ilike(reservations.client_prenom, motif),
        ilike(reservations.client_email, motif),
      )!,
    );
  }
  const lignes = await getDb()
    .select({ r: reservations, gite: gites.nom })
    .from(reservations)
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(and(...conditions))
    .orderBy(vue === "a_venir" ? asc(reservations.date_arrivee) : desc(reservations.date_arrivee))
    .limit(200);
  return lignes.map(({ r, gite }) => ({
    id: r.id,
    reference: r.reference,
    client: [r.client_prenom, (r.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client",
    email: r.client_email,
    gite,
    arrivee: r.date_arrivee,
    depart: r.date_depart,
    voyageurs: r.nb_adultes + r.nb_enfants + r.nb_bebes,
    statut: r.statut,
    enCours: r.date_arrivee <= aujourdhui && aujourdhui <= r.date_depart,
  }));
}

export interface Fiche {
  resa: ReservationAvecGite;
  montants: Montants | null;
  solde: EtatSolde | null;
  /** Caution par carte (lib/caution.ts). */
  caution: EtatCaution | null;
  ligneCaution: typeof paiements.$inferSelect | null;
  retenue: typeof retenues.$inferSelect | null;
  paiements: (typeof paiements.$inferSelect)[];
  documents: (typeof documents.$inferSelect)[];
  factures: (typeof factures.$inferSelect)[];
  /** Annulation depuis le back-office (Phase 5, lot 5) : la règle et son résultat, les remboursements, l'avoir. */
  annulation: typeof annulations.$inferSelect | null;
  remboursements: (typeof remboursements.$inferSelect)[];
  avoir: typeof avoirs.$inferSelect | null;
  courriels: { objet: string; destinataire: string; statut: string; sujet: string | null; quand: Date }[];
  journal: (typeof audit_logs.$inferSelect)[];
}

export async function lireFiche(id: string, maintenant: Date = new Date()): Promise<Fiche | null> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(id, db);
  if (!resa || resa.statut === "brouillon" || resa.statut === "en_attente_paiement") return null;
  const aujourdhui = aujourdhuiParis(maintenant);
  let montants: Montants | null = null;
  try {
    montants = calculerMontants(resa);
  } catch {
    // Réservation saisie sans montants complets : la fiche s'affiche quand même.
  }
  const [lignes, docs, facs, mails, journal, [retenue], [annulation], mouvements, [avoir]] = await Promise.all([
    db.select().from(paiements).where(eq(paiements.reservation_id, id)).orderBy(asc(paiements.created_at)),
    db.select().from(documents).where(eq(documents.reservation_id, id)),
    db.select().from(factures).where(eq(factures.reservation_id, id)).orderBy(asc(factures.date_emission)),
    db
      .select({ objet: courriels.objet, destinataire: courriels.destinataire, statut: courriels.statut, sujet: courriels.sujet, quand: courriels.created_at })
      .from(courriels)
      .where(eq(courriels.reservation_id, id))
      .orderBy(desc(courriels.created_at))
      .limit(100),
    db
      .select()
      .from(audit_logs)
      .where(and(eq(audit_logs.table_cible, "reservations"), eq(audit_logs.ligne_id, id)))
      .orderBy(desc(audit_logs.created_at))
      .limit(100),
    db.select().from(retenues).where(eq(retenues.reservation_id, id)),
    db.select().from(annulations).where(eq(annulations.reservation_id, id)),
    db.select().from(remboursements).where(eq(remboursements.reservation_id, id)).orderBy(asc(remboursements.created_at)),
    db.select().from(avoirs).where(eq(avoirs.reservation_id, id)),
  ]);
  return {
    resa,
    montants,
    solde: resa.statut === "annulee" ? null : await lireEtatSolde(db, resa, aujourdhui),
    caution: await lireEtatCaution(db, resa, aujourdhui),
    ligneCaution: lignes.find((l) => l.type === "caution") ?? null,
    retenue: retenue ?? null,
    paiements: lignes,
    documents: docs,
    factures: facs,
    annulation: annulation ?? null,
    remboursements: mouvements,
    avoir: avoir ?? null,
    courriels: mails,
    journal,
  };
}

/** Montant d'une ligne `paiements` en centimes (frontière base → mémoire). */
export const montantDe = (l: { montant: string }) => centimesDepuisNumeric(l.montant);

const FORME_TELEPHONE = /^[0-9+().\s-]{6,30}$/;

/** Téléphone, courriel, note interne : rien de ce qui est écrit sur un document émis. */
export async function modifierCoordonnees(
  id: string,
  saisie: { email: string; telephone: string; note: string },
  acteur: Acteur,
): Promise<IssueGeste> {
  const email = saisie.email.trim().toLowerCase();
  const telephone = saisie.telephone.trim();
  const note = saisie.note.trim().slice(0, 4000);
  if (!FORME_EMAIL.test(email) || email.length > 254) return { ok: false, message: "Le courriel n'est pas valable." };
  if (telephone && !FORME_TELEPHONE.test(telephone)) return { ok: false, message: "Le téléphone n'est pas valable (chiffres, espaces, +, tirets)." };
  return getDb().transaction(async (tx) => {
    const [r] = await tx.select().from(reservations).where(eq(reservations.id, id)).for("update");
    if (!r) return { ok: false, message: "Réservation introuvable." };
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    if ((r.client_email ?? "") !== email) changements.client_email = { avant: r.client_email, apres: email };
    if ((r.client_telephone ?? "") !== telephone) changements.client_telephone = { avant: r.client_telephone, apres: telephone || null };
    if ((r.note_interne ?? "") !== note) changements.note_interne = { avant: r.note_interne, apres: note || null };
    if (!Object.keys(changements).length) return { ok: true, message: "Aucun changement." };
    await tx
      .update(reservations)
      .set({ client_email: email, client_telephone: telephone || null, note_interne: note || null })
      .where(eq(reservations.id, id));
    await journaliser(tx, { table: "reservations", ligne: id, action: "coordonnees_modifiees", acteur, details: { changements } });
    return { ok: true, message: "Enregistré. Les prochains courriels partent à l'adresse indiquée." };
  });
}

/** « Renvoyer le lien de signature » (réponse b du cadrage du lot 2). */
export async function renvoyerLienSignature(id: string, acteur: Acteur, maintenant: Date = new Date()): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    const [r] = await tx.select().from(reservations).where(eq(reservations.id, id)).for("update");
    if (!r || r.statut !== "confirmee") return { ok: false, message: "Seule une réservation confirmée a un contrat à signer." };
    const [contrat] = await tx
      .select({ statut: documents.statut })
      .from(documents)
      .where(and(eq(documents.reservation_id, id), eq(documents.type, "contrat_location")));
    if (!contrat) return { ok: false, message: "Le contrat n'existe pas encore : une alerte « contrat non créé » a dû partir." };
    if (contrat.statut === "signe") return { ok: false, message: "Le contrat est déjà signé." };
    if (!(await inscrireContratRenvoye(tx, id, maintenant))) return { ok: false, message: "Le client n'a pas d'adresse de courriel." };
    await journaliser(tx, { table: "reservations", ligne: id, action: "lien_signature_renvoye", acteur });
    return { ok: true, message: `Le lien de signature part à ${r.client_email}.` };
  });
}
