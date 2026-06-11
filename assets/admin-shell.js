/* =========================================================
   ADMIN SHELL — Sidebar + Topbar partagés
   Usage: data-page="dashboard|reservations|calendrier|..."
          data-title="..."   data-sub="..."
   ========================================================= */

(function () {
  const NAV = [
    { group: "Pilotage", items: [
      { key: "dashboard",    label: "Tableau de bord",  href: "index.html",       icon: "home" },
      { key: "reservations", label: "Réservations",     href: "reservations.html", icon: "book", badge: { text: "3", kind: "danger" } },
      { key: "calendrier",   label: "Calendrier",       href: "calendrier.html",  icon: "calendar" },
    ]},
    { group: "Contenu & flux", items: [
      { key: "contrats",     label: "Contrats & factures",  href: "contrats.html", icon: "doc",  badge: { text: "2", kind: "" } },
      { key: "tarifs",       label: "Tarifs & saisons",     href: "tarifs.html",   icon: "tag" },
      { key: "gites",        label: "Pages des gîtes",      href: "gites.html",    icon: "house" },
      { key: "bons",         label: "Bons cadeaux",          href: "bons.html",     icon: "gift" },
    ]},
    { group: "Config", items: [
      { key: "parametres",   label: "Paramètres",       href: "parametres.html",   icon: "settings" },
    ]},
  ];

  const ICONS = {
    home:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/></svg>',
    book:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/></svg>',
    calendar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>',
    doc:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    tag:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12 12 20 3 11V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    house:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    star:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 14.6 9.1 21 9.7 16.2 14 17.6 20.3 12 17 6.4 20.3 7.8 14 3 9.7 9.4 9.1"/></svg>',
    gift:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12"/><path d="M8 9c-1.5 0-3-1-3-3a2 2 0 0 1 4 0v3h-1zM16 9c1.5 0 3-1 3-3a2 2 0 0 0-4 0v3h1z"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  function renderShell() {
    const body = document.body;
    const activePage = body.dataset.page || "dashboard";
    const pageTitle = body.dataset.title || "";
    const pageSub   = body.dataset.sub || "";
    const crumb     = body.dataset.crumb || "";

    // Wrap existing content
    const contentEl = document.createElement("div");
    contentEl.className = "adm-main";
    // Move existing body children into contentEl
    const main = document.createElement("main");
    main.className = "adm-page";
    if (body.dataset.wide === "1") main.classList.add("adm-page--wide");
    while (body.firstChild) main.appendChild(body.firstChild);

    // Topbar
    const topbar = document.createElement("div");
    topbar.className = "adm-topbar";
    topbar.innerHTML = `
      <div>
        ${crumb ? `<div class="adm-topbar__crumb">${crumb}</div>` : ""}
        <div class="adm-topbar__title">${pageTitle}</div>
        ${pageSub ? `<div class="adm-topbar__sub">${pageSub}</div>` : ""}
      </div>
      <div class="adm-topbar__right">
        <label class="adm-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" placeholder="Rechercher client, réservation, gîte…">
          <kbd>⌘K</kbd>
        </label>
        <button class="adm-btn adm-btn--ghost" title="Notifications" aria-label="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2v1h16v-1z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
        </button>
        <button class="adm-btn adm-btn--primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Nouvelle réservation
        </button>
      </div>
    `;
    contentEl.appendChild(topbar);
    contentEl.appendChild(main);

    // Sidebar
    const sidebar = document.createElement("aside");
    sidebar.className = "adm-sidebar";
    let navHtml = `
      <a href="index.html" class="adm-sidebar__brand">
        <img src="../assets/Logo-icon.png" alt="Les Gîtes de Samoyas">
        <div class="adm-sidebar__brand-text">
          Samoyas
          <small>Back office</small>
        </div>
      </a>
    `;
    NAV.forEach(group => {
      navHtml += `<div class="adm-sidebar__group">${group.group}</div>`;
      navHtml += `<nav class="adm-nav">`;
      group.items.forEach(it => {
        const isActive = it.key === activePage;
        const badge = it.badge ? `<span class="adm-nav__badge ${it.badge.kind}">${it.badge.text}</span>` : "";
        navHtml += `
          <a href="${it.href}" class="adm-nav__item${isActive ? ' is-active' : ''}">
            ${ICONS[it.icon] || ""}
            <span>${it.label}</span>
            ${badge}
          </a>
        `;
      });
      navHtml += `</nav>`;
    });
    navHtml += `
      <div class="adm-sidebar__foot">
        <div class="adm-sidebar__avatar">PT</div>
        <div>
          <div class="adm-sidebar__user-name">Patricia Terrafina</div>
          <div>Propriétaire · Connectée</div>
        </div>
      </div>
    `;
    sidebar.innerHTML = navHtml;

    // App container
    const app = document.createElement("div");
    app.className = "adm-app";
    app.appendChild(sidebar);
    app.appendChild(contentEl);
    body.appendChild(app);
  }

  // Init when DOM ready (script is at end of body so DOM is parsed)
  renderShell();
})();
