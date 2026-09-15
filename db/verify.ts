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
    "date_paiement", "created_at",
  ],
  disponibilites: [
    "id", "gite_id", "date", "statut", "source", "reservation_id", "verrou_expire_at", "created_at",
  ],
  avis: ["id", "gite_id", "source", "note", "commentaire", "auteur", "date_sejour", "publie", "created_at"],
  audit_logs: ["id", "table_cible", "ligne_id", "action", "acteur", "details", "created_at"],
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

  const index = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes where schemaname = 'public'`,
  );
  const idx = index.rows.map((i) => i.indexname);
  for (const nom of [
    "documents_resa_type_uidx",
    "documents_token_uidx",
    "signatures_document_id_uidx",
    "disponibilites_gite_date_uidx",
  ]) {
    noter("1", idx.includes(nom), `index unique ${nom} présent`);
  }
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
                                 client_nom, client_prenom, client_email, nb_adultes, prix_location)
       values ($1, $2, 'confirmee', '2026-10-03', '2026-10-10', 'VERIFICATION', 'Test',
               'verify@example.invalid', 2, 450)
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
