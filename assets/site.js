/* Les Gîtes de Samoyas — Site shell + tweaks panel
   Loaded on every page. Renders the sticky header, footer, cookies banner,
   mobile nav drawer, and the floating Tweaks panel (toggled by the toolbar).
*/

const SITE_NAV = [
  { id: "home",    label: "Accueil",                  href: "index.html" },
  { id: "gites",   label: "Nos gîtes",                href: "gites.html" },
  { id: "act",     label: "Activités & découverte",   href: "activites.html" },
  { id: "contact", label: "Contact",                  href: "contact.html" },
];

const GITES = {
  laphine: {
    id: "laphine",
    name: "LaPhine",
    code: "07G310701",
    target: "Famille — 4 personnes",
    short: "Famille",
    sleeps: 4,
    bedrooms: 2,
    surface: "70 m²",
    rating: 5.0,
    reviews: 16,
    reco: 100,
    price: 670,
    tagline: "L'écrin familial — spa encastré, véranda chauffée, garage privatif.",
    highlight: "Spa encastré · véranda · garage",
  },
  larmu: {
    id: "larmu",
    name: "L'Armu",
    code: "07G310700",
    target: "Couple — 2 personnes",
    short: "Couple",
    sleeps: 2,
    bedrooms: 1,
    surface: "45 m²",
    rating: 5.0,
    reviews: 22,
    reco: 100,
    price: 450,
    tagline: "Un refuge pour deux — chambre mansardée, jacuzzi sous la véranda, cheminée d'ambiance.",
    highlight: "Jacuzzi véranda · cheminée",
  },
  maisonvieille: {
    id: "maisonvieille",
    name: "La Maison Vieille",
    code: "07G310702",
    target: "Famille — 4 personnes",
    short: "Famille + sauna",
    sleeps: 4,
    bedrooms: 2,
    surface: "85 m²",
    rating: 4.9,
    reviews: 8,
    reco: 100,
    price: 690,
    tagline: "La seule à conjuguer spa et sauna — pierre ancienne, volumes nobles.",
    highlight: "Spa + sauna privatif",
  },
};

/* ---------- Header / Footer rendering ---------- */
function renderHeader(activeId) {
  const navLinks = SITE_NAV.map(n =>
    `<a href="${n.href}" class="${n.id === activeId ? "is-active" : ""}">${n.label}</a>`
  ).join("");

  const navLinksMob = SITE_NAV.map(n =>
    `<a href="${n.href}" class="${n.id === activeId ? "is-active" : ""}">${n.label}</a>`
  ).join("");

  return `
<header class="site-header">
  <div class="wrap">
    <a href="index.html" class="brand" aria-label="Les Gîtes de Samoyas — accueil">
      <img src="assets/Logo-header.png" alt="Les Gîtes de Samoyas" class="brand__logo">
    </a>
    <nav aria-label="Navigation principale">
      ${navLinks}
    </nav>
    <div class="hd-actions">
      <div class="hd-lang" role="group" aria-label="Langue">
        <button class="is-active" data-lang="fr">FR</button>
        <button data-lang="en">EN</button>
        <button data-lang="it">IT</button>
      </div>
      <a href="reserver.html" class="btn btn-primary">Réserver un séjour</a>
      <button class="burger" aria-label="Menu" id="burger-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="3" y1="7" x2="21" y2="7"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="17" x2="21" y2="17"/>
        </svg>
      </button>
    </div>
  </div>
</header>

<div class="mob-nav" id="mob-nav" aria-hidden="true">
  <div class="mob-nav__panel">
    <button class="mob-nav__close" aria-label="Fermer le menu" id="mob-nav-close">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="6" y1="6" x2="18" y2="18"/>
        <line x1="18" y1="6" x2="6" y2="18"/>
      </svg>
    </button>
    ${navLinksMob}
    <a href="reserver.html" class="btn btn-primary btn-block">Réserver un séjour</a>
    <div class="lang">
      <button class="is-active">FR</button>
      <button>EN</button>
      <button>IT</button>
    </div>
  </div>
</div>
  `;
}

function renderFooter() {
  return `
<footer class="site-footer">
  <div class="wrap">
    <div class="ft-grid">
      <div class="ft-brand">
        <img src="assets/Logo-header.png" alt="Les Gîtes de Samoyas" class="ft-brand__logo">
        <p>Trois gîtes de caractère labellisés Gîtes de France, nichés dans le hameau de Samoyas, en Ardèche verte. Une zone calme et rurale, avec tout le nécessaire à cinq minutes.</p>
        <p style="font-size:13px;color:#8a8576">Patricia &amp; Nicolas Terrafina &mdash; FR &middot; EN &middot; IT</p>
        <p style="font-size:13px;color:#8a8576">Hameau de Samoyas — 07430 Savas, Ardèche</p>
      </div>
      <div>
        <h5>Nos gîtes</h5>
        <ul>
          <li><a href="gite.html?id=laphine">LaPhine — Famille</a></li>
          <li><a href="gite.html?id=larmu">L'Armu — Couple</a></li>
          <li><a href="gite.html?id=maisonvieille">La Maison Vieille — Famille + sauna</a></li>
          <li><a href="gites.html">Voir les trois gîtes</a></li>
        </ul>
      </div>
      <div>
        <h5>Découvrir</h5>
        <ul>
          <li><a href="activites.html">Activités &amp; découverte</a></li>
          <li><a href="activites.html#avis">Avis de nos hôtes</a></li>
          <li><a href="contact.html">Bons cadeaux</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>
      <div>
        <h5>Informations</h5>
        <ul>
          <li><a href="legal.html?s=mentions">Mentions légales</a></li>
          <li><a href="legal.html?s=cgv">CGV &amp; annulation</a></li>
          <li><a href="legal.html?s=privacy">Confidentialité</a></li>
          <li><a href="legal.html?s=cookies">Cookies</a></li>
        </ul>
      </div>
    </div>
    <div class="ft-meta">
      <span>© 2026 Les Gîtes de Samoyas — SIRET 000 000 000 00000</span>
      <span class="meta-links">
        <a href="legal.html?s=mentions">Mentions</a>
        <a href="legal.html?s=cgv">CGV</a>
        <a href="legal.html?s=privacy">Confidentialité</a>
        <a href="legal.html?s=cookies">Cookies</a>
      </span>
    </div>
  </div>
</footer>
  `;
}

function renderCookies() {
  return `
<div class="cookies" id="cookies-banner" role="dialog" aria-labelledby="cookies-title">
  <h6 id="cookies-title">Votre confort, votre choix</h6>
  <p>Nous utilisons des cookies pour mesurer l'audience et améliorer votre lecture. Aucune case n'est pré-cochée — votre refus est aussi simple que l'acceptation.</p>
  <div class="cookies-actions">
    <button class="btn btn-ghost" data-cookies="refuse">Tout refuser</button>
    <button class="btn btn-ghost" data-cookies="custom">Personnaliser</button>
    <button class="btn btn-primary" data-cookies="accept">Tout accepter</button>
  </div>
</div>
  `;
}

/* ---------- Tweaks panel ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "greenPalette": "brief",
  "bgPalette": "neutral",
  "serifFamily": "playfair",
  "density": "generous",
  "season": "auto"
}/*EDITMODE-END*/;

function getTweaks() {
  try {
    const stored = localStorage.getItem("gites-tweaks");
    return Object.assign({}, TWEAK_DEFAULTS, stored ? JSON.parse(stored) : {});
  } catch (e) { return { ...TWEAK_DEFAULTS }; }
}
function setTweaks(patch) {
  const cur = getTweaks();
  const next = { ...cur, ...patch };
  try { localStorage.setItem("gites-tweaks", JSON.stringify(next)); } catch(e) {}
  applyTweaks(next);
  try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: patch }, "*"); } catch(e) {}
}
function applyTweaks(t) {
  const r = document.documentElement.style;
  if (t.greenPalette === "ds") {
    r.setProperty("--tw-green-dark", "#3d5b45");
    r.setProperty("--tw-green-mid",  "#5a7d67");
    r.setProperty("--tw-green-darker","#2d4533");
  } else {
    r.setProperty("--tw-green-dark", "#14683d");
    r.setProperty("--tw-green-mid",  "#2d8456");
    r.setProperty("--tw-green-darker","#0e4d2c");
  }
  if (t.bgPalette === "cream") {
    r.setProperty("--tw-bg-page", "#f6f8ee");
  } else {
    r.setProperty("--tw-bg-page", "#fbfaf6");
  }
  const serifMap = {
    playfair:  '"Playfair Display", Georgia, serif',
    fraunces:  '"Fraunces", Georgia, serif',
    cormorant: '"Cormorant Garamond", Georgia, serif',
  };
  r.setProperty("--tw-font-serif", serifMap[t.serifFamily] || serifMap.playfair);
  r.setProperty("--tw-density", t.density === "compact" ? "0.7" : "1");

  // seasonal accent palette (used everywhere)
  const seasons = {
    spring: { accent: "#7a9b4f", tint: "rgba(122,155,79,0.07)" },
    summer: { accent: "#b07735", tint: "rgba(176,119,53,0.07)" },
    autumn: { accent: "#a8552a", tint: "rgba(168,85,42,0.07)" },
    winter: { accent: "#3d6b78", tint: "rgba(61,107,120,0.06)" },
    auto:   { accent: "#a8552a", tint: "rgba(168,85,42,0.07)" }, // defaults to autumn-like Ardèche tone
  };
  const s = seasons[t.season] || seasons.auto;
  r.setProperty("--tw-season-accent", s.accent);
  r.setProperty("--tw-season-tint", s.tint);

  document.documentElement.dataset.season = t.season || "auto";
}

function renderTweaksPanel() {
  const t = getTweaks();
  return `
<div class="tw-panel" id="tw-panel" role="dialog" aria-labelledby="tw-title">
  <div class="tw-panel__head">
    <h6 id="tw-title">Tweaks</h6>
    <button id="tw-close" aria-label="Fermer">×</button>
  </div>
  <div class="tw-panel__body">

    <div class="tw-section">
      <span class="tw-section__label">Vert forêt</span>
      <div class="tw-swatch-row">
        <button class="tw-swatch ${t.greenPalette==='brief'?'is-on':''}" data-tw="greenPalette" data-val="brief">
          <span class="dot" style="background:#14683d"></span>#14683d · vif
        </button>
        <button class="tw-swatch ${t.greenPalette==='ds'?'is-on':''}" data-tw="greenPalette" data-val="ds">
          <span class="dot" style="background:#3d5b45"></span>#3d5b45 · sourd
        </button>
      </div>
    </div>

    <div class="tw-section">
      <span class="tw-section__label">Fond de page</span>
      <div class="tw-swatch-row">
        <button class="tw-swatch ${t.bgPalette==='neutral'?'is-on':''}" data-tw="bgPalette" data-val="neutral">
          <span class="dot" style="background:#fbfaf6;border-color:#ddd"></span>#fbfaf6 · neutre
        </button>
        <button class="tw-swatch ${t.bgPalette==='cream'?'is-on':''}" data-tw="bgPalette" data-val="cream">
          <span class="dot" style="background:#f6f8ee;border-color:#ddd"></span>#f6f8ee · cream
        </button>
      </div>
    </div>

    <div class="tw-section">
      <span class="tw-section__label">Typo titres</span>
      <div class="tw-segment three">
        <button class="${t.serifFamily==='playfair'?'is-on':''}" data-tw="serifFamily" data-val="playfair">Playfair</button>
        <button class="${t.serifFamily==='fraunces'?'is-on':''}" data-tw="serifFamily" data-val="fraunces">Fraunces</button>
        <button class="${t.serifFamily==='cormorant'?'is-on':''}" data-tw="serifFamily" data-val="cormorant">Cormorant</button>
      </div>
    </div>

    <div class="tw-section">
      <span class="tw-section__label">Densité</span>
      <div class="tw-segment">
        <button class="${t.density==='generous'?'is-on':''}" data-tw="density" data-val="generous">Généreuse</button>
        <button class="${t.density==='compact'?'is-on':''}" data-tw="density" data-val="compact">Compacte</button>
      </div>
    </div>

    <div class="tw-section">
      <span class="tw-section__label">Saison (accent global)</span>
      <div class="tw-segment five">
        <button class="${t.season==='auto'?'is-on':''}" data-tw="season" data-val="auto">Auto</button>
        <button class="${t.season==='spring'?'is-on':''}" data-tw="season" data-val="spring">Print.</button>
        <button class="${t.season==='summer'?'is-on':''}" data-tw="season" data-val="summer">Été</button>
        <button class="${t.season==='autumn'?'is-on':''}" data-tw="season" data-val="autumn">Aut.</button>
        <button class="${t.season==='winter'?'is-on':''}" data-tw="season" data-val="winter">Hiv.</button>
      </div>
    </div>

  </div>
</div>
  `;
}

/* ---------- Shell mount ---------- */
function mountSiteShell({ active = "home", showCookies = false, withTweaks = true } = {}) {
  applyTweaks(getTweaks());

  // Mount header
  const headerSlot = document.getElementById("site-header");
  if (headerSlot) headerSlot.outerHTML = renderHeader(active);

  // Mount footer
  const footerSlot = document.getElementById("site-footer");
  if (footerSlot) footerSlot.outerHTML = renderFooter();

  // Tweaks panel
  if (withTweaks) {
    document.body.insertAdjacentHTML("beforeend", renderTweaksPanel());
    const panel = document.getElementById("tw-panel");
    panel.querySelectorAll("[data-tw]").forEach(b => {
      b.addEventListener("click", () => {
        const key = b.dataset.tw, val = b.dataset.val;
        setTweaks({ [key]: val });
        // Re-render to update segmented state
        panel.outerHTML = renderTweaksPanel();
        wireTweakButtons();
        // Re-open after re-render
        const reopened = document.getElementById("tw-panel");
        reopened.classList.add("is-open");
      });
    });
    document.getElementById("tw-close").addEventListener("click", () => {
      document.getElementById("tw-panel").classList.remove("is-open");
      try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch(e) {}
    });
  }

  // Cookies banner (only on first visit + opt-in pages)
  if (showCookies && !localStorage.getItem("gites-cookies")) {
    document.body.insertAdjacentHTML("beforeend", renderCookies());
    const banner = document.getElementById("cookies-banner");
    requestAnimationFrame(() => banner.classList.add("is-open"));
    banner.querySelectorAll("[data-cookies]").forEach(b => {
      b.addEventListener("click", () => {
        try { localStorage.setItem("gites-cookies", b.dataset.cookies); } catch(e) {}
        banner.classList.remove("is-open");
        setTimeout(() => banner.remove(), 240);
      });
    });
  }

  // Mobile nav
  const burger = document.getElementById("burger-btn");
  const mobNav = document.getElementById("mob-nav");
  const mobClose = document.getElementById("mob-nav-close");
  if (burger && mobNav) {
    burger.addEventListener("click", () => mobNav.classList.add("is-open"));
    mobClose.addEventListener("click", () => mobNav.classList.remove("is-open"));
    mobNav.addEventListener("click", e => { if (e.target === mobNav) mobNav.classList.remove("is-open"); });
  }

  // Tweaks protocol — bind activation messages from the host
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type === "__activate_edit_mode") {
      document.getElementById("tw-panel")?.classList.add("is-open");
    } else if (d.type === "__deactivate_edit_mode") {
      document.getElementById("tw-panel")?.classList.remove("is-open");
    }
  });
  try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch(e) {}
}

function wireTweakButtons() {
  const panel = document.getElementById("tw-panel");
  if (!panel) return;
  panel.querySelectorAll("[data-tw]").forEach(b => {
    b.addEventListener("click", () => {
      const key = b.dataset.tw, val = b.dataset.val;
      setTweaks({ [key]: val });
      panel.outerHTML = renderTweaksPanel();
      wireTweakButtons();
      document.getElementById("tw-panel").classList.add("is-open");
    });
  });
  document.getElementById("tw-close")?.addEventListener("click", () => {
    document.getElementById("tw-panel").classList.remove("is-open");
    try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch(e) {}
  });
}

/* helpers exposed for pages */
window.SamoyasSite = { mountSiteShell, GITES };
