// POST /api/reservations — le client arrive sur l'écran de paiement : la
// réservation est enregistrée « en attente de paiement » et ses nuits sont
// bloquées pendant la durée réglée (20 minutes au départ).
//
// Le corps ne porte JAMAIS de montant qui serait cru : le devis est recalculé
// par le serveur (lib/tunnel.ts). Le total que le client avait sous les yeux
// est seulement comparé, pour l'avertir si le prix a changé entre-temps.
//
// Réponses : 201 enregistrée · 400 demande invalide · 404 gîte inconnu ·
// 409 refus métier (règle, capacité, dates prises — avec les autres gîtes
// libres) · 429 trop de tentatives · 503 tunnel indisponible (base, réglages) ·
// 500 erreur inattendue. Un 409 est une situation normale ; un 503 ou un 500
// est une panne, journalisée comme telle.
//
// `langue` (« fr » par défaut, ou « en ») : langue des messages renvoyés,
// celle de la page du client (D-22). Le journal du serveur reste en français.
import { NextResponse } from "next/server";

import { validerCoordonnees } from "@/lib/coordonnees";
import { isGiteId } from "@/lib/data/gites";
import { estLangue, type Bilingue, type Langue } from "@/lib/i18n/langues";
import { messageErreur } from "@/lib/route-helpers";
import { enregistrerTentative, TunnelIndisponible } from "@/lib/tunnel";

const MESSAGES: Bilingue<{
  corpsInvalide: string;
  giteInconnu: (gite: string) => string;
  champsInvalides: string;
  tropDeTentatives: string;
  datesPrises: string;
  indisponible: string;
  erreur: string;
}> = {
  fr: {
    corpsInvalide: "Corps JSON invalide.",
    giteInconnu: (gite) => `Gîte inconnu : « ${gite} ».`,
    champsInvalides: "Certaines coordonnées sont à compléter.",
    tropDeTentatives: "Trop de tentatives en peu de temps. Réessayez dans quelques minutes, ou appelez-nous.",
    datesPrises: "Ces dates viennent d'être prises.",
    indisponible: "La réservation en ligne est momentanément indisponible.",
    erreur: "Erreur inattendue.",
  },
  en: {
    corpsInvalide: "Invalid JSON body.",
    giteInconnu: (gite) => `Unknown gîte: “${gite}”.`,
    champsInvalides: "Some of your details need completing.",
    tropDeTentatives: "Too many attempts in a short time. Please try again in a few minutes, or call us.",
    datesPrises: "These dates have just been taken.",
    indisponible: "Online booking is temporarily unavailable.",
    erreur: "Unexpected error.",
  },
};

// ─── Limite des tentatives ────────────────────────────────────────────────────
// Sans limite, un robot pourrait bloquer toutes les dates en boucle sans jamais
// payer. Cinq tentatives par adresse en dix minutes suffisent à un client qui
// revient en arrière pour changer ses dates. Le compteur vit en mémoire : il
// repart de zéro au redémarrage, ce qui est sans gravité pour cet usage.
//
// Seules comptent les demandes complètes, celles qui vont réellement bloquer
// des dates : une demande mal formée ne prend rien.
//
// L'adresse est la DERNIÈRE de X-Forwarded-For : en production, celle
// qu'ajoute Traefik (Coolify), les précédentes étant fournies par le client et
// falsifiables. Next.js ne remplit cet en-tête que s'il est absent, avec
// l'adresse de la connexion (node_modules/next/dist/server/base-server.js) :
// en local, c'est 127.0.0.1 ou ::1, et la limite ne s'applique pas — ce sont
// les tests, pas un client. Si un jour le proxy cessait d'écrire l'en-tête,
// tous les clients partageraient l'adresse du proxy : la limite deviendrait
// globale. À vérifier au déploiement (docs/04-architecture.md).
const TENTATIVES_MAX = 5;
const FENETRE_MS = 10 * 60_000;
const ADRESSES_LOCALES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const tentativesParAdresse = new Map<string, number[]>();

function adresseClient(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  const adresses = xff.split(",").map((a) => a.trim()).filter(Boolean);
  const derniere = adresses.length > 0 ? adresses[adresses.length - 1] : null;
  return derniere && !ADRESSES_LOCALES.has(derniere) ? derniere : null;
}

function tentativeAutorisee(adresse: string, maintenant: number): boolean {
  const recentes = (tentativesParAdresse.get(adresse) ?? []).filter((t) => maintenant - t < FENETRE_MS);
  if (recentes.length >= TENTATIVES_MAX) {
    tentativesParAdresse.set(adresse, recentes);
    return false;
  }
  recentes.push(maintenant);
  tentativesParAdresse.set(adresse, recentes);
  // Ménage occasionnel des adresses inactives.
  if (tentativesParAdresse.size > 5_000) {
    for (const [cle, dates] of tentativesParAdresse) {
      if (dates.every((t) => maintenant - t >= FENETRE_MS)) tentativesParAdresse.delete(cle);
    }
  }
  return true;
}

// ─── Route ────────────────────────────────────────────────────────────────────

function reponse(status: number, corps: Record<string, unknown>): NextResponse {
  return NextResponse.json(corps, { status, headers: { "Cache-Control": "no-store" } });
}

function entier(v: unknown): number {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : Number.NaN;
}

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(request: Request) {
  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return reponse(400, { code: "CORPS_INVALIDE", error: MESSAGES.fr.corpsInvalide });
  }
  if (!corps || typeof corps !== "object") {
    return reponse(400, { code: "CORPS_INVALIDE", error: MESSAGES.fr.corpsInvalide });
  }
  const langue: Langue = estLangue(corps.langue) ? corps.langue : "fr";
  const m = MESSAGES[langue];

  const gite = chaine(corps.gite);
  if (!isGiteId(gite)) return reponse(404, { code: "GITE_INCONNU", error: m.giteInconnu(gite) });

  const demande = {
    arrivee: chaine(corps.arrivee),
    depart: chaine(corps.depart),
    adultes: entier(corps.adultes),
    enfants: entier(corps.enfants),
    bebes: entier(corps.bebes),
  };
  const coordonnees = validerCoordonnees(
    corps.coordonnees,
    Number.isSafeInteger(demande.adultes) ? demande.adultes : 0,
    langue,
  );
  if (!coordonnees.ok) {
    return reponse(400, {
      code: "CHAMPS_INVALIDES",
      error: m.champsInvalides,
      erreurs: coordonnees.erreurs,
    });
  }
  const totalAttendu = typeof corps.totalAttendu === "number" && Number.isSafeInteger(corps.totalAttendu)
    ? corps.totalAttendu
    : null;

  const adresse = adresseClient(request);
  if (adresse && !tentativeAutorisee(adresse, Date.now())) {
    return reponse(429, {
      code: "TROP_DE_TENTATIVES",
      error: m.tropDeTentatives,
    });
  }

  try {
    const r = await enregistrerTentative(gite, demande, coordonnees.coordonnees, totalAttendu, langue);
    if (r.ok) {
      return reponse(201, {
        id: r.id,
        reference: r.reference,
        expireA: r.expireA.toISOString(),
        dureeBlocageMinutes: r.dureeBlocageMinutes,
        devis: r.devis,
        prixModifie: r.prixModifie,
      });
    }
    if (r.raison === "DATES_PRISES") {
      return reponse(409, {
        code: "DATES_PRISES",
        error: m.datesPrises,
        nuitsPrises: r.nuitsPrises,
        alternatives: r.alternatives,
      });
    }
    return reponse(409, { code: "DEVIS_REFUSE", motif: r.refus.motif, error: r.refus.message });
  } catch (erreur) {
    if (erreur instanceof TunnelIndisponible) {
      // Base injoignable, réglages absents : le tunnel REFUSE, il ne devine pas.
      console.error(`[api/reservations] TUNNEL INDISPONIBLE (${gite}) :`, erreur.message);
      return reponse(503, {
        code: "TUNNEL_INDISPONIBLE",
        error: m.indisponible,
      });
    }
    console.error(`[api/reservations] ERREUR (${gite}) :`, messageErreur(erreur));
    return reponse(500, { code: "ERREUR", error: m.erreur });
  }
}
