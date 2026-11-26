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
//
// Depuis le lot 3 (D-34) : les nuits sans tarif des 12 prochains mois
// (`tarifs_horizon_mois`) et ce qui rend des dates invendables (prix, barème
// ou taxe de séjour manquants) ont leur ligne, jusqu'à ce que la page des
// tarifs les comble.
//
// Depuis la Phase 7 (D-44) : les doublons avec une plateforme (un séjour
// annoncé par Gîtes de France, Airbnb ou Booking sur des nuits déjà prises),
// jusqu'à ce qu'une des deux réservations soit annulée ; les liens de
// plateforme qui ne se lisent plus depuis 2 heures. L'accueil montre aussi les
// séjours des plateformes, sans nom de client (elles n'en donnent pas).
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { a_traiter_faits, courriels, documents, gites, paiements, reglages, remboursements, reservations } from "@/db/schema";
import { jourLevee, lireReglagesCaution } from "@/lib/caution";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { OBJETS_CLIENT } from "@/lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis, heureParis, jourUtc } from "@/lib/dates-civiles";
import { fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { detenteurLisible, NOMS_PLATEFORMES } from "@/lib/plateformes";
import { chargerReservationAvecGite, type Executeur } from "@/lib/reservations";
import { dateLimiteSolde, lireEtatSolde } from "@/lib/solde";
import { doublonsEnCours, liensEnPanne, sejoursPlateformes } from "@/lib/synchronisation";
import { dateLimiteVirement } from "@/lib/virement";

import { journaliser, type Acteur } from "./journal";
import { lireEtatTarifs } from "./tarifs";
import { trouLisible } from "./tarifs-regles";

/** Les gestes qu'une ligne propose (la fiche de la réservation porte les formulaires). */
export type GesteTache = "fiche" | "reglages" | "tarifs" | "gites" | "calendrier" | "renvoyer_contrat" | "c_est_fait";

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

  // Les réservations annulées (Phase 5, lot 5) : un remboursement par virement
  // à faire, un remboursement par carte qui n'aboutit pas, une caution reçue à rendre.
  const annulees = await ex
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.statut, "annulee"),
        sql`(exists (select 1 from ${remboursements} where ${remboursements.reservation_id} = ${reservations.id}
                and ${remboursements.statut} = 'a_faire')
             or (${reservations.caution_recue_at} is not null and ${reservations.caution_rendue_at} is null))`,
      ),
    );
  for (const { id } of annulees) {
    const resa = await chargerReservationAvecGite(id, ex);
    if (!resa) continue;
    const base = { reservationId: resa.id, reference: resa.reference, client: nomClient(resa), gite: resa.gites?.nom ?? null };
    const mouvements = await ex
      .select()
      .from(remboursements)
      .where(and(eq(remboursements.reservation_id, resa.id), eq(remboursements.statut, "a_faire")));
    for (const m of mouvements) {
      const montant = fmtEuro(centimesDepuisNumeric(m.montant));
      if (m.mode === "virement") {
        taches.push({
          ...base,
          cle: `remboursement_virement:${m.id}`,
          titre: "Remboursement à faire par virement",
          detail:
            `${montant} à rembourser au client, réservation annulée` +
            `${m.erreur ? " (la banque a refusé de rembourser la carte)" : ""}. ` +
            "Faites le virement depuis votre banque, puis cliquez « Remboursement fait » sur la fiche.",
          depuis: aujourdhuiParis(m.created_at),
          gestes: ["fiche"],
        });
      } else if (maintenant.getTime() - m.created_at.getTime() > 3_600_000) {
        taches.push({
          ...base,
          cle: `remboursement_carte:${m.id}`,
          titre: "Remboursement sur la carte pas encore abouti",
          detail: `${montant} à rembourser sur la carte du client : Stripe ne répond pas, le site retente tout seul. Si cela dure, prévenez le développeur.`,
          depuis: aujourdhuiParis(m.created_at),
          gestes: ["fiche"],
        });
      }
    }
    if (resa.caution_recue_at && !resa.caution_rendue_at && resa.caution !== null) {
      taches.push({
        ...base,
        cle: `caution_a_rendre:${resa.id}`,
        titre: "Caution à rendre",
        detail: `${fmtEuro(resa.caution)} reçus par ${resa.moyen_caution === "virement" ? "virement" : "chèque"} : la réservation est annulée, rendez-la entière.`,
        depuis: aujourdhuiParis(resa.updated_at),
        gestes: ["fiche"],
      });
    }
  }

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

  // 6. Les tarifs : une nuit invendable dans les mois qui viennent (réponse 6 A du lot 3).
  const etat = await lireEtatTarifs(maintenant, ex);
  const sansSejour = { reservationId: null, reference: null, client: null, gite: null, gestes: ["tarifs" as const] };
  for (const t of etat.trous) {
    taches.push({ ...sansSejour, cle: `tarifs_trou:${t.debut}`, titre: "Nuits sans tarif", detail: trouLisible(t), depuis: aujourdhui });
  }
  if (etat.problemes.length) {
    taches.push({ ...sansSejour, cle: "tarifs_incomplets", titre: "Tarifs incomplets", detail: etat.problemes.join(" "), depuis: aujourdhui });
  }

  // 7. La synchronisation des calendriers (Phase 7) : doublons, liens qui ne se lisent plus.
  for (const d of await doublonsEnCours(maintenant, ex)) {
    const nom = NOMS_PLATEFORMES[d.plateforme];
    const directe = d.detenteurs.find((x) => x.genre === "directe");
    const resa = directe?.genre === "directe" ? await chargerReservationAvecGite(directe.reservationId, ex) : null;
    taches.push({
      cle: `doublon:${d.sejourId}`,
      titre: `Doublon possible avec ${nom}`,
      detail:
        `${nom} annonce un séjour à ${d.gite} du ${fmtDateLongue(d.arrivee)} au ${fmtDateLongue(d.depart)}, ` +
        `mais ces nuits sont déjà prises sur le site : ${d.detenteurs.map(detenteurLisible).join(" ; ")}. ` +
        "Ce qu'il faut faire est dans l'alerte « À TRAITER » reçue par courriel ; la ligne disparaît quand l'une des deux réservations est annulée.",
      depuis: aujourdhuiParis(d.vuLe),
      reservationId: resa?.id ?? null,
      reference: resa?.reference ?? null,
      client: resa ? nomClient(resa) : null,
      gite: d.gite,
      gestes: resa ? ["fiche", "calendrier"] : ["calendrier"],
    });
  }
  for (const l of await liensEnPanne(maintenant, ex)) {
    const nom = NOMS_PLATEFORMES[l.plateforme];
    taches.push({
      cle: `lien_calendrier:${l.calendrierId}`,
      titre: `Le calendrier ${nom} ne se lit plus`,
      detail:
        `Le lien ${nom} de ${l.gite} ` +
        (l.luA ? `ne se lit plus depuis le ${fmtDateLongue(aujourdhuiParis(l.luA))} à ${fmtHeure(heureParis(l.luA))}` : "n'a jamais pu être lu") +
        (l.erreur ? ` (${l.erreur})` : "") +
        `. Pendant ce temps, le site ne voit pas les nouvelles réservations ${nom} de ce gîte. ` +
        `Vérifiez le lien dans la fiche du gîte, ou recollez-le depuis ${nom}.`,
      depuis: l.luA ? aujourdhuiParis(l.luA) : aujourdhui,
      reservationId: null,
      reference: null,
      client: null,
      gite: l.gite,
      gestes: ["gites"],
    });
  }

  // 8. Ce que le site ne peut pas clore : alertes « À TRAITER », courriels au client non partis.
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
  /** Clé de la ligne à l'écran. */
  cle: string;
  /** `null` : séjour d'une plateforme (Phase 7), sans fiche sur le site. */
  reservationId: string | null;
  reference: string;
  /** Le client, ou le nom de la plateforme. */
  client: string;
  gite: string;
  date: string;
  heure: string;
  /** `null` : inconnu (séjour d'une plateforme). */
  voyageurs: number | null;
}

/** Les arrivées et les départs des 7 prochains jours (réponse a du cadrage du lot 2), séjours des plateformes compris. */
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
    if (r.date_arrivee >= debut && r.date_arrivee <= fin) {
      arrivees.push({ ...m, cle: `${r.id}-a`, date: r.date_arrivee, heure: (r.heure_arrivee ?? "").slice(0, 5) });
    }
    if (r.date_depart >= debut && r.date_depart <= fin) {
      departs.push({ ...m, cle: `${r.id}-d`, date: r.date_depart, heure: (r.heure_depart ?? "").slice(0, 5) });
    }
  }
  for (const s of await sejoursPlateformes(debut, fin, "arrivee_ou_depart", ex)) {
    const m = { reservationId: null, reference: "", client: NOMS_PLATEFORMES[s.plateforme], gite: s.gite, heure: "", voyageurs: null };
    if (s.arrivee >= debut && s.arrivee <= fin) arrivees.push({ ...m, cle: `${s.id}-a`, date: s.arrivee });
    if (s.depart >= debut && s.depart <= fin) departs.push({ ...m, cle: `${s.id}-d`, date: s.depart });
  }
  const tri = (a: Mouvement, b: Mouvement) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure);
  return { arrivees: arrivees.sort(tri), departs: departs.sort(tri) };
}

export interface SejourAVenir {
  cle: string;
  /** `null` : séjour d'une plateforme (Phase 7), sans fiche sur le site. */
  reservationId: string | null;
  /** Le client, ou le nom de la plateforme. */
  client: string;
  gite: string;
  arrivee: string;
  depart: string;
  /** `null` : inconnu (séjour d'une plateforme). */
  voyageurs: number | null;
}

export interface PeriodeAVenir {
  titre: string;
  du: string;
  au: string;
  sejours: SejourAVenir[];
}

/** Au-delà des 7 prochains jours, sur un an : du jour 7 au jour 30, puis jusqu'au jour 182, puis jusqu'au jour 365. */
const PERIODES_A_VENIR: { titre: string; du: number; au: number }[] = [
  { titre: "D'ici 1 mois", du: 7, au: 30 },
  { titre: "De 1 à 6 mois", du: 31, au: 182 },
  { titre: "De 6 mois à 1 an", du: 183, au: 365 },
];

/**
 * Les séjours qui commencent plus loin que les 7 prochains jours, rangés par
 * période (gérant, 18 novembre 2026 : « avoir une idée de l'avenir »).
 */
export async function sejoursAVenir(maintenant: Date = new Date(), ex: Executeur = getDb()): Promise<PeriodeAVenir[]> {
  const auj = aujourdhuiParis(maintenant);
  const periodes = PERIODES_A_VENIR.map((p) => ({ titre: p.titre, du: ajouterJours(auj, p.du), au: ajouterJours(auj, p.au), sejours: [] as SejourAVenir[] }));
  const lignes = await ex
    .select({ r: reservations, gite: gites.nom })
    .from(reservations)
    .innerJoin(gites, eq(gites.id, reservations.gite_id))
    .where(
      and(
        inArray(reservations.statut, ["confirmee", "terminee"]),
        sql`${reservations.date_arrivee} between ${periodes[0].du}::date and ${periodes[periodes.length - 1].au}::date`,
      ),
    )
    .orderBy(reservations.date_arrivee);
  const sejours: SejourAVenir[] = lignes.map(({ r, gite }) => ({
    cle: r.id,
    reservationId: r.id,
    client: nomClient(r),
    gite,
    arrivee: r.date_arrivee,
    depart: r.date_depart,
    voyageurs: r.nb_adultes + r.nb_enfants + r.nb_bebes,
  }));
  for (const s of await sejoursPlateformes(periodes[0].du, periodes[periodes.length - 1].au, "arrivee", ex)) {
    sejours.push({ cle: s.id, reservationId: null, client: NOMS_PLATEFORMES[s.plateforme], gite: s.gite, arrivee: s.arrivee, depart: s.depart, voyageurs: null });
  }
  for (const s of sejours.sort((a, b) => a.arrivee.localeCompare(b.arrivee) || a.gite.localeCompare(b.gite))) {
    periodes.find((p) => s.arrivee >= p.du && s.arrivee <= p.au)?.sejours.push(s);
  }
  return periodes;
}
