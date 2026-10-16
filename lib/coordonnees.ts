// Coordonnées du client saisies dans le tunnel : contrôle et mise en forme.
//
// Module PUR, appelé par le navigateur (messages sous les champs) et par le
// serveur (seul contrôle qui compte, app/api/reservations). Les champs sont
// ceux que le contrat imprime (components/pdf/ContratPDF.tsx) : locataire,
// second locataire facultatif, adresse, et la liste des occupants majeurs.
//
// LA CIVILITÉ EST FACULTATIVE (réponse du 15 octobre 2026). La Cour de justice
// de l'Union européenne a jugé le 9 janvier 2025 (aff. C-394/23, Mousse) qu'en
// exiger une pour vendre un billet n'était pas nécessaire (RGPD, minimisation).
// Sans civilité, le contrat imprime le nom seul.

export const CIVILITES = ["Mme", "M."] as const;
export type Civilite = (typeof CIVILITES)[number];

export interface Personne {
  /** Vide = non renseignée. */
  civilite: Civilite | "";
  prenom: string;
  nom: string;
}

export interface Coordonnees {
  locataire: Personne;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  /** Second locataire, cosignataire du contrat ; il est l'un des adultes. */
  colocataire: Personne | null;
  /** Les AUTRES adultes (ni le locataire ni le second locataire), prénom et nom. */
  autresAdultes: Array<{ prenom: string; nom: string }>;
}

/** Champ en erreur → phrase montrée sous le champ. Clés : « email », « autresAdultes.0.nom »… */
export type ErreursCoordonnees = Record<string, string>;

export type ResultatCoordonnees =
  | { ok: true; coordonnees: Coordonnees }
  | { ok: false; erreurs: ErreursCoordonnees };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEPHONE = /^\+?[0-9 ().-]{6,25}$/;

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

function civilite(v: unknown): Civilite | "" {
  return (CIVILITES as readonly string[]).includes(v as string) ? (v as Civilite) : "";
}

/** Nombre d'autres adultes à nommer, selon le nombre d'adultes et le second locataire. */
export function nombreAutresAdultes(adultes: number, avecColocataire: boolean): number {
  return Math.max(0, adultes - 1 - (avecColocataire ? 1 : 0));
}

/**
 * Contrôle des coordonnées pour `adultes` adultes. Les textes sont nettoyés
 * (espaces en trop) ; une valeur reçue d'un autre type est traitée comme vide.
 */
export function validerCoordonnees(brut: unknown, adultes: number): ResultatCoordonnees {
  const b = (brut ?? {}) as Record<string, unknown>;
  const erreurs: ErreursCoordonnees = {};

  function obligatoire(cle: string, valeur: string, max: number, message: string): string {
    if (!valeur) erreurs[cle] = message;
    else if (valeur.length > max) erreurs[cle] = `${max} caractères au plus.`;
    return valeur;
  }

  const loc = (b.locataire ?? {}) as Record<string, unknown>;
  const locataire: Personne = {
    civilite: civilite(loc.civilite),
    prenom: obligatoire("locataire.prenom", texte(loc.prenom), 100, "Indiquez votre prénom."),
    nom: obligatoire("locataire.nom", texte(loc.nom), 100, "Indiquez votre nom."),
  };

  const email = obligatoire("email", texte(b.email).toLowerCase(), 254, "Indiquez votre adresse e-mail.");
  if (email && !erreurs.email && !EMAIL.test(email)) erreurs.email = "Cette adresse e-mail n'est pas valide.";

  const telephone = obligatoire("telephone", texte(b.telephone), 25, "Indiquez votre téléphone.");
  if (telephone && !erreurs.telephone && !TELEPHONE.test(telephone)) {
    erreurs.telephone = "Ce numéro n'est pas valide.";
  }

  const adresse = obligatoire("adresse", texte(b.adresse), 200, "Indiquez votre adresse.");
  const codePostal = obligatoire("codePostal", texte(b.codePostal), 20, "Indiquez votre code postal.");
  const ville = obligatoire("ville", texte(b.ville), 100, "Indiquez votre ville.");
  const pays = obligatoire("pays", texte(b.pays), 60, "Indiquez votre pays.");

  let colocataire: Personne | null = null;
  if (b.colocataire) {
    const c = b.colocataire as Record<string, unknown>;
    colocataire = {
      civilite: civilite(c.civilite),
      prenom: obligatoire("colocataire.prenom", texte(c.prenom), 100, "Indiquez son prénom."),
      nom: obligatoire("colocataire.nom", texte(c.nom), 100, "Indiquez son nom."),
    };
    if (adultes < 2) {
      erreurs.colocataire = "Le second locataire est l'un des adultes du séjour : indiquez au moins 2 adultes.";
    }
  }

  const attendus = nombreAutresAdultes(adultes, colocataire !== null);
  const recus = Array.isArray(b.autresAdultes) ? b.autresAdultes : [];
  const autresAdultes: Array<{ prenom: string; nom: string }> = [];
  for (let i = 0; i < attendus; i += 1) {
    const a = (recus[i] ?? {}) as Record<string, unknown>;
    autresAdultes.push({
      prenom: obligatoire(`autresAdultes.${i}.prenom`, texte(a.prenom), 100, "Indiquez son prénom."),
      nom: obligatoire(`autresAdultes.${i}.nom`, texte(a.nom), 100, "Indiquez son nom."),
    });
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  return {
    ok: true,
    coordonnees: { locataire, email, telephone, adresse, codePostal, ville, pays, colocataire, autresAdultes },
  };
}

/** « Camille DURAND » : la forme des noms dans le contrat. */
export function nomComplet(p: { prenom: string; nom: string }): string {
  return `${p.prenom} ${p.nom.toUpperCase()}`;
}

/** « Occupants majeurs déclarés » du contrat : tous les adultes, locataire en tête. */
export function occupantsMajeurs(c: Coordonnees): string {
  return [c.locataire, ...(c.colocataire ? [c.colocataire] : []), ...c.autresAdultes].map(nomComplet).join(", ");
}
