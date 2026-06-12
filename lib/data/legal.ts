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
        <p>Hameau de Samoyas — 07430 Savas, France<br>SIRET 000 000 000 00000 — Code APE 5520Z<br>Téléphone : +33 6 79 33 23 51 — Email : contact@gites-samoyas.fr</p>
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
        <p>Conception et développement : Patricia &amp; Nicolas Terrafina, avec l'aide d'une agence partenaire. Typographies : Playfair Display et Inter (Google Fonts). Icônes : Lucide.</p>
      </section>
    `,
  },
  cgv: {
    title: "Conditions générales de vente",
    meta: "Applicables aux séjours réservés à partir du 1ᵉʳ janvier 2026 — version 3",
    body: `
      <section><div class="legal__num">01 — Objet</div><h2>Champ d'application</h2>
        <p>Les présentes conditions s'appliquent à toute réservation effectuée en direct sur ce site, par téléphone ou par email auprès de Patricia &amp; Nicolas Terrafina, exploitants des Gîtes de Samoyas.</p>
      </section>
      <section><div class="legal__num">02 — Réservation &amp; paiement</div><h2>Réservation et règlement</h2>
        <p>Toute réservation devient ferme après réception de l'acompte de 30 % du séjour et signature électronique du contrat (sous 48 heures). Le solde du séjour est prélevé automatiquement à J-30 sur la même carte bancaire.</p>
        <p>Une empreinte bancaire de 500 € (caution Swikly) est réalisée à J-7. Elle n'est pas débitée sauf en cas de dégât constaté à l'inventaire de départ, et est libérée 7 jours après la fin du séjour.</p>
      </section>
      <section><div class="legal__num">03 — Annulation</div><h2>Conditions d'annulation</h2>
        <p>Toute annulation doit être notifiée par écrit (email ou courrier). Les remboursements suivent le barème ci-dessous :</p>
        <table>
          <thead><tr><th>Annulation avant l'arrivée</th><th>Remboursement</th><th>Retenue</th></tr></thead>
          <tbody>
            <tr><td>Plus de 60 jours</td><td><strong>100 %</strong> du séjour</td><td>0 €</td></tr>
            <tr><td>Entre 30 et 60 jours</td><td><strong>70 %</strong> du séjour</td><td>30 % de l'acompte</td></tr>
            <tr><td>Entre 8 et 29 jours</td><td><strong>30 %</strong> du séjour</td><td>70 % du séjour</td></tr>
            <tr><td>Moins de 8 jours</td><td><strong>0 %</strong></td><td>100 % du séjour</td></tr>
          </tbody>
        </table>
        <p>Nous recommandons fortement une assurance annulation, à souscrire séparément.</p>
      </section>
      <section><div class="legal__num">04 — Séjour</div><h2>Modalités sur place</h2>
        <p>Arrivée à partir de 16h, départ avant 10h. Linge de maison et de toilette fourni. Chauffage compris. Animaux non admis. Capacité d'accueil stricte respectée (cf. fiche de chaque gîte). La taxe de séjour (5,5 % TTC du montant de l'hébergement) est facturée séparément.</p>
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
        <p>Patricia &amp; Nicolas Terrafina, Hameau de Samoyas, 07430 Savas. Email : contact@gites-samoyas.fr.</p>
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
        <p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition. Pour l'exercer : contact@gites-samoyas.fr — réponse sous 30 jours. Vous pouvez également saisir la CNIL (cnil.fr).</p>
      </section>
    `,
  },
  cookies: {
    title: "Politique cookies",
    meta: "Mise à jour le 19 mai 2026",
    body: `
      <section><div class="legal__num">01 — Principe</div><h2>Aucune case pré-cochée</h2>
        <p>Lors de votre première visite, vous choisissez librement entre <strong>Tout refuser</strong>, <strong>Personnaliser</strong> ou <strong>Tout accepter</strong>. Le refus est aussi accessible que l'acceptation. Vous pouvez modifier ce choix à tout moment depuis le pied de page.</p>
      </section>
      <section><div class="legal__num">02 — Cookies techniques</div><h2>Cookies indispensables</h2>
        <p>Strictement nécessaires au fonctionnement du site (session, panier de réservation, préférences d'affichage). Pas de consentement requis.</p>
      </section>
      <section><div class="legal__num">03 — Cookies de mesure</div><h2>Statistiques anonymisées</h2>
        <p>Si vous acceptez, nous utilisons Matomo (auto-hébergé, sans transfert hors UE) pour mesurer l'audience de manière anonymisée. Aucune donnée n'est partagée avec des tiers.</p>
      </section>
      <section><div class="legal__num">04 — Cookies tiers</div><h2>Nous n'en utilisons pas</h2>
        <p>Pas de réseau social embarqué, pas de retargeting, pas de Google Analytics. Les seules connexions tierces concernent Stripe (au moment du paiement uniquement) et Swikly (caution).</p>
      </section>
    `,
  },
};
