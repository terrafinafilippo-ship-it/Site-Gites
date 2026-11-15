// Constantes métier de la SARL DE LA VOUTE (Les Gîtes de Samoyas).
//
// Ce fichier ne contient QUE les valeurs réellement constantes pour toute
// l'entreprise (identité légale, mentions obligatoires) et les VALEURS PAR DÉFAUT
// des paramètres opérationnels. Conformément au principe back-office, les valeurs
// propres à chaque gîte (nom, réf. GdF, adresse, forfait ménage, caution) viennent
// de la table `gites` en base et priment sur les défauts ci-dessous.

// ─── Identité légale de l'émetteur ────────────────────────────────────────────
// Seul domicile de ces valeurs (écart E-7 corrigé) : le contrat, les trois
// factures et la page de signature les lisent ici. Les changer change les
// prochains documents ; un document déjà émis garde ce qu'il a imprimé.
export const EMETTEUR = {
  raisonSociale: 'SARL DE LA VOUTE',
  forme: 'SARL',
  capital: '500 €',
  adresse: '176 Route de Samoyas',
  codePostalVille: '07100 Boulieu-lès-Annonay',
  villeRcs: 'Annonay',
  siren: '831 170 782',
  siret: '831 170 782 00013',
  telephone: '06 79 33 23 51',
  gerant: { civilite: 'M.', prenom: 'Nicolas', nom: 'Terrafina' },
  enseigne: 'Les Gîtes de Samoyas',
} as const;

// Lignes composées, imprimées telles quelles.
export const LIGNE_CAPITAL = `${EMETTEUR.forme} au capital de ${EMETTEUR.capital}`;
export const LIGNE_IMMATRICULATION = `RCS ${EMETTEUR.villeRcs} ${EMETTEUR.siren} — SIRET ${EMETTEUR.siret}`;

// ─── Mentions légales obligatoires ────────────────────────────────────────────
export const MENTIONS = {
  articleTva: 'article 261 D 4° du Code général des impôts',
  // Facture d'une retenue sur la caution (D-41) : un dédommagement, pas une
  // location. Phrase validée par le gérant le 14 novembre 2026.
  tvaRetenue: "Somme non soumise à la TVA : dédommagement d'un dégât, sans service rendu en échange.",
  mediateur: {
    nom: 'MEDICYS',
    adresse: '73 Boulevard de Clichy',
    codePostalVille: '75009 Paris',
    site: 'www.medicys.fr',
  },
} as const;

// ─── Paramètres financiers par défaut ─────────────────────────────────────────
// Le taux d'acompte et le délai du solde ne sont plus ici : ce sont des
// réglages (table reglages, Phase 3 lot 3), recopiés sur chaque réservation
// (reservations.taux_acompte, reservations.delai_solde_jours).
//
// UNITÉS : tout MONTANT est un ENTIER DE CENTIMES (voir lib/centimes.ts) ;
// un TAUX est un nombre décimal en pourcentage (un taux n'est pas de l'argent).
export const FORFAIT_MENAGE_DEFAUT = 8000; // centimes (80,00 €)

// Paramètres opérationnels du contrat (valeurs par défaut ; surchargées par la
// réservation ou le gîte en back-office quand la colonne est renseignée).
export const HEURE_ARRIVEE_DEFAUT = '18:00';
export const HEURE_DEPART_DEFAUT = '09:00';
export const HEURE_LIMITE_ARRIVEE_DEFAUT = '20:00';
// Les délais d'annulation ne sont pas ici : la date limite du solde
// (reservations.delai_solde_jours) et le délai de remboursement du solde
// (reservations.delai_remboursement_solde_heures), recopiés des réglages (D-26).

// ─── Signature électronique simple (SES) ─────────────────────────────────────
// Texte de consentement EXACT : affiché au signataire ET enregistré mot pour mot
// dans `signatures.consentement_texte`. Toute modification change la preuve de
// consentement — ne pas reformuler sans décision métier.
//
// L'article 12 cité est celui que le contrat imprime (point 8) : il nomme les
// équipements de la fiche figée du gîte (lib/montants.ts, ficheContrat). Avec
// spa et sauna, la phrase est celle d'avant le point 8.
export const texteConsentement = (
  numeroContrat: string,
  equipements: { a_spa: boolean | null; a_sauna: boolean | null },
): string => {
  const spa = equipements.a_spa === true;
  const sauna = equipements.a_sauna === true;
  const article12 =
    spa && sauna
      ? ", y compris l'article 12 relatif aux équipements spa et sauna"
      : spa
        ? ", y compris l'article 12 relatif à l'équipement spa"
        : sauna
          ? ", y compris l'article 12 relatif à l'équipement sauna"
          : "";
  return (
    `Je reconnais avoir lu et j'accepte le contrat de location ${numeroContrat} ` +
    `et l'ensemble de ses conditions${article12}.`
  );
};

// ─── Numérotation ─────────────────────────────────────────────────────────────
// Le numéro est généré EXCLUSIVEMENT par la fonction SQL `creer_facture` (série FAC).
// Aucune logique de numérotation ne doit exister côté JS.
export const SERIE_FACTURE = 'FAC' as const;
