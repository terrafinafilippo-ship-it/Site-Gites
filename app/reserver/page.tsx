import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GITES, isGiteId } from "@/lib/data/gites";
import { lireChiffresPublics } from "@/lib/gites-publics";
import { chargerDonneesTunnel, type DonneesTunnel } from "@/lib/tunnel";
import ChoixGite, { TunnelIndisponible } from "./ChoixGite";
import ReserverFunnel, { type DemandeInitiale } from "./ReserverFunnel";

export const metadata: Metadata = {
  title: "Réserver un séjour — Les Gîtes de Samoyas",
};

// Données lues à chaque visite : un calendrier mis en cache annoncerait libres
// des nuits prises depuis.
export const dynamic = "force-dynamic";

type Parametres = Record<string, string | string[] | undefined>;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(p: Parametres, cle: string): string | undefined {
  const v = p[cle];
  return typeof v === "string" ? v : undefined;
}

/** Dates et voyageurs pré-remplis (lien « autre gîte libre aux mêmes dates »). Le devis revérifie tout. */
function demandeInitiale(p: Parametres): DemandeInitiale {
  const date = (cle: string) => {
    const v = texte(p, cle);
    return v && DATE_ISO.test(v) ? v : undefined;
  };
  const nombre = (cle: string) => {
    const v = texte(p, cle);
    const n = v && /^\d{1,2}$/.test(v) ? Number(v) : Number.NaN;
    return Number.isSafeInteger(n) ? n : undefined;
  };
  return {
    arrivee: date("arrivee"),
    depart: date("depart"),
    adultes: nombre("adultes"),
    enfants: nombre("enfants"),
    bebes: nombre("bebes"),
  };
}

export default async function ReserverPage({ searchParams }: { searchParams: Promise<Parametres> }) {
  const parametres = await searchParams;
  const slug = texte(parametres, "gite");

  // Sans gîte : le client choisit. Gîte inconnu : 404, jamais un autre gîte à sa place.
  if (!slug) return <ChoixGite publics={await lireChiffresPublics()} />;
  if (!isGiteId(slug)) notFound();

  const gite = GITES[slug];
  let donnees: DonneesTunnel;
  try {
    // L'identifiant interne du gîte reste sur le serveur.
    ({ donnees } = await chargerDonneesTunnel(slug));
  } catch (erreur) {
    // Le tunnel ne dégrade jamais : sans données sûres, il refuse d'engager le client.
    console.error(
      `[reserver] TUNNEL INDISPONIBLE (${slug}) :`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return <TunnelIndisponible nomGite={gite.name} />;
  }
  return <ReserverFunnel gite={gite} donnees={donnees} initial={demandeInitiale(parametres)} />;
}
