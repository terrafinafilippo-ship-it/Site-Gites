// LES FICHES DES GÎTES dans le back-office (Phase 5, lot 4, réponse 12 A du
// cadrage de la phase) : capacité, ménage, caution, équipements particuliers,
// téléphone pour l'arrivée, spa, sauna (point 8). Le nom et la référence Gîtes de France
// restent fixes (ils vivent aussi dans lib/data/gites.ts) ; les textes et les
// photos sont en Phase 6.
//
// En deux temps, comme les tarifs (D-34) : le récapitulatif de ce qui change,
// puis l'écriture à la confirmation, si la fiche n'a pas bougé entre-temps.
//
// Ce qui vaut pour qui :
//   - ménage et caution sont recopiés sur chaque réservation à sa création
//     (lib/tunnel.ts) : un changement vaut pour les réservations suivantes ;
//   - capacité, équipements, spa, sauna et téléphone sont imprimés au contrat, et
//     recopiés sur la réservation quand il est émis (lib/contrat.ts, écart
//     E-9) : la copie signée relit ces valeurs-là. Un changement vaut pour
//     les contrats émis ensuite ; l'écran le dit.
import { createHash } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { gites } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { fmtEuro } from "@/lib/format";

import { journaliser, type Acteur } from "./journal";
import type { IssuePlan } from "./tarifs";

export const CAPACITE_MAX = 20;
/** 999,99 € */
export const MENAGE_MAX = 99_999;
/** 9 999,99 € */
export const CAUTION_MAX = 999_999;
export const EQUIPEMENTS_MAX = 300;
const FORME_TELEPHONE = /^[0-9+().\s-]{6,30}$/;

export interface FicheGite {
  id: string;
  nom: string;
  refGdf: string;
  capacite: number;
  /** Centimes. */
  menage: number;
  /** Centimes. */
  caution: number;
  equipements: string;
  telephone: string;
  spa: boolean;
  sauna: boolean;
}

export interface SaisieGite {
  capacite: string;
  menage: string;
  caution: string;
  equipements: string;
  telephone: string;
  spa: boolean;
  sauna: boolean;
}

function fiche(g: typeof gites.$inferSelect): FicheGite {
  return {
    id: g.id,
    nom: g.nom,
    refGdf: g.ref_gdf,
    capacite: g.capacite_max,
    menage: centimesDepuisNumeric(g.forfait_menage),
    caution: centimesDepuisNumeric(g.caution),
    equipements: g.equipements_specifiques ?? "",
    telephone: g.contact_arrivee_tel ?? "",
    spa: g.a_spa,
    sauna: g.a_sauna,
  };
}

export async function lireGitesGestion(): Promise<FicheGite[]> {
  const lignes = await getDb().select().from(gites).orderBy(asc(gites.nom));
  return lignes.map(fiche);
}

/** « 80 », « 80,5 » → centimes, sans calcul flottant (lib/centimes.ts) ; null si mal formé. */
function montant(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(t) ? centimesDepuisNumeric(t) : null;
}

type Lu = { ok: true; valeurs: Omit<FicheGite, "id" | "nom" | "refGdf"> } | { ok: false; message: string };

export function lireSaisieGite(s: SaisieGite): Lu {
  const capacite = /^\d{1,2}$/.test(s.capacite.trim()) ? Number(s.capacite.trim()) : Number.NaN;
  if (!(capacite >= 1 && capacite <= CAPACITE_MAX)) return { ok: false, message: `La capacité va de 1 à ${CAPACITE_MAX} personnes.` };
  const menage = montant(s.menage);
  if (menage === null || menage > MENAGE_MAX) return { ok: false, message: "Le ménage n'est pas valable (de 0 à 999,99 €, par exemple 80 ou 80,50)." };
  const caution = montant(s.caution);
  if (caution === null || caution < 100 || caution > CAUTION_MAX) {
    return { ok: false, message: "La caution n'est pas valable (de 1 à 9 999,99 €, par exemple 500)." };
  }
  const equipements = s.equipements.trim().replace(/\s+/g, " ");
  if (equipements.length > EQUIPEMENTS_MAX) return { ok: false, message: `Les équipements tiennent en ${EQUIPEMENTS_MAX} caractères au plus.` };
  const telephone = s.telephone.trim();
  if (!FORME_TELEPHONE.test(telephone)) {
    return { ok: false, message: "Le téléphone pour l'arrivée est obligatoire (chiffres, espaces, +, tirets) : il est imprimé au contrat." };
  }
  return { ok: true, valeurs: { capacite, menage, caution, equipements, telephone, spa: s.spa, sauna: s.sauna } };
}

const ouiNon = (b: boolean) => (b ? "oui" : "non");
const cite = (t: string) => (t ? `« ${t} »` : "aucun");

function empreinte(lignes: string[]): string {
  return createHash("sha256").update(JSON.stringify(lignes)).digest("hex").slice(0, 32);
}

/**
 * La fiche d'un gîte, en deux temps : sans `confirmation`, le récapitulatif ;
 * avec, l'écriture si le récapitulatif n'a pas changé (ligne verrouillée).
 */
export async function enregistrerGite(id: string, saisie: SaisieGite, acteur: Acteur, confirmation: string | null): Promise<IssuePlan> {
  const lu = lireSaisieGite(saisie);
  if (!lu.ok) return { etape: "refus", message: lu.message };
  const v = lu.valeurs;
  return getDb().transaction(async (tx) => {
    const [g] = await tx.select().from(gites).where(eq(gites.id, id)).for("update");
    if (!g) return { etape: "refus" as const, message: "Gîte introuvable." };
    const avant = fiche(g);
    const lignes: string[] = [];
    if (avant.capacite !== v.capacite) lignes.push(`Capacité : ${avant.capacite} → ${v.capacite} personnes.`);
    if (avant.menage !== v.menage) lignes.push(`Ménage : ${fmtEuro(avant.menage)} → ${fmtEuro(v.menage)}.`);
    if (avant.caution !== v.caution) lignes.push(`Caution : ${fmtEuro(avant.caution)} → ${fmtEuro(v.caution)}.`);
    if (avant.equipements !== v.equipements) lignes.push(`Équipements particuliers : ${cite(avant.equipements)} → ${cite(v.equipements)}.`);
    if (avant.telephone !== v.telephone) lignes.push(`Téléphone pour l'arrivée : ${avant.telephone || "aucun"} → ${v.telephone}.`);
    if (avant.spa !== v.spa) lignes.push(`Spa : ${ouiNon(avant.spa)} → ${ouiNon(v.spa)}.`);
    if (avant.sauna !== v.sauna) lignes.push(`Sauna : ${ouiNon(avant.sauna)} → ${ouiNon(v.sauna)}.`);
    if (lignes.length === 0) return { etape: "fait" as const, message: "Aucun changement." };

    if (avant.menage !== v.menage || avant.caution !== v.caution) {
      lignes.push("Les réservations déjà faites gardent leur ménage et leur caution.");
    }
    if (avant.capacite !== v.capacite || avant.equipements !== v.equipements || avant.telephone !== v.telephone || avant.spa !== v.spa || avant.sauna !== v.sauna) {
      lignes.push("Capacité, équipements, téléphone, spa et sauna sont imprimés au contrat : le changement vaut pour les prochains contrats ; un contrat déjà envoyé garde ce qu'il a imprimé.");
    }
    lignes.push("Le site affiche le changement tout de suite.");

    const e = empreinte([id, ...lignes]);
    if (confirmation === null) return { etape: "plan" as const, lignes, empreinte: e };
    if (confirmation !== e) {
      return { etape: "plan" as const, lignes, empreinte: e, message: "La fiche a changé entre-temps : relisez avant de confirmer." };
    }
    await tx
      .update(gites)
      .set({
        capacite_max: v.capacite,
        forfait_menage: numericDepuisCentimes(v.menage),
        caution: numericDepuisCentimes(v.caution),
        equipements_specifiques: v.equipements || null,
        contact_arrivee_tel: v.telephone,
        a_spa: v.spa,
        a_sauna: v.sauna,
      })
      .where(eq(gites.id, id));
    await journaliser(tx, {
      table: "gites",
      ligne: id,
      action: "gite_modifie",
      acteur,
      details: { avant: { ...avant, id: undefined, nom: undefined, refGdf: undefined }, apres: v },
    });
    return { etape: "fait" as const, message: `Fiche de ${g.nom} enregistrée.` };
  });
}
