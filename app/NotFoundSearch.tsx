"use client";

import { useRouter } from "next/navigation";
import styles from "./not-found.module.css";

/** Faux champ de recherche de la 404 — redirige vers /gites (cf. 404.html). */
export default function NotFoundSearch() {
  const router = useRouter();
  return (
    <form
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/gites");
      }}
    >
      <input type="search" placeholder="Chercher un gîte, une activité, une question…" aria-label="Rechercher" />
      <button type="submit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Chercher
      </button>
    </form>
  );
}
