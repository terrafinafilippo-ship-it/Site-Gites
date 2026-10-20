"use client";

// Tunnel de réservation : dates et voyageurs, coordonnées, récapitulatif,
// paiement.
//
// Le prix affiché est calculé ICI, par le même code que le serveur
// (lib/devis.ts), avec les données lues en base au chargement de la page. Il
// ne sert qu'à l'affichage : à l'arrivée sur l'écran de paiement, le serveur
// recalcule tout, enregistre la réservation et bloque les dates
// (POST /api/reservations). Revenir en arrière lève ce blocage
// (DELETE /api/reservations/{id}).
//
// LANGUE (D-22) : textes, dates et montants suivent la langue de la page ; les
// messages de refus viennent de lib/devis.ts et de l'API dans la même langue.
// Les dates et les voyageurs sont recopiés dans l'adresse de la page : un
// rechargement ou un changement de langue les retrouve. Les coordonnées n'y
// sont jamais (données personnelles) : elles sont à ressaisir.
//
// Le paiement lui-même est branché au lot 3 (Stripe) : d'ici là, le bouton
// « Payer » reste inactif. Les écrans « refused » et « 3ds-failed » sont ceux
// du prototype, conservés pour le lot 3 et inaccessibles d'ici là.

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ImageSlot from "@/components/ui/ImageSlot";
import { DELAI_SOLDE_DEFAUT, TAUX_ACOMPTE } from "@/lib/constantes";
import {
  CIVILITES,
  LIBELLES_CIVILITE,
  nombreAutresAdultes,
  validerCoordonnees,
  type ErreursCoordonnees,
} from "@/lib/coordonnees";
import type { GiteData } from "@/lib/data/gites";
import {
  controlerDates,
  controlerOccupants,
  dateLongue,
  devisSejour,
  preparerDevis,
  type Devis,
  type Occupants,
} from "@/lib/devis";
import { fmtDateCourte, fmtEuro, fmtHeure, fmtPrix, fmtTaux } from "@/lib/format";
import { lien, type Bilingue, type Langue } from "@/lib/i18n/langues";
import type { Alternative, DonneesTunnel } from "@/lib/tunnel";
import Calendrier from "./Calendrier";
import EnteteTunnel from "./EnteteTunnel";
import styles from "./page.module.css";

export type FunnelState = "step1" | "step2" | "step3" | "step4" | "conflict" | "refused" | "3ds-failed";

/** Dates et voyageurs pré-remplis par l'adresse de la page (autre gîte libre, rechargement, changement de langue). */
export interface DemandeInitiale {
  arrivee?: string;
  depart?: string;
  adultes?: number;
  enfants?: number;
  bebes?: number;
  /** Reprendre à la saisie des coordonnées (le client l'avait atteinte). */
  coordonnees?: boolean;
}

/** La réservation enregistrée par le serveur, dates bloquées. */
interface Tentative {
  id: string;
  reference: string;
  devis: Devis;
  prixModifie: boolean;
  /** Fin du blocage selon l'horloge du navigateur (durée reçue + heure de réception). */
  echeance: number;
}

interface Formulaire {
  civilite: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  coCivilite: string;
  coPrenom: string;
  coNom: string;
  autres: Array<{ prenom: string; nom: string }>;
}

function formulaireVide(langue: Langue): Formulaire {
  return {
    civilite: "", prenom: "", nom: "", email: "", telephone: "",
    adresse: "", codePostal: "", ville: "", pays: langue === "fr" ? "France" : "",
    coCivilite: "", coPrenom: "", coNom: "", autres: [],
  };
}

// ─── Textes ──────────────────────────────────────────────────────────────────

/** « 2 nuits », « 1 adulte »… : le nombre et le mot accordé. */
type Compte = (n: number) => string;

function compte(singulier: string, pluriel: string): Compte {
  return (n) => `${n} ${n > 1 ? pluriel : singulier}`;
}

const TEXTES: Bilingue<{
  nuits: Compte;
  adultes: Compte;
  enfants: Compte;
  bebes: Compte;
  personnes: (n: number) => string;
  erreurEnregistrement: string;
  erreurConnexion: string;
  arrivee: string;
  depart: string;
  voyageurs: string;
  menage: string;
  taxe: string;
  totalTtc: string;
  ttc: string;
  totalite: string;
  acompte: (taux: string) => string;
  aujourdhui: (montant: string) => string;
  caution: (montant: string) => string;
  solde: (montant: string, date: string) => string;
  arriveeProche: (jours: number) => string;
  arriveeProcheCourt: (jours: number) => string;
  etapes: [string, string, string, string];
  titre1: string;
  intro1: string;
  vosDates: string;
  aChoisir: string;
  aPartirDe: (heure: string) => string;
  avant: (heure: string) => string;
  aucuneDate: string;
  titreAdultes: string;
  detailAdultes: string;
  titreEnfants: string;
  detailEnfants: (age: number) => string;
  titreBebes: string;
  detailBebes: (age: number) => string;
  unDeMoins: (titre: string) => string;
  unDePlus: (titre: string) => string;
  accueille: (gite: string, n: number) => string;
  sansCompterUn: (age: number) => string;
  sansCompterPlusieurs: (n: number, age: number) => string;
  aucunLit: string;
  unSeulLit: string;
  plusieursLits: (n: number) => string;
  continuer: string;
  retour: string;
  titre2: string;
  intro2: string;
  identite: string;
  civilite: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adressePostale: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  secondLocataire: string;
  ajouterColocataire: string;
  autresAdultes: string;
  autresAdultesAide: string;
  adultePrenom: (n: number) => string;
  titre3: string;
  intro3: string;
  litBebe: string;
  litBebeFourni: string;
  litBebeDetail: string;
  inclus: string;
  demandeParticuliere: string;
  recapDetaille: string;
  nuitsDu: (du: string, au: string | null) => string;
  taxeDetail: (adultes: string, nuits: string) => string;
  aReglerTotalite: string;
  aReglerAcompte: (taux: string) => string;
  cautionDetail: (montant: string) => ReactNode;
  blocageAVenir: (minutes: number) => string;
  enregistrement: string;
  procederPaiement: string;
  paiementSejour: string;
  paiementAcompte: string;
  reservation: (ref: string) => string;
  bloqueesEncore: string;
  prixModifie: (total: string) => string;
  delaiEcoule: (minutes: number) => string;
  rebloquer: string;
  carte: string;
  paiementSecurise: string;
  champsStripe: string;
  paiementFerme: string;
  accepteAvant: string;
  cgv: string;
  accepteApres: string;
  avis: string;
  payer: (montant: string) => string;
  troisDS: string;
  titreConflit: string;
  introConflit: string;
  aucunDebit: string;
  autresGites: string;
  duAu: (du: string, au: string) => string;
  choisir: (nom: string) => string;
  aucunAutre: string;
  autresDates: string;
  aide: string;
  titreRefus: string;
  introRefus: string;
  rienPreleve: string;
  troisPistes: string;
  reessayerTitre: string;
  reessayerTexte: string;
  reessayer: string;
  autreCarteTitre: string;
  autreCarteTexte: string;
  changerCarte: string;
  appelerTitre: string;
  appelerTexte: string;
  coordonnees: string;
  titre3ds: string;
  intro3ds: string;
  rienDebite: string;
  troisChoses: string;
  appliTitre: string;
  appliTexte: string;
  patienterTitre: string;
  patienterTexte: string;
  autreCarte3dsTitre: string;
  autreCarte3dsTexte: string;
  reprendre: string;
  appeler: string;
}> = {
  fr: {
    nuits: compte("nuit", "nuits"),
    adultes: compte("adulte", "adultes"),
    enfants: compte("enfant", "enfants"),
    bebes: compte("bébé", "bébés"),
    personnes: (n) => `${n} personnes`,
    erreurEnregistrement: "La réservation n'a pas pu être enregistrée.",
    erreurConnexion: "La connexion a échoué. Vérifiez votre réseau, puis réessayez.",
    arrivee: "Arrivée",
    depart: "Départ",
    voyageurs: "Voyageurs",
    menage: "Forfait ménage",
    taxe: "Taxe de séjour",
    totalTtc: "Total TTC",
    ttc: "TTC",
    totalite: "Totalité du séjour",
    acompte: (taux) => `Acompte ${taux}`,
    aujourdhui: (montant) => `${montant} aujourd'hui`,
    caution: (montant) =>
      `Caution de ${montant} : préautorisation sur votre carte la veille du départ, sans débit sauf dégât constaté.`,
    solde: (montant, date) => `Solde de ${montant} à régler au plus tard le ${date}.`,
    arriveeProche: (jours) => `Arrivée à moins de ${jours} jours : le séjour se règle en totalité à la réservation.`,
    arriveeProcheCourt: (jours) => `Arrivée à moins de ${jours} jours : le séjour se règle en totalité.`,
    etapes: ["Dates & voyageurs", "Coordonnées", "Options & récapitulatif", "Paiement"],
    titre1: "Quand venez-vous, et combien êtes-vous ?",
    intro1: "Choisissez vos dates dans le calendrier : les nuits déjà prises sont rayées.",
    vosDates: "Vos dates",
    aChoisir: "À choisir",
    aPartirDe: (heure) => `À partir de ${heure}`,
    avant: (heure) => `Avant ${heure}`,
    aucuneDate: "Aucune date n'est encore ouverte à la réservation en ligne pour ce gîte.",
    titreAdultes: "Adultes",
    detailAdultes: "18 ans et plus",
    titreEnfants: "Enfants",
    detailEnfants: (age) => `De ${age} à 17 ans`,
    titreBebes: "Bébés",
    detailBebes: (age) => `Moins de ${age} ans`,
    unDeMoins: (titre) => `${titre} : un de moins`,
    unDePlus: (titre) => `${titre} : un de plus`,
    accueille: (gite, n) => `${gite} accueille ${n} personnes`,
    sansCompterUn: (age) => `, sans compter un bébé de moins de ${age} ans`,
    sansCompterPlusieurs: (n, age) => `, sans compter ${n} bébés de moins de ${age} ans`,
    aucunLit: "Aucun lit bébé n'est disponible.",
    unSeulLit: "Un seul lit bébé est disponible.",
    plusieursLits: (n) => `${n} lits bébé sont disponibles.`,
    continuer: "Continuer",
    retour: "Retour",
    titre2: "Vos coordonnées",
    intro2: "Nous vous transmettons toutes les informations pratiques par email — assurez-vous qu'il soit lisible.",
    identite: "Identité",
    civilite: "Civilité (facultatif)",
    prenom: "Prénom",
    nom: "Nom",
    email: "Email",
    telephone: "Téléphone",
    adressePostale: "Adresse postale",
    adresse: "Adresse",
    codePostal: "Code postal",
    ville: "Ville",
    pays: "Pays",
    secondLocataire: "Second locataire",
    ajouterColocataire: "Ajouter un second locataire au contrat (l'un des adultes du séjour).",
    autresAdultes: "Les autres adultes du séjour",
    autresAdultesAide: "Le contrat indique le nom de chaque adulte présent.",
    adultePrenom: (n) => `Adulte ${n} — prénom`,
    titre3: "Quelques options pour votre séjour",
    intro3: "Aucune n'est obligatoire — choisissez ce qui vous fait plaisir.",
    litBebe: "Lit bébé",
    litBebeFourni: "Lit bébé fourni",
    litBebeDetail: "Lit et linge inclus, sans surcoût. Précisez-le nous si vous en avez besoin.",
    inclus: "Inclus",
    demandeParticuliere:
      "Une demande particulière (panier d'accueil, soin à domicile, transfert) ? Écrivez-nous à l'arrivée — nous nous arrangeons sur place.",
    recapDetaille: "Récapitulatif détaillé",
    nuitsDu: (du, au) => `Nuits du ${du}${au ? ` au ${au}` : ""}`,
    taxeDetail: (adultes, nuits) => `${adultes} × ${nuits} · les mineurs ne la paient pas`,
    aReglerTotalite: "À régler maintenant — totalité du séjour",
    aReglerAcompte: (taux) => `À régler maintenant — acompte ${taux}`,
    cautionDetail: (montant) => (
      <>
        Caution de {montant} : préautorisation sur votre carte bancaire la veille de votre départ, levée au
        plus tard 3 jours après. <strong>Non débitée</strong> sauf dégât constaté.
      </>
    ),
    blocageAVenir: (minutes) =>
      `À l'étape suivante, vos dates sont bloquées pendant ${minutes} minutes, le temps du paiement.`,
    enregistrement: "Enregistrement…",
    procederPaiement: "Procéder au paiement",
    paiementSejour: "Paiement du séjour",
    paiementAcompte: "Paiement de l’acompte",
    reservation: (ref) => `Réservation ${ref}.`,
    bloqueesEncore: "Vos dates restent bloquées encore",
    prixModifie: (total) => `Le prix a changé depuis votre choix : le total est désormais de ${total}.`,
    delaiEcoule: (minutes) => `Le délai de ${minutes} minutes est écoulé : vos dates ne sont plus bloquées.`,
    rebloquer: "Bloquer à nouveau mes dates",
    carte: "Carte bancaire",
    paiementSecurise: "Paiement sécurisé · Stripe",
    champsStripe: "Champs de carte Stripe Elements",
    paiementFerme: "Le paiement en ligne n'est pas encore ouvert.",
    accepteAvant: "J'accepte les ",
    cgv: "conditions générales de vente",
    accepteApres: ", le barème d'annulation et les conditions du dépôt de garantie.",
    avis: "J'accepte d'être recontacté(e) après mon séjour pour publier un avis vérifié sur Gîtes de France.",
    payer: (montant) => `Payer ${montant}`,
    troisDS:
      "En cliquant Payer, vous serez peut-être redirigé(e) vers votre application bancaire pour valider l'opération (3-D Secure).",
    titreConflit: "Ces dates viennent d'être prises.",
    introConflit:
      "Pendant que vous remplissiez vos coordonnées, une autre réservation a retenu tout ou partie de ces nuits.",
    aucunDebit: "Aucun débit · 0,00 €",
    autresGites: "Les autres gîtes libres aux mêmes dates",
    duAu: (du, au) => `Du ${du} au ${au}`,
    choisir: (nom) => `Choisir ${nom}`,
    aucunAutre: "Aucun autre gîte n'est libre à ces dates pour ce nombre de voyageurs.",
    autresDates: "Choisir d'autres dates",
    aide: "Nous écrire pour de l'aide",
    titreRefus: "Votre paiement n'a pas pu aboutir.",
    introRefus:
      "Votre banque n'a pas autorisé l'opération. Ne vous inquiétez pas — c'est fréquent et ça se règle en quelques secondes.",
    rienPreleve: "Aucune somme prélevée · dates non bloquées",
    troisPistes: "Trois pistes pour finaliser votre séjour :",
    reessayerTitre: "Réessayer maintenant",
    reessayerTexte:
      "Même carte, même paiement. Souvent ça passe au second essai si votre banque a juste demandé une confirmation.",
    reessayer: "Réessayer le paiement",
    autreCarteTitre: "Utiliser une autre carte",
    autreCarteTexte: "Vous pouvez aussi tenter avec une autre carte. Aucun blocage : vos données saisies sont gardées.",
    changerCarte: "Changer de carte",
    appelerTitre: "Nous appeler directement",
    appelerTexte: "Patricia (+33 6 79 33 23 51) et Nicolas (+33 6 66 89 96 24) vous bloquent les dates à la voix.",
    coordonnees: "Voir nos coordonnées",
    titre3ds: "L'authentification 3-D Secure n'a pas abouti.",
    intro3ds:
      "Pas d'inquiétude — votre banque attendait une confirmation et n'en a pas reçu à temps. C'est très fréquent.",
    rienDebite: "0 € débité — votre carte est intacte",
    troisChoses: "Trois choses à essayer dans l'ordre",
    appliTitre: "Ouvrir votre appli bancaire",
    appliTexte: "Une notification y attend peut-être votre validation. Acceptez-la, puis revenez ici pour relancer.",
    patienterTitre: "Patienter 1 à 2 minutes",
    patienterTexte: "Si la validation se fait par SMS, il arrive avec un peu de délai. Réessayez ensuite avec la même carte.",
    autreCarte3dsTitre: "Essayer une autre carte",
    autreCarte3dsTexte: "Si l'échec se répète, basculez sur une autre carte. Vos informations sont conservées.",
    reprendre: "Reprendre le paiement",
    appeler: "Nous appeler",
  },
  en: {
    nuits: compte("night", "nights"),
    adultes: compte("adult", "adults"),
    enfants: compte("child", "children"),
    bebes: compte("baby", "babies"),
    personnes: (n) => `${n} people`,
    erreurEnregistrement: "The booking could not be saved.",
    erreurConnexion: "The connection failed. Check your network, then try again.",
    arrivee: "Arrival",
    depart: "Departure",
    voyageurs: "Guests",
    menage: "Cleaning fee",
    taxe: "Tourist tax",
    totalTtc: "Total incl. tax",
    ttc: "incl. tax",
    totalite: "Full stay",
    acompte: (taux) => `Down payment ${taux}`,
    aujourdhui: (montant) => `${montant} today`,
    caution: (montant) =>
      `Security deposit of ${montant}: a pre-authorisation on your card the day before departure, not charged unless damage is found.`,
    solde: (montant, date) => `Balance of ${montant} to be paid by ${date} at the latest.`,
    arriveeProche: (jours) => `Arrival in less than ${jours} days: the full stay is paid on booking.`,
    arriveeProcheCourt: (jours) => `Arrival in less than ${jours} days: the full stay is paid now.`,
    etapes: ["Dates & guests", "Your details", "Options & summary", "Payment"],
    titre1: "When are you coming, and how many of you?",
    intro1: "Choose your dates in the calendar: nights already taken are crossed out.",
    vosDates: "Your dates",
    aChoisir: "To choose",
    aPartirDe: (heure) => `From ${heure}`,
    avant: (heure) => `Before ${heure}`,
    aucuneDate: "No dates are open for online booking for this gîte yet.",
    titreAdultes: "Adults",
    detailAdultes: "18 and over",
    titreEnfants: "Children",
    detailEnfants: (age) => `Aged ${age} to 17`,
    titreBebes: "Babies",
    detailBebes: (age) => `Under ${age}`,
    unDeMoins: (titre) => `${titre}: one fewer`,
    unDePlus: (titre) => `${titre}: one more`,
    accueille: (gite, n) => `${gite} accommodates ${n} people`,
    sansCompterUn: (age) => `, not counting one baby under ${age}`,
    sansCompterPlusieurs: (n, age) => `, not counting ${n} babies under ${age}`,
    aucunLit: "No baby cot is available.",
    unSeulLit: "Only one baby cot is available.",
    plusieursLits: (n) => `${n} baby cots are available.`,
    continuer: "Continue",
    retour: "Back",
    titre2: "Your details",
    intro2: "We send you all the practical information by email — please make sure it is correct.",
    identite: "Identity",
    civilite: "Title (optional)",
    prenom: "First name",
    nom: "Last name",
    email: "Email",
    telephone: "Phone",
    adressePostale: "Postal address",
    adresse: "Address",
    codePostal: "Postcode",
    ville: "Town / city",
    pays: "Country",
    secondLocataire: "Second tenant",
    ajouterColocataire: "Add a second tenant to the contract (one of the adults staying).",
    autresAdultes: "The other adults staying",
    autresAdultesAide: "The contract gives the name of each adult present.",
    adultePrenom: (n) => `Adult ${n} — first name`,
    titre3: "A few options for your stay",
    intro3: "None is compulsory — choose whatever you like.",
    litBebe: "Baby cot",
    litBebeFourni: "Baby cot provided",
    litBebeDetail: "Cot and linen included, at no extra cost. Let us know if you need it.",
    inclus: "Included",
    demandeParticuliere:
      "A special request (welcome basket, in-home treatment, transfer)? Write to us on arrival — we will arrange it on site.",
    recapDetaille: "Detailed summary",
    nuitsDu: (du, au) => `Nights from ${du}${au ? ` to ${au}` : ""}`,
    taxeDetail: (adultes, nuits) => `${adultes} × ${nuits} · minors do not pay it`,
    aReglerTotalite: "To pay now — full stay",
    aReglerAcompte: (taux) => `To pay now — down payment ${taux}`,
    cautionDetail: (montant) => (
      <>
        Security deposit of {montant}: a pre-authorisation on your bank card the day before your departure,
        released 3 days later at the latest. <strong>Not charged</strong> unless damage is found.
      </>
    ),
    blocageAVenir: (minutes) =>
      `At the next step, your dates are held for ${minutes} minutes, while you pay.`,
    enregistrement: "Saving…",
    procederPaiement: "Proceed to payment",
    paiementSejour: "Payment for the stay",
    paiementAcompte: "Down payment",
    reservation: (ref) => `Booking ${ref}.`,
    bloqueesEncore: "Your dates are held for another",
    prixModifie: (total) => `The price has changed since your choice: the total is now ${total}.`,
    delaiEcoule: (minutes) => `The ${minutes}-minute hold has expired: your dates are no longer held.`,
    rebloquer: "Hold my dates again",
    carte: "Bank card",
    paiementSecurise: "Secure payment · Stripe",
    champsStripe: "Stripe Elements card fields",
    paiementFerme: "Online payment is not open yet.",
    accepteAvant: "I accept the ",
    cgv: "terms and conditions of sale",
    accepteApres: ", the cancellation scale and the security deposit conditions.",
    avis: "I agree to be contacted after my stay to publish a verified review on Gîtes de France.",
    payer: (montant) => `Pay ${montant}`,
    troisDS:
      "When you click Pay, you may be redirected to your banking app to confirm the payment (3-D Secure).",
    titreConflit: "These dates have just been taken.",
    introConflit:
      "While you were filling in your details, another booking took some or all of these nights.",
    aucunDebit: "Nothing charged · €0.00",
    autresGites: "The other gîtes available on the same dates",
    duAu: (du, au) => `From ${du} to ${au}`,
    choisir: (nom) => `Choose ${nom}`,
    aucunAutre: "No other gîte is available on these dates for this number of guests.",
    autresDates: "Choose other dates",
    aide: "Write to us for help",
    titreRefus: "Your payment could not go through.",
    introRefus:
      "Your bank did not authorise the payment. Don't worry — it happens often and can be sorted in a few seconds.",
    rienPreleve: "Nothing charged · dates not held",
    troisPistes: "Three ways to complete your booking:",
    reessayerTitre: "Try again now",
    reessayerTexte:
      "Same card, same payment. It often works on the second try if your bank just asked for a confirmation.",
    reessayer: "Retry the payment",
    autreCarteTitre: "Use another card",
    autreCarteTexte: "You can also try another card. Nothing is lost: the details you entered are kept.",
    changerCarte: "Change card",
    appelerTitre: "Call us directly",
    appelerTexte: "Patricia (+33 6 79 33 23 51) and Nicolas (+33 6 66 89 96 24) can hold the dates for you by phone.",
    coordonnees: "See our contact details",
    titre3ds: "3-D Secure authentication did not succeed.",
    intro3ds:
      "Don't worry — your bank was waiting for a confirmation and did not receive it in time. This is very common.",
    rienDebite: "€0 charged — your card is untouched",
    troisChoses: "Three things to try, in order",
    appliTitre: "Open your banking app",
    appliTexte: "A notification may be waiting for your approval there. Accept it, then come back here to try again.",
    patienterTitre: "Wait 1 to 2 minutes",
    patienterTexte: "If confirmation is by text message, it can take a little while. Then try again with the same card.",
    autreCarte3dsTitre: "Try another card",
    autreCarte3dsTexte: "If it fails again, switch to another card. Your information is kept.",
    reprendre: "Resume payment",
    appeler: "Call us",
  },
};

function libelleVoyageurs(o: Occupants, langue: Langue): string {
  const t = TEXTES[langue];
  const parties = [t.adultes(o.adultes)];
  if (o.enfants) parties.push(t.enfants(o.enfants));
  if (o.bebes) parties.push(t.bebes(o.bebes));
  return parties.join(" · ");
}

function minutesSecondes(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}

// ─── Icônes ──────────────────────────────────────────────────────────────────

const ArrowRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);
const ChevronLeft = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="15 6 9 12 15 18" />
  </svg>
);
const NoChargeCheck = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <polyline points="8 12 11 15 16 9" />
  </svg>
);

// ─── Petits composants ───────────────────────────────────────────────────────

function Champ({
  label,
  requis,
  valeur,
  onChange,
  erreur,
  type = "text",
  autoComplete,
}: {
  label: string;
  requis?: boolean;
  valeur: string;
  onChange: (v: string) => void;
  erreur?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className={`${styles.field}${erreur ? ` ${styles.hasError}` : ""}`}>
      <label>
        {label} {requis && <span>*</span>}
        <input
          type={type}
          value={valeur}
          autoComplete={autoComplete}
          aria-invalid={erreur ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <div className={styles.fieldError}>{erreur}</div>
    </div>
  );
}

function ChampCivilite({
  langue,
  valeur,
  onChange,
}: {
  langue: Langue;
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label>
        {TEXTES[langue].civilite}
        <select value={valeur} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {CIVILITES.map((c) => (
            <option key={c} value={c}>{LIBELLES_CIVILITE[langue][c]}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Compteur({
  langue,
  titre,
  detail,
  valeur,
  min,
  peutAjouter,
  onChange,
}: {
  langue: Langue;
  titre: string;
  detail: string;
  valeur: number;
  min: number;
  peutAjouter: boolean;
  onChange: (n: number) => void;
}) {
  const t = TEXTES[langue];
  return (
    <div className={styles.stepperRow}>
      <div className={styles.stepperRowInfo}>
        <strong>{titre}</strong>
        <small>{detail}</small>
      </div>
      <div className={styles.stepper}>
        <button type="button" aria-label={t.unDeMoins(titre)} disabled={valeur <= min} onClick={() => onChange(valeur - 1)}>
          −
        </button>
        <span>{valeur}</span>
        <button type="button" aria-label={t.unDePlus(titre)} disabled={!peutAjouter} onClick={() => onChange(valeur + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

// ─── Tunnel ──────────────────────────────────────────────────────────────────

export default function ReserverFunnel({
  langue,
  gite,
  donnees,
  initial,
}: {
  langue: Langue;
  gite: GiteData;
  donnees: DonneesTunnel;
  initial: DemandeInitiale;
}) {
  const t = TEXTES[langue];
  const l = (chemin: string) => lien(langue, chemin);
  const euros = (centimes: number) => fmtEuro(centimes, langue);
  const date = (iso: string) => dateLongue(iso, langue);
  const tauxAcompte = fmtTaux(TAUX_ACOMPTE, langue);

  const ctx = useMemo(() => preparerDevis(donnees, langue), [donnees, langue]);
  const { reglages } = donnees;
  const capacite = donnees.gite.capaciteMax;

  const [arrivee, setArrivee] = useState<string | null>(initial.arrivee ?? null);
  const [depart, setDepart] = useState<string | null>(initial.arrivee && initial.depart ? initial.depart : null);
  const [adultes, setAdultes] = useState(Math.max(1, initial.adultes ?? Math.min(2, capacite)));
  const [enfants, setEnfants] = useState(initial.enfants ?? 0);
  const [bebes, setBebes] = useState(initial.bebes ?? 0);
  // Reprise à la saisie des coordonnées (rechargement, changement de langue) :
  // seulement si les dates et les voyageurs donnent toujours un devis.
  const [state, setState] = useState<FunnelState>(() => {
    if (!initial.coordonnees || !arrivee || !depart) return "step1";
    const r = devisSejour(ctx, { arrivee, depart, adultes, enfants, bebes });
    return r.ok ? "step2" : "step1";
  });

  const [formulaire, setFormulaire] = useState<Formulaire>(() => formulaireVide(langue));
  const [avecColocataire, setAvecColocataire] = useState(false);
  const [erreurs, setErreurs] = useState<ErreursCoordonnees>({});

  const [tentative, setTentative] = useState<Tentative | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [maintenant, setMaintenant] = useState(0);

  // ── Devis du navigateur (affichage seulement) ──
  const occupants: Occupants = { adultes, enfants, bebes };
  const refusOccupants = controlerOccupants(ctx, occupants);
  const dates = arrivee && depart ? controlerDates(ctx, arrivee, depart) : null;
  const resultat = arrivee && depart && !refusOccupants && dates?.ok ? devisSejour(ctx, { arrivee, depart, ...occupants }) : null;
  const devisClient = resultat?.ok ? resultat.devis : null;
  const refusDates = dates && !dates.ok ? dates.refus : resultat && !resultat.ok ? resultat.refus : null;
  // Une fois les dates bloquées, c'est le devis du SERVEUR qui s'affiche.
  const devis = tentative?.devis ?? devisClient;

  const peutAjouter = (o: Partial<Occupants>) => controlerOccupants(ctx, { ...occupants, ...o }) === null;

  // ── L'adresse de la page suit la demande ──
  // Dates, voyageurs et étape atteinte : de quoi reprendre au même endroit
  // après un rechargement ou un changement de langue (components/layout/ChoixLangue.tsx).
  const etapeCoordonnees = state === "step2" || state === "step3" || state === "step4";
  useEffect(() => {
    const p = new URLSearchParams({ gite: gite.id });
    if (arrivee) p.set("arrivee", arrivee);
    if (depart) p.set("depart", depart);
    p.set("adultes", String(adultes));
    p.set("enfants", String(enfants));
    p.set("bebes", String(bebes));
    if (etapeCoordonnees) p.set("etape", "coordonnees");
    // Forme documentée par Next.js (état `null`) : le routeur se synchronise sur la nouvelle adresse.
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [gite.id, arrivee, depart, adultes, enfants, bebes, etapeCoordonnees]);

  // ── Compte à rebours du blocage ──
  useEffect(() => {
    if (!tentative) return;
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuterie);
  }, [tentative]);
  const resteMs = tentative ? tentative.echeance - maintenant : 0;
  const blocageExpire = tentative !== null && maintenant > 0 && resteMs <= 0;

  const goTo = (next: FunnelState) => {
    setState(next);
    setMessage(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Coordonnées ──
  // Le second locataire est l'un des adultes : il n'existe qu'à partir de deux.
  const colocataireActif = avecColocataire && adultes >= 2;
  const nbAutres = nombreAutresAdultes(adultes, colocataireActif);
  const autres = Array.from({ length: nbAutres }, (_, i) => formulaire.autres[i] ?? { prenom: "", nom: "" });
  const majFormulaire = (champ: keyof Omit<Formulaire, "autres">) => (v: string) =>
    setFormulaire((f) => ({ ...f, [champ]: v }));
  const majAutre = (i: number, champ: "prenom" | "nom") => (v: string) =>
    setFormulaire((f) => {
      const liste = Array.from({ length: Math.max(f.autres.length, i + 1) }, (_, k) => f.autres[k] ?? { prenom: "", nom: "" });
      liste[i] = { ...liste[i], [champ]: v };
      return { ...f, autres: liste };
    });

  const coordonneesBrutes = () => ({
    locataire: { civilite: formulaire.civilite, prenom: formulaire.prenom, nom: formulaire.nom },
    email: formulaire.email,
    telephone: formulaire.telephone,
    adresse: formulaire.adresse,
    codePostal: formulaire.codePostal,
    ville: formulaire.ville,
    pays: formulaire.pays,
    colocataire: colocataireActif
      ? { civilite: formulaire.coCivilite, prenom: formulaire.coPrenom, nom: formulaire.coNom }
      : null,
    autresAdultes: autres,
  });

  const validerEtape2 = () => {
    const r = validerCoordonnees(coordonneesBrutes(), adultes, langue);
    if (!r.ok) {
      setErreurs(r.erreurs);
      return;
    }
    setErreurs({});
    goTo("step3");
  };

  // ── Blocage et abandon ──
  async function abandonner(gardeConnexion = false) {
    if (!tentative) return;
    const id = tentative.id;
    setTentative(null);
    try {
      await fetch(`/api/reservations/${id}`, { method: "DELETE", keepalive: gardeConnexion });
    } catch {
      // Sans réponse, le blocage expire seul à son échéance.
    }
  }

  async function bloquer() {
    if (!devisClient || !arrivee || !depart) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const reponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gite: gite.id,
          arrivee,
          depart,
          adultes,
          enfants,
          bebes,
          coordonnees: coordonneesBrutes(),
          totalAttendu: devisClient.montants.totalTtc,
          langue,
        }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      if (reponse.status === 201) {
        setTentative({
          id: String(corps.id),
          reference: String(corps.reference),
          devis: corps.devis as Devis,
          prixModifie: corps.prixModifie === true,
          echeance: Date.now() + Number(corps.dureeBlocageMinutes) * 60_000,
        });
        setCgvAccepted(false);
        goTo("step4");
        return;
      }
      if (reponse.status === 409 && corps.code === "DATES_PRISES") {
        setAlternatives((corps.alternatives as Alternative[] | undefined) ?? []);
        goTo("conflict");
        return;
      }
      if (reponse.status === 400 && corps.code === "CHAMPS_INVALIDES") {
        setErreurs((corps.erreurs as ErreursCoordonnees | undefined) ?? {});
        goTo("step2");
        return;
      }
      setMessage(typeof corps.error === "string" ? corps.error : t.erreurEnregistrement);
    } catch {
      setMessage(t.erreurConnexion);
    } finally {
      setEnvoi(false);
    }
  }

  async function rebloquer() {
    await abandonner();
    // Retour au récapitulatif : un échec (dates prises entre-temps, panne) s'y affiche.
    goTo("step3");
    await bloquer();
  }

  // ── Récapitulatif latéral ──
  const recap = (
    <aside className={styles.recap}>
      <div className={styles.recapHead}>
        <div className={styles.recapImg}>
          <ImageSlot placeholder={gite.name} />
        </div>
        <div>
          <div className={styles.recapName}>{gite.name}</div>
          <div className={styles.recapSub}>{gite.profil[langue]} · {t.personnes(capacite)}</div>
        </div>
      </div>
      <dl>
        <div><dt>{t.arrivee}</dt><dd>{arrivee ? fmtDateCourte(arrivee, langue) : "—"}</dd></div>
        <div><dt>{t.depart}</dt><dd>{depart ? fmtDateCourte(depart, langue) : "—"}</dd></div>
        <div><dt>{t.voyageurs}</dt><dd>{libelleVoyageurs(occupants, langue)}</dd></div>
      </dl>
      {devis && (
        <>
          <div className={styles.recapLines}>
            {devis.prix.lignes.map((ligne) => (
              <div className={styles.recapLine} key={ligne.premiereNuit}>
                <dt>{ligne.tarifNom} · {t.nuits(ligne.nbNuits)}</dt>
                <dd>{euros(ligne.montant)}</dd>
              </div>
            ))}
            <div className={styles.recapLine}><dt>{t.menage}</dt><dd>{euros(devis.montants.forfaitMenage)}</dd></div>
            <div className={styles.recapLine}><dt>{t.taxe}</dt><dd>{euros(devis.montants.taxeSejour)}</dd></div>
          </div>
          <div className={styles.recapTotal}>
            <dt>{t.totalTtc}</dt>
            <dd>{euros(devis.montants.totalTtc)}</dd>
          </div>
          <div className={styles.recapDeposit}>
            <strong>{devis.paiementIntegral ? t.totalite : t.acompte(tauxAcompte)}</strong>
            {t.aujourdhui(euros(devis.aRegler))}
          </div>
          <div className={styles.recapCaution}>
            {t.caution(fmtPrix(devis.caution, langue))}{" "}
            {devis.dateLimiteSolde
              ? t.solde(euros(devis.montants.solde), date(devis.dateLimiteSolde))
              : t.arriveeProche(DELAI_SOLDE_DEFAUT)}
          </div>
        </>
      )}
    </aside>
  );

  const stepIndex = { step1: 1, step2: 2, step3: 3, step4: 4 }[state as "step1"] as number | undefined;
  const isStep = stepIndex !== undefined;
  const lienAutreGite = (slug: string) => {
    const p = new URLSearchParams({
      gite: slug,
      arrivee: arrivee ?? "",
      depart: depart ?? "",
      adultes: String(adultes),
      enfants: String(enfants),
      bebes: String(bebes),
    });
    return l(`/reserver?${p.toString()}`);
  };

  return (
    <>
      <EnteteTunnel langue={langue} onQuitter={() => abandonner(true)} />

      {/* Progress bar (masquée hors étapes) */}
      {isStep && (
        <section className={styles.progress}>
          <div className="wrap">
            <div className={styles.progressBar}>
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`${styles.progressSeg}${n < stepIndex! ? ` ${styles.isDone}` : n === stepIndex ? ` ${styles.isCurrent}` : ""}`}
                />
              ))}
            </div>
            <div className={styles.progressSteps}>
              {t.etapes.map((lbl, i) => {
                const n = i + 1;
                return (
                  <div
                    key={lbl}
                    className={`${styles.progressStep}${n < stepIndex! ? ` ${styles.isDone}` : n === stepIndex ? ` ${styles.isCurrent}` : ""}`}
                  >
                    <span className={styles.num}>{n}</span>
                    <span className={styles.lbl}>{lbl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 1 ============== */}
      {state === "step1" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>{t.titre1}</h1>
                <p className={styles.stepLead}>{t.intro1}</p>

                <div className={styles.fieldGroup}>
                  <h3>{t.vosDates}</h3>
                  <div className={styles.dates}>
                    <div className={`${styles.dateCard}${!arrivee || !depart ? ` ${styles.isActive}` : ""}`}>
                      <div className={styles.dateCardLabel}>{t.arrivee}</div>
                      <div className={styles.dateCardValue}>{arrivee ? fmtDateCourte(arrivee, langue) : t.aChoisir}</div>
                      <div className={styles.dateCardSub}>{t.aPartirDe(fmtHeure(reglages.heureArrivee, langue))}</div>
                    </div>
                    <div className={styles.dateCard}>
                      <div className={styles.dateCardLabel}>{t.depart}</div>
                      <div className={styles.dateCardValue}>{depart ? fmtDateCourte(depart, langue) : t.aChoisir}</div>
                      <div className={styles.dateCardSub}>{t.avant(fmtHeure(reglages.heureDepart, langue))}</div>
                    </div>
                  </div>
                  <Calendrier
                    ctx={ctx}
                    horizon={donnees.horizon}
                    arrivee={arrivee}
                    depart={depart}
                    onChange={(a, d) => {
                      setArrivee(a);
                      setDepart(d);
                    }}
                  />
                  {donnees.horizon === null && (
                    <div className={styles.avis}>{t.aucuneDate}</div>
                  )}
                  {refusDates && <div className={styles.avis}>{refusDates.message}</div>}
                </div>

                <div className={styles.fieldGroup}>
                  <h3>{t.voyageurs}</h3>
                  <Compteur
                    langue={langue}
                    titre={t.titreAdultes}
                    detail={t.detailAdultes}
                    valeur={adultes}
                    min={1}
                    peutAjouter={peutAjouter({ adultes: adultes + 1 })}
                    onChange={setAdultes}
                  />
                  <Compteur
                    langue={langue}
                    titre={t.titreEnfants}
                    detail={t.detailEnfants(reglages.bebeAgeLimite)}
                    valeur={enfants}
                    min={0}
                    peutAjouter={peutAjouter({ enfants: enfants + 1 })}
                    onChange={setEnfants}
                  />
                  <Compteur
                    langue={langue}
                    titre={t.titreBebes}
                    detail={t.detailBebes(reglages.bebeAgeLimite)}
                    valeur={bebes}
                    min={0}
                    peutAjouter={peutAjouter({ bebes: bebes + 1 })}
                    onChange={setBebes}
                  />
                  <p className={styles.miniCalAide}>
                    {t.accueille(gite.name, capacite)}
                    {reglages.bebesHorsCapacite === 1
                      ? t.sansCompterUn(reglages.bebeAgeLimite)
                      : reglages.bebesHorsCapacite > 1
                        ? t.sansCompterPlusieurs(reglages.bebesHorsCapacite, reglages.bebeAgeLimite)
                        : ""}
                    .
                  </p>
                  {refusOccupants && <div className={styles.avis}>{refusOccupants.message}</div>}
                  {bebes > reglages.litsBebe && (
                    <div className={styles.avisInfo}>
                      {reglages.litsBebe === 0
                        ? t.aucunLit
                        : reglages.litsBebe === 1
                          ? t.unSeulLit
                          : t.plusieursLits(reglages.litsBebe)}
                    </div>
                  )}
                </div>

                <div className={styles.stepActions}>
                  <span />
                  <button className="btn btn-primary" disabled={!devisClient} onClick={() => goTo("step2")}>
                    {t.continuer}
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 2 ============== */}
      {state === "step2" && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>{t.titre2}</h1>
                <p className={styles.stepLead}>{t.intro2}</p>

                <form onSubmit={(e) => e.preventDefault()} noValidate>
                  <div className={styles.fieldGroup}>
                    <h3>{t.identite}</h3>
                    <div className={styles.fieldRow}>
                      <ChampCivilite langue={langue} valeur={formulaire.civilite} onChange={majFormulaire("civilite")} />
                      <span />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label={t.prenom} requis valeur={formulaire.prenom} onChange={majFormulaire("prenom")} erreur={erreurs["locataire.prenom"]} autoComplete="given-name" />
                      <Champ label={t.nom} requis valeur={formulaire.nom} onChange={majFormulaire("nom")} erreur={erreurs["locataire.nom"]} autoComplete="family-name" />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label={t.email} requis type="email" valeur={formulaire.email} onChange={majFormulaire("email")} erreur={erreurs.email} autoComplete="email" />
                      <Champ label={t.telephone} requis type="tel" valeur={formulaire.telephone} onChange={majFormulaire("telephone")} erreur={erreurs.telephone} autoComplete="tel" />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <h3>{t.adressePostale}</h3>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <Champ label={t.adresse} requis valeur={formulaire.adresse} onChange={majFormulaire("adresse")} erreur={erreurs.adresse} autoComplete="street-address" />
                    </div>
                    <div className={styles.fieldRow}>
                      <Champ label={t.codePostal} requis valeur={formulaire.codePostal} onChange={majFormulaire("codePostal")} erreur={erreurs.codePostal} autoComplete="postal-code" />
                      <Champ label={t.ville} requis valeur={formulaire.ville} onChange={majFormulaire("ville")} erreur={erreurs.ville} autoComplete="address-level2" />
                    </div>
                    <div className={`${styles.fieldRow} ${styles.full}`}>
                      <Champ label={t.pays} requis valeur={formulaire.pays} onChange={majFormulaire("pays")} erreur={erreurs.pays} autoComplete="country-name" />
                    </div>
                  </div>

                  {adultes >= 2 && (
                    <div className={styles.fieldGroup}>
                      <h3>{t.secondLocataire}</h3>
                      <div className={styles.consentBlock}>
                        <label>
                          <input
                            type="checkbox"
                            checked={avecColocataire}
                            onChange={(e) => setAvecColocataire(e.target.checked)}
                          />
                          <span>{t.ajouterColocataire}</span>
                        </label>
                      </div>
                      {erreurs.colocataire && <div className={styles.avis}>{erreurs.colocataire}</div>}
                      {colocataireActif && (
                        <>
                          <div className={styles.fieldRow} style={{ marginTop: 16 }}>
                            <ChampCivilite langue={langue} valeur={formulaire.coCivilite} onChange={majFormulaire("coCivilite")} />
                            <span />
                          </div>
                          <div className={styles.fieldRow}>
                            <Champ label={t.prenom} requis valeur={formulaire.coPrenom} onChange={majFormulaire("coPrenom")} erreur={erreurs["colocataire.prenom"]} />
                            <Champ label={t.nom} requis valeur={formulaire.coNom} onChange={majFormulaire("coNom")} erreur={erreurs["colocataire.nom"]} />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {nbAutres > 0 && (
                    <div className={styles.fieldGroup}>
                      <h3>{t.autresAdultes}</h3>
                      <p className={styles.miniCalAide} style={{ marginTop: 0, marginBottom: 14 }}>
                        {t.autresAdultesAide}
                      </p>
                      {autres.map((a, i) => (
                        <div className={styles.fieldRow} key={i}>
                          <Champ label={t.adultePrenom(i + 2)} requis valeur={a.prenom} onChange={majAutre(i, "prenom")} erreur={erreurs[`autresAdultes.${i}.prenom`]} />
                          <Champ label={t.nom} requis valeur={a.nom} onChange={majAutre(i, "nom")} erreur={erreurs[`autresAdultes.${i}.nom`]} />
                        </div>
                      ))}
                    </div>
                  )}
                </form>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step1")}>
                    {ChevronLeft}
                    {t.retour}
                  </button>
                  <button className="btn btn-primary" onClick={validerEtape2}>
                    {t.continuer}
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 3 ============== */}
      {state === "step3" && devis && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>{t.titre3}</h1>
                <p className={styles.stepLead}>{t.intro3}</p>

                <div className={styles.fieldGroup}>
                  {bebes > 0 && (
                    <>
                      <h3>{t.litBebe}</h3>
                      <div className={`${styles.optionCard} ${styles.isOn}`}>
                        <div className={styles.optionCardCheck}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div className={styles.optionCardBody}>
                          <div className={styles.optionCardName}>{t.litBebeFourni}</div>
                          <div className={styles.optionCardDesc}>{t.litBebeDetail}</div>
                        </div>
                        <div className={styles.optionCardPrice} style={{ color: "var(--color-gray-medium)" }}>
                          {t.inclus}
                        </div>
                      </div>
                    </>
                  )}
                  <p style={{ fontSize: 13, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.6 }}>
                    {t.demandeParticuliere}
                  </p>
                </div>

                <div className={styles.detailedRecap}>
                  <h4>{t.recapDetaille}</h4>
                  {devis.prix.lignes.map((ligne) => (
                    <div className={styles.drLine} key={ligne.premiereNuit}>
                      <div>
                        <strong>{ligne.tarifNom} · {t.nuits(ligne.nbNuits)}</strong>
                        <small>
                          {t.nuitsDu(date(ligne.premiereNuit), ligne.nbNuits > 1 ? date(ligne.derniereNuit) : null)} · {gite.name}
                        </small>
                      </div>
                      <span>{euros(ligne.montant)}</span>
                    </div>
                  ))}
                  <div className={styles.drLine}>
                    <div>
                      <strong>{t.menage}</strong>
                    </div>
                    <span>{euros(devis.montants.forfaitMenage)}</span>
                  </div>
                  <div className={styles.drLine}>
                    <div>
                      <strong>{t.taxe}</strong>
                      <small>{t.taxeDetail(t.adultes(devis.occupants.adultes), t.nuits(devis.nbNuits))}</small>
                    </div>
                    <span>{euros(devis.montants.taxeSejour)}</span>
                  </div>
                  <div className={styles.drTotal}>
                    <span>{t.totalTtc}</span>
                    <strong>{euros(devis.montants.totalTtc)}</strong>
                  </div>
                  <div className={styles.drDeposit}>
                    <span>
                      <strong>{devis.paiementIntegral ? t.aReglerTotalite : t.aReglerAcompte(tauxAcompte)}</strong>
                      <small>
                        {devis.dateLimiteSolde
                          ? t.solde(euros(devis.montants.solde), date(devis.dateLimiteSolde))
                          : t.arriveeProcheCourt(DELAI_SOLDE_DEFAUT)}
                      </small>
                    </span>
                    <em>{euros(devis.aRegler)}</em>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-gray-medium)", marginTop: 14, lineHeight: 1.5 }}>
                    {t.cautionDetail(fmtPrix(devis.caution, langue))}
                  </p>
                </div>

                {message && <div className={styles.avis}>{message}</div>}
                <p className={styles.miniCalAide}>{t.blocageAVenir(reglages.dureeBlocageMinutes)}</p>

                <div className={styles.stepActions}>
                  <button className={styles.stepBack} onClick={() => goTo("step2")}>
                    {ChevronLeft}
                    {t.retour}
                  </button>
                  <button className="btn btn-primary" disabled={envoi} onClick={() => void bloquer()}>
                    {envoi ? t.enregistrement : t.procederPaiement}
                    {ArrowRight}
                  </button>
                </div>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== STEP 4 ============== */}
      {state === "step4" && tentative && (
        <section>
          <div className="wrap">
            <div className={styles.funnel}>
              <div className={styles.stepPane}>
                <h1>{tentative.devis.paiementIntegral ? t.paiementSejour : t.paiementAcompte}</h1>
                <p className={styles.stepLead}>
                  {t.reservation(tentative.reference)}{" "}
                  {blocageExpire ? null : (
                    <>
                      {t.bloqueesEncore}{" "}
                      <span className={styles.compteRebours}>{minutesSecondes(resteMs)}</span>.
                    </>
                  )}
                </p>

                {tentative.prixModifie && (
                  <div className={styles.avisInfo}>{t.prixModifie(euros(tentative.devis.montants.totalTtc))}</div>
                )}
                {blocageExpire && (
                  <div className={styles.avis}>
                    {t.delaiEcoule(reglages.dureeBlocageMinutes)}{" "}
                    <button className="btn btn-secondary" style={{ marginTop: 12 }} disabled={envoi} onClick={() => void rebloquer()}>
                      {t.rebloquer}
                    </button>
                  </div>
                )}
                {message && <div className={styles.avis}>{message}</div>}

                <div className={styles.stripeBlock} style={{ marginTop: 20 }}>
                  <div className={styles.stripeBlockHead}>
                    <h3>{t.carte}</h3>
                    <span className={styles.secureTag}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="4" y="11" width="16" height="10" rx="1" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      {t.paiementSecurise}
                    </span>
                  </div>
                  <div className={styles.stripeMock}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <rect x="2" y="6" width="20" height="13" rx="1.5" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <h4>{t.champsStripe}</h4>
                    <p>{t.paiementFerme}</p>
                  </div>
                </div>

                <div className={styles.consentBlock}>
                  <label>
                    <input
                      type="checkbox"
                      checked={cgvAccepted}
                      onChange={(e) => setCgvAccepted(e.target.checked)}
                    />
                    <span>
                      <strong>
                        {t.accepteAvant}<Link href={l("/legal/cgv")}>{t.cgv}</Link>
                      </strong>
                      {t.accepteApres}{" "}
                      <span className={styles.req}>*</span>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" />
                    <span>{t.avis}</span>
                  </label>
                </div>

                <div className={styles.stepActions}>
                  <button
                    className={styles.stepBack}
                    disabled={envoi}
                    onClick={async () => {
                      await abandonner();
                      goTo("step3");
                    }}
                  >
                    {ChevronLeft}
                    {t.retour}
                  </button>
                  {/* Paiement branché au lot 3 (Stripe) : bouton inactif jusque-là. */}
                  <button className="btn btn-primary" disabled>
                    {t.payer(euros(tentative.devis.aRegler))}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="4" y="11" width="16" height="10" rx="1" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </button>
                </div>

                <p style={{ fontSize: 12, color: "var(--color-gray-medium)", textAlign: "center", marginTop: 20 }}>
                  {t.troisDS}
                </p>
              </div>
              {recap}
            </div>
          </div>
        </section>
      )}

      {/* ============== CONFLICT : dates prises entre le devis et le blocage ============== */}
      {state === "conflict" && (
        <section>
          <div className="wrap" style={{ paddingBlock: 56 }}>
            <div className={styles.stateBlock}>
              <div className={styles.stateBlockHead}>
                <div className={`${styles.stateBlockIcon} ${styles.warning}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                  </svg>
                </div>
                <div>
                  <h1>{t.titreConflit}</h1>
                  <p className={styles.stateBlockSub}>{t.introConflit}</p>
                </div>
              </div>
              <div className={styles.noCharge}>
                {NoChargeCheck}
                {t.aucunDebit}
              </div>
              {alternatives.length > 0 ? (
                <>
                  <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 8, marginBottom: 8, fontSize: 22 }}>
                    {t.autresGites}
                  </h3>
                  <div className={styles.recourses}>
                    {alternatives.map((a) => (
                      <div className={styles.recourse} key={a.slug}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 21V9l9-6 9 6v12" /><path d="M9 21V12h6v9" />
                        </svg>
                        <strong>{a.nom}</strong>
                        <p>
                          {arrivee && depart ? t.duAu(date(arrivee), date(depart)) : ""} ·{" "}
                          {euros(a.total)} {t.ttc}
                        </p>
                        <a href={lienAutreGite(a.slug)} className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                          {t.choisir(a.nom)}
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>{t.aucunAutre}</p>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setDepart(null);
                    setArrivee(null);
                    goTo("step1");
                  }}
                >
                  {t.autresDates}
                </button>
                <Link className="btn btn-ghost" href={l("/contact")}>{t.aide}</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== REFUSED (lot 3 : paiement refusé par la banque) ============== */}
      {state === "refused" && (
        <section>
          <div className="wrap" style={{ paddingBlock: 56 }}>
            <div className={styles.stateBlock}>
              <div className={styles.stateBlockHead}>
                <div className={`${styles.stateBlockIcon} ${styles.error}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <h1>{t.titreRefus}</h1>
                  <p className={styles.stateBlockSub}>{t.introRefus}</p>
                </div>
              </div>
              <div className={styles.noCharge}>
                {NoChargeCheck}
                {t.rienPreleve}
              </div>
              <p>{t.troisPistes}</p>
              <div className={styles.recourses}>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <polyline points="21 4 21 10 15 10" />
                  </svg>
                  <strong>{t.reessayerTitre}</strong>
                  <p>{t.reessayerTexte}</p>
                  <button className="btn btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={() => goTo("step4")}>
                    {t.reessayer}
                  </button>
                </div>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="6" width="20" height="13" rx="1.5" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <strong>{t.autreCarteTitre}</strong>
                  <p>{t.autreCarteTexte}</p>
                  <button className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => goTo("step4")}>
                    {t.changerCarte}
                  </button>
                </div>
                <div className={styles.recourse}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.91.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </svg>
                  <strong>{t.appelerTitre}</strong>
                  <p>{t.appelerTexte}</p>
                  <Link href={l("/contact")} className="btn btn-ghost" style={{ marginTop: 12, width: "100%" }}>
                    {t.coordonnees}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============== 3DS FAILED (lot 3) ============== */}
      {state === "3ds-failed" && (
        <EchecAuthentification langue={langue} onReprendre={() => goTo("step4")} />
      )}
    </>
  );
}

/** Écran du prototype pour une authentification bancaire échouée : branché au lot 3. */
function EchecAuthentification({ langue, onReprendre }: { langue: Langue; onReprendre: () => void }): ReactNode {
  const t = TEXTES[langue];
  return (
    <section>
      <div className="wrap" style={{ paddingBlock: 56 }}>
        <div className={styles.stateBlock}>
          <div className={styles.stateBlockHead}>
            <div className={`${styles.stateBlockIcon} ${styles.info}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="11" width="14" height="10" rx="1" />
                <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                <circle cx="12" cy="16" r="1" />
              </svg>
            </div>
            <div>
              <h1>{t.titre3ds}</h1>
              <p className={styles.stateBlockSub}>{t.intro3ds}</p>
            </div>
          </div>
          <div className={styles.noCharge}>
            {NoChargeCheck}
            {t.rienDebite}
          </div>
          <h3 style={{ fontFamily: "var(--tw-font-serif)", fontWeight: 400, marginTop: 24, marginBottom: 8, fontSize: 22 }}>
            {t.troisChoses}
          </h3>
          <div className={styles.recourses}>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <strong>{t.appliTitre}</strong>
              <p>{t.appliTexte}</p>
            </div>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <strong>{t.patienterTitre}</strong>
              <p>{t.patienterTexte}</p>
            </div>
            <div className={styles.recourse}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="6" width="20" height="13" rx="1.5" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <strong>{t.autreCarte3dsTitre}</strong>
              <p>{t.autreCarte3dsTexte}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={onReprendre}>{t.reprendre}</button>
            <Link className="btn btn-ghost" href={lien(langue, "/contact")}>{t.appeler}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
