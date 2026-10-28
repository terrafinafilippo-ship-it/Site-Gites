// PAGE « MA RÉSERVATION » PAR LIEN SECRET (Phase 3, lot 4, étape 3, D-25).
//
// Le client n'a ni compte ni mot de passe : le jeton secret de sa réservation
// (reservations.jeton_suivi, 64 caractères tirés par la base) ouvre sa page,
// /suivi/{jeton}, jusqu'à la date de départ + `reglages.suivi_validite_jours`
// (30 jours, choix du gérant du 28 octobre 2026). Le réglage est lu à chaque
// affichage : le changer vaut aussi pour les réservations déjà faites.
//
// La page ne s'ouvre que pour une réservation dont le client a PAYÉ quelque
// chose : confirmée (les faits, le contrat, l'arrivée), ou remboursée (« n'a
// pas pu être confirmée »). Tout le reste — jeton inconnu, réservation jamais
// payée, lien expiré — donne la même réponse : « lien non valable ou expiré »,
// avec le formulaire « Retrouver ma réservation ». Un curieux n'apprend rien.
//
// Le formulaire (demanderLien) envoie le lien de chaque réservation encore
// ouverte de l'adresse saisie, un courriel par réservation, dans sa langue. Il
// répond toujours la même phrase, que l'adresse ait réservé ou non. Au plus
// `suivi_demandes_max` demandes par adresse et par `suivi_demandes_minutes`,
// comptées dans le journal des courriels : une adresse inconnue n'écrit rien.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { courriels, documents, paiements, reglages, reservations } from "@/db/schema";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { inscrireLienSuivi } from "@/lib/courriels";
import { ajouterJours, aujourdhuiParis } from "@/lib/dates-civiles";
import { lien, type Langue } from "@/lib/i18n/langues";
import { chargerReservationAvecGite, type Executeur, type ReservationAvecGite } from "@/lib/reservations";
import { cheminContratSigne } from "@/lib/storage";

/** Forme d'un jeton émis par la base (deux UUID sans tirets). */
export const FORME_JETON = /^[0-9a-f]{64}$/;

/** Forme acceptée d'une adresse saisie dans le formulaire (le reste est refusé avant toute lecture). */
export const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Paiements de la réservation elle-même (pas le solde ni la caution, Phase 4). */
const TYPES_PAIEMENT_RESERVATION = ["acompte", "total"] as const;
/** Le client a payé : la page lui est due, confirmée ou remboursée. */
const STATUTS_PAYE = ["reussi", "a_rembourser", "rembourse"] as const;

export function cheminSuivi(langue: Langue, jeton: string): string {
  return lien(langue, `/suivi/${jeton}`);
}

export function lienSuivi(origine: string, langue: Langue, jeton: string): string {
  return `${origine.replace(/\/$/, "")}${cheminSuivi(langue, jeton)}`;
}

/** Dernier jour où le lien ouvre la page : départ + `jours`. */
export function finValidite(depart: string, jours: number): string {
  return ajouterJours(depart, jours);
}

export function lienOuvert(depart: string, jours: number, aujourdhui: string = aujourdhuiParis()): boolean {
  return aujourdhui <= finValidite(depart, jours);
}

interface ReglagesSuivi {
  validite: number;
  demandesMax: number;
  demandesMinutes: number;
  contact: string;
}

async function lireReglages(ex: Executeur): Promise<ReglagesSuivi> {
  const [r] = await ex
    .select({
      validite: reglages.suivi_validite_jours,
      demandesMax: reglages.suivi_demandes_max,
      demandesMinutes: reglages.suivi_demandes_minutes,
      contact: reglages.courriel_reponse,
    })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r;
}

// ─── La page ─────────────────────────────────────────────────────────────────

export type ContratSuivi =
  /** Pas encore créé, ou séjour payé en totalité (contrat envoyé à la main, D-20). */
  | { etat: "a_venir" }
  /** `jeton` : celui du lien de signature, null s'il a expiré. */
  | { etat: "a_signer"; numero: string; jeton: string | null }
  | { etat: "signe"; numero: string; date: Date | null; chemin: string };

export type Suivi =
  | { etat: "invalide" }
  | { etat: "rembourse"; resa: ReservationAvecGite; montant: number; fait: boolean; contact: string }
  | {
      etat: "ouvert";
      resa: ReservationAvecGite;
      paiement: { montant: number; datePaiement: Date | null };
      contrat: ContratSuivi;
      finValidite: string;
      contact: string;
    };

const INVALIDE: Suivi = { etat: "invalide" };

async function contratDe(ex: Executeur, resa: ReservationAvecGite, maintenant: Date): Promise<ContratSuivi> {
  if (resa.paiement_integral) return { etat: "a_venir" };
  const [doc] = await ex
    .select({
      numero: documents.numero,
      statut: documents.statut,
      token: documents.token,
      expire: documents.token_expire_at,
      date: documents.date_signature,
    })
    .from(documents)
    .where(and(eq(documents.reservation_id, resa.id), eq(documents.type, "contrat_location")))
    .limit(1);
  if (!doc) return { etat: "a_venir" };
  if (doc.statut === "signe") {
    return { etat: "signe", numero: doc.numero, date: doc.date, chemin: cheminContratSigne(resa.id, doc.numero) };
  }
  const valide = doc.token !== null && (doc.expire === null || doc.expire.getTime() > maintenant.getTime());
  return { etat: "a_signer", numero: doc.numero, jeton: valide ? doc.token : null };
}

/** Ce que montre la page /suivi/{jeton}. */
export async function chargerSuivi(
  jeton: string,
  ex: Executeur = getDb(),
  maintenant: Date = new Date(),
): Promise<Suivi> {
  if (!FORME_JETON.test(jeton)) return INVALIDE;
  const [ligne] = await ex
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.jeton_suivi, jeton))
    .limit(1);
  if (!ligne) return INVALIDE;
  const resa = await chargerReservationAvecGite(ligne.id, ex);
  if (!resa) return INVALIDE;

  const r = await lireReglages(ex);
  const fin = finValidite(resa.date_depart, r.validite);
  if (aujourdhuiParis(maintenant) > fin) return INVALIDE;

  const payes = await ex
    .select({ montant: paiements.montant, statut: paiements.statut, date: paiements.date_paiement })
    .from(paiements)
    .where(
      and(
        eq(paiements.reservation_id, resa.id),
        inArray(paiements.type, [...TYPES_PAIEMENT_RESERVATION]),
        inArray(paiements.statut, [...STATUTS_PAYE]),
      ),
    )
    .orderBy(desc(paiements.created_at));

  const recu = payes.find((p) => p.statut === "reussi");
  if (recu && (resa.statut === "confirmee" || resa.statut === "terminee")) {
    return {
      etat: "ouvert",
      resa,
      paiement: { montant: centimesDepuisNumeric(recu.montant), datePaiement: recu.date },
      contrat: await contratDe(ex, resa, maintenant),
      finValidite: fin,
      contact: r.contact,
    };
  }
  const rembourse = payes.find((p) => p.statut === "rembourse" || p.statut === "a_rembourser");
  if (rembourse) {
    return {
      etat: "rembourse",
      resa,
      montant: centimesDepuisNumeric(rembourse.montant),
      fait: rembourse.statut === "rembourse",
      contact: r.contact,
    };
  }
  return INVALIDE;
}

// ─── Le formulaire « Retrouver ma réservation » ──────────────────────────────

export interface ResultatDemande {
  /** Courriels inscrits (0 : adresse inconnue, aucune réservation ouverte, ou limite atteinte). */
  inscrits: number;
  limite: boolean;
}

/**
 * Inscrit, pour chaque réservation encore ouverte de `email`, un courriel
 * portant son lien. Le résultat ne sert qu'aux contrôles : la route répond
 * la même chose dans tous les cas.
 */
export async function demanderLien(email: string, maintenant: Date = new Date()): Promise<ResultatDemande> {
  const adresse = email.trim().toLowerCase();
  if (!FORME_EMAIL.test(adresse) || adresse.length > 254) return { inscrits: 0, limite: false };

  return getDb().transaction(async (tx) => {
    // Deux demandes simultanées pour la même adresse passent l'une après l'autre (limite exacte).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`suivi:${adresse}`}))`);
    const r = await lireReglages(tx);

    const [{ demandes }] = await tx
      .select({ demandes: sql<number>`count(distinct ${courriels.donnees}->>'demande')::int` })
      .from(courriels)
      .where(
        and(
          eq(courriels.objet, "lien_suivi"),
          sql`lower(${courriels.destinataire}) = ${adresse}`,
          sql`${courriels.created_at} > now() - make_interval(mins => ${r.demandesMinutes}::int)`,
        ),
      );
    if (demandes >= r.demandesMax) return { inscrits: 0, limite: true };

    const candidates = await tx
      .select({
        id: reservations.id,
        email: reservations.client_email,
        langue: reservations.langue,
        depart: reservations.date_depart,
      })
      .from(reservations)
      .where(
        and(
          sql`lower(${reservations.client_email}) = ${adresse}`,
          sql`exists (select 1 from ${paiements} where ${paiements.reservation_id} = ${reservations.id}
                and ${paiements.type} in ('acompte', 'total')
                and ${paiements.statut} in ('reussi', 'a_rembourser', 'rembourse'))`,
        ),
      )
      .orderBy(reservations.date_arrivee);

    const aujourdhui = aujourdhuiParis(maintenant);
    const ouvertes = candidates.filter((c) => c.email && lienOuvert(c.depart, r.validite, aujourdhui));
    const demande = randomUUID();
    for (const c of ouvertes) {
      await inscrireLienSuivi(tx, {
        reservationId: c.id,
        destinataire: c.email!,
        langue: c.langue === "en" ? "en" : "fr",
        demande,
      });
    }
    return { inscrits: ouvertes.length, limite: false };
  });
}
