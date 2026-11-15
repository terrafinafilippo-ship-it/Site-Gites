// Remise à zéro de la base de TEST, création des deux réservations de référence
// et chargement de la tarification d'essai (tarifs-fictifs.ts).
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test" : ce script vide des
// tables et remet les compteurs de numérotation légale à zéro. Sur la base
// réelle, ce serait une destruction de documents fiscaux.
//
// Lancer depuis la racine du dépôt :
//   DB_CIBLE=test npx tsx scripts/parcours/reinitialiser.ts
import "../../db/env";

import { rm } from "node:fs/promises";
import { Pool } from "pg";

import { numericDepuisCentimes } from "../../lib/centimes";
import { REFERENCE_ARMU, REFERENCE_LAPHINE, RESERVATIONS_REFERENCE } from "./reference";
import { chargerTarifsFictifs } from "./tarifs-fictifs";

// Toutes les tables qui référencent `reservations`, sinon TRUNCATE est refusé.
const TABLES_A_VIDER = [
  // Phase 5, lot 5 : annulations, remboursements, avoirs.
  "remboursements",
  "annulations",
  "avoirs",
  // Phase 5, lot 2 : retenues sur la caution, lignes « À traiter » retirées.
  "retenues",
  "a_traiter_faits",
  "courriels",
  "signatures",
  "documents",
  "factures",
  "paiements",
  "disponibilites",
  "avis",
  "audit_logs",
  "reservations",
] as const;

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error(
      "DB_CIBLE doit valoir \"test\" : ce script vide les tables et remet les compteurs à zéro.",
    );
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST manquante (voir .env.example).");

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`truncate table ${TABLES_A_VIDER.join(", ")}`);
    await pool.query("update compteurs_documents set dernier_numero = 0");
    console.log(`Tables vidées (${TABLES_A_VIDER.length}) et compteurs remis à zéro.`);

    // Les alertes aux propriétaires de la base de TEST vont à une adresse
    // réservée aux essais, jamais envoyée (lib/messagerie.ts) : le parcours
    // signe des contrats, et l'alerte « contrat signé » ne doit pas partir
    // vers la vraie boîte contact@.
    await pool.query("update alertes set destinataires = array['proprietaires@example.invalid']");
    console.log("Alertes de la base de test : proprietaires@example.invalid (jamais envoyée).");

    // Caution par virement (Phase 4, lot 3) : un compte d'EXEMPLE, l'IBAN des
    // documentations bancaires, jamais celui de la société. La base réelle,
    // elle, reste vide jusqu'à la saisie par les propriétaires.
    await pool.query(
      `update reglages set virement_titulaire = 'COMPTE D''ESSAI', virement_iban = 'FR7630006000011234567890189',
              virement_bic = null where id = 1`,
    );
    console.log("Compte de la caution par virement : compte d'essai.");

    // Les PDF de test sont écrits sous STORAGE_PATH ; on repart d'un stockage vide
    // pour que les contrôles de non-régression ne voient que les fichiers du jour.
    const stockage = process.env.STORAGE_PATH ?? "./.data/documents-test";
    await rm(stockage, { recursive: true, force: true });
    console.log(`Stockage purgé : ${stockage}`);

    const gites = (await pool.query<{ id: string; slug: string }>("select id, slug from gites")).rows;
    for (const resa of RESERVATIONS_REFERENCE) {
      const gite = gites.find((g) => g.slug === resa.slugGite);
      if (!gite) throw new Error(`Gîte ${resa.slugGite} absent : lancez d'abord npm run db:seed.`);

      // Les montants sont saisis en CENTIMES dans reference.ts et convertis en
      // texte numeric par la fonction de frontière (lib/centimes.ts).
      const { rows } = await pool.query<{ id: string }>(
        `insert into reservations (
           gite_id, reference, statut,
           client_civilite, client_nom, client_prenom, client_adresse, client_code_postal,
           client_ville, client_pays, client_email, client_telephone,
           client_civilite_conjoint, client_nom_conjoint, client_prenom_conjoint,
           date_arrivee, date_depart, heure_arrivee, heure_depart, heure_limite_arrivee,
           nb_adultes, nb_enfants, nb_bebes, occupants_majeurs,
           prix_location, forfait_menage, options, taxe_sejour, taux_taxe_sejour,
           mode_paiement, reference_transaction, date_paiement_acompte,
           taux_acompte, delai_solde_jours, delai_remboursement_solde_heures, delai_virement_caution_jours,
           caution
         ) values (
           $1, $2, 'confirmee',
           $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25, $26, $27, $28,
           $29, $30, $31,
           $32, $33, 48, 3,
           $34
         ) returning id`,
        [
          gite.id, resa.reference,
          resa.client.civilite, resa.client.nom, resa.client.prenom, resa.client.adresse,
          resa.client.codePostal, resa.client.ville, resa.client.pays, resa.client.email,
          resa.client.telephone,
          resa.conjoint?.civilite ?? null, resa.conjoint?.nom ?? null, resa.conjoint?.prenom ?? null,
          resa.dateArrivee, resa.dateDepart, resa.heureArrivee, resa.heureDepart, resa.heureLimiteArrivee,
          resa.nbAdultes, resa.nbEnfants, resa.nbBebes, resa.occupantsMajeurs,
          numericDepuisCentimes(resa.attendu.prixLocation),
          resa.forfaitMenageReservation === null ? null : numericDepuisCentimes(resa.forfaitMenageReservation),
          numericDepuisCentimes(resa.attendu.options),
          numericDepuisCentimes(resa.attendu.taxeSejour),
          resa.tauxTaxeSejour,
          resa.modePaiement, resa.referenceTransaction, resa.datePaiementAcompte,
          resa.tauxAcompte, resa.delaiSoldeJours,
          // Caution figée sur la réservation (Phase 4, lot 2), comme le fait le tunnel.
          numericDepuisCentimes(resa.attendu.caution),
        ],
      );
      console.log(`Réservation ${resa.reference} créée : ${rows[0].id}`);
    }

    const etat = (
      await pool.query<{ r: string; d: string; f: string; s: string }>(
        `select (select count(*) from reservations) r, (select count(*) from documents) d,
                (select count(*) from factures) f, (select count(*) from signatures) s`,
      )
    ).rows[0];
    console.log(
      `État : ${etat.r} réservation(s), ${etat.d} document(s), ${etat.f} facture(s), ${etat.s} signature(s).`,
    );
    console.log(`Références de test : ${REFERENCE_ARMU}, ${REFERENCE_LAPHINE}`);

    // Tarification d'essai : les fiches gîtes et, au lot 2, le tunnel de
    // réservation en ont besoin. Les deux réservations ci-dessus n'en dépendent
    // pas : leurs montants sont ceux de reference.ts, saisis tels quels.
    await chargerTarifsFictifs(pool);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error("Échec de la remise à zéro :", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
