// Logo des PDF (contrats, factures), lu sur le disque.
//
// Le fichier public/logo.png est lu depuis le système de fichiers, une seule
// fois, et gardé en mémoire : aucune requête HTTP, aucune dépendance au réseau
// ni à l'origine du site. Un échec de lecture (fichier absent, dossier public
// non déployé) est journalisé et le PDF est généré SANS logo : un contrat sans
// logo reste juridiquement valide, un contrat non généré après encaissement
// est un incident client. La route ne doit jamais échouer à cause du logo.
//
// DÉPLOIEMENT : le chemin est résolu depuis process.cwd(). Avec `next start`
// sur le dépôt complet, public/ est présent. Avec `output: "standalone"`,
// Next.js ne copie PAS public/ dans .next/standalone : il faut le copier à
// côté du serveur (ou monter le fichier), sinon les PDF sortent sans logo et
// une ligne d'erreur apparaît dans les journaux au premier rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CHEMIN_LOGO = path.join(process.cwd(), 'public', 'logo.png');

// undefined : pas encore tenté ; null : lecture échouée (on ne réessaie pas à
// chaque rendu, l'erreur a été journalisée une fois).
let cache: Buffer | null | undefined;

/**
 * Octets du logo PNG, ou null si le fichier n'est pas lisible. @react-pdf/renderer
 * accepte un Buffer directement comme `src` d'une <Image>.
 */
export function chargerLogo(): Buffer | null {
  if (cache !== undefined) return cache;
  try {
    cache = readFileSync(CHEMIN_LOGO);
  } catch (e) {
    console.error(
      `[logo] Lecture de ${CHEMIN_LOGO} impossible, les PDF seront générés sans logo :`,
      e instanceof Error ? e.message : e,
    );
    cache = null;
  }
  return cache;
}

/** Réinitialise le cache (tests uniquement). */
export function oublierLogo(): void {
  cache = undefined;
}
