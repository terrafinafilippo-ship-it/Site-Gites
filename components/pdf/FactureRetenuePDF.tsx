import { Document, Page, Text, View, Image } from '@react-pdf/renderer';

import { EMETTEUR, LIGNE_CAPITAL, LIGNE_IMMATRICULATION, MENTIONS } from '@/lib/constantes';
import { fmtEuro } from '@/lib/format';
import { C, styles } from './FactureSoldePDF';

// FACTURE D'UNE RETENUE SUR LA CAUTION (D-41, 14 novembre 2026), faite
// seulement sur demande du client, depuis le back-office. Même suite de
// numéros et même mise en page que les autres factures.
//
// Une retenue n'est pas une location mais le dédommagement d'un dégât : la
// phrase de TVA n'est pas celle de l'article 261 D 4° (location meublée) mais
// MENTIONS.tvaRetenue (réponse du gérant, à faire confirmer au comptable).
//
// Polices natives react-pdf : Helvetica / Helvetica-Bold (corps), Times-Bold (titres).

export type FactureRetenueData = {
  numeroFacture: string;
  numeroContrat: string;
  dateEmission: string;
  // Facture au nom d'une entreprise (D-41) : remplace la personne qui a réservé.
  clientRaisonSociale?: string;
  clientSiren?: string;
  // Client
  clientNom: string;
  clientPrenom: string;
  clientCivilite: string;
  clientAdresse: string;
  clientCodePostal: string;
  clientVille: string;
  clientPays: string;
  clientEmail: string;
  clientCiviliteDeux?: string;
  clientNomDeux?: string;
  clientPrenomDeux?: string;
  // Gîte et séjour
  giteNom: string;
  giteRefGdf: string;
  giteAdresse: string;
  dateArrivee: string;
  dateDepart: string;
  // La retenue (table `retenues`) : montants en CENTIMES ENTIERS
  motif: string;
  /** « carte bancaire (préautorisation) », « chèque » ou « virement ». */
  moyenCaution: string;
  dateRetenue: string;
  montantCaution: number;
  montantRetenu: number;
  montantRestitue: number;
};

// `logo` : octets PNG lus sur le disque (lib/logo.ts), ou null → PDF sans logo.
export function FactureRetenuePDF({ data, logo }: { data: FactureRetenueData; logo: Buffer | null }) {
  return (
    <Document
      title={`Facture ${data.numeroFacture}`}
      author={EMETTEUR.raisonSociale}
      creator={EMETTEUR.enseigne}
      producer="@react-pdf/renderer"
      subject={`Facture de retenue — Contrat ${data.numeroContrat}`}
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
            <Text style={styles.metaVal}>Non soumis à la TVA</Text>
          </View>
        </View>

        {/* OBJET */}
        <View style={styles.object}>
          <Text style={styles.objectH2}>Retenue sur le dépôt de garantie</Text>
          <Text style={styles.objectStay}>
            <Text style={styles.objectStayBold}>{data.giteNom}</Text> — réf.{' '}
            {data.giteRefGdf} — {data.giteAdresse}
            {'\n'}
            Séjour du <Text style={styles.objectStayBold}>{data.dateArrivee}</Text> au{' '}
            <Text style={styles.objectStayBold}>{data.dateDepart}</Text>
            {'\n'}
            Motif : {data.motif}
          </Text>
        </View>

        {/* RECAP */}
        <View style={styles.recap}>
          <Text style={styles.recapH3}>Dépôt de garantie</Text>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>Dépôt de garantie ({data.moyenCaution})</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.montantCaution)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>Restitué</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.montantRestitue)}</Text>
          </View>
          <View style={[styles.line, styles.lineTotal]}>
            <Text style={[styles.lineDesc, styles.lineTotalText]}>Retenu</Text>
            <Text style={[styles.lineAmount, styles.lineTotalText]}>{fmtEuro(data.montantRetenu)}</Text>
          </View>
        </View>

        {/* INVOICE AMOUNT */}
        <View style={styles.invoiceAmount} wrap={false}>
          <View>
            <Text style={styles.invoiceDescTop}>Montant facturé</Text>
            <Text style={styles.invoiceDescBottom}>Retenue sur le dépôt de garantie</Text>
          </View>
          <Text style={styles.invoicePrice}>{fmtEuro(data.montantRetenu)}</Text>
        </View>

        {/* PAYMENT */}
        <View style={styles.payment} wrap={false}>
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentH3}>Règlement</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentDt}>Mode :</Text>
              <Text style={styles.paymentDd}>Retenue sur le dépôt de garantie</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentDt}>Date :</Text>
              <Text style={styles.paymentDd}>{data.dateRetenue}</Text>
            </View>
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
            <Text style={styles.legalText}>{MENTIONS.tvaRetenue}</Text>
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
            <Text style={styles.legalText}>Conservation conseillée : 10 ans.</Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>
            <Text style={{ color: C.inkSoft }}>{EMETTEUR.raisonSociale}</Text>
            {` — Capital ${EMETTEUR.capital} — ${LIGNE_IMMATRICULATION}`}
          </Text>
          <Text>{MENTIONS.tvaRetenue}</Text>
        </View>
      </Page>
    </Document>
  );
}
