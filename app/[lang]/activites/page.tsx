import type { Metadata } from "next";
import { langueDe } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import ActivitiesClient from "./ActivitiesClient";
import { INTRO_ACTIVITES } from "./textes";

interface Params {
  lang: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return metadonnees(langue, "/activites", langue === "en" ? "Activities & discovery" : "Activités & découverte", INTRO_ACTIVITES[langue]);
}

export default async function ActivitesPage({ params }: { params: Promise<Params> }) {
  return <ActivitiesClient langue={langueDe((await params).lang)} />;
}
