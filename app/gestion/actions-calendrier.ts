"use server";
// Les ACTIONS du back-office pour le calendrier, les fiches des gîtes et les
// documents (Phase 5, lot 4). Chacune relit la session, lit le formulaire,
// appelle lib/gestion/ ; après une écriture, le site public relit le
// calendrier et les fiches tout de suite (étiquette « gites »), et les
// courriels inscrits partent après la réponse (lien d'option, document
// renvoyé).
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import { fermerNuits, leverOption, poserOption, rouvrirNuits } from "@/lib/gestion/calendrier";
import type { IssueGeste } from "@/lib/gestion/cautions";
import { acteurDe } from "@/lib/gestion/connexion";
import { renvoyerDocument, type SorteDocument } from "@/lib/gestion/documents";
import { enregistrerGite } from "@/lib/gestion/gites";
import type { Acteur } from "@/lib/gestion/journal";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import type { EtatGeste } from "./actions-reservations";
import type { EtatPlan } from "./actions-tarifs";
import { exigerSession, origine, visiteur } from "./outils";

function texte(f: FormData, nom: string): string {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
}

async function acteur(): Promise<Acteur> {
  const session = await exigerSession();
  return acteurDe(session, (await visiteur()).ip);
}

async function envoyerCourriels(): Promise<void> {
  const o = await origine();
  after(() => traiterCourriels(o));
}

async function geste(
  precedent: EtatGeste,
  faire: (a: Acteur) => Promise<IssueGeste & { reservationId?: string }>,
  apres: (r: IssueGeste & { reservationId?: string }) => void,
): Promise<EtatGeste> {
  const a = await acteur();
  try {
    const r = await faire(a);
    if (r.ok) {
      apres(r);
      revalidatePath("/gestion");
      await envoyerCourriels();
    }
    return { version: precedent.version + 1, ok: r.ok, message: r.message };
  } catch (erreur) {
    console.error("[gestion] geste interrompu :", messageErreur(erreur));
    return { version: precedent.version + 1, ok: false, message: "Le geste n'a pas abouti (panne). Rien n'a changé. Réessayez ; si cela se répète, prévenez le développeur." };
  }
}

function calendrierChange(): void {
  revalidateTag("gites");
  revalidatePath("/gestion/calendrier");
}

function idValable(id: string): string {
  if (!isUuid(id)) throw new Error("identifiant invalide");
  return id;
}

// ─── Calendrier ──────────────────────────────────────────────────────────────

export async function actionFermer(precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  return geste(precedent, (a) => fermerNuits({ giteId: texte(f, "gite"), du: texte(f, "du"), au: texte(f, "au") }, a), calendrierChange);
}

export async function actionRouvrir(giteId: string, du: string, au: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, (a) => rouvrirNuits({ giteId: idValable(giteId), du, au }, a), calendrierChange);
}

export async function actionPoserOption(precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  return geste(
    precedent,
    (a) =>
      poserOption(
        {
          giteId: texte(f, "gite"),
          arrivee: texte(f, "arrivee"),
          depart: texte(f, "depart"),
          nom: texte(f, "nom"),
          email: texte(f, "email"),
          langue: texte(f, "langue"),
        },
        a,
      ),
    calendrierChange,
  );
}

export async function actionLeverOption(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  return geste(precedent, (a) => leverOption(idValable(id), a), calendrierChange);
}

// ─── Fiches des gîtes ────────────────────────────────────────────────────────

export async function actionGite(id: string, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idValable(id);
  const a = await acteur();
  const suivant = precedent.version + 1;
  try {
    const r = await enregistrerGite(
      id,
      {
        capacite: texte(f, "capacite"),
        menage: texte(f, "menage"),
        caution: texte(f, "caution"),
        equipements: texte(f, "equipements"),
        telephone: texte(f, "telephone"),
        spa: texte(f, "spa") === "oui",
        sauna: texte(f, "sauna") === "oui",
        gdfNote: texte(f, "gdf_note"),
        gdfNombre: texte(f, "gdf_nombre"),
        gdfReco: texte(f, "gdf_reco"),
        gdfLien: texte(f, "gdf_lien"),
      },
      a,
      texte(f, "confirmation") || null,
    );
    if (r.etape === "fait") {
      revalidateTag("gites");
      revalidatePath("/gestion/gites");
    }
    if (r.etape === "plan") return { version: suivant, etape: "plan", message: r.message ?? "", lignes: r.lignes, empreinte: r.empreinte };
    return { version: suivant, etape: r.etape, message: r.message, lignes: [], empreinte: "" };
  } catch (erreur) {
    console.error("[gestion] fiche du gîte : enregistrement interrompu :", messageErreur(erreur));
    return { version: suivant, etape: "refus", message: "L'enregistrement a échoué (panne). Rien n'a changé. Réessayez ; si cela se répète, prévenez le développeur.", lignes: [], empreinte: "" };
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function actionRenvoyerDocument(sorte: SorteDocument, id: string, precedent: EtatGeste): Promise<EtatGeste> {
  if (sorte !== "contrat" && sorte !== "facture") throw new Error("sorte de document invalide");
  return geste(
    precedent,
    (a) => renvoyerDocument(sorte, idValable(id), a),
    (r) => {
      revalidatePath("/gestion/documents");
      if (r.reservationId) revalidatePath(`/gestion/reservations/${r.reservationId}`);
    },
  );
}
