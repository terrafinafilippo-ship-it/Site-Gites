// ANNULER UNE RÉSERVATION depuis le back-office (Phase 5, lot 5, D-42 ;
// réponses du 15 novembre 2026 : 1 A, 2 A, 3 A, 4 A, 5 A, 6 A).
//
// En deux temps, comme les autres gestes définitifs : le premier envoi
// revient avec le récapitulatif (règle de l'article 7 appliquée, payé, gardé,
// rendu et comment, nuits, solde, caution, courriel, avoir), « Confirmer »
// annule. Seuls les propriétaires annulent (4 A) : le client leur écrit.
//
// Qui annule (le choix du formulaire) :
//   - « client » : la règle de l'article 7.2 dépend de QUAND il a prévenu
//     (6 A), saisi sur le formulaire (aujourd'hui par défaut), jamais futur ;
//   - « bailleur » : les propriétaires, ou la force majeure (7.3, 7.4) : tout
//     est rendu ;
//   - « absence » : le client ne s'est pas présenté (7.5), à partir du jour
//     de l'arrivée : tout est gardé sauf la taxe de séjour.
// Le montant est toujours celui du contrat (3 A) : lib/montants.ts,
// partageAnnulation.
//
// À la confirmation :
//   1. les paiements du solde encore ouverts chez Stripe sont annulés (le
//      client ne paiera pas après l'annulation) ; s'il venait de payer, rien
//      n'est annulé et le récapitulatif est à relire ;
//   2. dans une transaction : statut « annulee », ligne `annulations`, lignes
//      `remboursements` « à faire » (cartes d'abord, le reste par virement,
//      2 A), nuits libérées, courriel au client, journal ;
//   3. puis les cartes sont remboursées chez Stripe (1 A) ; une caution
//      bloquée sur la carte est levée. Le prélèvement prévu du solde n'a plus
//      lieu (il ne vise que les réservations confirmées).
// Un virement à faire : les propriétaires cliquent « Remboursement fait »
// (noterRemboursementFait). Quand tout est rendu, l'avoir part s'il existe
// une facture (lib/annulation.ts).
//
// MONTANTS EN CENTIMES ENTIERS.
import { createHash } from "node:crypto";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { annulations, factures, paiements, remboursements, reservations } from "@/db/schema";
import { paiementsDuSejour, rembourserCartes, repartirRemboursement, terminerSiRembourse } from "@/lib/annulation";
import { constaterSousVerrou } from "@/lib/caution";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { inscrireAnnulation } from "@/lib/courriels";
import { aujourdhuiParis, heureParis } from "@/lib/dates-civiles";
import { libererNuits } from "@/lib/disponibilites";
import { fmtDateFr, fmtEuro } from "@/lib/format";
import {
  ARTICLE_ANNULATION,
  partageAnnulation,
  type InitiativeAnnulation,
  type PartageAnnulation,
} from "@/lib/montants";
import { constaterPaiement } from "@/lib/paiement";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { prestataire, type Prestataire } from "@/lib/stripe";

import type { IssueGeste } from "./cautions";
import { journaliser, libelleActeur, type Acteur } from "./journal";
import type { IssuePlan } from "./tarifs";

export const INITIATIVES: readonly InitiativeAnnulation[] = ["client", "bailleur", "absence"];
const FORME_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Ce que le formulaire envoie, tel quel. */
export interface SaisieAnnulation {
  initiative: string;
  /** « aaaa-mm-jjThh:mm », heure de Paris (champ date et heure). */
  prevenuLe: string;
}

/** « 2027-02-15T14:30 » → « 15 février 2027 à 14 h 30 ». */
function fmtInstant(civil: string): string {
  const [h, m] = civil.slice(11, 16).split(":");
  return `${fmtDateFr(civil.slice(0, 10))} à ${Number(h)} h ${m}`;
}

/** L'instant présent, en heure civile de Paris (« aaaa-mm-jjThh:mm »). */
export function maintenantCivil(maintenant: Date = new Date()): string {
  return `${aujourdhuiParis(maintenant)}T${heureParis(maintenant)}`;
}

interface Plan {
  lignes: string[];
  partage: PartageAnnulation;
  initiative: InitiativeAnnulation;
  prevenuLe: string | null;
  parts: ReturnType<typeof repartirRemboursement>;
}

type Preparation = { refus: string } | { plan: Plan };

const MOYEN_RECU: Record<string, string> = { cheque: "par chèque", virement: "par virement" };

/** Le récapitulatif, relu en base ; refus si l'annulation n'est pas possible. */
async function preparer(
  tx: Executeur,
  resa: ReservationAvecGite,
  saisie: SaisieAnnulation,
  maintenant: Date,
): Promise<Preparation> {
  if (resa.statut !== "confirmee") return { refus: `Réservation au statut « ${resa.statut} » : elle ne peut pas être annulée.` };
  const [deja] = await tx.select({ id: annulations.id }).from(annulations).where(eq(annulations.reservation_id, resa.id));
  if (deja) return { refus: "Cette réservation est déjà annulée." };
  if (!(INITIATIVES as readonly string[]).includes(saisie.initiative)) return { refus: "Indiquez qui annule." };
  const initiative = saisie.initiative as InitiativeAnnulation;
  const present = maintenantCivil(maintenant);

  let prevenuLe: string | null = null;
  if (initiative === "client") {
    if (!FORME_INSTANT.test(saisie.prevenuLe)) return { refus: "Indiquez quand le client a prévenu (date et heure)." };
    if (saisie.prevenuLe > present) return { refus: "La date où le client a prévenu ne peut pas être dans le futur." };
    if (saisie.prevenuLe.slice(0, 10) < aujourdhuiParis(resa.created_at)) {
      return { refus: "La date où le client a prévenu précède la réservation." };
    }
    prevenuLe = saisie.prevenuLe;
  }
  if (initiative === "absence" && present.slice(0, 10) < resa.date_arrivee) {
    return { refus: `Le client ne peut être déclaré absent qu'à partir du jour de l'arrivée (${fmtDateFr(resa.date_arrivee)}).` };
  }

  const recus = await paiementsDuSejour(tx, resa.id);
  const paye = recus.reduce((s, p) => s + p.montant, 0);
  const partage = partageAnnulation(resa, paye, initiative, prevenuLe);
  const parts = repartirRemboursement(recus, partage.rembourse);
  const article = ARTICLE_ANNULATION[initiative];

  const lignes: string[] = [];
  if (initiative === "client") lignes.push(`Annulation à la demande du client, qui a prévenu le ${fmtInstant(prevenuLe!)}.`);
  else if (initiative === "bailleur") lignes.push("Annulation par vous, ou pour force majeure.");
  else lignes.push("Le client ne s'est pas présenté à l'arrivée.");

  switch (partage.regle) {
    case "avant_solde":
      lignes.push(`Prévenu au plus tard le ${fmtDateFr(partage.dateLimiteSolde!)}, date limite du solde : tout est remboursé (${article}).`);
      break;
    case "avant_limite":
      lignes.push(
        `Prévenu après la date limite du solde, mais avant le ${fmtInstant(partage.limiteRemboursement)} : ` +
          `l'acompte, sans la taxe de séjour, est gardé (${article}).`,
      );
      break;
    case "apres_limite":
      lignes.push(`Prévenu après le ${fmtInstant(partage.limiteRemboursement)} : tout est gardé sauf la taxe de séjour (${article}).`);
      break;
    case "bailleur":
      lignes.push(`Tout est remboursé (${article}).`);
      break;
    case "absence":
      lignes.push(`Tout est gardé sauf la taxe de séjour (${article}).`);
      break;
  }

  const dont = partage.taxeRemboursee > 0 ? `, dont ${fmtEuro(partage.taxeRemboursee)} de taxe de séjour` : "";
  lignes.push(`Payé : ${fmtEuro(paye)}. Gardé : ${fmtEuro(partage.conserve)}. Remboursé : ${fmtEuro(partage.rembourse)}${dont}.`);
  for (const part of parts) {
    lignes.push(
      part.mode === "carte"
        ? `Remboursé sur la carte bancaire du client : ${fmtEuro(part.montant)}, par le site dès la confirmation.`
        : `À rembourser par virement, depuis votre banque : ${fmtEuro(part.montant)}. Cliquez ensuite « Remboursement fait ».`,
    );
  }

  lignes.push(`Les nuits du ${fmtDateFr(resa.date_arrivee)} au ${fmtDateFr(resa.date_depart)} redeviennent libres.`);
  if (!resa.paiement_integral) {
    const [solde] = await tx
      .select({ id: paiements.id })
      .from(paiements)
      .where(and(eq(paiements.reservation_id, resa.id), eq(paiements.type, "solde"), eq(paiements.statut, "reussi")))
      .limit(1);
    if (!solde) lignes.push("Le solde ne sera pas demandé au client.");
  }
  const [caution] = await tx
    .select({ statut: paiements.statut, montant: paiements.montant })
    .from(paiements)
    .where(and(eq(paiements.reservation_id, resa.id), eq(paiements.type, "caution"), isNotNull(paiements.reference_externe)));
  if (caution?.statut === "bloque") {
    lignes.push(`La caution bloquée sur la carte (${fmtEuro(centimesDepuisNumeric(caution.montant))}) est levée.`);
  } else if (resa.caution_recue_at && !resa.caution_rendue_at && resa.caution !== null) {
    lignes.push(
      `La caution reçue ${MOYEN_RECU[resa.moyen_caution ?? ""] ?? ""} (${fmtEuro(resa.caution)}) est à rendre au client : elle apparaît dans « À traiter ».`,
    );
  }

  lignes.push(
    resa.client_email
      ? `Le client reçoit un courriel d'annulation à ${resa.client_email}.`
      : "Le client n'a pas d'adresse de courriel : prévenez-le vous-même.",
  );
  if (partage.rembourse > 0) {
    const [facture] = await tx
      .select({ numero: factures.numero })
      .from(factures)
      .where(and(eq(factures.reservation_id, resa.id), inArray(factures.type, ["acompte", "solde", "total"])))
      .limit(1);
    if (facture) lignes.push(`Une facture a été faite (${facture.numero}) : un avoir de ${fmtEuro(partage.rembourse)} partira au client une fois tout remboursé.`);
  }
  lignes.push("C'est définitif : la réservation ne pourra pas être rétablie.");
  return { plan: { lignes, partage, initiative, prevenuLe, parts } };
}

function empreinteDe(reservationId: string, plan: Plan): string {
  return createHash("sha256").update(JSON.stringify([reservationId, plan.initiative, plan.prevenuLe, plan.lignes])).digest("hex").slice(0, 32);
}

/**
 * Sans `confirmation` : le récapitulatif. Avec : annule les paiements du
 * solde encore ouverts, puis revérifie tout sous verrou, vérifie que le
 * récapitulatif n'a pas changé, et annule.
 */
export async function annulerReservation(
  reservationId: string,
  saisie: SaisieAnnulation,
  acteur: Acteur,
  confirmation: string | null,
  p: Prestataire = prestataire(),
  maintenant: Date = new Date(),
): Promise<IssuePlan> {
  const db = getDb();
  const resa = await chargerReservationAvecGite(reservationId, db);
  if (!resa) return { etape: "refus", message: "Réservation introuvable." };
  const avant = await preparer(db, resa, saisie, maintenant);
  if ("refus" in avant) return { etape: "refus", message: avant.refus };
  const empreinteAvant = empreinteDe(reservationId, avant.plan);
  if (confirmation === null) return { etape: "plan", lignes: avant.plan.lignes, empreinte: empreinteAvant };
  if (confirmation !== empreinteAvant) {
    return { etape: "plan", lignes: avant.plan.lignes, empreinte: empreinteAvant, message: "L'annulation a changé : relisez avant de confirmer." };
  }

  // 1. Les paiements du solde encore ouverts chez Stripe : annulés.
  const ouverts = await db
    .select()
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        eq(paiements.type, "solde"),
        inArray(paiements.statut, ["en_attente", "echoue"]),
        isNotNull(paiements.reference_externe),
      ),
    );
  for (const l of ouverts) {
    const chez = await p.annulerPaiement(l.reference_externe!);
    if (chez.statut === "reussi" || chez.statut === "en_cours") {
      await constaterPaiement(chez.id, p);
      return { etape: "refus", message: "Le client vient de payer son solde en ligne : rien n'est annulé. Relisez avant de recommencer." };
    }
    await db.update(paiements).set({ statut: "annule" }).where(eq(paiements.id, l.id));
  }

  // 2. L'annulation, sous verrou.
  const issue = await db.transaction(async (tx): Promise<IssuePlan | null> => {
    const [verrou] = await tx.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!verrou) return { etape: "refus", message: "Réservation introuvable." };
    const relue = await chargerReservationAvecGite(reservationId, tx);
    if (!relue) return { etape: "refus", message: "Réservation introuvable." };
    const prep = await preparer(tx, relue, saisie, maintenant);
    if ("refus" in prep) return { etape: "refus", message: prep.refus };
    const empreinte = empreinteDe(reservationId, prep.plan);
    if (empreinte !== empreinteAvant) {
      return { etape: "plan", lignes: prep.plan.lignes, empreinte, message: "L'annulation a changé : relisez avant de confirmer." };
    }
    const { partage, initiative, prevenuLe, parts } = prep.plan;

    await tx.update(reservations).set({ statut: "annulee" }).where(eq(reservations.id, reservationId));
    await tx.insert(annulations).values({
      reservation_id: reservationId,
      initiative,
      prevenu_le: prevenuLe ? `${prevenuLe.replace("T", " ")}:00` : null,
      paye: numericDepuisCentimes(partage.paye),
      conserve: numericDepuisCentimes(partage.conserve),
      rembourse: numericDepuisCentimes(partage.rembourse),
      taxe_remboursee: numericDepuisCentimes(partage.taxeRemboursee),
      date_arrivee: relue.date_arrivee,
      acteur: libelleActeur(acteur),
    });
    for (const part of parts) {
      await tx.insert(remboursements).values({
        reservation_id: reservationId,
        paiement_id: part.paiementId,
        mode: part.mode,
        montant: numericDepuisCentimes(part.montant),
      });
    }
    await libererNuits(tx, reservationId);
    await inscrireAnnulation(tx, reservationId);
    await journaliser(tx, {
      table: "reservations",
      ligne: reservationId,
      action: "reservation_annulee",
      acteur,
      details: {
        initiative,
        prevenu_le: prevenuLe,
        regle: partage.regle,
        paye: partage.paye,
        conserve: partage.conserve,
        rembourse: partage.rembourse,
      },
    });
    return null;
  });
  if (issue) return issue;

  // 3. Les cartes, chez Stripe ; la caution bloquée, levée.
  await rembourserCartes(reservationId, p);
  await leverCaution(reservationId, p);

  const mouvements = await db.select().from(remboursements).where(eq(remboursements.reservation_id, reservationId));
  const somme = (f: (m: (typeof mouvements)[number]) => boolean) =>
    mouvements.filter(f).reduce((s, m) => s + centimesDepuisNumeric(m.montant), 0);
  const carteFaite = somme((m) => m.mode === "carte" && m.statut === "fait");
  const carteEnCours = somme((m) => m.mode === "carte" && m.statut === "a_faire");
  const virement = somme((m) => m.mode === "virement" && m.statut === "a_faire");
  const refusee = mouvements.some((m) => m.erreur !== null);
  const phrases = ["La réservation est annulée."];
  if (carteFaite > 0) phrases.push(`Remboursé sur la carte : ${fmtEuro(carteFaite)}.`);
  if (carteEnCours > 0) phrases.push(`Le remboursement sur la carte (${fmtEuro(carteEnCours)}) n'a pas encore abouti : le site le retente tout seul.`);
  if (virement > 0) {
    phrases.push(
      `${refusee ? "La banque a refusé de rembourser la carte. " : ""}À rembourser par virement : ${fmtEuro(virement)} — cliquez « Remboursement fait » une fois le virement parti.`,
    );
  }
  return { etape: "fait", message: phrases.join(" ") };
}

/** Lève la caution bloquée sur la carte d'une réservation annulée. Ne lève pas : la tâche de levée rattrape. */
async function leverCaution(reservationId: string, p: Prestataire): Promise<void> {
  const [ligne] = await getDb()
    .select()
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, reservationId),
        eq(paiements.type, "caution"),
        inArray(paiements.statut, ["bloque", "en_attente", "echoue"]),
        isNotNull(paiements.reference_externe),
      ),
    );
  if (!ligne) return;
  try {
    const etat = await p.annulerPaiement(ligne.reference_externe!);
    await constaterSousVerrou(ligne.id, etat);
  } catch (erreur) {
    console.error(`[annulation] caution non levée (${reservationId}), la tâche de levée rattrapera :`, erreur);
  }
}

/**
 * « Remboursement fait » : les propriétaires ont viré la somme au client.
 * Quand tout est rendu, l'avoir part s'il existe une facture.
 */
export async function noterRemboursementFait(remboursementId: string, acteur: Acteur): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    const [ligne] = await tx.select().from(remboursements).where(eq(remboursements.id, remboursementId)).for("update");
    if (!ligne) return { ok: false, message: "Remboursement introuvable." };
    if (ligne.mode !== "virement") return { ok: false, message: "Ce remboursement se fait sur la carte, par le site." };
    if (ligne.statut === "fait") return { ok: false, message: "Ce remboursement est déjà noté fait." };
    await tx
      .update(remboursements)
      .set({ statut: "fait", fait_at: sql`now()`, fait_par: libelleActeur(acteur) })
      .where(eq(remboursements.id, remboursementId));
    await journaliser(tx, {
      table: "reservations",
      ligne: ligne.reservation_id,
      action: "remboursement_fait",
      acteur,
      details: { montant: centimesDepuisNumeric(ligne.montant), mode: "virement" },
    });
    const tout = await terminerSiRembourse(tx, ligne.reservation_id);
    return {
      ok: true,
      message: `Remboursement de ${fmtEuro(centimesDepuisNumeric(ligne.montant))} noté fait.${tout ? " Tout est remboursé." : ""}`,
    };
  });
}
