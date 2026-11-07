// L'ÉCRAN DES TARIFS du back-office (Phase 5, lot 3, D-34) : lecture de toute
// la tarification pour la page, et les gestes qui la modifient — prix des
// tarifs, périodes, barèmes, règles générales, taxe de séjour.
//
// Le modèle est celui de la Phase 3 (D-17, D-18) ; rien n'en change. Le calcul
// reste lib/tarification.ts et lib/taxe-sejour.ts : l'écran affiche ce que le
// tunnel calculera.
//
// EN DEUX TEMPS (réponse 1 A du cadrage du 7 novembre 2026) : un geste qui
// change un prix renvoie d'abord le récapitulatif de ce qui va changer
// (`etape: "plan"`, avec une empreinte) ; il n'écrit qu'à la confirmation, si
// la tarification n'a pas bougé entre-temps (même empreinte), sous un verrou
// des tables de tarification.
//
// Les réservations déjà faites ne changent jamais : leur prix et leur taxe
// sont écrits sur la réservation au paiement (lib/montants.ts les reçoit).
// Chaque écriture est notée dans le journal (lib/gestion/journal.ts).
import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { baremes, baremes_coefficients, gites, periodes, reglages, tarifs, tarifs_prix, taxes_sejour, MODES_TAXE_SEJOUR } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { diviserArrondiEntier, entierDepuisDecimal } from "@/lib/decimaux";
import { fmtEuro, fmtTaxeSejour } from "@/lib/format";
import type { Executeur } from "@/lib/reservations";
import { prixPourNuits, type DonneesTarification } from "@/lib/tarification";
import { chargerTarification } from "@/lib/tarifs";
import type { ReglageTaxe } from "@/lib/taxe-sejour";

import type { IssueGeste } from "./cautions";
import { journaliser, type Acteur } from "./journal";
import {
  ajouterMois,
  coefficientNumeric,
  dateLisible,
  estDate,
  etatTarifs,
  joursLisibles,
  joursSaisis,
  petitMontantSaisi,
  planCopie,
  planPeriode,
  planSuppression,
  pourcentEnDixMilliemes,
  pourcentLisible,
  prixSaisi,
  tauxSaisi,
  type ContextePeriodes,
  type EtatTarifs,
  type Operation,
  type PeriodeGestion,
  type Plan,
} from "./tarifs-regles";

// ─── Lecture pour la page ────────────────────────────────────────────────────

export interface GitePage {
  id: string;
  slug: string;
  nom: string;
}

export interface TarifPage {
  id: string;
  nom: string;
  /** Prix d'une nuit par gîte (clé : id du gîte), en centimes ; null = pas de prix. */
  prix: Record<string, number | null>;
  /** Prix de 7 nuits, barème du tarif (ou général) appliqué ; null si incalculable. */
  semaine: Record<string, number | null>;
  nuitsMinimum: number | null;
  joursArrivee: number[] | null;
  joursDepart: number[] | null;
  baremeId: string | null;
  nbPeriodes: number;
}

export interface BaremePage {
  id: string;
  nom: string;
  /** Coefficients en dix-millièmes, rang 1 en tête. */
  coefficients: number[];
  /** Barème aux rangs troués : écarté par le calcul. */
  valide: boolean;
  utilisePar: string[];
}

export interface TaxePage {
  id: string;
  giteId: string;
  dateDebut: string;
  mode: (typeof MODES_TAXE_SEJOUR)[number];
  taux: string | null;
  plafond: string | null;
  tarifFixe: string | null;
  taxeAdditionnelle: string;
  menage: boolean;
  bebes: boolean;
  source: string | null;
  etat: "remplacee" | "en_vigueur" | "a_venir";
  /** Ce que le site affiche aux clients (taxe additionnelle comprise). */
  resume: string;
}

export interface Generales {
  nuitsMinimum: number;
  joursArrivee: number[];
  joursDepart: number[];
  baremeId: string | null;
  jourDebut: number | null;
  horizonMois: number;
}

export interface PageTarifs {
  aujourdhui: string;
  gites: GitePage[];
  tarifs: TarifPage[];
  periodes: PeriodeGestion[];
  baremes: BaremePage[];
  general: Generales;
  taxes: TaxePage[];
  etat: EtatTarifs;
}

const DECIMALES_TAUX = 2;

function versPeriode(p: typeof periodes.$inferSelect): PeriodeGestion {
  return {
    id: p.id,
    tarifId: p.tarif_id,
    debut: p.date_debut,
    fin: p.date_fin,
    nuitsMinimum: p.nuits_minimum,
    joursArrivee: p.jours_arrivee,
    joursDepart: p.jours_depart,
    baremeId: p.bareme_id,
  };
}

function versReglageTaxe(t: {
  date_debut: string;
  mode: (typeof MODES_TAXE_SEJOUR)[number];
  taux: string | null;
  plafond: string | null;
  tarif_fixe: string | null;
  taxe_additionnelle: string;
  menage_dans_assiette: boolean;
  bebes_parmi_occupants: boolean;
  source: string | null;
}): ReglageTaxe {
  return {
    dateDebut: t.date_debut,
    mode: t.mode,
    taux: t.taux === null ? null : entierDepuisDecimal(t.taux, DECIMALES_TAUX),
    plafond: centimesDepuisNumeric(t.plafond),
    tarifFixe: centimesDepuisNumeric(t.tarif_fixe),
    taxeAdditionnelle: entierDepuisDecimal(t.taxe_additionnelle, DECIMALES_TAUX),
    menageDansAssiette: t.menage_dans_assiette,
    bebesParmiOccupants: t.bebes_parmi_occupants,
    source: t.source,
  };
}

async function lireGites(ex: Executeur): Promise<GitePage[]> {
  return ex.select({ id: gites.id, slug: gites.slug, nom: gites.nom }).from(gites).orderBy(asc(gites.nom));
}

async function lirePeriodes(ex: Executeur): Promise<PeriodeGestion[]> {
  return (await ex.select().from(periodes).orderBy(asc(periodes.date_debut))).map(versPeriode);
}

async function lireGenerales(ex: Executeur): Promise<Generales> {
  const [r] = await ex.select().from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return {
    nuitsMinimum: r.nuits_minimum,
    joursArrivee: r.jours_arrivee,
    joursDepart: r.jours_depart,
    baremeId: r.bareme_general_id,
    jourDebut: r.periodes_jour_debut,
    horizonMois: r.tarifs_horizon_mois,
  };
}

/** L'état de la tarification sur l'horizon réglé (en-tête des pages, « À traiter »). */
export async function lireEtatTarifs(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<EtatTarifs> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const [lue, listeGites, general] = await Promise.all([chargerTarification(ex), lireGites(ex), lireGenerales(ex)]);
  return etatTarifs({
    donnees: lue.tarification,
    taxes: lue.taxes,
    gites: listeGites,
    aujourdhui,
    horizon: ajouterMois(aujourdhui, general.horizonMois),
    jourDebut: general.jourDebut,
  });
}

function baremeEffectif(d: DonneesTarification, baremeId: string | null): readonly number[] | null {
  const id = baremeId ?? d.general.baremeId;
  return id === null ? null : (d.baremes[id] ?? null);
}

export async function lireTarifsGestion(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<PageTarifs> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const [lue, listeGites, general, lignesTarifs, lignesPrix, liste, lignesBaremes, lignesCoef, lignesTaxes] = await Promise.all([
    chargerTarification(ex),
    lireGites(ex),
    lireGenerales(ex),
    ex.select().from(tarifs).orderBy(asc(tarifs.nom)),
    ex.select().from(tarifs_prix),
    lirePeriodes(ex),
    ex.select().from(baremes).orderBy(asc(baremes.nom)),
    ex.select().from(baremes_coefficients).orderBy(asc(baremes_coefficients.bareme_id), asc(baremes_coefficients.rang)),
    ex.select().from(taxes_sejour).orderBy(asc(taxes_sejour.date_debut)),
  ]);
  const d = lue.tarification;

  const listeTarifs: TarifPage[] = lignesTarifs.map((t) => {
    const bareme = baremeEffectif(d, t.bareme_id);
    const prix: Record<string, number | null> = {};
    const semaine: Record<string, number | null> = {};
    for (const g of listeGites) {
      const ligne = lignesPrix.find((p) => p.tarif_id === t.id && p.gite_id === g.id);
      const c = ligne ? centimesDepuisNumeric(ligne.prix_nuit) : null;
      prix[g.id] = c;
      semaine[g.id] = c !== null && bareme ? prixPourNuits(c, bareme, 7) : null;
    }
    return {
      id: t.id,
      nom: t.nom,
      prix,
      semaine,
      nuitsMinimum: t.nuits_minimum,
      joursArrivee: t.jours_arrivee,
      joursDepart: t.jours_depart,
      baremeId: t.bareme_id,
      nbPeriodes: liste.filter((p) => p.tarifId === t.id).length,
    };
  });

  const listeBaremes: BaremePage[] = lignesBaremes.map((b) => {
    const cases = lignesCoef.filter((c) => c.bareme_id === b.id);
    const utilisePar = [
      ...(general.baremeId === b.id ? ["réglage général"] : []),
      ...lignesTarifs.filter((t) => t.bareme_id === b.id).map((t) => `tarif « ${t.nom} »`),
      ...liste.filter((p) => p.baremeId === b.id).map((p) => `période du ${p.debut} au ${p.fin}`),
    ];
    return {
      id: b.id,
      nom: b.nom,
      coefficients: cases.map((c) => entierDepuisDecimal(c.coefficient, 4)),
      valide: cases.length > 0 && cases.every((c, i) => c.rang === i + 1),
      utilisePar,
    };
  });

  const listeTaxes: TaxePage[] = [];
  for (const g of listeGites) {
    const siennes = lignesTaxes.filter((t) => t.gite_id === g.id);
    const enVigueur = [...siennes].reverse().find((t) => t.date_debut <= aujourdhui);
    for (const t of siennes) {
      listeTaxes.push({
        id: t.id,
        giteId: g.id,
        dateDebut: t.date_debut,
        mode: t.mode,
        taux: t.taux,
        plafond: t.plafond,
        tarifFixe: t.tarif_fixe,
        taxeAdditionnelle: t.taxe_additionnelle,
        menage: t.menage_dans_assiette,
        bebes: t.bebes_parmi_occupants,
        source: t.source,
        etat: t.date_debut > aujourdhui ? "a_venir" : t === enVigueur ? "en_vigueur" : "remplacee",
        resume: fmtTaxeSejour(versReglageTaxe(t)),
      });
    }
  }

  return {
    aujourdhui,
    gites: listeGites,
    tarifs: listeTarifs,
    periodes: liste,
    baremes: listeBaremes,
    general,
    taxes: listeTaxes,
    etat: etatTarifs({
      donnees: d,
      taxes: lue.taxes,
      gites: listeGites,
      aujourdhui,
      horizon: ajouterMois(aujourdhui, general.horizonMois),
      jourDebut: general.jourDebut,
    }),
  };
}

// ─── En deux temps ───────────────────────────────────────────────────────────

export type IssuePlan =
  | { etape: "plan"; lignes: string[]; empreinte: string; message?: string }
  | { etape: "fait"; message: string }
  | { etape: "refus"; message: string };

type Preparation =
  | { refus: string }
  | { fait: string }
  | { lignes: string[]; contenu: unknown; executer: (tx: Executeur) => Promise<string> };

function empreinte(lignes: string[], contenu: unknown): string {
  return createHash("sha256").update(JSON.stringify({ lignes, contenu })).digest("hex").slice(0, 32);
}

/**
 * Sans `confirmation` : le récapitulatif. Avec : relit tout sous verrou,
 * vérifie que le récapitulatif n'a pas changé, puis écrit.
 */
async function deuxTemps(confirmation: string | null, preparer: (ex: Executeur) => Promise<Preparation>): Promise<IssuePlan> {
  if (!confirmation) {
    const p = await preparer(getDb());
    if ("refus" in p) return { etape: "refus", message: p.refus };
    if ("fait" in p) return { etape: "fait", message: p.fait };
    return { etape: "plan", lignes: p.lignes, empreinte: empreinte(p.lignes, p.contenu) };
  }
  return getDb().transaction(async (tx) => {
    // Un seul enregistrement de tarification à la fois ; les lectures du site continuent.
    await tx.execute(sql`lock table tarifs, tarifs_prix, periodes, baremes, baremes_coefficients, taxes_sejour in exclusive mode`);
    const p = await preparer(tx);
    if ("refus" in p) return { etape: "refus" as const, message: p.refus };
    if ("fait" in p) return { etape: "fait" as const, message: p.fait };
    const e = empreinte(p.lignes, p.contenu);
    if (e !== confirmation) {
      return { etape: "plan" as const, lignes: p.lignes, empreinte: e, message: "La tarification a changé entre-temps : relisez avant de confirmer." };
    }
    return { etape: "fait" as const, message: await p.executer(tx) };
  });
}

/**
 * Un autre tarif (ou barème) porte-t-il déjà ce nom, majuscules et accents
 * de casse confondus ? Comparé ici : `lower()` de PostgreSQL dépend de la
 * langue de la base et laisse « É » intact en locale C.
 */
async function nomPris(ex: Executeur, table: typeof tarifs | typeof baremes, nom: string, id: string | null): Promise<boolean> {
  const cle = nom.toLocaleLowerCase("fr-FR");
  const lignes = await ex.select({ id: table.id, nom: table.nom }).from(table);
  return lignes.some((l) => l.id !== id && l.nom.toLocaleLowerCase("fr-FR") === cle);
}

const INTACTES = "Les réservations déjà faites gardent leur prix. Le site affiche le changement tout de suite.";

// ─── Règles propres (tarif, période) ─────────────────────────────────────────

/** Saisie des règles d'un tarif ou d'une période : null = « comme le général ». */
export interface SaisieRegles {
  nuitsMinimum: string;
  arrivee: string[] | null;
  depart: string[] | null;
  baremeId: string;
}

interface Regles {
  nuitsMinimum: number | null;
  joursArrivee: number[] | null;
  joursDepart: number[] | null;
  baremeId: string | null;
}

async function lireRegles(ex: Executeur, s: SaisieRegles): Promise<Regles | string> {
  let nuitsMinimum: number | null = null;
  if (s.nuitsMinimum.trim() !== "") {
    if (!/^\d+$/.test(s.nuitsMinimum.trim()) || Number(s.nuitsMinimum) < 1 || Number(s.nuitsMinimum) > 60) {
      return "Le minimum de nuits est un nombre entre 1 et 60, ou vide pour « comme le général ».";
    }
    nuitsMinimum = Number(s.nuitsMinimum);
  }
  const joursArrivee = s.arrivee === null ? null : joursSaisis(s.arrivee);
  if (s.arrivee !== null && joursArrivee === null) return "Cochez au moins un jour d'arrivée, ou choisissez « comme le général ».";
  const joursDepart = s.depart === null ? null : joursSaisis(s.depart);
  if (s.depart !== null && joursDepart === null) return "Cochez au moins un jour de départ, ou choisissez « comme le général ».";
  let baremeId: string | null = null;
  if (s.baremeId) {
    const [b] = await ex.select({ id: baremes.id }).from(baremes).where(eq(baremes.id, s.baremeId));
    if (!b) return "Ce barème n'existe plus : rechargez la page.";
    baremeId = b.id;
  }
  return { nuitsMinimum, joursArrivee, joursDepart, baremeId };
}

function lisibleNuits(n: number | null): string {
  return n === null ? "comme le général" : `${n} nuit${n > 1 ? "s" : ""}`;
}

function lisibleJours(j: readonly number[] | null): string {
  return j === null ? "comme le général" : joursLisibles(j);
}

async function nomsBaremes(ex: Executeur): Promise<Map<string, string>> {
  return new Map((await ex.select({ id: baremes.id, nom: baremes.nom }).from(baremes)).map((b) => [b.id, b.nom]));
}

function lisibleBareme(noms: Map<string, string>, id: string | null): string {
  return id === null ? "comme le général" : `« ${noms.get(id) ?? "?"} »`;
}

function lignesRegles(avant: Regles | null, apres: Regles, noms: Map<string, string>): string[] {
  const l: string[] = [];
  const a = avant ?? { nuitsMinimum: null, joursArrivee: null, joursDepart: null, baremeId: null };
  if (a.nuitsMinimum !== apres.nuitsMinimum) l.push(`Minimum de nuits : ${lisibleNuits(a.nuitsMinimum)} → ${lisibleNuits(apres.nuitsMinimum)}.`);
  if (String(a.joursArrivee) !== String(apres.joursArrivee)) l.push(`Jours d'arrivée : ${lisibleJours(a.joursArrivee)} → ${lisibleJours(apres.joursArrivee)}.`);
  if (String(a.joursDepart) !== String(apres.joursDepart)) l.push(`Jours de départ : ${lisibleJours(a.joursDepart)} → ${lisibleJours(apres.joursDepart)}.`);
  if (a.baremeId !== apres.baremeId) l.push(`Barème : ${lisibleBareme(noms, a.baremeId)} → ${lisibleBareme(noms, apres.baremeId)}.`);
  return l;
}

// ─── Tarifs et prix ──────────────────────────────────────────────────────────

export interface SaisieTarif {
  nom: string;
  /** Prix d'une nuit par gîte (clé : id du gîte) ; vide = pas de prix. */
  prix: Record<string, string>;
  regles: SaisieRegles;
}

export async function enregistrerTarif(id: string | null, saisie: SaisieTarif, acteur: Acteur, confirmation: string | null): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) => {
    const nom = saisie.nom.trim().replace(/\s+/g, " ");
    if (!nom || nom.length > 60) return { refus: "Le nom du tarif est obligatoire (60 caractères au plus) : il s'affiche sur le site." };
    if (await nomPris(ex, tarifs, nom, id)) return { refus: `Un tarif s'appelle déjà « ${nom} ».` };
    const listeGites = await lireGites(ex);
    const prix: Record<string, number | null> = {};
    for (const g of listeGites) {
      const brut = (saisie.prix[g.id] ?? "").trim();
      if (brut === "") prix[g.id] = null;
      else {
        const c = prixSaisi(brut);
        if (c === null) return { refus: `Le prix pour ${g.nom} n'est pas valable (par exemple 75 ou 75,50, entre 1 € et 9 999,99 €).` };
        prix[g.id] = c;
      }
    }
    const regles = await lireRegles(ex, saisie.regles);
    if (typeof regles === "string") return { refus: regles };
    const d = (await chargerTarification(ex)).tarification;
    const noms = await nomsBaremes(ex);

    const avant = id ? d.tarifs.find((t) => t.id === id) : undefined;
    if (id && !avant) return { refus: "Ce tarif n'existe plus : rechargez la page." };
    const [ligneAvant] = id ? await ex.select().from(tarifs).where(eq(tarifs.id, id)) : [];
    const reglesAvant: Regles | null = ligneAvant
      ? { nuitsMinimum: ligneAvant.nuits_minimum, joursArrivee: ligneAvant.jours_arrivee, joursDepart: ligneAvant.jours_depart, baremeId: ligneAvant.bareme_id }
      : null;
    const baremeAvant = baremeEffectif(d, reglesAvant?.baremeId ?? null);
    const baremeApres = baremeEffectif(d, regles.baremeId);
    const semaine = (c: number, b: readonly number[] | null) => (b ? fmtEuro(prixPourNuits(c, b, 7)) : "—");

    const lignes: string[] = [];
    if (!avant) {
      lignes.push(`Nouveau tarif « ${nom} » :`);
      for (const g of listeGites) {
        const c = prix[g.id];
        lignes.push(c === null ? `${g.nom} : pas de prix.` : `${g.nom} : ${fmtEuro(c)} la nuit (${semaine(c, baremeApres)} la semaine).`);
      }
      lignes.push(...lignesRegles(null, regles, noms));
      lignes.push("Il n'a pas encore de période : ajoutez-en dans « Périodes » pour le mettre en vente.");
    } else {
      if (avant.nom !== nom) lignes.push(`Nom affiché sur le site : « ${avant.nom} » → « ${nom} ».`);
      const baremeChange = String(baremeAvant) !== String(baremeApres);
      for (const g of listeGites) {
        const a = avant.prixNuit[g.slug] ?? null;
        const n = prix[g.id];
        if (a === n && !baremeChange) continue;
        if (a !== null && n !== null) {
          lignes.push(
            a === n
              ? `${g.nom} : ${fmtEuro(n)} la nuit, soit ${semaine(a, baremeAvant)} → ${semaine(n, baremeApres)} la semaine (autre barème).`
              : `${g.nom} : ${fmtEuro(a)} → ${fmtEuro(n)} la nuit, soit ${semaine(a, baremeAvant)} → ${semaine(n, baremeApres)} la semaine.`,
          );
        } else if (n !== null) lignes.push(`${g.nom} : pas de prix → ${fmtEuro(n)} la nuit (${semaine(n, baremeApres)} la semaine).`);
        else if (a !== null) lignes.push(`${g.nom} : ${fmtEuro(a)} → pas de prix : ses dates à ce tarif ne seront plus réservables pour ce gîte.`);
      }
      lignes.push(...lignesRegles(reglesAvant, regles, noms));
      if (!lignes.length) return { fait: "Aucun changement." };
      lignes.push(INTACTES);
    }

    const contenu = { id, nom, prix, regles };
    return {
      lignes,
      contenu,
      executer: async (tx) => {
        const valeurs = {
          nom,
          nuits_minimum: regles.nuitsMinimum,
          jours_arrivee: regles.joursArrivee,
          jours_depart: regles.joursDepart,
          bareme_id: regles.baremeId,
        };
        let tarifId = id;
        if (tarifId) await tx.update(tarifs).set(valeurs).where(eq(tarifs.id, tarifId));
        else [{ id: tarifId }] = await tx.insert(tarifs).values(valeurs).returning({ id: tarifs.id });
        await tx.delete(tarifs_prix).where(eq(tarifs_prix.tarif_id, tarifId as string));
        const lignesPrix = Object.entries(prix).filter((e): e is [string, number] => e[1] !== null);
        if (lignesPrix.length) {
          await tx.insert(tarifs_prix).values(lignesPrix.map(([giteId, c]) => ({ tarif_id: tarifId as string, gite_id: giteId, prix_nuit: numericDepuisCentimes(c) })));
        }
        await journaliser(tx, { table: "tarifs", ligne: tarifId, action: id ? "tarif_modifie" : "tarif_cree", acteur, details: { lignes } });
        return id ? "Tarif enregistré. Le site affiche les nouveaux prix." : "Tarif créé. Ajoutez-lui des périodes pour le mettre en vente.";
      },
    };
  });
}

export async function supprimerTarif(id: string, acteur: Acteur): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`lock table tarifs, tarifs_prix, periodes in exclusive mode`);
    const [t] = await tx.select().from(tarifs).where(eq(tarifs.id, id));
    if (!t) return { ok: false, message: "Ce tarif n'existe plus." };
    const n = (await tx.select({ id: periodes.id }).from(periodes).where(eq(periodes.tarif_id, id))).length;
    if (n) return { ok: false, message: `« ${t.nom} » sert encore à ${n} période${n > 1 ? "s" : ""} : supprimez-les ou changez leur tarif d'abord.` };
    await tx.delete(tarifs).where(eq(tarifs.id, id));
    await journaliser(tx, { table: "tarifs", ligne: id, action: "tarif_supprime", acteur, details: { nom: t.nom } });
    return { ok: true, message: `Tarif « ${t.nom} » supprimé.` };
  });
}

// ─── Périodes ────────────────────────────────────────────────────────────────

export interface SaisiePeriode {
  tarifId: string;
  debut: string;
  fin: string;
  regles: SaisieRegles;
}

async function contexte(ex: Executeur, maintenant: Date): Promise<ContextePeriodes> {
  // L'un après l'autre : dans une transaction, une seule requête à la fois sur la connexion.
  const general = await lireGenerales(ex);
  const lignes = await ex.select({ id: tarifs.id, nom: tarifs.nom }).from(tarifs);
  return { aujourdhui: aujourdhuiParis(maintenant), jourDebut: general.jourDebut, noms: Object.fromEntries(lignes.map((t) => [t.id, t.nom])) };
}

function valeursPeriode(p: PeriodeGestion) {
  return {
    tarif_id: p.tarifId,
    date_debut: p.debut,
    date_fin: p.fin,
    nuits_minimum: p.nuitsMinimum,
    jours_arrivee: p.joursArrivee,
    jours_depart: p.joursDepart,
    bareme_id: p.baremeId,
  };
}

async function executerPlan(tx: Executeur, operations: Operation[], lignes: string[], action: string, acteur: Acteur): Promise<void> {
  for (const o of operations) {
    if (o.op === "supprimer") await tx.delete(periodes).where(eq(periodes.id, o.id));
    else if (o.op === "dates") await tx.update(periodes).set({ date_debut: o.debut, date_fin: o.fin }).where(eq(periodes.id, o.id));
    else if (o.op === "ecrire" && o.periode.id) await tx.update(periodes).set(valeursPeriode(o.periode)).where(eq(periodes.id, o.periode.id));
    else await tx.insert(periodes).values(valeursPeriode(o.periode));
  }
  await journaliser(tx, { table: "periodes", action, acteur, details: { lignes } });
}

function depuisPlan(plan: Plan, action: string, acteur: Acteur, message: string): Preparation {
  if (!plan.ok) return { refus: plan.message };
  return {
    lignes: plan.lignes,
    contenu: plan.operations,
    executer: async (tx) => {
      await executerPlan(tx, plan.operations, plan.lignes, action, acteur);
      return message;
    },
  };
}

export async function enregistrerPeriode(
  id: string | null,
  saisie: SaisiePeriode,
  acteur: Acteur,
  confirmation: string | null,
  maintenant: Date = new Date(),
): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) => {
    const regles = await lireRegles(ex, saisie.regles);
    if (typeof regles === "string") return { refus: regles };
    const cible: PeriodeGestion = { id: id ?? "", tarifId: saisie.tarifId, debut: saisie.debut, fin: saisie.fin, ...regles };
    const plan = planPeriode(await lirePeriodes(ex), cible, await contexte(ex, maintenant));
    return depuisPlan(plan, id ? "periode_modifiee" : "periode_ajoutee", acteur, "Périodes enregistrées.");
  });
}

export async function supprimerPeriode(id: string, acteur: Acteur, confirmation: string | null, maintenant: Date = new Date()): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) =>
    depuisPlan(planSuppression(await lirePeriodes(ex), id, await contexte(ex, maintenant)), "periode_supprimee", acteur, "Période supprimée."),
  );
}

export async function copierAnnee(annee: number, acteur: Acteur, confirmation: string | null, maintenant: Date = new Date()): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) =>
    depuisPlan(planCopie(await lirePeriodes(ex), annee, await contexte(ex, maintenant)), "annee_copiee", acteur, `Périodes de ${annee} copiées sur ${annee + 1}.`),
  );
}

// ─── Barèmes ─────────────────────────────────────────────────────────────────

export interface SaisieBareme {
  nom: string;
  pourcents: string[];
}

/** Rangs au plus : au-delà, la moyenne s'applique (D-17). */
export const CASES_MAX = 30;

function rangLisible(rang: number): string {
  return rang === 1 ? "1re nuit" : `${rang}e nuit`;
}

function moyenneLisible(cases: readonly number[]): string {
  return pourcentLisible(diviserArrondiEntier(cases.reduce((s, c) => s + c, 0), cases.length));
}

export async function enregistrerBareme(id: string | null, saisie: SaisieBareme, acteur: Acteur, confirmation: string | null): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) => {
    const nom = saisie.nom.trim().replace(/\s+/g, " ");
    if (!nom || nom.length > 60) return { refus: "Le nom du barème est obligatoire (60 caractères au plus)." };
    if (await nomPris(ex, baremes, nom, id)) return { refus: `Un barème s'appelle déjà « ${nom} ».` };
    const brutes = [...saisie.pourcents.map((p) => p.trim())];
    while (brutes.length && brutes[brutes.length - 1] === "") brutes.pop();
    if (!brutes.length) return { refus: "Un barème a au moins une case (la 1re nuit)." };
    if (brutes.length > CASES_MAX) return { refus: `${CASES_MAX} cases au plus : au-delà, chaque nuit vaut la moyenne.` };
    const cases: number[] = [];
    for (const [i, b] of brutes.entries()) {
      const v = pourcentEnDixMilliemes(b);
      if (v === null) return { refus: `${rangLisible(i + 1)} : un pourcentage entre 1 et 200, avec au plus deux chiffres après la virgule (par exemple 85 ou 85,5).` };
      cases.push(v);
    }

    const d = (await chargerTarification(ex)).tarification;
    const [ligne] = id ? await ex.select().from(baremes).where(eq(baremes.id, id)) : [];
    if (id && !ligne) return { refus: "Ce barème n'existe plus : rechargez la page." };
    const avant = id ? (d.baremes[id] ?? []) : [];

    const lignes: string[] = [];
    if (!ligne) {
      lignes.push(`Nouveau barème « ${nom} » : ${cases.map((c, i) => `${rangLisible(i + 1)} ${pourcentLisible(c)} %`).join(", ")}.`);
    } else {
      if (ligne.nom !== nom) lignes.push(`Nom : « ${ligne.nom} » → « ${nom} ».`);
      for (let i = 0; i < Math.max(avant.length, cases.length); i += 1) {
        if (i >= avant.length) lignes.push(`${rangLisible(i + 1)} ajoutée : ${pourcentLisible(cases[i])} %.`);
        else if (i >= cases.length) lignes.push(`${rangLisible(i + 1)} retirée (elle valait ${pourcentLisible(avant[i])} %).`);
        else if (avant[i] !== cases[i]) lignes.push(`${rangLisible(i + 1)} : ${pourcentLisible(avant[i])} % → ${pourcentLisible(cases[i])} %.`);
      }
      if (!lignes.length) return { fait: "Aucun changement." };
    }
    lignes.push(`Au-delà de la ${rangLisible(cases.length)}, chaque nuit vaut la moyenne des cases : ${moyenneLisible(cases)} %.`);

    if (id) {
      const listeGites = await lireGites(ex);
      for (const t of d.tarifs) {
        if ((t.baremeId ?? d.general.baremeId) !== id) continue;
        const effets = listeGites
          .filter((g) => t.prixNuit[g.slug] !== undefined)
          .map((g) => {
            const c = t.prixNuit[g.slug] as number;
            return `${g.nom} ${avant.length ? fmtEuro(prixPourNuits(c, avant, 7)) : "—"} → ${fmtEuro(prixPourNuits(c, cases, 7))}`;
          });
        if (effets.length) lignes.push(`« ${t.nom} », 7 nuits : ${effets.join(" ; ")}.`);
      }
      lignes.push(INTACTES);
    }

    return {
      lignes,
      contenu: { id, nom, cases },
      executer: async (tx) => {
        let baremeId = id;
        if (baremeId) await tx.update(baremes).set({ nom }).where(eq(baremes.id, baremeId));
        else [{ id: baremeId }] = await tx.insert(baremes).values({ nom }).returning({ id: baremes.id });
        await tx.delete(baremes_coefficients).where(eq(baremes_coefficients.bareme_id, baremeId as string));
        await tx.insert(baremes_coefficients).values(cases.map((c, i) => ({ bareme_id: baremeId as string, rang: i + 1, coefficient: coefficientNumeric(c) })));
        await journaliser(tx, { table: "baremes", ligne: baremeId, action: id ? "bareme_modifie" : "bareme_cree", acteur, details: { lignes } });
        return id ? "Barème enregistré. Le site affiche les nouveaux prix." : "Barème créé. Choisissez-le dans « Règles » ou sur un tarif pour qu'il serve.";
      },
    };
  });
}

export async function supprimerBareme(id: string, acteur: Acteur): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`lock table tarifs, periodes, baremes, baremes_coefficients in exclusive mode`);
    const [b] = await tx.select().from(baremes).where(eq(baremes.id, id));
    if (!b) return { ok: false, message: "Ce barème n'existe plus." };
    const usages = await tx.execute(sql`
      select 'le réglage général' as qui from reglages where bareme_general_id = ${id}::uuid
      union all select '« ' || nom || ' »' from tarifs where bareme_id = ${id}::uuid
      union all select 'une période' from periodes where bareme_id = ${id}::uuid`);
    if (usages.rows.length) {
      const qui = [...new Set((usages.rows as Array<{ qui: string }>).map((r) => r.qui))].join(", ");
      return { ok: false, message: `Ce barème sert encore (${qui}) : choisissez-en un autre avant de le supprimer.` };
    }
    await tx.delete(baremes).where(eq(baremes.id, id));
    await journaliser(tx, { table: "baremes", ligne: id, action: "bareme_supprime", acteur, details: { nom: b.nom } });
    return { ok: true, message: `Barème « ${b.nom} » supprimé.` };
  });
}

// ─── Règles générales ────────────────────────────────────────────────────────

export interface SaisieGenerales {
  nuitsMinimum: string;
  arrivee: string[];
  depart: string[];
  baremeId: string;
  jourDebut: string;
  horizonMois: string;
}

function entierEntre(brut: string, min: number, max: number): number | null {
  const t = brut.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export async function enregistrerGenerales(saisie: SaisieGenerales, acteur: Acteur): Promise<IssueGeste> {
  const nuits = entierEntre(saisie.nuitsMinimum, 1, 60);
  if (nuits === null) return { ok: false, message: "Le minimum de nuits est un nombre entre 1 et 60." };
  const arrivee = joursSaisis(saisie.arrivee);
  if (!arrivee) return { ok: false, message: "Cochez au moins un jour d'arrivée." };
  const depart = joursSaisis(saisie.depart);
  if (!depart) return { ok: false, message: "Cochez au moins un jour de départ." };
  const jourDebut = saisie.jourDebut === "" ? null : entierEntre(saisie.jourDebut, 1, 7);
  if (saisie.jourDebut !== "" && jourDebut === null) return { ok: false, message: "Jour de début des périodes inconnu." };
  const horizon = entierEntre(saisie.horizonMois, 1, 36);
  if (horizon === null) return { ok: false, message: "L'alerte des nuits sans tarif porte sur 1 à 36 mois." };

  return getDb().transaction(async (tx) => {
    let baremeId: string | null = null;
    if (saisie.baremeId) {
      const [b] = await tx.select({ id: baremes.id }).from(baremes).where(eq(baremes.id, saisie.baremeId));
      if (!b) return { ok: false, message: "Ce barème n'existe plus : rechargez la page." };
      baremeId = b.id;
    }
    const [r] = await tx.select().from(reglages).where(eq(reglages.id, 1)).for("update");
    if (!r) throw new Error("ligne de réglages absente");
    const apres = {
      nuits_minimum: nuits,
      jours_arrivee: arrivee,
      jours_depart: depart,
      bareme_general_id: baremeId,
      periodes_jour_debut: jourDebut,
      tarifs_horizon_mois: horizon,
    };
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const [cle, v] of Object.entries(apres)) {
      const ancien = r[cle as keyof typeof apres];
      if (String(ancien) !== String(v)) changements[cle] = { avant: ancien, apres: v };
    }
    if (!Object.keys(changements).length) return { ok: true, message: "Aucun changement." };
    await tx.update(reglages).set({ ...apres, updated_at: new Date() }).where(eq(reglages.id, 1));
    await journaliser(tx, { table: "reglages", ligne: "1", action: "reglage_modifie", acteur, details: { rubrique: "tarifs", changements } });
    return { ok: true, message: "Règles enregistrées. Le site les applique tout de suite ; les réservations déjà faites ne changent pas." };
  });
}

// ─── Taxe de séjour ──────────────────────────────────────────────────────────

export interface SaisieTaxe {
  /** Gîtes concernés (ajout) ; ignoré pour une modification. */
  gites: string[];
  dateDebut: string;
  mode: string;
  taux: string;
  plafond: string;
  tarifFixe: string;
  additionnelle: string;
  menage: boolean;
  bebes: boolean;
  source: string;
}

interface ValeursTaxe {
  date_debut: string;
  mode: (typeof MODES_TAXE_SEJOUR)[number];
  taux: string | null;
  plafond: string | null;
  tarif_fixe: string | null;
  taxe_additionnelle: string;
  menage_dans_assiette: boolean;
  bebes_parmi_occupants: boolean;
  source: string | null;
}

function lireTaxe(s: SaisieTaxe): ValeursTaxe | string {
  if (!estDate(s.dateDebut)) return "Indiquez la date à partir de laquelle la délibération s'applique.";
  if (s.mode !== "proportionnel" && s.mode !== "fixe") return "Choisissez le mode : proportionnel (gîte non classé) ou fixe (gîte classé).";
  const additionnelle = tauxSaisi(s.additionnelle || "0", false);
  if (additionnelle === null) return "La taxe additionnelle est un pourcentage entre 0 et 100 (par exemple 10).";
  const source = s.source.trim();
  if (source.length > 200) return "La référence fait 200 caractères au plus.";
  const commun = {
    date_debut: s.dateDebut,
    taxe_additionnelle: additionnelle,
    menage_dans_assiette: s.menage,
    bebes_parmi_occupants: s.bebes,
    source: source || null,
  };
  if (s.mode === "proportionnel") {
    const taux = tauxSaisi(s.taux, true);
    if (taux === null) return "Le taux est un pourcentage entre 0 et 100, sans le signe % (par exemple 5).";
    const plafond = petitMontantSaisi(s.plafond);
    if (plafond === null || plafond === 0) return "Le plafond par personne et par nuit est un montant (par exemple 4,40).";
    return { ...commun, mode: "proportionnel", taux, plafond: numericDepuisCentimes(plafond), tarif_fixe: null };
  }
  const fixe = petitMontantSaisi(s.tarifFixe);
  if (fixe === null) return "Le tarif par personne et par nuit est un montant (par exemple 0,90).";
  return { ...commun, mode: "fixe", taux: null, plafond: null, tarif_fixe: numericDepuisCentimes(fixe) };
}

function lignesTaxe(v: ValeursTaxe, nomsGites: string[], aujourdhui: string): string[] {
  const add = pourcentLisible(entierDepuisDecimal(v.taxe_additionnelle, 2));
  const regle =
    v.mode === "proportionnel"
      ? `${pourcentLisible(entierDepuisDecimal(v.taux as string, 2))} % du prix de la nuit par personne, au plus ${fmtEuro(centimesDepuisNumeric(v.plafond as string))} par personne et par nuit, plus ${add} % de taxe additionnelle.`
      : `${fmtEuro(centimesDepuisNumeric(v.tarif_fixe as string))} par personne et par nuit, plus ${add} % de taxe additionnelle.`;
  const pour = nomsGites.length > 1 ? `${nomsGites.slice(0, -1).join(", ")} et ${nomsGites[nomsGites.length - 1]}` : nomsGites[0];
  return [
    `À partir du ${dateLisible(v.date_debut)}, pour ${pour} :`,
    regle,
    `Forfait ménage : ${v.menage_dans_assiette ? "compris dans le calcul" : "hors du calcul"} ; bébés : ${v.bebes_parmi_occupants ? "comptés" : "non comptés"} parmi les occupants.`,
    ...(v.source ? [`Référence : ${v.source}.`] : []),
    `Le site affichera : « ${fmtTaxeSejour(versReglageTaxe(v))} ».`,
    v.date_debut <= aujourdhui
      ? "Elle s'applique aux réservations faites à partir de maintenant ; les réservations déjà faites gardent leur taxe."
      : "Les réservations déjà faites gardent leur taxe.",
  ];
}

async function conflitTaxe(ex: Executeur, giteId: string, nomGite: string, date: string, aujourdhui: string, sauf: string | null): Promise<string | null> {
  const lignes = (await ex.select().from(taxes_sejour).where(eq(taxes_sejour.gite_id, giteId))).filter((t) => t.id !== sauf);
  if (lignes.some((t) => t.date_debut === date)) return `${nomGite} a déjà une délibération qui commence le ${dateLisible(date)}.`;
  const commencee = lignes.find((t) => t.date_debut > date && t.date_debut <= aujourdhui);
  if (commencee) return `${nomGite} a une délibération en vigueur depuis le ${dateLisible(commencee.date_debut)} : une nouvelle doit commencer après cette date.`;
  return null;
}

export async function ajouterTaxe(saisie: SaisieTaxe, acteur: Acteur, confirmation: string | null, maintenant: Date = new Date()): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) => {
    const aujourdhui = aujourdhuiParis(maintenant);
    const v = lireTaxe(saisie);
    if (typeof v === "string") return { refus: v };
    const choisis = (await lireGites(ex)).filter((g) => saisie.gites.includes(g.id));
    if (!choisis.length) return { refus: "Cochez au moins un gîte." };
    for (const g of choisis) {
      const conflit = await conflitTaxe(ex, g.id, g.nom, v.date_debut, aujourdhui, null);
      if (conflit) return { refus: conflit };
    }
    const lignes = lignesTaxe(v, choisis.map((g) => g.nom), aujourdhui);
    return {
      lignes,
      contenu: { v, gites: choisis.map((g) => g.id) },
      executer: async (tx) => {
        await tx.insert(taxes_sejour).values(choisis.map((g) => ({ ...v, gite_id: g.id })));
        await journaliser(tx, { table: "taxes_sejour", action: "taxe_ajoutee", acteur, details: { lignes } });
        return "Taxe de séjour enregistrée.";
      },
    };
  });
}

export async function modifierTaxe(id: string, saisie: SaisieTaxe, acteur: Acteur, confirmation: string | null, maintenant: Date = new Date()): Promise<IssuePlan> {
  return deuxTemps(confirmation, async (ex) => {
    const aujourdhui = aujourdhuiParis(maintenant);
    const [t] = await ex.select().from(taxes_sejour).where(eq(taxes_sejour.id, id));
    if (!t) return { refus: "Cette délibération n'existe plus : rechargez la page." };
    if (t.date_debut <= aujourdhui) return { refus: "Cette délibération est déjà en vigueur : elle ne se modifie plus. Ajoutez-en une nouvelle, datée." };
    const v = lireTaxe(saisie);
    if (typeof v === "string") return { refus: v };
    if (v.date_debut <= aujourdhui) return { refus: "Une délibération corrigée doit commencer après aujourd'hui ; sinon, ajoutez-en une nouvelle." };
    const [g] = await ex.select({ nom: gites.nom }).from(gites).where(eq(gites.id, t.gite_id));
    const conflit = await conflitTaxe(ex, t.gite_id, g.nom, v.date_debut, aujourdhui, id);
    if (conflit) return { refus: conflit };
    const lignes = [`Délibération du ${dateLisible(t.date_debut)} corrigée.`, ...lignesTaxe(v, [g.nom], aujourdhui)];
    return {
      lignes,
      contenu: { id, v },
      executer: async (tx) => {
        await tx.update(taxes_sejour).set(v).where(eq(taxes_sejour.id, id));
        await journaliser(tx, { table: "taxes_sejour", ligne: id, action: "taxe_modifiee", acteur, details: { lignes } });
        return "Taxe de séjour corrigée.";
      },
    };
  });
}

export async function supprimerTaxe(id: string, acteur: Acteur, maintenant: Date = new Date()): Promise<IssueGeste> {
  return getDb().transaction(async (tx) => {
    const [t] = await tx.select().from(taxes_sejour).where(eq(taxes_sejour.id, id)).for("update");
    if (!t) return { ok: false, message: "Cette délibération n'existe plus." };
    if (t.date_debut <= aujourdhuiParis(maintenant)) return { ok: false, message: "Cette délibération est déjà en vigueur : elle ne se supprime plus." };
    await tx.delete(taxes_sejour).where(eq(taxes_sejour.id, id));
    await journaliser(tx, { table: "taxes_sejour", ligne: id, action: "taxe_supprimee", acteur, details: { date_debut: t.date_debut } });
    return { ok: true, message: "Délibération supprimée." };
  });
}
