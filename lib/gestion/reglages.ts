// L'ÉCRAN DES RÉGLAGES du back-office (Phase 5, lot 1, D-32) : ce qui se
// modifie, par rubrique, avec ses bornes ; et ce qui ne fait que s'afficher.
//
// Choix du gérant (3 novembre 2026) :
//   - les CONDITIONS DU CONTRAT (taux de l'acompte, délai du solde, délai du
//     virement de la caution, remboursement du solde) s'affichent mais ne se
//     modifient pas ici : les changer, c'est changer les conditions
//     commerciales, et cela mérite une session dédiée (réponse P = A) ;
//   - le TEXTE D'ACCORD pour la carte s'affiche avec ses versions, sans
//     modification (réponse T = A) ;
//   - le changement du COMPTE DE VIREMENT envoie une alerte « À TRAITER »
//     (réponse V = oui) : c'est la protection contre un faux RIB envoyé depuis
//     le site lui-même.
//
// Chaque enregistrement écrit dans le journal (lib/gestion/journal.ts) la
// valeur avant et après de chaque réglage changé. Les bornes reprennent les
// contraintes de la base (db/schema/reglages.ts) : la base reste le dernier
// rempart, l'écran dit en clair ce qui ne va pas avant elle.
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { alertes, reglages, textes_accord, TYPES_ALERTE, type TypeAlerte } from "@/db/schema";
import { inscrireProbleme } from "@/lib/courriels";
import { FORME_IBAN, ibanValide } from "@/lib/iban";
import { FORME_EMAIL } from "@/lib/suivi";

import { journaliser, type Acteur } from "./journal";

type LigneReglages = typeof reglages.$inferSelect;

type Champ =
  | { cle: keyof LigneReglages; libelle: string; sorte: "entier"; min: number; max: number; unite: string; aide?: string; vide?: string }
  | { cle: keyof LigneReglages; libelle: string; sorte: "heure"; aide?: string; avant?: string }
  | { cle: keyof LigneReglages; libelle: string; sorte: "texte"; aide?: string; vide?: string };

export interface Rubrique {
  id: string;
  titre: string;
  aide?: string;
  champs: Champ[];
}

/** Les rubriques modifiables, dans l'ordre de l'écran. */
export const RUBRIQUES: Rubrique[] = [
  {
    id: "tunnel",
    titre: "Tunnel de réservation",
    champs: [
      { cle: "duree_blocage_minutes", libelle: "Dates gardées pendant le paiement", sorte: "entier", min: 1, max: 120, unite: "minutes" },
      {
        cle: "option_duree_jours",
        libelle: "Option posée au téléphone : nuits gardées",
        sorte: "entier",
        min: 1,
        max: 30,
        unite: "jours",
        aide: "3 : une option posée lundi garde les nuits jusqu'à jeudi inclus.",
      },
      {
        cle: "delai_reservation_jours",
        libelle: "Délai minimum avant l'arrivée",
        sorte: "entier",
        min: 0,
        max: 365,
        unite: "jours",
        aide: "1 : réservable jusqu'à la veille de l'arrivée ; 0 : jusqu'au jour même.",
      },
    ],
  },
  {
    id: "synchronisation",
    titre: "Calendriers des plateformes",
    aide: "Les liens de Gîtes de France, Airbnb et Booking se règlent sur la fiche de chaque gîte.",
    champs: [
      {
        cle: "doublon_delai_heures",
        libelle: "Doublon avec une plateforme : le client est prévenu dans les",
        sorte: "entier",
        min: 1,
        max: 168,
        unite: "heures après son paiement",
        aide: "Annoncé au client avant le paiement, dans sa confirmation et dans les CGV. Passé ce délai, sa réservation est définitive.",
      },
    ],
  },
  {
    id: "horaires",
    titre: "Horaires des trois gîtes",
    aide: "Imprimés sur le contrat des nouvelles réservations ; une réservation déjà faite garde les siens.",
    champs: [
      { cle: "heure_arrivee", libelle: "Arrivée à partir de", sorte: "heure" },
      { cle: "heure_limite_arrivee", libelle: "Arrivée au plus tard", sorte: "heure" },
      { cle: "heure_depart", libelle: "Départ avant", sorte: "heure" },
    ],
  },
  {
    id: "bebes",
    titre: "Bébés",
    champs: [
      { cle: "bebe_age_limite", libelle: "Un enfant est un bébé en dessous de", sorte: "entier", min: 1, max: 17, unite: "ans" },
      { cle: "bebes_hors_capacite", libelle: "Bébés qui ne comptent pas dans la capacité", sorte: "entier", min: 0, max: 10, unite: "bébés" },
      { cle: "lits_bebe", libelle: "Lits bébé disponibles", sorte: "entier", min: 0, max: 10, unite: "lits" },
    ],
  },
  {
    id: "suivi",
    titre: "Page « Ma réservation »",
    champs: [
      { cle: "suivi_validite_jours", libelle: "Le lien reste ouvert après le départ", sorte: "entier", min: 0, max: 3650, unite: "jours" },
      { cle: "suivi_demandes_max", libelle: "« Retrouver ma réservation » : au plus", sorte: "entier", min: 1, max: 100, unite: "courriels par adresse" },
      { cle: "suivi_demandes_minutes", libelle: "… sur une durée de", sorte: "entier", min: 1, max: 10080, unite: "minutes" },
    ],
  },
  {
    id: "solde",
    titre: "Courriels du solde",
    aide: "En jours avant la date limite du solde (la date limite elle-même est écrite sur chaque réservation).",
    champs: [
      { cle: "solde_preavis_jours", libelle: "Préavis d'un prélèvement", sorte: "entier", min: 0, max: 60, unite: "jours avant" },
      { cle: "solde_lien_jours", libelle: "Lien pour payer le solde", sorte: "entier", min: 0, max: 60, unite: "jours avant" },
      { cle: "solde_rappel_jours", libelle: "Rappel du lien (0 : aucun rappel)", sorte: "entier", min: 0, max: 60, unite: "jours avant" },
      { cle: "solde_relance_jours", libelle: "Seconde alerte d'impayé", sorte: "entier", min: 1, max: 60, unite: "jours après la première" },
    ],
  },
  {
    id: "caution_carte",
    titre: "Caution par carte",
    aide: "Les jours (veille du départ, levée trois jours après) sont écrits dans le contrat et ne se règlent pas ici.",
    champs: [
      { cle: "caution_heure_blocage", libelle: "Préautorisation, la veille du départ, à", sorte: "heure" },
      { cle: "caution_heure_alerte", libelle: "Alerte la veille de la levée, à", sorte: "heure" },
      {
        cle: "caution_heure_liberation",
        libelle: "Levée automatique, à",
        sorte: "heure",
        avant: "12:00",
        aide: "Avant midi : au-delà, une préautorisation Visa peut avoir expiré.",
      },
    ],
  },
  {
    id: "virement",
    titre: "Caution par virement",
    aide:
      "Le compte de la SARL DE LA VOUTE qui reçoit les cautions par virement. Le changer envoie une alerte « À TRAITER » " +
      "à l'adresse des problèmes : c'est la protection contre un faux RIB.",
    champs: [
      { cle: "virement_titulaire", libelle: "Titulaire du compte", sorte: "texte", vide: "Aucun compte : le courriel du virement ne part pas." },
      { cle: "virement_iban", libelle: "IBAN", sorte: "texte", aide: "Les espaces sont acceptés ; la clé de contrôle est vérifiée." },
      { cle: "virement_bic", libelle: "BIC (facultatif)", sorte: "texte" },
      {
        cle: "virement_courriel_jours",
        libelle: "Courriel des coordonnées",
        sorte: "entier",
        min: 0,
        max: 60,
        unite: "jours avant la date limite du virement",
      },
    ],
  },
  {
    id: "abandons",
    titre: "Tentatives de réservation abandonnées",
    champs: [
      {
        cle: "abandon_conservation_jours",
        libelle: "Effacées après",
        sorte: "entier",
        min: 1,
        max: 365,
        unite: "jours",
        vide: "Vide : rien n'est effacé.",
        aide: "Durée à fixer avec le juriste (liste avant le premier client, point 12).",
      },
    ],
  },
  {
    id: "statistiques",
    titre: "Statistiques",
    champs: [
      {
        cle: "commission_taux",
        libelle: "Commission d'une plateforme, pour chiffrer les commissions évitées",
        sorte: "entier",
        min: 1,
        max: 50,
        unite: "%",
        vide: "Vide : les commissions évitées ne sont pas chiffrées.",
        aide: "Par exemple 15 : sur 10 000 € de séjours réservés en direct, 1 500 € de commissions évitées.",
      },
    ],
  },
  {
    id: "avis",
    titre: "Note Gîtes de France affichée à l'accueil",
    aide: "La note et le nombre d'avis vont ensemble : vides tous les deux, ces chiffres sont masqués. Ceux de chaque gîte se saisissent sur sa fiche.",
    champs: [
      { cle: "avis_note_centiemes", libelle: "Note sur 5 (par exemple 4,97)", sorte: "texte", vide: "Vide : chiffres masqués." },
      { cle: "avis_nombre", libelle: "Nombre d'avis", sorte: "entier", min: 0, max: 100000, unite: "avis", vide: "" },
      { cle: "avis_recommandation_pct", libelle: "Recommandation", sorte: "entier", min: 0, max: 100, unite: "%", vide: "" },
    ],
  },
  {
    id: "avis_clients",
    titre: "Avis de vos clients",
    aide: "Le courriel qui invite le client à donner son avis, et la durée de son lien. Les règles de publication sont celles de la politique des avis.",
    champs: [
      {
        cle: "avis_courriel_jours",
        libelle: "Courriel d'invitation envoyé",
        sorte: "entier",
        min: 0,
        max: 60,
        unite: "jours après le départ",
        aide: "1 : le lendemain du départ.",
      },
      {
        cle: "avis_lien_jours",
        libelle: "Le lien reste valable",
        sorte: "entier",
        min: 1,
        max: 365,
        unite: "jours après le départ",
      },
    ],
  },
  {
    id: "connexion",
    titre: "Connexion à la gestion",
    champs: [
      {
        cle: "gestion_appareil_jours",
        libelle: "Un appareil reste reconnu s'il s'est connecté dans les",
        sorte: "entier",
        min: 1,
        max: 365,
        unite: "derniers jours",
      },
      { cle: "gestion_inactivite_heures", libelle: "Déconnexion après", sorte: "entier", min: 1, max: 168, unite: "heures sans activité" },
      { cle: "gestion_essais_max", libelle: "Échecs avant attente", sorte: "entier", min: 1, max: 20, unite: "échecs" },
      { cle: "gestion_attente_minutes", libelle: "Attente", sorte: "entier", min: 1, max: 1440, unite: "minutes" },
      { cle: "gestion_code_minutes", libelle: "Code valable", sorte: "entier", min: 1, max: 60, unite: "minutes" },
      { cle: "gestion_lien_minutes", libelle: "Lien du mot de passe valable", sorte: "entier", min: 5, max: 1440, unite: "minutes" },
    ],
  },
];

const FORME_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORME_BIC = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
/** Note sur 5 : « 4,97 », « 4.9 », « 5 ». */
const FORME_NOTE = /^([0-5])(?:[.,](\d{1,2}))?$/;

/** Note saisie → centièmes (« 4,97 » → 497), sans passer par un nombre à virgule. */
export function noteEnCentiemes(saisie: string): number | null {
  const m = FORME_NOTE.exec(saisie.trim());
  if (!m) return null;
  const centiemes = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return centiemes <= 500 ? centiemes : null;
}

export function noteLisible(centiemes: number | null): string {
  if (centiemes === null) return "";
  return `${Math.trunc(centiemes / 100)},${String(centiemes % 100).padStart(2, "0")}`;
}

/** Valeur d'un réglage telle que le formulaire l'affiche. */
export function valeurAffichee(ligne: LigneReglages, champ: Champ): string {
  const v = ligne[champ.cle];
  if (v === null || v === undefined) return "";
  if (champ.cle === "avis_note_centiemes") return noteLisible(v as number);
  if (champ.sorte === "heure") return String(v).slice(0, 5);
  return String(v);
}

export async function lireReglages(): Promise<LigneReglages> {
  const [r] = await getDb().select().from(reglages).where(eq(reglages.id, 1));
  if (!r) throw new Error("ligne de réglages absente");
  return r;
}

export type IssueEnregistrement =
  | { issue: "erreurs"; erreurs: Record<string, string> }
  | { issue: "fait"; changes: string[] };

/** Lit et contrôle la saisie d'une rubrique. */
function lireSaisie(rubrique: Rubrique, saisie: Record<string, string>): { valeurs: Record<string, unknown>; erreurs: Record<string, string> } {
  const valeurs: Record<string, unknown> = {};
  const erreurs: Record<string, string> = {};
  for (const champ of rubrique.champs) {
    const brut = (saisie[champ.cle] ?? "").trim();
    if (champ.cle === "avis_note_centiemes") {
      if (brut === "") valeurs[champ.cle] = null;
      else {
        const n = noteEnCentiemes(brut);
        if (n === null) erreurs[champ.cle] = "Une note entre 0 et 5, avec au plus deux chiffres après la virgule.";
        else valeurs[champ.cle] = n;
      }
      continue;
    }
    if (champ.sorte === "entier") {
      if (brut === "" && champ.vide !== undefined) {
        valeurs[champ.cle] = null;
        continue;
      }
      if (!/^\d+$/.test(brut)) {
        erreurs[champ.cle] = "Un nombre entier, sans virgule.";
        continue;
      }
      const n = Number(brut);
      if (n < champ.min || n > champ.max) erreurs[champ.cle] = `Entre ${champ.min} et ${champ.max}.`;
      else valeurs[champ.cle] = n;
      continue;
    }
    if (champ.sorte === "heure") {
      if (!FORME_HEURE.test(brut)) erreurs[champ.cle] = "Une heure au format 18:00.";
      else if (champ.avant && brut >= champ.avant) erreurs[champ.cle] = `Avant ${champ.avant.replace(":", " h ")}.`;
      else valeurs[champ.cle] = brut;
      continue;
    }
    if (brut.length > 140) erreurs[champ.cle] = "140 caractères au plus.";
    else valeurs[champ.cle] = brut === "" ? null : brut;
  }

  // Contrôles qui lient plusieurs champs.
  if (rubrique.id === "horaires" && !erreurs.heure_arrivee && !erreurs.heure_limite_arrivee) {
    if (String(valeurs.heure_limite_arrivee) < String(valeurs.heure_arrivee)) {
      erreurs.heure_limite_arrivee = "L'arrivée au plus tard ne peut pas précéder l'heure d'arrivée.";
    }
  }
  if (rubrique.id === "virement") {
    const titulaire = valeurs.virement_titulaire as string | null;
    const iban = valeurs.virement_iban === null ? null : String(valeurs.virement_iban).replace(/\s/g, "").toUpperCase();
    const bic = valeurs.virement_bic === null ? null : String(valeurs.virement_bic).replace(/\s/g, "").toUpperCase();
    valeurs.virement_iban = iban;
    valeurs.virement_bic = bic;
    if ((titulaire === null) !== (iban === null)) {
      erreurs[titulaire === null ? "virement_titulaire" : "virement_iban"] = "Le titulaire et l'IBAN vont ensemble : remplissez les deux, ou videz les deux.";
    }
    if (iban !== null && (!FORME_IBAN.test(iban) || !ibanValide(iban))) {
      erreurs.virement_iban = "Cet IBAN n'est pas valable : vérifiez-le sur le RIB (la clé de contrôle ne correspond pas).";
    }
    if (bic !== null && !FORME_BIC.test(bic)) erreurs.virement_bic = "Un BIC fait 8 ou 11 caractères (par exemple AGRIFRPP882).";
    if (bic !== null && iban === null) erreurs.virement_bic = "Un BIC sans IBAN ne sert à rien.";
  }
  if (rubrique.id === "avis_clients" && !erreurs.avis_courriel_jours && !erreurs.avis_lien_jours) {
    if (Number(valeurs.avis_lien_jours) < Number(valeurs.avis_courriel_jours)) {
      erreurs.avis_lien_jours = "Le lien doit rester valable au moins jusqu'au jour du courriel.";
    }
  }
  if (rubrique.id === "avis" && !erreurs.avis_note_centiemes && !erreurs.avis_nombre) {
    if ((valeurs.avis_note_centiemes === null) !== (valeurs.avis_nombre === null)) {
      erreurs[valeurs.avis_nombre === null ? "avis_nombre" : "avis_note_centiemes"] = "La note et le nombre d'avis vont ensemble.";
    }
  }
  return { valeurs, erreurs };
}

function normaliser(v: unknown): unknown {
  // Les heures reviennent de la base en « 18:00:00 ».
  return typeof v === "string" && /^\d\d:\d\d:\d\d$/.test(v) ? v.slice(0, 5) : v;
}

/**
 * Enregistre une rubrique. Rien ne change si un seul champ est refusé.
 * `changes` : les réglages réellement modifiés ; « avis » demande au site
 * public de relire ses chiffres (revalidateTag, côté action).
 */
export async function enregistrerRubrique(rubriqueId: string, saisie: Record<string, string>, acteur: Acteur): Promise<IssueEnregistrement> {
  const rubrique = RUBRIQUES.find((r) => r.id === rubriqueId);
  if (!rubrique) return { issue: "erreurs", erreurs: { _: "Rubrique inconnue." } };
  const { valeurs, erreurs } = lireSaisie(rubrique, saisie);
  if (Object.keys(erreurs).length) return { issue: "erreurs", erreurs };

  return getDb().transaction(async (tx) => {
    const [avant] = await tx.select().from(reglages).where(eq(reglages.id, 1)).for("update");
    if (!avant) throw new Error("ligne de réglages absente");
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const [cle, apres] of Object.entries(valeurs)) {
      const ancien = normaliser(avant[cle as keyof LigneReglages]);
      if (ancien !== apres) changements[cle] = { avant: ancien, apres };
    }
    const changes = Object.keys(changements);
    if (!changes.length) return { issue: "fait" as const, changes };

    await tx
      .update(reglages)
      .set({ ...(Object.fromEntries(changes.map((c) => [c, valeurs[c]])) as Partial<LigneReglages>), updated_at: new Date() })
      .where(eq(reglages.id, 1));
    await journaliser(tx, { table: "reglages", ligne: "1", action: "reglage_modifie", acteur, details: { rubrique: rubrique.id, changements } });

    if (changes.includes("virement_titulaire") || changes.includes("virement_iban")) {
      const compte = (titulaire: unknown, iban: unknown) =>
        titulaire && iban ? { titulaire: String(titulaire), iban: String(iban) } : null;
      await inscrireProbleme(tx, "virement_compte_modifie", randomUUID(), null, {
        quand: new Date().toISOString(),
        appareil: typeof acteur === "string" ? acteur : acteur.description,
        avant: compte(avant.virement_titulaire, avant.virement_iban),
        apres: compte(valeurs.virement_titulaire, valeurs.virement_iban),
      });
    }
    return { issue: "fait" as const, changes };
  });
}

// ─── Alertes aux propriétaires ───────────────────────────────────────────────

export const LIBELLES_ALERTE: Record<TypeAlerte, { titre: string; aide: string }> = {
  reservation: { titre: "Nouvelle réservation payée", aide: "Un client vient de payer." },
  signature: { titre: "Contrat signé", aide: "Un client vient de signer son contrat." },
  probleme: {
    titre: "À TRAITER",
    aide: "Il faut intervenir (paiement remboursé, impayé, caution refusée, compte de virement modifié…). À laisser active.",
  },
  caution: { titre: "Caution", aide: "Caution bloquée, levée le lendemain, carte enregistrée." },
  avis: { titre: "Nouvel avis", aide: "Un client vient de laisser un avis, déjà publié sur la page du gîte." },
};

export async function lireAlertes() {
  return getDb().select().from(alertes).orderBy(asc(alertes.type));
}

/** `saisie` : pour chaque type, `{type}_active` (« on » si cochée) et `{type}_destinataires` (une adresse par ligne ou séparées par des virgules). */
export async function enregistrerAlertes(saisie: Record<string, string>, acteur: Acteur): Promise<IssueEnregistrement> {
  const erreurs: Record<string, string> = {};
  const nouvelles = new Map<TypeAlerte, { active: boolean; destinataires: string[] }>();
  for (const type of TYPES_ALERTE) {
    const active = saisie[`${type}_active`] === "on";
    const destinataires = [
      ...new Set(
        (saisie[`${type}_destinataires`] ?? "")
          .split(/[\s,;]+/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const mauvaise = destinataires.find((a) => a.length > 254 || !FORME_EMAIL.test(a));
    if (mauvaise) erreurs[`${type}_destinataires`] = `Adresse mal formée : ${mauvaise}`;
    else if (active && !destinataires.length) erreurs[`${type}_destinataires`] = "Une alerte active a besoin d'au moins une adresse.";
    nouvelles.set(type, { active, destinataires });
  }
  if (Object.keys(erreurs).length) return { issue: "erreurs", erreurs };

  return getDb().transaction(async (tx) => {
    const avant = await tx.select().from(alertes).for("update");
    const changements: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const ligne of avant) {
      const n = nouvelles.get(ligne.type);
      if (!n) continue;
      if (n.active === ligne.active && n.destinataires.join(",") === ligne.destinataires.join(",")) continue;
      changements[ligne.type] = {
        avant: { active: ligne.active, destinataires: ligne.destinataires },
        apres: n,
      };
      await tx.update(alertes).set({ active: n.active, destinataires: n.destinataires, updated_at: new Date() }).where(eq(alertes.type, ligne.type));
    }
    const changes = Object.keys(changements);
    if (changes.length) await journaliser(tx, { table: "alertes", action: "alerte_modifiee", acteur, details: { changements } });
    return { issue: "fait" as const, changes };
  });
}

// ─── Ce qui s'affiche sans se modifier ───────────────────────────────────────

export async function lireTextesAccord() {
  return getDb()
    .select({
      id: textes_accord.id,
      langue: textes_accord.langue,
      depuis: textes_accord.en_vigueur_depuis,
      modele: textes_accord.modele,
      modeleSolde: textes_accord.modele_solde,
      validePar: textes_accord.valide_par,
    })
    .from(textes_accord)
    .orderBy(asc(textes_accord.langue), asc(textes_accord.en_vigueur_depuis));
}
