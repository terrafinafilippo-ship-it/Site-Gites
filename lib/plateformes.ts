// LES PLATEFORMES synchronisées avec le site (Phase 7, D-44) : leurs noms, et
// ce qui peut occuper une nuit qu'une plateforme annonce vendue (un doublon).
// Aucune lecture en base : les textes des courriels et le back-office le lisent.
import type { Plateforme } from "@/db/schema";

export const NOMS_PLATEFORMES: Record<Plateforme, string> = { gdf: "Gîtes de France", airbnb: "Airbnb", booking: "Booking" };

/** Ce qui occupe déjà une nuit qu'une plateforme annonce vendue. */
export type Detenteur =
  | {
      genre: "directe";
      reservationId: string;
      reference: string;
      client: string;
      /** Paiement de la réservation (ISO) et fin du délai annoncé au client ; `null` si inconnu. */
      payeLe: string | null;
      finDelai: string | null;
    }
  | { genre: "option"; client: string }
  | { genre: "ferme" }
  | { genre: "plateforme"; plateforme: Plateforme };

/** Du plus important au moins important : une réservation du site d'abord. */
export const ORDRE_DETENTEURS: Detenteur["genre"][] = ["directe", "option", "ferme", "plateforme"];

/** « la réservation ABC de Camille DUPONT », « des nuits fermées dans le calendrier du site »… */
export function detenteurLisible(d: Detenteur): string {
  switch (d.genre) {
    case "directe":
      return `la réservation ${d.reference} de ${d.client}`;
    case "option":
      return `l'option posée pour ${d.client}`;
    case "ferme":
      return "des nuits fermées dans le calendrier du site";
    case "plateforme":
      return `un séjour ${NOMS_PLATEFORMES[d.plateforme]}`;
  }
}
