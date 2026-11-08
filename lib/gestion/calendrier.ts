// LE CALENDRIER du back-office (Phase 5, lot 4), cadrage du 7 novembre 2026 :
//   - un mois à la fois, les trois gîtes l'un sous l'autre, une case par
//     nuit : réservée (client, lien vers la fiche), en cours de paiement,
//     fermée, en option, libre, sans tarif (réponse 2 A) ;
//   - FERMER des nuits : un gîte, le premier et le dernier jour, un geste
//     (décision 10 du cadrage de la phase) ; rien n'est fermé si une seule
//     nuit est déjà prise, et l'écran dit laquelle et par qui. Rouvrir :
//     un clic sur le bloc. Rien de plus (réponse 3 : « ça se fera
//     manuellement ») ;
//   - poser une OPTION pour un client au téléphone (réponse 1 B) : ses nuits
//     sont fermées à tous sauf à lui, qui reçoit un lien personnel ; sans
//     paiement à la fin du jour « aujourd'hui + N » (réglage, 3 jours), elles
//     se libèrent d'elles-mêmes. On peut la lever avant.
//
// Les nuits passées ne se ferment ni ne se rouvrent. Chaque geste est écrit
// au journal, dans sa transaction ; le site public relit le calendrier tout
// de suite (étiquette « gites », côté action).
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { gites, options_sejour, reglages } from "@/db/schema";
import { inscrireOption } from "@/lib/courriels";
import { isGiteId } from "@/lib/data/gites";
import { ajouterJours, aujourdhuiParis, nombreDeNuits, premierJourDuMois } from "@/lib/dates-civiles";
import { controlerDates, preparerDevis } from "@/lib/devis";
import { dernierJourOption, etatOption } from "@/lib/options-sejour";
import type { Executeur } from "@/lib/reservations";
import { isUuid, messageErreur } from "@/lib/route-helpers";
import { FORME_EMAIL } from "@/lib/suivi";
import { chargerTarification } from "@/lib/tarifs";
import { resoudrePeriodes } from "@/lib/tarification";
import { chargerDonneesTunnel } from "@/lib/tunnel";

import type { IssueGeste } from "./cautions";
import { journaliser, type Acteur } from "./journal";
import { dateLisible, estDate, plageLisible } from "./tarifs-regles";

/** Nuits fermées d'un seul geste, au plus (un an). */
export const NUITS_MAX_FERMETURE = 366;

const SOURCES: Record<string, string> = { airbnb: "Airbnb", booking: "Booking", gdf: "Gîtes de France" };

export type CaseNuit =
  | { etat: "libre" }
  | { etat: "sans_tarif" }
  | { etat: "reserve"; client: string; reservationId: string | null }
  | { etat: "paiement" }
  | { etat: "ferme" }
  | { etat: "option"; client: string; dernierJour: string };

export interface JourGite {
  date: string;
  passe: boolean;
  case: CaseNuit;
}

export interface LigneCalendrier {
  giteId: string;
  nom: string;
  jours: JourGite[];
}

export interface BlocFerme {
  giteId: string;
  gite: string;
  /** Première et dernière nuit fermées (incluse). */
  du: string;
  au: string;
}

export interface OptionEnCours {
  id: string;
  gite: string;
  client: string;
  email: string;
  arrivee: string;
  depart: string;
  dernierJour: string;
}

export interface PageCalendrier {
  mois: string;
  aujourdhui: string;
  gites: { id: string; nom: string }[];
  lignes: LigneCalendrier[];
  blocs: BlocFerme[];
  options: OptionEnCours[];
  dureeOptionJours: number;
}

/** « 2027-01 » → premier jour du mois ; mois courant si la saisie est mal formée. */
export function premierJour(mois: string | undefined, aujourdhui: string): string {
  return mois && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois) ? `${mois}-01` : premierJourDuMois(aujourdhui);
}

function nomClient(prenom: string | null, nom: string | null): string {
  return [prenom, (nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client";
}

type LigneNuit = {
  gite_id: string;
  date: string;
  statut: string;
  source: string;
  echeance: Date | null;
  reservation_id: string | null;
  resa_statut: string | null;
  client_prenom: string | null;
  client_nom: string | null;
  option_client: string | null;
};

/** Les nuits prises d'un gîte sur [du, au], chacune avec ce qui la prend. Lignes échues : ignorées. */
async function lireNuits(ex: Executeur, du: string, au: string, giteId: string | null): Promise<LigneNuit[]> {
  const r = await ex.execute<LigneNuit>(sql`
    select d.gite_id::text as gite_id, d.date::text as date, d.statut, d.source, d.verrou_expire_at as echeance,
           d.reservation_id::text as reservation_id, r.statut as resa_statut,
           r.client_prenom, r.client_nom, o.client_nom as option_client
      from disponibilites d
      left join reservations r on r.id = d.reservation_id
      left join options_sejour o on o.id = d.option_id
     where d.date >= ${du}::date and d.date <= ${au}::date
       and (d.verrou_expire_at is null or d.verrou_expire_at > now())
       ${giteId ? sql`and d.gite_id = ${giteId}::uuid` : sql``}
     order by d.gite_id, d.date`);
  return r.rows.map((l) => ({ ...l, echeance: l.echeance ? new Date(l.echeance) : null }));
}

function caseDe(l: LigneNuit): CaseNuit {
  if (l.statut === "bloque") return { etat: "ferme" };
  if (l.statut === "verrou") return { etat: "paiement" };
  if (l.statut === "option") return { etat: "option", client: l.option_client ?? "", dernierJour: dernierJourOption(l.echeance!) };
  if (l.source !== "directe") return { etat: "reserve", client: SOURCES[l.source] ?? l.source, reservationId: null };
  const fiche = l.resa_statut === "confirmee" || l.resa_statut === "terminee" || l.resa_statut === "annulee";
  return { etat: "reserve", client: nomClient(l.client_prenom, l.client_nom), reservationId: fiche ? l.reservation_id : null };
}

export async function lireCalendrierGestion(mois: string | undefined, maintenant: Date = new Date()): Promise<PageCalendrier> {
  const db = getDb();
  const aujourdhui = aujourdhuiParis(maintenant);
  const du = premierJour(mois, aujourdhui);
  const finMois = ajouterJours(premierJourDuMois(du, 1), -1);
  const listeGites = await db.select({ id: gites.id, nom: gites.nom, slug: gites.slug }).from(gites).orderBy(asc(gites.nom));
  const nuits = await lireNuits(db, du, finMois, null);
  const lue = await chargerTarification(db);
  const [r] = await db.select({ duree: reglages.option_duree_jours }).from(reglages).where(eq(reglages.id, 1));

  const lignes: LigneCalendrier[] = listeGites.map((g) => {
    const periodes = isGiteId(g.slug) ? resoudrePeriodes(lue.tarification, g.slug) : [];
    const prises = new Map(nuits.filter((n) => n.gite_id === g.id).map((n) => [n.date, n]));
    const jours: JourGite[] = [];
    for (let i = 0; i <= nombreDeNuits(du, finMois); i += 1) {
      const date = ajouterJours(du, i);
      const prise = prises.get(date);
      let c: CaseNuit;
      if (prise) c = caseDe(prise);
      else {
        const p = periodes.find((x) => x.debut <= date && date < x.fin);
        c = !p || p.prixNuit === null || p.bareme === null ? { etat: "sans_tarif" } : { etat: "libre" };
      }
      jours.push({ date, passe: date < aujourdhui, case: c });
    }
    return { giteId: g.id, nom: g.nom, jours };
  });

  // Les blocs fermés à venir, tous mois confondus : nuits consécutives d'un même gîte.
  const fermees = await db.execute<{ gite_id: string; date: string }>(sql`
    select gite_id::text as gite_id, date::text as date from disponibilites
     where statut = 'bloque' and date >= ${aujourdhui}::date
     order by gite_id, date`);
  const noms = new Map(listeGites.map((g) => [g.id, g.nom]));
  const blocs: BlocFerme[] = [];
  for (const f of fermees.rows) {
    const dernier = blocs.at(-1);
    if (dernier && dernier.giteId === f.gite_id && ajouterJours(dernier.au, 1) === f.date) dernier.au = f.date;
    else blocs.push({ giteId: f.gite_id, gite: noms.get(f.gite_id) ?? "", du: f.date, au: f.date });
  }
  blocs.sort((a, b) => a.du.localeCompare(b.du) || a.gite.localeCompare(b.gite));

  const opts = await db
    .select({ o: options_sejour, gite: gites.nom })
    .from(options_sejour)
    .innerJoin(gites, eq(gites.id, options_sejour.gite_id))
    .where(and(isNull(options_sejour.levee_at), isNull(options_sejour.utilisee_at), gte(options_sejour.expire_at, maintenant)))
    .orderBy(asc(options_sejour.date_arrivee));

  return {
    mois: du.slice(0, 7),
    aujourdhui,
    gites: listeGites.map((g) => ({ id: g.id, nom: g.nom })),
    lignes,
    blocs,
    options: opts.map(({ o, gite }) => ({
      id: o.id,
      gite,
      client: o.client_nom,
      email: o.client_email,
      arrivee: o.date_arrivee,
      depart: o.date_depart,
      dernierJour: dernierJourOption(o.expire_at),
    })),
    dureeOptionJours: r?.duree ?? 3,
  };
}

// ─── Qui prend une nuit ──────────────────────────────────────────────────────

/** « réservée par Jean DUPONT (SAM-2027-7K4QX) », « en cours de paiement »… pour dire pourquoi un geste est refusé. */
async function occupants(ex: Executeur, giteId: string, du: string, au: string): Promise<string> {
  const r = await ex.execute<LigneNuit & { reference: string | null }>(sql`
    select d.gite_id::text as gite_id, d.date::text as date, d.statut, d.source, d.verrou_expire_at as echeance,
           d.reservation_id::text as reservation_id, r.statut as resa_statut, r.reference,
           r.client_prenom, r.client_nom, o.client_nom as option_client
      from disponibilites d
      left join reservations r on r.id = d.reservation_id
      left join options_sejour o on o.id = d.option_id
     where d.gite_id = ${giteId}::uuid and d.date >= ${du}::date and d.date <= ${au}::date
       and (d.verrou_expire_at is null or d.verrou_expire_at > now())
     order by d.date`);
  // [une nuit, plusieurs nuits] : « déjà bloquée », « déjà bloquées ».
  const groupes: { qui: [string, string]; du: string; au: string }[] = [];
  for (const l of r.rows) {
    const qui: [string, string] =
      l.statut === "bloque"
        ? ["déjà bloquée", "déjà bloquées"]
        : l.statut === "verrou"
          ? ["en cours de paiement par un client du site", "en cours de paiement par un client du site"]
          : l.statut === "option"
            ? [`gardée par l'option de ${l.option_client ?? "un client"}`, `gardées par l'option de ${l.option_client ?? "un client"}`]
            : l.source !== "directe"
              ? [`vendue sur ${SOURCES[l.source] ?? l.source}`, `vendues sur ${SOURCES[l.source] ?? l.source}`]
              : ((qui) => [`réservée par ${qui}`, `réservées par ${qui}`] as [string, string])(
                  `${nomClient(l.client_prenom, l.client_nom)}${l.reference ? ` (${l.reference})` : ""}`,
                );
    const dernier = groupes.at(-1);
    if (dernier && dernier.qui[0] === qui[0] && ajouterJours(dernier.au, 1) === l.date) dernier.au = l.date;
    else groupes.push({ qui, du: l.date, au: l.date });
  }
  return groupes
    .slice(0, 3)
    .map((g) => (g.du === g.au ? `la nuit du ${dateLisible(g.du)} est ${g.qui[0]}` : `les nuits ${plageLisible(g.du, g.au)} sont ${g.qui[1]}`))
    .join(" ; ");
}

class NuitsPrises extends Error {}

async function giteDe(ex: Executeur, giteId: string) {
  if (!isUuid(giteId)) return null;
  const [g] = await ex.select({ id: gites.id, nom: gites.nom, slug: gites.slug }).from(gites).where(eq(gites.id, giteId));
  return g ?? null;
}

// ─── Fermer, rouvrir ─────────────────────────────────────────────────────────

export async function fermerNuits(
  saisie: { giteId: string; du: string; au: string },
  acteur: Acteur,
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const { du, au } = saisie;
  if (!estDate(du) || !estDate(au)) return { ok: false, message: "Indiquez le premier et le dernier jour." };
  if (au < du) return { ok: false, message: "Le dernier jour est avant le premier." };
  if (du < aujourdhui) return { ok: false, message: "Les nuits passées ne se bloquent pas : commencez aujourd'hui ou plus tard." };
  const nuits = nombreDeNuits(du, au) + 1;
  if (nuits > NUITS_MAX_FERMETURE) return { ok: false, message: "Un an au plus d'un seul geste." };
  const db = getDb();
  const gite = await giteDe(db, saisie.giteId);
  if (!gite) return { ok: false, message: "Choisissez un gîte." };
  try {
    return await db.transaction(async (tx) => {
      const r = await tx.execute(sql`
        insert into disponibilites (gite_id, date, statut, source)
        select ${gite.id}::uuid, nuit::date, 'bloque', 'directe'
          from generate_series(${du}::date, ${au}::date, interval '1 day') as nuit
        on conflict (gite_id, date) do update
           set statut = 'bloque', source = 'directe', reservation_id = null, option_id = null,
               verrou_expire_at = null, created_at = now()
         where disponibilites.verrou_expire_at <= now()`);
      if ((r.rowCount ?? 0) !== nuits) throw new NuitsPrises();
      await journaliser(tx, { table: "gites", ligne: gite.id, action: "nuits_fermees", acteur, details: { du, au, nuits } });
      return {
        ok: true,
        message:
          `${gite.nom} : ${nuits === 1 ? `nuit du ${dateLisible(du)} bloquée` : `nuits bloquées ${plageLisible(du, au)} inclus (${nuits} nuits)`}. ` +
          `Un séjour peut se terminer le ${dateLisible(du)} au matin et commencer le ${dateLisible(ajouterJours(au, 1))}.`,
      };
    });
  } catch (erreur) {
    if (!(erreur instanceof NuitsPrises)) throw erreur;
    return { ok: false, message: `Rien n'est bloqué : ${await occupants(db, gite.id, du, au)}.` };
  }
}

export async function rouvrirNuits(
  saisie: { giteId: string; du: string; au: string },
  acteur: Acteur,
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const aujourdhui = aujourdhuiParis(maintenant);
  if (!estDate(saisie.du) || !estDate(saisie.au) || saisie.au < saisie.du) return { ok: false, message: "Bloc de nuits invalide." };
  const du = saisie.du < aujourdhui ? aujourdhui : saisie.du;
  const db = getDb();
  const gite = await giteDe(db, saisie.giteId);
  if (!gite) return { ok: false, message: "Gîte introuvable." };
  if (saisie.au < du) return { ok: false, message: "Ces nuits sont passées : elles restent telles quelles." };
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      delete from disponibilites
       where gite_id = ${gite.id}::uuid and statut = 'bloque'
         and date >= ${du}::date and date <= ${saisie.au}::date`);
    const nuits = r.rowCount ?? 0;
    if (nuits === 0) return { ok: false, message: "Ces nuits ne sont plus bloquées." };
    await journaliser(tx, { table: "gites", ligne: gite.id, action: "nuits_rouvertes", acteur, details: { du, au: saisie.au, nuits } });
    return {
      ok: true,
      message: `${gite.nom} : ${nuits === 1 ? "1 nuit débloquée" : `${nuits} nuits débloquées`}, de nouveau réservables (${plageLisible(du, saisie.au)}).`,
    };
  });
}

// ─── Options ─────────────────────────────────────────────────────────────────

export async function poserOption(
  saisie: { giteId: string; arrivee: string; depart: string; nom: string; email: string; langue: string },
  acteur: Acteur,
  maintenant: Date = new Date(),
): Promise<IssueGeste> {
  const nom = saisie.nom.trim().replace(/\s+/g, " ");
  const email = saisie.email.trim().toLowerCase();
  const langue = saisie.langue === "en" ? "en" : "fr";
  const { arrivee, depart } = saisie;
  if (!nom || nom.length > 80) return { ok: false, message: "Indiquez le nom du client (80 caractères au plus), tel qu'il ouvrira le courriel : « M. Durand »." };
  if (!FORME_EMAIL.test(email) || email.length > 254) return { ok: false, message: "Le courriel du client n'est pas valable." };
  if (!estDate(arrivee) || !estDate(depart)) return { ok: false, message: "Indiquez le jour d'arrivée et le jour de départ." };
  if (depart <= arrivee) return { ok: false, message: "Le départ doit être après l'arrivée." };
  const db = getDb();
  const gite = await giteDe(db, saisie.giteId);
  if (!gite || !isGiteId(gite.slug)) return { ok: false, message: "Choisissez un gîte." };

  // Les dates doivent être réservables en ligne : sinon le lien ne servirait à rien.
  let tunnel;
  try {
    tunnel = await chargerDonneesTunnel(gite.slug, db);
  } catch (erreur) {
    console.error("[gestion] option : tunnel illisible :", messageErreur(erreur));
    return { ok: false, message: "Le site ne peut pas vérifier ces dates en ce moment (tarifs ou réglages illisibles) : l'option n'est pas posée." };
  }
  const controle = controlerDates(preparerDevis(tunnel.donnees, "fr"), arrivee, depart);
  if (!controle.ok) return { ok: false, message: `Le site refuserait ces dates à ${nom} : ${controle.refus.message}` };

  const aujourdhui = aujourdhuiParis(maintenant);
  try {
    return await db.transaction(async (tx) => {
      const [r] = await tx.select({ duree: reglages.option_duree_jours }).from(reglages).where(eq(reglages.id, 1));
      if (!r) throw new Error("ligne de réglages absente");
      const dernierJour = ajouterJours(aujourdhui, r.duree);
      const lendemain = ajouterJours(dernierJour, 1);
      const [o] = await tx
        .insert(options_sejour)
        .values({
          gite_id: gite.id,
          date_arrivee: arrivee,
          date_depart: depart,
          client_nom: nom,
          client_email: email,
          langue,
          // Minuit, heure de Paris, au début du lendemain du dernier jour.
          expire_at: sql`(${lendemain}::date)::timestamp at time zone 'Europe/Paris'`,
        })
        .returning({ id: options_sejour.id, expire: options_sejour.expire_at });
      const nuits = nombreDeNuits(arrivee, depart);
      const ecrites = await tx.execute(sql`
        insert into disponibilites (gite_id, date, statut, source, option_id, verrou_expire_at)
        select ${gite.id}::uuid, nuit::date, 'option', 'directe', ${o.id}::uuid, ${o.expire.toISOString()}::timestamptz
          from generate_series(${arrivee}::date, ${depart}::date - 1, interval '1 day') as nuit
        on conflict (gite_id, date) do update
           set statut = 'option', source = 'directe', reservation_id = null, option_id = excluded.option_id,
               verrou_expire_at = excluded.verrou_expire_at, created_at = now()
         where disponibilites.verrou_expire_at <= now()`);
      if ((ecrites.rowCount ?? 0) !== nuits) throw new NuitsPrises();
      await inscrireOption(tx, { optionId: o.id, destinataire: email, langue });
      await journaliser(tx, {
        table: "options_sejour",
        ligne: o.id,
        action: "option_posee",
        acteur,
        details: { gite: gite.nom, arrivee, depart, client: nom, email, jusqu_au: dernierJour },
      });
      return {
        ok: true,
        message: `Option posée : ${gite.nom} ${plageLisible(arrivee, depart)}, gardée pour ${nom} jusqu'au ${dateLisible(dernierJour)} inclus. Le lien part à ${email}.`,
      };
    });
  } catch (erreur) {
    if (!(erreur instanceof NuitsPrises)) throw erreur;
    return { ok: false, message: `L'option n'est pas posée : ${await occupants(db, gite.id, arrivee, ajouterJours(depart, -1))}.` };
  }
}

export async function leverOption(id: string, acteur: Acteur, maintenant: Date = new Date()): Promise<IssueGeste> {
  if (!isUuid(id)) return { ok: false, message: "Option introuvable." };
  return getDb().transaction(async (tx) => {
    const [l] = await tx
      .select({ o: options_sejour, gite: gites.nom })
      .from(options_sejour)
      .innerJoin(gites, eq(gites.id, options_sejour.gite_id))
      .where(eq(options_sejour.id, id))
      .for("update", { of: options_sejour });
    if (!l) return { ok: false, message: "Option introuvable." };
    const etat = etatOption(l.o, maintenant);
    if (etat !== "en_cours") {
      return { ok: false, message: etat === "utilisee" ? "Le client a déjà réservé avec cette option." : "Cette option n'est plus en cours." };
    }
    await tx.update(options_sejour).set({ levee_at: maintenant }).where(eq(options_sejour.id, id));
    await tx.execute(sql`delete from disponibilites where option_id = ${id}::uuid and statut = 'option'`);
    await journaliser(tx, { table: "options_sejour", ligne: id, action: "option_levee", acteur, details: { client: l.o.client_nom } });
    return {
      ok: true,
      message: `Option de ${l.o.client_nom} levée : ${l.gite} est de nouveau libre ${plageLisible(l.o.date_arrivee, l.o.date_depart)}.`,
    };
  });
}
