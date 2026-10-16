// Lecture en base de la TARIFICATION (tarifs, périodes, barèmes, réglages) et
// des réglages de TAXE DE SÉJOUR, convertis en entiers pour les calculs purs
// de lib/tarification.ts et lib/taxe-sejour.ts.
//
// FRONTIÈRE BASE → MÉMOIRE : les montants (prix d'une nuit, plafond, tarif
// fixe) arrivent en texte numeric et passent par centimesDepuisNumeric
// (lib/centimes.ts) ; les taux et coefficients, en texte aussi, par
// entierDepuisDecimal (lib/decimaux.ts). Aucun flottant ne sort d'ici.
//
// CE MODULE NE DÉGRADE PAS. Il lève une erreur si la base ne répond pas ou si
// la ligne de réglages manque (panne de structure, pas une donnée à saisir).
// C'est à l'appelant de choisir : les pages publiques masquent leurs chiffres
// (lib/gites-publics.ts, D-13) ; le tunnel refuse d'engager le client.
//
// Ce qui est INCOHÉRENT sans être une panne (barème troué, période qui ne
// commence pas le jour attendu) est décrit dans `anomalies`, que l'appelant
// journalise. Un barème troué est écarté : le calcul refusera plutôt que de
// deviner la case manquante.
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  baremes_coefficients,
  gites,
  periodes,
  reglages,
  tarifs,
  tarifs_prix,
  taxes_sejour,
} from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { jourSemaineIso, nomJourIso } from "@/lib/dates-civiles";
import { entierDepuisDecimal } from "@/lib/decimaux";
import type { Executeur } from "@/lib/reservations";
import type { DonneesTarification, ReglesPartielles, TarifDonnees } from "@/lib/tarification";
import type { ReglageTaxe } from "@/lib/taxe-sejour";

/** Décimales des coefficients de barème (numeric(6,4)). */
const DECIMALES_COEFFICIENT = 4;
/** Décimales des taux (numeric(5,2)). */
const DECIMALES_TAUX = 2;

export interface TarificationLue {
  tarification: DonneesTarification;
  /** Réglages de taxe de séjour par gîte (clé : slug), triés par date de début. */
  taxes: Record<string, ReglageTaxe[]>;
  /** Jour de début attendu des périodes (1 à 7), ou null si libre. */
  periodesJourDebut: number | null;
  /** Incohérences à journaliser (n'empêchent pas la lecture). */
  anomalies: string[];
}

function reglesPartielles(ligne: {
  nuits_minimum: number | null;
  jours_arrivee: number[] | null;
  jours_depart: number[] | null;
}): ReglesPartielles {
  return {
    nuitsMinimum: ligne.nuits_minimum,
    joursArrivee: ligne.jours_arrivee,
    joursDepart: ligne.jours_depart,
  };
}

export async function chargerTarification(executeur: Executeur = getDb()): Promise<TarificationLue> {
  const [lignesReglages, lignesCoefficients, lignesTarifs, lignesPrix, lignesPeriodes, lignesTaxes] =
    await Promise.all([
      executeur.select().from(reglages).where(eq(reglages.id, 1)),
      executeur
        .select()
        .from(baremes_coefficients)
        .orderBy(baremes_coefficients.bareme_id, baremes_coefficients.rang),
      executeur.select().from(tarifs),
      executeur
        .select({ tarif_id: tarifs_prix.tarif_id, slug: gites.slug, prix_nuit: tarifs_prix.prix_nuit })
        .from(tarifs_prix)
        .innerJoin(gites, eq(gites.id, tarifs_prix.gite_id)),
      executeur.select().from(periodes).orderBy(periodes.date_debut),
      executeur
        .select({ taxe: taxes_sejour, slug: gites.slug })
        .from(taxes_sejour)
        .innerJoin(gites, eq(gites.id, taxes_sejour.gite_id))
        .orderBy(taxes_sejour.date_debut),
    ]);

  const ligneReglages = lignesReglages[0];
  if (!ligneReglages) {
    throw new Error(
      "réglages généraux absents (table reglages, ligne id = 1) : la migration 0003 crée cette ligne, elle n'aurait jamais dû disparaître",
    );
  }

  const anomalies: string[] = [];

  // Barèmes : rangs consécutifs à partir de 1, sinon écartés.
  const parBareme = new Map<string, Array<{ rang: number; coefficient: string }>>();
  for (const c of lignesCoefficients) {
    const cases = parBareme.get(c.bareme_id) ?? [];
    cases.push({ rang: c.rang, coefficient: c.coefficient });
    parBareme.set(c.bareme_id, cases);
  }
  const baremesLus: Record<string, number[]> = {};
  for (const [id, cases] of parBareme) {
    const rangs = cases.map((c) => c.rang);
    if (rangs.some((rang, i) => rang !== i + 1)) {
      anomalies.push(`BARÈME INCOHÉRENT ${id} : rangs ${rangs.join(", ")} au lieu de 1 à ${rangs.length} — écarté`);
      continue;
    }
    baremesLus[id] = cases.map((c) => entierDepuisDecimal(c.coefficient, DECIMALES_COEFFICIENT));
  }

  // Tarifs et leurs prix par gîte.
  const prixParTarif = new Map<string, Partial<Record<string, number>>>();
  for (const p of lignesPrix) {
    const prix = prixParTarif.get(p.tarif_id) ?? {};
    prix[p.slug] = centimesDepuisNumeric(p.prix_nuit);
    prixParTarif.set(p.tarif_id, prix);
  }
  const tarifsLus: TarifDonnees[] = lignesTarifs.map((t) => ({
    id: t.id,
    nom: t.nom,
    regles: reglesPartielles(t),
    baremeId: t.bareme_id,
    prixNuit: prixParTarif.get(t.id) ?? {},
  }));

  // Périodes, et contrôle du jour de début attendu.
  const jourAttendu = ligneReglages.periodes_jour_debut;
  const nomsTarifs = new Map(lignesTarifs.map((t) => [t.id, t.nom]));
  for (const p of lignesPeriodes) {
    if (jourAttendu === null) break;
    for (const borne of [p.date_debut, p.date_fin]) {
      if (jourSemaineIso(borne) !== jourAttendu) {
        anomalies.push(
          `PÉRIODE NON CALÉE : « ${nomsTarifs.get(p.tarif_id) ?? p.tarif_id} » ${p.date_debut} → ${p.date_fin}, ` +
            `le ${borne} n'est pas un ${nomJourIso(jourAttendu)}`,
        );
      }
    }
  }

  // Barèmes désignés mais inutilisables (vides ou écartés ci-dessus).
  const references: Array<[string, string | null]> = [
    ["réglage général", ligneReglages.bareme_general_id],
    ...lignesTarifs.map((t): [string, string | null] => [`tarif « ${t.nom} »`, t.bareme_id]),
    ...lignesPeriodes.map((p): [string, string | null] => [
      `période ${p.date_debut} → ${p.date_fin}`,
      p.bareme_id,
    ]),
  ];
  if (ligneReglages.bareme_general_id === null) {
    anomalies.push("BARÈME GÉNÉRAL NON DÉFINI (reglages.bareme_general_id) : aucun séjour ne peut être chiffré sans barème propre");
  }
  for (const [qui, id] of references) {
    if (id !== null && !baremesLus[id]) {
      anomalies.push(`BARÈME INUTILISABLE pour ${qui} : ${id} est vide ou incohérent`);
    }
  }

  // Taxe de séjour, par gîte.
  const taxes: Record<string, ReglageTaxe[]> = {};
  for (const { taxe, slug } of lignesTaxes) {
    (taxes[slug] ??= []).push({
      dateDebut: taxe.date_debut,
      mode: taxe.mode,
      taux: taxe.taux === null ? null : entierDepuisDecimal(taxe.taux, DECIMALES_TAUX),
      plafond: centimesDepuisNumeric(taxe.plafond),
      tarifFixe: centimesDepuisNumeric(taxe.tarif_fixe),
      taxeAdditionnelle: entierDepuisDecimal(taxe.taxe_additionnelle, DECIMALES_TAUX),
      menageDansAssiette: taxe.menage_dans_assiette,
      bebesParmiOccupants: taxe.bebes_parmi_occupants,
      source: taxe.source,
    });
  }

  return {
    tarification: {
      general: {
        regles: {
          nuitsMinimum: ligneReglages.nuits_minimum,
          joursArrivee: ligneReglages.jours_arrivee,
          joursDepart: ligneReglages.jours_depart,
        },
        baremeId: ligneReglages.bareme_general_id,
      },
      baremes: baremesLus,
      tarifs: tarifsLus,
      periodes: lignesPeriodes.map((p) => ({
        id: p.id,
        tarifId: p.tarif_id,
        debut: p.date_debut,
        fin: p.date_fin,
        regles: reglesPartielles(p),
        baremeId: p.bareme_id,
      })),
    },
    taxes,
    periodesJourDebut: jourAttendu,
    anomalies,
  };
}
