import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CookieBanner from "@/components/layout/CookieBanner";
import { ATTRIBUT_LANG, estLangue, LANGUES, type Bilingue } from "@/lib/i18n/langues";
import { NOM_SITE } from "@/lib/i18n/metadonnees";
import "../globals.css";

/* Fonts injectées sur les mêmes noms de vars que le design d'origine
   (--font-serif / --font-sans), consommées par globals.css. */
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const TEXTES: Bilingue<{ titre: string; description: string }> = {
  fr: {
    titre: `${NOM_SITE} — Trois écrins de détente en Ardèche verte`,
    description:
      "Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas, en Ardèche verte. Spa privatif, linge fourni — le calme de la campagne, sans s'éloigner du nécessaire.",
  },
  en: {
    titre: `${NOM_SITE} — Three relaxing retreats in green Ardèche`,
    description:
      "Three characterful gîtes with the Gîtes de France label, tucked away in the hamlet of Samoyas, in green Ardèche. Private spa, linen provided — the calm of the countryside, without being far from everyday essentials.",
  },
};

// Les deux langues sont connues d'avance ; toute autre valeur est une page introuvable.
export function generateStaticParams() {
  return LANGUES.map((lang) => ({ lang }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = TEXTES[estLangue(lang) ? lang : "fr"];
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    ...(site ? { metadataBase: new URL(site) } : {}),
    title: t.titre,
    description: t.description,
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!estLangue(lang)) notFound();
  return (
    <html lang={ATTRIBUT_LANG[lang]} className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <Header langue={lang} />
        {children}
        <Footer langue={lang} />
        <CookieBanner langue={lang} />
      </body>
    </html>
  );
}
