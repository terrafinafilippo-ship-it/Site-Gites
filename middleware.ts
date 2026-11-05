// Aiguillage des langues (décision D-22). Toutes les pages vivent sous
// app/[lang]/ ; le visiteur, lui, ne voit jamais « /fr » :
//
//   /gites/laphine      → réécrit en interne vers /fr/gites/laphine
//   /en/gites/laphine   → servi tel quel (lang = en)
//   /fr/gites/laphine   → redirigé vers /gites/laphine : une même page à deux
//                         adresses diviserait son référencement.
//
// La langue est aussi posée dans l'en-tête `x-langue`, pour les composants qui
// ne reçoivent pas `params` (la page introuvable).
//
// Les routes API, les fichiers de Next et les fichiers statiques (tout chemin
// qui contient un point : /assets/logo.png, /favicon.ico) ne passent pas par ici.
//
// Le BACK-OFFICE (/gestion, Phase 5, D-32) échappe à l'aiguillage : français
// seulement, jamais indexé (X-Robots-Tag), jamais mis en cache, jamais affiché
// dans le cadre d'un autre site. Sans témoin de session, toute page autre que
// celles de la connexion renvoie à la connexion ; le témoin lui-même est
// vérifié en base par chaque page et chaque action (app/gestion/outils.ts).
import { NextResponse, type NextRequest } from "next/server";

import { ENTETE_LANGUE, LANGUE_DEFAUT, type Langue } from "@/lib/i18n/langues";

function avecLangue(request: NextRequest, langue: Langue): Headers {
  const entetes = new Headers(request.headers);
  entetes.set(ENTETE_LANGUE, langue);
  return entetes;
}

const GESTION_SANS_SESSION = new Set([
  "/gestion/connexion",
  "/gestion/code",
  "/gestion/mot-de-passe",
  "/gestion/mot-de-passe-oublie",
]);

function gestion(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const reponse =
    GESTION_SANS_SESSION.has(pathname) || request.cookies.has("gestion_session")
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/gestion/connexion", request.url));
  reponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  reponse.headers.set("Cache-Control", "no-store");
  reponse.headers.set("X-Frame-Options", "DENY");
  reponse.headers.set("Referrer-Policy", "no-referrer");
  return reponse;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/gestion" || pathname.startsWith("/gestion/")) return gestion(request);

  if (pathname === `/${LANGUE_DEFAUT}` || pathname.startsWith(`/${LANGUE_DEFAUT}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(LANGUE_DEFAUT.length + 1) || "/";
    return NextResponse.redirect(url, 301);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return NextResponse.next({ request: { headers: avecLangue(request, "en") } });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${LANGUE_DEFAUT}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: avecLangue(request, LANGUE_DEFAUT) } });
}

export const config = {
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
