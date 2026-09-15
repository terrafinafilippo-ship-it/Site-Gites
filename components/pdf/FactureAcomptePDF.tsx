import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

import { fmtEuro } from '@/lib/format';

// Polices natives react-pdf utilisées :
//   - Helvetica / Helvetica-Bold pour le corps (sans-serif sobre)
//   - Times-Bold pour les titres juridiques (serif)
// TODO V2 : remplacer par Inter + Source Serif Pro via @fontsource (npm install
//   @fontsource/inter @fontsource/source-serif-4) puis Font.register avec les .ttf
//   livrés en local pour éviter la dépendance CDN.

// Couleurs
const C = {
  ink: '#1a1a1a',
  inkSoft: '#444',
  inkMuted: '#777',
  rule: '#d4d4d4',
  ruleSoft: '#ececec',
  accent: '#2f5d3a',
  bgSoft: '#f7f8f7',
  white: '#ffffff',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.4,
    paddingTop: 38,
    paddingBottom: 48,
    paddingHorizontal: 42,
  },

  // HEAD
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingBottom: 8,
    marginBottom: 12,
  },
  brand: {
    flexDirection: 'column',
    maxWidth: 240,
  },
  logo: {
    height: 42,
    width: 'auto',
    objectFit: 'contain',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 8,
    color: C.inkMuted,
    fontWeight: 500,
    letterSpacing: 0.5,
  },
  docTitle: {
    textAlign: 'right',
  },
  docTitleH1: {
    fontFamily: 'Times-Bold',
    fontSize: 16,
    fontWeight: 700,
    color: C.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  docTitleNum: {
    fontSize: 10,
    color: C.inkSoft,
    marginTop: 2,
    fontWeight: 500,
  },

  // PARTIES
  parties: {
    flexDirection: 'row',
    gap: 28,
    marginBottom: 10,
  },
  party: {
    flex: 1,
    flexDirection: 'column',
  },
  partyLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: C.inkMuted,
    fontWeight: 600,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.ruleSoft,
  },
  partyWho: {
    fontSize: 10,
    fontWeight: 600,
    color: C.ink,
    marginBottom: 2,
  },
  partyLine: {
    color: C.inkSoft,
    fontSize: 9,
    marginBottom: 1,
  },
  partySmall: {
    fontSize: 8,
    color: C.inkMuted,
    marginTop: 2,
  },

  // META
  meta: {
    flexDirection: 'row',
    backgroundColor: C.bgSoft,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 10,
  },
  metaCell: {
    flex: 1,
  },
  metaLbl: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.inkMuted,
    fontWeight: 600,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 9,
    fontWeight: 500,
    color: C.ink,
  },

  // OBJET
  object: {
    marginBottom: 10,
  },
  objectH2: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    fontWeight: 700,
    color: C.accent,
    marginBottom: 4,
  },
  objectStay: {
    fontSize: 9,
    color: C.inkSoft,
    lineHeight: 1.5,
  },
  objectStayBold: {
    color: C.ink,
    fontWeight: 600,
  },

  // RECAP
  recap: {
    marginBottom: 8,
  },
  recapH3: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: C.inkMuted,
    fontWeight: 600,
    marginBottom: 6,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3.5,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    borderStyle: 'dotted',
  },
  lineDesc: {
    color: C.inkSoft,
    fontSize: 9,
  },
  lineAmount: {
    fontWeight: 500,
    color: C.ink,
    fontSize: 9,
  },
  lineSubtotal: {
    borderBottomColor: C.rule,
    borderStyle: 'solid',
  },
  lineSubtotalText: {
    color: C.ink,
    fontWeight: 500,
  },
  lineTotal: {
    borderTopWidth: 1.5,
    borderTopColor: C.ink,
    borderBottomWidth: 1.5,
    borderBottomColor: C.ink,
    borderStyle: 'solid',
    paddingVertical: 6,
  },
  lineTotalText: {
    color: C.ink,
    fontWeight: 700,
    fontSize: 10,
  },

  // INVOICE AMOUNT (bandeau vert)
  invoiceAmount: {
    backgroundColor: C.accent,
    color: C.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  invoiceDescTop: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: C.white,
    opacity: 0.92,
  },
  invoiceDescBottom: {
    fontSize: 12,
    fontWeight: 600,
    color: C.white,
    marginTop: 2,
  },
  invoicePrice: {
    fontSize: 18,
    fontWeight: 700,
    color: C.white,
  },

  // NOTE
  futureNote: {
    fontSize: 8.5,
    color: C.inkSoft,
    paddingVertical: 5,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.rule,
    marginBottom: 10,
    lineHeight: 1.4,
  },
  futureNoteBold: {
    color: C.ink,
    fontWeight: 600,
  },

  // PAYMENT
  payment: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 14,
  },
  paymentDetails: {
    flex: 2,
    backgroundColor: C.bgSoft,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  paymentH3: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: C.inkMuted,
    fontWeight: 600,
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  paymentDt: {
    fontSize: 9,
    color: C.inkMuted,
    fontWeight: 500,
    width: 70,
  },
  paymentDd: {
    fontSize: 9,
    color: C.ink,
    fontWeight: 500,
    flex: 1,
  },
  acquitted: {
    flex: 1,
    borderWidth: 2,
    borderColor: C.accent,
    color: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  acquittedText: {
    fontFamily: 'Times-Bold',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase',
    transform: 'rotate(-3deg)',
  },

  // LEGAL
  legal: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.ruleSoft,
    fontSize: 7.5,
    color: C.inkSoft,
    lineHeight: 1.4,
  },
  legalH3: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: C.inkMuted,
    fontWeight: 600,
    marginBottom: 3,
  },
  legalItem: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  legalBullet: {
    width: 8,
    fontSize: 7.5,
  },
  legalText: {
    flex: 1,
    fontSize: 7.5,
    color: C.inkSoft,
    lineHeight: 1.4,
  },
  legalBold: {
    color: C.ink,
    fontWeight: 600,
  },

  // FOOTER
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 42,
    right: 42,
    textAlign: 'center',
    fontSize: 7,
    color: C.inkMuted,
    borderTopWidth: 1,
    borderTopColor: C.ruleSoft,
    paddingTop: 6,
    lineHeight: 1.5,
  },
});

export type FactureAcompteData = {
  numeroFacture: string;
  numeroContrat: string;
  dateEmission: string;
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
  // Montants
  prixLocation: number;
  forfaitMenage: number;
  sousTotal: number;
  tauxTaxeSejour: number;
  montantTaxeSejour: number;
  totalTtc: number;
  tauxAcompte: number;
  montantAcompte: number;
  montantSolde: number;
  delaiSolde: number;
  dateButoirSolde: string;
  // Paiement
  modePaiement: string;
  datePaiement: string;
  referenceTransaction: string;
};

export function FactureAcomptePDF({ data, logoUrl }: { data: FactureAcompteData; logoUrl: string }) {
  return (
    <Document
      title={`Facture acompte ${data.numeroFacture}`}
      author="SARL DE LA VOUTE"
      creator="Les Gîtes de Samoyas"
      producer="@react-pdf/renderer"
      subject={`Facture d'acompte — Contrat ${data.numeroContrat}`}
    >
      <Page size="A4" style={styles.page}>
        {/* HEAD */}
        <View style={styles.head} fixed={false}>
          <View style={styles.brand}>
            <Image src={logoUrl} style={styles.logo} />
            <Text style={styles.tagline}>SARL DE LA VOUTE — Savas, Ardèche</Text>
          </View>
          <View style={styles.docTitle}>
            <Text style={styles.docTitleH1}>Facture d&apos;acompte</Text>
            <Text style={styles.docTitleNum}>N° {data.numeroFacture}</Text>
          </View>
        </View>

        {/* PARTIES */}
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Émetteur</Text>
            <Text style={styles.partyWho}>SARL DE LA VOUTE</Text>
            <Text style={styles.partyLine}>SARL au capital de 500 €</Text>
            <Text style={styles.partyLine}>176 Route de Samoyas</Text>
            <Text style={styles.partyLine}>07100 Boulieu-lès-Annonay</Text>
            <Text style={styles.partySmall}>
              RCS Annonay 831 170 782 — SIRET 831 170 782 00013
            </Text>
            <Text style={styles.partySmall}>Gérant : Nicolas Terrafina</Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Destinataire</Text>
            <Text style={styles.partyWho}>
              {data.clientCivilite} {data.clientNom} {data.clientPrenom}
            </Text>
            {data.clientNomDeux && (
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
          <Text style={styles.objectH2}>
            Acompte sur location saisonnière en meublé de tourisme
          </Text>
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
          <Text style={styles.recapH3}>Détail du séjour</Text>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>
              Prix de la location ({data.nbNuits} nuits)
            </Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.prixLocation)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>Forfait ménage obligatoire</Text>
            <Text style={styles.lineAmount}>{fmtEuro(data.forfaitMenage)}</Text>
          </View>
          <View style={[styles.line, styles.lineSubtotal]}>
            <Text style={[styles.lineDesc, styles.lineSubtotalText]}>
              Sous-total prestations
            </Text>
            <Text style={[styles.lineAmount, styles.lineSubtotalText]}>
              {fmtEuro(data.sousTotal)}
            </Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineDesc}>
              Taxe de séjour ({data.tauxTaxeSejour.toString().replace('.', ',')} %)
            </Text>
            <Text style={styles.lineAmount}>
              {fmtEuro(data.montantTaxeSejour)}
            </Text>
          </View>
          <View style={[styles.line, styles.lineTotal]}>
            <Text style={[styles.lineDesc, styles.lineTotalText]}>
              Total du séjour
            </Text>
            <Text style={[styles.lineAmount, styles.lineTotalText]}>
              {fmtEuro(data.totalTtc)}
            </Text>
          </View>
        </View>

        {/* INVOICE AMOUNT */}
        <View style={styles.invoiceAmount} wrap={false}>
          <View>
            <Text style={styles.invoiceDescTop}>Montant facturé</Text>
            <Text style={styles.invoiceDescBottom}>
              Acompte de {data.tauxAcompte} % du total TTC du séjour
            </Text>
          </View>
          <Text style={styles.invoicePrice}>{fmtEuro(data.montantAcompte)}</Text>
        </View>

        {/* FUTURE NOTE */}
        <Text style={styles.futureNote}>
          Le solde de{' '}
          <Text style={styles.futureNoteBold}>{fmtEuro(data.montantSolde)}</Text>{' '}
          fera l&apos;objet d&apos;une facture distincte, émise lors de son
          versement, au plus tard le{' '}
          <Text style={styles.futureNoteBold}>{data.dateButoirSolde}</Text> ({data.delaiSolde} jours avant l&apos;arrivée).
        </Text>

        {/* PAYMENT */}
        <View style={styles.payment} wrap={false}>
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentH3}>Paiement</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentDt}>Mode :</Text>
              <Text style={styles.paymentDd}>{data.modePaiement}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentDt}>Date :</Text>
              <Text style={styles.paymentDd}>{data.datePaiement}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentDt}>Référence :</Text>
              <Text style={styles.paymentDd}>{data.referenceTransaction}</Text>
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
            <Text style={styles.legalText}>
              <Text style={styles.legalBold}>Exonération de TVA</Text> — article
              261 D 4° du Code général des impôts.
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              Pas d&apos;escompte pour règlement anticipé.
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              <Text style={styles.legalBold}>Médiation de la consommation</Text>{' '}
              : MEDICYS, 73 Boulevard de Clichy, 75009 Paris (www.medicys.fr).
            </Text>
          </View>
          <View style={styles.legalItem}>
            <Text style={styles.legalBullet}>•</Text>
            <Text style={styles.legalText}>
              La présente facture constitue la pièce justificative du versement
              de l&apos;acompte au sens de l&apos;
              <Text style={styles.legalBold}>article 1590 du Code civil</Text>{' '}
              et engage fermement les deux parties conformément à l&apos;article
              5.2 du contrat n° {data.numeroContrat}.
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
            <Text style={{ color: C.inkSoft }}>SARL DE LA VOUTE</Text> — Capital
            500 € — RCS Annonay 831 170 782 — SIRET 831 170 782 00013
          </Text>
          <Text>
            Exonération de TVA — article 261 D 4° du Code général des impôts
          </Text>
        </View>
      </Page>
    </Document>
  );
}
