import Link from "next/link";

/** Footer global (server component) — reproduit renderFooter() de site.js. */
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="ft-grid">
          <div className="ft-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Logo-header.png" alt="Les Gîtes de Samoyas" className="ft-brand__logo" />
            <p>
              Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas,
              en Ardèche verte. Une zone calme et rurale, avec tout le nécessaire à cinq minutes.
            </p>
            <p style={{ fontSize: 13, color: "#8a8576" }}>
              Patricia &amp; Nicolas Terrafina — FR · EN · IT
            </p>
            <p style={{ fontSize: 13, color: "#8a8576" }}>
              Hameau de Samoyas — 07430 Savas, Ardèche
            </p>
          </div>
          <div>
            <h5>Nos gîtes</h5>
            <ul>
              <li><Link href="/gites/laphine">LaPhine — Famille</Link></li>
              <li><Link href="/gites/larmu">L&apos;Armu — Couple</Link></li>
              <li><Link href="/gites/maisonvieille">La Maison Vieille — Famille + sauna</Link></li>
              <li><Link href="/gites">Voir les trois gîtes</Link></li>
            </ul>
          </div>
          <div>
            <h5>Découvrir</h5>
            <ul>
              <li><Link href="/activites">Activités &amp; découverte</Link></li>
              <li><Link href="/activites#avis">Avis de nos hôtes</Link></li>
              <li><Link href="/contact">Bons cadeaux</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h5>Informations</h5>
            <ul>
              <li><Link href="/legal/mentions">Mentions légales</Link></li>
              <li><Link href="/legal/cgv">CGV &amp; annulation</Link></li>
              <li><Link href="/legal/privacy">Confidentialité</Link></li>
              <li><Link href="/legal/cookies">Cookies</Link></li>
            </ul>
          </div>
        </div>
        <div className="ft-meta">
          <span>© 2026 Les Gîtes de Samoyas — SIRET 000 000 000 00000</span>
          <span className="meta-links">
            <Link href="/legal/mentions">Mentions</Link>
            <Link href="/legal/cgv">CGV</Link>
            <Link href="/legal/privacy">Confidentialité</Link>
            <Link href="/legal/cookies">Cookies</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
