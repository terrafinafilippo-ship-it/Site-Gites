import type { Metadata } from "next";

import { langueDe } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import FormulaireLien from "./FormulaireLien";
import styles from "./page.module.css";

// /suivi : le formulaire « Retrouver ma réservation » seul (D-25). Aucun lien
// du site n'y mène (choix du gérant du 28 octobre 2026 : le formulaire est
// proposé sur la page d'un lien expiré) ; l'adresse peut être donnée au
// téléphone à un client qui a perdu son courriel.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return {
    ...metadonnees(langue, "/suivi", langue === "en" ? "Find my booking" : "Retrouver ma réservation"),
    robots: { index: false, follow: false },
  };
}

export default async function RetrouverPage({ params }: { params: Promise<{ lang: string }> }) {
  const langue = langueDe((await params).lang);
  return (
    <section className={styles.page}>
      <div className={`wrap ${styles.colonne}`}>
        <FormulaireLien langue={langue} />
      </div>
    </section>
  );
}
