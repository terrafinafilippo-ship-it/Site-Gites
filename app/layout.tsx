import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CookieBanner from "@/components/layout/CookieBanner";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Les Gîtes de Samoyas — Trois écrins de détente en Ardèche verte",
  description:
    "Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas, en Ardèche verte. Spa privatif, linge fourni — le calme de la campagne, sans s'éloigner du nécessaire.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <Header />
        {children}
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
