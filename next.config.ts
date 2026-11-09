import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (rendu des contrats et factures côté serveur) embarque
  // fontkit et zlib : il doit rester un module Node externe, jamais bundlé.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Les justificatifs d'une retenue sur la caution (back-office, Phase 5,
  // lot 2) passent par une action serveur : 10 Mo au plus en tout, plus la
  // marge du formulaire. Le plafond par défaut de Next (1 Mo) les refuserait.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },

  // Les fiches gîtes ont porté un temps des slugs inventés côté code (larmu,
  // maisonvieille) avant d'adopter ceux de la base (armu, maison-vieille, voir
  // docs/02-decisions.md, D-14). Le site Next n'a jamais été déployé : ces
  // adresses n'ont donc jamais été publiques et ces redirections ne couvrent
  // qu'un lien resté dans un mail, un favori ou une capture d'écran.
  //
  // `statusCode: 301` et non `permanent: true` : `permanent` produit un 308,
  // qui est correct mais que certains vieux clients et outils de référencement
  // ne suivent pas. Le 301 est la redirection définitive universellement comprise.
  //
  // L'ANCIEN SITE en ligne sur gitesdesamoyas.fr (PHP, relevé en lecture seule
  // le 9 novembre 2026 en suivant ses liens depuis l'accueil : sept adresses).
  // Chaque page garde un équivalent, pour que liens, favoris et résultats de
  // recherche ne tombent pas sur une erreur à la bascule (Phase 7, point 4).
  // Restent sans redirection, en attente d'une décision : /bon.html (bons
  // cadeaux, reportés après l'ouverture) et /images/amour.pdf (affiche du bon
  // cadeau).
  async redirects() {
    return [
      { source: "/gites/larmu", destination: "/gites/armu", statusCode: 301 },
      { source: "/gites/maisonvieille", destination: "/gites/maison-vieille", statusCode: 301 },
      { source: "/index.php", destination: "/", statusCode: 301 },
      { source: "/gites.html", destination: "/gites", statusCode: 301 },
      { source: "/activites.php", destination: "/activites", statusCode: 301 },
      { source: "/contact.html", destination: "/contact", statusCode: 301 },
    ];
  },
};

export default nextConfig;
