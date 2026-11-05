"use server";
// Les ACTIONS du back-office (Phase 5, lot 1, D-32) : formulaires de
// connexion, de mot de passe, des réglages et des appareils. Next vérifie que
// chaque action vient d'une page du site (en-tête Origin) ; chaque action
// protégée relit la session en base.
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { traiterCourriels } from "@/lib/courriels-envoi";
import {
  acteurDe,
  choisirMotDePasse,
  connecter,
  demanderLien,
  fermerSession,
  lireReglagesConnexion,
  retirerAppareil,
  validerCode,
} from "@/lib/gestion/connexion";
import { enregistrerAlertes, enregistrerRubrique, type IssueEnregistrement } from "@/lib/gestion/reglages";

import {
  ACCUEIL,
  CONNEXION,
  exigerSession,
  heureLisible,
  optionsTemoin,
  origine,
  temoin,
  TEMOIN_APPAREIL,
  TEMOIN_ATTENTE,
  TEMOIN_SESSION,
  visiteur,
} from "./outils";

function texte(f: FormData, nom: string): string {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
}

function attente(jusqua: Date): never {
  redirect(`${CONNEXION}?erreur=attente&jusqua=${encodeURIComponent(heureLisible(jusqua))}`);
}

// ─── Connexion ───────────────────────────────────────────────────────────────

export async function actionConnexion(f: FormData): Promise<void> {
  const v = await visiteur();
  const r = await connecter({
    courriel: texte(f, "courriel"),
    motDePasse: texte(f, "mot_de_passe"),
    jetonAppareil: await temoin(TEMOIN_APPAREIL),
    ...v,
  });
  if (r.issue === "attente") attente(r.jusqua);
  if (r.issue === "refus") redirect(`${CONNEXION}?erreur=refus`);
  if (r.issue === "envoi_impossible") redirect(`${CONNEXION}?erreur=envoi`);
  const jar = await cookies();
  const reglages = await lireReglagesConnexion();
  if (r.issue === "code") {
    jar.set(TEMOIN_ATTENTE, r.jetonAttente, optionsTemoin(reglages.codeMinutes * 60));
    redirect("/gestion/code");
  }
  jar.set(TEMOIN_SESSION, r.jetonSession, optionsTemoin());
  // Relance la reconnaissance de l'appareil : le témoin vit autant que la base le reconnaît.
  const appareil = await temoin(TEMOIN_APPAREIL);
  if (appareil) jar.set(TEMOIN_APPAREIL, appareil, optionsTemoin(reglages.appareilJours * 86400));
  redirect(ACCUEIL);
}

export async function actionCode(f: FormData): Promise<void> {
  const v = await visiteur();
  const r = await validerCode({ jetonAttente: await temoin(TEMOIN_ATTENTE), code: texte(f, "code"), ...v });
  const jar = await cookies();
  if (r.issue === "attente") {
    jar.delete({ name: TEMOIN_ATTENTE, path: "/gestion" });
    attente(r.jusqua);
  }
  if (r.issue === "expire") {
    jar.delete({ name: TEMOIN_ATTENTE, path: "/gestion" });
    redirect(`${CONNEXION}?erreur=code_expire`);
  }
  if (r.issue === "refus") redirect(`/gestion/code?erreur=refus&restants=${r.restants}`);
  const reglages = await lireReglagesConnexion();
  jar.delete({ name: TEMOIN_ATTENTE, path: "/gestion" });
  jar.set(TEMOIN_APPAREIL, r.jetonAppareil, optionsTemoin(reglages.appareilJours * 86400));
  jar.set(TEMOIN_SESSION, r.jetonSession, optionsTemoin());
  redirect(ACCUEIL);
}

export async function actionDeconnexion(): Promise<void> {
  await fermerSession(await temoin(TEMOIN_SESSION));
  (await cookies()).delete({ name: TEMOIN_SESSION, path: "/gestion" });
  redirect(`${CONNEXION}?info=deconnecte`);
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

export async function actionLienOublie(f: FormData): Promise<void> {
  const v = await visiteur();
  const r = await demanderLien({ courriel: texte(f, "courriel"), origine: await origine(), ...v });
  if (r.issue === "attente") attente(r.jusqua);
  redirect("/gestion/mot-de-passe-oublie?envoye=1");
}

export async function actionMotDePasse(f: FormData): Promise<void> {
  const jeton = texte(f, "jeton");
  const r = await choisirMotDePasse({
    jeton,
    motDePasse: texte(f, "mot_de_passe"),
    confirmation: texte(f, "confirmation"),
    ...(await visiteur()),
  });
  if (r.issue === "expire") redirect("/gestion/mot-de-passe?erreur=expire");
  if (r.issue === "invalide") {
    redirect(`/gestion/mot-de-passe?jeton=${encodeURIComponent(jeton)}&erreur=${r.refus}`);
  }
  const jar = await cookies();
  jar.delete({ name: TEMOIN_SESSION, path: "/gestion" });
  jar.delete({ name: TEMOIN_APPAREIL, path: "/gestion" });
  redirect(`${CONNEXION}?info=mot_de_passe`);
}

// ─── Appareils ───────────────────────────────────────────────────────────────

export async function actionRetirerAppareil(f: FormData): Promise<void> {
  const session = await exigerSession();
  const id = texte(f, "appareil");
  await retirerAppareil(session, id, acteurDe(session, (await visiteur()).ip));
  if (id === session.appareilId) {
    const jar = await cookies();
    jar.delete({ name: TEMOIN_SESSION, path: "/gestion" });
    jar.delete({ name: TEMOIN_APPAREIL, path: "/gestion" });
    redirect(`${CONNEXION}?info=appareil_retire`);
  }
  redirect("/gestion/appareils?info=retire");
}

// ─── Réglages ────────────────────────────────────────────────────────────────

/** Ce que le formulaire d'une rubrique réaffiche après l'enregistrement. */
export interface EtatFormulaire {
  version: number;
  issue: "neuf" | "fait" | "erreurs" | "panne";
  erreurs: Record<string, string>;
  /** Saisie à réafficher quand elle est refusée. */
  saisie: Record<string, string> | null;
  changes: number;
}

function saisieDe(f: FormData): Record<string, string> {
  const s: Record<string, string> = {};
  for (const [cle, v] of f.entries()) if (typeof v === "string" && !cle.startsWith("$")) s[cle] = v;
  return s;
}

function etat(precedent: EtatFormulaire, r: IssueEnregistrement, saisie: Record<string, string>): EtatFormulaire {
  if (r.issue === "erreurs") return { version: precedent.version + 1, issue: "erreurs", erreurs: r.erreurs, saisie, changes: 0 };
  return { version: precedent.version + 1, issue: "fait", erreurs: {}, saisie: null, changes: r.changes.length };
}

export async function actionRubrique(rubriqueId: string, precedent: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const session = await exigerSession();
  const saisie = saisieDe(f);
  try {
    const r = await enregistrerRubrique(rubriqueId, saisie, acteurDe(session, (await visiteur()).ip));
    if (r.issue === "fait" && r.changes.length) {
      revalidatePath("/gestion/reglages");
      // Les chiffres des avis sont lus par le site public avec les gîtes (lib/gites-publics.ts).
      if (rubriqueId === "avis") revalidateTag("gites");
      if (rubriqueId === "virement") {
        const o = await origine();
        after(() => traiterCourriels(o));
      }
    }
    return etat(precedent, r, saisie);
  } catch (erreur) {
    console.error(`[gestion] réglages (${rubriqueId}) non enregistrés :`, erreur);
    return { version: precedent.version + 1, issue: "panne", erreurs: {}, saisie, changes: 0 };
  }
}

export async function actionAlertes(precedent: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const session = await exigerSession();
  const saisie = saisieDe(f);
  try {
    const r = await enregistrerAlertes(saisie, acteurDe(session, (await visiteur()).ip));
    if (r.issue === "fait" && r.changes.length) revalidatePath("/gestion/reglages");
    return etat(precedent, r, saisie);
  } catch (erreur) {
    console.error("[gestion] alertes non enregistrées :", erreur);
    return { version: precedent.version + 1, issue: "panne", erreurs: {}, saisie, changes: 0 };
  }
}
