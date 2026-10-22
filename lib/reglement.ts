// RÈGLEMENT choisi par le client dans le tunnel : le moyen de sa caution et le
// règlement de son solde (Phase 3, lot 3 ; décisions D-16, D-19, D-20).
//
// Module PUR, exécuté dans le navigateur (affichage, bouton actif ou non) et
// sur le serveur (seul contrôle qui engage).
//
//   - Caution : carte, chèque ou virement. RIEN N'EST PRÉ-CHOISI.
//   - Solde : prélèvement automatique ou paiement par lien. Rien n'est
//     pré-choisi non plus ; le prélèvement n'existe qu'avec une carte
//     enregistrée, donc une caution par carte. En paiement intégral (D-20),
//     il n'y a pas de solde, donc pas de choix.
//   - La carte n'est enregistrée QUE pour une caution par carte : c'est alors
//     que le client voit et accepte le texte d'accord (textes_accord).
import type { ModeSolde, MoyenCaution } from "@/db/schema/reservations";
import { fmtDateLongue, fmtEuro, fmtPrix } from "@/lib/format";
import type { Bilingue, Langue } from "@/lib/i18n/langues";

export type { ModeSolde, MoyenCaution };

// Listes recopiées du schéma (un import de valeur depuis db/schema
// emporterait Drizzle dans le navigateur) ; `satisfies` refuse toute valeur
// inconnue du schéma, et le contrôle ci-dessous toute valeur oubliée.
export const MOYENS_CAUTION = ["carte", "cheque", "virement"] as const satisfies readonly MoyenCaution[];
export const MODES_SOLDE = ["prelevement", "lien"] as const satisfies readonly ModeSolde[];
type Complet<Tout, Liste> = [Exclude<Tout, Liste>] extends [never] ? true : never;
const LISTES_COMPLETES: [
  Complet<MoyenCaution, (typeof MOYENS_CAUTION)[number]>,
  Complet<ModeSolde, (typeof MODES_SOLDE)[number]>,
] = [true, true];
void LISTES_COMPLETES;

export interface ChoixReglement {
  moyenCaution: MoyenCaution;
  /** `null` en paiement intégral : pas de solde. */
  modeSolde: ModeSolde | null;
}

/** Choix en cours de saisie dans le tunnel : rien au départ. */
export interface ChoixPartiel {
  moyenCaution: MoyenCaution | null;
  modeSolde: ModeSolde | null;
}

export type ResultatChoix = { ok: true; choix: ChoixReglement } | { ok: false; message: string; detail: string };

const MESSAGES: Bilingue<{ caution: string; solde: string; prelevementSansCarte: string }> = {
  fr: {
    caution: "Choisissez le moyen de votre caution.",
    solde: "Choisissez comment régler le solde.",
    prelevementSansCarte: "Le prélèvement automatique du solde demande une caution par carte.",
  },
  en: {
    caution: "Choose how you will provide the security deposit.",
    solde: "Choose how you will pay the balance.",
    prelevementSansCarte: "Automatic payment of the balance requires a security deposit by card.",
  },
};

function estMoyen(v: unknown): v is MoyenCaution {
  return typeof v === "string" && (MOYENS_CAUTION as readonly string[]).includes(v);
}

function estMode(v: unknown): v is ModeSolde {
  return typeof v === "string" && (MODES_SOLDE as readonly string[]).includes(v);
}

/** Le prélèvement automatique est-il proposé pour ce moyen de caution ? */
export function prelevementPossible(moyenCaution: MoyenCaution | null): boolean {
  return moyenCaution === "carte";
}

/**
 * Contrôle des choix reçus. `paiementIntegral` vient du devis du SERVEUR :
 * un solde choisi pour un séjour réglé en totalité est simplement ignoré.
 */
export function validerChoix(brut: unknown, paiementIntegral: boolean, langue: Langue = "fr"): ResultatChoix {
  const m = MESSAGES[langue];
  const objet = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const moyen = objet.moyenCaution;
  if (!estMoyen(moyen)) return { ok: false, message: m.caution, detail: `moyen de caution reçu : ${String(moyen)}` };
  if (paiementIntegral) return { ok: true, choix: { moyenCaution: moyen, modeSolde: null } };

  const mode = objet.modeSolde;
  if (!estMode(mode)) return { ok: false, message: m.solde, detail: `règlement du solde reçu : ${String(mode)}` };
  if (mode === "prelevement" && !prelevementPossible(moyen)) {
    return { ok: false, message: m.prelevementSansCarte, detail: `prélèvement demandé avec une caution par ${moyen}` };
  }
  return { ok: true, choix: { moyenCaution: moyen, modeSolde: mode } };
}

/** Choix complet pour l'affichage du tunnel, ou `null` tant qu'il manque quelque chose. */
export function choixComplet(partiel: ChoixPartiel, paiementIntegral: boolean): ChoixReglement | null {
  const r = validerChoix(partiel, paiementIntegral);
  return r.ok ? r.choix : null;
}

/** La carte est-elle enregistrée (Customer Stripe, accord du client) ? Seulement pour une caution par carte. */
export function carteEnregistree(choix: ChoixReglement): boolean {
  return choix.moyenCaution === "carte";
}

// ─── Texte d'accord pour l'enregistrement de la carte ────────────────────────

/** Une version du texte d'accord (table textes_accord). */
export interface ModeleAccord {
  id: string;
  langue: Langue;
  modele: string;
  modeleSolde: string;
}

/**
 * Le texte d'accord tel que le client le lit, repères remplacés : montant de
 * la caution, et la ligne du solde seulement si le client a choisi le
 * prélèvement. LÈVE si un repère reste : un texte d'accord incomplet ne
 * s'affiche pas.
 */
export function texteAccordCarte(
  modele: ModeleAccord,
  valeurs: { caution: number; prelevement: { montant: number; date: string } | null },
): string {
  const { langue } = modele;
  const ligneSolde = valeurs.prelevement
    ? modele.modeleSolde
        .replaceAll("{montant}", fmtEuro(valeurs.prelevement.montant, langue))
        .replaceAll("{date}", fmtDateLongue(valeurs.prelevement.date, langue))
    : "";
  const texte = modele.modele
    .replaceAll("{caution}", fmtPrix(valeurs.caution, langue))
    .replaceAll("{ligne_solde}", ligneSolde);
  const reste = texte.match(/\{[a-z_]+\}/);
  if (reste) throw new Error(`texteAccordCarte : repère non remplacé ${reste[0]} (version ${modele.id})`);
  return texte;
}
