// Les SECRETS de la connexion au back-office (Phase 5, lot 1, D-32) : mot de
// passe, jetons des témoins et des liens, code à 6 chiffres. Module PUR, sans
// base : seul `node:crypto` (aucune dépendance ajoutée).
//
// Mot de passe : scrypt (N = 2^17, r = 8, p = 1, recommandation OWASP), sel de
// 16 octets, empreinte de 64 octets, écrite « scrypt$N$r$p$sel$empreinte ». Le
// coût est écrit dans l'empreinte : le relever plus tard n'invalide pas les
// mots de passe déjà choisis.
//
// Jetons et codes : la base n'en garde que l'empreinte SHA-256. Un jeton tiré
// au hasard sur 32 octets n'a pas besoin d'un calcul lent ; un code à 6
// chiffres, si, mais il vaut 10 minutes et 5 essais.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** Longueur minimale d'un mot de passe : au-delà, la longueur protège mieux que les règles de composition. */
export const MOT_DE_PASSE_MIN = 12;
const MOT_DE_PASSE_MAX = 200;

const COUT = { N: 2 ** 17, r: 8, p: 1 } as const;
const LONGUEUR_EMPREINTE = 64;

function scryptAsync(mot: string, sel: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    // maxmem : 128 × N × r octets, plus de la marge.
    scrypt(mot.normalize("NFC"), sel, LONGUEUR_EMPREINTE, { ...options, maxmem: 256 * 1024 * 1024 }, (err, cle) =>
      err ? rejeter(err) : resoudre(cle),
    );
  });
}

/** Ce qui peut être refusé dans un mot de passe choisi. */
export const REFUS_MOT_DE_PASSE = {
  court: `Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`,
  long: `Le mot de passe doit faire au plus ${MOT_DE_PASSE_MAX} caractères.`,
  espace: "Le mot de passe ne doit commencer ni finir par une espace.",
  different: "Les deux mots de passe ne sont pas identiques.",
} as const;
export type RefusMotDePasse = keyof typeof REFUS_MOT_DE_PASSE;

/** Ce qui ne va pas dans un mot de passe choisi, ou null. */
export function defautMotDePasse(mot: string): RefusMotDePasse | null {
  if (mot.length < MOT_DE_PASSE_MIN) return "court";
  if (mot.length > MOT_DE_PASSE_MAX) return "long";
  if (mot.trim() !== mot) return "espace";
  return null;
}

export async function empreinteMotDePasse(mot: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = await scryptAsync(mot, sel, COUT);
  return ["scrypt", COUT.N, COUT.r, COUT.p, sel.toString("base64"), cle.toString("base64")].join("$");
}

/** Compare en temps constant. Une empreinte illisible ne correspond à rien. */
export async function motDePasseCorrespond(mot: string, empreinte: string): Promise<boolean> {
  const morceaux = empreinte.split("$");
  if (morceaux.length !== 6 || morceaux[0] !== "scrypt") return false;
  const [N, r, p] = morceaux.slice(1, 4).map(Number);
  if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const attendu = Buffer.from(morceaux[5], "base64");
  if (attendu.length !== LONGUEUR_EMPREINTE) return false;
  const obtenu = await scryptAsync(mot, Buffer.from(morceaux[4], "base64"), { N, r, p });
  return timingSafeEqual(obtenu, attendu);
}

/** Empreinte d'un mot de passe qui n'existe pas : le refus prend le même temps qu'il y ait un compte ou non. */
let empreinteLeurre: Promise<string> | null = null;
export function leurre(): Promise<string> {
  if (!empreinteLeurre) empreinteLeurre = empreinteMotDePasse(randomBytes(24).toString("base64"));
  return empreinteLeurre;
}

/** Jeton d'un témoin ou d'un lien : 32 octets au hasard, en base64url. */
export function nouveauJeton(): string {
  return randomBytes(32).toString("base64url");
}

export function empreinte(valeur: string): string {
  return createHash("sha256").update(valeur, "utf8").digest("hex");
}

/** Code à 6 chiffres, zéros en tête compris. */
export function nouveauCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Empreinte d'un code, liée à son jeton : la même valeur de code n'a pas la même empreinte deux fois. */
export function empreinteCode(code: string, jeton: string): string {
  return empreinte(`${jeton}:${code}`);
}

/** « Chrome sur Windows » : de quoi reconnaître un appareil dans la liste, rien de plus. */
export function decrireAppareil(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const navigateur = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur inconnu";
  const systeme = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return systeme ? `${navigateur} sur ${systeme}` : navigateur;
}
