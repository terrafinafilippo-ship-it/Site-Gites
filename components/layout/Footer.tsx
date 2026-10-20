import Link from "next/link";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";

const TEXTES: Bilingue<{
  presentation: string;
  nosGites: string;
  laphine: string;
  armu: string;
  maisonVieille: string;
  lesTrois: string;
  decouvrir: string;
  activites: string;
  avis: string;
  bonsCadeaux: string;
  contact: string;
  informations: string;
  mentions: string;
  cgv: string;
  confidentialite: string;
  cookies: string;
  mentionsCourt: string;
  cgvCourt: string;
}> = {
  fr: {
    presentation:
      "Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas, en Ardèche verte. Une zone calme et rurale, avec tout le nécessaire à cinq minutes.",
    nosGites: "Nos gîtes",
    laphine: "LaPhine — Famille",
    armu: "L'Armu — Couple",
    maisonVieille: "La Maison Vieille — Famille + sauna",
    lesTrois: "Voir les trois gîtes",
    decouvrir: "Découvrir",
    activites: "Activités & découverte",
    avis: "Avis de nos hôtes",
    bonsCadeaux: "Bons cadeaux",
    contact: "Contact",
    informations: "Informations",
    mentions: "Mentions légales",
    cgv: "CGV & annulation",
    confidentialite: "Confidentialité",
    cookies: "Cookies",
    mentionsCourt: "Mentions",
    cgvCourt: "CGV",
  },
  en: {
    presentation:
      "Three characterful gîtes with the Gîtes de France label, tucked away in the hamlet of Samoyas, in green Ardèche. A calm, rural area, with all the essentials five minutes away.",
    nosGites: "Our gîtes",
    laphine: "LaPhine — Family",
    armu: "L'Armu — Couple",
    maisonVieille: "La Maison Vieille — Family + sauna",
    lesTrois: "See all three gîtes",
    decouvrir: "Discover",
    activites: "Activities & discovery",
    avis: "Guest reviews",
    bonsCadeaux: "Gift vouchers",
    contact: "Contact",
    informations: "Information",
    mentions: "Legal notice",
    cgv: "Terms & cancellation",
    confidentialite: "Privacy",
    cookies: "Cookies",
    mentionsCourt: "Legal notice",
    cgvCourt: "Terms",
  },
};

/** Footer global (server component) — reproduit renderFooter() de site.js. */
export default function Footer({ langue }: { langue: Langue }) {
  const t = TEXTES[langue];
  const l = (chemin: string) => lien(langue, chemin);
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="ft-grid">
          <div className="ft-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" className="ft-brand__logo" />
            <p>{t.presentation}</p>
            <p style={{ fontSize: 13, color: "#8a8576" }}>
              Patricia &amp; Nicolas Terrafina — FR · EN
            </p>
            <p style={{ fontSize: 13, color: "#8a8576" }}>
              Hameau de Samoyas — 07430 Savas, Ardèche
            </p>
          </div>
          <div>
            <h5>{t.nosGites}</h5>
            <ul>
              <li><Link href={l("/gites/laphine")}>{t.laphine}</Link></li>
              <li><Link href={l("/gites/armu")}>{t.armu}</Link></li>
              <li><Link href={l("/gites/maison-vieille")}>{t.maisonVieille}</Link></li>
              <li><Link href={l("/gites")}>{t.lesTrois}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t.decouvrir}</h5>
            <ul>
              <li><Link href={l("/activites")}>{t.activites}</Link></li>
              <li><Link href={l("/activites#avis")}>{t.avis}</Link></li>
              <li><Link href={l("/contact")}>{t.bonsCadeaux}</Link></li>
              <li><Link href={l("/contact")}>{t.contact}</Link></li>
            </ul>
          </div>
          <div>
            <h5>{t.informations}</h5>
            <ul>
              <li><Link href={l("/legal/mentions")}>{t.mentions}</Link></li>
              <li><Link href={l("/legal/cgv")}>{t.cgv}</Link></li>
              <li><Link href={l("/legal/privacy")}>{t.confidentialite}</Link></li>
              <li><Link href={l("/legal/cookies")}>{t.cookies}</Link></li>
            </ul>
          </div>
        </div>
        <div className="ft-meta">
          <span>© 2026 Les Gîtes de Samoyas — SIRET 000 000 000 00000</span>
          <span className="meta-links">
            <Link href={l("/legal/mentions")}>{t.mentionsCourt}</Link>
            <Link href={l("/legal/cgv")}>{t.cgvCourt}</Link>
            <Link href={l("/legal/privacy")}>{t.confidentialite}</Link>
            <Link href={l("/legal/cookies")}>{t.cookies}</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
