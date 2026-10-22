// Auto-vérification de la Phase 0 : schéma, seed, fonctions SQL, triggers,
// index uniques et stockage des PDF.
//
// Toutes les écritures en base se font dans UNE transaction ANNULÉE à la fin
// (ROLLBACK) : aucun numéro réel n'est consommé, aucune ligne de test ne
// subsiste. Les tests de stockage utilisent un dossier temporaire et une clé de
// signature jetable ; la route /api/documents est appelée directement (c'est une
// simple fonction), sans démarrer de serveur.
//
// Lancer : npm run db:verify   (code de sortie 1 si un contrôle échoue)
import "./env";

import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PoolClient } from "pg";

import { GET as documentsGET } from "@/app/api/documents/[...path]/route";
import {
  construireUrlSignee,
  getStorage,
  isStorageError,
  signerChemin,
  validerChemin,
} from "@/lib/storage";

import { centimesDepuisNumeric } from "../lib/centimes";
import { closeDb, getPool } from "./index";

// ─── Rapport ──────────────────────────────────────────────────────────────────

let nbControles = 0;
let nbEchecs = 0;

function noter(section: string, ok: boolean, libelle: string, detail?: string): void {
  nbControles += 1;
  if (!ok) nbEchecs += 1;
  const suffixe = detail ? ` (${detail})` : "";
  console.log(`  ${ok ? "[OK]" : "[KO]"} ${section} ${libelle}${suffixe}`);
}

function titre(texte: string): void {
  console.log(`\n${texte}`);
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

function codePg(erreur: unknown): string | undefined {
  return (erreur as { code?: string } | undefined)?.code;
}

const pad3 = (n: number): string => String(n).padStart(3, "0");

// ─── 1. Tables et colonnes attendues ─────────────────────────────────────────

const COLONNES_ATTENDUES: Record<string, string[]> = {
  gites: [
    "id", "nom", "ref_gdf", "slug", "adresse", "capacite_max", "forfait_menage", "caution",
    "equipements_specifiques", "a_spa", "contact_arrivee_tel", "tarif_semaine_base",
    "tarif_weekend", "taux_taxe_sejour", "actif", "created_at",
  ],
  reservations: [
    "id", "gite_id", "reference", "statut", "numero_contrat",
    "client_civilite", "client_nom", "client_prenom", "client_adresse", "client_code_postal",
    "client_ville", "client_pays", "client_email", "client_telephone",
    "client_civilite_conjoint", "client_nom_conjoint", "client_prenom_conjoint",
    "date_arrivee", "date_depart", "heure_arrivee", "heure_depart", "heure_limite_arrivee",
    "nb_adultes", "nb_enfants", "nb_bebes", "occupants_majeurs",
    "prix_location", "forfait_menage", "options", "taxe_sejour", "taux_taxe_sejour",
    "detail_calcul",
    // Paiement (Phase 3, lot 3, migration 0005).
    "taux_acompte", "delai_solde_jours", "paiement_integral", "moyen_caution", "mode_solde", "langue",
    "stripe_customer_id", "stripe_payment_method_id", "accord_carte_id", "accord_carte_texte",
    "mode_paiement", "reference_transaction", "date_paiement_acompte",
    "created_at", "updated_at",
  ],
  documents: [
    "id", "reservation_id", "type", "numero", "url_pdf", "statut", "token", "token_expire_at",
    "template_version", "date_signature", "created_at",
  ],
  signatures: [
    "id", "reservation_id", "document_id", "signataire_nom", "signataire_email", "token",
    "consentement_texte", "document_hash", "document_storage_path", "ip_signataire",
    "user_agent", "signe_at",
  ],
  factures: [
    "id", "numero", "type", "reservation_id", "facture_acompte_id", "montant_ttc",
    "date_emission", "pdf_url", "donnees", "created_at",
  ],
  compteurs_documents: ["serie", "annee", "dernier_numero"],
  paiements: [
    "id", "reservation_id", "type", "montant", "statut", "prestataire", "reference_externe",
    "date_paiement", "motif_remboursement", "reference_remboursement", "date_remboursement",
    "created_at", "updated_at",
  ],
  disponibilites: [
    "id", "gite_id", "date", "statut", "source", "reservation_id", "verrou_expire_at", "created_at",
  ],
  avis: ["id", "gite_id", "source", "note", "commentaire", "auteur", "date_sejour", "publie", "created_at"],
  audit_logs: ["id", "table_cible", "ligne_id", "action", "acteur", "details", "created_at"],
  // Tarification (Phase 3, lot 1 — D-17 et D-18).
  baremes: ["id", "nom", "created_at"],
  baremes_coefficients: ["bareme_id", "rang", "coefficient"],
  tarifs: ["id", "nom", "nuits_minimum", "jours_arrivee", "jours_depart", "bareme_id", "created_at"],
  tarifs_prix: ["tarif_id", "gite_id", "prix_nuit"],
  periodes: [
    "id", "tarif_id", "date_debut", "date_fin", "nuits_minimum", "jours_arrivee", "jours_depart",
    "bareme_id", "created_at",
  ],
  reglages: [
    "id", "nuits_minimum", "jours_arrivee", "jours_depart", "bareme_general_id",
    "periodes_jour_debut",
    // Tunnel (Phase 3, lot 2, migration 0004).
    "duree_blocage_minutes", "delai_reservation_jours", "heure_arrivee", "heure_depart",
    "heure_limite_arrivee", "bebe_age_limite", "bebes_hors_capacite", "lits_bebe",
    // Paiement (Phase 3, lot 3, migration 0005).
    "taux_acompte", "delai_solde_jours", "delai_virement_caution_jours",
    "updated_at",
  ],
  taxes_sejour: [
    "id", "gite_id", "date_debut", "mode", "taux", "plafond", "tarif_fixe", "taxe_additionnelle",
    "menage_dans_assiette", "bebes_parmi_occupants", "source", "created_at",
  ],
  // Texte d'accord pour l'enregistrement de la carte (Phase 3, lot 3).
  textes_accord: ["id", "objet", "langue", "en_vigueur_depuis", "modele", "modele_solde", "valide_par", "created_at"],
};

// Quelques types sensibles (le module de contrat en dépend).
const TYPES_ATTENDUS: Array<[table: string, colonne: string, udt: string]> = [
  ["signatures", "ip_signataire", "inet"],
  ["reservations", "date_arrivee", "date"],
  ["reservations", "heure_arrivee", "time"],
  ["reservations", "created_at", "timestamptz"],
  ["documents", "token_expire_at", "timestamptz"],
  ["factures", "date_emission", "date"],
  ["factures", "donnees", "jsonb"],
  ["factures", "montant_ttc", "numeric"],
  ["periodes", "date_debut", "date"],
  ["periodes", "jours_arrivee", "_int4"],
  ["baremes_coefficients", "coefficient", "numeric"],
  ["tarifs_prix", "prix_nuit", "numeric"],
  ["taxes_sejour", "taux", "numeric"],
  ["reservations", "detail_calcul", "jsonb"],
  ["reglages", "heure_arrivee", "time"],
  ["disponibilites", "verrou_expire_at", "timestamptz"],
];

async function verifierSchema(client: PoolClient): Promise<void> {
  titre("1. Tables et colonnes");

  const { rows } = await client.query<{ table_name: string; column_name: string; udt_name: string }>(
    `select table_name, column_name, udt_name
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`,
  );
  const parTable = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!parTable.has(r.table_name)) parTable.set(r.table_name, new Map());
    parTable.get(r.table_name)!.set(r.column_name, r.udt_name);
  }

  for (const [table, attendues] of Object.entries(COLONNES_ATTENDUES)) {
    const presentes = parTable.get(table);
    if (!presentes) {
      noter("1", false, `table ${table}`, "absente");
      continue;
    }
    const manquantes = attendues.filter((c) => !presentes.has(c));
    const enTrop = [...presentes.keys()].filter((c) => !attendues.includes(c));
    const ok = manquantes.length === 0 && enTrop.length === 0;
    const detail = ok
      ? `${attendues.length} colonnes`
      : [
          manquantes.length ? `manquantes : ${manquantes.join(", ")}` : "",
          enTrop.length ? `en trop : ${enTrop.join(", ")}` : "",
        ].filter(Boolean).join(" ; ");
    noter("1", ok, `table ${table}`, detail);
  }

  const tablesEnTrop = [...parTable.keys()].filter((t) => !(t in COLONNES_ATTENDUES));
  noter("1", tablesEnTrop.length === 0, "aucune table inattendue dans public", tablesEnTrop.join(", ") || undefined);

  for (const [table, colonne, udt] of TYPES_ATTENDUS) {
    const reel = parTable.get(table)?.get(colonne);
    noter("1", reel === udt, `${table}.${colonne} est de type ${udt}`, reel && reel !== udt ? `trouvé ${reel}` : undefined);
  }

  const fonctions = await client.query<{ proname: string; args: string; res: string }>(
    `select p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as res
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('prochain_numero', 'creer_facture')`,
  );
  const pn = fonctions.rows.find((f) => f.proname === "prochain_numero");
  noter("1", pn?.args === "p_prefixe text, p_annee integer", "prochain_numero(p_prefixe text, p_annee integer)", pn?.args);
  noter("1", pn?.res === "text", "prochain_numero renvoie text", pn?.res);
  const cf = fonctions.rows.find((f) => f.proname === "creer_facture");
  noter("1", cf?.res === "factures", "creer_facture renvoie une ligne factures", cf?.res);

  const triggers = await client.query<{ tgname: string }>(
    `select tgname from pg_trigger where not tgisinternal`,
  );
  const noms = triggers.rows.map((t) => t.tgname);
  noter("1", noms.includes("signatures_immuables"), "trigger signatures_immuables présent");
  noter("1", noms.includes("reservations_set_updated_at"), "trigger reservations_set_updated_at présent");
  noter("1", noms.includes("paiements_set_updated_at"), "trigger paiements_set_updated_at présent");
  noter("1", noms.includes("textes_accord_immuables"), "trigger textes_accord_immuables présent");

  const index = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes where schemaname = 'public'`,
  );
  const idx = index.rows.map((i) => i.indexname);
  for (const nom of [
    "documents_resa_type_uidx",
    "documents_token_uidx",
    "signatures_document_id_uidx",
    "disponibilites_gite_date_uidx",
    "paiements_reference_externe_uidx",
  ]) {
    noter("1", idx.includes(nom), `index unique ${nom} présent`);
  }
  noter("1", idx.includes("disponibilites_reservation_id_idx"), "index disponibilites_reservation_id_idx présent");

  const exclusion = await client.query<{ contype: string }>(
    `select contype from pg_constraint where conname = 'periodes_sans_chevauchement'`,
  );
  noter("1", exclusion.rows[0]?.contype === "x", "contrainte d'exclusion periodes_sans_chevauchement présente");

  const lignesReglages = await client.query<{ id: number; nuits_minimum: number; jours_arrivee: number[] }>(
    `select id, nuits_minimum, jours_arrivee from reglages`,
  );
  noter(
    "1",
    lignesReglages.rows.length === 1 && lignesReglages.rows[0].id === 1,
    "reglages : une seule ligne, id = 1 (créée par la migration 0003)",
    `${lignesReglages.rows.length} ligne(s)`,
  );

  // Aucune ligne « libre » ne survit à la migration 0004 : une nuit sans ligne est libre.
  const libres = await client.query<{ n: number }>(
    `select count(*)::int as n from disponibilites where statut not in ('verrou', 'reserve', 'bloque')`,
  );
  noter("1", libres.rows[0].n === 0, "disponibilites : aucune ligne hors des trois états", `${libres.rows[0].n} ligne(s)`);

  // Le tunnel ne s'ouvre pas sans texte d'accord pour la carte, dans chaque langue.
  const accords = await client.query<{ langue: string }>(
    `select distinct langue from textes_accord where objet = 'carte' and en_vigueur_depuis <= current_date order by langue`,
  );
  noter(
    "1",
    accords.rows.map((r) => r.langue).join(",") === "en,fr",
    "texte d'accord pour la carte en vigueur, en français et en anglais",
    accords.rows.map((r) => r.langue).join(", ") || "aucun",
  );
}

// ─── 2. Seed des gîtes ───────────────────────────────────────────────────────

async function verifierGites(client: PoolClient): Promise<string | null> {
  titre("2. Gîtes (seed)");
  const { rows } = await client.query<{ id: string; ref_gdf: string; slug: string; nom: string }>(
    `select id, ref_gdf, slug, nom from gites order by ref_gdf`,
  );
  noter("2", rows.length === 3, "3 gîtes en base", `${rows.length} ligne(s)`);
  const refs = rows.map((g) => g.ref_gdf);
  for (const [ref, slug] of [["07G310700", "armu"], ["07G310701", "laphine"], ["07G310702", "maison-vieille"]]) {
    const g = rows.find((x) => x.ref_gdf === ref);
    noter("2", g !== undefined && g.slug === slug, `ref_gdf ${ref} présent, slug ${slug}`, g ? g.nom : "absent");
  }
  noter("2", refs.length === new Set(refs).size, "aucun doublon de ref_gdf");
  return rows.find((g) => g.ref_gdf === "07G310700")?.id ?? rows[0]?.id ?? null;
}

// ─── 3 à 6. Fonctions, triggers, index (transaction annulée) ────────────────

/** Photographie des compteurs (« CTR/2026=2, FAC/2026=4 »), comparable avant / après ROLLBACK. */
async function lireCompteurs(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ serie: string; annee: number; dernier_numero: number }>(
    `select serie, annee, dernier_numero from compteurs_documents order by serie, annee`,
  );
  return rows.map((r) => `${r.serie}/${r.annee}=${r.dernier_numero}`).join(", ");
}

async function compteur(client: PoolClient, serie: string, annee: number): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select coalesce((select dernier_numero from compteurs_documents where serie = $1 and annee = $2), 0)::int as n`,
    [serie, annee],
  );
  return rows[0].n;
}

async function attendreErreur(
  client: PoolClient,
  savepoint: string,
  requete: string,
  params: unknown[],
): Promise<{ erreur: unknown | null }> {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(requete, params);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return { erreur: null };
  } catch (erreur) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return { erreur };
  }
}

async function verifierEnTransaction(client: PoolClient, giteIdSeed: string | null): Promise<void> {
  const anneeParis = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(new Date()),
  );

  // État des compteurs AVANT la transaction : après le ROLLBACK ils doivent
  // être strictement identiques (aucun numéro consommé par les tests), que la
  // base soit vide ou déjà en service.
  const cptAvant = await lireCompteurs(client);

  await client.query("BEGIN");
  try {
    // ── 3. prochain_numero ─────────────────────────────────────────────────
    titre("3. prochain_numero('CTR', 2026)");
    const ctr0 = await compteur(client, "CTR", 2026);
    const r1 = await client.query<{ numero: unknown }>(`select prochain_numero('CTR', 2026) as numero`);
    const v1 = r1.rows[0].numero;
    noter("3", typeof v1 === "string", "renvoie une chaîne", `typeof ${typeof v1}`);
    noter("3", v1 === `CTR-2026-${pad3(ctr0 + 1)}`, `premier appel = 'CTR-2026-${pad3(ctr0 + 1)}'`, String(v1));
    const r2 = await client.query<{ numero: unknown }>(`select prochain_numero('CTR', 2026) as numero`);
    noter("3", r2.rows[0].numero === `CTR-2026-${pad3(ctr0 + 2)}`, `second appel = 'CTR-2026-${pad3(ctr0 + 2)}'`, String(r2.rows[0].numero));
    if (ctr0 !== 0) {
      console.log(`       note : le compteur CTR/2026 valait déjà ${ctr0} avant le test (base après mise en service).`);
    }

    // Réservation de test (annulée par le ROLLBACK final).
    let giteId = giteIdSeed;
    if (!giteId) {
      const g = await client.query<{ id: string }>(
        `insert into gites (nom, ref_gdf, slug, adresse, capacite_max, forfait_menage, caution)
         values ('Gîte de test', 'TEST-VERIFY', 'test-verify', 'test', 2, 80, 500) returning id`,
      );
      giteId = g.rows[0].id;
    }
    const reference = `VERIFY-${randomBytes(4).toString("hex")}`;
    const resa = await client.query<{ id: string; created_at: Date }>(
      `insert into reservations (gite_id, reference, statut, date_arrivee, date_depart,
                                 client_nom, client_prenom, client_email, nb_adultes, prix_location,
                                 taux_acompte, delai_solde_jours)
       values ($1, $2, 'confirmee', '2026-10-03', '2026-10-10', 'VERIFICATION', 'Test',
               'verify@example.invalid', 2, 450, 30, 30)
       returning id, created_at`,
      [giteId, reference],
    );
    const resaId = resa.rows[0].id;

    // ── 4. creer_facture ───────────────────────────────────────────────────
    titre("4. creer_facture");
    const fac0 = await compteur(client, "FAC", anneeParis);
    // date_emission est lue en texte SQL : node-postgres convertit les colonnes
    // `date` en Date JS à minuit local, ce qui décale le jour affiché.
    const f1 = await client.query<{
      id: string; numero: string; type: string; reservation_id: string;
      facture_acompte_id: string | null; montant_ttc: string; date_emission_texte: string;
      pdf_url: string | null; donnees: Record<string, unknown>;
    }>(
      `select f.*, f.date_emission::text as date_emission_texte
         from creer_facture($1, 'acompte', 123.45, $2::jsonb) as f`,
      [resaId, JSON.stringify({ test: true, source: "db/verify.ts" })],
    );
    const acompte = f1.rows[0];
    // Date civile du jour à Paris, au format yyyy-mm-dd.
    const dateParis = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    noter("4", /^FAC-\d{4}-\d{3}$/.test(acompte.numero), "numéro au format FAC-AAAA-NNN", acompte.numero);
    noter("4", acompte.numero === `FAC-${anneeParis}-${pad3(fac0 + 1)}`, `numéro = 'FAC-${anneeParis}-${pad3(fac0 + 1)}'`, acompte.numero);
    noter("4", acompte.type === "acompte" && acompte.reservation_id === resaId, "type et reservation_id repris");
    // montant_ttc arrive en TEXTE ("123.45") : comparaison exacte en centimes,
    // par la fonction de frontière (jamais Number() sur un montant).
    noter("4", centimesDepuisNumeric(acompte.montant_ttc) === 12345, "montant_ttc = 123.45 (12345 centimes)", String(acompte.montant_ttc));
    noter("4", acompte.pdf_url === null, "pdf_url NULL tant que le PDF n'est pas rendu");
    noter("4", acompte.donnees?.test === true, "donnees jsonb conservées");
    noter("4", acompte.date_emission_texte === dateParis, `date_emission = date du jour à Paris (${dateParis})`, acompte.date_emission_texte);

    const f2 = await client.query<{ numero: string; facture_acompte_id: string | null }>(
      `select numero, facture_acompte_id from creer_facture($1, 'solde', 300, '{}'::jsonb, $2)`,
      [resaId, acompte.id],
    );
    noter("4", f2.rows[0].numero === `FAC-${anneeParis}-${pad3(fac0 + 2)}`, `facture de solde = 'FAC-${anneeParis}-${pad3(fac0 + 2)}'`, f2.rows[0].numero);
    noter("4", f2.rows[0].facture_acompte_id === acompte.id, "facture de solde liée à l'acompte");

    const typeInvalide = await attendreErreur(
      client, "sp_type",
      `select creer_facture($1, 'avoir', 1, '{}'::jsonb)`, [resaId],
    );
    noter("4", codePg(typeInvalide.erreur) === "23514", "type hors (acompte|solde) refusé par le CHECK", codePg(typeInvalide.erreur));
    const facApres = await compteur(client, "FAC", anneeParis);
    noter("4", facApres === fac0 + 2, "un appel refusé ne consomme pas de numéro", `compteur ${facApres}`);

    // ── 5. Immutabilité des signatures ─────────────────────────────────────
    titre("5. signatures : immutabilité");
    const doc = await client.query<{ id: string }>(
      `insert into documents (reservation_id, type, numero, url_pdf, statut, token, token_expire_at, template_version)
       values ($1, 'contrat_location', 'CTR-TEST-001', $2, 'genere', $3, now() + interval '30 days', 'v1')
       returning id`,
      [resaId, `contrats/${resaId}/CTR-TEST-001.pdf`, `tok_${randomBytes(12).toString("base64url")}`],
    );
    const docId = doc.rows[0].id;
    const sig = await client.query<{ id: string; signe_at: Date }>(
      `insert into signatures (reservation_id, document_id, signataire_nom, signataire_email, token,
                               consentement_texte, document_hash, document_storage_path, ip_signataire, user_agent)
       values ($1, $2, 'Test VERIFICATION', 'verify@example.invalid', 'tok_test', 'Je reconnais avoir lu...',
               repeat('a', 64), $3, '203.0.113.7', 'db/verify.ts')
       returning id, signe_at`,
      [resaId, docId, `contrats/${resaId}/CTR-TEST-001.pdf`],
    );
    const sigId = sig.rows[0].id;
    noter("5", sig.rows[0].signe_at instanceof Date, "signe_at renseigné par défaut");

    const maj = await attendreErreur(
      client, "sp_sig_upd",
      `update signatures set signataire_nom = 'Modifié' where id = $1`, [sigId],
    );
    noter("5", maj.erreur !== null && /immuable/i.test(messageErreur(maj.erreur)), "UPDATE refusé par le trigger", maj.erreur ? messageErreur(maj.erreur).split("\n")[0] : "aucune erreur");

    const suppr = await attendreErreur(
      client, "sp_sig_del",
      `delete from signatures where id = $1`, [sigId],
    );
    noter("5", suppr.erreur !== null && /immuable/i.test(messageErreur(suppr.erreur)), "DELETE refusé par le trigger", suppr.erreur ? messageErreur(suppr.erreur).split("\n")[0] : "aucune erreur");

    const doublonSig = await attendreErreur(
      client, "sp_sig_dup",
      `insert into signatures (reservation_id, document_id, signataire_nom, token, consentement_texte,
                               document_hash, document_storage_path, user_agent)
       values ($1, $2, 'Doublon', 'tok_test', 'x', repeat('b', 64), 'x', 'x')`,
      [resaId, docId],
    );
    noter("5", codePg(doublonSig.erreur) === "23505", "seconde signature du même document refusée (index unique)", codePg(doublonSig.erreur));

    const ipTexte = await attendreErreur(
      client, "sp_sig_ip",
      `select 'inconnue'::inet`, [],
    );
    noter("5", codePg(ipTexte.erreur) === "22P02", "rappel Phase 1 : 'inconnue' est rejeté par le type inet, écrire NULL", codePg(ipTexte.erreur));

    const majResa = await client.query<{ a_jour: boolean }>(
      `update reservations set client_ville = 'Savas' where id = $1 returning (updated_at = now()) as a_jour`,
      [resaId],
    );
    noter("5", majResa.rows[0].a_jour === true, "trigger updated_at : reservations.updated_at mis à jour");

    // ── 6. Index unique documents ──────────────────────────────────────────
    titre("6. documents : index unique (reservation_id, type)");
    const doublonDoc = await attendreErreur(
      client, "sp_doc_dup",
      `insert into documents (reservation_id, type, numero, url_pdf)
       values ($1, 'contrat_location', 'CTR-TEST-002', 'contrats/x/CTR-TEST-002.pdf')`,
      [resaId],
    );
    noter("6", codePg(doublonDoc.erreur) === "23505", "second contrat pour la même réservation refusé", codePg(doublonDoc.erreur));

    const factureSansToken = await attendreErreur(
      client, "sp_doc_fac",
      `insert into documents (reservation_id, type, numero, url_pdf, statut)
       values ($1, 'facture_acompte', $2, $3, 'genere')`,
      [resaId, acompte.numero, `factures/${acompte.numero}.pdf`],
    );
    noter("6", factureSansToken.erreur === null, "document de facture sans token accepté (token nullable)", factureSansToken.erreur ? messageErreur(factureSansToken.erreur) : undefined);

    const tokenDouble = await attendreErreur(
      client, "sp_doc_tok",
      `insert into documents (reservation_id, type, numero, url_pdf, token)
       select reservation_id, 'facture_solde', 'X', 'x', token from documents where id = $1`,
      [docId],
    );
    noter("6", codePg(tokenDouble.erreur) === "23505", "token réutilisé refusé (index unique partiel)", codePg(tokenDouble.erreur));

    // ── 6b. Tarification : contraintes ──────────────────────────────────────
    titre("6b. Tarification : contraintes de la base");
    const bareme = await client.query<{ id: string }>(
      `insert into baremes (nom) values ($1) returning id`,
      [`VERIFY-bareme-${randomBytes(3).toString("hex")}`],
    );
    const baremeId = bareme.rows[0].id;
    const coefNul = await attendreErreur(
      client, "sp_coef_nul",
      `insert into baremes_coefficients (bareme_id, rang, coefficient) values ($1, 1, 0)`, [baremeId],
    );
    noter("6b", codePg(coefNul.erreur) === "23514", "coefficient nul refusé", codePg(coefNul.erreur));
    const rangNul = await attendreErreur(
      client, "sp_rang_nul",
      `insert into baremes_coefficients (bareme_id, rang, coefficient) values ($1, 0, 1)`, [baremeId],
    );
    noter("6b", codePg(rangNul.erreur) === "23514", "rang 0 refusé (le premier rang est 1)", codePg(rangNul.erreur));

    const tarif = await client.query<{ id: string }>(
      `insert into tarifs (nom) values ($1) returning id`,
      [`VERIFY-tarif-${randomBytes(3).toString("hex")}`],
    );
    const tarifId = tarif.rows[0].id;
    const jourHuit = await attendreErreur(
      client, "sp_jour_8",
      `update tarifs set jours_arrivee = '{6,8}' where id = $1`, [tarifId],
    );
    noter("6b", codePg(jourHuit.erreur) === "23514", "jour d'arrivée 8 refusé (jours ISO 1 à 7)", codePg(jourHuit.erreur));
    const joursVides = await attendreErreur(
      client, "sp_jours_vides",
      `update tarifs set jours_depart = '{}' where id = $1`, [tarifId],
    );
    noter("6b", codePg(joursVides.erreur) === "23514", "liste de jours vide refusée", codePg(joursVides.erreur));

    if (giteId) {
      const prixNul = await attendreErreur(
        client, "sp_prix_nul",
        `insert into tarifs_prix (tarif_id, gite_id, prix_nuit) values ($1, $2, 0)`, [tarifId, giteId],
      );
      noter("6b", codePg(prixNul.erreur) === "23514", "prix de nuit nul refusé", codePg(prixNul.erreur));
    }

    // Dates en 2099 : aucune période réelle n'y existe.
    await client.query(
      `insert into periodes (tarif_id, date_debut, date_fin) values ($1, '2099-01-03', '2099-01-10')`,
      [tarifId],
    );
    const chevauche = await attendreErreur(
      client, "sp_chevauche",
      `insert into periodes (tarif_id, date_debut, date_fin) values ($1, '2099-01-08', '2099-01-15')`, [tarifId],
    );
    noter("6b", codePg(chevauche.erreur) === "23P01", "période qui chevauche une autre refusée (exclusion)", codePg(chevauche.erreur));
    const contigue = await attendreErreur(
      client, "sp_contigue",
      `insert into periodes (tarif_id, date_debut, date_fin) values ($1, '2099-01-10', '2099-01-17')`, [tarifId],
    );
    noter("6b", contigue.erreur === null, "période contiguë acceptée (la fin de l'une est le début de l'autre)", contigue.erreur ? messageErreur(contigue.erreur) : undefined);
    const inversee = await attendreErreur(
      client, "sp_inversee",
      `insert into periodes (tarif_id, date_debut, date_fin) values ($1, '2099-02-10', '2099-02-10')`, [tarifId],
    );
    noter("6b", codePg(inversee.erreur) === "23514", "période sans nuit (fin = début) refusée", codePg(inversee.erreur));
    const tarifUtilise = await attendreErreur(
      client, "sp_tarif_utilise",
      `delete from tarifs where id = $1`, [tarifId],
    );
    noter("6b", codePg(tarifUtilise.erreur) === "23503", "tarif utilisé par une période : suppression refusée", codePg(tarifUtilise.erreur));

    const secondeLigne = await attendreErreur(
      client, "sp_reglages_2",
      `insert into reglages (id) values (2)`, [],
    );
    noter("6b", codePg(secondeLigne.erreur) === "23514", "reglages : seconde ligne refusée", codePg(secondeLigne.erreur));

    if (giteId) {
      const sansTaux = await attendreErreur(
        client, "sp_taxe_sans_taux",
        `insert into taxes_sejour (gite_id, date_debut, mode, plafond) values ($1, '2099-01-01', 'proportionnel', 4.40)`,
        [giteId],
      );
      noter("6b", codePg(sansTaux.erreur) === "23514", "taxe proportionnelle sans taux refusée", codePg(sansTaux.erreur));
      const modeInconnu = await attendreErreur(
        client, "sp_taxe_mode",
        `insert into taxes_sejour (gite_id, date_debut, mode, tarif_fixe) values ($1, '2099-01-01', 'forfait', 1)`,
        [giteId],
      );
      noter("6b", codePg(modeInconnu.erreur) === "23514", "mode de taxe inconnu refusé", codePg(modeInconnu.erreur));
    }

    // ── 6c. Tunnel : réglages et calendrier ─────────────────────────────────
    titre("6c. Tunnel : réglages et calendrier");
    const blocageNul = await attendreErreur(
      client, "sp_blocage_nul", `update reglages set duree_blocage_minutes = 0 where id = 1`, [],
    );
    noter("6c", codePg(blocageNul.erreur) === "23514", "durée de blocage nulle refusée", codePg(blocageNul.erreur));
    const heures = await attendreErreur(
      client, "sp_heures", `update reglages set heure_limite_arrivee = '17:00' where id = 1`, [],
    );
    noter("6c", codePg(heures.erreur) === "23514", "heure limite d'arrivée avant l'heure d'arrivée refusée", codePg(heures.erreur));
    const bebes = await attendreErreur(
      client, "sp_bebes", `update reglages set bebes_hors_capacite = -1 where id = 1`, [],
    );
    noter("6c", codePg(bebes.erreur) === "23514", "nombre de bébés hors capacité négatif refusé", codePg(bebes.erreur));

    if (giteId) {
      // Dates en 2099 : aucune nuit réelle n'y est prise.
      const libre = await attendreErreur(
        client, "sp_libre",
        `insert into disponibilites (gite_id, date, statut) values ($1, '2099-05-01', 'libre')`, [giteId],
      );
      noter("6c", codePg(libre.erreur) === "23514", "état « libre » refusé (une nuit sans ligne est libre)", codePg(libre.erreur));
      const sansEcheance = await attendreErreur(
        client, "sp_verrou_sans_echeance",
        `insert into disponibilites (gite_id, date, statut, reservation_id) values ($1, '2099-05-01', 'verrou', $2)`,
        [giteId, resaId],
      );
      noter("6c", codePg(sansEcheance.erreur) === "23514", "verrou sans échéance refusé", codePg(sansEcheance.erreur));
      const sansReservation = await attendreErreur(
        client, "sp_verrou_sans_resa",
        `insert into disponibilites (gite_id, date, statut, verrou_expire_at) values ($1, '2099-05-01', 'verrou', now())`,
        [giteId],
      );
      noter("6c", codePg(sansReservation.erreur) === "23514", "verrou sans réservation refusé", codePg(sansReservation.erreur));
      const venduSansResa = await attendreErreur(
        client, "sp_reserve_sans_resa",
        `insert into disponibilites (gite_id, date, statut) values ($1, '2099-05-01', 'reserve')`, [giteId],
      );
      noter("6c", codePg(venduSansResa.erreur) === "23514", "nuit vendue en direct sans réservation refusée", codePg(venduSansResa.erreur));
      const fermee = await attendreErreur(
        client, "sp_bloque",
        `insert into disponibilites (gite_id, date, statut) values ($1, '2099-05-02', 'bloque')`, [giteId],
      );
      noter("6c", fermee.erreur === null, "nuit fermée par les propriétaires acceptée sans réservation", fermee.erreur ? messageErreur(fermee.erreur) : undefined);
      const doublon = await attendreErreur(
        client, "sp_nuit_double",
        `insert into disponibilites (gite_id, date, statut, reservation_id, verrou_expire_at)
         values ($1, '2099-05-02', 'verrou', $2, now() + interval '20 minutes')`,
        [giteId, resaId],
      );
      noter("6c", codePg(doublon.erreur) === "23505", "seconde ligne pour la même nuit refusée (index unique)", codePg(doublon.erreur));
    }

    // ── 6d. Paiement : conditions figées, choix du client, texte d'accord ──
    titre("6d. Paiement : conditions, choix, texte d'accord");
    const tauxNul = await attendreErreur(
      client, "sp_taux_nul", `update reglages set taux_acompte = 0 where id = 1`, [],
    );
    noter("6d", codePg(tauxNul.erreur) === "23514", "taux d'acompte de 0 % refusé", codePg(tauxNul.erreur));
    if (giteId) {
      const sansConditions = await attendreErreur(
        client, "sp_sans_conditions",
        `insert into reservations (gite_id, reference, statut, date_arrivee, date_depart)
         values ($1, 'VERIFY-SANS-CONDITIONS', 'brouillon', '2099-06-01', '2099-06-08')`, [giteId],
      );
      noter("6d", codePg(sansConditions.erreur) === "23502", "réservation sans taux d'acompte ni délai du solde refusée (aucune valeur par défaut)", codePg(sansConditions.erreur));
    }
    const prelevementCheque = await attendreErreur(
      client, "sp_prelevement_cheque",
      `update reservations set moyen_caution = 'cheque', mode_solde = 'prelevement' where id = $1`, [resaId],
    );
    noter("6d", codePg(prelevementCheque.erreur) === "23514", "prélèvement du solde avec une caution par chèque refusé", codePg(prelevementCheque.erreur));
    const soldeIntegral = await attendreErreur(
      client, "sp_solde_integral",
      `update reservations set moyen_caution = 'carte', mode_solde = 'lien', paiement_integral = true where id = $1`, [resaId],
    );
    noter("6d", codePg(soldeIntegral.erreur) === "23514", "règlement du solde pour un paiement intégral refusé", codePg(soldeIntegral.erreur));
    const accordSansVersion = await attendreErreur(
      client, "sp_accord_sans_version",
      `update reservations set accord_carte_texte = 'texte' where id = $1`, [resaId],
    );
    noter("6d", codePg(accordSansVersion.erreur) === "23514", "texte d'accord sans sa version refusé", codePg(accordSansVersion.erreur));
    const statutPaiement = await attendreErreur(
      client, "sp_statut_paiement",
      `insert into paiements (reservation_id, type, montant, statut) values ($1, 'acompte', 10, 'inconnu')`, [resaId],
    );
    noter("6d", codePg(statutPaiement.erreur) === "23514", "statut de paiement inconnu refusé", codePg(statutPaiement.erreur));
    const sansMotif = await attendreErreur(
      client, "sp_sans_motif",
      `insert into paiements (reservation_id, type, montant, statut) values ($1, 'total', 10, 'a_rembourser')`, [resaId],
    );
    noter("6d", codePg(sansMotif.erreur) === "23514", "remboursement sans motif refusé", codePg(sansMotif.erreur));
    const doublonPaiement = await attendreErreur(
      client, "sp_doublon_paiement",
      `insert into paiements (reservation_id, type, montant, statut, reference_externe)
       values ($1, 'acompte', 10, 'en_attente', 'pi_verify'), ($1, 'acompte', 10, 'en_attente', 'pi_verify')`, [resaId],
    );
    noter("6d", codePg(doublonPaiement.erreur) === "23505", "même paiement du prestataire enregistré deux fois refusé", codePg(doublonPaiement.erreur));
    const majAccord = await attendreErreur(
      client, "sp_maj_accord", `update textes_accord set modele = modele || ' ' where objet = 'carte'`, [],
    );
    noter("6d", majAccord.erreur !== null && /immuable/i.test(messageErreur(majAccord.erreur)), "texte d'accord : modification refusée par le trigger", majAccord.erreur ? messageErreur(majAccord.erreur).split("\n")[0] : "aucune erreur");
    const supprAccord = await attendreErreur(
      client, "sp_suppr_accord", `delete from textes_accord where objet = 'carte'`, [],
    );
    noter("6d", supprAccord.erreur !== null && /immuable/i.test(messageErreur(supprAccord.erreur)), "texte d'accord : suppression refusée par le trigger", supprAccord.erreur ? messageErreur(supprAccord.erreur).split("\n")[0] : "aucune erreur");
  } finally {
    await client.query("ROLLBACK");
  }

  // ── Après ROLLBACK : rien ne doit subsister ────────────────────────────────
  titre("Après ROLLBACK");
  const cptApres = await lireCompteurs(client);
  noter("R", cptApres === cptAvant, "compteurs_documents inchangés : aucun numéro de test consommé", `avant ${cptAvant || "(vide)"} ; après ${cptApres || "(vide)"}`);
  const restes = await client.query<{ resas: number; docs: number; facs: number; sigs: number }>(
    `select (select count(*) from reservations where reference like 'VERIFY-%')::int as resas,
            (select count(*) from documents where numero like 'CTR-TEST-%')::int as docs,
            (select count(*) from factures)::int as facs,
            (select count(*) from signatures)::int as sigs`,
  );
  const r = restes.rows[0];
  noter("R", r.resas === 0 && r.docs === 0, "aucune ligne de test restante", `réservations ${r.resas}, documents ${r.docs}, factures ${r.facs}, signatures ${r.sigs}`);
  const restesTarifs = await client.query<{ n: number }>(
    `select ((select count(*) from tarifs where nom like 'VERIFY-%')
           + (select count(*) from baremes where nom like 'VERIFY-%')
           + (select count(*) from periodes where date_debut >= '2099-01-01')
           + (select count(*) from disponibilites where date >= '2099-01-01'))::int as n`,
  );
  noter("R", restesTarifs.rows[0].n === 0, "aucun tarif, barème, période ni nuit de test restant", `${restesTarifs.rows[0].n} ligne(s)`);
}

// ─── 7. Stockage ─────────────────────────────────────────────────────────────

async function appelerRoute(url: string): Promise<Response> {
  const u = new URL(url, "http://verify.local");
  const segments = u.pathname.replace(/^\/api\/documents\//, "").split("/").map(decodeURIComponent);
  return documentsGET(new Request(u), { params: Promise.resolve({ path: segments }) });
}

async function verifierStockage(): Promise<void> {
  titre("7. Stockage des PDF");
  const dossier = await mkdtemp(path.join(tmpdir(), "gites-verify-"));
  process.env.STORAGE_PATH = dossier;
  process.env.STORAGE_SIGNING_SECRET = randomBytes(32).toString("base64url");

  try {
    const storage = getStorage();
    const chemin = `contrats/${randomUUID()}/CTR-2026-001.pdf`;
    const pdf = Buffer.from(
      "%PDF-1.4\n% PDF de test - db/verify.ts\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
    );

    await storage.upload(chemin, pdf, { contentType: "application/pdf" });
    noter("7", await storage.exists(chemin), "upload puis exists = true");

    let doublon: unknown = null;
    try {
      await storage.upload(chemin, Buffer.from("autre"), { contentType: "application/pdf" });
    } catch (e) {
      doublon = e;
    }
    noter("7", isStorageError(doublon, "EXISTE_DEJA"), "second upload sans overwrite refusé (EXISTE_DEJA)");
    noter("7", (await storage.read(chemin)).equals(pdf), "read renvoie les octets exacts");

    const url = await storage.getSignedUrl(chemin, 600);
    noter("7", url.startsWith("/api/documents/contrats/") && url.includes("token=") && url.includes("expires="), "URL signée de la forme /api/documents/{chemin}?token=...&expires=...", url.slice(0, 60) + "…");

    const ok = await appelerRoute(url);
    const corps = Buffer.from(await ok.arrayBuffer());
    noter("7", ok.status === 200, "URL valide → 200", `status ${ok.status}`);
    noter("7", ok.headers.get("content-type") === "application/pdf", "Content-Type application/pdf", ok.headers.get("content-type") ?? "absent");
    noter("7", corps.equals(pdf), "corps de la réponse = PDF stocké", `${corps.length} octets`);

    const falsifiee = new URL(url, "http://verify.local");
    const token = falsifiee.searchParams.get("token") ?? "";
    falsifiee.searchParams.set("token", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"));
    const resFalsifiee = await appelerRoute(falsifiee.pathname + falsifiee.search);
    noter("7", resFalsifiee.status === 403, "token falsifié → 403", `status ${resFalsifiee.status}`);

    const expiresPasse = Math.floor(Date.now() / 1000) - 60;
    const urlExpiree = construireUrlSignee(chemin, expiresPasse, signerChemin(chemin, expiresPasse));
    const resExpiree = await appelerRoute(urlExpiree);
    noter("7", resExpiree.status === 403, "URL expirée (signature pourtant valide) → 403", `status ${resExpiree.status}`);

    const resSansToken = await appelerRoute(url.split("?")[0]);
    noter("7", resSansToken.status === 403, "URL sans token → 403", `status ${resSansToken.status}`);

    const resTraversee = await documentsGET(
      new Request("http://verify.local/api/documents/..%2F..%2Fetc%2Fpasswd?token=x&expires=9999999999"),
      { params: Promise.resolve({ path: ["..", "..", "etc", "passwd"] }) },
    );
    noter("7", resTraversee.status === 400, "chemin contenant '..' → 400 (refusé avant toute lecture)", `status ${resTraversee.status}`);

    let traversee: unknown = null;
    try {
      validerChemin("contrats/../../etc/passwd");
    } catch (e) {
      traversee = e;
    }
    noter("7", isStorageError(traversee, "CHEMIN_INVALIDE"), "validerChemin refuse '..' côté stockage");

    let antislash: unknown = null;
    try {
      validerChemin("contrats\\x\\y.pdf");
    } catch (e) {
      antislash = e;
    }
    noter("7", isStorageError(antislash, "CHEMIN_INVALIDE"), "validerChemin refuse l'antislash");

    await storage.delete(chemin);
    noter("7", !(await storage.exists(chemin)), "delete puis exists = false");
    const resAbsent = await appelerRoute(url);
    noter("7", resAbsent.status === 404, "fichier supprimé → 404", `status ${resAbsent.status}`);
    await storage.delete(chemin);
    noter("7", true, "delete d'un fichier absent : sans erreur");
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

// ─── Programme ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Vérification Phase 0 — Les Gîtes de Samoyas");
  const pool = getPool();
  const client = await pool.connect();
  try {
    const version = await client.query<{ v: string }>("select version() as v");
    console.log(`Base : ${version.rows[0].v.split(" on ")[0]}`);
    await verifierSchema(client);
    const giteId = await verifierGites(client);
    await verifierEnTransaction(client, giteId);
  } finally {
    client.release();
  }
  await verifierStockage();

  console.log(`\n${nbControles} contrôle(s), ${nbEchecs} échec(s).`);
  if (nbEchecs > 0) process.exitCode = 1;
}

main()
  .catch((erreur: unknown) => {
    console.error("\nÉchec de la vérification :");
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
