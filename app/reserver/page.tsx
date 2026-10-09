import type { Metadata } from "next";
import { GITES, isGiteId } from "@/lib/data/gites";
import { chiffresDuGite, lireChiffresPublics } from "@/lib/gites-publics";
import ReserverFunnel from "./ReserverFunnel";

export const metadata: Metadata = {
  title: "Réserver un séjour — Les Gîtes de Samoyas",
};

export default async function ReserverPage({
  searchParams,
}: {
  searchParams: Promise<{ gite?: string }>;
}) {
  const { gite } = await searchParams;
  const selected = gite && isGiteId(gite) ? GITES[gite] : GITES.laphine;
  // Montant de la caution lu en base (gites.caution), jamais en dur. `null` si
  // la base ne répond pas : le tunnel décrit alors le mécanisme sans chiffre.
  const publics = await lireChiffresPublics();
  const cautionCentimes = chiffresDuGite(publics, selected.id)?.caution ?? null;
  return <ReserverFunnel gite={selected} cautionCentimes={cautionCentimes} />;
}
