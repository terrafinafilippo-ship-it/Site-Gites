import { Document, Page, Text, View, Image } from '@react-pdf/renderer';

import { EMETTEUR, LIGNE_CAPITAL, LIGNE_IMMATRICULATION, MENTIONS } from '@/lib/constantes';
import { fmtEuro } from '@/lib/format';
import { C, styles } from './FactureSoldePDF';

// AVOIR d'une réservation annulée et remboursée (D-41, D-42), envoyé au
// client quand tout est remboursé, seulement si une facture avait été faite.
// Numéro pris dans la suite des factures (FAC-AAAA-NNN, migration 0024), même
// mise en page que les factures.
//
// La seule mention imposée est le renvoi à la facture corrigée (« Se rapporte
// à la facture n° … du … ») ; le reste suit l'exemple validé par le gérant le
// 14 novembre 2026 : objet, montant remboursé selon l'article du contrat, mode
// et date du remboursement, même phrase de TVA que les factures.
//
// Polices natives react-pdf : Helvetica / Helvetica-Bold (corps), Times-Bold (titres).

export type LigneRemboursementAvoir = {
  /** « Carte bancaire » ou « Virement bancaire ». */
  mode: string;
  date: string;
  /** Centimes. */
  montant: number;
};

export type AvoirData = {
  numeroAvoir: string;
  numeroContrat: string;
  dateEmission: string;
  // Les factures corrigées (numéro, date d'émission, montant en centimes).
  factures: { numero: string; date: string; montant: number }[];
  // Le destinataire de la facture corrigée (client, ou entreprise, D-41).
  clientRaisonSociale?: string;
  clientSiren?: string;
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
  // L'annulation (table `annulations`) : montants en CENTIMES ENTIERS
  /** « Annulation à l'initiative du locataire », etc. */
  motifAnnulation: string;
  /** « l'article 7.2 du contrat », etc. */
  article: string;
  montantConserve: number;
  montantRembourse: number;
  taxeRemboursee: number;
  remboursements: LigneRemboursementAvoir[];
};

// `logo` : octets PNG lus sur le disque (lib/logo.ts), ou null → PDF sans logo.
export function AvoirPDF({ data, logo }: { data: AvoirData; logo: Buffer | null }) {
  const facturesTexte = data.factures.map((f) => `n° ${f.numero} du ${f.date}`).join(' et ');
  return (
    <Document
      title={`Avoir ${data.numeroAvoir}`}
      author={EMETTEUR.raisonSociale}
      creator={EMETTEUR.enseigne}
      producer="@react-pdf/renderer"
      subject={`Avoir — Contrat ${data.numeroContrat}`}
    >
      <Page size="A4" style={styles.page}>
        {/* HEAD */}
        <View style={styles.head} fixed={false}>
          <View style={styles.brand}>
            {logo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.tagline}>{`${EMETTEUR.raisonSociale} — Savas, Ardèche`}</Text>
          </View>
          <View style={styles.docTitle}>
            <Text style={styles.docTitleH1}>Avoir</Text>
            <Text style={styles.docTitleNum}>N° {data.numeroAvoir}</Text>
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
            <Text style={styles.metaVal}>Exonéré de TVA</Text>
          </View>
        </View>

        {/* OBJET */}
        <View style={styles.object}>
          <Text style={styles.objectH2}>
            Se rapporte à la facture {facturesTexte}
          </Text>
          <Text style={styles.objectStay}>
            Annulation du séjour : <Text style={styles.objectStayBold}>{data.giteNom}</Text> — réf.{' '}
            {data.giteRefGdf} — {data.giteAdresse}
            {'\n'}
            Séjour du <Text style={styles.objectStayBold}>{data.dateArrivee}</Text> au{' '}
            <Text style={styles.objectStayBold}>{data.dateDepart}</Text> — contrat n° {data.numeroContrat}
            {'\n'}
            {data.motifAnnulation} ({data.article})
          </Text>
        </View>

        {/* RECAP */}
        <View style={styles.recap}>
          <Text style={styles.recapH3}>Détail</Text>
          {data.factures.map((f) => (
            <View style={styles.line} key={f.numero}>
              <Text style={styles.lineDesc}>Facture n° {f.numero}</Text>
              <Text style={styles.lineAmount}>{fmtEuro(f.montant)}</Text>
            </View>
          ))}
          <View style={styles.line}>
            <Text style={styles.lineDesc}>Conservé selon {data.article}</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.montantConserve)}</Text>
          </View>
          {data.taxeRemboursee > 0 && (
            <View style={styles.line}>
              <Text style={styles.lineDesc}>dont taxe de séjour remboursée</Text>
              <Text style={styles.lineAmount}>{fmtEuro(data.taxeRemboursee)}</Text>
            </View>
          )}
          <View style={[styles.line, styles.lineTotal]}>
            <Text style={[styles.lineDesc, styles.lineTotalText]}>Remboursé</Text>
            <Text style={[styles.lineAmount, styles.lineTotalText]}>{fmtEuro(data.montantRembourse)}</Text>
          </View>
        </View>

        {/* AMOUNT */}
        <View style={styles.invoiceAmount} wrap={false}>
          <View>
            <Text style={styles.invoiceDescTop}>Montant de l&apos;avoir</Text>
            <Text style={styles.invoiceDescBottom}>Montant remboursé, selon {data.article}</Text>
          </View>
          <Text style={styles.invoicePrice}>{fmtEuro(data.montantRembourse)}</Text>
        </View>

        {/* REMBOURSEMENT */}
        <View style={styles.payment} wrap={false}>
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentH3}>{data.remboursements.length > 1 ? 'Remboursements' : 'Remboursement'}</Text>
            {data.remboursements.map((r, i) => (
              <View style={styles.paymentRow} key={i}>
                <Text style={styles.paymentDt}>{`${fmtEuro(r.montant)} :`}</Text>
                <Text style={styles.paymentDd}>{`${r.mode}, le ${r.date}`}</Text>
              </View>
            ))}
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
