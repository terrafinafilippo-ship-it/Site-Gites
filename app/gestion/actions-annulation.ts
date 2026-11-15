"use server";
// L'ACTION du back-office « Annuler la réservation » (Phase 5, lot 5, D-42),
// en deux temps. Les cartes sont remboursées avant la réponse (le message dit
// ce qui a abouti) ; le courriel au client part après.
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import { annulerReservation } from "@/lib/gestion/annulation";
import { acteurDe } from "@/lib/gestion/connexion";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import type { EtatPlan } from "./actions-tarifs";
import { exigerSession, origine, visiteur } from "./outils";

const champ = (f: FormData, nom: string) => {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
};

export async function actionAnnuler(reservationId: string, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  const session = await exigerSession();
  const suivant = precedent.version + 1;
  const refus = (message: string): EtatPlan => ({ version: suivant, etape: "refus", message, lignes: [], empreinte: "" });
  if (!isUuid(reservationId)) return refus("Réservation introuvable.");
  try {
    const r = await annulerReservation(
      reservationId,
      { initiative: champ(f, "initiative"), prevenuLe: champ(f, "prevenuLe") },
      acteurDe(session, (await visiteur()).ip),
      champ(f, "confirmation") || null,
    );
    if (r.etape === "fait") {
      revalidatePath(`/gestion/reservations/${reservationId}`);
      revalidatePath("/gestion");
      const o = await origine();
      after(() => traiterCourriels(o));
    }
    if (r.etape === "plan") return { version: suivant, etape: "plan", message: r.message ?? "", lignes: r.lignes, empreinte: r.empreinte };
    return { version: suivant, etape: r.etape, message: r.message, lignes: [], empreinte: "" };
  } catch (erreur) {
    console.error("[gestion] annulation interrompue :", messageErreur(erreur));
    return refus("L'annulation a échoué (panne). Vérifiez la fiche avant de réessayer ; si cela se répète, prévenez le développeur.");
  }
}
