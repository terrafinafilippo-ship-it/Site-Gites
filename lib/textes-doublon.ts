// LA PHRASE QUI PRÉVIENT LE CLIENT d'un doublon possible avec une plateforme
// (Phase 7, D-44). Texte validé par le gérant le 26 novembre 2026 (sa version
// anglaise attend la relecture de l'anglais, Phase 6). Un seul domicile, lu
// par l'écran de paiement, le courriel de confirmation et les CGV ; le délai
// est le réglage `doublon_delai_heures` (24 au départ).
//
// Le cas est couvert par le contrat sans le modifier : l'annulation par le
// bailleur rembourse tout (article 7.4).
import type { Bilingue } from "@/lib/i18n/langues";

export const PHRASE_DOUBLON: Bilingue<(heures: number) => string> = {
  fr: (heures) =>
    "Nos gîtes se réservent aussi sur d'autres sites. Dans le cas très rare où les mêmes dates y auraient été prises au même moment, " +
    `nous vous prévenons ${heures === 1 ? "dans l'heure qui suit" : `dans les ${heures} heures qui suivent`} votre paiement ` +
    "et nous vous remboursons intégralement.",
  en: (heures) =>
    "Our gîtes can also be booked on other websites. In the very rare event that the same dates were taken there at the same moment, " +
    `we will let you know within ${heures === 1 ? "an hour" : `${heures} hours`} of your payment and refund you in full.`,
};
