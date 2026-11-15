// Les FACTURES SUR DEMANDE (D-41, 14 novembre 2026) : le site ne fait plus de
// facture tout seul ; quand un client en demande une, les propriétaires
// cliquent « Créer et envoyer la facture » sur la fiche de la réservation.
//
//   - « total » : la facture du séjour entier, une fois le séjour entièrement
//     payé (en une fois, ou acompte puis solde) ;
//   - « retenue » : la facture d'une retenue faite sur la caution.
//
// En deux temps, comme les autres gestes définitifs du back-office : le
// premier envoi revient avec le récapitulatif (montant, destinataire,
// adresse du courriel, « ne pourra plus être supprimée »), « Confirmer »
// inscrit le courriel. La facture elle-même (ligne légale, numéro, PDF) naît à
// l'envoi du courriel, par lib/factures.ts, qui refait les mêmes contrôles :
// un numéro n'est frappé que si la facture peut vraiment être émise.
//
// La facture peut être au nom d'une entreprise (réponse 2 A) : raison
// sociale, adresse, SIREN facultatif. Sans saisie, elle est au nom de la
// personne qui a réservé.
import { createHash } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { courriels, factures, paiements, reservations, retenues } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { inscrireFactureDemandee } from "@/lib/courriels";
import { fmtEuro } from "@/lib/format";
import { calculerMontants, type EntrepriseFacture } from "@/lib/montants";
import { chargerReservationAvecGite } from "@/lib/reservations";

import { journaliser, type Acteur } from "./journal";
import type { IssuePlan } from "./tarifs";

export type TypeFactureDemandee = "total" | "retenue";

/** Ce que le formulaire « Au nom d'une entreprise » envoie, tel quel. */
export interface SaisieEntreprise {
  raisonSociale: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  siren: string;
}

const LIMITES: Record<Exclude<keyof SaisieEntreprise, "siren">, [string, number]> = {
  raisonSociale: ["le nom de l'entreprise", 120],
  adresse: ["l'adresse", 200],
  codePostal: ["le code postal", 20],
  ville: ["la ville", 80],
  pays: ["le pays", 60],
};

/**
 * La saisie de l'entreprise : `null` si le nom de l'entreprise est vide (la
 * facture est alors au nom du client), une entreprise complète, ou le refus.
 */
export function lireEntrepriseSaisie(s: SaisieEntreprise): { entreprise: EntrepriseFacture | null } | { refus: string } {
  const propre = (v: string) => v.replace(/\s+/g, " ").trim();
  const valeurs = {
    raisonSociale: propre(s.raisonSociale),
    adresse: propre(s.adresse),
    codePostal: propre(s.codePostal),
    ville: propre(s.ville),
    pays: propre(s.pays) || "France",
  };
  if (!valeurs.raisonSociale) {
    const autre = valeurs.adresse || valeurs.codePostal || valeurs.ville || propre(s.siren);
    return autre ? { refus: "Indiquez le nom de l'entreprise, ou videz les champs pour une facture au nom du client." } : { entreprise: null };
  }
  for (const [cle, [nom, max]] of Object.entries(LIMITES) as [keyof typeof LIMITES, [string, number]][]) {
    if (!valeurs[cle]) return { refus: `Indiquez ${nom}.` };
    if (valeurs[cle].length > max) return { refus: `${nom.charAt(0).toUpperCase()}${nom.slice(1)} dépasse ${max} caractères.` };
  }
  const chiffres = s.siren.replace(/\s+/g, "");
  if (chiffres && !/^\d{9}$/.test(chiffres)) return { refus: "Le SIREN compte 9 chiffres (ou laissez-le vide)." };
  return {
    entreprise: { ...valeurs, siren: chiffres ? `${chiffres.slice(0, 3)} ${chiffres.slice(3, 6)} ${chiffres.slice(6)}` : null },
  };
}

/**
 * Sans `confirmation` : le récapitulatif. Avec : revérifie tout sous verrou
 * (la réservation), vérifie que le récapitulatif n'a pas changé, puis inscrit
 * le courriel qui crée et envoie la facture.
 */
export async function demanderFacture(
  reservationId: string,
  type: TypeFactureDemandee,
  entreprise: EntrepriseFacture | null,
  acteur: Acteur,
  confirmation: string | null,
  maintenant: Date = new Date(),
): Promise<IssuePlan> {
  return getDb().transaction(async (tx) => {
    const [verrou] = await tx.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, reservationId)).for("update");
    if (!verrou) return { etape: "refus" as const, message: "Réservation introuvable." };
    const resa = await chargerReservationAvecGite(reservationId, tx);
    if (!resa) return { etape: "refus" as const, message: "Réservation introuvable." };
    if (resa.statut !== "confirmee" && resa.statut !== "terminee") {
      return { etape: "refus" as const, message: `Réservation au statut « ${resa.statut} » : pas de facture.` };
    }
    if (!resa.client_email) return { etape: "refus" as const, message: "Le client n'a pas d'adresse de courriel : corrigez-la d'abord sur la fiche." };

    const deja = await tx
      .select({ numero: factures.numero, type: factures.type })
      .from(factures)
      .where(
        and(
          eq(factures.reservation_id, reservationId),
          inArray(factures.type, type === "total" ? ["total", "acompte", "solde"] : ["retenue"]),
        ),
      );
    if (deja.length > 0) {
      return { etape: "refus" as const, message: `La facture ${deja[0].numero} existe déjà : utilisez « Renvoyer la facture ».` };
    }
    const enCours = await tx
      .select({ id: courriels.id })
      .from(courriels)
      .where(
        and(
          eq(courriels.reservation_id, reservationId),
          eq(courriels.objet, "facture"),
          eq(courriels.statut, "a_envoyer"),
          sql`${courriels.donnees}->>'type' = ${type}`,
        ),
      )
      .limit(1);
    if (enCours.length > 0) return { etape: "refus" as const, message: "Cette facture est déjà en cours d'envoi." };

    let montant: number;
    if (type === "total") {
      if (!resa.paiement_integral) {
        const [solde] = await tx
          .select({ id: paiements.id })
          .from(paiements)
          .where(and(eq(paiements.reservation_id, reservationId), eq(paiements.type, "solde"), eq(paiements.statut, "reussi")))
          .limit(1);
        if (!solde) return { etape: "refus" as const, message: "Le solde n'est pas encore reçu : la facture se fait une fois le séjour entièrement payé." };
      }
      montant = calculerMontants(resa).totalTtc;
    } else {
      const [r] = await tx.select().from(retenues).where(eq(retenues.reservation_id, reservationId)).limit(1);
      if (!r?.faite_at) return { etape: "refus" as const, message: "Aucune retenue n'a été faite sur la caution : pas de facture de retenue." };
      montant = centimesDepuisNumeric(r.montant);
    }

    const client = [resa.client_prenom, resa.client_nom?.toUpperCase()].filter(Boolean).join(" ") || "le client";
    const lignes = [
      `${type === "total" ? "Facture du séjour" : "Facture de la retenue sur la caution"} : ${fmtEuro(montant)}, au nom de ${entreprise ? entreprise.raisonSociale : client}.`,
      ...(entreprise
        ? [`Adresse : ${entreprise.adresse}, ${entreprise.codePostal} ${entreprise.ville}, ${entreprise.pays}${entreprise.siren ? ` — SIREN ${entreprise.siren}` : ""}.`]
        : []),
      `Envoyée par courriel à ${resa.client_email}.`,
      "Elle reçoit le prochain numéro de facture et ne pourra plus être supprimée.",
    ];
    const empreinte = createHash("sha256").update(JSON.stringify([reservationId, type, entreprise, lignes])).digest("hex").slice(0, 32);
    if (confirmation === null) return { etape: "plan" as const, lignes, empreinte };
    if (confirmation !== empreinte) return { etape: "plan" as const, lignes, empreinte, message: "La facture a changé : relisez avant de confirmer." };

    await inscrireFactureDemandee(tx, reservationId, type, entreprise, maintenant);
    await journaliser(tx, {
      table: "reservations",
      ligne: reservationId,
      action: "facture_demandee",
      acteur,
      details: { type, entreprise: entreprise?.raisonSociale ?? null },
    });
    return { etape: "fait" as const, message: `La facture est créée et part à ${resa.client_email} dans un instant.` };
  });
}
