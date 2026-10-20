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
//
// Les messages sont dans la langue du client (décision D-22) ; les valeurs
// saisies, elles, sont enregistrées telles quelles.

import type { Bilingue, Langue } from "@/lib/i18n/langues";

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

/** Libellé d'une civilité dans la langue de la page (la valeur enregistrée reste « Mme » ou « M. »). */
export const LIBELLES_CIVILITE: Bilingue<Record<Civilite, string>> = {
  fr: { Mme: "Mme", "M.": "M." },
  en: { Mme: "Mrs/Ms", "M.": "Mr" },
};

const MESSAGES: Bilingue<{
  tropLong: (max: number) => string;
  votrePrenom: string;
  votreNom: string;
  email: string;
  emailInvalide: string;
  telephone: string;
  telephoneInvalide: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  sonPrenom: string;
  sonNom: string;
  colocataireSansDeuxAdultes: string;
}> = {
  fr: {
    tropLong: (max) => `${max} caractères au plus.`,
    votrePrenom: "Indiquez votre prénom.",
    votreNom: "Indiquez votre nom.",
    email: "Indiquez votre adresse e-mail.",
    emailInvalide: "Cette adresse e-mail n'est pas valide.",
    telephone: "Indiquez votre téléphone.",
    telephoneInvalide: "Ce numéro n'est pas valide.",
    adresse: "Indiquez votre adresse.",
    codePostal: "Indiquez votre code postal.",
    ville: "Indiquez votre ville.",
    pays: "Indiquez votre pays.",
    sonPrenom: "Indiquez son prénom.",
    sonNom: "Indiquez son nom.",
    colocataireSansDeuxAdultes: "Le second locataire est l'un des adultes du séjour : indiquez au moins 2 adultes.",
  },
  en: {
    tropLong: (max) => `${max} characters at most.`,
    votrePrenom: "Please enter your first name.",
    votreNom: "Please enter your last name.",
    email: "Please enter your email address.",
    emailInvalide: "This email address is not valid.",
    telephone: "Please enter your phone number.",
    telephoneInvalide: "This number is not valid.",
    adresse: "Please enter your address.",
    codePostal: "Please enter your postcode.",
    ville: "Please enter your town or city.",
    pays: "Please enter your country.",
    sonPrenom: "Please enter their first name.",
    sonNom: "Please enter their last name.",
    colocataireSansDeuxAdultes: "The second tenant is one of the adults staying: please select at least 2 adults.",
  },
};

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
export function validerCoordonnees(brut: unknown, adultes: number, langue: Langue = "fr"): ResultatCoordonnees {
  const b = (brut ?? {}) as Record<string, unknown>;
  const erreurs: ErreursCoordonnees = {};
  const m = MESSAGES[langue];

  function obligatoire(cle: string, valeur: string, max: number, message: string): string {
    if (!valeur) erreurs[cle] = message;
    else if (valeur.length > max) erreurs[cle] = m.tropLong(max);
    return valeur;
  }

  const loc = (b.locataire ?? {}) as Record<string, unknown>;
  const locataire: Personne = {
    civilite: civilite(loc.civilite),
    prenom: obligatoire("locataire.prenom", texte(loc.prenom), 100, m.votrePrenom),
    nom: obligatoire("locataire.nom", texte(loc.nom), 100, m.votreNom),
  };

  const email = obligatoire("email", texte(b.email).toLowerCase(), 254, m.email);
  if (email && !erreurs.email && !EMAIL.test(email)) erreurs.email = m.emailInvalide;

  const telephone = obligatoire("telephone", texte(b.telephone), 25, m.telephone);
  if (telephone && !erreurs.telephone && !TELEPHONE.test(telephone)) {
    erreurs.telephone = m.telephoneInvalide;
  }

  const adresse = obligatoire("adresse", texte(b.adresse), 200, m.adresse);
  const codePostal = obligatoire("codePostal", texte(b.codePostal), 20, m.codePostal);
  const ville = obligatoire("ville", texte(b.ville), 100, m.ville);
  const pays = obligatoire("pays", texte(b.pays), 60, m.pays);

  let colocataire: Personne | null = null;
  if (b.colocataire) {
    const c = b.colocataire as Record<string, unknown>;
    colocataire = {
      civilite: civilite(c.civilite),
      prenom: obligatoire("colocataire.prenom", texte(c.prenom), 100, m.sonPrenom),
      nom: obligatoire("colocataire.nom", texte(c.nom), 100, m.sonNom),
    };
    if (adultes < 2) {
      erreurs.colocataire = m.colocataireSansDeuxAdultes;
    }
  }

  const attendus = nombreAutresAdultes(adultes, colocataire !== null);
  const recus = Array.isArray(b.autresAdultes) ? b.autresAdultes : [];
  const autresAdultes: Array<{ prenom: string; nom: string }> = [];
  for (let i = 0; i < attendus; i += 1) {
    const a = (recus[i] ?? {}) as Record<string, unknown>;
    autresAdultes.push({
      prenom: obligatoire(`autresAdultes.${i}.prenom`, texte(a.prenom), 100, m.sonPrenom),
      nom: obligatoire(`autresAdultes.${i}.nom`, texte(a.nom), 100, m.sonNom),
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
