/** Documents légaux — extraits du script inline de legal.html.
 *  Les corps sont des fragments HTML statiques rédigés en dur (aucune
 *  donnée utilisateur) ; ils sont rendus via dangerouslySetInnerHTML. */

export type LegalSection = "mentions" | "cgv" | "privacy" | "cookies";

export interface LegalDoc {
  title: string;
  meta: string;
  body: string;
}

export const LEGAL_SECTIONS: LegalSection[] = ["mentions", "cgv", "privacy", "cookies"];

export function isLegalSection(s: string): s is LegalSection {
  return (LEGAL_SECTIONS as string[]).includes(s);
}

export const LEGAL_DOCS: Record<LegalSection, LegalDoc> = {
  mentions: {
    title: "Mentions légales",
    meta: "Mise à jour le 19 mai 2026",
    body: `
      <section><div class="legal__num">01 — Éditeur</div><h2>Éditeur du site</h2>
        <p>Le présent site est édité par Patricia &amp; Nicolas Terrafina, exploitants des Gîtes de Samoyas en nom propre.</p>
        <p>Hameau de Samoyas — 07430 Savas, France<br>SIRET 000 000 000 00000 — Code APE 5520Z<br>Téléphone : +33 6 79 33 23 51 — Email : contact@gitesdesamoyas.fr</p>
      </section>
      <section><div class="legal__num">02 — Hébergement</div><h2>Hébergeur du site</h2>
        <p>OVHcloud — 2 rue Kellermann, 59100 Roubaix, France. Le site est hébergé en France.</p>
      </section>
      <section><div class="legal__num">03 — Propriété intellectuelle</div><h2>Contenus &amp; photographies</h2>
        <p>L'ensemble des textes, photographies et éléments graphiques présents sur ce site sont la propriété de Patricia &amp; Nicolas Terrafina, à l'exception des contenus marqués comme appartenant à des tiers (Gîtes de France, prestataires d'activités).</p>
        <p>Toute reproduction, même partielle, est interdite sans autorisation écrite préalable.</p>
      </section>
      <section><div class="legal__num">04 — Labellisation</div><h2>Gîtes de France</h2>
        <p>Les trois gîtes (LaPhine — 07G310701, L'Armu — 07G310700, La Maison Vieille — 07G310702) sont labellisés Gîtes de France depuis 2018 et classés selon la grille fédérale. Les avis affichés sont collectés et vérifiés par Gîtes de France après chaque séjour.</p>
      </section>
      <section><div class="legal__num">05 — Crédits</div><h2>Conception</h2>
        <p>Conception et développement : Patricia &amp; Nicolas Terrafina. Typographies : Playfair Display et Inter (Google Fonts). Icônes : Lucide.</p>
      </section>
    `,
  },
  cgv: {
    title: "Conditions générales de vente",
    meta: "Applicables aux séjours réservés à partir du 1ᵉʳ janvier 2026 — version 4 du 29 octobre 2026",
    body: `
      <section><div class="legal__num">01 — Objet</div><h2>Champ d'application</h2>
        <p>Les présentes conditions s'appliquent à toute réservation effectuée en direct sur ce site, par téléphone ou par email auprès de Patricia &amp; Nicolas Terrafina, exploitants des Gîtes de Samoyas.</p>
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
      <section><div class="legal__num">05 — Litiges</div><h2>Médiation</h2>
        <p>En cas de litige, vous pouvez saisir gratuitement le médiateur de la consommation MTV — Médiation Tourisme Voyage (BP 80303 — 75823 Paris Cedex 17 — mtv.travel). Tout litige relève à défaut des tribunaux français.</p>
      </section>
    `,
  },
  privacy: {
    title: "Politique de confidentialité",
    meta: "Conforme RGPD — mise à jour le 19 mai 2026",
    body: `
      <section><div class="legal__num">01 — Responsable</div><h2>Responsable de traitement</h2>
        <p>Patricia &amp; Nicolas Terrafina, Hameau de Samoyas, 07430 Savas. Email : contact@gitesdesamoyas.fr.</p>
      </section>
      <section><div class="legal__num">02 — Données collectées</div><h2>Quelles données, pour quoi ?</h2>
        <ul>
          <li><strong>Identité &amp; coordonnées</strong> — pour traiter votre réservation et vous joindre.</li>
          <li><strong>Données de paiement</strong> — traitées par Stripe (PCI-DSS), jamais stockées chez nous.</li>
          <li><strong>Dates et préférences</strong> — pour préparer votre séjour.</li>
          <li><strong>Email post-séjour</strong> — pour solliciter votre avis vérifié Gîtes de France (consentement explicite).</li>
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
};
