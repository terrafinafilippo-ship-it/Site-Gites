// Données structurées (schema.org, JSON-LD) : la fiche que Google lit pour
// comprendre la page. Elles ne disent que ce que la page affiche déjà :
// coordonnées de la page Contact, chambres et surface de lib/data/gites.ts,
// capacité de la base.
//
// AUCUNE NOTE n'y figure. Celles de Gîtes de France sont recopiées d'un autre
// site, ce que Google refuse ; celles des clients du site (D-40) sont des avis
// sur l'établissement publiés par l'établissement lui-même, que Google ignore
// pour un hébergement (avis « auto-promotionnels », règles des extraits
// d'avis). Les ajouter n'apporterait rien et exposerait à une action manuelle.
import { GITES, type GiteId } from "@/lib/data/gites";
import { lien, type Langue } from "@/lib/i18n/langues";
import { NOM_SITE, origineSite, PRESENTATION_SITE } from "@/lib/i18n/metadonnees";

// Les coordonnées publiques, telles que la page Contact les affiche.
const ADRESSE = {
  "@type": "PostalAddress",
  streetAddress: "Hameau de Samoyas",
  postalCode: "07430",
  addressLocality: "Savas",
  addressRegion: "Ardèche",
  addressCountry: "FR",
};
const TELEPHONE = "+33 6 79 33 23 51";
const COURRIEL = "contact@gitesdesamoyas.fr";

function Script({ donnees }: { donnees: object }) {
  // « < » échappé : le texte d'un <script> ne doit pas pouvoir le refermer.
  const json = JSON.stringify({ "@context": "https://schema.org", ...donnees }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function adresseComplete(langue: Langue, chemin: string): string | undefined {
  const origine = origineSite();
  return origine ? `${origine}${lien(langue, chemin)}` : undefined;
}

/** L'établissement : les trois gîtes du hameau (accueil). */
export function DonneesSite({ langue }: { langue: Langue }) {
  const origine = origineSite();
  return (
    <Script
      donnees={{
        "@type": "LodgingBusiness",
        name: NOM_SITE,
        description: PRESENTATION_SITE[langue].description,
        url: adresseComplete(langue, "/"),
        logo: origine ? `${origine}/logo.png` : undefined,
        telephone: TELEPHONE,
        email: COURRIEL,
        address: ADRESSE,
      }}
    />
  );
}

/** Un gîte : chambres, surface, capacité si la base répond. */
export function DonneesGite({ langue, slug, capacite }: { langue: Langue; slug: GiteId; capacite: number | null }) {
  const gite = GITES[slug];
  const surface = Number.parseInt(gite.surface, 10);
  return (
    <Script
      donnees={{
        "@type": "House",
        name: `${gite.name} — ${NOM_SITE}`,
        description: gite.tagline[langue],
        url: adresseComplete(langue, `/gites/${slug}`),
        numberOfRooms: gite.bedrooms,
        ...(Number.isFinite(surface) ? { floorSize: { "@type": "QuantitativeValue", value: surface, unitCode: "MTK" } } : {}),
        ...(capacite !== null ? { occupancy: { "@type": "QuantitativeValue", maxValue: capacite } } : {}),
        address: ADRESSE,
        containedInPlace: { "@type": "LodgingBusiness", name: NOM_SITE, telephone: TELEPHONE, address: ADRESSE },
      }}
    />
  );
}
