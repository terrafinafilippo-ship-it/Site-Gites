// LES STATISTIQUES du back-office (Phase 5, lot 6). Liste décidée le
// 3 novembre 2026 (réponse S : « toutes ») ; cadrage du 8 novembre :
//   - les séjours sont rangés au MOIS DU SÉJOUR, pas au mois du paiement
//     (réponse 1 B : « quel mois a été productif ») ; un séjour compte en
//     entier au mois de son arrivée, comme pour la taxe de séjour ;
//   - la taxe de séjour d'une période : les séjours qui COMMENCENT dans la
//     période, une ligne par séjour — le registre de la taxe (réponse 2 A) ;
//   - la provenance : langue du site, pays, département pour la France,
//     d'après l'adresse du client (réponse 3 A, décidée le 3 novembre) ;
//   - les commissions évitées : un taux en réglage, vide au départ (4 A).
//
// Seules comptent les réservations payées (`confirmee`, `terminee`) : ni les
// tentatives, ni les nuits bloquées par les propriétaires. Les séjours vendus
// sur les plateformes n'entrent dans le site qu'avec la Phase 7, et sans leur
// prix. « Hors taxe » veut dire hors taxe de séjour : la SARL est exonérée de
// TVA (art. 261 D 4° CGI). La caution n'est pas un revenu ; les retenues sont
// montrées à part.
import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { gites, reglages } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { aujourdhuiParis, nombreDeNuits } from "@/lib/dates-civiles";
import { DEPARTEMENTS, departementDuCodePostal } from "@/lib/departements";

import { estDate } from "./tarifs-regles";

const PAYEES = sql`r.statut in ('confirmee', 'terminee')`;

export interface ParGite {
  giteId: string;
  /** Douze valeurs, de janvier à décembre. */
  mois: number[];
}

export interface ChiffresReservations {
  nombre: number;
  /** Nuits par séjour, en moyenne ; `null` sans séjour. */
  dureeMoyenne: number | null;
  /** Jours entre la réservation et l'arrivée, en moyenne ; `null` sans séjour. */
  delaiMoyen: number | null;
}

export interface LigneRegistre {
  reservationId: string;
  reference: string;
  client: string;
  gite: string;
  arrivee: string;
  depart: string;
  nuits: number;
  adultes: number;
  /** Enfants et bébés : exonérés. */
  mineurs: number;
  /** Adultes × nuits. */
  nuitees: number;
  /** Centimes. */
  taxe: number;
}

export interface Retenue {
  reservationId: string;
  client: string;
  gite: string;
  date: string;
  /** Centimes. */
  montant: number;
  motif: string;
}

export interface PageStatistiques {
  annee: number;
  annees: number[];
  gites: { id: string; nom: string }[];
  nuits: ParGite[];
  /** Centimes, hors taxe de séjour, au mois de l'arrivée. */
  sejours: ParGite[];
  reservations: { parGite: (ChiffresReservations & { giteId: string })[]; total: ChiffresReservations };
  commission: { taux: number | null; base: number; montant: number | null };
  provenance: {
    langues: { fr: number; en: number };
    pays: { libelle: string; nombre: number }[];
    departements: { code: string; nom: string; nombre: number }[];
    /** Clients en France dont le code postal ne désigne aucun département. */
    franceSansDepartement: number;
  };
  retenues: Retenue[];
  registre: { du: string; au: string; lignes: LigneRegistre[]; nuitees: number; taxe: number };
}

function nomClient(prenom: string | null, nom: string | null): string {
  return [prenom, (nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client";
}

/** Clé de regroupement d'un pays saisi librement : « France », « france », « FRANCE » vont ensemble. */
function clePays(pays: string): string {
  return pays.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function moyenne(valeurs: number[]): number | null {
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

function chiffres(lignes: { nuits: number; delai: number }[]): ChiffresReservations {
  return {
    nombre: lignes.length,
    dureeMoyenne: moyenne(lignes.map((l) => l.nuits)),
    delaiMoyen: moyenne(lignes.map((l) => l.delai)),
  };
}

/**
 * Les statistiques d'une année (séjours qui y commencent ; les nuits, elles,
 * sont comptées dans leur mois), et le registre de la taxe de séjour entre
 * deux dates (par défaut, l'année entière).
 */
export async function lireStatistiques(
  saisie: { annee?: string; du?: string; au?: string },
  maintenant: Date = new Date(),
): Promise<PageStatistiques> {
  const db = getDb();
  const anneeCourante = Number(aujourdhuiParis(maintenant).slice(0, 4));
  const annee = /^\d{4}$/.test(saisie.annee ?? "") ? Number(saisie.annee) : anneeCourante;
  const debut = `${annee}-01-01`;
  const fin = `${annee + 1}-01-01`;

  const listeGites = await db.select({ id: gites.id, nom: gites.nom }).from(gites).orderBy(asc(gites.nom));
  const vide = (): ParGite[] => listeGites.map((g) => ({ giteId: g.id, mois: Array<number>(12).fill(0) }));

  const anneesLues = await db.execute<{ annee: number }>(sql`
    select distinct extract(year from r.date_arrivee)::int as annee from reservations r where ${PAYEES}`);
  const annees = [...new Set([anneeCourante, annee, ...anneesLues.rows.map((r) => r.annee)])].sort((a, b) => b - a);

  // Nuits louées : chaque nuit dans son mois, même d'un séjour à cheval sur deux mois ou deux années.
  const nuits = vide();
  const lignesNuits = await db.execute<{ gite_id: string; mois: number; n: number }>(sql`
    select r.gite_id, extract(month from n.jour)::int as mois, count(*)::int as n
      from reservations r
      cross join lateral generate_series(r.date_arrivee, r.date_depart - 1, interval '1 day') as n(jour)
     where ${PAYEES} and n.jour >= ${debut}::date and n.jour < ${fin}::date
     group by 1, 2`);
  for (const l of lignesNuits.rows) {
    const g = nuits.find((x) => x.giteId === l.gite_id);
    if (g) g.mois[l.mois - 1] = l.n;
  }

  // Les séjours de l'année, une ligne chacun.
  const resas = await db.execute<{
    id: string;
    gite_id: string;
    date_arrivee: string;
    date_depart: string;
    reserve_le: string;
    langue: string;
    client_pays: string | null;
    client_code_postal: string | null;
    montant: string;
  }>(sql`
    select r.id::text as id, r.gite_id, r.date_arrivee::text as date_arrivee, r.date_depart::text as date_depart,
           (r.created_at at time zone 'Europe/Paris')::date::text as reserve_le, r.langue, r.client_pays, r.client_code_postal,
           (coalesce(r.prix_location, 0) + coalesce(r.forfait_menage, 0) + coalesce(r.options, 0))::text as montant
      from reservations r
     where ${PAYEES} and r.date_arrivee >= ${debut}::date and r.date_arrivee < ${fin}::date
     order by r.date_arrivee`);

  const sejours = vide();
  const parGiteLignes = new Map<string, { nuits: number; delai: number }[]>(listeGites.map((g) => [g.id, []]));
  const langues = { fr: 0, en: 0 };
  const pays = new Map<string, { libelle: string; nombre: number }>();
  const departements = new Map<string, number>();
  let franceSansDepartement = 0;
  let base = 0;

  for (const r of resas.rows) {
    const montant = centimesDepuisNumeric(r.montant);
    base += montant;
    const g = sejours.find((x) => x.giteId === r.gite_id);
    if (g) g.mois[Number(r.date_arrivee.slice(5, 7)) - 1] += montant;
    parGiteLignes.get(r.gite_id)?.push({
      nuits: nombreDeNuits(r.date_arrivee, r.date_depart),
      delai: Math.max(0, nombreDeNuits(r.reserve_le, r.date_arrivee)),
    });

    if (r.langue === "en") langues.en += 1;
    else langues.fr += 1;
    const saisiPays = (r.client_pays ?? "").trim();
    const cle = clePays(saisiPays) || "—";
    const p = pays.get(cle) ?? { libelle: saisiPays || "Non renseigné", nombre: 0 };
    p.nombre += 1;
    pays.set(cle, p);
    if (cle === "france") {
      const dep = departementDuCodePostal(r.client_code_postal);
      if (dep) departements.set(dep, (departements.get(dep) ?? 0) + 1);
      else franceSansDepartement += 1;
    }
  }

  const [reglage] = await db.select({ taux: reglages.commission_taux }).from(reglages).where(eq(reglages.id, 1));
  const taux = reglage?.taux ?? null;
  // Le `/ 100` porte sur le TAUX, pas sur un montant (règle 3), comme l'acompte.
  const commission = { taux, base, montant: taux === null ? null : Math.round(base * (taux / 100)) };

  const lignesRetenues = await db.execute<{
    reservation_id: string;
    client_prenom: string | null;
    client_nom: string | null;
    gite: string;
    faite_le: string;
    montant: string;
    motif: string;
  }>(sql`
    select r.id::text as reservation_id, r.client_prenom, r.client_nom, g.nom as gite, (t.faite_at at time zone 'Europe/Paris')::date::text as faite_le, t.montant::text as montant, t.motif
      from retenues t
      join reservations r on r.id = t.reservation_id
      join gites g on g.id = r.gite_id
     where t.faite_at is not null and r.date_arrivee >= ${debut}::date and r.date_arrivee < ${fin}::date
     order by t.faite_at`);

  // Registre de la taxe de séjour : séjours qui commencent entre `du` et `au` inclus.
  const du = estDate(saisie.du ?? "") ? saisie.du! : debut;
  const au = estDate(saisie.au ?? "") ? saisie.au! : `${annee}-12-31`;
  const lignesRegistre = await db.execute<{
    id: string;
    reference: string;
    client_prenom: string | null;
    client_nom: string | null;
    gite: string;
    date_arrivee: string;
    date_depart: string;
    nb_adultes: number;
    nb_enfants: number;
    nb_bebes: number;
    taxe_sejour: string | null;
  }>(sql`
    select r.id::text as id, r.reference, r.client_prenom, r.client_nom, g.nom as gite,
           r.date_arrivee::text as date_arrivee, r.date_depart::text as date_depart,
           r.nb_adultes, r.nb_enfants, r.nb_bebes, r.taxe_sejour::text as taxe_sejour
      from reservations r join gites g on g.id = r.gite_id
     where ${PAYEES} and r.date_arrivee >= ${du}::date and r.date_arrivee <= ${au}::date
     order by r.date_arrivee, r.reference`);
  const registre = lignesRegistre.rows.map<LigneRegistre>((r) => {
    const n = nombreDeNuits(r.date_arrivee, r.date_depart);
    return {
      reservationId: r.id,
      reference: r.reference,
      client: nomClient(r.client_prenom, r.client_nom),
      gite: r.gite,
      arrivee: r.date_arrivee,
      depart: r.date_depart,
      nuits: n,
      adultes: r.nb_adultes,
      mineurs: r.nb_enfants + r.nb_bebes,
      nuitees: r.nb_adultes * n,
      taxe: centimesDepuisNumeric(r.taxe_sejour) ?? 0,
    };
  });

  return {
    annee,
    annees,
    gites: listeGites,
    nuits,
    sejours,
    reservations: {
      parGite: listeGites.map((g) => ({ giteId: g.id, ...chiffres(parGiteLignes.get(g.id) ?? []) })),
      total: chiffres([...parGiteLignes.values()].flat()),
    },
    commission,
    provenance: {
      langues,
      pays: [...pays.values()].sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, "fr")),
      departements: [...departements.entries()]
        .map(([code, nombre]) => ({ code, nom: DEPARTEMENTS[code], nombre }))
        .sort((a, b) => b.nombre - a.nombre || a.code.localeCompare(b.code)),
      franceSansDepartement,
    },
    retenues: lignesRetenues.rows.map((t) => ({
      reservationId: t.reservation_id,
      client: nomClient(t.client_prenom, t.client_nom),
      gite: t.gite,
      date: t.faite_le,
      montant: centimesDepuisNumeric(t.montant),
      motif: t.motif,
    })),
    registre: {
      du,
      au,
      lignes: registre,
      nuitees: registre.reduce((s, l) => s + l.nuitees, 0),
      taxe: registre.reduce((s, l) => s + l.taxe, 0),
    },
  };
}
