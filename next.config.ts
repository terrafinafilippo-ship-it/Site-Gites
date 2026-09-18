import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (rendu des contrats et factures côté serveur) embarque
  // fontkit et zlib : il doit rester un module Node externe, jamais bundlé.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Les fiches gîtes ont porté un temps des slugs inventés côté code (larmu,
  // maisonvieille) avant d'adopter ceux de la base (armu, maison-vieille, voir
  // docs/02-decisions.md, D-14). Le site Next n'a jamais été déployé : ces
  // adresses n'ont donc jamais été publiques et ces redirections ne couvrent
  // qu'un lien resté dans un mail, un favori ou une capture d'écran.
  //
  // `statusCode: 301` et non `permanent: true` : `permanent` produit un 308,
  // qui est correct mais que certains vieux clients et outils de référencement
  // ne suivent pas. Le 301 est la redirection définitive universellement comprise.
  async redirects() {
    return [
      { source: "/gites/larmu", destination: "/gites/armu", statusCode: 301 },
      { source: "/gites/maisonvieille", destination: "/gites/maison-vieille", statusCode: 301 },
    ];
  },
};

export default nextConfig;
