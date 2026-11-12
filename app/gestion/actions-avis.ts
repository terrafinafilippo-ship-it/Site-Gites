"use server";
// Les ACTIONS du back-office pour les avis des clients (Phase 6, D-40) : le
// retrait d'un avis, pour un motif de la politique des avis. Après le retrait,
// le site public relit les avis tout de suite (étiquette « gites ») et le
// courriel au client part après la réponse.
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { retirerAvis } from "@/lib/avis";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { acteurDe } from "@/lib/gestion/connexion";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import type { EtatPlan } from "./actions-tarifs";
import { exigerSession, origine, visiteur } from "./outils";

export async function actionRetirerAvis(id: string, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  const session = await exigerSession();
  const suivant = precedent.version + 1;
  if (!isUuid(id)) return { version: suivant, etape: "refus", message: "Avis introuvable.", lignes: [], empreinte: "" };
  const motif = f.get("motif");
  const confirmation = f.get("confirmation");
  try {
    const r = await retirerAvis(
      id,
      typeof motif === "string" ? motif : "",
      acteurDe(session, (await visiteur()).ip),
      typeof confirmation === "string" && confirmation ? confirmation : null,
    );
    if (r.etape === "fait") {
      revalidateTag("gites");
      revalidatePath("/gestion/avis");
      const o = await origine();
      after(() => traiterCourriels(o));
    }
    if (r.etape === "plan") return { version: suivant, etape: "plan", message: r.message ?? "", lignes: r.lignes, empreinte: r.empreinte };
    return { version: suivant, etape: r.etape, message: r.message, lignes: [], empreinte: "" };
  } catch (erreur) {
    console.error("[gestion] retrait d'un avis interrompu :", messageErreur(erreur));
    return { version: suivant, etape: "refus", message: "Le retrait a échoué (panne). Rien n'a changé. Réessayez ; si cela se répète, prévenez le développeur.", lignes: [], empreinte: "" };
  }
}
