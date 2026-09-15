import { FlatCompat } from "@eslint/eslintrc";

// Config ESLint (flat) : règles Next.js « core-web-vitals » + TypeScript.
// `next lint` étant déprécié, le script `lint` appelle directement l'ESLint CLI.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Site statique d'origine (HTML/JS hérités, hors application Next).
      "assets/**",
      "admin/**",
      // Stockage local des PDF (développement).
      ".data/**",
      // Sorties des parcours de non-régression (scripts/parcours).
      ".parcours/**",
    ],
  },
  // Le composant <Image> de @react-pdf/renderer n'est pas un <img> HTML :
  // la règle d'accessibilité alt-text ne s'applique pas aux documents PDF.
  {
    files: ["components/pdf/**"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
];

export default config;
