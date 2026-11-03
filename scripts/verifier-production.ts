// CONTRÔLE DE LA BASE AVANT ET APRÈS SES MIGRATIONS (Phase 4, lot 3 ;
// docs/06-avant-premier-client.md, point 4). Pensé pour la base RÉELLE.
//
// EN LECTURE SEULE, IMPOSÉE PAR LA BASE ELLE-MÊME : tout se passe dans une
// transaction `read only`, que PostgreSQL refuse d'utiliser pour écrire, puis
// annulée. Aucune ligne, aucun numéro, aucun réglage ne peut être modifié,
// même par erreur dans ce script.
//
// Ce qu'il dit, en français :
//   1. à quelle base il parle (nom, compte, droits) — jamais l'adresse ni le
//      mot de passe ;
//   2. les migrations appliquées et celles qui manquent ;
//   3. avant 0009 et 0010 : les deux contrôles de db/README.md ;
//   4. les compteurs de numéros face aux factures et contrats présents :
//      un compteur en avance (numéros consommés par d'anciens essais) ferait
//      un trou dans la suite dès la première vraie facture ;
//   5. ce que contient la base (réservations, documents, signatures…) ;
//   6. une fois les migrations appliquées : réglages, alertes, cautions des
//      gîtes, compte du virement, durée de conservation, tarification.
// Code de sortie 1 si un point BLOQUE l'application des migrations ou
// l'ouverture (facture en double, compteur incohérent).
//
// Lancer : npm run verify:production            (base réelle, DATABASE_URL)
//          DB_CIBLE=test npm run verify:production (base de test, pour essayer)
import "../db/env";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool, type PoolClient } from "pg";

import { resoudreDatabaseUrl } from "../db";

type Niveau = "OK" | "INFO" | "A VOIR" | "BLOQUANT";
let bloquants = 0;
let aVoir = 0;

function dire(niveau: Niveau, texte: string): void {
  if (niveau === "BLOQUANT") bloquants += 1;
  if (niveau === "A VOIR") aVoir += 1;
  console.log(`  [${niveau}] ${texte}`);
}
const titre = (t: string) => console.log(`\n${t}`);

async function tableExiste(c: PoolClient, table: string, schema = "public"): Promise<boolean> {
  const r = await c.query(`select to_regclass($1) is not null as ok`, [`${schema}.${table}`]);
  return r.rows[0].ok === true;
}
async function colonneExiste(c: PoolClient, table: string, colonne: string): Promise<boolean> {
  const r = await c.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, colonne],
  );
  return r.rows.length > 0;
}

async function connexion(c: PoolClient): Promise<void> {
  titre("1. La base");
  const r = await c.query<{ base: string; compte: string; super: boolean; proprietaire: boolean }>(
    `select current_database() as base, current_user as compte,
            (select rolsuper from pg_roles where rolname = current_user) as super,
            (select pg_get_userbyid(datdba) = current_user from pg_database where datname = current_database()) as proprietaire`,
  );
  const l = r.rows[0];
  dire(process.env.DB_CIBLE === "test" ? "INFO" : "OK", `base « ${l.base} »${process.env.DB_CIBLE === "test" ? " (DB_CIBLE=test : base de TEST)" : ""}`);
  dire(
    "INFO",
    `compte « ${l.compte} »${l.super ? ", administrateur du serveur" : ""}${l.proprietaire ? ", propriétaire de la base" : ""} ` +
      "(une seule clé d'accès pour l'instant : la séparation des comptes est reportée à la fin du travail, point 4)",
  );
}

async function migrations(c: PoolClient): Promise<{ appliquees: number; attendues: string[] }> {
  titre("2. Migrations");
  const journal = JSON.parse(readFileSync(join(process.cwd(), "db/migrations/meta/_journal.json"), "utf-8")) as {
    entries: { idx: number; tag: string }[];
  };
  const attendues = journal.entries.sort((a, b) => a.idx - b.idx).map((e) => e.tag);
  let appliquees = 0;
  if (await tableExiste(c, "__drizzle_migrations", "drizzle")) {
    const r = await c.query<{ n: number }>(`select count(*)::int as n from drizzle.__drizzle_migrations`);
    appliquees = r.rows[0].n;
  }
  const manquantes = attendues.slice(appliquees);
  if (appliquees > attendues.length) {
    dire("BLOQUANT", `${appliquees} migrations appliquées pour ${attendues.length} dans le dépôt : la base est en avance sur le code`);
  } else if (manquantes.length === 0) {
    dire("OK", `les ${attendues.length} migrations du dépôt sont appliquées (dernière : ${attendues.at(-1)})`);
  } else {
    dire(
      "INFO",
      `${appliquees} migration(s) appliquée(s) sur ${attendues.length}` +
        (appliquees > 0 ? ` (dernière : ${attendues[appliquees - 1]})` : "") +
        ` ; à appliquer : ${manquantes.join(", ")}`,
    );
  }
  return { appliquees, attendues };
}

async function avantMigrations(c: PoolClient, appliquees: number, attendues: string[]): Promise<void> {
  titre("3. Contrôles de db/README.md avant les migrations 0009 et 0010");
  const rang = (prefixe: string) => attendues.findIndex((t) => t.startsWith(prefixe));
  const r9 = rang("0009");
  const r10 = rang("0010");

  if (r9 >= 0 && appliquees <= r9) {
    if (await tableExiste(c, "factures")) {
      const d = await c.query(
        `select reservation_id, type, count(*)::int as n from factures group by 1, 2 having count(*) > 1`,
      );
      if (d.rows.length === 0) dire("OK", "avant 0009 : aucune facture en double pour une même réservation");
      else dire("BLOQUANT", `avant 0009 : ${d.rows.length} réservation(s) avec deux factures du même type — ne pas appliquer, ne rien supprimer`);
    } else {
      dire("INFO", "avant 0009 : pas de table factures, rien à contrôler");
    }
  } else {
    dire("INFO", "0009 déjà appliquée : contrôle sans objet");
  }

  if (r10 >= 0 && appliquees <= r10) {
    if (!(await tableExiste(c, "reservations"))) {
      dire("INFO", "avant 0010 : pas de table reservations");
      return;
    }
    const avecDetail = await colonneExiste(c, "reservations", "detail_calcul");
    const d = await c.query<{ reference: string; caution_du_gite: string | null; contrat: string | null }>(
      `select r.reference, g.caution::text as caution_du_gite, d.numero as contrat
         from reservations r join gites g on g.id = r.gite_id
         left join documents d on d.reservation_id = r.id and d.type = 'contrat_location'
        ${avecDetail ? "where r.detail_calcul is null or jsonb_typeof(r.detail_calcul->'caution') <> 'number'" : ""}`,
    );
    if (d.rows.length === 0) {
      dire("OK", "avant 0010 : aucune réservation dont la caution viendrait de la fiche du gîte");
    } else {
      for (const l of d.rows) {
        dire(
          l.contrat ? "A VOIR" : "INFO",
          `avant 0010 : ${l.reference} recevra ${l.caution_du_gite ?? "aucun montant"} € (caution du gîte)` +
            (l.contrat ? ` — comparer avec le montant imprimé au contrat ${l.contrat}` : ", sans contrat émis"),
        );
      }
    }
  } else {
    dire("INFO", "0010 déjà appliquée : contrôle sans objet");
  }
}

async function compteurs(c: PoolClient): Promise<void> {
  titre("4. Numérotation des documents (art. 289 CGI)");
  if (!(await tableExiste(c, "compteurs_documents"))) {
    dire("INFO", "pas de compteurs : aucun numéro n'a jamais été tiré");
    return;
  }
  const lignes = await c.query<{ serie: string; annee: number; dernier: number }>(
    `select serie, annee, dernier_numero as dernier from compteurs_documents order by serie, annee`,
  );
  if (lignes.rows.length === 0) dire("OK", "aucun compteur : la première facture sera FAC-AAAA-001, le premier contrat CTR-AAAA-001");
  for (const l of lignes.rows) {
    const table = l.serie === "FAC" ? "factures" : "documents";
    const presents = (await tableExiste(c, table))
      ? (
          await c.query<{ n: number; max: number | null }>(
            `select count(*)::int as n, max(split_part(numero, '-', 3)::int) as max
               from ${table} where numero like $1`,
            [`${l.serie}-${l.annee}-%`],
          )
        ).rows[0]
      : { n: 0, max: null };
    const texte = `${l.serie} ${l.annee} : compteur à ${l.dernier}, ${presents.n} document(s) présent(s)` +
      (presents.max !== null ? ` (plus haut numéro : ${presents.max})` : "");
    if (l.dernier === presents.n && (presents.max ?? 0) === l.dernier) {
      dire(l.dernier === 0 ? "OK" : "A VOIR", texte + (l.dernier === 0 ? "" : " — suite continue ; ces documents sont-ils réels ?"));
    } else {
      dire("BLOQUANT", texte + " — la suite a un trou ou un doublon : prévenir le développeur avant toute émission");
    }
  }
}

async function contenu(c: PoolClient): Promise<void> {
  titre("5. Contenu");
  if (await tableExiste(c, "reservations")) {
    const r = await c.query<{ statut: string; n: number }>(`select statut, count(*)::int as n from reservations group by 1 order by 1`);
    dire(r.rows.length === 0 ? "OK" : "A VOIR", r.rows.length === 0
      ? "aucune réservation"
      : `réservations : ${r.rows.map((l) => `${l.n} ${l.statut}`).join(", ")} — réelles, ou anciens essais ?`);
  }
  for (const table of ["documents", "factures", "signatures", "paiements", "courriels"]) {
    if (!(await tableExiste(c, table))) continue;
    const r = await c.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    dire(r.rows[0].n === 0 ? "OK" : "A VOIR", `${table} : ${r.rows[0].n} ligne(s)`);
  }
}

async function apresMigrations(c: PoolClient): Promise<void> {
  titre("6. Réglages et données d'exploitation (après les migrations)");
  if (!(await tableExiste(c, "reglages")) || !(await colonneExiste(c, "reglages", "virement_iban"))) {
    dire("INFO", "à relancer une fois les migrations appliquées");
    return;
  }
  const r = (
    await c.query(
      `select courriel_expediteur, courriel_reponse, virement_titulaire is not null as compte,
              abandon_conservation_jours as abandon, taux_acompte, delai_solde_jours, delai_virement_caution_jours,
              delai_remboursement_solde_heures
         from reglages where id = 1`,
    )
  ).rows[0];
  if (!r) {
    dire("BLOQUANT", "ligne de réglages absente (la migration 0003 la crée)");
    return;
  }
  dire("OK", `courriels : expéditeur ${r.courriel_expediteur}, réponses à ${r.courriel_reponse}`);
  dire("INFO", `conditions : acompte ${r.taux_acompte} %, solde ${r.delai_solde_jours} jours avant, virement de caution ${r.delai_virement_caution_jours} jours avant, solde remboursé jusqu'à ${r.delai_remboursement_solde_heures} heures avant`);
  dire(r.compte ? "OK" : "A VOIR", r.compte
    ? "compte de la caution par virement : saisi"
    : "compte de la caution par virement : vide — à saisir avant l'ouverture (sans lui, le client ne reçoit pas les coordonnées)");
  dire(r.abandon === null ? "A VOIR" : "OK", r.abandon === null
    ? "durée de conservation des tentatives abandonnées : vide, rien n'est effacé (réponse du juriste attendue, point 12)"
    : `tentatives abandonnées effacées après ${r.abandon} jours`);

  const a = await c.query<{ type: string; active: boolean; destinataires: string[] }>(
    `select type, active, destinataires from alertes order by type`,
  );
  for (const l of a.rows) {
    dire(l.active ? "OK" : "A VOIR", `alerte « ${l.type} » ${l.active ? "active" : "COUPÉE"} → ${l.destinataires.join(", ") || "personne"}`);
  }
  const g = await c.query<{ nom: string; caution: string | null }>(`select nom, caution::text as caution from gites order by nom`);
  for (const l of g.rows) {
    dire(l.caution === null ? "A VOIR" : "OK", `gîte ${l.nom} : caution ${l.caution === null ? "ABSENTE (contrat refusé)" : `${l.caution} €`}`);
  }
  const t = await c.query<{ tarifs: number; periodes: number; taxes: number }>(
    `select (select count(*)::int from tarifs) as tarifs, (select count(*)::int from periodes) as periodes,
            (select count(*)::int from taxes_sejour) as taxes`,
  );
  const l = t.rows[0];
  dire(l.tarifs > 0 && l.periodes > 0 && l.taxes > 0 ? "OK" : "A VOIR",
    `tarification : ${l.tarifs} tarif(s), ${l.periodes} période(s), ${l.taxes} réglage(s) de taxe de séjour` +
      (l.tarifs === 0 ? " — vide : les fiches masquent leurs prix, le tunnel refuse de chiffrer (point 11)" : ""));
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: resoudreDatabaseUrl(), max: 1 });
  const c = await pool.connect();
  try {
    await c.query("begin transaction read only");
    await connexion(c);
    const { appliquees, attendues } = await migrations(c);
    await avantMigrations(c, appliquees, attendues);
    await compteurs(c);
    await contenu(c);
    await apresMigrations(c);
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
    await pool.end();
  }
  console.log(
    `\n${bloquants === 0 ? "Aucun point bloquant." : `${bloquants} point(s) BLOQUANT(S) : ne pas appliquer les migrations, prévenir le développeur.`}` +
      `${aVoir > 0 ? ` ${aVoir} point(s) à voir.` : ""} Rien n'a été modifié (lecture seule).`,
  );
  process.exitCode = bloquants === 0 ? 0 : 1;
}

main().catch((erreur) => {
  console.error("ERREUR :", erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
});
