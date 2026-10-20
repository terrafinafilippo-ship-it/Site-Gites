"use client";

import { useRouter } from "next/navigation";
import { lien, type Langue } from "@/lib/i18n/langues";
import styles from "./not-found.module.css";

/** Faux champ de recherche de la 404 — redirige vers /gites (cf. 404.html). */
export default function NotFoundSearch({ langue }: { langue: Langue }) {
  const router = useRouter();
  const en = langue === "en";
  return (
    <form
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(lien(langue, "/gites"));
      }}
    >
      <input
        type="search"
        placeholder={en ? "Search for a gîte, an activity, a question…" : "Chercher un gîte, une activité, une question…"}
        aria-label={en ? "Search" : "Rechercher"}
      />
      <button type="submit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        {en ? "Search" : "Chercher"}
      </button>
    </form>
  );
}
