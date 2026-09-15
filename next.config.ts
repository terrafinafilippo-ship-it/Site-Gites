import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (rendu des contrats et factures côté serveur) embarque
  // fontkit et zlib : il doit rester un module Node externe, jamais bundlé.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
