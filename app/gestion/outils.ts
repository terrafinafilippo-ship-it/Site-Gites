// Témoins (cookies) et visiteur du back-office (Phase 5, lot 1, D-32). Côté
// serveur seulement : pages et actions de app/gestion/.
//
// Trois témoins, tous `httpOnly` (illisibles par une page), `SameSite=Strict`
// (jamais envoyés depuis un autre site) et limités au chemin /gestion :
//   - gestion_session : la session ouverte (sans date : la base la ferme
//     après l'inactivité réglée) ;
//   - gestion_appareil : l'appareil reconnu, gardé autant de jours que la
//     reconnaissance (chaque connexion le relance) ;
//   - gestion_attente : l'étape « code » d'un appareil inconnu.
// Ils ne portent qu'un jeton au hasard ; la base n'en garde que l'empreinte.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { lireSession, type Session, type Visiteur } from "@/lib/gestion/connexion";

export const TEMOIN_SESSION = "gestion_session";
export const TEMOIN_APPAREIL = "gestion_appareil";
export const TEMOIN_ATTENTE = "gestion_attente";

export const ACCUEIL = "/gestion";
export const CONNEXION = "/gestion/connexion";

export function optionsTemoin(maxAgeSecondes?: number) {
  return {
    httpOnly: true,
    // En développement, le site tourne en http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/gestion",
    ...(maxAgeSecondes ? { maxAge: maxAgeSecondes } : {}),
  };
}

/**
 * Adresse IP et navigateur. L'adresse est la DERNIÈRE de X-Forwarded-For,
 * celle qu'écrit le proxy (Traefik, via Coolify) : les précédentes peuvent
 * venir du visiteur lui-même. Même règle que la limite du tunnel
 * (app/api/reservations/route.ts).
 */
export async function visiteur(): Promise<Visiteur> {
  const h = await headers();
  const adresses = (h.get("x-forwarded-for") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const ip = adresses[adresses.length - 1] || h.get("x-real-ip")?.trim() || "inconnue";
  return { ip: ip.slice(0, 64), userAgent: h.get("user-agent") };
}

export async function temoin(nom: string): Promise<string | null> {
  return (await cookies()).get(nom)?.value ?? null;
}

/** La session en cours, ou la page de connexion. À appeler en tête de chaque page et de chaque action protégée. */
export async function exigerSession(): Promise<Session> {
  const session = await lireSession(await temoin(TEMOIN_SESSION));
  if (!session) redirect(CONNEXION);
  return session;
}

/** Origine publique du site, pour les liens des courriels. */
export async function origine(): Promise<string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (site) return site;
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${proto}://${hote}`;
}

/** « 21 h 14 » (heure de Paris), pour dire jusqu'à quand attendre. */
export function heureLisible(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d)
    .replace(":", " h ");
}
