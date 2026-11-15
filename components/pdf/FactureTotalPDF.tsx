import { Document, Page, Text, View, Image } from '@react-pdf/renderer';

import { EMETTEUR, LIGNE_CAPITAL, LIGNE_IMMATRICULATION, MENTIONS } from '@/lib/constantes';
import { fmtEuro } from '@/lib/format';
import { C, styles } from './FactureSoldePDF';

// FACTURE UNIQUE du séjour (Phase 4, lot 1, D-29). Depuis D-41 (14 novembre
// 2026), elle n'est faite que sur demande du client, une fois le séjour
// entièrement payé, en une fois ou en deux (acompte puis solde) : le bloc de
// paiement liste chaque paiement reçu. Elle peut être établie au nom d'une
// entreprise (raison sociale, adresse, SIREN), saisi dans le back-office.
// Mêmes styles et même mise en page que FactureSoldePDF ;
// différences : titre « Facture », objet sans « Acompte sur » ni « Solde
// sur », pas de ligne d'acompte déduit, le montant facturé est le prix total.
// Les phrases sont celles, déjà validées, des factures d'acompte et de solde.
//
// Polices natives react-pdf : Helvetica / Helvetica-Bold (corps), Times-Bold (titres).

/** Un paiement reçu, tel que la facture l'imprime. `montant` en CENTIMES. */
export type LignePaiementFacture = {
  /** « Acompte », « Solde » ou « Prix total du séjour ». */
  objet: string;
  mode: string;
  date: string;
  reference: string;
  montant: number;
};

export type FactureTotalData = {
  numeroFacture: string;
  numeroContrat: string;
  dateEmission: string;
  // Facture au nom d'une entreprise (D-41) : remplace la personne qui a réservé.
  clientRaisonSociale?: string;
  clientSiren?: string; // « 123 456 789 »
  // Client
  clientNom: string;
  clientPrenom: string;
  clientCivilite: string;
  clientAdresse: string;
  clientCodePostal: string;
  clientVille: string;
  clientPays: string;
  clientEmail: string;
  clientCiviliteDeux?: string; // civilité du conjoint (repli « Monsieur » si absente)
  clientNomDeux?: string; // si couple
  clientPrenomDeux?: string;
  // Gîte
  giteNom: string;
  giteRefGdf: string;
  giteAdresse: string;
  dateArrivee: string;
  dateDepart: string;
  heureArrivee: string;
  heureDepart: string;
  nbNuits: number;
  nbAdultes: number;
  // Montants : CENTIMES ENTIERS (fmtEuro les affiche)
  prixLocation: number;
  forfaitMenage: number;
  montantOptions: number; // ligne « Options » affichée seulement si différent de 0
  sousTotal: number;
  /** Ligne imprimée, construite par lib/montants.ts (libelleTaxeSejour). */
  libelleTaxeSejour: string;
  montantTaxeSejour: number;
  totalTtc: number;
  // Les paiements reçus, dans l'ordre (un seul pour un séjour payé en une fois).
  paiements: LignePaiementFacture[];
};

// `logo` : octets PNG lus sur le disque (lib/logo.ts), ou null → PDF sans logo.
export function FactureTotalPDF({ data, logo }: { data: FactureTotalData; logo: Buffer | null }) {
  return (
    <Document
      title={`Facture ${data.numeroFacture}`}
      author={EMETTEUR.raisonSociale}
      creator={EMETTEUR.enseigne}
      producer="@react-pdf/renderer"
      subject={`Facture — Contrat ${data.numeroContrat}`}
    >
      <Page size="A4" style={styles.page}>
        {/* HEAD */}
        <View style={styles.head} fixed={false}>
          <View style={styles.brand}>
            {logo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.tagline}>{`${EMETTEUR.raisonSociale} — Savas, Ardèche`}</Text>
          </View>
          <View style={styles.docTitle}>
            <Text style={styles.docTitleH1}>Facture</Text>
            <Text style={styles.docTitleNum}>N° {data.numeroFacture}</Text>
          </View>
        </View>

        {/* PARTIES */}
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Émetteur</Text>
            <Text style={styles.partyWho}>{EMETTEUR.raisonSociale}</Text>
            <Text style={styles.partyLine}>{LIGNE_CAPITAL}</Text>
            <Text style={styles.partyLine}>{EMETTEUR.adresse}</Text>
            <Text style={styles.partyLine}>{EMETTEUR.codePostalVille}</Text>
            <Text style={styles.partySmall}>{LIGNE_IMMATRICULATION}</Text>
            <Text style={styles.partySmall}>
              {`Gérant : ${EMETTEUR.gerant.prenom} ${EMETTEUR.gerant.nom}`}
            </Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Destinataire</Text>
            {data.clientRaisonSociale ? (
              <Text style={styles.partyWho}>{data.clientRaisonSociale}</Text>
            ) : (
              <Text style={styles.partyWho}>
                {data.clientCivilite} {data.clientNom} {data.clientPrenom}
              </Text>
            )}
            {!data.clientRaisonSociale && data.clientNomDeux && (
              <Text style={styles.partyWho}>
                {data.clientCiviliteDeux || 'Monsieur'} {data.clientNomDeux}
                {data.clientPrenomDeux ? ` ${data.clientPrenomDeux}` : ''}
              </Text>
            )}
            <Text style={styles.partyLine}>{data.clientAdresse}</Text>
            <Text style={styles.partyLine}>
              {data.clientCodePostal} {data.clientVille}
            </Text>
            <Text style={styles.partyLine}>{data.clientPays}</Text>
            {data.clientSiren && <Text style={styles.partySmall}>SIREN : {data.clientSiren}</Text>}
            <Text style={styles.partySmall}>Courriel : {data.clientEmail}</Text>
          </View>
        </View>

        {/* META */}
        <View style={styles.meta}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLbl}>Date d&apos;émission</Text>
            <Text style={styles.metaVal}>{data.dateEmission}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLbl}>Contrat de référence</Text>
            <Text style={styles.metaVal}>{data.numeroContrat}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLbl}>Période du séjour</Text>
            <Text style={styles.metaVal}>
              {data.dateArrivee} au {data.dateDepart}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLbl}>Régime fiscal</Text>
            <Text style={styles.metaVal}>Exonération TVA</Text>
          </View>
        </View>

        {/* OBJET */}
        <View style={styles.object}>
          <Text style={styles.objectH2}>Location saisonnière en meublé de tourisme</Text>
          <Text style={styles.objectStay}>
            <Text style={styles.objectStayBold}>{data.giteNom}</Text> — réf.{' '}
            {data.giteRefGdf} — {data.giteAdresse}
            {'\n'}
            Séjour du{' '}
            <Text style={styles.objectStayBold}>
              {data.dateArrivee} à {data.heureArrivee}
            </Text>{' '}
            au{' '}
            <Text style={styles.objectStayBold}>
              {data.dateDepart} à {data.heureDepart}
            </Text>{' '}
            — {data.nbNuits} nuits — {data.nbAdultes} adultes
          </Text>
        </View>

        {/* RECAP */}
        <View style={styles.recap}>
          <Text style={styles.recapH3}>Récapitulatif financier complet</Text>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>Prix de la location ({data.nbNuits} nuits)</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.prixLocation)}</Text>
          </View>
          {data.forfaitMenage !== 0 && (
            <View style={styles.line}>
              <Text style={styles.lineDesc}>Forfait ménage obligatoire</Text>
              <Text style={styles.lineAmount}>{fmtEuro(data.forfaitMenage)}</Text>
            </View>
          )}
          {data.montantOptions !== 0 && (
            <View style={styles.line}>
              <Text style={styles.lineDesc}>Options</Text>
              <Text style={styles.lineAmount}>{fmtEuro(data.montantOptions)}</Text>
            </View>
          )}
          <View style={[styles.line, styles.lineSubtotal]}>
            <Text style={[styles.lineDesc, styles.lineSubtotalText]}>Sous-total prestations</Text>
            <Text style={[styles.lineAmount, styles.lineSubtotalText]}>{fmtEuro(data.sousTotal)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>{data.libelleTaxeSejour}</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.montantTaxeSejour)}</Text>
          </View>
          <View style={[styles.line, styles.lineTotal]}>
            <Text style={[styles.lineDesc, styles.lineTotalText]}>Total du séjour</Text>
            <Text style={[styles.lineAmount, styles.lineTotalText]}>{fmtEuro(data.totalTtc)}</Text>
          </View>
        </View>

        {/* INVOICE AMOUNT */}
        <View style={styles.invoiceAmount} wrap={false}>
          <View>
            <Text style={styles.invoiceDescTop}>Montant facturé</Text>
            <Text style={styles.invoiceDescBottom}>Prix total du séjour</Text>
          </View>
          <Text style={styles.invoicePrice}>{fmtEuro(data.totalTtc)}</Text>
        </View>

        {/* NOTE */}
        <Text style={styles.futureNote}>
          Le séjour est <Text style={styles.futureNoteBold}>intégralement réglé</Text>.
        </Text>

        {/* PAYMENT */}
        <View style={styles.payment} wrap={false}>
          <View style={styles.paymentDetails}>
            {data.paiements.length === 1 ? (
              <>
                <Text style={styles.paymentH3}>Paiement</Text>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDt}>Mode :</Text>
                  <Text style={styles.paymentDd}>{data.paiements[0].mode}</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDt}>Date :</Text>
                  <Text style={styles.paymentDd}>{data.paiements[0].date}</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDt}>Référence :</Text>
                  <Text style={styles.paymentDd}>{data.paiements[0].reference}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.paymentH3}>Paiements reçus</Text>
                {data.paiements.map((p, i) => (
                  <View key={i} style={styles.paymentRow}>
                    <Text style={styles.paymentDt}>{`${p.objet} :`}</Text>
                    <Text style={styles.paymentDd}>
                      {`${fmtEuro(p.montant)} le ${p.date} — ${p.mode} — réf. ${p.reference}`}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
          <View style={styles.acquitted}>
            <Text style={styles.acquittedText}>Acquittée</Text>
          </View>
        </View>

        {/* LEGAL */}
        <View style={styles.legal} wrap={false}>
          <Text style={styles.legalH3}>Mentions légales</Text>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              <Text style={styles.legalBold}>Exonération de TVA</Text>
              {` — ${MENTIONS.articleTva}.`}
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>Pas d&apos;escompte pour règlement anticipé.</Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              <Text style={styles.legalBold}>Médiation de la consommation</Text>
              {` : ${MENTIONS.mediateur.nom}, ${MENTIONS.mediateur.adresse}, ${MENTIONS.mediateur.codePostalVille} (${MENTIONS.mediateur.site}).`}
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              La présente facture solde le contrat de location n°{' '}
              {data.numeroContrat} et clôt l&apos;intégralité des sommes dues au
              titre du séjour.
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>Conservation conseillée : 10 ans.</Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>
            <Text style={{ color: C.inkSoft }}>{EMETTEUR.raisonSociale}</Text>
            {` — Capital ${EMETTEUR.capital} — ${LIGNE_IMMATRICULATION}`}
          </Text>
          <Text>{`Exonération de TVA — ${MENTIONS.articleTva}`}</Text>
        </View>
      </Page>
    </Document>
  );
}
