import type { Metadata } from "next";
import ActivitiesClient from "./ActivitiesClient";

export const metadata: Metadata = {
  title: "Activités & découverte — Les Gîtes de Samoyas",
};

export default function ActivitesPage() {
  return <ActivitiesClient />;
}
