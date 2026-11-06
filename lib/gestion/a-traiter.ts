// LA LISTE « À TRAITER » de l'accueil du back-office (Phase 5, lot 2, réponse
// 9 du cadrage du 6 novembre 2026) : TOUT ce qui demande un geste maintenant,
// quelle que soit la date du séjour. Une ligne apparaît le jour où il faut
// agir et disparaît quand c'est fait ; ce qui n'est pas encore dû n'y figure
// pas (une facture de solde payable dans deux mois, par exemple).
//
// Deux sources :
//   - L'ÉTAT DES RÉSERVATIONS, relu à chaque affichage : la ligne disparaît
//     d'elle-même quand le site constate que c'est fait (caution libérée,
//     solde payé, contrat signé…) ;
//   - LES ALERTES « À TRAITER » que le site ne peut pas clore lui-même
//     (paiement à vérifier dans Stripe, contestation, facture non émise,
//     courriel au client non parti…) : la ligne reste jusqu'au bouton
//     « C'est fait » (réponse c), noté dans `a_traiter_faits` et au journal.
//     Elles sont lues dans le journal des courriels : une alerte « problème »
//     coupée dans les réglages n'y laisse aucune trace, et n'apparaît donc pas.
//
// Les jours (veille, levée à 3 jours) sont ceux du contrat (lib/caution.ts) ;
// le délai du contrat non signé est un réglage (`contrat_non_signe_jours`, 3).
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { a_traiter_faits, courriels, documents, gites, paiements, reglages, reservations } from "@/db/schema";
import { jourLevee, lireReglagesCaution } from "@/lib/caution";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { OBJETS_CLIENT } from "@/lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis, jourUtc } from "@/lib/dates-civiles";
import { fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { chargerReservationAvecGite, type Executeur } from "@/lib/reservations";
import { dateLimiteSolde, lireEtatSolde } from "@/lib/solde";
import { dateLimiteVirement } from "@/lib/virement";

import { journaliser, type Acteur } from "./journal";

/** Les gestes qu'une ligne propose (la fiche de la réservation porte les formulaires). */
export type GesteTache = "fiche" | "reglages" | "renvoyer_contrat" | "c_est_fait";

export interface Tache {
  /** Identifiant stable de la ligne (et clé de « C'est fait »). */
  cle: string;
  titre: string;
  detail: string;
  /** Jour (aaaa-mm-jj) depuis lequel il faut agir : la liste est triée dessus. */
  depuis: string;
  reservationId: string | null;
  reference: string | null;
  client: string | null;
  gite: string | null;
  gestes: GesteTache[];
}

/** Alertes « À TRAITER » que l'état des réservations ne couvre pas (les autres ont leur ligne propre). */
const GENRES_MANUELS: Record<string, string> = {
  remboursement: "Paiement remboursé : appeler le client",
  contrat_non_cree: "Contrat non créé",
  facture_non_emise: "Facture non émise",
  solde_a_verifier: "Prélèvement du solde à vérifier dans Stripe",
  caution_a_verifier: "Caution à vérifier dans Stripe",
  caution_montant_absent: "Caution sans montant",
  contestation: "Paiement contesté auprès de la banque",
};

function nomClient(r: { client_prenom: string | null; client_nom: string | null }): string {
  return [r.client_prenom, (r.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client";
}

function joursEntre(debut: string, fin: string): number {
  return Math.round((jourUtc(fin) - jourUtc(debut)) / 86_400_000);
}

export async function listerATraiter(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<Tache[]> {
  const aujourdhui = aujourdhuiParis(maintenant);
  const [regl] = await ex
    .select({ contratJours: reglages.contrat_non_signe_jours, iban: reglages.virement_iban })
    .from(reglages)
    .where(eq(reglages.id, 1));
  if (!regl) throw new Error("ligne de réglages absente");
  const heures = await lireReglagesCaution(ex);
  const faits = new Set((await ex.select({ cle: a_traiter_faits.cle }).from(a_traiter_faits)).map((f) => f.cle));
  const taches: Tache[] = [];

  // Les séjours encore vivants : à venir, en cours, ou finis depuis peu (caution, solde impayé).
  const resas = await ex
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        inArray(reservations.statut, ["confirmee", "terminee"]),
        gte(reservations.date_depart, ajouterJours(aujourdhui, -90)),
      ),
    );
  let compteManquant = false;

  for (const { id } of resas) {
    const resa = await chargerReservationAvecGite(id, ex);
    if (!resa) continue;
    const base = { reservationId: resa.id, reference: resa.reference, client: nomClient(resa), gite: resa.gites?.nom ?? null };
    const confirmee = resa.statut === "confirmee";
    const caution = resa.caution ?? 0;
    const levee = jourLevee(resa.date_depart);

    // 1. Caution par carte.
    const [ligne] = await ex
      .select()
      .from(paiements)
      .where(and(eq(paiements.reservation_id, resa.id), eq(paiements.type, "caution")));
    if (ligne?.statut === "bloque" && aujourdhui >= resa.date_depart) {
      taches.push({
        ...base,
        cle: `caution_a_decider:${resa.id}`,
        titre: "Caution à décider",
        detail:
          `${fmtEuro(centimesDepuisNumeric(ligne.montant))} bloqués sur la carte : la libérer, ou en retenir une partie. ` +
          `Sans geste, elle est libérée automatiquement le ${fmtDateLongue(levee)} à ${fmtHeure(heures.liberation)}.`,
        depuis: resa.date_depart,
        gestes: ["fiche"],
      });
    }
    if (ligne && (ligne.statut === "echoue" || (ligne.statut === "en_attente" && ligne.reference_externe)) && aujourdhui < levee) {
      taches.push({
        ...base,
        cle: `caution_refusee:${resa.id}`,
        titre: "Caution refusée par la banque",
        detail: "Le client a reçu le lien pour la valider. S'il ne le fait pas, demandez-lui un autre moyen avant son départ.",
        depuis: aujourdhuiParis(ligne.updated_at),
        gestes: ["fiche"],
      });
    }

    // 2. Caution par chèque ou virement.
    const parAutreMoyen = resa.moyen_caution === "cheque" || resa.moyen_caution === "virement";
    if (parAutreMoyen && caution > 0 && confirmee && !resa.caution_recue_at && !resa.stripe_payment_method_id) {
      const limite = resa.moyen_caution === "virement" ? dateLimiteVirement(resa) : null;
      const aPartir = limite ? ajouterJours(limite, 1) : resa.date_arrivee;
      if (aujourdhui >= aPartir && aujourdhui <= resa.date_depart) {
        taches.push({
          ...base,
          cle: `caution_pas_recue:${resa.id}`,
          titre: resa.moyen_caution === "virement" ? "Virement de caution pas reçu" : "Chèque de caution pas noté reçu",
          detail:
            (limite
              ? `${fmtEuro(caution)} attendus au plus tard le ${fmtDateLongue(limite)}. `
              : `${fmtEuro(caution)} à remettre à l'arrivée, le ${fmtDateLongue(resa.date_arrivee)}. `) +
            "Notez-la reçue, ou envoyez au client le lien pour enregistrer une carte (article 6.6).",
          depuis: aPartir,
          gestes: ["fiche"],
        });
      }
      if (resa.moyen_caution === "virement" && !regl.iban && aujourdhui <= (limite ?? resa.date_arrivee)) compteManquant = true;
    }
    if (parAutreMoyen && resa.caution_recue_at && !resa.caution_rendue_at && aujourdhui >= resa.date_depart) {
      taches.push({
        ...base,
        cle: `caution_a_rendre:${resa.id}`,
        titre: "Caution à rendre",
        detail:
          `${fmtEuro(caution)} reçus par ${resa.moyen_caution === "virement" ? "virement" : "chèque"} : la rendre entière, ` +
          `ou en retenir une partie (article 6.5 : au plus tard le ${fmtDateLongue(levee)}).`,
        depuis: resa.date_depart,
        gestes: ["fiche"],
      });
    }

    // 3. Solde impayé après sa date limite (même si l'arrivée est loin).
    if (confirmee) {
      const solde = await lireEtatSolde(ex, resa, aujourdhui);
      if (solde?.etat === "a_payer" && aujourdhui > solde.dateLimite) {
        const n = joursEntre(solde.dateLimite, aujourdhui);
        taches.push({
          ...base,
          cle: `solde_impaye:${resa.id}`,
          titre: "Solde impayé",
          detail:
            `${fmtEuro(solde.montant)} attendus le ${fmtDateLongue(dateLimiteSolde(resa))} : ${n} jour${n > 1 ? "s" : ""} de retard. ` +
            "Le client a le lien pour payer ; appelez-le, ou notez un virement reçu.",
          depuis: ajouterJours(solde.dateLimite, 1),
          gestes: ["fiche"],
        });
      }
    }

    // 4. Contrat pas signé, `contrat_non_signe_jours` après le paiement, jusqu'au départ.
    if (confirmee && aujourdhui <= resa.date_depart) {
      const [contrat] = await ex
        .select({ statut: documents.statut })
        .from(documents)
        .where(and(eq(documents.reservation_id, resa.id), eq(documents.type, "contrat_location")));
      const paye = aujourdhuiParis(resa.date_paiement_acompte ?? resa.created_at);
      const aPartir = ajouterJours(paye, regl.contratJours);
      if (contrat && contrat.statut !== "signe" && aujourdhui >= aPartir) {
        taches.push({
          ...base,
          cle: `contrat_non_signe:${resa.id}`,
          titre: "Contrat pas signé",
          detail: `Payé le ${fmtDateLongue(paye)}, le contrat n'est toujours pas signé.`,
          depuis: aPartir,
          gestes: ["renvoyer_contrat", "fiche"],
        });
      }
    }
  }

  // 5. Le compte de la SARL manque alors qu'un client doit faire son virement.
  if (compteManquant) {
    taches.push({
      cle: "compte_virement_absent",
      titre: "Compte bancaire de la SARL pas saisi",
      detail: "Un client a choisi la caution par virement, mais il ne peut pas recevoir les coordonnées : saisissez le compte dans les réglages.",
      depuis: aujourdhui,
      reservationId: null,
      reference: null,
      client: null,
      gite: null,
      gestes: ["reglages"],
    });
  }

  // 6. Ce que le site ne peut pas clore : alertes « À TRAITER », courriels au client non partis.
  const alertes = await ex
    .select({ cle: courriels.cle, donnees: courriels.donnees, reservationId: courriels.reservation_id, creeLe: courriels.created_at })
    .from(courriels)
    .where(and(eq(courriels.objet, "alerte_probleme"), gte(courriels.created_at, sql`now() - interval '120 days'`)));
  const vues = new Set<string>();
  for (const a of alertes) {
    const genre = String(a.donnees.genre ?? "");
    const titre = GENRES_MANUELS[genre];
    if (!titre) continue;
    // La clé du courriel finit par « :destinataire » : une ligne par problème, pas par destinataire.
    const cle = `alerte:${a.cle.slice(0, a.cle.lastIndexOf(":"))}`;
    if (vues.has(cle) || faits.has(cle)) continue;
    vues.add(cle);
    const resa = a.reservationId ? await chargerReservationAvecGite(a.reservationId, ex) : null;
    taches.push({
      cle,
      titre,
      detail: "Le détail est dans l'alerte « À TRAITER » reçue par courriel. Une fois réglé, cliquez « C'est fait ».",
      depuis: aujourdhuiParis(a.creeLe),
      reservationId: resa?.id ?? null,
      reference: resa?.reference ?? null,
      client: resa ? nomClient(resa) : null,
      gite: resa?.gites?.nom ?? null,
      gestes: resa ? ["fiche", "c_est_fait"] : ["c_est_fait"],
    });
  }
  const echecs = await ex
    .select({ id: courriels.id, objet: courriels.objet, destinataire: courriels.destinataire, reservationId: courriels.reservation_id, quand: courriels.updated_at })
    .from(courriels)
    .where(and(eq(courriels.statut, "echec"), gte(courriels.created_at, sql`now() - interval '120 days'`)));
  for (const e of echecs) {
    if (!OBJETS_CLIENT.has(e.objet)) continue;
    const cle = `courriel:${e.id}`;
    if (faits.has(cle)) continue;
    const resa = e.reservationId ? await chargerReservationAvecGite(e.reservationId, ex) : null;
    taches.push({
      cle,
      titre: "Courriel au client non parti",
      detail: `Le courriel n'a pas pu être envoyé à ${e.destinataire}. Prévenez le client par téléphone et vérifiez son adresse.`,
      depuis: aujourdhuiParis(e.quand),
      reservationId: resa?.id ?? null,
      reference: resa?.reference ?? null,
      client: resa ? nomClient(resa) : null,
      gite: resa?.gites?.nom ?? null,
      gestes: resa ? ["fiche", "c_est_fait"] : ["c_est_fait"],
    });
  }

  return taches.sort((a, b) => a.depuis.localeCompare(b.depuis) || a.titre.localeCompare(b.titre));
}

/** « C'est fait » : seules les lignes que le site ne peut pas clore lui-même. */
export async function marquerFait(cle: string, acteur: Acteur): Promise<boolean> {
  if (!/^(alerte|courriel):/.test(cle) || cle.length > 300) return false;
  return getDb().transaction(async (tx) => {
    const ajout = await tx.insert(a_traiter_faits).values({ cle, acteur: typeof acteur === "string" ? acteur : `gestion (${acteur.description})` }).onConflictDoNothing().returning();
    if (ajout.length) await journaliser(tx, { table: "a_traiter_faits", ligne: cle, action: "c_est_fait", acteur });
    return true;
  });
}

export interface Mouvement {
  reservationId: string;
  reference: string;
  client: string;
  gite: string;
  date: string;
  heure: string;
  voyageurs: number;
}

/** Les arrivées et les départs des 7 prochains jours (réponse a du cadrage du lot 2). */
export async function arriveesDeparts(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<{ arrivees: Mouvement[]; departs: Mouvement[] }> {
  const debut = aujourdhuiParis(maintenant);
  const fin = ajouterJours(debut, 6);
  const lignes = await ex
    .select({ r: reservations, gite: gites.nom })
    .from(reservations)
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(
      and(
        inArray(reservations.statut, ["confirmee", "terminee"]),
        sql`(${reservations.date_arrivee} between ${debut}::date and ${fin}::date
             or ${reservations.date_depart} between ${debut}::date and ${fin}::date)`,
      ),
    );
  const arrivees: Mouvement[] = [];
  const departs: Mouvement[] = [];
  for (const { r, gite } of lignes) {
    const m = {
      reservationId: r.id,
      reference: r.reference,
      client: nomClient(r),
      gite,
      voyageurs: r.nb_adultes + r.nb_enfants + r.nb_bebes,
    };
    if (r.date_arrivee >= debut && r.date_arrivee <= fin) arrivees.push({ ...m, date: r.date_arrivee, heure: (r.heure_arrivee ?? "").slice(0, 5) });
    if (r.date_depart >= debut && r.date_depart <= fin) departs.push({ ...m, date: r.date_depart, heure: (r.heure_depart ?? "").slice(0, 5) });
  }
  const tri = (a: Mouvement, b: Mouvement) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure);
  return { arrivees: arrivees.sort(tri), departs: departs.sort(tri) };
}
