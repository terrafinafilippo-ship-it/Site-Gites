"use server";
// Les ACTIONS du back-office sur les tarifs (Phase 5, lot 3, D-34). Chacune
// relit la session, lit le formulaire, appelle lib/gestion/tarifs.ts ; un
// geste qui change un prix revient d'abord avec son récapitulatif, et n'écrit
// qu'à la confirmation. Après une écriture, le site public relit les prix
// tout de suite (étiquette « gites », lib/gites-publics.ts).
import { revalidatePath, revalidateTag } from "next/cache";

import { acteurDe } from "@/lib/gestion/connexion";
import type { Acteur } from "@/lib/gestion/journal";
import {
  ajouterTaxe,
  copierAnnee,
  enregistrerBareme,
  enregistrerGenerales,
  enregistrerPeriode,
  enregistrerTarif,
  modifierTaxe,
  supprimerBareme,
  supprimerPeriode,
  supprimerTarif,
  supprimerTaxe,
  type IssuePlan,
  type SaisieRegles,
} from "@/lib/gestion/tarifs";
import type { IssueGeste } from "@/lib/gestion/cautions";
import { isUuid, messageErreur } from "@/lib/route-helpers";

import type { EtatGeste } from "./actions-reservations";
import { exigerSession, visiteur } from "./outils";

/** Ce qu'un formulaire en deux temps réaffiche. */
export interface EtatPlan {
  version: number;
  etape: "neuf" | "plan" | "fait" | "refus";
  message: string;
  lignes: string[];
  empreinte: string;
}

function texte(f: FormData, nom: string): string {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
}

function tous(f: FormData, nom: string): string[] {
  return f.getAll(nom).filter((v): v is string => typeof v === "string");
}

function regles(f: FormData): SaisieRegles {
  return {
    nuitsMinimum: texte(f, "nuits_minimum"),
    arrivee: texte(f, "arrivee_mode") === "propre" ? tous(f, "arrivee") : null,
    depart: texte(f, "depart_mode") === "propre" ? tous(f, "depart") : null,
    baremeId: texte(f, "bareme"),
  };
}

async function acteur(): Promise<Acteur> {
  const session = await exigerSession();
  return acteurDe(session, (await visiteur()).ip);
}

function rafraichir(): void {
  revalidateTag("gites");
  revalidatePath("/gestion/tarifs", "layout");
  revalidatePath("/gestion");
}

function idOuNull(id: string | null): string | null {
  if (id !== null && !isUuid(id)) throw new Error("identifiant invalide");
  return id;
}

async function enDeuxTemps(precedent: EtatPlan, f: FormData, faire: (a: Acteur, confirmation: string | null) => Promise<IssuePlan>): Promise<EtatPlan> {
  const a = await acteur();
  const suivant = precedent.version + 1;
  try {
    const r = await faire(a, texte(f, "confirmation") || null);
    if (r.etape === "fait") rafraichir();
    if (r.etape === "plan") return { version: suivant, etape: "plan", message: r.message ?? "", lignes: r.lignes, empreinte: r.empreinte };
    return { version: suivant, etape: r.etape, message: r.message, lignes: [], empreinte: "" };
  } catch (erreur) {
    console.error("[gestion] tarifs : enregistrement interrompu :", messageErreur(erreur));
    return { version: suivant, etape: "refus", message: "L'enregistrement a échoué (panne). Rien n'a changé. Réessayez ; si cela se répète, prévenez le développeur.", lignes: [], empreinte: "" };
  }
}

async function geste(precedent: EtatGeste, faire: (a: Acteur) => Promise<IssueGeste>): Promise<EtatGeste> {
  const a = await acteur();
  try {
    const r = await faire(a);
    if (r.ok) rafraichir();
    return { version: precedent.version + 1, ok: r.ok, message: r.message };
  } catch (erreur) {
    console.error("[gestion] tarifs : geste interrompu :", messageErreur(erreur));
    return { version: precedent.version + 1, ok: false, message: "Le geste n'a pas abouti (panne). Réessayez ; si cela se répète, prévenez le développeur." };
  }
}

// ─── Tarifs ──────────────────────────────────────────────────────────────────

export async function actionTarif(id: string | null, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idOuNull(id);
  const prix: Record<string, string> = {};
  for (const [cle, v] of f.entries()) if (cle.startsWith("prix_") && typeof v === "string") prix[cle.slice(5)] = v;
  return enDeuxTemps(precedent, f, (a, c) => enregistrerTarif(id, { nom: texte(f, "nom"), prix, regles: regles(f) }, a, c));
}

export async function actionSupprimerTarif(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  idOuNull(id);
  return geste(precedent, (a) => supprimerTarif(id, a));
}

// ─── Périodes ────────────────────────────────────────────────────────────────

export async function actionPeriode(id: string | null, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idOuNull(id);
  return enDeuxTemps(precedent, f, (a, c) =>
    enregistrerPeriode(id, { tarifId: texte(f, "tarif"), debut: texte(f, "debut"), fin: texte(f, "fin"), regles: regles(f) }, a, c),
  );
}

export async function actionSupprimerPeriode(id: string, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idOuNull(id);
  return enDeuxTemps(precedent, f, (a, c) => supprimerPeriode(id, a, c));
}

export async function actionCopierAnnee(annee: number, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) throw new Error("année invalide");
  return enDeuxTemps(precedent, f, (a, c) => copierAnnee(annee, a, c));
}

// ─── Barèmes ─────────────────────────────────────────────────────────────────

export async function actionBareme(id: string | null, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idOuNull(id);
  return enDeuxTemps(precedent, f, (a, c) => enregistrerBareme(id, { nom: texte(f, "nom"), pourcents: tous(f, "pourcent") }, a, c));
}

export async function actionSupprimerBareme(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  idOuNull(id);
  return geste(precedent, (a) => supprimerBareme(id, a));
}

// ─── Règles générales ────────────────────────────────────────────────────────

export async function actionGenerales(precedent: EtatGeste, f: FormData): Promise<EtatGeste> {
  return geste(precedent, (a) =>
    enregistrerGenerales(
      {
        nuitsMinimum: texte(f, "nuits_minimum"),
        arrivee: tous(f, "arrivee"),
        depart: tous(f, "depart"),
        baremeId: texte(f, "bareme"),
        jourDebut: texte(f, "jour_debut"),
        horizonMois: texte(f, "horizon"),
      },
      a,
    ),
  );
}

// ─── Taxe de séjour ──────────────────────────────────────────────────────────

export async function actionTaxe(id: string | null, precedent: EtatPlan, f: FormData): Promise<EtatPlan> {
  idOuNull(id);
  const saisie = {
    gites: tous(f, "gite"),
    dateDebut: texte(f, "date_debut"),
    mode: texte(f, "mode"),
    taux: texte(f, "taux"),
    plafond: texte(f, "plafond"),
    tarifFixe: texte(f, "tarif_fixe"),
    additionnelle: texte(f, "additionnelle"),
    menage: texte(f, "menage") === "on",
    bebes: texte(f, "bebes") === "on",
    source: texte(f, "source"),
  };
  return enDeuxTemps(precedent, f, (a, c) => (id ? modifierTaxe(id, saisie, a, c) : ajouterTaxe(saisie, a, c)));
}

export async function actionSupprimerTaxe(id: string, precedent: EtatGeste): Promise<EtatGeste> {
  idOuNull(id);
  return geste(precedent, (a) => supprimerTaxe(id, a));
}
