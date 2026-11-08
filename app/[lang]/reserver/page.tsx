import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GITES, isGiteId } from "@/lib/data/gites";
import { lireChiffresPublics } from "@/lib/gites-publics";
import { langueDe } from "@/lib/i18n/langues";
import { metadonnees } from "@/lib/i18n/metadonnees";
import { dernierJourOption, lireOptionParJeton, type OptionLue } from "@/lib/options-sejour";
import { configurationPaiement } from "@/lib/stripe";
import { chargerDonneesTunnel, type DonneesTunnel } from "@/lib/tunnel";
import ChoixGite, { OptionInvalide, TunnelIndisponible } from "./ChoixGite";
import ReserverFunnel, { type DemandeInitiale } from "./ReserverFunnel";

// Données lues à chaque visite : un calendrier mis en cache annoncerait libres
// des nuits prises depuis.
export const dynamic = "force-dynamic";

type Parametres = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const langue = langueDe((await params).lang);
  return {
    ...metadonnees(langue, "/reserver", langue === "en" ? "Book a stay" : "Réserver un séjour"),
    // Le tunnel n'a rien à faire dans les résultats de recherche.
    robots: { index: false, follow: true },
  };
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(p: Parametres, cle: string): string | undefined {
  const v = p[cle];
  return typeof v === "string" ? v : undefined;
}

/** Dates et voyageurs pré-remplis (lien « autre gîte libre aux mêmes dates », changement de langue). Le devis revérifie tout. */
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
    // Les coordonnées ne sont jamais dans l'adresse : au plus loin, on reprend à leur saisie.
    coordonnees: texte(p, "etape") === "coordonnees",
  };
}

export default async function ReserverPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Parametres>;
}) {
  const langue = langueDe((await params).lang);
  const parametres = await searchParams;

  // Lien d'une option posée au téléphone (Phase 5, lot 4) : le gîte et les
  // dates sont ceux de l'option, quoi que dise le reste de l'adresse.
  const jeton = texte(parametres, "option");
  let option: OptionLue | null = null;
  if (jeton) {
    try {
      option = await lireOptionParJeton(jeton);
    } catch (erreur) {
      console.error("[reserver] OPTION ILLISIBLE :", erreur instanceof Error ? erreur.message : erreur);
      return <TunnelIndisponible langue={langue} nomGite={langue === "en" ? "this gîte" : "ce gîte"} />;
    }
    if (!option || option.etat !== "en_cours") return <OptionInvalide langue={langue} />;
  }
  const slug = option ? option.slug : texte(parametres, "gite");

  // Sans gîte : le client choisit. Gîte inconnu : 404, jamais un autre gîte à sa place.
  if (!slug) return <ChoixGite langue={langue} publics={await lireChiffresPublics()} />;
  if (!isGiteId(slug)) notFound();

  const gite = GITES[slug];
  let donnees: DonneesTunnel;
  try {
    // L'identifiant interne du gîte reste sur le serveur.
    ({ donnees } = await chargerDonneesTunnel(slug, undefined, option?.id ?? null));
  } catch (erreur) {
    // Le tunnel ne dégrade jamais : sans données sûres, il refuse d'engager le client.
    console.error(
      `[reserver] TUNNEL INDISPONIBLE (${slug}) :`,
      erreur instanceof Error ? erreur.message : erreur,
    );
    return <TunnelIndisponible langue={langue} nomGite={gite.name} />;
  }
  // Sans paiement possible, le client ne doit pas tout saisir pour échouer à la dernière étape.
  const paiement = configurationPaiement();
  if (!paiement.ok) {
    console.error(`[reserver] PAIEMENT NON CONFIGURÉ (${slug}) : ${paiement.raison}`);
    return <TunnelIndisponible langue={langue} nomGite={gite.name} />;
  }
  const initial = demandeInitiale(parametres);
  return (
    <ReserverFunnel
      langue={langue}
      gite={gite}
      donnees={donnees}
      initial={option ? { ...initial, arrivee: option.arrivee, depart: option.depart } : initial}
      clePublique={paiement.clePublique}
      option={option ? { jeton: option.jeton, fin: dernierJourOption(option.expireAt) } : null}
    />
  );
}
