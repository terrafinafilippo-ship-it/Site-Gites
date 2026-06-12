import type { Config } from "tailwindcss";

/**
 * Tailwind n'est qu'un complément ponctuel : le rendu vient de
 * app/globals.css (tokens.css + site.css fusionnés, palette "ds" figée).
 * On câble ici les variables du design comme tokens utilisables.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "green-dark": "var(--tw-green-dark)",
        "green-mid": "var(--tw-green-mid)",
        "green-darker": "var(--tw-green-darker)",
        charcoal: "var(--color-charcoal)",
        "gray-medium": "var(--color-gray-medium)",
        "gold-taupe": "var(--color-gold-taupe)",
        sienna: "var(--color-sienna)",
        sage: "var(--color-sage)",
        "bg-page": "var(--tw-bg-page)",
        "season-accent": "var(--tw-season-accent)",
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
      },
    },
  },
  corePlugins: {
    // Le reset vient de globals.css (fidélité au rendu HTML d'origine).
    preflight: false,
  },
  plugins: [],
};

export default config;
