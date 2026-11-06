"use server";
// Les ACTIONS du back-office sur les réservations (Phase 5, lot 2) : chacune
// relit la session, appelle lib/gestion/, rafraîchit la fiche et l'accueil,
// puis envoie les courriels inscrits (après la réponse).
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { centimesDepuisNumeric } from "@/lib/centimes";
import { traiterCourriels } from "@/lib/courriels-envoi";
import { marquerFait } from "@/lib/gestion/a-traiter";
import {
  envoyerLienCaution,
  libererCaution,
  noterCautionRecue,
  noterCautionRendue,
  retenirCaution,
  type Fichier,
  type IssueGeste,
} from "@/lib/gestion/cautions";
import { acteurDe } from "@/lib/gestion/connexion";
import type { Acteur } from "@/lib/gestion/journal";
import { modifierCoordonnees, renvoyerLienSignature } from "@/lib/gestion/reservations";
import { noterSoldeVirement } from "@/lib/gestion/solde-virement";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import { exigerSession, origine, visiteur } from "./outils";

/** Ce qu'un formulaire de geste réaffiche. */
export interface EtatGeste {
  version: number;
  ok: boolean | null;
  message: string;
}

function texte(f: FormData, nom: string): string {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
}

/** « 120 », « 120,50 » → centimes, sans calcul flottant (lib/centimes.ts) ; null si mal formé. */
function centimesSaisis(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  return centimesDepuisNumeric(t);
}

async function geste(
  precedent: EtatGeste,
  reservationId: string | null,
  faire: (acteur: Acteur) => Promise<IssueGeste>,
): Promise<EtatGeste> {
  const a = await acteur();
  let r: IssueGeste;
  try {
    r = await faire(a);
  } catch (erreur) {
    console.error("[gestion] geste interrompu :", messageErreur(erreur));
    return { version: precedent.version + 1, ok: false, message: "Le geste n'a pas abouti (panne). Réessayez ; si cela se répète, prévenez le développeur." };
  }
  if (r.ok) {
    if (reservationId) revalidatePath(`/gestion/reservations/${reservationId}`);
    revalidatePath("/gestion");
    const o = await origine();
    after(() => traiterCourriels(o));
  }
  return { version: precedent.version + 1, ok: r.ok, message: r.message };
}

async function acteur(): Promise<Acteur> {
  const session = await exigerSession();
  return acteurDe(session, (await visiteur()).ip);
}

function idValable(id: string): string {
  if (!isUuid(id)) throw new Error("identifiant de réservation invalide");
  return id;
}

export async function actionLiberer(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) => libererCaution(id, a));
}

export async function actionRetenir(id: string, precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  // La session d'abord : aucun fichier n'est lu pour un visiteur non connecté.
  await exigerSession();
  idValable(id);
  const montant = centimesSaisis(texte(f, "montant"));
  if (montant === null) return { version: precedent.version + 1, ok: false, message: "Le montant n'est pas valable (par exemple 120 ou 120,50)." };
  const fichiers: Fichier[] = [];
  for (const v of f.getAll("pieces")) {
    if (typeof v === "string" || v.size === 0) continue;
    fichiers.push({ nom: v.name, type: v.type, contenu: new Uint8Array(await v.arrayBuffer()) });
  }
  return geste(precedent, id, (a) => retenirCaution(id, { montant, motif: texte(f, "motif"), fichiers }, a));
}

export async function actionCautionRecue(id: string, precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) => noterCautionRecue(id, texte(f, "date"), a));
}

export async function actionCautionRendue(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) => noterCautionRendue(id, a));
}

export async function actionLienCaution(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) => envoyerLienCaution(id, a));
}

export async function actionSoldeVirement(id: string, precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  await exigerSession();
  idValable(id);
  const montant = centimesSaisis(texte(f, "montant"));
  if (montant === null) return { version: precedent.version + 1, ok: false, message: "Le montant n'est pas valable (par exemple 403,66)." };
  return geste(precedent, id, (a) => noterSoldeVirement(id, { date: texte(f, "date"), montant, reference: texte(f, "reference") }, a));
}

export async function actionCoordonnees(id: string, precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) =>
    modifierCoordonnees(id, { email: texte(f, "email"), telephone: texte(f, "telephone"), note: texte(f, "note") }, a),
  );
}

export async function actionRenvoyerContrat(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, idValable(id), (a) => renvoyerLienSignature(id, a));
}

export async function actionCestFait(cle: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, null, async (a) =>
    (await marquerFait(cle, a)) ? { ok: true, message: "Retiré de la liste." } : { ok: false, message: "Cette ligne ne se retire pas à la main." },
  );
}
