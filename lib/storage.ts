/**
 * Stockage des PDF (contrats, factures) : interface abstraite + implémentation disque.
 *
 * POURQUOI UNE ABSTRACTION
 *   Les routes ne connaissent que l'interface StorageProvider. Si le stockage
 *   change un jour (stockage objet S3/R2, autre disque...), seul CE fichier
 *   bouge : aucune route n'est touchée.
 *
 * PRODUCTION (Coolify) : À LIRE AVANT DE DÉPLOYER
 *   STORAGE_PATH doit pointer vers un VOLUME PERSISTANT monté par Coolify
 *   (défaut : /data/documents). Les conteneurs Docker sont recréés à chaque
 *   déploiement : tout fichier écrit HORS de ce volume est PERDU. Le site et le
 *   module de contrat doivent monter le MÊME volume pour voir les mêmes PDF.
 *   En développement, .env.local pointe vers ./.data/documents (ignoré par git).
 *
 * CONVENTIONS DE CHEMIN (le module de contrat les construit : ne pas changer)
 *   contrats/{reservation_id}/{numero}.pdf         contrat non signé
 *   contrats/{reservation_id}/{numero}-signe.pdf   contrat signé
 *   factures/{numero}.pdf                          facture
 *
 * ÉCRITURE ATOMIQUE
 *   Le contenu est écrit dans un fichier temporaire du même dossier, synchronisé
 *   sur disque, puis publié en une seule opération : lien dur exclusif (refuse
 *   d'écraser) ou renommage (écrasement autorisé). Ces opérations sont
 *   instantanées : un plantage en cours d'écriture ne laisse jamais un PDF à
 *   moitié écrit qui serait ensuite servi à un client.
 *
 * ACCÈS AUX FICHIERS
 *   Les fichiers ne sont JAMAIS servis directement par le serveur web.
 *   getSignedUrl() renvoie /api/documents/{chemin}?token=...&expires=... : le
 *   jeton est un HMAC-SHA256 (clé STORAGE_SIGNING_SECRET) sur chemin + date
 *   d'expiration, vérifié par app/api/documents/[...path]/route.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, link, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const STORAGE_PATH_DEFAUT = "/data/documents";
/** Durée de validité par défaut d'une URL signée : 1 heure. */
export const SIGNED_URL_TTL_DEFAUT = 60 * 60;
/** Préfixe de la route qui sert les documents (app/api/documents/[...path]). */
export const DOCUMENTS_ROUTE_BASE = "/api/documents";

// ─── Erreurs ──────────────────────────────────────────────────────────────────

export type StorageErrorCode =
  | "CHEMIN_INVALIDE"
  | "EXISTE_DEJA"
  | "INTROUVABLE"
  | "CONFIGURATION";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export function isStorageError(erreur: unknown, code?: StorageErrorCode): erreur is StorageError {
  return erreur instanceof StorageError && (code === undefined || erreur.code === code);
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface UploadOptions {
  /** Type MIME déclaré. Informatif pour le disque, utile pour un stockage objet. */
  contentType?: string;
  /** false (défaut) : refuse d'écraser un fichier existant (erreur EXISTE_DEJA). */
  overwrite?: boolean;
}

export interface StorageProvider {
  /** Écrit un fichier. Crée les dossiers parents. Atomique. */
  upload(chemin: string, contenu: Uint8Array, options?: UploadOptions): Promise<void>;
  /** URL signée à durée limitée, relative au site : /api/documents/... */
  getSignedUrl(chemin: string, ttlSecondes?: number): Promise<string>;
  /** Supprime un fichier. Sans erreur si le fichier n'existe pas. */
  delete(chemin: string): Promise<void>;
  exists(chemin: string): Promise<boolean>;
  /** Contenu complet (ex. pour hacher les octets exacts d'un PDF stocké). */
  read(chemin: string): Promise<Buffer>;
  /** Flux de lecture, pour servir un fichier sans le charger en mémoire. */
  readStream(chemin: string): Promise<ReadableStream<Uint8Array>>;
}

// ─── Chemins ──────────────────────────────────────────────────────────────────

// Un segment commence par une lettre ou un chiffre, puis lettres, chiffres,
// point, tiret, souligné. Couvre les conventions (uuid, CTR-2026-001.pdf) et
// exclut d'office ".", ".." et les fichiers cachés.
const SEGMENT_VALIDE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LONGUEUR_MAX_CHEMIN = 512;

/**
 * Valide un chemin relatif de stockage et le renvoie normalisé.
 * Refuse tout chemin contenant "..", un antislash, un caractère nul, un
 * segment vide ou un segment hors du motif autorisé : c'est la protection
 * contre la traversée de répertoire (lecture de n'importe quel fichier du serveur).
 */
export function validerChemin(chemin: string): string {
  if (typeof chemin !== "string" || chemin.length === 0 || chemin.length > LONGUEUR_MAX_CHEMIN) {
    throw new StorageError("CHEMIN_INVALIDE", "Chemin de stockage vide ou trop long.");
  }
  if (chemin.includes("..") || chemin.includes("\\") || chemin.includes("\0")) {
    throw new StorageError("CHEMIN_INVALIDE", "Chemin de stockage refusé (caractères interdits).");
  }
  const segments = chemin.split("/");
  for (const segment of segments) {
    if (!SEGMENT_VALIDE.test(segment)) {
      throw new StorageError("CHEMIN_INVALIDE", `Segment de chemin refusé : "${segment}".`);
    }
  }
  return segments.join("/");
}

// ─── Signature des URL ────────────────────────────────────────────────────────

function cleSignature(): string {
  const cle = process.env.STORAGE_SIGNING_SECRET;
  if (!cle || cle.length < 16) {
    throw new StorageError(
      "CONFIGURATION",
      "STORAGE_SIGNING_SECRET manquante ou trop courte (16 caractères minimum, 32 octets aléatoires recommandés).",
    );
  }
  return cle;
}

/** Jeton HMAC-SHA256 (base64url) liant un chemin à une date d'expiration (secondes Unix). */
export function signerChemin(chemin: string, expires: number): string {
  return createHmac("sha256", cleSignature())
    .update(`${chemin}\n${expires}`)
    .digest("base64url");
}

/** Vérifie un jeton en temps constant. Ne vérifie PAS l'expiration (rôle de l'appelant). */
export function verifierSignature(chemin: string, expires: number, token: string): boolean {
  if (!Number.isSafeInteger(expires) || typeof token !== "string" || token.length === 0) {
    return false;
  }
  const attendu = Buffer.from(signerChemin(chemin, expires));
  const fourni = Buffer.from(token);
  return attendu.length === fourni.length && timingSafeEqual(attendu, fourni);
}

/** Construit l'URL relative servie par la route documents. */
export function construireUrlSignee(chemin: string, expires: number, token: string): string {
  const cheminEncode = chemin.split("/").map(encodeURIComponent).join("/");
  return `${DOCUMENTS_ROUTE_BASE}/${cheminEncode}?token=${encodeURIComponent(token)}&expires=${expires}`;
}

// ─── Implémentation disque ────────────────────────────────────────────────────

async function existeFichier(absolu: string): Promise<boolean> {
  try {
    await access(absolu);
    return true;
  } catch {
    return false;
  }
}

function codeErreur(erreur: unknown): string | undefined {
  return (erreur as NodeJS.ErrnoException | undefined)?.code;
}

// Systèmes de fichiers sans lien dur : on se replie sur un renommage.
const CODES_LIEN_DUR_INDISPONIBLE = new Set(["EPERM", "EACCES", "ENOSYS", "EXDEV", "ENOTSUP", "EOPNOTSUPP"]);

export class DiskStorage implements StorageProvider {
  readonly racine: string;

  constructor(racine: string = process.env.STORAGE_PATH || STORAGE_PATH_DEFAUT) {
    this.racine = path.resolve(racine);
  }

  /** Chemin absolu sûr : validé, puis confiné sous la racine (défense en profondeur). */
  private resoudre(chemin: string): string {
    const propre = validerChemin(chemin);
    const absolu = path.resolve(this.racine, ...propre.split("/"));
    if (!absolu.startsWith(this.racine + path.sep)) {
      throw new StorageError("CHEMIN_INVALIDE", "Chemin hors de la racine de stockage.");
    }
    return absolu;
  }

  async upload(chemin: string, contenu: Uint8Array, options: UploadOptions = {}): Promise<void> {
    const overwrite = options.overwrite ?? false;
    const cible = this.resoudre(chemin);
    await mkdir(path.dirname(cible), { recursive: true });

    if (!overwrite && (await existeFichier(cible))) {
      throw new StorageError("EXISTE_DEJA", `Le fichier existe déjà : ${chemin}`);
    }

    const temporaire = `${cible}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      // 1. Écriture complète + fsync dans un fichier temporaire du même dossier.
      const descripteur = await open(temporaire, "wx");
      try {
        await descripteur.writeFile(contenu);
        await descripteur.sync();
      } finally {
        await descripteur.close();
      }

      // 2. Publication atomique.
      if (overwrite) {
        await rename(temporaire, cible);
        return;
      }
      try {
        // Lien dur : échoue avec EEXIST si la cible existe. C'est ce qui rend
        // l'écriture à la fois atomique ET exclusive (aucune fenêtre de course).
        await link(temporaire, cible);
      } catch (erreur) {
        const code = codeErreur(erreur);
        if (code === "EEXIST") {
          throw new StorageError("EXISTE_DEJA", `Le fichier existe déjà : ${chemin}`);
        }
        if (code && CODES_LIEN_DUR_INDISPONIBLE.has(code)) {
          await rename(temporaire, cible);
          return;
        }
        throw erreur;
      }
    } finally {
      await rm(temporaire, { force: true });
    }
  }

  async getSignedUrl(chemin: string, ttlSecondes: number = SIGNED_URL_TTL_DEFAUT): Promise<string> {
    const propre = validerChemin(chemin);
    if (!Number.isFinite(ttlSecondes) || ttlSecondes <= 0) {
      throw new StorageError("CONFIGURATION", "Durée de validité invalide (secondes > 0 attendues).");
    }
    const expires = Math.floor(Date.now() / 1000) + Math.floor(ttlSecondes);
    return construireUrlSignee(propre, expires, signerChemin(propre, expires));
  }

  async delete(chemin: string): Promise<void> {
    await rm(this.resoudre(chemin), { force: true });
  }

  async exists(chemin: string): Promise<boolean> {
    return existeFichier(this.resoudre(chemin));
  }

  async read(chemin: string): Promise<Buffer> {
    try {
      return await readFile(this.resoudre(chemin));
    } catch (erreur) {
      if (codeErreur(erreur) === "ENOENT") {
        throw new StorageError("INTROUVABLE", `Fichier introuvable : ${chemin}`);
      }
      throw erreur;
    }
  }

  async readStream(chemin: string): Promise<ReadableStream<Uint8Array>> {
    const absolu = this.resoudre(chemin);
    if (!(await existeFichier(absolu))) {
      throw new StorageError("INTROUVABLE", `Fichier introuvable : ${chemin}`);
    }
    return Readable.toWeb(createReadStream(absolu)) as unknown as ReadableStream<Uint8Array>;
  }
}

// ─── Instance partagée ────────────────────────────────────────────────────────

let instance: StorageProvider | undefined;

/** Stockage configuré par l'environnement (STORAGE_PATH). Instance unique. */
export function getStorage(): StorageProvider {
  instance ??= new DiskStorage();
  return instance;
}
