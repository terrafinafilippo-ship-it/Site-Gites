// LE TEXTE des courriels du site (Phase 3, lot 4) : sujet, version HTML et
// version texte. Aucune lecture en base ici : lib/courriels-envoi.ts fournit
// les faits.
//
// Choix du gérant (27 octobre 2026) : au client, LES FAITS, comme l'écran de
// confirmation (lignes communes : lib/recapitulatif.ts), sans formule
// commerciale inventée ; dans sa langue ; le contrat reste en français
// (D-22). Aux propriétaires : en français, l'objet d'un problème commence par
// « À TRAITER — », et chaque alerte dit ce qu'il faut faire.
import { aujourdhuiParis, heureParis } from "@/lib/dates-civiles";
import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { ibanLisible, type CompteVirement } from "@/lib/iban";
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

/** Le contrat signé, renvoyé depuis le back-office (Phase 5, lot 4), en pièce jointe. */
export function texteContratSigne(
  langue: Langue,
  s: Sejour,
  c: { numero: string; signeLe: string },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const plage = plageDates(s.arrivee, s.depart, langue);
  const le = fmtDateLongue(c.signeLe, langue);
  return assembler(
    en ? `Your signed contract ${c.numero} — booking ${s.reference}` : `Votre contrat signé ${c.numero} — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      {
        p: en
          ? `Here is your rental contract no. ${c.numero} for ${s.gite}, ${plage}, signed on ${le}. It is attached to this email (PDF, in French).`
          : `Voici votre contrat de location n° ${c.numero} pour ${s.gite}, du ${plage}, signé le ${le}. Il est joint à ce courriel (PDF).`,
      },
      { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
      ...piedClient(langue, s, adresseContact),
    ],
  );
}

/**
 * Option posée au téléphone (Phase 5, lot 4) : le lien personnel pour
 * réserver les dates gardées, jusqu'au dernier jour de l'option inclus.
 */
export function texteOption(
  langue: Langue,
  o: { nom: string; gite: string; arrivee: string; depart: string; dernierJour: string },
  lienReserver: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const plage = plageDates(o.arrivee, o.depart, langue);
  const fin = fmtDateAvecJour(o.dernierJour, langue);
  return assembler(en ? `Your option — ${o.gite}, ${plage}` : `Votre option — ${o.gite}, du ${plage}`, [
    { p: en ? `Hello ${o.nom},` : `Bonjour ${o.nom},` },
    {
      p: en
        ? `As agreed by phone, we are holding ${o.gite} for you, ${plage}.`
        : `Comme convenu par téléphone, nous vous gardons ${o.gite} du ${plage}.`,
      gras: true,
    },
    {
      p: en
        ? `This option runs until ${fin} inclusive. To confirm your booking, please book and pay online by then:`
        : `Cette option court jusqu'au ${fin} inclus. Pour confirmer votre réservation, réservez et réglez en ligne d'ici là :`,
    },
    { bouton: en ? "Book these dates" : "Réserver ces dates", lien: lienReserver },
    {
      note: en
        ? "After that day, these dates will be open to other guests again."
        : "Passé ce jour, ces dates seront de nouveau proposées à la réservation.",
    },
    { note: contact(langue, adresseContact) },
    { note: SIGNATURE[langue] },
  ]);
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

// ─── Caution par carte (Phase 4, lot 2, D-16) ────────────────────────────────

/** Un instant, à Paris : « mercredi 31 mars 2027 à 12 h 00 ». */
function instantParis(d: Date, langue: Langue): string {
  const jour = fmtDateAvecJour(aujourdhuiParis(d), langue);
  const h = fmtHeure(heureParis(d), langue);
  return langue === "en" ? `${jour} at ${h}` : `${jour} à ${h}`;
}

/** Caution bloquée sur la carte, la veille du départ : le courriel du jour même (art. 6.2). */
export function texteCautionBloquee(
  langue: Langue,
  s: Sejour,
  d: { montant: number; levee: string },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const levee = fmtDateAvecJour(d.levee, langue);
  const plage = plageDates(s.arrivee, s.depart, langue);
  return assembler(
    en
      ? `Security deposit of ${montant} held on your card — booking ${s.reference}`
      : `Caution de ${montant} bloquée sur votre carte — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      {
        p: en
          ? `The security deposit for your stay at ${s.gite}, ${plage}, has just been held on the card saved when you booked: ${montant}.`
          : `La caution de votre séjour à ${s.gite}, du ${plage}, vient d'être bloquée sur la carte enregistrée lors de votre réservation : ${montant}.`,
        gras: true,
      },
      {
        p: en
          ? `This is a pre-authorisation: nothing is charged. It will be released by ${levee} at the latest, unless damage is found at the check-out inspection.`
          : `C'est une préautorisation : aucune somme n'est débitée. Elle sera levée au plus tard le ${levee}, sauf dégât constaté à l'état des lieux de sortie.`,
      },
      { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
      ...piedClient(langue, s, adresseContact),
    ],
  );
}

/** Préautorisation refusée, ou authentification exigée par la banque : le lien pour la valider. */
export function texteCautionAValider(
  langue: Langue,
  s: Sejour,
  d: { montant: number; authentification: boolean },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const quoi = d.authentification
    ? en
      ? `Your bank asks you to confirm the pre-authorisation of your security deposit (${montant}) on the card saved when you booked.`
      : `Votre banque demande que vous confirmiez la préautorisation de votre caution (${montant}) sur la carte enregistrée lors de votre réservation.`
    : en
      ? `The pre-authorisation of your security deposit (${montant}) on the card saved when you booked was declined by your bank.`
      : `La préautorisation de votre caution (${montant}) sur la carte enregistrée lors de votre réservation a été refusée par votre banque.`;
  return assembler(
    en ? `Your security deposit could not be held — booking ${s.reference}` : `Votre caution n'a pas pu être bloquée — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      { p: quoi, gras: true },
      { p: en ? "You can confirm it online, with the same card or another one:" : "Vous pouvez la valider en ligne, avec la même carte ou une autre :" },
      { bouton: en ? "Confirm my deposit" : "Valider ma caution", lien: lienSuivi },
      {
        note: en
          ? "Otherwise, the deposit must be provided by another means before you leave, as set out in your contract (article 6.2)."
          : "À défaut, la caution est à constituer par un autre moyen avant votre départ, comme le prévoit votre contrat (article 6.2).",
      },
      ...piedClient(langue, s, adresseContact),
    ],
  );
}

/** Préautorisation levée : rien n'a été débité ; la carte est supprimée si c'est déjà fait. */
export function texteCautionLiberee(
  langue: Langue,
  s: Sejour,
  d: { montant: number; date: string; carteEffacee: boolean },
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const date = fmtDateLongue(d.date, langue);
  const blocs: Bloc[] = [
    { p: bonjour(langue, s.prenom) },
    {
      p: en
        ? `The pre-authorisation of your ${montant} security deposit was released on ${date}: nothing has been charged.`
        : `La préautorisation de votre caution de ${montant} a été levée le ${date} : aucune somme n'a été débitée.`,
      gras: true,
    },
    { p: en ? "When it disappears from your account depends on your bank." : "Le moment où elle disparaît de votre compte dépend de votre banque." },
  ];
  if (d.carteEffacee) blocs.push({ p: en ? "Your card details have been deleted." : "Les données de votre carte ont été supprimées." });
  return assembler(
    en ? `Security deposit released — booking ${s.reference}` : `Caution levée — réservation ${s.reference}`,
    [...blocs, ...piedClient(langue, s, adresseContact)],
  );
}

// ─── Back-office, lot 2 (Phase 5) : retenue, caution reçue, rendue ──────────
// Textes validés par le gérant le 6 novembre 2026.

/**
 * Retenue sur la caution : montant, motif (écrit par les propriétaires, en
 * français, dans les deux langues), le reste, les justificatifs joints.
 */
export function texteCautionRetenue(
  langue: Langue,
  s: Sejour,
  d: { montant: number; retenu: number; motif: string; moyen: "carte" | "cheque" | "virement"; pieces: number },
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const retenu = fmtEuro(d.retenu, langue);
  const reste = d.montant - d.retenu;
  const blocs: Bloc[] = [
    { p: bonjour(langue, s.prenom) },
    {
      p: en ? `We have kept ${retenu} from your ${montant} security deposit.` : `Nous avons retenu ${retenu} sur votre caution de ${montant}.`,
      gras: true,
    },
    { p: en ? `Reason: ${d.motif}` : `Motif : ${d.motif}` },
  ];
  if (reste > 0) {
    const r = fmtEuro(reste, langue);
    blocs.push({
      p:
        d.moyen === "carte"
          ? en
            ? `The rest, ${r}, has not been charged: your bank releases it.`
            : `Le reste, ${r}, n'a pas été débité : votre banque le libère.`
          : en
            ? `The rest of your security deposit, ${r}, is being returned to you.`
            : `Le reste de votre caution, ${r}, vous est rendu.`,
    });
  }
  if (d.pieces > 0) {
    blocs.push({ p: en ? "The supporting documents are attached to this email." : "Les justificatifs sont joints à ce courriel." });
  }
  return assembler(
    en ? `Security deposit deduction — booking ${s.reference}` : `Retenue sur votre caution — réservation ${s.reference}`,
    [...blocs, ...piedClient(langue, s, adresseContact)],
  );
}

/** Caution par chèque ou virement reçue. */
export function texteCautionRecue(langue: Langue, s: Sejour, d: { montant: number; moyen: "cheque" | "virement" }, adresseContact: string): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const par = d.moyen === "virement" ? (en ? "by bank transfer" : "par virement") : en ? "by cheque" : "par chèque";
  return assembler(en ? `Security deposit received — booking ${s.reference}` : `Caution reçue — réservation ${s.reference}`, [
    { p: bonjour(langue, s.prenom) },
    { p: en ? `We have received your ${montant} security deposit ${par}.` : `Nous avons bien reçu votre caution de ${montant} ${par}.`, gras: true },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** Caution par chèque ou virement rendue entière. */
export function texteCautionRendue(langue: Langue, s: Sejour, d: { montant: number }, adresseContact: string): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  return assembler(en ? `Security deposit returned — booking ${s.reference}` : `Caution rendue — réservation ${s.reference}`, [
    { p: bonjour(langue, s.prenom) },
    { p: en ? `We have returned your ${montant} security deposit.` : `Nous vous avons rendu votre caution de ${montant}.`, gras: true },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** Caution non constituée à l'arrivée (art. 6.6) : le lien pour enregistrer une carte. */
export function texteCarteCaution(
  langue: Langue,
  s: Sejour,
  d: { montant: number; moyen: "carte" | "cheque" | "virement" | null },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const quoi =
    d.moyen === "cheque"
      ? en
        ? `The security deposit cheque (${montant}) was not handed over on arrival.`
        : `Le chèque de caution (${montant}) n'a pas été remis à votre arrivée.`
      : d.moyen === "virement"
        ? en
          ? `The security deposit transfer (${montant}) has not been received.`
          : `Le virement de la caution (${montant}) n'a pas été reçu.`
        : en
          ? `Your security deposit (${montant}) has not been provided.`
          : `Votre caution (${montant}) n'a pas été constituée.`;
  return assembler(
    en ? `Your security deposit: save a bank card — booking ${s.reference}` : `Votre caution : enregistrer une carte bancaire — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      { p: quoi, gras: true },
      {
        p: en
          ? "As set out in your contract (article 6.6), it is then provided by card: you save a card, and the pre-authorisation is made the day before you leave. Nothing is charged unless damage is found."
          : "Comme le prévoit votre contrat (article 6.6), elle est alors constituée par carte bancaire : vous enregistrez une carte, et la préautorisation est faite la veille de votre départ. Aucune somme n'est débitée, sauf dégât constaté.",
      },
      { bouton: en ? "Save my card" : "Enregistrer ma carte", lien: lienSuivi },
      ...piedClient(langue, s, adresseContact),
    ],
  );
}

/** Les lignes des coordonnées bancaires, communes au courriel et à la page « Ma réservation ». */
export function lignesVirement(langue: Langue, c: CompteVirement, montant: number, reference: string): string[] {
  const en = langue === "en";
  return [
    en ? `Account holder: ${c.titulaire}` : `Titulaire : ${c.titulaire}`,
    en ? `IBAN: ${ibanLisible(c.iban)}` : `IBAN : ${ibanLisible(c.iban)}`,
    ...(c.bic ? [en ? `BIC: ${c.bic}` : `BIC : ${c.bic}`] : []),
    en ? `Amount: ${fmtEuro(montant, langue)}` : `Montant : ${fmtEuro(montant, langue)}`,
    en ? `Reference to give: ${reference}` : `Référence à indiquer : ${reference}`,
  ];
}

/**
 * Caution par virement (Phase 4, lot 3, art. 6.2 (c)) : les coordonnées du
 * compte, la date limite, et la demande du RIB pour la restitution (le
 * client répond au courriel, D-31).
 */
export function texteCautionVirement(
  langue: Langue,
  s: Sejour,
  d: { montant: number; dateLimite: string; restitution: string; compte: CompteVirement },
  lienSuivi: string,
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const montant = fmtEuro(d.montant, langue);
  const limite = fmtDateAvecJour(d.dateLimite, langue);
  const restitution = fmtDateAvecJour(d.restitution, langue);
  const plage = plageDates(s.arrivee, s.depart, langue);
  return assembler(
    en
      ? `Your security deposit by bank transfer: account details — booking ${s.reference}`
      : `Votre caution par virement : coordonnées bancaires — réservation ${s.reference}`,
    [
      { p: bonjour(langue, s.prenom) },
      {
        p: en
          ? `As you chose, the security deposit for your stay at ${s.gite}, ${plage}, is paid by bank transfer: ${montant}, to be received by ${limite} at the latest.`
          : `Comme vous l'avez choisi, la caution de votre séjour à ${s.gite}, du ${plage}, se règle par virement : ${montant}, à recevoir au plus tard le ${limite}.`,
        gras: true,
      },
      { p: en ? "Account details:" : "Coordonnées du compte :" },
      { liste: lignesVirement(langue, d.compte, d.montant, s.reference) },
      // Contre les faux RIB envoyés au nom du bailleur (phrase validée par le
      // gérant le 3 novembre 2026).
      {
        p: en
          ? "Our bank details do not change: if in doubt, check them on your booking page."
          : "Nos coordonnées bancaires ne changent pas : en cas de doute, vérifiez-les sur votre page de réservation.",
      },
      {
        p: en
          ? "To return it to you, we need your bank details: please reply to this email with your bank details (IBAN)."
          : "Pour vous la restituer, nous avons besoin de vos coordonnées bancaires : merci de répondre à ce courriel en joignant votre RIB.",
      },
      {
        p: en
          ? `The deposit is returned to you by bank transfer by ${restitution} at the latest, unless damage is found at the check-out inspection (article 6.5 of your contract).`
          : `La caution vous est restituée par virement au plus tard le ${restitution}, sauf dégât constaté à l'état des lieux de sortie (article 6.5 de votre contrat).`,
      },
      {
        p: en ? "These details are also on your booking page:" : "Ces coordonnées figurent aussi sur votre page de réservation :",
      },
      { bouton: BOUTON_SUIVI[langue], lien: lienSuivi },
      ...piedClient(langue, s, adresseContact),
    ],
  );
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

/**
 * Alerte « caution » : bloquée, levée demain, carte enregistrée (art. 6.6) ;
 * par virement (lot 3) : à vérifier le lendemain de sa date limite, à rendre
 * la veille du délai de restitution.
 */
export function texteAlerteCaution(
  quoi: "bloquee" | "levee_demain" | "carte_enregistree" | "virement_a_verifier" | "virement_a_rendre",
  s: Sejour,
  c: FicheClient,
  d: {
    montant: number;
    /** Date limite de la banque pour encaisser, si la caution est bloquée. */
    expire: Date | null;
    levee: string;
    heureLevee: string;
    veille: string;
    heureBlocage: string;
    /** Date limite de réception du virement (aaaa-mm-jj). */
    dateLimiteVirement: string;
  },
): Contenu {
  const montant = fmtEuro(d.montant);
  const levee = fmtDateAvecJour(d.levee, "fr");
  const vers = fmtHeure(d.heureLevee, "fr");
  const sejour = `${s.gite}, ${plageDates(s.arrivee, s.depart, "fr")}`;
  const banque = d.expire ? [{ p: `La banque garde les fonds jusqu'au ${instantParis(d.expire, "fr")}.` }] : [];
  const liste: Bloc = { liste: [`Réservation : ${s.reference}`, `${s.gite}, du ${plageDates(s.arrivee, s.depart, "fr")}`, ...lignesClient(c)] };
  if (quoi === "bloquee") {
    return assembler(`Caution bloquée — ${c.nom} — ${sejour}`, [
      { p: `La caution de ${montant} est bloquée sur la carte de ${c.nom}.`, gras: true },
      { p: `Levée automatique le ${levee} vers ${vers}, sauf retenue d'ici là.` },
      ...banque,
      liste,
    ]);
  }
  if (quoi === "levee_demain") {
    return assembler(`Caution levée demain — ${c.nom} — ${sejour}`, [
      { p: `La caution de ${montant} de ${c.nom} sera levée automatiquement demain, ${levee}, vers ${vers}.`, gras: true },
      {
        p:
          "Pour retenir une somme (dégât constaté à l'état des lieux de sortie), il faut le faire avant. En attendant " +
          `l'écran de gestion, la retenue se fait dans le tableau de bord Stripe : encaisser le paiement « Caution ${s.reference} », ` +
          "pour tout ou partie du montant.",
      },
      { p: "Une fois levée, plus aucune somme ne peut être prélevée (article 6.5 du contrat)." },
      ...banque,
      liste,
    ]);
  }
  if (quoi === "virement_a_verifier") {
    return assembler(`Caution par virement à vérifier — ${c.nom} — ${sejour}`, [
      {
        p: `La caution de ${montant} de ${c.nom} devait être reçue par virement au plus tard le ${fmtDateAvecJour(d.dateLimiteVirement, "fr")}.`,
        gras: true,
      },
      {
        p:
          `Vérifiez sur le compte de la société que le virement est arrivé (référence ${s.reference}). ` +
          "Le site ne voit pas le compte bancaire : ce message est un rappel.",
      },
      {
        p:
          `S'il n'est pas arrivé, appelez le client : il arrive le ${fmtDateAvecJour(s.arrivee, "fr")}. ` +
          "À défaut de caution à son arrivée, l'article 6.6 du contrat prévoit qu'il enregistre une carte bancaire : " +
          "en attendant l'écran de gestion, prévenez le développeur pour lui envoyer le lien.",
      },
      liste,
    ]);
  }
  if (quoi === "virement_a_rendre") {
    return assembler(`Caution par virement à rendre — ${c.nom} — ${sejour}`, [
      {
        p: `La caution de ${montant} de ${c.nom}, versée par virement, est à lui rendre au plus tard demain, ${levee} (article 6.5 du contrat).`,
        gras: true,
      },
      {
        p:
          "Faites le virement sur le compte indiqué par le client (le RIB qu'il a envoyé en réponse au courriel des coordonnées bancaires). " +
          "En cas de dégât constaté, rendez ce qu'il reste après la retenue, et envoyez-lui le montant retenu et ses justificatifs (article 6.4).",
      },
      liste,
    ]);
  }
  return assembler(`Carte enregistrée pour la caution — ${c.nom} — ${sejour}`, [
    { p: `${c.nom} a enregistré une carte pour sa caution de ${montant} (article 6.6 du contrat).`, gras: true },
    { p: `La préautorisation sera faite le ${fmtDateAvecJour(d.veille, "fr")} à partir de ${fmtHeure(d.heureBlocage, "fr")}.` },
    liste,
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
  | { genre: "facture_non_emise"; type: string; erreur: string }
  | {
      genre: "caution_refusee";
      montant: number;
      /** Code de la banque ; « authentication_required » : authentification exigée. */
      refus: string | null;
      depart: string;
    }
  | { genre: "caution_montant_absent" }
  | { genre: "caution_a_verifier"; montant: number; depuis: string }
  | { genre: "virement_coordonnees_absentes"; montant: number; dateLimite: string }
  | {
      // Phase 5, lot 1 (D-32) : le compte de virement a été modifié depuis le
      // back-office. Les IBAN sont montrés masqués (4 premiers et 4 derniers caractères).
      genre: "virement_compte_modifie";
      /** Instant de la modification (ISO). */
      quand: string;
      appareil: string;
      avant: { titulaire: string; iban: string } | null;
      apres: { titulaire: string; iban: string } | null;
    }
  | {
      genre: "contestation";
      paiementId: string | null;
      /** Sorte du paiement contesté (acompte, solde, caution…), si le site le connaît. */
      type: string | null;
      montant: number;
      motif: string;
    };

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
  caution_bloquee: "l'avis de caution bloquée",
  caution_a_valider: "le lien pour valider sa caution",
  caution_liberee: "l'avis de caution levée",
  caution_carte: "le lien pour enregistrer une carte pour sa caution",
  caution_virement: "les coordonnées bancaires pour sa caution par virement",
  caution_retenue: "l'avis de retenue sur sa caution",
  caution_recue: "l'avis de caution reçue",
  caution_rendue: "l'avis de caution rendue",
  option: "le lien de son option",
  contrat_signe: "son contrat signé",
  avis_invitation: "l'invitation à donner son avis",
  avis_retrait: "l'avis du retrait de son avis",
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
    case "caution_refusee":
      titre = `caution non bloquée${qui ? `, ${qui}` : ""}`;
      quoi =
        (p.refus === "authentication_required"
          ? `La préautorisation de la caution de ${fmtEuro(p.montant)} demande une authentification du client, exigée par sa banque.`
          : `La préautorisation de la caution de ${fmtEuro(p.montant)} a été refusée par la banque du client${p.refus ? ` (code : ${p.refus})` : ""}.`) +
        " Le client a reçu un courriel avec le lien pour la valider en ligne.";
      faire =
        `Appeler le client : il part le ${fmtDateAvecJour(p.depart, "fr")}. S'il ne la valide pas, la caution est à constituer ` +
        "par un autre moyen avant son départ (chèque, article 6.2 du contrat). Le site ne réessaie pas tout seul.";
      break;
    case "caution_montant_absent":
      titre = `caution non bloquée (montant absent)${qui ? `, ${qui}` : ""}`;
      quoi = "Le montant de la caution n'est pas enregistré sur cette réservation : rien n'a été bloqué sur la carte du client.";
      faire = "Demander au client un autre moyen de caution avant son départ (chèque), et prévenir le développeur.";
      break;
    case "caution_a_verifier":
      titre = `caution à vérifier${qui ? `, ${qui}` : ""}`;
      quoi = `La préautorisation de la caution de ${fmtEuro(p.montant)} a été demandée à Stripe, mais sa réponse n'a pas été enregistrée par le site.`;
      faire =
        "Vérifier dans le tableau de bord Stripe si la caution est bloquée (chercher la référence de la réservation), " +
        "puis prévenir le développeur. Le site ne retente pas, pour ne jamais bloquer deux fois.";
      break;
    case "virement_coordonnees_absentes":
      titre = `coordonnées bancaires absentes${qui ? `, ${qui}` : ""}`;
      quoi =
        `Le client a choisi la caution par virement (${fmtEuro(p.montant)}, à recevoir au plus tard le ${fmtDateAvecJour(p.dateLimite, "fr")}), ` +
        "mais le compte qui doit la recevoir n'est pas saisi dans les réglages du site, ou son IBAN est faux : il n'a pas reçu les coordonnées bancaires.";
      faire =
        "Saisir le titulaire et l'IBAN du compte de la société dans la gestion du site (Réglages, « Caution par virement ») : " +
        "le courriel partira tout seul au passage suivant, jusqu'à la date limite. Sinon, envoyer vous-même les coordonnées au client.";
      break;
    case "virement_compte_modifie": {
      const quand = new Date(p.quand);
      const compte = (c: { titulaire: string; iban: string } | null) =>
        c ? `${ibanMasque(c.iban)} (${c.titulaire})` : "aucun compte";
      titre = "le compte de virement a été modifié";
      quoi =
        `Le compte qui reçoit les cautions par virement a été modifié le ${fmtDateAvecJour(aujourdhuiParis(quand), "fr")} ` +
        `à ${fmtHeure(heureParis(quand), "fr")}, depuis ${p.appareil}. Avant : ${compte(p.avant)}. Après : ${compte(p.apres)}.`;
      faire =
        "Si ce changement ne vient pas de vous, changez le mot de passe de la gestion et remettez le bon compte : " +
        "les prochains courriels de virement partiront avec ces coordonnées.";
      break;
    }
    case "contestation":
      titre = `paiement contesté${qui ? `, ${qui}` : ""}`;
      quoi =
        `Le client a contesté auprès de sa banque un paiement de ${fmtEuro(p.montant)}` +
        `${p.type ? ` (${p.type})` : ""}${p.paiementId ? `, référence ${p.paiementId}` : ""} ; motif donné par la banque : ${p.motif}.`;
      faire =
        "Répondre à la contestation dans le tableau de bord Stripe (rubrique Litiges) avant la date limite qu'il indique : " +
        "sans réponse, la somme est perdue. Prévenir le développeur si besoin.";
      break;
  }
  return assembler(`À TRAITER — ${titre}`, [
    { p: quoi, gras: true },
    { p: `Ce qu'il faut faire : ${faire}` },
    ...(contexte.length ? [{ liste: contexte }] : []),
  ]);
}

// ─── Avis des clients (Phase 6, D-40) ────────────────────────────────────────

/** L'invitation à donner son avis, après le départ, avec le lien personnel. */
export function texteAvisInvitation(
  langue: Langue,
  s: Sejour,
  d: { lienAvis: string; signature: string; finValidite: string },
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const plage = plageDates(s.arrivee, s.depart, langue);
  const fin = fmtDateLongue(d.finValidite, langue);
  return assembler(en ? `Your review of ${s.gite}` : `Votre avis sur ${s.gite}`, [
    { p: bonjour(langue, s.prenom) },
    {
      p: en
        ? `You stayed at ${s.gite}, ${plage}. If you wish, you can review your stay: a rating out of 5 and, if you like, a comment.`
        : `Vous avez séjourné à ${s.gite} du ${plage}. Si vous le souhaitez, vous pouvez donner votre avis sur ce séjour : une note sur 5 et, si vous le voulez, un commentaire.`,
    },
    {
      p: en
        ? `It will be published on the gîte's page, signed “${d.signature}”, with the month of your stay.`
        : `Il sera publié sur la page du gîte, signé « ${d.signature} », avec le mois de votre séjour.`,
    },
    { bouton: en ? "Leave my review" : "Donner mon avis", lien: d.lienAvis },
    { note: en ? `This link is personal and works until ${fin}.` : `Ce lien est personnel et valable jusqu'au ${fin}.` },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** L'avis retiré par les propriétaires, avec son motif (politique des avis). */
export function texteAvisRetrait(
  langue: Langue,
  s: Sejour,
  d: { publieLe: string; motif: string; aLaDemande: boolean; lienPolitique: string },
  adresseContact: string,
): Contenu {
  const en = langue === "en";
  const date = fmtDateLongue(d.publieLe, langue);
  const phrase = en
    ? d.aLaDemande
      ? `Your review of ${s.gite} dated ${date} has been removed from our website, at your request.`
      : `Your review of ${s.gite} dated ${date} has been removed from our website, for the following reason: ${d.motif}.`
    : d.aLaDemande
      ? `Votre avis du ${date} sur ${s.gite} a été retiré du site, à votre demande.`
      : `Votre avis du ${date} sur ${s.gite} a été retiré du site, pour le motif suivant : ${d.motif}.`;
  return assembler(en ? `Your review of ${s.gite} has been removed` : `Votre avis sur ${s.gite} a été retiré`, [
    { p: bonjour(langue, s.prenom) },
    { p: phrase, gras: true },
    { note: en ? `Our review policy (in French): ${d.lienPolitique}` : `Notre politique des avis : ${d.lienPolitique}` },
    ...piedClient(langue, s, adresseContact),
  ]);
}

/** Alerte « avis » : un client vient de laisser un avis, déjà publié. */
export function texteAlerteAvis(
  s: Sejour,
  c: FicheClient,
  a: { note: number; commentaire: string | null; signature: string },
  lienGestion: string,
): Contenu {
  return assembler(`Nouvel avis ${a.note}/5 — ${c.nom} — ${s.gite}`, [
    { p: `${c.nom} vient de laisser un avis. Il est publié sur la page du gîte.`, gras: true },
    {
      liste: [
        `Note : ${a.note}/5`,
        a.commentaire ? `Commentaire : « ${a.commentaire} »` : "Commentaire : aucun",
        `Signé : ${a.signature}`,
        `Réservation : ${s.reference}`,
        `${s.gite}, du ${plageDates(s.arrivee, s.depart, "fr")}`,
      ],
    },
    {
      p:
        "Vous ne pouvez le retirer que pour l'un des motifs de la politique des avis : propos injurieux, avis hors sujet, " +
        "données personnelles, demande de son auteur. Un avis critique ou mal noté ne se retire pas.",
    },
    { bouton: "Ouvrir les avis", lien: lienGestion },
  ]);
}

/** « FR76 •••• 0189 » : assez pour reconnaître un compte, pas pour le recopier. */
export function ibanMasque(iban: string): string {
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}

// ─── Back-office (Phase 5, lot 1, D-32) ──────────────────────────────────────
// Aux propriétaires, en français, envoyés tout de suite (lib/gestion/connexion.ts) :
// ils portent un secret et ne passent pas par le journal des courriels.
// Textes proposés le 3 novembre 2026, validés par le gérant le 6 novembre.

const SUFFIXE_GESTION = "gestion des Gîtes de Samoyas";

function duree(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} heure${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

/** Le code d'un appareil inconnu. */
export function texteCodeGestion(code: string, demande: Date, appareil: string, minutes: number): Contenu {
  return assembler(`Code de connexion — ${SUFFIXE_GESTION}`, [
    { p: `Votre code : ${code}`, gras: true },
    { p: `Il est valable ${duree(minutes)}.` },
    {
      p:
        `Il a été demandé le ${fmtDateAvecJour(aujourdhuiParis(demande), "fr")} à ${fmtHeure(heureParis(demande), "fr")}, ` +
        `depuis un appareil inconnu (${appareil}).`,
    },
    {
      p: "Si personne parmi vous ne vient de se connecter, ne donnez ce code à personne et changez le mot de passe : quelqu'un le connaît.",
    },
  ]);
}

/** Le lien pour choisir le mot de passe. `premier` : le compte vient d'être créé, il n'a pas encore de mot de passe. */
export function texteLienGestion(lienMotDePasse: string, minutes: number, premier: boolean): Contenu {
  return assembler(`Choisir le mot de passe — ${SUFFIXE_GESTION}`, [
    { p: "Pour choisir le mot de passe de la gestion, ouvrez ce lien :" },
    { bouton: "Choisir le mot de passe", lien: lienMotDePasse },
    { p: `Il est valable ${duree(minutes)} et ne sert qu'une fois.` },
    {
      p: premier
        ? "Si personne parmi vous ne l'a demandé, ignorez ce courriel."
        : "Si personne parmi vous ne l'a demandé, ignorez ce courriel : le mot de passe actuel reste valable.",
    },
  ]);
}
