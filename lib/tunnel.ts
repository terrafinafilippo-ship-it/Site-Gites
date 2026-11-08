// Le TUNNEL DE RÉSERVATION côté serveur : charger ce dont il a besoin,
// enregistrer une tentative (réservation « en attente de paiement » et dates
// bloquées, avec le règlement choisi par le client), l'abandonner. Le
// paiement lui-même est dans lib/paiement.ts.
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
//
// OPTION posée au téléphone (Phase 5, lot 4) : le client arrive avec le jeton
// de son lien. Pour lui, les nuits de l'option sont libres ; ses dates sont
// celles de l'option, à l'identique. Ses nuits ne sont pas verrouillées
// pendant le paiement : l'option les garde déjà (lib/disponibilites.ts).
import { randomInt } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { audit_logs, gites, options_sejour, paiements, reglages, reservations } from "@/db/schema";
import { centimesDepuisNumeric, numericDepuisCentimes } from "@/lib/centimes";
import { occupantsMajeurs, type Coordonnees } from "@/lib/coordonnees";
import { GITE_IDS, type GiteId } from "@/lib/data/gites";
import { aujourdhuiParis, ajouterJours } from "@/lib/dates-civiles";
import {
  detailCalcul,
  devisSejour,
  devisToutRegler,
  preparerDevis,
  type DemandeDevis,
  type Devis,
  type DonneesDevis,
  type RefusDevis,
  type ReglagesTunnel,
} from "@/lib/devis";
import { leverBlocage, lireNuitsPrises, poserBlocage } from "@/lib/disponibilites";
import { LANGUES, type Langue } from "@/lib/i18n/langues";
import { lireOptionParJeton, type OptionLue } from "@/lib/options-sejour";
import { annulerPaiementsOuverts, lireTexteAccord } from "@/lib/paiement";
import {
  carteEnregistree,
  modeSoldeEnBase,
  texteAccordCarte,
  toutReglerChoisi,
  validerChoix,
  type ChoixReglement,
} from "@/lib/reglement";
import { isUniqueViolation, messageErreur } from "@/lib/route-helpers";
import type { Executeur } from "@/lib/reservations";
import { prestataire, type Prestataire } from "@/lib/stripe";
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
    tauxAcompte: r.taux_acompte,
    delaiSoldeJours: r.delai_solde_jours,
    delaiVirementCautionJours: r.delai_virement_caution_jours,
    delaiRemboursementSoldeHeures: r.delai_remboursement_solde_heures,
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
 * lieu de compléter. Avec `optionId`, les nuits de cette option sont libres
 * (son client, arrivé par son lien).
 */
export async function chargerDonneesTunnel(
  slug: GiteId,
  executeur: Executeur = getDb(),
  optionId: string | null = null,
): Promise<TunnelCharge> {
  try {
    return await lireDonneesTunnel(slug, executeur, optionId);
  } catch (erreur) {
    if (erreur instanceof TunnelIndisponible) throw erreur;
    throw new TunnelIndisponible(
      `lecture des données du tunnel (${slug}) : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      { cause: erreur },
    );
  }
}

async function lireDonneesTunnel(slug: GiteId, executeur: Executeur, optionId: string | null): Promise<TunnelCharge> {
  const [ligne] = await executeur.select().from(gites).where(eq(gites.slug, slug));
  if (!ligne) throw new TunnelIndisponible(`gîte « ${slug} » absent en base`);
  if (!ligne.actif) throw new TunnelIndisponible(`gîte « ${slug} » inactif en base`);

  const [lue, reglagesTunnel] = await Promise.all([chargerTarification(executeur), lireReglagesTunnel(executeur)]);
  for (const anomalie of lue.anomalies) console.warn(`[tunnel] ${anomalie}`);

  const aujourdhui = aujourdhuiParis();
  // Sans texte d'accord pour l'enregistrement de la carte, dans chaque langue
  // du site, le tunnel ne s'ouvre pas : la caution par carte serait proposée
  // sans que le client puisse lire ce qu'il accepte (docs/phases/phase-3.md).
  for (const langue of LANGUES) {
    if (!(await lireTexteAccord(executeur, langue, aujourdhui))) {
      throw new TunnelIndisponible(`texte d'accord pour la carte absent en base (langue ${langue}, table textes_accord)`);
    }
  }
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
      nuitsPrises: await lireNuitsPrises(executeur, ligne.id, aujourdhui, finLecture, optionId),
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
      choix: ChoixReglement;
      /** Texte d'accord affiché sous la carte (caution par carte), sinon `null`. */
      accordCarte: string | null;
      client: { email: string; nom: string };
    }
  | { ok: false; raison: "REFUS"; refus: RefusDevis }
  | { ok: false; raison: "REGLEMENT"; message: string }
  | { ok: false; raison: "OPTION"; message: string }
  | { ok: false; raison: "DATES_PRISES"; nuitsPrises: string[]; alternatives: Alternative[] };

class DatesPrises extends Error {
  constructor(readonly nuitsPrises: string[]) {
    super("dates prises");
  }
}

class OptionPerdue extends Error {
  constructor() {
    super("option plus en cours");
  }
}

/** Le lien d'une option qui ne garde plus ses dates (échue, levée, déjà utilisée), ou d'autres dates. */
export const OPTION_INVALIDE: Record<Langue, string> = {
  fr: "Ce lien d'option n'est plus valable : l'option a pris fin ou a déjà servi. Vous pouvez choisir d'autres dates, ou nous appeler.",
  en: "This option link is no longer valid: the option has ended or has already been used. You can choose other dates, or call us.",
};

/**
 * L'option d'un lien, si elle garde encore exactement ces dates de ce gîte ;
 * sinon `null`.
 */
export async function optionValable(
  jeton: string,
  slug: GiteId,
  dates: { arrivee: string; depart: string },
  executeur: Executeur = getDb(),
): Promise<OptionLue | null> {
  const o = await lireOptionParJeton(jeton, executeur);
  if (!o || o.etat !== "en_cours" || o.slug !== slug) return null;
  return o.arrivee === dates.arrivee && o.depart === dates.depart ? o : null;
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
  /** Caution et solde choisis par le client, tels que reçus (contrôlés ici, sur le devis du serveur). */
  reglementBrut: unknown,
  /** Langue du client : messages de refus, texte d'accord, courriels (lot 4). */
  langue: Langue = "fr",
  /** Jeton du lien d'une option posée au téléphone (Phase 5, lot 4), tel que reçu. */
  jetonOption: string | null = null,
): Promise<ResultatTentative> {
  const db = getDb();
  let option: OptionLue | null = null;
  if (jetonOption) {
    option = await optionValable(jetonOption, slug, demande, db);
    if (!option) return { ok: false, raison: "OPTION", message: OPTION_INVALIDE[langue] };
  }
  const { giteId, donnees } = await chargerDonneesTunnel(slug, db, option?.id ?? null);
  const resultat = devisSejour(preparerDevis(donnees, langue), demande);
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
  const { locataire, colocataire } = coordonnees;
  const r = donnees.reglages;

  const reglement = validerChoix(reglementBrut, resultat.devis.paiementIntegral, langue, resultat.devis.virementPossible);
  if (!reglement.ok) {
    console.warn(`[tunnel] règlement refusé (${slug}) : ${reglement.detail}`);
    return { ok: false, raison: "REGLEMENT", message: reglement.message };
  }
  const choix = reglement.choix;
  // Tout régler maintenant (D-27) : le total à payer, plus de solde.
  const devis = toutReglerChoisi(choix) ? devisToutRegler(resultat.devis) : resultat.devis;
  let accord: { id: string; texte: string } | null = null;
  if (carteEnregistree(choix)) {
    const modele = await lireTexteAccord(db, langue, donnees.aujourdhui);
    if (!modele) throw new TunnelIndisponible(`texte d'accord pour la carte absent en base (langue ${langue})`);
    accord = {
      id: modele.id,
      texte: texteAccordCarte(modele, {
        caution: devis.caution,
        prelevement:
          choix.modeSolde === "prelevement" && devis.dateLimiteSolde
            ? { montant: devis.montants.solde, date: devis.dateLimiteSolde }
            : null,
      }),
    };
  }

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
            // Figée : le contrat l'imprime et la carte la bloque, même si le gîte change de caution.
            caution: numericDepuisCentimes(devis.caution),
            // La taxe n'est plus un taux unique (D-18) : son détail est dans
            // detail_calcul. Les PDF qui impriment ce taux sont à corriger
            // avant que le contrat ne soit généré depuis le tunnel (lot 4).
            taux_taxe_sejour: null,
            detail_calcul: detailCalcul(devis, r),
            // Conditions figées : un réglage modifié demain ne change pas ce contrat.
            taux_acompte: devis.tauxAcompte,
            delai_solde_jours: devis.delaiSoldeJours,
            delai_remboursement_solde_heures: r.delaiRemboursementSoldeHeures,
            delai_virement_caution_jours: r.delaiVirementCautionJours,
            paiement_integral: devis.paiementIntegral,
            moyen_caution: choix.moyenCaution,
            mode_solde: modeSoldeEnBase(choix),
            langue,
            accord_carte_id: accord?.id ?? null,
            accord_carte_texte: accord?.texte ?? null,
            option_id: option?.id ?? null,
          })
          .returning({ id: reservations.id });

        if (option) {
          // L'option garde déjà les nuits : on vérifie, sous verrou, qu'elle
          // les garde encore (ni levée, ni échue, ni utilisée entre-temps).
          const [o] = await tx
            .select({ levee: options_sejour.levee_at, utilisee: options_sejour.utilisee_at, expire: options_sejour.expire_at })
            .from(options_sejour)
            .where(eq(options_sejour.id, option.id))
            .for("update");
          if (!o || o.levee || o.utilisee || o.expire.getTime() <= Date.now()) throw new OptionPerdue();
          return { id: resa.id, expireA: new Date(Date.now() + r.dureeBlocageMinutes * 60_000) };
        }

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
        choix,
        accordCarte: accord?.texte ?? null,
        client: { email: coordonnees.email, nom: `${locataire.prenom} ${locataire.nom}` },
      };
    } catch (erreur) {
      if (erreur instanceof OptionPerdue) return { ok: false, raison: "OPTION", message: OPTION_INVALIDE[langue] };
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
 * Abandon d'une tentative : son paiement encore ouvert est ANNULÉ chez le
 * prestataire, puis le blocage est levé et la réservation SUPPRIMÉE, avec les
 * coordonnées du client — rien n'a été payé ni émis, et garder ces données
 * n'aurait aucune raison. Une réservation engagée (payée ou en cours de
 * paiement, contrat émis, autre statut) est refusée : elle ne se supprime
 * jamais.
 *
 * Deux appelants : le client qui revient en arrière depuis le paiement, et
 * l'effacement automatique des tentatives abandonnées (lib/abandons.ts, qui
 * passe `trace` : une ligne `audit_logs`, référence et dates seulement, est
 * écrite dans la même transaction que l'effacement).
 *
 * Phase 4, lot 3 (D-31) : la fiche client créée chez le prestataire pour une
 * caution par carte (nom, courriel) est supprimée elle aussi, APRÈS
 * l'effacement — jamais avant : un paiement constaté entre-temps rendrait la
 * réservation engagée, et sa carte est rattachée à cette fiche. Si cette
 * suppression échoue, l'abandon reste fait : l'échec est journalisé (et,
 * avec `trace`, l'identifiant de la fiche est dans la ligne `audit_logs`).
 */
export async function abandonnerTentative(
  reservationId: string,
  options: { p?: Prestataire; trace?: { acteur: string; motif: string } } = {},
): Promise<ResultatAbandon> {
  const p = options.p ?? prestataire();
  // Hors transaction : un appel au prestataire ne doit pas tenir un verrou de base.
  if (!(await annulerPaiementsOuverts(getDb(), reservationId, p))) return "ENGAGEE";
  const issue = await getDb().transaction(async (tx) => {
    const [resa] = await tx
      .select({
        statut: reservations.statut,
        paye: reservations.date_paiement_acompte,
        contrat: reservations.numero_contrat,
        reference: reservations.reference,
        creee: reservations.created_at,
        client: reservations.stripe_customer_id,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .for("update");
    if (!resa) return { resultat: "ABSENTE" as const, client: null };
    if (resa.statut !== "en_attente_paiement" || resa.paye !== null || resa.contrat !== null) {
      return { resultat: "ENGAGEE" as const, client: null };
    }

    // Un paiement constaté entre l'annulation et ce verrou : la réservation est engagée.
    const payes = await tx
      .select({ id: paiements.id })
      .from(paiements)
      .where(
        and(
          eq(paiements.reservation_id, reservationId),
          inArray(paiements.statut, ["reussi", "a_rembourser", "rembourse"]),
        ),
      );
    if (payes.length > 0) return { resultat: "ENGAGEE" as const, client: null };
    await tx.delete(paiements).where(eq(paiements.reservation_id, reservationId));
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
    if (options.trace) {
      await tx.insert(audit_logs).values({
        table_cible: "reservations",
        ligne_id: reservationId,
        action: "effacement_tentative",
        acteur: options.trace.acteur,
        details: {
          reference: resa.reference,
          creee_le: resa.creee.toISOString(),
          motif: options.trace.motif,
          client_stripe: resa.client,
        },
      });
    }
    return { resultat: "ABANDONNEE" as const, client: resa.client };
  });

  if (issue.client) {
    try {
      await p.oublierClient(issue.client);
    } catch (erreur) {
      console.error(`[tunnel] fiche client ${issue.client} non supprimée chez le prestataire : ${messageErreur(erreur)}`);
    }
  }
  return issue.resultat;
}

/** Contrôle de cohérence pour les tests : nuits bloquées par une réservation. */
export async function nuitsBloquees(reservationId: string, executeur: Executeur = getDb()): Promise<number> {
  const r = await executeur.execute<{ n: number }>(sql`
    select count(*)::int as n from disponibilites
     where reservation_id = ${reservationId}::uuid and statut = 'verrou' and verrou_expire_at > now()`);
  return r.rows[0]?.n ?? 0;
}
