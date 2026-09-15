// Constantes métier de la SARL DE LA VOUTE (Les Gîtes de Samoyas).
//
// Ce fichier ne contient QUE les valeurs réellement constantes pour toute
// l'entreprise (identité légale, mentions obligatoires) et les VALEURS PAR DÉFAUT
// des paramètres opérationnels. Conformément au principe back-office, les valeurs
// propres à chaque gîte (nom, réf. GdF, adresse, forfait ménage, caution) viennent
// de la table `gites` en base et priment sur les défauts ci-dessous.

// ─── Identité légale de l'émetteur ────────────────────────────────────────────
export const EMETTEUR = {
  raisonSociale: 'SARL DE LA VOUTE',
  formeCapital: 'SARL au capital de 500 €',
  adresse: '176 Route de Samoyas',
  codePostalVille: '07100 Boulieu-lès-Annonay',
  rcs: 'RCS Annonay 831 170 782',
  siret: 'SIRET 831 170 782 00013',
  gerant: 'Nicolas TERRAFINA',
  enseigne: 'Les Gîtes de Samoyas',
} as const;

// ─── Mentions légales obligatoires (factures B2C) ─────────────────────────────
export const MENTIONS = {
  tva: 'Exonération de TVA, article 261 D 4° du CGI',
  mediation:
    'MEDICYS, 73 Boulevard de Clichy, 75009 Paris (www.medicys.fr), article L.612-1 du Code de la consommation',
} as const;

// ─── Paramètres financiers par défaut ─────────────────────────────────────────
// Acompte = 30 % / solde = 70 % du TOTAL TTC (séjour + forfait ménage + options
// + taxe de séjour). La valeur de la taxe est fournie par la réservation et
// n'est jamais recalculée ici.
//
// UNITÉS : tout MONTANT est un ENTIER DE CENTIMES (voir lib/centimes.ts) ;
// un TAUX est un nombre décimal en pourcentage (un taux n'est pas de l'argent).
export const TAUX_ACOMPTE = 30; // % (taux)
export const TAUX_SOLDE = 70; // % (taux)
export const FORFAIT_MENAGE_DEFAUT = 8000; // centimes (80,00 €)
export const CAUTION_DEFAUT = 50000; // centimes (500,00 €, non facturée)
export const DELAI_SOLDE_DEFAUT = 30; // jours avant l'arrivée

// Paramètres opérationnels du contrat (valeurs par défaut ; surchargées par la
// réservation ou le gîte en back-office quand la colonne est renseignée).
export const HEURE_ARRIVEE_DEFAUT = '18:00';
export const HEURE_DEPART_DEFAUT = '09:00';
export const HEURE_LIMITE_ARRIVEE_DEFAUT = '20:00';
export const DELAI_TOLERANCE_COMMERCIALE_DEFAUT = 7; // jours

// ─── Signature électronique simple (SES) ─────────────────────────────────────
// Texte de consentement EXACT : affiché au signataire ET enregistré mot pour mot
// dans `signatures.consentement_texte`. Toute modification change la preuve de
// consentement — ne pas reformuler sans décision métier.
export const texteConsentement = (numeroContrat: string): string =>
  `Je reconnais avoir lu et j'accepte le contrat de location ${numeroContrat} ` +
  `et l'ensemble de ses conditions, y compris l'article 12 relatif aux ` +
  `équipements spa et sauna.`;

// ─── Numérotation ─────────────────────────────────────────────────────────────
// Le numéro est généré EXCLUSIVEMENT par la fonction SQL `creer_facture` (série FAC).
// Aucune logique de numérotation ne doit exister côté JS.
export const SERIE_FACTURE = 'FAC' as const;
