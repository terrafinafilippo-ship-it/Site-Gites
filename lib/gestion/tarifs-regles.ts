// Les RÈGLES PURES de l'écran des tarifs (Phase 5, lot 3, D-34) : lecture des
// saisies (prix, pourcentages, taux), découpage des périodes, trous, copie
// d'une année, état de la tarification. Sans base ni serveur : la page, les
// actions et le contrôle (scripts/verifier-gestion-tarifs.ts) appellent le
// même code, et le navigateur s'en sert pour l'aperçu du barème.
//
// Choix du gérant (cadrage du 7 novembre 2026) :
//   - une période ajoutée au milieu d'une autre la DÉCOUPE, et le résultat
//     s'affiche avant d'être enregistré (réponse 3 B) ;
//   - une période commence et finit le jour réglé (samedi), sinon refus
//     (réponse 4, prévue par la fiche de la phase) ;
//   - les nuits passées ne changent jamais : une période finie est figée, une
//     période en cours ne change que sa date de fin (réponse 5 A) ;
//   - « Copier une année » décale de 52 semaines, pour que les samedis restent
//     des samedis (réponse 2 A).
//
// MONTANTS : un prix saisi passe par centimesDepuisNumeric (lib/centimes.ts),
// jamais par une multiplication. Un pourcentage de barème devient un
// coefficient en dix-millièmes par découpage du texte.
import { centimesDepuisNumeric } from "@/lib/centimes";
import { ajouterJours, jourSemaineIso, nombreDeNuits, nomJourIso } from "@/lib/dates-civiles";
import { resoudrePeriodes, type DonneesTarification, type PeriodeResolue } from "@/lib/tarification";
import { reglageEnVigueur, type ReglageTaxe } from "@/lib/taxe-sejour";

// ─── Saisies ─────────────────────────────────────────────────────────────────

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function estDate(iso: string): boolean {
  if (!FORME_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Prix d'une nuit saisi (« 75 », « 75,50 ») → centimes ; null si mal formé ou hors de 1 € à 9 999,99 €. */
export function prixSaisi(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const c = centimesDepuisNumeric(t);
  return c >= 100 ? c : null;
}

/** Montant de taxe saisi (« 4,40 », « 0 ») → centimes ; null si mal formé ou au-delà de 99,99 €. */
export function petitMontantSaisi(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  return centimesDepuisNumeric(t);
}

/** Pourcentage de barème bornes comprises (1 % à 200 %). */
export const POURCENT_MIN = 100;
export const POURCENT_MAX = 20_000;

/**
 * Pourcentage saisi (« 85 », « 85,5 ») → coefficient en dix-millièmes (8550),
 * par découpage du texte ; null si mal formé ou hors de 1 % à 200 %.
 */
export function pourcentEnDixMilliemes(saisie: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(saisie.trim().replace(/\s|%/g, ""));
  if (!m) return null;
  const v = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return v >= POURCENT_MIN && v <= POURCENT_MAX ? v : null;
}

/** 8550 → « 85,5 » ; 10000 → « 100 ». Par le texte. */
export function pourcentLisible(dixMilliemes: number): string {
  const t = String(dixMilliemes).padStart(3, "0");
  const decimales = t.slice(-2).replace(/0+$/, "");
  return `${t.slice(0, -2)}${decimales ? `,${decimales}` : ""}`;
}

/** 8550 → « 0.8550 », le texte numeric(6,4) écrit en base. */
export function coefficientNumeric(dixMilliemes: number): string {
  const t = String(dixMilliemes).padStart(5, "0");
  return `${t.slice(0, -4)}.${t.slice(-4)}`;
}

/** Taux saisi (« 5 », « 5,5 ») → texte numeric(5,2) (« 5.50 ») ; null si mal formé ou hors de [min, 100]. */
export function tauxSaisi(saisie: string, minExclu: boolean): string | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(saisie.trim().replace(/\s|%/g, ""));
  if (!m) return null;
  const centiemes = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (centiemes > 10_000 || (minExclu && centiemes === 0)) return null;
  const t = String(centiemes).padStart(3, "0");
  return `${t.slice(0, -2)}.${t.slice(-2)}`;
}

/** Les jours ISO d'une liste saisie, triés, sans doublon ; null si vide ou invalide. */
export function joursSaisis(valeurs: readonly string[]): number[] | null {
  const jours = [...new Set(valeurs.map(Number))].sort((a, b) => a - b);
  if (!jours.length || jours.some((j) => !Number.isInteger(j) || j < 1 || j > 7)) return null;
  return jours;
}

export function joursLisibles(jours: readonly number[]): string {
  if (jours.length === 7) return "tous les jours";
  return jours.map(nomJourIso).join(", ");
}

// ─── Dates lisibles ──────────────────────────────────────────────────────────

function jourLong(iso: string, annee: boolean): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(annee ? { year: "numeric" as const } : {}), timeZone: "UTC" })
    .replace(/^(\S+) 1 /, "$1 1er ");
}

/** « du samedi 1er mai au samedi 29 mai 2027 » : la fin est le jour du départ. */
export function plageLisible(debut: string, fin: string): string {
  return `du ${jourLong(debut, debut.slice(0, 4) !== fin.slice(0, 4))} au ${jourLong(fin, true)}`;
}

/** « samedi 1er janvier 2028 ». */
export function dateLisible(iso: string): string {
  return jourLong(iso, true);
}

// ─── Périodes ────────────────────────────────────────────────────────────────

export interface PeriodeGestion {
  /** Vide pour une période à créer. */
  id: string;
  tarifId: string;
  debut: string;
  /** Exclu : le jour du départ, première nuit de la période suivante. */
  fin: string;
  nuitsMinimum: number | null;
  joursArrivee: number[] | null;
  joursDepart: number[] | null;
  baremeId: string | null;
}

/** Ce qu'un enregistrement de périodes écrit, dans l'ordre (la base refuse tout chevauchement). */
export type Operation =
  | { op: "supprimer"; id: string }
  | { op: "dates"; id: string; debut: string; fin: string }
  | { op: "ecrire"; periode: PeriodeGestion }
  | { op: "ajouter"; periode: PeriodeGestion };

export type Plan = { ok: true; operations: Operation[]; lignes: string[] } | { ok: false; message: string };

export interface ContextePeriodes {
  aujourdhui: string;
  /** Jour ISO où commencent et finissent les périodes ; null = n'importe quel jour. */
  jourDebut: number | null;
  /** Nom des tarifs, par identifiant. */
  noms: Record<string, string>;
}

const RESERVATIONS_INTACTES = "Les réservations déjà faites gardent leur prix.";

function memesRegles(a: PeriodeGestion, b: PeriodeGestion): boolean {
  return (
    a.tarifId === b.tarifId &&
    a.nuitsMinimum === b.nuitsMinimum &&
    a.baremeId === b.baremeId &&
    String(a.joursArrivee) === String(b.joursArrivee) &&
    String(a.joursDepart) === String(b.joursDepart)
  );
}

function trie(periodes: readonly PeriodeGestion[]): PeriodeGestion[] {
  return [...periodes].sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Les nuits d'une plage [debut, fin) couvertes par au moins une période. */
function nuitsCouvertes(periodes: readonly PeriodeGestion[], debut: string, fin: string): Set<string> {
  const couvertes = new Set<string>();
  for (let d = debut; d < fin; d = ajouterJours(d, 1)) {
    if (periodes.some((p) => p.debut <= d && d < p.fin)) couvertes.add(d);
  }
  return couvertes;
}

/** Les nuits qui avaient un tarif et n'en ont plus, regroupées en plages. */
function nuitsPerdues(avant: readonly PeriodeGestion[], apres: readonly PeriodeGestion[], debut: string, fin: string): Array<[string, string]> {
  const a = nuitsCouvertes(avant, debut, fin);
  const b = nuitsCouvertes(apres, debut, fin);
  const plages: Array<[string, string]> = [];
  for (let d = debut; d < fin; d = ajouterJours(d, 1)) {
    if (!a.has(d) || b.has(d)) continue;
    const derniere = plages[plages.length - 1];
    if (derniere && derniere[1] === d) derniere[1] = ajouterJours(d, 1);
    else plages.push([d, ajouterJours(d, 1)]);
  }
  return plages;
}

function avertirPertes(lignes: string[], avant: readonly PeriodeGestion[], apres: readonly PeriodeGestion[], debut: string, fin: string): void {
  for (const [d, f] of nuitsPerdues(avant, apres, debut, fin)) {
    lignes.push(`Attention : les nuits ${plageLisible(d, f)} n'auront plus de tarif et ne seront plus réservables.`);
  }
}

/** Applique un plan à une liste de périodes (pour l'aperçu et le contrôle des pertes). */
function appliquer(periodes: readonly PeriodeGestion[], operations: readonly Operation[]): PeriodeGestion[] {
  let liste = periodes.map((p) => ({ ...p }));
  for (const o of operations) {
    if (o.op === "supprimer") liste = liste.filter((p) => p.id !== o.id);
    else if (o.op === "dates") liste = liste.map((p) => (p.id === o.id ? { ...p, debut: o.debut, fin: o.fin } : p));
    else if (o.op === "ecrire") liste = [...liste.filter((p) => !o.periode.id || p.id !== o.periode.id), o.periode];
    else liste.push(o.periode);
  }
  return trie(liste);
}

function nomDe(ctx: ContextePeriodes, tarifId: string): string {
  return ctx.noms[tarifId] ?? "Tarif inconnu";
}

function refuser(message: string): Plan {
  return { ok: false, message };
}

function controlerJour(ctx: ContextePeriodes, iso: string, quoi: "commence" | "finit"): string | null {
  if (ctx.jourDebut === null || jourSemaineIso(iso) === ctx.jourDebut) return null;
  const jour = nomJourIso(ctx.jourDebut);
  return `Une période ${quoi} un ${jour} : le ${dateLisible(iso)} n'en est pas un.`;
}

/**
 * Ce que produit l'enregistrement d'une période (nouvelle si `cible.id` est
 * vide, modifiée sinon) : les périodes qu'elle recouvre sont raccourcies,
 * coupées en deux ou supprimées. Rien n'est écrit ici.
 */
export function planPeriode(existantes: readonly PeriodeGestion[], cible: PeriodeGestion, ctx: ContextePeriodes): Plan {
  const { aujourdhui } = ctx;
  if (!estDate(cible.debut) || !estDate(cible.fin)) return refuser("Indiquez la date de début et la date de fin.");
  if (cible.fin <= cible.debut) return refuser("La fin doit venir après le début.");
  if (nombreDeNuits(cible.debut, cible.fin) > 366) return refuser("Une période dure au plus un an.");
  if (!ctx.noms[cible.tarifId]) return refuser("Choisissez un tarif.");

  const ancienne = cible.id ? existantes.find((p) => p.id === cible.id) : undefined;
  if (cible.id && !ancienne) return refuser("Cette période n'existe plus : rechargez la page.");

  if (ancienne && ancienne.fin <= aujourdhui) return refuser("Cette période est passée : elle ne se modifie plus.");
  if (ancienne && ancienne.debut < aujourdhui) {
    // En cours : les nuits passées gardent leur tarif, seule la fin bouge.
    if (cible.debut !== ancienne.debut || !memesRegles(ancienne, cible)) {
      return refuser("Cette période a déjà commencé : seule sa date de fin peut changer (les nuits passées gardent leur tarif).");
    }
    if (cible.fin < aujourdhui) return refuser("La fin ne peut pas être avant aujourd'hui.");
  } else {
    if (cible.debut < aujourdhui) return refuser("Une période ne peut pas commencer avant aujourd'hui : les nuits passées ne changent plus.");
    const jour = controlerJour(ctx, cible.debut, "commence");
    if (jour) return refuser(jour);
  }
  if (!ancienne || cible.fin !== ancienne.fin) {
    const jour = controlerJour(ctx, cible.fin, "finit");
    if (jour) return refuser(jour);
  }
  if (ancienne && cible.fin === ancienne.fin && cible.debut === ancienne.debut && memesRegles(ancienne, cible)) {
    return refuser("Aucun changement.");
  }

  const autres = trie(existantes.filter((p) => p.id !== cible.id));
  const operations: Operation[] = [];
  const morceaux: PeriodeGestion[] = [];
  const lignes: string[] = [];
  const nom = nomDe(ctx, cible.tarifId);

  if (ancienne) {
    const avant = ancienne.tarifId === cible.tarifId ? plageLisible(ancienne.debut, ancienne.fin) : `${nomDe(ctx, ancienne.tarifId)}, ${plageLisible(ancienne.debut, ancienne.fin)}`;
    lignes.push(`Période modifiée : ${nom}, ${plageLisible(cible.debut, cible.fin)} (avant : ${avant}).`);
  } else {
    lignes.push(`Nouvelle période : ${nom}, ${plageLisible(cible.debut, cible.fin)}.`);
  }

  for (const o of autres) {
    if (o.fin <= cible.debut || o.debut >= cible.fin) continue;
    if (o.fin <= aujourdhui) return refuser(`Elle recouvrirait une période passée (${nomDe(ctx, o.tarifId)}, ${plageLisible(o.debut, o.fin)}).`);
    const nomO = nomDe(ctx, o.tarifId);
    if (cible.debut <= o.debut && cible.fin >= o.fin) {
      operations.push({ op: "supprimer", id: o.id });
      lignes.push(`${nomO}, ${plageLisible(o.debut, o.fin)} : entièrement recouverte, elle disparaît.`);
    } else if (o.debut < cible.debut && o.fin > cible.fin) {
      operations.push({ op: "dates", id: o.id, debut: o.debut, fin: cible.debut });
      morceaux.push({ ...o, id: "", debut: cible.fin });
      lignes.push(`${nomO} est coupée en deux : ${plageLisible(o.debut, cible.debut)}, puis ${plageLisible(cible.fin, o.fin)}.`);
    } else if (o.debut < cible.debut) {
      operations.push({ op: "dates", id: o.id, debut: o.debut, fin: cible.debut });
      lignes.push(`${nomO} est raccourcie : ${plageLisible(o.debut, cible.debut)} (au lieu du ${dateLisible(o.fin)}).`);
    } else {
      operations.push({ op: "dates", id: o.id, debut: cible.fin, fin: o.fin });
      lignes.push(`${nomO} commence plus tard : ${plageLisible(cible.fin, o.fin)} (au lieu du ${dateLisible(o.debut)}).`);
    }
  }
  operations.push({ op: "ecrire", periode: cible });
  for (const m of morceaux) operations.push({ op: "ajouter", periode: m });

  if (ancienne) {
    const debut = ancienne.debut < cible.debut ? ancienne.debut : cible.debut;
    const fin = ancienne.fin > cible.fin ? ancienne.fin : cible.fin;
    avertirPertes(lignes, existantes, appliquer(existantes, operations), debut, fin);
  }
  lignes.push(RESERVATIONS_INTACTES);
  return { ok: true, operations, lignes };
}

/** Supprimer une période à venir : ses nuits n'ont plus de tarif. */
export function planSuppression(existantes: readonly PeriodeGestion[], id: string, ctx: ContextePeriodes): Plan {
  const p = existantes.find((x) => x.id === id);
  if (!p) return refuser("Cette période n'existe plus : rechargez la page.");
  if (p.fin <= ctx.aujourdhui) return refuser("Cette période est passée : elle ne se supprime plus.");
  if (p.debut < ctx.aujourdhui) return refuser("Cette période a déjà commencé : avancez plutôt sa date de fin.");
  return {
    ok: true,
    operations: [{ op: "supprimer", id }],
    lignes: [
      `Période supprimée : ${nomDe(ctx, p.tarifId)}, ${plageLisible(p.debut, p.fin)}.`,
      `Attention : les nuits ${plageLisible(p.debut, p.fin)} n'auront plus de tarif et ne seront plus réservables.`,
      RESERVATIONS_INTACTES,
    ],
  };
}

/** 52 semaines : le samedi 3 juillet 2027 devient le samedi 1er juillet 2028. */
export const DECALAGE_COPIE_JOURS = 364;

/** Les années qui ont au moins une période commençant dans l'année. */
export function anneesDesPeriodes(periodes: readonly PeriodeGestion[]): number[] {
  return [...new Set(periodes.map((p) => Number(p.debut.slice(0, 4))))].sort((a, b) => a - b);
}

/** Copier les périodes qui commencent en `annee` sur l'année suivante, décalées de 52 semaines. */
export function planCopie(existantes: readonly PeriodeGestion[], annee: number, ctx: ContextePeriodes): Plan {
  const sources = trie(existantes.filter((p) => p.debut.startsWith(`${annee}-`)));
  if (!sources.length) return refuser(`Aucune période ne commence en ${annee} : rien à copier.`);
  const copies = sources.map((p): PeriodeGestion => ({ ...p, id: "", debut: ajouterJours(p.debut, DECALAGE_COPIE_JOURS), fin: ajouterJours(p.fin, DECALAGE_COPIE_JOURS) }));
  if (copies[0].debut < ctx.aujourdhui) return refuser(`La copie commencerait le ${dateLisible(copies[0].debut)}, déjà passé.`);
  for (const c of copies) {
    const conflit = existantes.find((o) => o.debut < c.fin && o.fin > c.debut);
    if (conflit) {
      return refuser(
        `${annee + 1} a déjà une période (${nomDe(ctx, conflit.tarifId)}, ${plageLisible(conflit.debut, conflit.fin)}) : ` +
          "la copie ne remplace rien. Supprimez d'abord les périodes concernées, ou ajoutez-les une à une.",
      );
    }
  }
  return {
    ok: true,
    operations: copies.map((periode) => ({ op: "ajouter" as const, periode })),
    lignes: [
      `${copies.length} période${copies.length > 1 ? "s" : ""} copiée${copies.length > 1 ? "s" : ""} de ${annee} sur ${annee + 1}, décalée${copies.length > 1 ? "s" : ""} de 52 semaines (les samedis restent des samedis) :`,
      ...copies.map((c) => `${nomDe(ctx, c.tarifId)}, ${plageLisible(c.debut, c.fin)}.`),
      `Vérifiez ensuite les dates des vacances scolaires ${annee + 1}, qui ne tombent pas aux mêmes semaines.`,
    ],
  };
}

// ─── Trous et état ───────────────────────────────────────────────────────────

export interface Trou {
  debut: string;
  /** Première nuit de la période suivante ; null = aucune période après. */
  fin: string | null;
}

/** Les nuits sans période qui commencent entre `debut` (inclus) et `horizon` (exclu). */
export function trous(periodes: readonly PeriodeGestion[] | ReadonlyArray<{ debut: string; fin: string }>, debut: string, horizon: string): Trou[] {
  const liste = [...periodes].sort((a, b) => a.debut.localeCompare(b.debut));
  const resultat: Trou[] = [];
  let curseur = debut;
  for (const p of liste) {
    if (p.fin <= curseur) continue;
    if (curseur >= horizon) break;
    if (p.debut > curseur) resultat.push({ debut: curseur, fin: p.debut });
    if (p.fin > curseur) curseur = p.fin;
  }
  if (curseur < horizon) resultat.push({ debut: curseur, fin: null });
  return resultat;
}

export function trouLisible(t: Trou): string {
  return t.fin === null
    ? `Aucun tarif à partir du ${dateLisible(t.debut)} : ces nuits ne sont pas réservables sur le site.`
    : `Aucun tarif ${plageLisible(t.debut, t.fin)} : ces nuits ne sont pas réservables sur le site.`;
}

export interface EtatTarifs {
  /** Jour jusqu'auquel tout est réservable pour les trois gîtes (exclu : dernier départ possible) ; null = rien aujourd'hui. */
  reservableJusqua: string | null;
  trous: Trou[];
  /** Ce qui rend des dates invendables, en clair, hors trous. */
  problemes: string[];
}

/** Vrai s'il manque une période, un prix, un barème ou une taxe pour cette nuit dans ce gîte. */
function manque(periodes: readonly PeriodeResolue[], taxes: readonly ReglageTaxe[], date: string): boolean {
  const p = periodes.find((x) => x.debut <= date && date < x.fin);
  return !p || p.prixNuit === null || p.bareme === null || reglageEnVigueur(taxes, date) === null;
}

/**
 * L'état affiché en haut de l'écran des tarifs : jusqu'où tout est
 * réservable, les trous et les données manquantes sur l'horizon réglé.
 */
export function etatTarifs(e: {
  donnees: DonneesTarification;
  taxes: Record<string, ReglageTaxe[]>;
  gites: ReadonlyArray<{ slug: string; nom: string }>;
  aujourdhui: string;
  horizon: string;
  jourDebut: number | null;
}): EtatTarifs {
  const { donnees, aujourdhui, horizon } = e;
  const periodes = donnees.periodes;
  const resolues = new Map(e.gites.map((g) => [g.slug, resoudrePeriodes(donnees, g.slug)]));
  const finPeriodes = periodes.reduce<string | null>((m, p) => (m === null || p.fin > m ? p.fin : m), null);

  let reservableJusqua: string | null = null;
  if (finPeriodes && finPeriodes > aujourdhui) {
    let d = aujourdhui;
    for (; d < finPeriodes; d = ajouterJours(d, 1)) {
      if (e.gites.some((g) => manque(resolues.get(g.slug) ?? [], e.taxes[g.slug] ?? [], d))) break;
    }
    reservableJusqua = d === aujourdhui ? null : d;
  }

  const problemes: string[] = [];
  const aVenir = periodes.filter((p) => p.fin > aujourdhui && p.debut < horizon);
  if (donnees.general.baremeId === null) problemes.push("Aucun barème général : choisissez-en un dans « Règles ».");
  for (const t of donnees.tarifs) {
    const siennes = aVenir.filter((p) => p.tarifId === t.id);
    if (!siennes.length) continue;
    for (const g of e.gites) {
      if (t.prixNuit[g.slug] === undefined) problemes.push(`« ${t.nom} » n'a pas de prix pour ${g.nom} : ses dates ne sont pas réservables pour ce gîte.`);
    }
  }
  const sansBareme = new Set<string>();
  const premier = e.gites[0] ? (resolues.get(e.gites[0].slug) ?? []) : [];
  for (const p of premier) {
    if (p.fin <= aujourdhui || p.debut >= horizon || p.bareme !== null || donnees.general.baremeId === null) continue;
    sansBareme.add(p.tarifNom);
  }
  for (const nom of sansBareme) problemes.push(`Le barème utilisé par « ${nom} » est vide ou incomplet : ses dates ne sont pas réservables.`);
  for (const g of e.gites) {
    if (!aVenir.length) break;
    const premiereNuit = aVenir[0].debut > aujourdhui ? aVenir[0].debut : aujourdhui;
    if (reglageEnVigueur(e.taxes[g.slug] ?? [], premiereNuit) === null) {
      problemes.push(`Pas de taxe de séjour pour ${g.nom} au ${dateLisible(premiereNuit)} : ses dates ne sont pas réservables. Ajoutez la délibération dans « Taxe de séjour ».`);
    }
  }
  if (e.jourDebut !== null) {
    const jour = nomJourIso(e.jourDebut);
    for (const p of aVenir) {
      if (jourSemaineIso(p.debut) !== e.jourDebut || jourSemaineIso(p.fin) !== e.jourDebut) {
        problemes.push(`La période « ${e.donnees.tarifs.find((t) => t.id === p.tarifId)?.nom ?? "?"} » ${plageLisible(p.debut, p.fin)} ne commence pas ou ne finit pas un ${jour}.`);
      }
    }
  }
  return { reservableJusqua, trous: trous(periodes, aujourdhui, horizon), problemes };
}

/** Le jour qui suit de `mois` mois `iso` (même quantième, ramené à la fin du mois si besoin). */
export function ajouterMois(iso: string, mois: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + mois;
  const annee = Math.floor(total / 12);
  const moisCible = (total % 12) + 1;
  const dernier = new Date(Date.UTC(annee, moisCible, 0)).getUTCDate();
  return `${annee}-${String(moisCible).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
}
