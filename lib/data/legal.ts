/** Documents légaux — extraits du script inline de legal.html.
 *  Les corps sont des fragments HTML statiques rédigés en dur (aucune
 *  donnée utilisateur) ; ils sont rendus via dangerouslySetInnerHTML.
 *
 *  La politique des avis (Phase 6, D-40) cite les règles écrites des avis
 *  (lib/avis-regles.ts) : durée de publication, motifs de retrait.
 *
 *  L'identité de l'exploitant (mentions légales, CGV, confidentialité) vient
 *  de EMETTEUR (lib/constantes.ts), comme sur le contrat et les factures. */
import { DUREE_AVIS_ANS, LIBELLES_MOTIF } from "@/lib/avis-regles";
import { EMETTEUR, LIGNE_CAPITAL, LIGNE_IMMATRICULATION } from "@/lib/constantes";

/** « SARL DE LA VOUTE (enseigne Les Gîtes de Samoyas) ». */
const EXPLOITANT = `${EMETTEUR.raisonSociale} (enseigne ${EMETTEUR.enseigne})`;
const SIEGE = `${EMETTEUR.adresse}, ${EMETTEUR.codePostalVille}`;

export type LegalSection = "mentions" | "cgv" | "privacy" | "cookies" | "avis";

export interface LegalDoc {
  title: string;
  meta: string;
  body: string;
}

export const LEGAL_SECTIONS: LegalSection[] = ["mentions", "cgv", "privacy", "cookies", "avis"];

export function isLegalSection(s: string): s is LegalSection {
  return (LEGAL_SECTIONS as string[]).includes(s);
}

export const LEGAL_DOCS: Record<LegalSection, LegalDoc> = {
  mentions: {
    title: "Mentions légales",
    meta: "Mise à jour le 14 novembre 2026",
    body: `
      <section><div class="legal__num">01 — Éditeur</div><h2>Éditeur du site</h2>
        <p>Le présent site est édité par la ${EMETTEUR.raisonSociale}, ${LIGNE_CAPITAL}, sous l'enseigne « ${EMETTEUR.enseigne} ».</p>
        <p>Siège social : ${SIEGE}, France<br>${LIGNE_IMMATRICULATION}<br>Téléphone : +33 6 79 33 23 51 — Email : contact@gitesdesamoyas.fr</p>
        <p>Directeur de la publication : ${EMETTEUR.gerant.prenom} ${EMETTEUR.gerant.nom}, gérant.</p>
      </section>
      <section><div class="legal__num">02 — Hébergement</div><h2>Hébergeur du site</h2>
        <p>OVHcloud — 2 rue Kellermann, 59100 Roubaix, France. Le site est hébergé en France.</p>
      </section>
      <section><div class="legal__num">03 — Propriété intellectuelle</div><h2>Contenus &amp; photographies</h2>
        <p>L'ensemble des textes, photographies et éléments graphiques présents sur ce site sont la propriété de la ${EMETTEUR.raisonSociale}, à l'exception des contenus marqués comme appartenant à des tiers (Gîtes de France, prestataires d'activités).</p>
        <p>Toute reproduction, même partielle, est interdite sans autorisation écrite préalable.</p>
      </section>
      <section><div class="legal__num">04 — Labellisation</div><h2>Gîtes de France</h2>
        <p>Les trois gîtes (LaPhine — 07G310701, L'Armu — 07G310700, La Maison Vieille — 07G310702) sont labellisés Gîtes de France depuis 2018 et classés selon la grille fédérale. Les notes Gîtes de France affichées sont collectées et vérifiées par Gîtes de France après chaque séjour ; les avis déposés sur ce site par nos clients suivent notre <a href="/legal/avis">politique des avis</a>.</p>
      </section>
      <section><div class="legal__num">05 — Crédits</div><h2>Conception</h2>
        <p>Conception et développement : Patricia &amp; Nicolas Terrafina. Typographies : Playfair Display et Inter (Google Fonts). Icônes : Lucide.</p>
      </section>
    `,
  },
  cgv: {
    title: "Conditions générales de vente",
    meta: "Applicables aux séjours réservés à partir du 1ᵉʳ janvier 2026 — version 5 du 14 novembre 2026",
    body: `
      <section><div class="legal__num">01 — Objet</div><h2>Champ d'application</h2>
        <p>Les présentes conditions s'appliquent à toute réservation effectuée en direct sur ce site, par téléphone ou par email auprès de la ${EXPLOITANT}.</p>
      </section>
      <section><div class="legal__num">02 — Réservation &amp; paiement</div><h2>Réservation et règlement</h2>
        <p>La réservation est ferme dès le paiement en ligne de l'acompte, dont le taux est indiqué lors de la réservation et au contrat. Le contrat de location est ensuite adressé par courriel, pour signature électronique.</p>
        <p>Le solde est dû au plus tard à la date indiquée au contrat. Lors de la réservation, le client choisit de le régler par prélèvement automatique sur la carte bancaire enregistrée, à cette date, ou par paiement en ligne, au plus tard à cette date. Une réservation faite après cette date est payée en totalité dès la réservation.</p>
        <p>Un dépôt de garantie, dont le montant figure sur la fiche de chaque gîte et au contrat, est constitué au choix du client : par préautorisation sur sa carte bancaire, la veille du départ, sans débit sauf dégât constaté ; par chèque remis à l'arrivée, qui n'est pas encaissé sauf dégât constaté ; ou par virement reçu avant l'arrivée, à la date indiquée au contrat. Il est restitué au plus tard 3 jours après le départ (article 6 du contrat).</p>
      </section>
      <section><div class="legal__num">03 — Annulation</div><h2>Conditions d'annulation</h2>
        <p>Toute annulation doit être notifiée par écrit (courriel ou courrier). Elle suit l'article 7 du contrat, qui indique les dates et montants exacts :</p>
        <table>
          <thead><tr><th>Annulation</th><th>Remboursement</th></tr></thead>
          <tbody>
            <tr><td>Jusqu'à la date limite du solde</td><td><strong>Toutes les sommes versées</strong></td></tr>
            <tr><td>Après la date limite du solde, et jusqu'au délai précisé au contrat avant l'heure d'arrivée</td><td><strong>Les sommes versées, sauf l'acompte</strong> (hors taxe de séjour), conservé par le bailleur</td></tr>
            <tr><td>Passé ce délai</td><td><strong>La taxe de séjour seulement</strong></td></tr>
          </tbody>
        </table>
        <p>La taxe de séjour n'est due qu'en cas de séjour : elle est remboursée dans tous les cas d'annulation. Pour un séjour payé en totalité à la réservation, la part correspondant à l'acompte est indiquée au contrat.</p>
        <p>Nous recommandons fortement une assurance annulation, à souscrire séparément.</p>
      </section>
      <section><div class="legal__num">04 — Séjour</div><h2>Modalités sur place</h2>
        <p>Les heures d'arrivée et de départ sont indiquées lors de la réservation et au contrat. Linge de maison et de toilette fourni. Chauffage compris. Animaux non admis. Capacité d'accueil stricte respectée (cf. fiche de chaque gîte). La taxe de séjour s'ajoute au prix du séjour et se paie avec lui, à la réservation ; son mode de calcul figure sur la fiche de chaque gîte.</p>
      </section>
      <section><div class="legal__num">05 — Litiges</div><h2>Litiges</h2>
        <p>Tout litige relève des tribunaux français.</p>
      </section>
    `,
  },
  privacy: {
    title: "Politique de confidentialité",
    meta: "Conforme RGPD — mise à jour le 14 novembre 2026",
    body: `
      <section><div class="legal__num">01 — Responsable</div><h2>Responsable de traitement</h2>
        <p>${EXPLOITANT}, ${SIEGE}. Email : contact@gitesdesamoyas.fr.</p>
      </section>
      <section><div class="legal__num">02 — Données collectées</div><h2>Quelles données, pour quoi ?</h2>
        <ul>
          <li><strong>Identité &amp; coordonnées</strong> — pour traiter votre réservation et vous joindre.</li>
          <li><strong>Données de paiement</strong> — traitées par Stripe (PCI-DSS), jamais stockées chez nous.</li>
          <li><strong>Dates et préférences</strong> — pour préparer votre séjour.</li>
          <li><strong>Courriel après le séjour</strong> — pour vous inviter à donner votre avis sur ce site. Si vous en déposez un, il est publié avec votre prénom, l'initiale de votre nom, votre note, votre commentaire et le mois de votre séjour, pendant ${DUREE_AVIS_ANS} ans (voir la <a href="/legal/avis">politique des avis</a>).</li>
        </ul>
      </section>
      <section><div class="legal__num">03 — Conservation</div><h2>Combien de temps ?</h2>
        <p>Les données liées à votre réservation sont conservées 5 ans après la fin du séjour, conformément aux obligations comptables et fiscales. Vous pouvez nous demander leur effacement avant — sauf pièces obligatoires.</p>
      </section>
      <section><div class="legal__num">04 — Vos droits</div><h2>Accès, rectification, effacement</h2>
        <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition. Pour l'exercer : contact@gitesdesamoyas.fr — réponse sous 30 jours. Vous pouvez également saisir la CNIL (cnil.fr).</p>
      </section>
    `,
  },
  cookies: {
    title: "Politique cookies",
    meta: "Mise à jour le 12 novembre 2026",
    body: `
      <section><div class="legal__num">01 — Principe</div><h2>Aucun cookie de mesure ni de publicité</h2>
        <p>Ce site ne dépose aucun cookie de mesure d'audience, de publicité ou de réseau social. Il n'a donc aucun consentement à vous demander : aucune bannière ne s'affiche.</p>
      </section>
      <section><div class="legal__num">02 — Paiement</div><h2>Les cookies de Stripe</h2>
        <p>À l'étape du paiement, la page charge le module de Stripe, notre prestataire de paiement. Stripe dépose alors ses propres cookies pour sécuriser la transaction et prévenir la fraude. Ils sont indispensables au paiement que vous demandez et ne servent à rien d'autre.</p>
      </section>
      <section><div class="legal__num">03 — Tiers</div><h2>Aucun autre service tiers</h2>
        <p>Pas de réseau social embarqué, pas de retargeting, pas de Google Analytics. Les polices de caractères sont servies par notre propre serveur : votre navigateur ne se connecte pas à Google pour les afficher.</p>
      </section>
    `,
  },
  avis: {
    title: "Politique des avis",
    meta: "Mise à jour le 12 novembre 2026",
    body: `
      <section><div class="legal__num">01 — Qui peut donner son avis</div><h2>Seuls nos clients, après leur séjour</h2>
        <p>Seul un client qui a séjourné dans l'un de nos gîtes, après une réservation faite sur ce site, peut déposer un avis. Après son départ, il reçoit par courriel un lien personnel, valable une durée limitée, qui permet de déposer un seul avis pour ce séjour.</p>
        <p>Les avis sont donc contrôlés : chacun correspond à un séjour réel, réservé et payé sur ce site.</p>
        <p>Les notes Gîtes de France affichées sur ce site sont recueillies et vérifiées par Gîtes de France, selon ses propres règles ; nous en reprenons la note et le nombre d'avis, avec leur source.</p>
      </section>
      <section><div class="legal__num">02 — Contrepartie</div><h2>Aucune contrepartie</h2>
        <p>Aucune contrepartie (réduction, cadeau, avantage) n'est proposée en échange d'un avis.</p>
      </section>
      <section><div class="legal__num">03 — Publication</div><h2>Publication immédiate, sans modification</h2>
        <p>Un avis comporte une note de 1 à 5 et, si le client le souhaite, un commentaire. Il est publié dès son dépôt sur la page du gîte, signé du prénom et de l'initiale du nom du client, avec le mois du séjour et la date de l'avis. Nous ne le modifions pas.</p>
        <p>Les avis sont classés du plus récent au plus ancien. La note moyenne affichée est celle de tous les avis publiés pour le gîte.</p>
      </section>
      <section><div class="legal__num">04 — Retrait</div><h2>Les seuls motifs de retrait</h2>
        <p>Un avis publié ne peut être retiré que pour l'un des motifs suivants :</p>
        <ul>
          <li>${LIBELLES_MOTIF.injurieux.fr} ;</li>
          <li>${LIBELLES_MOTIF.hors_sujet.fr} ;</li>
          <li>${LIBELLES_MOTIF.donnees_personnelles.fr} ;</li>
          <li>${LIBELLES_MOTIF.demande_auteur.fr}.</li>
        </ul>
        <p>Un avis n'est jamais retiré parce que sa note est basse ou parce qu'il est critique. Son auteur est prévenu du retrait par courriel, avec le motif.</p>
      </section>
      <section><div class="legal__num">05 — Durée</div><h2>${DUREE_AVIS_ANS} ans</h2>
        <p>Un avis reste publié ${DUREE_AVIS_ANS} ans après son dépôt, puis il est effacé. Son auteur peut demander à tout moment son retrait, en écrivant à contact@gitesdesamoyas.fr.</p>
      </section>
    `,
  },
};
