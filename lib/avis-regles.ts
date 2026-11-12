// Les règles des avis des clients (Phase 6, D-40) qui sont des PROMESSES
// écrites : la politique des avis (lib/data/legal.ts), la page de dépôt et le
// courriel du retrait les citent. Comme un délai du contrat, elles sont des
// constantes, pas des réglages. Sans accès à la base : la page de dépôt
// (composant client) et le plan du site les importent.
import type { MotifRetrait } from "@/db/schema";
import type { Bilingue } from "@/lib/i18n/langues";

/** Durée de publication d'un avis, en années depuis son dépôt ; il est effacé ensuite (lib/avis.ts). */
export const DUREE_AVIS_ANS = 3;

/** Longueur maximale d'un commentaire, en caractères (contrainte de la base). */
export const COMMENTAIRE_MAX = 2000;

/** Les seuls motifs de retrait, tels que la politique des avis et le courriel au client les disent. */
export const LIBELLES_MOTIF: Record<MotifRetrait, Bilingue<string>> = {
  injurieux: {
    fr: "propos injurieux, diffamatoires ou discriminatoires",
    en: "abusive, defamatory or discriminatory content",
  },
  hors_sujet: {
    fr: "avis sans rapport avec le séjour",
    en: "review unrelated to the stay",
  },
  donnees_personnelles: {
    fr: "données personnelles (nom complet, adresse, téléphone d'une personne…)",
    en: "personal data (someone's full name, address, phone number…)",
  },
  demande_auteur: {
    fr: "à la demande de son auteur",
    en: "at the author's request",
  },
};
