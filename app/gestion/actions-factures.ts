"use server";
// Les ACTIONS du back-office pour les factures sur demande (D-41) : « Créer et
// envoyer la facture » du séjour, en deux temps. Le courriel, qui
// crée la facture et la joint, part après la réponse.
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import { acteurDe } from "@/lib/gestion/connexion";
import { demanderFacture, lireEntrepriseSaisie, type TypeFactureDemandee } from "@/lib/gestion/factures";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import type { EtatPlan } from "./actions-tarifs";
import { exigerSession, origine, visiteur } from "./outils";

const champ = (f: FormData, nom: string) => {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
};

export async function actionDemanderFacture(
  reservationId: string,
  type: TypeFactureDemandee,
  precedent: EtatPlan,
  f: FormData,
): Promise<EtatPlan> {
  const session = await exigerSession();
  const suivant = precedent.version + 1;
  const refus = (message: string): EtatPlan => ({ version: suivant, etape: "refus", message, lignes: [], empreinte: "" });
  if (!isUuid(reservationId) || type !== "total") return refus("Réservation introuvable.");
  const saisie = lireEntrepriseSaisie({
    raisonSociale: champ(f, "raisonSociale"),
    adresse: champ(f, "adresse"),
    codePostal: champ(f, "codePostal"),
    ville: champ(f, "ville"),
    pays: champ(f, "pays"),
    siren: champ(f, "siren"),
  });
  if ("refus" in saisie) return refus(saisie.refus);
  const confirmation = champ(f, "confirmation");
  try {
    const r = await demanderFacture(
      reservationId,
      type,
      saisie.entreprise,
      acteurDe(session, (await visiteur()).ip),
      confirmation || null,
    );
    if (r.etape === "fait") {
      revalidatePath(`/gestion/reservations/${reservationId}`);
      const o = await origine();
      after(() => traiterCourriels(o));
    }
    if (r.etape === "plan") return { version: suivant, etape: "plan", message: r.message ?? "", lignes: r.lignes, empreinte: r.empreinte };
    return { version: suivant, etape: r.etape, message: r.message, lignes: [], empreinte: "" };
  } catch (erreur) {
    console.error("[gestion] facture demandée interrompue :", messageErreur(erreur));
    return refus("La demande a échoué (panne). Aucune facture n'a été créée. Réessayez ; si cela se répète, prévenez le développeur.");
  }
}
