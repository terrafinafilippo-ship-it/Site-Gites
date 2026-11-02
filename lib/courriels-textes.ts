// LE TEXTE des courriels du site (Phase 3, lot 4) : sujet, version HTML et
// version texte. Aucune lecture en base ici : lib/courriels-envoi.ts fournit
// les faits.
//
// Choix du gérant (27 octobre 2026) : au client, LES FAITS, comme l'écran de
// confirmation (lignes communes : lib/recapitulatif.ts), sans formule
// commerciale inventée ; dans sa langue ; le contrat reste en français
// (D-22). Aux propriétaires : en français, l'objet d'un problème commence par
// « À TRAITER — », et chaque alerte dit ce qu'il faut faire.
import { fmtDateLongue, fmtEuro } from "@/lib/format";
import type { Bilingue, Langue } from "@/lib/i18n/langues";
import { CONTACTS, LIBELLES_RECAP, type Recapitulatif } from "@/lib/recapitulatif";

export interface Contenu {
  sujet: string;
  html: string;
  texte: string;
}

/** Signature des courriels au client (modèle validé le 27 octobre 2026). */
const SIGNATURE: Bilingue<string> = {
  fr: "Patricia et Nicolas Terrafina — Les Gîtes de Samoyas",
  en: "Patricia and Nicolas Terrafina — Les Gîtes de Samoyas",
};

// ─── Mise en forme ───────────────────────────────────────────────────────────

function echapper(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Un bloc du courriel : paragraphe, liste de faits, bouton ou ligne discrète. */
type Bloc =
  | { p: string; gras?: boolean }
  | { liste: string[] }
  | { bouton: string; lien: string }
  | { note: string };

function assembler(sujet: string, blocs: Bloc[]): Contenu {
  const html = blocs
    .map((b) => {
      if ("p" in b) return `<p style="margin:0 0 14px">${b.gras ? `<strong>${echapper(b.p)}</strong>` : echapper(b.p)}</p>`;
      if ("liste" in b) {
        return `<ul style="margin:0 0 16px;padding-left:18px">${b.liste
          .map((l) => `<li style="margin:0 0 6px">${echapper(l)}</li>`)
          .join("")}</ul>`;
      }
      if ("bouton" in b) {
        return `<p style="margin:4px 0 20px"><a href="${echapper(b.lien)}" style="display:inline-block;background:#3d5a45;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600">${echapper(b.bouton)}</a></p>`;
      }
      return `<p style="margin:0 0 8px;color:#5c5c5c;font-size:13px">${echapper(b.note)}</p>`;
    })
    .join("\n");
  const texte = blocs
    .map((b) => {
      if ("p" in b) return b.p;
      if ("liste" in b) return b.liste.map((l) => `- ${l}`).join("\n");
      if ("bouton" in b) return `${b.bouton}\n${b.lien}`;
      return b.note;
    })
    .join("\n\n");
  return {
    sujet,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${echapper(sujet)}</title></head><body style="margin:0;padding:24px;background:#f7f5f0"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222222">\n${html}\n</div></body></html>`,
    texte,
  };
}

/** « 6 au 13 mars 2027 », « 30 décembre 2026 au 3 janvier 2027 » ; en anglais « 6–13 March 2027 ». */
export function plageDates(arrivee: string, depart: string, langue: Langue): string {
  const fin = fmtDateLongue(depart, langue);
  const memeMois = arrivee.slice(0, 7) === depart.slice(0, 7);
  if (langue === "en") return memeMois ? `${Number(arrivee.slice(8))}–${fin}` : `${fmtDateLongue(arrivee, langue)} – ${fin}`;
  return memeMois ? `${Number(arrivee.slice(8))} au ${fin}` : `${fmtDateLongue(arrivee, langue)} au ${fin}`;
}

function bonjour(langue: Langue, prenom: string | null): string {
  const p = prenom?.trim();
  if (langue === "en") return p ? `Hello ${p},` : "Hello,";
  return p ? `Bonjour ${p},` : "Bonjour,";
}

function contact(langue: Langue, adresse: string): string {
  return langue === "en"
    ? `If you have a question: ${adresse} · ${CONTACTS}`
    : `Pour toute question : ${adresse} · ${CONTACTS}`;
}

// ─── Au client ───────────────────────────────────────────────────────────────

export interface Sejour {
  reference: string;
  prenom: string | null;
  gite: string;
  arrivee: string;
  depart: string;
}

const BOUTON_SUIVI: Bilingue<string> = { fr: "Voir ma réservation", en: "View my booking" };

/**
 * Confirmation de réservation, avec le lien de signature (ou l'annonce du
 * contrat), puis le lien « Ma réservation » (second bouton, choix du gérant du
 * 28 octobre 2026).
 */
export function texteConfirmation(
  langue: Langue,
  s: Sejour,
  faits: Recapitulatif,
  lienContrat: string | null,
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const sujet = en
    ? `Booking ${s.reference} confirmed — ${s.gite}, ${plageDates(s.arrivee, s.depart, langue)}`
    : `Réservation ${s.reference} confirmée — ${s.gite}, ${plageDates(s.arrivee, s.depart, langue)}`;
  const lignes = [faits.reference, `${faits.sejour} · ${faits.voyageurs}`, faits.paye];
  if (faits.solde) lignes.push(faits.solde);
  if (faits.caution) lignes.push(faits.caution);
  return assembler(sujet, [
    { p: bonjour(langue, s.prenom) },
    { p: en ? "Your booking is confirmed." : "Votre réservation est confirmée.", gras: true },
    { liste: lignes },
    ...(lienContrat
      ? [
          { p: en ? "Your contract (in French) is to be signed online:" : "Votre contrat est à signer en ligne :" },
          { bouton: en ? "Sign my contract" : "Signer mon contrat", lien: lienContrat },
        ]
      : [{ p: en ? "Your contract will be sent to you by email." : "Votre contrat vous sera envoyé par courriel." }]),
    { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
    { note: contact(langue, adresseContact) },
    { note: SIGNATURE[langue] },
  ]);
}

/** Lien « Ma réservation » redemandé par le formulaire du site (D-25). */
export function texteLienSuivi(
  langue: Langue,
  s: Sejour,
  lienSuivi: string,
  finValidite: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const plage = plageDates(s.arrivee, s.depart, langue);
  const fin = fmtDateLongue(finValidite, langue);
  return assembler(en ? `Your booking link — booking ${s.reference}` : `Votre lien de réservation — réservation ${s.reference}`, [
    { p: bonjour(langue, s.prenom) },
    {
      p: en
        ? `Here is the link to your booking at ${s.gite}, ${plage}:`
        : `Voici le lien vers votre réservation à ${s.gite}, du ${plage} :`,
    },
    { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
    { note: en ? `This link works until ${fin}.` : `Ce lien est valable jusqu'au ${fin}.` },
    {
      note: en
        ? "This email follows a request made on our website. If you did not make it, you can ignore it."
        : "Ce courriel fait suite à une demande faite sur notre site. Si elle ne vient pas de vous, vous pouvez l'ignorer.",
    },
    { note: LIBELLES_RECAP[langue].reference(s.reference) },
    { note: contact(langue, adresseContact) },
    { note: SIGNATURE[langue] },
  ]);
}

/** Contrat créé après la confirmation (sa création avait échoué) : le lien de signature. */
export function texteContrat(langue: Langue, s: Sejour, lienContrat: string, adresseContact: string): Contenu {
  const en = langue === "en";
  const plage = plageDates(s.arrivee, s.depart, langue);
  return assembler(
    en ? `Your contract to sign — booking ${s.reference}` : `Votre contrat à signer — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      {
        p: en
          ? `Your rental contract for ${s.gite}, ${plage}, is ready. It is in French and is to be signed online:`
          : `Votre contrat de location pour ${s.gite}, du ${plage}, est prêt. Il est à signer en ligne :`,
      },
      { bouton: en ? "Sign my contract" : "Signer mon contrat", lien: lienContrat },
      { note: LIBELLES_RECAP[langue].reference(s.reference) },
      { note: contact(langue, adresseContact) },
      { note: SIGNATURE[langue] },
    ],
  );
}

export interface AutreGite {
  nom: string;
  total: number;
  lien: string;
}

/** Paiement remboursé : ce qui s'est passé, le remboursement, les autres gîtes libres. */
export function texteRemboursement(
  langue: Langue,
  s: Sejour,
  r: { montant: number; fait: boolean; datesPrises: boolean; autres: AutreGite[]; lienAutresDates: string },
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(r.montant, langue);
  const plage = plageDates(s.arrivee, s.depart, langue);
  const sujet = en
    ? `Your payment of ${montant} ${r.fait ? "has been refunded" : "is being refunded"} — booking ${s.reference}`
    : `Votre paiement de ${montant} ${r.fait ? "a été remboursé" : "est en cours de remboursement"} — réservation ${s.reference}`;
  const quoi = r.datesPrises
    ? en
      ? `The dates ${plage} at ${s.gite} were booked by another guest while you were paying: your booking could not be recorded.`
      : `Les dates du ${plage} à ${s.gite} ont été réservées par un autre client pendant votre paiement : votre réservation n'a pas pu être enregistrée.`
    : en
      ? "Your booking could not be recorded."
      : "Votre réservation n'a pas pu être enregistrée.";
  const rembourse = r.fait
    ? en
      ? `Your payment of ${montant} has been refunded in full. When it appears on your account depends on your bank.`
      : `Votre paiement de ${montant} a été intégralement remboursé. Le délai d'apparition sur votre compte dépend de votre banque.`
    : en
      ? `The full refund of your payment of ${montant} is in progress.`
      : `Le remboursement intégral de votre paiement de ${montant} est en cours.`;
  const blocs: Bloc[] = [{ p: bonjour(langue, s.prenom) }, { p: quoi }, { p: rembourse, gras: true }];
  if (r.datesPrises && r.autres.length > 0) {
    blocs.push({ p: en ? "The other gîtes available on the same dates:" : "Les autres gîtes libres aux mêmes dates :" });
    for (const a of r.autres) {
      blocs.push({
        bouton: en
          ? `${a.nom} — ${fmtEuro(a.total, langue)} incl. tax`
          : `${a.nom} — ${fmtEuro(a.total, langue)} TTC`,
        lien: a.lien,
      });
    }
  } else if (r.datesPrises) {
    blocs.push({
      p: en
        ? "No other gîte is available on these dates for this number of guests."
        : "Aucun autre gîte n'est libre à ces dates pour ce nombre de voyageurs.",
    });
  }
  blocs.push(
    { note: en ? `Choose other dates: ${r.lienAutresDates}` : `Choisir d'autres dates : ${r.lienAutresDates}` },
    { note: contact(langue, adresseContact) },
    { note: SIGNATURE[langue] },
  );
  return assembler(sujet, blocs);
}

// ─── Facture et solde (Phase 4, lot 1, D-28, D-29) ───────────────────────────

const BOUTON_SOLDE: Bilingue<string> = { fr: "Payer le solde", en: "Pay the balance" };

function piedClient(langue: Langue, s: Sejour, adresseContact: string): Bloc[] {
  return [
    { note: LIBELLES_RECAP[langue].reference(s.reference) },
    { note: contact(langue, adresseContact) },
    { note: SIGNATURE[langue] },
  ];
}

/** La facture d'un paiement, en pièce jointe (PDF, en français comme le contrat, D-22). */
export function texteFacture(
  langue: Langue,
  s: Sejour,
  f: { numero: string; type: "acompte" | "solde" | "total"; montant: number },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(f.montant, langue);
  const quoi =
    f.type === "solde"
      ? en
        ? `We have received the balance for your stay: ${montant}.`
        : `Nous avons bien reçu le solde de votre séjour : ${montant}.`
      : f.type === "total"
        ? en
          ? `Here is the invoice for your stay, paid in full: ${montant}.`
          : `Voici la facture de votre séjour, réglé en totalité : ${montant}.`
        : en
          ? `Here is the invoice for your down payment: ${montant}.`
          : `Voici la facture de votre acompte : ${montant}.`;
  return assembler(en ? `Your invoice ${f.numero} — booking ${s.reference}` : `Votre facture ${f.numero} — réservation ${s.reference}`, [
    { p: bonjour(langue, s.prenom) },
    { p: quoi, gras: true },
    {
      p: en
        ? `Invoice ${f.numero} is attached (PDF, in French). ${s.gite}, ${plageDates(s.arrivee, s.depart, langue)}.`
        : `La facture n° ${f.numero} est jointe à ce courriel (PDF). ${s.gite}, du ${plageDates(s.arrivee, s.depart, langue)}.`,
    },
    { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** Préavis : le solde sera prélevé sur la carte enregistrée, à la date limite. */
export function texteSoldePreavis(
  langue: Langue,
  s: Sejour,
  d: { montant: number; date: string },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const date = fmtDateLongue(d.date, langue);
  const montant = fmtEuro(d.montant, langue);
  const plage = plageDates(s.arrivee, s.depart, langue);
  return assembler(
    en ? `Balance payment on ${date} — booking ${s.reference}` : `Prélèvement du solde le ${date} — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      {
        p: en
          ? `The balance for your stay at ${s.gite}, ${plage}, will be charged on ${date} to the card saved when you booked: ${montant}.`
          : `Le solde de votre séjour à ${s.gite}, du ${plage}, sera prélevé le ${date} sur la carte enregistrée lors de votre réservation : ${montant}.`,
        gras: true,
      },
      { p: en ? "There is nothing you need to do." : "Vous n'avez rien à faire." },
      { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
      ...piedClient(langue, s, adresseContact),
    ],
  );
}

/** Le lien pour payer le solde (et, `rappel`, son rappel la veille). */
export function texteSoldeLien(
  langue: Langue,
  s: Sejour,
  d: { montant: number; date: string; rappel: boolean },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const date = fmtDateLongue(d.date, langue);
  const montant = fmtEuro(d.montant, langue);
  const plage = plageDates(s.arrivee, s.depart, langue);
  const sujet = en
    ? `${d.rappel ? "Reminder: balance" : "Balance"} to pay by ${date} — booking ${s.reference}`
    : `${d.rappel ? "Rappel : solde" : "Solde"} à régler au plus tard le ${date} — réservation ${s.reference}`;
  return assembler(sujet, [
    { p: bonjour(langue, s.prenom) },
    {
      p: en
        ? `The balance for your stay at ${s.gite}, ${plage}, is ${montant}, to be paid by ${date} at the latest.`
        : `Le solde de votre séjour à ${s.gite}, du ${plage}, est de ${montant}, à régler au plus tard le ${date}.`,
      gras: true,
    },
    { p: en ? "You can pay it online, by card:" : "Vous pouvez le régler en ligne, par carte bancaire :" },
    { bouton: BOUTON_SOLDE[langue], lien: lienSuivi },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** Solde impayé : prélèvement refusé, ou date limite passée. */
export function texteSoldeImpaye(
  langue: Langue,
  s: Sejour,
  d: { montant: number; date: string; motif: "refus" | "echeance" },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const date = fmtDateLongue(d.date, langue);
  const montant = fmtEuro(d.montant, langue);
  const quoi =
    d.motif === "refus"
      ? en
        ? `The charge for the balance of your stay, ${montant}, due on ${date}, was declined by your bank.`
        : `Le prélèvement du solde de votre séjour, ${montant}, prévu le ${date}, a été refusé par votre banque.`
      : en
        ? `The balance of your stay, ${montant}, was due by ${date}: we have not received it.`
        : `Le solde de votre séjour, ${montant}, était à régler au plus tard le ${date} : nous ne l'avons pas reçu.`;
  return assembler(en ? `Balance not paid — booking ${s.reference}` : `Solde non réglé — réservation ${s.reference}`, [
    { p: bonjour(langue, s.prenom) },
    { p: quoi, gras: true },
    { p: en ? "You can pay it online, by card:" : "Vous pouvez le régler en ligne, par carte bancaire :" },
    { bouton: BOUTON_SOLDE[langue], lien: lienSuivi },
    {
      note: en
        ? "If you have paid it in the meantime, you can ignore this email."
        : "Si vous l'avez réglé entre-temps, vous pouvez ignorer ce courriel.",
    },
    ...piedClient(langue, s, adresseContact),
  ]);
}

// ─── Aux propriétaires (en français) ─────────────────────────────────────────

export interface FicheClient {
  nom: string;
  email: string;
  telephone: string;
  langue: Langue;
}

function lignesClient(c: FicheClient): string[] {
  return [
    `Client : ${c.nom}`,
    `Courriel : ${c.email || "—"} · Téléphone : ${c.telephone || "—"}`,
    `Langue du client : ${c.langue === "en" ? "anglais" : "français"}`,
  ];
}

export function texteAlerteReservation(
  s: Sejour,
  c: FicheClient,
  faits: Recapitulatif,
  contrat: { numero: string | null },
): Contenu {
  const lignes = [faits.reference, `${faits.sejour} · ${faits.voyageurs}`, faits.paye];
  if (faits.solde) lignes.push(faits.solde);
  if (faits.caution) lignes.push(faits.caution);
  lignes.push(
    contrat.numero
      ? `Contrat : ${contrat.numero}, envoyé au client pour signature`
      : "Contrat : pas encore créé (le site le crée et l'envoie au client)",
  );
  return assembler(`Réservation ${s.reference} — ${c.nom} — ${s.gite}, ${plageDates(s.arrivee, s.depart, "fr")}`, [
    { p: "Une réservation vient d'être payée sur le site.", gras: true },
    { liste: [...lignesClient(c), ...lignes] },
  ]);
}

export function texteAlerteSignature(s: Sejour, c: FicheClient, numero: string): Contenu {
  return assembler(`Contrat ${numero} signé — ${c.nom} — ${s.gite}, ${plageDates(s.arrivee, s.depart, "fr")}`, [
    { p: `${c.nom} a signé le contrat ${numero}.`, gras: true },
    { liste: [`Réservation : ${s.reference}`, `${s.gite}, du ${plageDates(s.arrivee, s.depart, "fr")}`, ...lignesClient(c)] },
  ]);
}

export type Probleme =
  | {
      genre: "remboursement";
      paiementId: string;
      motif: string;
      datesPrises: boolean;
      montant: number;
      /** null : paiement inconnu du site, l'état du remboursement se lit chez Stripe. */
      fait: boolean | null;
    }
  | { genre: "contrat_non_cree"; erreur: string }
  | { genre: "courriel_non_parti"; objet: string; destinataire: string; erreur: string }
  | {
      genre: "solde_impaye";
      motif: "refus" | "echeance";
      /** Code de refus de la banque, s'il est connu. */
      refus: string | null;
      montant: number;
      dateLimite: string;
      /** Seconde alerte, `jours` jours après la première. */
      relance: boolean;
      jours: number | null;
    }
  | { genre: "solde_a_verifier"; montant: number; depuis: string }
  | { genre: "facture_non_emise"; type: string; erreur: string };

const OBJETS_CLIENT: Record<string, string> = {
  confirmation: "la confirmation de réservation",
  contrat: "le lien du contrat à signer",
  remboursement: "l'avis de remboursement",
  lien_suivi: "le lien « Ma réservation » qu'il a redemandé",
  facture: "sa facture",
  solde_preavis: "le préavis du prélèvement du solde",
  solde_lien: "le lien pour payer le solde",
  solde_rappel: "le rappel du solde à payer",
  solde_impaye: "l'avis de solde non réglé",
};

export function texteAlerteProbleme(p: Probleme, s: Sejour | null, c: FicheClient | null): Contenu {
  const qui = c && s ? `${c.nom}, ${s.gite} ${plageDates(s.arrivee, s.depart, "fr")}` : null;
  const contexte: string[] = [];
  if (s) contexte.push(`Réservation : ${s.reference}`, `${s.gite}, du ${plageDates(s.arrivee, s.depart, "fr")}`);
  if (c) contexte.push(...lignesClient(c));

  let titre: string;
  let quoi: string;
  let faire: string;
  switch (p.genre) {
    case "remboursement":
      titre = `paiement remboursé${qui ? `, ${qui}` : `, paiement inconnu du site`}`;
      quoi =
        `Paiement de ${fmtEuro(p.montant)} (${p.paiementId}) reçu puis remboursé intégralement : ${p.motif}.` +
        (p.fait === true
          ? " Le remboursement est fait."
          : p.fait === false
            ? " Le remboursement est en cours : le site le retente."
            : "");
      faire = p.datesPrises
        ? "Appeler le client : ses dates ont été prises pendant son paiement. Son courriel lui propose les autres gîtes libres."
        : "Vérifier ce paiement dans le tableau de bord Stripe, puis contacter le client si besoin.";
      break;
    case "contrat_non_cree":
      titre = `contrat non créé${qui ? `, ${qui}` : ""}`;
      quoi = `La création du contrat a échoué : ${p.erreur}. Le client a reçu sa confirmation, sans le lien de signature.`;
      faire = "Rien dans l'immédiat : le site retente la création et enverra le lien au client. Si cette alerte se répète, prévenir le développeur.";
      break;
    case "courriel_non_parti":
      titre = `courriel non parti, ${p.destinataire}`;
      quoi = `Le courriel au client (${OBJETS_CLIENT[p.objet] ?? p.objet}) n'a pas pu être envoyé à ${p.destinataire}, après plusieurs essais : ${p.erreur}.`;
      faire = "Prévenir le client par téléphone et vérifier son adresse.";
      break;
    case "solde_impaye": {
      const date = fmtDateLongue(p.dateLimite, "fr");
      titre = `solde ${p.relance ? "toujours " : ""}impayé${qui ? `, ${qui}` : ""}`;
      quoi =
        (p.motif === "refus"
          ? `Le prélèvement du solde de ${fmtEuro(p.montant)} (date limite du ${date}) a été refusé par la banque du client${p.refus ? ` (code : ${p.refus})` : ""}.`
          : `Le solde de ${fmtEuro(p.montant)} n'a pas été payé à la date limite du ${date}.`) +
        (p.relance && p.jours ? ` Il n'est toujours pas payé, ${p.jours} jours après la première alerte.` : "") +
        " Le client a reçu un courriel avec le lien pour le payer en ligne.";
      faire =
        "Appeler le client. S'il ne paie pas, l'article 5.3 du contrat prévoit une mise en demeure par courriel, " +
        "puis 48 heures d'attente avant de pouvoir résilier : c'est votre décision, le site ne résilie jamais tout seul.";
      break;
    }
    case "solde_a_verifier":
      titre = `prélèvement du solde à vérifier${qui ? `, ${qui}` : ""}`;
      quoi = `Le prélèvement du solde de ${fmtEuro(p.montant)} a été demandé à Stripe, mais sa réponse n'a pas été enregistrée par le site.`;
      faire =
        "Vérifier dans le tableau de bord Stripe si le paiement a eu lieu (chercher la référence de la réservation), " +
        "puis prévenir le développeur. Le site ne retente pas, pour ne jamais prélever deux fois.";
      break;
    case "facture_non_emise":
      titre = `facture non émise${qui ? `, ${qui}` : ""}`;
      quoi = `La facture (${p.type}) n'a pas pu être émise : ${p.erreur} Aucun numéro n'a été utilisé, et le client ne l'a pas reçue.`;
      faire = "Prévenir le développeur.";
      break;
  }
  return assembler(`À TRAITER — ${titre}`, [
    { p: quoi, gras: true },
    { p: `Ce qu'il faut faire : ${faire}` },
    ...(contexte.length ? [{ liste: contexte }] : []),
  ]);
}
