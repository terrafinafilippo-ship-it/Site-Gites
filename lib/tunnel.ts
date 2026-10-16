// Le TUNNEL DE RÉSERVATION côté serveur : charger ce dont il a besoin,
// enregistrer une tentative (réservation « en attente de paiement » et dates
// bloquées), l'abandonner.
//
// CE MODULE NE DÉGRADE JAMAIS (héritage de la Phase 2, docs/phases/phase-3.md) :
// une base illisible, un gîte absent, des réglages manquants lèvent une
// erreur, et la page dit « réservation en ligne momentanément indisponible ».
// Afficher un gîte sans prix est acceptable ; laisser réserver sans prix ne
// l'est pas. Aucune valeur de repli n'est écrite ici.
//
// Le prix est TOUJOURS recalculé ici au moment du blocage, avec les données
// lues à cet instant : le navigateur ne fournit que des dates, des voyageurs
// et des coordonnées, jamais un montant.
import { randomInt } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { gites, reglages, reservations } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { occupantsMajeurs, type Coordonnees } from "@/lib/coordonnees";
import { GITE_IDS, type GiteId } from "@/lib/data/gites";
import { aujourdhuiParis, ajouterJours } from "@/lib/dates-civiles";
import {
  detailCalcul,
  devisSejour,
  preparerDevis,
  type DemandeDevis,
  type Devis,
  type DonneesDevis,
  type RefusDevis,
  type ReglagesTunnel,
} from "@/lib/devis";
import { leverBlocage, lireNuitsPrises, poserBlocage } from "@/lib/disponibilites";
import { isUniqueViolation } from "@/lib/route-helpers";
import type { Executeur } from "@/lib/reservations";
import { chargerTarification } from "@/lib/tarifs";

/** Sans période tarifaire, le calendrier s'étend tout de même sur un an. */
const HORIZON_PAR_DEFAUT_JOURS = 366;

export interface DonneesTunnel extends DonneesDevis {
  /** Jour suivant la dernière nuit tarifée (exclu) ; `null` si aucune période. */
  horizon: string | null;
}

/** Réglages du tunnel (ligne unique de `reglages`). Lève si la ligne manque. */
export async function lireReglagesTunnel(executeur: Executeur = getDb()): Promise<ReglagesTunnel> {
  const [r] = await executeur.select().from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new TunnelIndisponible("réglages généraux absents (table reglages, ligne id = 1)");
  return {
    dureeBlocageMinutes: r.duree_blocage_minutes,
    delaiReservationJours: r.delai_reservation_jours,
    heureArrivee: r.heure_arrivee.slice(0, 5),
    heureDepart: r.heure_depart.slice(0, 5),
    heureLimiteArrivee: r.heure_limite_arrivee.slice(0, 5),
    bebeAgeLimite: r.bebe_age_limite,
    bebesHorsCapacite: r.bebes_hors_capacite,
    litsBebe: r.lits_bebe,
  };
}

/**
 * Le tunnel ne peut pas s'ouvrir : base injoignable, gîte absent ou inactif,
 * réglages manquants. Distincte d'un bug : l'appelant répond 503
 * (« momentanément indisponible ») pour celle-ci, 500 pour le reste.
 */
export class TunnelIndisponible extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TunnelIndisponible";
  }
}

/** Données du tunnel, et l'identifiant interne du gîte, qui ne va pas au navigateur. */
export interface TunnelCharge {
  giteId: string;
  donnees: DonneesTunnel;
}

/**
 * Tout ce dont le tunnel a besoin pour un gîte. LÈVE TunnelIndisponible au
 * lieu de compléter.
 */
export async function chargerDonneesTunnel(slug: GiteId, executeur: Executeur = getDb()): Promise<TunnelCharge> {
  try {
    return await lireDonneesTunnel(slug, executeur);
  } catch (erreur) {
    if (erreur instanceof TunnelIndisponible) throw erreur;
    throw new TunnelIndisponible(
      `lecture des données du tunnel (${slug}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      { cause: erreur },
    );
  }
}

async function lireDonneesTunnel(slug: GiteId, executeur: Executeur): Promise<TunnelCharge> {
  const [ligne] = await executeur.select().from(gites).where(eq(gites.slug, slug));
  if (!ligne) throw new TunnelIndisponible(`gîte « ${slug} » absent en base`);
  if (!ligne.actif) throw new TunnelIndisponible(`gîte « ${slug} » inactif en base`);

  const [lue, reglagesTunnel] = await Promise.all([chargerTarification(executeur), lireReglagesTunnel(executeur)]);
  for (const anomalie of lue.anomalies) console.warn(`[tunnel] ${anomalie}`);

  const aujourdhui = aujourdhuiParis();
  const fins = lue.tarification.periodes.map((p) => p.fin).sort();
  const horizon = fins.length > 0 ? fins[fins.length - 1] : null;
  const finLecture = horizon && horizon > aujourdhui ? horizon : ajouterJours(aujourdhui, HORIZON_PAR_DEFAUT_JOURS);

  return {
    giteId: ligne.id,
    donnees: {
      tarification: lue.tarification,
      taxes: lue.taxes[slug] ?? [],
      gite: {
        slug,
        nom: ligne.nom,
        capaciteMax: ligne.capacite_max,
        forfaitMenage: centimesDepuisNumeric(ligne.forfait_menage),
        caution: centimesDepuisNumeric(ligne.caution),
      },
      reglages: reglagesTunnel,
      nuitsPrises: await lireNuitsPrises(executeur, ligne.id, aujourdhui, finLecture),
      aujourdhui,
      horizon,
    },
  };
}

// ─── Autres gîtes libres ──────────────────────────────────────────────────────

export interface Alternative {
  slug: GiteId;
  nom: string;
  total: number;
  aRegler: number;
  paiementIntegral: boolean;
}

/**
 * Les autres gîtes libres sur TOUTES les dates demandées, de capacité
 * suffisante, avec leur prix recalculé (cadrage du 13 octobre 2026). Un gîte
 * illisible est simplement omis : la proposition est un service, pas un dû.
 */
export async function autresGitesLibres(slugExclu: GiteId, demande: DemandeDevis): Promise<Alternative[]> {
  const alternatives: Alternative[] = [];
  for (const slug of GITE_IDS) {
    if (slug === slugExclu) continue;
    try {
      const { donnees } = await chargerDonneesTunnel(slug);
      const r = devisSejour(preparerDevis(donnees), demande);
      if (r.ok) {
        alternatives.push({
          slug,
          nom: donnees.gite.nom,
          total: r.devis.montants.totalTtc,
          aRegler: r.devis.aRegler,
          paiementIntegral: r.devis.paiementIntegral,
        });
      }
    } catch (erreur) {
      console.warn(`[tunnel] autre gîte « ${slug} » non proposé :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return alternatives;
}

// ─── Tentative de réservation ────────────────────────────────────────────────

/** Sans 0, O, 1, I ni L : une référence se dicte au téléphone. */
const ALPHABET_REFERENCE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ESSAIS_REFERENCE = 5;

/** « SAM-2026-7K4QX » : année d'arrivée et cinq signes tirés au hasard. Elle n'ouvre rien. */
function nouvelleReference(arrivee: string): string {
  let suffixe = "";
  for (let i = 0; i < 5; i += 1) suffixe += ALPHABET_REFERENCE[randomInt(ALPHABET_REFERENCE.length)];
  return `SAM-${arrivee.slice(0, 4)}-${suffixe}`;
}

export type ResultatTentative =
  | {
      ok: true;
      id: string;
      reference: string;
      expireA: Date;
      devis: Devis;
      dureeBlocageMinutes: number;
      /** Le total recalculé diffère de celui que le client avait sous les yeux. */
      prixModifie: boolean;
    }
  | { ok: false; raison: "REFUS"; refus: RefusDevis }
  | { ok: false; raison: "DATES_PRISES"; nuitsPrises: string[]; alternatives: Alternative[] };

class DatesPrises extends Error {
  constructor(readonly nuitsPrises: string[]) {
    super("dates prises");
  }
}

/**
 * Enregistre la réservation « en attente de paiement » et bloque ses nuits,
 * dans UNE transaction : soit les deux, soit rien.
 */
export async function enregistrerTentative(
  slug: GiteId,
  demande: DemandeDevis,
  coordonnees: Coordonnees,
  totalAttendu: number | null,
): Promise<ResultatTentative> {
  const db = getDb();
  const { giteId, donnees } = await chargerDonneesTunnel(slug, db);
  const resultat = devisSejour(preparerDevis(donnees), demande);
  if (!resultat.ok) {
    if (resultat.refus.donneeManquante) {
      console.warn(`[tunnel] DONNÉE MANQUANTE pour « ${slug} » : ${resultat.refus.detail}`);
    }
    if (resultat.refus.motif === "NUITS_PRISES") {
      return {
        ok: false,
        raison: "DATES_PRISES",
        nuitsPrises: [],
        alternatives: await autresGitesLibres(slug, demande),
      };
    }
    return { ok: false, raison: "REFUS", refus: resultat.refus };
  }
  const devis = resultat.devis;
  const { locataire, colocataire } = coordonnees;
  const r = donnees.reglages;

  for (let essai = 1; ; essai += 1) {
    const reference = nouvelleReference(demande.arrivee);
    try {
      const enregistree = await db.transaction(async (tx) => {
        const [resa] = await tx
          .insert(reservations)
          .values({
            gite_id: giteId,
            reference,
            statut: "en_attente_paiement",
            client_civilite: locataire.civilite || null,
            client_prenom: locataire.prenom,
            client_nom: locataire.nom,
            client_adresse: coordonnees.adresse,
            client_code_postal: coordonnees.codePostal,
            client_ville: coordonnees.ville,
            client_pays: coordonnees.pays,
            client_email: coordonnees.email,
            client_telephone: coordonnees.telephone,
            client_civilite_conjoint: colocataire ? colocataire.civilite || null : null,
            client_prenom_conjoint: colocataire?.prenom ?? null,
            client_nom_conjoint: colocataire?.nom ?? null,
            date_arrivee: devis.arrivee,
            date_depart: devis.depart,
            heure_arrivee: r.heureArrivee,
            heure_depart: r.heureDepart,
            heure_limite_arrivee: r.heureLimiteArrivee,
            nb_adultes: devis.occupants.adultes,
            nb_enfants: devis.occupants.enfants,
            nb_bebes: devis.occupants.bebes,
            occupants_majeurs: occupantsMajeurs(coordonnees),
            prix_location: numericDepuisCentimes(devis.prix.total),
            forfait_menage: numericDepuisCentimes(devis.montants.forfaitMenage),
            options: numericDepuisCentimes(0),
            taxe_sejour: numericDepuisCentimes(devis.taxe.total),
            // La taxe n'est plus un taux unique (D-18) : son détail est dans
            // detail_calcul. Les PDF qui impriment ce taux sont à corriger
            // avant que le contrat ne soit généré depuis le tunnel (lot 4).
            taux_taxe_sejour: null,
            detail_calcul: detailCalcul(devis, r),
          })
          .returning({ id: reservations.id });

        const blocage = await poserBlocage(tx, {
          giteId,
          reservationId: resa.id,
          arrivee: devis.arrivee,
          depart: devis.depart,
          minutes: r.dureeBlocageMinutes,
        });
        if (!blocage.ok) throw new DatesPrises(blocage.nuitsPrises);
        return { id: resa.id, expireA: blocage.expireA };
      });

      return {
        ok: true,
        id: enregistree.id,
        reference,
        expireA: enregistree.expireA,
        devis,
        dureeBlocageMinutes: r.dureeBlocageMinutes,
        prixModifie: totalAttendu !== null && totalAttendu !== devis.montants.totalTtc,
      };
    } catch (erreur) {
      if (erreur instanceof DatesPrises) {
        return {
          ok: false,
          raison: "DATES_PRISES",
          nuitsPrises: erreur.nuitsPrises,
          alternatives: await autresGitesLibres(slug, demande),
        };
      }
      // Référence déjà tirée (une chance sur des millions) : on en tire une autre.
      if (isUniqueViolation(erreur) && essai < ESSAIS_REFERENCE) continue;
      throw erreur;
    }
  }
}

export type ResultatAbandon = "ABANDONNEE" | "ABSENTE" | "ENGAGEE";

/**
 * Abandon d'une tentative (le client revient en arrière depuis le paiement) :
 * le blocage est levé et la réservation SUPPRIMÉE, avec les coordonnées du
 * client — rien n'a été payé ni émis, et garder ces données n'aurait aucune
 * raison. Une réservation engagée (payée, contrat émis, autre statut) est
 * refusée : elle ne se supprime jamais.
 */
export async function abandonnerTentative(reservationId: string): Promise<ResultatAbandon> {
  return getDb().transaction(async (tx) => {
    const [resa] = await tx
      .select({ statut: reservations.statut, paye: reservations.date_paiement_acompte, contrat: reservations.numero_contrat })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .for("update");
    if (!resa) return "ABSENTE";
    if (resa.statut !== "en_attente_paiement" || resa.paye !== null || resa.contrat !== null) return "ENGAGEE";

    await leverBlocage(tx, reservationId);
    await tx
      .delete(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.statut, "en_attente_paiement"),
          isNull(reservations.date_paiement_acompte),
        ),
      );
    return "ABANDONNEE";
  });
}

/** Contrôle de cohérence pour les tests : nuits bloquées par une réservation. */
export async function nuitsBloquees(reservationId: string, executeur: Executeur = getDb()): Promise<number> {
  const r = await executeur.execute<{ n: number }>(sql`
    select count(*)::int as n from disponibilites
     where reservation_id = ${reservationId}::uuid and statut = 'verrou' and verrou_expire_at > now()`);
  return r.rows[0]?.n ?? 0;
}
