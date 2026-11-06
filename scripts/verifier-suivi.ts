// Contrôle de la page « MA RÉSERVATION » et du formulaire « Retrouver ma
// réservation » (Phase 3, lot 4, étape 3, D-25), sur la base de TEST.
//
// Prestataire de paiement et messagerie SIMULÉS (rien ne part) ; la logique
// est la vraie (lib/suivi.ts) :
//   1. jeton : chaque réservation a le sien, 64 caractères hexadécimaux ;
//   2. page : jeton mal formé ou inconnu, réservation jamais payée → « lien
//      non valable » ; réservation payée → ouverte, contrat à venir ;
//   3. validité : ouverte jusqu'au départ + 30 jours inclus, fermée le
//      lendemain ; le réglage s'applique aux réservations déjà faites ;
//   4. réservation remboursée (dates reprises) → « n'a pas pu être confirmée » ;
//   5. formulaire : adresse inconnue ou mal formée → rien d'inscrit ; adresse
//      connue (casse indifférente) → un courriel par réservation ouverte, dans
//      sa langue, jamais pour une réservation non payée ou expirée ;
//   6. limite : 3 demandes par heure et par adresse, la 4e n'inscrit rien ;
//   7. envoi : le courriel porte le lien secret et sa date de fin.
//
// REFUSE de s'exécuter si DB_CIBLE ne vaut pas "test". Les lignes créées sont
// supprimées au début et à la fin.
//
// Lancer : DB_CIBLE=test npx tsx scripts/verifier-suivi.ts
import "../db/env";

import { sql } from "drizzle-orm";

import { closeDb, getDb } from "../db";
import type { Coordonnees } from "../lib/coordonnees";
import { traiterCourriels } from "../lib/courriels-envoi";
import { ajouterJours, aujourdhuiParis, jourSemaineIso } from "../lib/dates-civiles";
import { remplacerMessagerie, type Envoi, type Message, type Messagerie } from "../lib/messagerie";
import { constaterPaiement, ouvrirPaiement } from "../lib/paiement";
import { carteEnregistree } from "../lib/reglement";
import {
  remplacerPrestataire,
  type AvisPaiement,
  type EtatEnregistrement,
  type DemandePaiement,
  type EtatPaiement,
  type PaiementCree,
  type Prestataire,
} from "../lib/stripe";
import { chargerSuivi, demanderLien, FORME_JETON } from "../lib/suivi";
import { enregistrerTentative, type ResultatTentative } from "../lib/tunnel";

let nbCas = 0;
let echecs = 0;

function noter(ok: boolean, libelle: string, obtenu?: unknown): void {
  nbCas += 1;
  console.log(`${ok ? "OK  " : "ECHEC"} ${libelle}${ok ? "" : ` → obtenu ${JSON.stringify(obtenu)}`}`);
  if (!ok) echecs += 1;
}

const EMAIL_ESSAI = "suivi@example.invalid";
const PROPRIETAIRES = "proprietaires@example.invalid";
const ORIGINE = "https://site.example";
const db = getDb();

// ─── Simulations ─────────────────────────────────────────────────────────────

class PrestataireSimule implements Prestataire {
  readonly nom = "simule";
  private n = 0;
  readonly paiements = new Map<string, EtatPaiement>();

  async creerPaiement(d: DemandePaiement): Promise<PaiementCree> {
    this.n += 1;
    const id = `pi_suivi_${this.n}_${Date.now()}`;
    this.paiements.set(id, {
      id, statut: "en_attente", montant: d.montant, devise: "eur",
      customerId: d.enregistrerCarte ? `cus_${this.n}` : null, paymentMethodId: null,
      reservationId: d.reservationId, typePaiement: d.type, clientSecret: `${id}_secret`, dernierRefus: null, expireLe: null, montantEncaisse: 0,
    });
    return { id, clientSecret: `${id}_secret`, customerId: d.enregistrerCarte ? `cus_${this.n}` : null };
  }
  async prelever(): Promise<EtatPaiement> {
    throw new Error("prélèvement non simulé ici (scripts/verifier-solde.ts)");
  }
  async lirePaiement(id: string): Promise<EtatPaiement> {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    return { ...e };
  }
  async annulerPaiement(id: string): Promise<EtatPaiement> {
    return this.lirePaiement(id);
  }
  async encaisserCaution(): Promise<EtatPaiement> {
    throw new Error("retenue de caution : hors de ce contrôle");
  }
  async rembourser(id: string): Promise<{ id: string }> {
    return { id: `re_${id}` };
  }
  async oublierCarte(): Promise<void> {}
  async oublierClient(): Promise<void> {}
  async bloquerCaution(): Promise<EtatPaiement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  async creerEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  async lireEnregistrement(): Promise<EtatEnregistrement> {
    throw new Error("caution : hors de ce contrôle (scripts/verifier-caution.ts)");
  }
  lireAvis(): AvisPaiement | null {
    return null;
  }
  payer(id: string): void {
    const e = this.paiements.get(id);
    if (!e) throw new Error(`paiement simulé inconnu : ${id}`);
    this.paiements.set(id, { ...e, statut: "reussi", paymentMethodId: `pm_${id}` });
  }
}

class MessagerieSimulee implements Messagerie {
  readonly envoyes: Message[] = [];
  async envoyer(m: Message): Promise<Envoi> {
    this.envoyes.push(m);
    return { voie: "fichier", reference: `simule-${this.envoyes.length}` };
  }
  vider(): Message[] {
    return this.envoyes.splice(0);
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function samediDans(semaines: number): string {
  let d = ajouterJours(aujourdhuiParis(), semaines * 7);
  while (jourSemaineIso(d) !== 6) d = ajouterJours(d, 1);
  return d;
}

const COORDONNEES: Coordonnees = {
  locataire: { civilite: "", prenom: "Camille", nom: "Essai" },
  email: EMAIL_ESSAI,
  telephone: "06 00 00 00 00",
  adresse: "1 rue de l'Essai",
  codePostal: "07100",
  ville: "Savas",
  pays: "France",
  colocataire: null,
  autresAdultes: [{ prenom: "Second", nom: "Adulte" }],
};

type Tentative = Extract<ResultatTentative, { ok: true }>;

async function tenter(
  gite: "armu" | "laphine" | "maison-vieille",
  arrivee: string,
  langue: "fr" | "en" = "fr",
): Promise<Tentative> {
  const r = await enregistrerTentative(
    gite,
    { arrivee, depart: ajouterJours(arrivee, 7), adultes: 2, enfants: 0, bebes: 0 },
    COORDONNEES,
    null,
    { moyenCaution: "cheque", modeSolde: "lien" },
    langue,
  );
  if (!r.ok) throw new Error(`tentative refusée (${gite}, ${arrivee}) : ${JSON.stringify(r)}`);
  return r;
}

async function ouvrir(t: Tentative, p: PrestataireSimule): Promise<string> {
  const { paiementId } = await ouvrirPaiement(
    {
      reservationId: t.id, reference: t.reference, montant: t.devis.aRegler,
      paiementIntegral: t.devis.paiementIntegral, enregistrerCarte: carteEnregistree(t.choix),
      client: t.client, description: `essai ${t.reference}`,
    },
    p,
  );
  return paiementId;
}

async function payer(t: Tentative, p: PrestataireSimule): Promise<void> {
  const id = await ouvrir(t, p);
  p.payer(id);
  await constaterPaiement(id, p);
}

async function jetonDe(reservationId: string): Promise<string> {
  const [{ jeton }] = (
    await db.execute(sql`select jeton_suivi as jeton from reservations where id = ${reservationId}::uuid`)
  ).rows as { jeton: string }[];
  return jeton;
}

async function liensInscrits(): Promise<{ reservation_id: string; langue: string }[]> {
  return (
    await db.execute(sql`select reservation_id, langue from courriels
                          where objet = 'lien_suivi' and destinataire = ${EMAIL_ESSAI} order by created_at`)
  ).rows as { reservation_id: string; langue: string }[];
}

/** Instant à midi (Paris) du jour civil `iso`. */
const midi = (iso: string) => new Date(`${iso}T10:00:00Z`);

async function nettoyer(): Promise<void> {
  const ids = sql`select id from reservations where client_email = ${EMAIL_ESSAI}`;
  await db.execute(sql`delete from courriels where reservation_id in (${ids}) or destinataire = ${EMAIL_ESSAI}`);
  await db.execute(sql`delete from disponibilites where reservation_id in (${ids})`);
  await db.execute(sql`delete from paiements where reservation_id in (${ids})`);
  await db.execute(sql`delete from reservations where client_email = ${EMAIL_ESSAI}`);
}

// ─── Contrôles ───────────────────────────────────────────────────────────────

async function controles(): Promise<void> {
  const p = new PrestataireSimule();
  const m = new MessagerieSimulee();
  remplacerPrestataire(p);
  remplacerMessagerie(m);

  console.log("--- 1. jetons");
  const a = await tenter("armu", samediDans(30));
  const jetonA = await jetonDe(a.id);
  const [{ total, distincts, malformes }] = (
    await db.execute(sql`select count(*)::int as total, count(distinct jeton_suivi)::int as distincts,
                           count(*) filter (where jeton_suivi !~ '^[0-9a-f]{64}$')::int as malformes
                           from reservations`)
  ).rows as { total: number; distincts: number; malformes: number }[];
  noter(FORME_JETON.test(jetonA), "une réservation reçoit un jeton de 64 caractères hexadécimaux", jetonA);
  noter(total === distincts && malformes === 0, "tous les jetons de la base sont distincts et bien formés", { total, distincts, malformes });

  console.log("--- 2. page");
  noter((await chargerSuivi("pas-un-jeton")).etat === "invalide", "jeton mal formé : lien non valable");
  noter((await chargerSuivi("0".repeat(64))).etat === "invalide", "jeton inconnu : lien non valable");
  noter((await chargerSuivi(jetonA)).etat === "invalide", "réservation pas encore payée : lien non valable");
  await payer(a, p);
  const ouverte = await chargerSuivi(jetonA);
  noter(
    ouverte.etat === "ouvert" && ouverte.resa.id === a.id && ouverte.contrat.etat === "a_venir" &&
      ouverte.paiement.montant === a.devis.aRegler && ouverte.contact === "contact@gitesdesamoyas.fr",
    "réservation payée : page ouverte, montant payé, contrat à venir, adresse de contact des réglages",
    ouverte.etat === "ouvert" ? { contrat: ouverte.contrat, paiement: ouverte.paiement } : ouverte.etat,
  );
  noter(
    ouverte.etat === "ouvert" && ouverte.resa.gites?.adresse !== undefined && (ouverte.resa.gites?.adresse ?? "").length > 0,
    "l'adresse du gîte est disponible pour la page",
  );

  console.log("--- 3. validité");
  const depart = a.devis.depart;
  const dernierJour = ajouterJours(depart, 30);
  noter(ouverte.etat === "ouvert" && ouverte.finValidite === dernierJour, "fin de validité : départ + 30 jours", ouverte.etat === "ouvert" && ouverte.finValidite);
  noter((await chargerSuivi(jetonA, db, midi(dernierJour))).etat === "ouvert", "ouverte le dernier jour (départ + 30)");
  noter((await chargerSuivi(jetonA, db, midi(ajouterJours(dernierJour, 1)))).etat === "invalide", "fermée le lendemain");
  await db.execute(sql`update reglages set suivi_validite_jours = 60`);
  noter(
    (await chargerSuivi(jetonA, db, midi(ajouterJours(dernierJour, 1)))).etat === "ouvert",
    "réglage porté à 60 jours : la même réservation rouvre (lu à chaque affichage)",
  );
  await db.execute(sql`update reglages set suivi_validite_jours = 30`);

  console.log("--- 4. réservation remboursée");
  const retard = await tenter("laphine", samediDans(34));
  const piRetard = await ouvrir(retard, p);
  await db.execute(sql`update disponibilites set verrou_expire_at = now() - interval '1 minute'
                        where reservation_id = ${retard.id}::uuid and statut = 'verrou'`);
  const autre = await tenter("laphine", samediDans(34));
  p.payer(piRetard);
  await constaterPaiement(piRetard, p);
  const rembourse = await chargerSuivi(await jetonDe(retard.id));
  noter(
    rembourse.etat === "rembourse" && rembourse.fait && rembourse.montant === retard.devis.aRegler,
    "dates reprises pendant le paiement : « n'a pas pu être confirmée », remboursement fait, montant",
    rembourse.etat,
  );
  noter((await chargerSuivi(await jetonDe(autre.id))).etat === "invalide", "la réservation qui a pris les dates, non payée : lien non valable");

  console.log("--- 5. formulaire");
  const en = await tenter("maison-vieille", samediDans(36), "en");
  await payer(en, p);
  const nonPayee = await tenter("armu", samediDans(38));
  await db.execute(sql`delete from courriels where destinataire = ${EMAIL_ESSAI}`);

  const inconnue = await demanderLien("personne@example.invalid");
  noter(inconnue.inscrits === 0 && !inconnue.limite, "adresse inconnue : rien d'inscrit", inconnue);
  noter((await demanderLien("pas une adresse")).inscrits === 0, "adresse mal formée : rien d'inscrit");
  const connue = await demanderLien(`  ${EMAIL_ESSAI.toUpperCase()} `);
  const liens = await liensInscrits();
  const ids = new Set(liens.map((l) => l.reservation_id));
  noter(
    connue.inscrits === 3 && liens.length === 3 && ids.has(a.id) && ids.has(retard.id) && ids.has(en.id),
    "adresse connue (majuscules, espaces) : un courriel par réservation payée ou remboursée encore ouverte",
    { connue, liens },
  );
  noter(!ids.has(nonPayee.id) && !ids.has(autre.id), "jamais pour une réservation non payée");
  noter(liens.find((l) => l.reservation_id === en.id)?.langue === "en", "dans la langue de la réservation (anglais)");

  console.log("--- 6. limite");
  await demanderLien(EMAIL_ESSAI);
  await demanderLien(EMAIL_ESSAI);
  const avant = (await liensInscrits()).length;
  const quatrieme = await demanderLien(EMAIL_ESSAI);
  noter(quatrieme.limite && quatrieme.inscrits === 0 && (await liensInscrits()).length === avant, "4e demande dans l'heure : rien d'inscrit", quatrieme);
  await db.execute(sql`update courriels set created_at = now() - interval '61 minutes'
                        where objet = 'lien_suivi' and destinataire = ${EMAIL_ESSAI}`);
  const apresHeure = await demanderLien(EMAIL_ESSAI);
  noter(!apresHeure.limite && apresHeure.inscrits === 3, "une heure plus tard : de nouveau accepté", apresHeure);

  console.log("--- 7. envoi");
  await traiterCourriels(ORIGINE, 100);
  const envoyes = m.vider().filter((x) => x.destinataire === EMAIL_ESSAI && x.etiquette === "lien_suivi");
  const fr = envoyes.find((x) => x.sujet === `Votre lien de réservation — réservation ${a.reference}`);
  const enMsg = envoyes.find((x) => x.sujet === `Your booking link — booking ${en.reference}`);
  noter(
    fr?.texte.includes(`Voir ma réservation\n${ORIGINE}/suivi/${jetonA}`) === true &&
      fr.texte.includes("Ce lien est valable jusqu'au ") &&
      fr.texte.includes("Si elle ne vient pas de vous, vous pouvez l'ignorer."),
    "courriel français : lien secret, date de fin, phrase « si elle ne vient pas de vous »",
    fr?.texte,
  );
  noter(
    enMsg?.texte.includes(`View my booking\n${ORIGINE}/en/suivi/${await jetonDe(en.id)}`) === true &&
      enMsg.texte.startsWith("Hello Camille,"),
    "courriel anglais : lien vers la page anglaise",
    enMsg?.texte,
  );
}

async function main(): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error('DB_CIBLE doit valoir "test" : ce script écrit des réservations, des paiements et des courriels.');
  }
  await db.execute(sql`update alertes set destinataires = array[${PROPRIETAIRES}]`);
  const [{ validite }] = (await db.execute(sql`select suivi_validite_jours as validite from reglages`)).rows as {
    validite: number;
  }[];
  if (validite !== 30) throw new Error(`réglage de validité inattendu sur la base de test (${validite} jours, 30 attendus)`);
  await nettoyer();
  // Les courriels en attente d'autres essais sont mis de côté : chaque envoi compté ici est le nôtre.
  await db.execute(sql`update courriels set prochain_essai_at = now() + interval '1 day' where statut = 'a_envoyer'`);
  try {
    await controles();
  } finally {
    await db.execute(sql`update reglages set suivi_validite_jours = 30`);
    await nettoyer();
  }
}

main()
  .then(() => {
    console.log(echecs === 0 ? `\n${nbCas} cas, tous passent.` : `\n${nbCas} cas, ${echecs} en échec.`);
    process.exitCode = echecs === 0 ? 0 : 1;
  })
  .catch((erreur) => {
    console.error("ERREUR :", erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
