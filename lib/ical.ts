// LE FORMAT iCal (RFC 5545), juste ce que la synchronisation des calendriers
// demande (Phase 7, D-44) : lire les séjours annoncés par une plateforme,
// écrire les nuits prises d'un gîte. Aucune lecture en base, aucun réseau :
// lib/synchronisation.ts s'en charge.
//
// LIRE. Un séjour est un VEVENT : DTSTART est le jour d'arrivée, DTEND le jour
// de départ (exclu, comme une nuit d'hôtel). Les plateformes écrivent des
// jours (« DTSTART;VALUE=DATE:20261207 ») ; une heure est acceptée aussi : en
// UTC (« Z »), elle est ramenée au jour de Paris, sinon le jour écrit compte.
// Sans DTEND : DURATION en jours, sinon une nuit. Un événement annulé
// (STATUS:CANCELLED) ou marqué libre (TRANSP:TRANSPARENT) est ignoré, comme
// un événement sans nuit. Le SUMMARY n'est pas lu : il peut porter un nom.
//
// ÉCRIRE. Une plage de nuits consécutives donne un VEVENT « Indisponible »,
// sans aucun nom ; son UID dérive du gîte et des dates, stable d'une lecture
// à l'autre.
import { ajouterJours, aujourdhuiParis, jourUtc } from "@/lib/dates-civiles";

export interface Plage {
  /** Jour d'arrivée (première nuit), aaaa-mm-jj. */
  arrivee: string;
  /** Jour de départ (exclu), aaaa-mm-jj. */
  depart: string;
}

function jourValide(iso: string): boolean {
  try {
    jourUtc(iso);
    return true;
  } catch {
    return false;
  }
}

/** La valeur d'une date iCal en jour de Paris ; `null` si elle est illisible. */
function jourIcal(valeur: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(valeur.trim());
  if (!m) return null;
  const jour = `${m[1]}-${m[2]}-${m[3]}`;
  if (!jourValide(jour)) return null;
  if (m[4] && m[7]) return aujourdhuiParis(new Date(`${jour}T${m[4]}:${m[5]}:${m[6]}Z`));
  return jour;
}

/** Une ligne « NOM;PARAM=…:valeur » : le nom en majuscules et la valeur (le premier « : » hors guillemets). */
function decouper(ligne: string): { nom: string; valeur: string } | null {
  let guillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '"') guillemets = !guillemets;
    else if (c === ":" && !guillemets) {
      const nom = ligne.slice(0, i).split(";")[0].trim().toUpperCase();
      return { nom, valeur: ligne.slice(i + 1) };
    }
  }
  return null;
}

/**
 * Les séjours d'un calendrier iCal, dans l'ordre du fichier (doublons
 * compris) ; `null` si le texte n'est pas un calendrier.
 */
export function lireIcal(texte: string): Plage[] | null {
  // Les lignes longues sont repliées : un saut de ligne suivi d'un espace ou d'une tabulation.
  const lignes = texte.replace(/^﻿/, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  if (!lignes.some((l) => l.trim().toUpperCase() === "BEGIN:VCALENDAR")) return null;

  const plages: Plage[] = [];
  let ev: Record<string, string> | null = null;
  for (const ligne of lignes) {
    const marque = ligne.trim().toUpperCase();
    if (marque === "BEGIN:VEVENT") {
      ev = {};
      continue;
    }
    if (marque === "END:VEVENT") {
      if (ev) {
        const plage = plageEvenement(ev);
        if (plage) plages.push(plage);
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const p = decouper(ligne);
    // Le premier DTSTART compte : un composant imbriqué (VALARM) n'en a pas d'autre.
    if (p && !(p.nom in ev)) ev[p.nom] = p.valeur.trim();
  }
  return plages;
}

function plageEvenement(ev: Record<string, string>): Plage | null {
  if ((ev.STATUS ?? "").toUpperCase() === "CANCELLED") return null;
  if ((ev.TRANSP ?? "").toUpperCase() === "TRANSPARENT") return null;
  const arrivee = ev.DTSTART ? jourIcal(ev.DTSTART) : null;
  if (!arrivee) return null;
  let depart: string | null;
  if (ev.DTEND) {
    depart = jourIcal(ev.DTEND);
  } else {
    const duree = /^P(\d{1,4})D$/i.exec(ev.DURATION ?? "");
    depart = ajouterJours(arrivee, duree ? Number(duree[1]) : 1);
  }
  if (!depart || depart <= arrivee) return null;
  return { arrivee, depart };
}

/** Des nuits (aaaa-mm-jj, dans n'importe quel ordre) en plages de nuits consécutives. */
export function plagesDeNuits(nuits: string[]): Plage[] {
  const triees = [...new Set(nuits)].sort();
  const plages: Plage[] = [];
  for (const nuit of triees) {
    const derniere = plages[plages.length - 1];
    if (derniere && derniere.depart === nuit) derniere.depart = ajouterJours(nuit, 1);
    else plages.push({ arrivee: nuit, depart: ajouterJours(nuit, 1) });
  }
  return plages;
}

const compact = (iso: string) => iso.replace(/-/g, "");

/** Le calendrier iCal des plages données (lignes terminées par CRLF, comme le veut la norme). */
export function ecrireIcal(giteId: string, plages: Plage[], maintenant: Date = new Date()): string {
  const horodatage = maintenant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Les Gites de Samoyas//Calendrier//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const p of plages) {
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${giteId}-${compact(p.arrivee)}-${compact(p.depart)}@gitesdesamoyas.fr`,
      `DTSTAMP:${horodatage}`,
      `DTSTART;VALUE=DATE:${compact(p.arrivee)}`,
      `DTEND;VALUE=DATE:${compact(p.depart)}`,
      "SUMMARY:Indisponible",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lignes.push("END:VCALENDAR");
  return `${lignes.join("\r\n")}\r\n`;
}
