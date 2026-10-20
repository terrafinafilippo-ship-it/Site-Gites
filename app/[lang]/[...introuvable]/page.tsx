import { notFound } from "next/navigation";

// Toute adresse qu'aucune page ne sert (« /en/nimporte-quoi ») : la page
// introuvable de app/[lang]/not-found.tsx, dans la langue de l'adresse.
export default function Introuvable() {
  notFound();
}
