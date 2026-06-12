import type { Metadata } from "next";
import { GITES, isGiteId } from "@/lib/data/gites";
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
  return <ReserverFunnel gite={selected} />;
}
