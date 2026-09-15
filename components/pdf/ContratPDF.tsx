import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

import { fmtEuro } from '@/lib/format';

const C = {
  ink: '#1a1a1a',
  inkSoft: '#3d3d3d',
  inkMuted: '#6e6e6e',
  rule: '#d4d4d4',
  ruleSoft: '#ececec',
  accent: '#2f5d3a',
  accentSoft: '#eaf1ec',
  warn: '#b94a48',
  warnSoft: '#fbeeed',
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

  // ─── COVER PAGE ──────────────────────────────────
  coverHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingBottom: 12,
    marginBottom: 14,
  },
  coverBrand: { flexDirection: 'column', maxWidth: 260 },
  coverLogo: { height: 56, width: 'auto', objectFit: 'contain' },
  coverDocId: { textAlign: 'right', flexDirection: 'column' },
  coverDocH1: {
    fontFamily: 'Times-Bold',
    fontSize: 18,
    color: C.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: 1.15,
  },
  coverDocSub: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    color: C.inkSoft,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  coverDocNum: {
    fontSize: 10,
    color: C.accent,
    fontWeight: 600,
    marginTop: 6,
  },
  coverDocDate: {
    fontSize: 8,
    color: C.inkMuted,
    marginTop: 2,
  },

  // PARTIES
  parties: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.rule,
    backgroundColor: C.bgSoft,
    padding: 10,
  },
  partyLbl: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.accent,
    fontWeight: 600,
    marginBottom: 4,
  },
  partyName: { fontSize: 10, fontWeight: 600, color: C.ink, marginBottom: 3 },
  partyInfo: { fontSize: 8.5, color: C.inkSoft, lineHeight: 1.5 },

  // SECTION (récap + échéancier)
  section: { marginBottom: 12 },
  sectionH2: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    color: C.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    borderBottomWidth: 1,
    borderBottomColor: C.accentSoft,
    paddingBottom: 2,
    marginBottom: 6,
  },

  // Récap grid (2 colonnes)
  recapGrid: { flexDirection: 'row', gap: 16 },
  recapCol: { flex: 1 },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleSoft,
  },
  recapK: { fontSize: 8.5, color: C.inkMuted },
  recapV: { fontSize: 9, fontWeight: 500, color: C.ink, textAlign: 'right' },

  // Échéancier (tableau)
  ech: {
    borderWidth: 1,
    borderColor: C.accent,
  },
  echHead: {
    flexDirection: 'row',
    backgroundColor: C.accent,
  },
  echTh: {
    color: C.white,
    fontSize: 8,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  echRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleSoft,
  },
  echTd: { fontSize: 9, paddingVertical: 5, paddingHorizontal: 8, color: C.ink },
  echTotal: { backgroundColor: C.accentSoft },
  echTotalTd: { fontWeight: 700, fontSize: 10 },

  // Bloc warn rétractation page de garde
  gcWarn: {
    backgroundColor: C.warnSoft,
    borderLeftWidth: 3,
    borderLeftColor: C.warn,
    padding: 8,
    marginBottom: 14,
  },
  gcWarnTitle: { color: C.warn, fontWeight: 700, fontSize: 9 },
  gcWarnText: { fontSize: 8.5, color: C.inkSoft, lineHeight: 1.45 },

  // Signatures preview cover
  sigPreview: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  sigBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.rule,
    borderStyle: 'dashed',
    backgroundColor: C.bgSoft,
    padding: 10,
    minHeight: 60,
  },
  sigBoxLbl: {
    fontSize: 7,
    color: C.accent,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  sigBoxName: { fontSize: 9, fontWeight: 500, color: C.ink, marginBottom: 3 },
  sigBoxSmall: { fontSize: 7.5, color: C.inkMuted },

  // Sommaire
  toc: {
    borderTopWidth: 1,
    borderTopColor: C.ruleSoft,
    paddingTop: 8,
  },
  tocTitle: {
    fontSize: 7.5,
    color: C.accent,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tocGrid: { flexDirection: 'row', gap: 18 },
  tocCol: { flex: 1 },
  tocItem: { fontSize: 7.5, color: C.inkSoft, marginBottom: 1.5 },

  // ─── ARTICLE PAGES ──────────────────────────────
  artHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: C.accentSoft,
    paddingBottom: 6,
    marginBottom: 10,
  },
  artHeadBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  artHeadLogo: { height: 18, width: 'auto', objectFit: 'contain' },
  artHeadBrandText: { fontSize: 7.5, color: C.inkMuted },
  artHeadRef: { fontSize: 7.5, color: C.inkMuted, textAlign: 'right' },
  artHeadNum: { color: C.accent, fontWeight: 600 },

  // Article block
  art: { marginBottom: 9 },
  artTitleWrap: {
    backgroundColor: C.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artNum: {
    fontFamily: 'Times-Bold',
    fontSize: 9,
    color: C.inkSoft,
    width: 38,
  },
  artTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    color: C.accent,
    flex: 1,
  },
  artH3: {
    fontSize: 8.7,
    fontWeight: 700,
    color: C.ink,
    marginTop: 4,
    marginBottom: 1.5,
  },
  artH3Num: { color: C.accent, fontWeight: 700 },
  p: {
    fontSize: 9,
    color: C.ink,
    marginBottom: 3,
    textAlign: 'justify',
    lineHeight: 1.4,
  },
  pBold: { fontWeight: 700, color: C.ink },
  pAccent: { fontWeight: 700, color: C.accent },

  // Tables articles
  tbl: { borderWidth: 0.5, borderColor: C.rule, marginVertical: 3 },
  tblHead: { flexDirection: 'row', backgroundColor: C.bgSoft },
  tblTh: {
    fontSize: 8,
    fontWeight: 700,
    color: C.accent,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRightWidth: 0.5,
    borderRightColor: C.rule,
  },
  tblRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  tblTd: {
    fontSize: 8.5,
    color: C.ink,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRightWidth: 0.5,
    borderRightColor: C.rule,
  },
  tblTdBold: { fontWeight: 700 },
  tblRowTotal: { backgroundColor: C.accentSoft },

  // Callout vert
  callout: {
    backgroundColor: C.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    padding: 6,
    marginVertical: 3,
  },
  calloutText: {
    fontSize: 8.7,
    color: C.ink,
    lineHeight: 1.4,
  },

  // Retract box (article 8)
  retract: {
    borderWidth: 1.5,
    borderColor: C.warn,
    backgroundColor: C.warnSoft,
    padding: 10,
    marginVertical: 4,
    alignItems: 'center',
  },
  retractTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    color: C.warn,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    textAlign: 'center',
  },
  retractBody: {
    fontSize: 9,
    fontWeight: 700,
    color: C.ink,
    lineHeight: 1.45,
    textAlign: 'center',
  },

  // Liste
  list: { marginVertical: 2 },
  listItem: { flexDirection: 'row', marginBottom: 1.5 },
  listBullet: { width: 12, fontSize: 9, color: C.accent, fontWeight: 700 },
  listText: { flex: 1, fontSize: 9, lineHeight: 1.4 },

  // Final signature block
  finalSig: {
    borderWidth: 1,
    borderColor: C.rule,
    backgroundColor: C.bgSoft,
    padding: 10,
    marginTop: 8,
  },
  finalSigH3: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    color: C.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metaRow: { flexDirection: 'row', marginBottom: 1.5 },
  metaK: { width: 130, fontSize: 7.5, color: C.inkMuted },
  metaV: {
    flex: 1,
    fontSize: 7.5,
    color: C.inkSoft,
    fontFamily: 'Courier',
  },
  signers: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: C.ruleSoft,
  },
  signerBlock: { flex: 1 },
  signerWho: {
    fontSize: 8,
    fontWeight: 700,
    color: C.accent,
    marginBottom: 2,
  },
  signerName: { fontSize: 8.5, color: C.ink, lineHeight: 1.45 },
  signerSmall: { fontSize: 7.5, color: C.inkMuted },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: C.ruleSoft,
    paddingTop: 5,
    fontSize: 7,
    color: C.inkMuted,
  },
  footerPg: { color: C.accent, fontWeight: 700 },
});

export type ContratData = {
  numeroContrat: string;
  dateEmission: string;

  clientCivilite: string;
  clientNom: string;
  clientPrenom: string;
  clientCiviliteDeux?: string; // civilité du conjoint (repli « M. » si absente)
  clientNomDeux?: string;
  clientPrenomDeux?: string;
  clientAdresse: string;
  clientCodePostal: string;
  clientVille: string;
  clientPays: string;
  clientTelephone: string;
  clientEmail: string;

  giteNom: string;
  giteRefGdf: string;
  giteAdresse: string;
  giteCapaciteMax: number;
  giteEquipementsSpecifiques: string;
  giteASpa: boolean;
  cautionMontant: number;

  dateArrivee: string;
  heureArrivee: string;
  heureLimiteArrivee: string;
  dateDepart: string;
  heureDepart: string;
  nbNuits: number;
  nbAdultes: number;
  nbEnfants: number;
  nbBebes: number;
  occupantsMajeurs: string;

  // Montants : CENTIMES ENTIERS (fmtEuro les affiche) ; les taux sont des décimaux
  prixLocation: number;
  forfaitMenage: number;
  montantOptions: number; // ligne « Options » affichée seulement si différent de 0
  sousTotal: number;
  tauxTaxeSejour: number;
  montantTaxeSejour: number;
  totalTtc: number;

  tauxAcompte: number;
  montantAcompte: number;
  tauxSolde: number;
  montantSolde: number;
  delaiSolde: number;
  dateButoirSolde: string;

  delaiToleranceCommerciale: number;
  contactArriveeTel: string;

  signatureSesId?: string; // identifiant technique de la signature SES (signatures.id)
  dateSignature?: string;
  adresseIpSignature?: string;
  documentHash?: string;
};

// ─── Sous-composants ────────────────────────────────
function ArtHead({ data, logoUrl }: { data: ContratData; logoUrl: string }) {
  return (
    <View style={styles.artHead}>
      <View style={styles.artHeadBrand}>
        <Image src={logoUrl} style={styles.artHeadLogo} />
        <Text style={styles.artHeadBrandText}>
          Les Gîtes de Samoyas — SARL DE LA VOUTE
        </Text>
      </View>
      <View>
        <Text style={styles.artHeadRef}>
          Contrat{' '}
          <Text style={styles.artHeadNum}>{data.numeroContrat}</Text>
        </Text>
        <Text style={styles.artHeadRef}>{data.dateEmission}</Text>
      </View>
    </View>
  );
}

function ArtTitle({ num, title }: { num: string; title: string }) {
  return (
    <View style={styles.artTitleWrap}>
      <Text style={styles.artNum}>{num}</Text>
      <Text style={styles.artTitle}>{title}</Text>
    </View>
  );
}

function PageFooter({ data }: { data: ContratData }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Contrat {data.numeroContrat} · {data.dateEmission} ·{' '}
        {data.clientCivilite} {data.clientNom}
      </Text>
      <Text
        style={styles.footerPg}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

// ─── COMPOSANT PRINCIPAL ────────────────────────────
export function ContratPDF({
  data,
  logoUrl,
}: {
  data: ContratData;
  logoUrl: string;
}) {
  const tauxTs = data.tauxTaxeSejour.toString().replace('.', ',');

  return (
    <Document
      title={`Contrat ${data.numeroContrat}`}
      author="SARL DE LA VOUTE"
      creator="Les Gîtes de Samoyas"
      producer="@react-pdf/renderer"
      subject={`Contrat de location saisonnière — ${data.giteNom}`}
    >
      {/* ════════════════ PAGE 1 — GARDE ════════════════ */}
      <Page size="A4" style={styles.page}>
        <View style={styles.coverHead}>
          <View style={styles.coverBrand}>
            <Image src={logoUrl} style={styles.coverLogo} />
          </View>
          <View style={styles.coverDocId}>
            <Text style={styles.coverDocH1}>Contrat</Text>
            <Text style={styles.coverDocSub}>
              de location saisonnière en meublé de tourisme
            </Text>
            <Text style={styles.coverDocNum}>N° {data.numeroContrat}</Text>
            <Text style={styles.coverDocDate}>
              Établi le {data.dateEmission}
            </Text>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyLbl}>Le Bailleur</Text>
            <Text style={styles.partyName}>SARL DE LA VOUTE</Text>
            <Text style={styles.partyInfo}>
              SARL au capital de 500 €{'\n'}
              176 Route de Samoyas, 07100 Boulieu-lès-Annonay{'\n'}
              RCS Annonay 831 170 782 — SIRET 831 170 782 00013{'\n'}
              Représentée par M. Nicolas TERRAFINA, gérant{'\n'}
              Tél. 06 79 33 23 51{'\n'}
              nicolas.terrafina@wanadoo.fr{'\n'}
              Enseigne commerciale : Les Gîtes de Samoyas
            </Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLbl}>Le Locataire</Text>
            <Text style={styles.partyName}>
              {data.clientCivilite} {data.clientNom} {data.clientPrenom}
              {data.clientNomDeux
                ? ` & ${data.clientCiviliteDeux || 'M.'} ${data.clientNomDeux}${data.clientPrenomDeux ? ` ${data.clientPrenomDeux}` : ''}`
                : ''}
            </Text>
            <Text style={styles.partyInfo}>
              {data.clientAdresse}{'\n'}
              {data.clientCodePostal} {data.clientVille}, {data.clientPays}
              {'\n'}
              Tél. {data.clientTelephone || '—'}{'\n'}
              Courriel : {data.clientEmail}
            </Text>
          </View>
        </View>

        {/* Récap séjour */}
        <View style={styles.section}>
          <Text style={styles.sectionH2}>Récapitulatif du séjour</Text>
          <View style={styles.recapGrid}>
            <View style={styles.recapCol}>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Gîte loué</Text>
                <Text style={styles.recapV}>
                  {data.giteNom} ({data.giteRefGdf})
                </Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Arrivée</Text>
                <Text style={styles.recapV}>
                  {data.dateArrivee} à partir de {data.heureArrivee}
                </Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Départ</Text>
                <Text style={styles.recapV}>
                  {data.dateDepart} avant {data.heureDepart}
                </Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Durée</Text>
                <Text style={styles.recapV}>{data.nbNuits} nuits</Text>
              </View>
            </View>
            <View style={styles.recapCol}>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Adresse</Text>
                <Text style={styles.recapV}>{data.giteAdresse}</Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Occupants</Text>
                <Text style={styles.recapV}>
                  {data.nbAdultes} adultes
                  {data.nbEnfants ? ` + ${data.nbEnfants} enf.` : ''}
                  {data.nbBebes ? ` + ${data.nbBebes} bébés` : ''}
                </Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Capacité max</Text>
                <Text style={styles.recapV}>
                  {data.giteCapaciteMax} personnes
                </Text>
              </View>
              <View style={styles.recapRow}>
                <Text style={styles.recapK}>Caution (Swikly)</Text>
                <Text style={styles.recapV}>{fmtEuro(data.cautionMontant)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Échéancier */}
        <View style={styles.section}>
          <Text style={styles.sectionH2}>Prix & échéancier de paiement</Text>
          <View style={styles.ech}>
            <View style={styles.echHead}>
              <Text style={[styles.echTh, { flex: 3 }]}>Poste</Text>
              <Text style={[styles.echTh, { flex: 1.5, textAlign: 'right' }]}>
                Montant
              </Text>
              <Text style={[styles.echTh, { flex: 2.5, textAlign: 'right' }]}>
                Échéance
              </Text>
            </View>
            <View style={styles.echRow}>
              <Text style={[styles.echTd, { flex: 3 }]}>
                Location ({data.nbNuits} nuits)
              </Text>
              <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.prixLocation)}
              </Text>
              <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                —
              </Text>
            </View>
            <View style={styles.echRow}>
              <Text style={[styles.echTd, { flex: 3 }]}>Forfait ménage</Text>
              <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.forfaitMenage)}
              </Text>
              <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                —
              </Text>
            </View>
            {data.montantOptions !== 0 && (
              <View style={styles.echRow}>
                <Text style={[styles.echTd, { flex: 3 }]}>Options</Text>
                <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                  {fmtEuro(data.montantOptions)}
                </Text>
                <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                  —
                </Text>
              </View>
            )}
            <View style={styles.echRow}>
              <Text style={[styles.echTd, { flex: 3 }]}>
                Taxe de séjour ({tauxTs} %)
              </Text>
              <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.montantTaxeSejour)}
              </Text>
              <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                —
              </Text>
            </View>
            <View style={[styles.echRow, styles.echTotal]}>
              <Text style={[styles.echTd, styles.echTotalTd, { flex: 3 }]}>
                TOTAL DU SÉJOUR
              </Text>
              <Text
                style={[
                  styles.echTd,
                  styles.echTotalTd,
                  { flex: 1.5, textAlign: 'right' },
                ]}
              >
                {fmtEuro(data.totalTtc)}
              </Text>
              <Text
                style={[
                  styles.echTd,
                  styles.echTotalTd,
                  { flex: 2.5, textAlign: 'right' },
                ]}
              >
                —
              </Text>
            </View>
            <View style={styles.echRow}>
              <Text style={[styles.echTd, styles.tblTdBold, { flex: 3 }]}>
                (a) Acompte {data.tauxAcompte} %
              </Text>
              <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.montantAcompte)}
              </Text>
              <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                à la signature
              </Text>
            </View>
            <View style={styles.echRow}>
              <Text style={[styles.echTd, styles.tblTdBold, { flex: 3 }]}>
                (b) Solde {data.tauxSolde} %
              </Text>
              <Text style={[styles.echTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.montantSolde)}
              </Text>
              <Text style={[styles.echTd, { flex: 2.5, textAlign: 'right' }]}>
                au plus tard le {data.dateButoirSolde}
              </Text>
            </View>
          </View>
        </View>

        {/* Warn rétractation */}
        <View style={styles.gcWarn}>
          <Text style={styles.gcWarnText}>
            <Text style={styles.gcWarnTitle}>
              Absence de droit de rétractation —{' '}
            </Text>
            Conformément à l&apos;article L.221-28, 12° du Code de la
            consommation, le Locataire ne bénéficie d&apos;
            <Text style={styles.pBold}>aucun droit de rétractation</Text> pour
            la présente prestation d&apos;hébergement fournie à une date
            déterminée. Détail à l&apos;article 8.
          </Text>
        </View>

        {/* Signatures preview */}
        <View style={styles.sigPreview}>
          <View style={styles.sigBox}>
            <Text style={styles.sigBoxLbl}>Pour le Bailleur</Text>
            <Text style={styles.sigBoxName}>
              M. Nicolas TERRAFINA, gérant
            </Text>
            <Text style={styles.sigBoxSmall}>
              Signature électronique simple (SES) — règlement eIDAS
            </Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigBoxLbl}>Pour le Locataire</Text>
            <Text style={styles.sigBoxName}>
              {data.clientCivilite} {data.clientNom}
            </Text>
            <Text style={styles.sigBoxSmall}>
              Signature électronique simple (SES) — règlement eIDAS
            </Text>
          </View>
        </View>

        {/* Sommaire */}
        <View style={styles.toc}>
          <Text style={styles.tocTitle}>Sommaire</Text>
          <View style={styles.tocGrid}>
            <View style={styles.tocCol}>
              <Text style={styles.tocItem}>Art. 1 · Objet et désignation</Text>
              <Text style={styles.tocItem}>Art. 2 · Durée du séjour</Text>
              <Text style={styles.tocItem}>Art. 3 · Composition du foyer</Text>
              <Text style={styles.tocItem}>Art. 4 · Prix et composition</Text>
              <Text style={styles.tocItem}>
                Art. 5 · Paiement et acompte
              </Text>
              <Text style={styles.tocItem}>Art. 6 · Dépôt de garantie</Text>
              <Text style={styles.tocItem}>Art. 7 · Annulation</Text>
              <Text style={styles.tocItem}>Art. 8 · Rétractation</Text>
            </View>
            <View style={styles.tocCol}>
              <Text style={styles.tocItem}>Art. 9 · Arrivée et clés</Text>
              <Text style={styles.tocItem}>Art. 10 · État des lieux</Text>
              <Text style={styles.tocItem}>
                Art. 11 · Obligations du Locataire
              </Text>
              <Text style={styles.tocItem}>
                Art. 12 · Équipements spécifiques
              </Text>
              <Text style={styles.tocItem}>Art. 13 · Assurance villégiature</Text>
              <Text style={styles.tocItem}>Art. 14 · Données personnelles</Text>
              <Text style={styles.tocItem}>Art. 15 · Médiation</Text>
              <Text style={styles.tocItem}>Art. 16 · Loi et juridiction</Text>
            </View>
          </View>
        </View>

        <PageFooter data={data} />
      </Page>

      {/* ════════════════ PAGE 2 — ART. 1-5 ════════════════ */}
      <Page size="A4" style={styles.page}>
        <ArtHead data={data} logoUrl={logoUrl} />

        <View style={styles.art}>
          <ArtTitle num="—" title="Préambule" />
          <Text style={styles.p}>
            Le Bailleur exploite, sous l&apos;enseigne commerciale « Les Gîtes
            de Samoyas », trois gîtes labellisés Gîtes de France situés à
            Savas (Ardèche), dans le cadre d&apos;une activité de location
            saisonnière en meublé de tourisme exercée à titre civil. Le
            Locataire ayant souhaité louer l&apos;un de ces gîtes aux
            conditions ci-après définies, les parties sont convenues de ce
            qui suit.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 1" title="Objet et désignation du bien loué" />
          <Text style={styles.p}>
            Le Bailleur donne en location saisonnière au Locataire, qui
            accepte, à usage exclusif d&apos;habitation temporaire et de
            loisirs, le gîte ci-après désigné :
          </Text>
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.tblTh, { flex: 2.5 }]}>Élément</Text>
              <Text style={[styles.tblTh, { flex: 4 }]}>Valeur</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                Désignation commerciale
              </Text>
              <Text style={[styles.tblTd, { flex: 4 }]}>{data.giteNom}</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                Référence Gîtes de France
              </Text>
              <Text style={[styles.tblTd, { flex: 4 }]}>{data.giteRefGdf}</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>Adresse exacte</Text>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                {data.giteAdresse}
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                Capacité d&apos;accueil maximale
              </Text>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                {data.giteCapaciteMax} personnes
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                Équipements spécifiques
              </Text>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                {data.giteEquipementsSpecifiques}
              </Text>
            </View>
          </View>
          <Text style={styles.p}>
            La désignation détaillée du bien, son descriptif et son inventaire
            complet font l&apos;objet de l&apos;
            <Text style={styles.pBold}>Annexe 1 — Fiche descriptive</Text>, qui
            constitue avec le présent contrat un ensemble contractuel
            indivisible.
          </Text>
          <Text style={styles.p}>
            Le présent contrat est conclu{' '}
            <Text style={styles.pBold}>
              exclusivement à usage d&apos;habitation saisonnière
            </Text>{' '}
            au sens de l&apos;article L.324-1-1 du Code du tourisme. Toute
            autre utilisation — notamment à des fins professionnelles,
            commerciales, événementielles, ou de réception de tiers non
            déclarés à l&apos;article 3 — est strictement interdite et
            entraîne la résiliation immédiate du contrat aux torts du
            Locataire.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 2" title="Durée du séjour" />
          <Text style={styles.p}>
            Le présent contrat est conclu pour une durée déterminée :{' '}
            <Text style={styles.pBold}>
              du {data.dateArrivee} à partir de {data.heureArrivee}
            </Text>
            ,{' '}
            <Text style={styles.pBold}>
              au {data.dateDepart} avant {data.heureDepart}
            </Text>
            , soit <Text style={styles.pBold}>{data.nbNuits} nuits</Text>.
          </Text>
          <Text style={styles.p}>
            Conformément à l&apos;article 1737 du Code civil, le présent
            contrat prend fin de plein droit à l&apos;expiration du terme
            fixé, sans qu&apos;il soit nécessaire de donner congé. Le
            Locataire ne pourra en aucune circonstance se prévaloir d&apos;un
            quelconque droit au maintien dans les lieux à l&apos;issue du
            séjour. La durée du séjour ne peut excéder{' '}
            <Text style={styles.pBold}>quatre-vingt-dix (90) jours</Text>{' '}
            consécutifs, conformément à la réglementation applicable aux
            meublés de tourisme.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 3" title="Composition du foyer occupant" />
          <Text style={styles.p}>
            Le séjour est réservé pour les seules personnes ci-après désignées
            :
          </Text>
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.tblTh, { flex: 5 }]}>Catégorie</Text>
              <Text
                style={[styles.tblTh, { flex: 1, textAlign: 'right' }]}
              >
                Nombre
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Adultes (18 ans et plus)
              </Text>
              <Text style={[styles.tblTd, { flex: 1, textAlign: 'right' }]}>
                {data.nbAdultes}
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Enfants (3 à 17 ans)
              </Text>
              <Text style={[styles.tblTd, { flex: 1, textAlign: 'right' }]}>
                {data.nbEnfants}
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Bébés (moins de 3 ans)
              </Text>
              <Text style={[styles.tblTd, { flex: 1, textAlign: 'right' }]}>
                {data.nbBebes}
              </Text>
            </View>
          </View>
          <Text style={styles.p}>
            <Text style={styles.pBold}>Occupants majeurs déclarés :</Text>{' '}
            {data.occupantsMajeurs}.
          </Text>
          <Text style={styles.p}>
            Le nombre total d&apos;occupants ne peut en aucun cas excéder la
            capacité maximale du gîte définie à l&apos;article 1, soit{' '}
            <Text style={styles.pBold}>
              {data.giteCapaciteMax} personnes
            </Text>
            . Tout dépassement non préalablement autorisé par écrit constitue
            un manquement contractuel grave entraînant la résiliation
            immédiate aux torts du Locataire, sans remboursement, et sans
            préjudice de toute action en réparation.
          </Text>
          <Text style={styles.p}>
            La collecte de l&apos;identité des occupants majeurs est effectuée
            pour des motifs de sécurité, de respect de la capacité et de tenue
            du registre de présence, sur le fondement de l&apos;intérêt
            légitime du Bailleur (art. 6.1.f RGPD). Conditions de traitement
            détaillées à l&apos;article 14.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle
            num="Art. 4"
            title="Prix et composition tarifaire"
          />
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>4.1 </Text>Décomposition du prix
          </Text>
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.tblTh, { flex: 4 }]}>Poste</Text>
              <Text
                style={[styles.tblTh, { flex: 1.5, textAlign: 'right' }]}
              >
                Montant
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                Prix de la location ({data.nbNuits} nuits)
              </Text>
              <Text
                style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}
              >
                {fmtEuro(data.prixLocation)}
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                Forfait ménage obligatoire
              </Text>
              <Text
                style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}
              >
                {fmtEuro(data.forfaitMenage)}
              </Text>
            </View>
            {data.montantOptions !== 0 && (
              <View style={styles.tblRow}>
                <Text style={[styles.tblTd, { flex: 4 }]}>Options</Text>
                <Text
                  style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}
                >
                  {fmtEuro(data.montantOptions)}
                </Text>
              </View>
            )}
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, styles.tblTdBold, { flex: 4 }]}>
                Sous-total prestations du Bailleur
              </Text>
              <Text
                style={[
                  styles.tblTd,
                  styles.tblTdBold,
                  { flex: 1.5, textAlign: 'right' },
                ]}
              >
                {fmtEuro(data.sousTotal)}
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 4 }]}>
                Taxe de séjour ({tauxTs} %)
              </Text>
              <Text
                style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}
              >
                {fmtEuro(data.montantTaxeSejour)}
              </Text>
            </View>
            <View style={[styles.tblRow, styles.tblRowTotal]}>
              <Text style={[styles.tblTd, styles.tblTdBold, { flex: 4 }]}>
                TOTAL DU SÉJOUR
              </Text>
              <Text
                style={[
                  styles.tblTd,
                  styles.tblTdBold,
                  { flex: 1.5, textAlign: 'right' },
                ]}
              >
                {fmtEuro(data.totalTtc)}
              </Text>
            </View>
          </View>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>4.2 </Text>Charges comprises
          </Text>
          <Text style={styles.p}>
            Le prix s&apos;entend toutes charges comprises : eau, électricité,
            chauffage, draps et linge de toilette fournis à l&apos;arrivée,
            accès Internet le cas échéant. Charges non incluses et options à
            la carte précisées à l&apos;Annexe 1.
          </Text>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>4.3 </Text>Régime fiscal
          </Text>
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              <Text style={styles.pAccent}>Exonération de TVA</Text> — article
              261 D 4° du Code général des impôts.
            </Text>
          </View>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>4.4 </Text>Taxe de séjour
          </Text>
          <Text style={styles.p}>
            Collectée par le Bailleur pour le compte de la commune de Savas
            (art. L.2333-26 et s. CGCT), elle n&apos;entre pas dans
            l&apos;assiette des prestations du Bailleur et est intégralement
            reversée à la commune.
          </Text>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>4.5 </Text>Forfait ménage
          </Text>
          <Text style={styles.p}>
            Le forfait ménage est{' '}
            <Text style={styles.pBold}>obligatoire</Text> et ne peut être ni
            supprimé ni minoré, y compris si le Locataire souhaite assurer
            lui-même le nettoyage du gîte avant son départ.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle
            num="Art. 5"
            title="Modalités de paiement et nature juridique de l'acompte"
          />
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>5.1 </Text>Échéancier
          </Text>
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.tblTh, { flex: 2.5 }]}>Échéance</Text>
              <Text style={[styles.tblTh, { flex: 1.5, textAlign: 'right' }]}>
                Montant
              </Text>
              <Text style={[styles.tblTh, { flex: 2 }]}>Date limite</Text>
              <Text style={[styles.tblTh, { flex: 1.5 }]}>Modalité</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                (a) Acompte — {data.tauxAcompte} %
              </Text>
              <Text style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.montantAcompte)}
              </Text>
              <Text style={[styles.tblTd, { flex: 2 }]}>à la signature</Text>
              <Text style={[styles.tblTd, { flex: 1.5 }]}>CB en ligne</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 2.5 }]}>
                (b) Solde — {data.tauxSolde} %
              </Text>
              <Text style={[styles.tblTd, { flex: 1.5, textAlign: 'right' }]}>
                {fmtEuro(data.montantSolde)}
              </Text>
              <Text style={[styles.tblTd, { flex: 2 }]}>
                {data.dateButoirSolde}
              </Text>
              <Text style={[styles.tblTd, { flex: 1.5 }]}>CB en ligne</Text>
            </View>
          </View>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>5.2 </Text>Nature juridique de
            l&apos;acompte
          </Text>
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              <Text style={styles.pBold}>
                Les parties conviennent expressément que les sommes versées au
                titre de l&apos;acompte visé au 5.1 (a) constituent un ACOMPTE
                au sens de l&apos;article 1590 du Code civil, à
                l&apos;exclusion expresse de toute qualification d&apos;arrhes.
              </Text>{' '}
              En conséquence, la réservation engage fermement et
              irrévocablement les deux parties dès le versement de
              l&apos;acompte. Aucune des parties ne peut se dédire
              unilatéralement par le simple renoncement à la somme versée ou à
              son double.
            </Text>
          </View>
          <Text style={styles.p}>
            Les conditions d&apos;annulation, qui obéissent aux principes
            ci-dessus, sont définies de manière exhaustive à l&apos;article 7.
          </Text>

          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>5.3 </Text>Conséquences du
            non-versement du solde
          </Text>
          <Text style={styles.p}>
            À défaut de versement du solde à la date limite, et après mise en
            demeure par courriel restée sans effet pendant{' '}
            <Text style={styles.pBold}>48 heures</Text>, le Bailleur est en
            droit de considérer le contrat comme résilié de plein droit aux
            torts exclusifs du Locataire. Dans ce cas : (i) l&apos;acompte
            reste acquis au Bailleur à titre d&apos;indemnité forfaitaire ;
            (ii) le Bailleur recouvre la libre disposition du gîte ; (iii) le
            tout sans préjudice de toute action complémentaire en réparation.
          </Text>
        </View>

        <PageFooter data={data} />
      </Page>

      {/* ════════════════ PAGE 3 — ART. 6-10 ════════════════ */}
      <Page size="A4" style={styles.page}>
        <ArtHead data={data} logoUrl={logoUrl} />

        <View style={styles.art}>
          <ArtTitle num="Art. 6" title="Dépôt de garantie (caution)" />
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>6.1 </Text>Montant et finalité
          </Text>
          <Text style={styles.p}>
            Le Locataire constitue auprès du Bailleur un dépôt de garantie
            d&apos;un montant de{' '}
            <Text style={styles.pBold}>{fmtEuro(data.cautionMontant)}</Text>,
            destiné à couvrir les éventuels dommages causés au gîte, à son
            mobilier, à ses équipements ou à ses dépendances pendant la durée
            du séjour.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>6.2 </Text>Modalité de constitution
          </Text>
          <Text style={styles.p}>
            La constitution s&apos;opère par{' '}
            <Text style={styles.pBold}>
              empreinte bancaire pré-autorisée
            </Text>{' '}
            auprès du prestataire spécialisé{' '}
            <Text style={styles.pBold}>Swikly</Text>. Les CGU Swikly sont
            portées à la connaissance du Locataire lors de la mise en place de
            l&apos;empreinte et acceptées par lui dans ce cadre.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>6.3 </Text>Nature de l&apos;empreinte
            bancaire
          </Text>
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              <Text style={styles.pBold}>
                L&apos;empreinte bancaire constituée via Swikly NE CONSTITUE
                PAS UN ENCAISSEMENT.
              </Text>{' '}
              Aucune somme n&apos;est prélevée sur le compte du Locataire au
              moment de sa mise en place. Le Bailleur dispose uniquement de la
              faculté de procéder au prélèvement dans les conditions
              limitativement définies au 6.4.
            </Text>
          </View>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>6.4 </Text>Conditions et modalités
            de débit
          </Text>
          <Text style={styles.p}>
            Le Bailleur ne peut procéder au débit de tout ou partie du dépôt
            que dans les cas suivants, dûment constatés à l&apos;EDL de sortie
            ou dans les heures suivant le départ :
          </Text>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>1.</Text>
              <Text style={styles.listText}>
                Dégradations matérielles du gîte, du mobilier ou des
                équipements ;
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>2.</Text>
              <Text style={styles.listText}>
                Manquements aux obligations d&apos;entretien définies à
                l&apos;article 11 ;
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>3.</Text>
              <Text style={styles.listText}>
                Vol ou disparition d&apos;éléments d&apos;inventaire ;
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>4.</Text>
              <Text style={styles.listText}>
                Frais de remise en état exceptionnels (nettoyage non standard,
                traitement post-tabac, dépollution suite à présence
                d&apos;animal non déclaré, etc.) ;
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>5.</Text>
              <Text style={styles.listText}>
                Dépassement non autorisé de la capacité d&apos;accueil
                constaté pendant le séjour.
              </Text>
            </View>
          </View>
          <Text style={styles.p}>
            Le montant prélevé correspond strictement au coût réel de la
            remise en état, justifié par devis ou facture remis au Locataire
            dans un délai maximal de{' '}
            <Text style={styles.pBold}>30 jours</Text> suivant son départ.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>6.5 </Text>Mainlevée
          </Text>
          <Text style={styles.p}>
            À défaut de constat de dommage, ou à l&apos;issue de
            l&apos;évaluation du préjudice, le Bailleur procède à la mainlevée
            de l&apos;empreinte dans un délai maximal de{' '}
            <Text style={styles.pBold}>7 jours</Text> suivant le départ du
            Locataire.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 7" title="Annulation et inexécution" />
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.1 </Text>Principe : engagement
            ferme
          </Text>
          <Text style={styles.p}>
            Conformément à la nature juridique d&apos;acompte définie à
            l&apos;article 5.2, la réservation engage fermement les deux
            parties dès le versement de l&apos;acompte.{' '}
            <Text style={styles.pBold}>
              Le Locataire ne dispose d&apos;aucun droit légal au
              remboursement de l&apos;acompte en cas d&apos;annulation de son
              fait.
            </Text>
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.2 </Text>Tolérance commerciale du
            Bailleur
          </Text>
          <Text style={styles.p}>
            À titre de{' '}
            <Text style={styles.pBold}>
              geste commercial unilatéral et révocable
            </Text>
            , le Bailleur consent au Locataire les modalités suivantes en cas
            d&apos;annulation à l&apos;initiative de ce dernier, dûment
            notifiée par courriel ou courrier recommandé :
          </Text>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.listText}>
                <Text style={styles.pBold}>
                  Plus de {data.delaiToleranceCommerciale} jours avant
                  l&apos;arrivée
                </Text>{' '}
                : remboursement intégral de l&apos;acompte. Cette tolérance
                constitue une faveur commerciale et ne constitue en aucun cas
                la reconnaissance d&apos;un droit au sens du régime des
                arrhes (art. 1590 C. civ.).
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.listText}>
                <Text style={styles.pBold}>
                  Entre la date limite ci-dessus et le jour de l&apos;arrivée
                </Text>{' '}
                : l&apos;acompte reste acquis au Bailleur et le solde demeure
                exigible dans son intégralité.
              </Text>
            </View>
          </View>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.3 </Text>Force majeure
          </Text>
          <Text style={styles.p}>
            En cas d&apos;événement constitutif de force majeure au sens de
            l&apos;article 1218 du Code civil dûment justifié, et empêchant
            définitivement l&apos;exécution du séjour, les parties reprennent
            leurs prestations respectives. Le Bailleur procède au
            remboursement intégral des sommes versées sans indemnité. Ne
            constituent pas, à eux seuls, des cas de force majeure :
            empêchements personnels du Locataire (maladie sans
            hospitalisation, contraintes professionnelles, problèmes de
            transport), conditions météorologiques sauf catastrophe naturelle
            officiellement déclarée, ou épidémies sauf restrictions sanitaires
            gouvernementales rendant le séjour impossible.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.4 </Text>Annulation par le
            Bailleur
          </Text>
          <Text style={styles.p}>
            En cas d&apos;annulation à l&apos;initiative du Bailleur, pour
            quelque motif que ce soit, le Locataire reçoit le{' '}
            <Text style={styles.pBold}>
              remboursement intégral des sommes versées
            </Text>
            , dans un délai maximal de 14 jours, sans autre indemnité.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.5 </Text>Absence du Locataire à
            l&apos;arrivée
          </Text>
          <Text style={styles.p}>
            Si le Locataire ne se présente pas et n&apos;a pas prévenu le
            Bailleur de son retard dans les{' '}
            <Text style={styles.pBold}>24 heures</Text> suivant l&apos;heure
            d&apos;arrivée prévue, le contrat est considéré comme{' '}
            <Text style={styles.pBold}>
              résilié de plein droit aux torts du Locataire
            </Text>
            . Le Bailleur recouvre la libre disposition du gîte et conserve
            l&apos;intégralité des sommes déjà versées.
          </Text>
          <Text style={styles.artH3}>
            <Text style={styles.artH3Num}>7.6 </Text>Départ anticipé
          </Text>
          <Text style={styles.p}>
            Le départ anticipé du Locataire de sa propre initiative, pour
            quelque cause autre qu&apos;un manquement du Bailleur dûment
            constaté, n&apos;ouvre droit à{' '}
            <Text style={styles.pBold}>aucun remboursement</Text>.
          </Text>
        </View>

        <View style={styles.art} wrap={false}>
          <ArtTitle
            num="Art. 8"
            title="Absence de droit de rétractation"
          />
          <View style={styles.retract}>
            <Text style={styles.retractTitle}>
              Absence de droit de rétractation
            </Text>
            <Text style={styles.retractBody}>
              Conformément aux dispositions de l&apos;article L.221-28, 12° du
              Code de la consommation, le Locataire ne bénéficie d&apos;AUCUN
              DROIT DE RÉTRACTATION pour la présente prestation
              d&apos;hébergement, fournie à une date ou selon une périodicité
              déterminée. Le Locataire reconnaît expressément avoir été
              informé de cette absence de droit de rétractation préalablement
              à la conclusion du contrat.
            </Text>
          </View>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 9" title="Arrivée et remise des clés" />
          <Text style={styles.p}>
            <Text style={styles.pBold}>9.1 Horaires —</Text> Le Locataire est
            attendu le {data.dateArrivee} à partir de {data.heureArrivee}.
            L&apos;accueil ne peut être assuré au-delà de{' '}
            {data.heureLimiteArrivee} sans accord préalable du Bailleur.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>9.2 Accueil —</Text> L&apos;accueil du
            Locataire est assuré physiquement par le Bailleur ou son
            représentant. Il comprend la remise des clés, la présentation du
            gîte et de ses équipements, ainsi que la signature contradictoire
            de l&apos;état des lieux d&apos;entrée prévu à l&apos;article 10.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>
              9.3 Arrivée tardive ou différée —
            </Text>{' '}
            En cas d&apos;arrivée tardive, prévenir le Bailleur par téléphone
            au {data.contactArriveeTel}. À défaut, les dispositions de
            l&apos;article 7.5 s&apos;appliquent.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 10" title="État des lieux" />
          <Text style={styles.p}>
            <Text style={styles.pBold}>10.1 EDL d&apos;entrée —</Text> Un état
            des lieux d&apos;entrée est établi contradictoirement à
            l&apos;arrivée, accompagné de l&apos;inventaire détaillé du gîte,
            signé par les deux parties. Il constitue la seule référence en
            cas de litige sur l&apos;état du gîte.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>10.2 Réclamations à l&apos;entrée —</Text>{' '}
            Toute réclamation concernant l&apos;état du gîte ou son inventaire
            doit être formulée auprès du Bailleur{' '}
            <Text style={styles.pBold}>dans les 24 heures</Text> suivant la
            prise de possession. À défaut, l&apos;EDL est réputé accepté sans
            réserve.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>10.3 EDL de sortie —</Text> Établi
            contradictoirement le jour du départ, à l&apos;heure convenue, au
            plus tard à l&apos;heure mentionnée à l&apos;article 2. Le
            Locataire restitue alors les clés et l&apos;inventaire.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>
              10.4 Départ anticipé empêchant l&apos;EDL —
            </Text>{' '}
            L&apos;EDL peut être établi unilatéralement par le Bailleur. La
            mainlevée de la caution intervient alors dans les conditions de
            l&apos;article 6.5, le cas échéant après application des articles
            6.3 et 6.4.
          </Text>
        </View>

        <PageFooter data={data} />
      </Page>

      {/* ════════════════ PAGE 4 — ART. 11-14 ════════════════ */}
      <Page size="A4" style={styles.page}>
        <ArtHead data={data} logoUrl={logoUrl} />

        <View style={styles.art}>
          <ArtTitle
            num="Art. 11"
            title="Obligations du Locataire et règles d'utilisation"
          />
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.1 Usage paisible —</Text> Le
            Locataire est tenu d&apos;occuper paisiblement le gîte et
            d&apos;en faire usage conformément à sa destination
            d&apos;habitation saisonnière. Il s&apos;engage à respecter le
            caractère résidentiel du voisinage.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.2 Interdictions générales —</Text>{' '}
            Sont strictement interdits : (i) toute sous-location ou cession du
            contrat, même à titre gratuit ; (ii) l&apos;organisation de
            fêtes, événements, réceptions ; (iii) l&apos;accueil de tiers non
            déclarés sans accord écrit ; (iv) le tabac à l&apos;intérieur
            (voir 11.3) ; (v) les animaux de compagnie (voir 11.4) ; (vi)
            toute utilisation commerciale, professionnelle ou événementielle.
            Tout manquement constitue une cause de résiliation immédiate aux
            torts du Locataire, sans remboursement.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.3 Tabac —</Text> Il est{' '}
            <Text style={styles.pBold}>
              strictement interdit de fumer à l&apos;intérieur
            </Text>{' '}
            du gîte, y compris cheminée, pas des portes, fenêtres. En cas de
            constat (odeur, traces, mégots, détecteurs), les frais de
            nettoyage spécifique et de neutralisation des odeurs (estimés
            forfaitairement à 200 € minimum) sont prélevés sur la caution.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.4 Animaux —</Text>{' '}
            <Text style={styles.pBold}>
              La présence d&apos;animaux de compagnie est strictement
              interdite dans tous les gîtes, sans exception.
            </Text>{' '}
            Le manquement constitue une cause de résiliation immédiate. Frais
            de nettoyage et de dépollution prélevés sur la caution.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.5 Entretien quotidien —</Text>{' '}
            Pendant le séjour, le nettoyage courant (vaisselle, propreté des
            sols, déchets) est à la charge du Locataire. Le forfait ménage de
            l&apos;article 4 couvre exclusivement le nettoyage final entre
            deux locations.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.6 Tri des déchets —</Text> Le
            Locataire est tenu de respecter les consignes de tri sélectif et
            de collecte des ordures ménagères en vigueur sur la commune de
            Savas (Annexe 2).
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>11.7 Règlement intérieur —</Text> Les
            règles détaillées de fonctionnement (horaires de tranquillité,
            équipements, sécurité incendie) figurent au règlement intérieur
            annexé (Annexe 2). Le Locataire en reconnaît expressément la
            communication et l&apos;acceptation.
          </Text>
        </View>

        {data.giteASpa && (
          <View style={styles.art}>
            <ArtTitle num="Art. 12" title="Équipements spécifiques : spa" />
            <Text style={styles.p}>
              <Text style={styles.pBold}>12.1 Champ d&apos;application —</Text>{' '}
              Le présent article s&apos;applique à l&apos;utilisation du spa
              (jacuzzi) présent dans le gîte.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.pBold}>12.2 Conditions d&apos;utilisation —</Text>{' '}
              (i) Température max 38 °C (réglage verrouillé) ; (ii){' '}
              <Text style={styles.pBold}>interdiction absolue</Text>{' '}
              d&apos;alcool, tabac, nourriture, substances psychotropes dans
              ou à proximité immédiate du spa ; (iii) surveillance permanente
              des mineurs par un adulte ;{' '}
              <Text style={styles.pBold}>
                utilisation par enfants de moins de 6 ans interdite
              </Text>{' '}
              ; pour 6-16 ans, présence active d&apos;un adulte dans le spa
              obligatoire ; (iv) respect du nombre max d&apos;utilisateurs
              simultanés affiché.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.pBold}>12.3 Précaution médicale —</Text> Il
              appartient à chaque utilisateur de vérifier, le cas échéant
              auprès de son médecin, l&apos;absence de contre-indication
              (grossesse, problème cardiovasculaire, traitement en cours).
            </Text>
            <Text style={styles.p}>
              <Text style={styles.pBold}>
                12.4 Décharge de responsabilité —
              </Text>{' '}
              Le Locataire et les occupants utilisent le spa{' '}
              <Text style={styles.pBold}>sous leur propre responsabilité</Text>
              , en pleine conscience des risques (brûlures, glissades,
              malaises, déshydratation, légionellose en cas de non-respect de
              l&apos;hygiène). Le Locataire s&apos;engage à respecter et
              faire respecter les règles d&apos;utilisation par l&apos;ensemble
              des occupants.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.pBold}>12.5 Maintenance et eau du spa —</Text>{' '}
              Le Bailleur procède à l&apos;entretien et au contrôle régulier
              de la qualité de l&apos;eau entre chaque location. En cas
              d&apos;anomalie pendant le séjour (couleur, odeur, mousse,
              dysfonctionnement), le Locataire en avise immédiatement le
              Bailleur et suspend l&apos;utilisation jusqu&apos;à intervention.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.pBold}>12.6 Sanctions —</Text> Tout
              manquement grave (produits prohibés, mise en danger de mineurs)
              autorise le Bailleur à interdire l&apos;accès aux équipements
              pour la durée restante du séjour, sans remboursement.
            </Text>
          </View>
        )}

        <View style={styles.art}>
          <ArtTitle num="Art. 13" title="Assurance villégiature" />
          <Text style={styles.p}>
            Le Locataire déclare être titulaire d&apos;une{' '}
            <Text style={styles.pBold}>
              assurance de responsabilité civile vie privée d&apos;occupant
              d&apos;immeuble pris en location temporaire
            </Text>{' '}
            (assurance villégiature), couvrant les risques locatifs
            (incendie, dégât des eaux, explosion) et sa responsabilité civile
            personnelle pendant la durée du séjour. Une attestation datée de
            l&apos;année en cours peut être exigée à l&apos;arrivée ; à
            défaut, le Bailleur se réserve la faculté de refuser
            l&apos;entrée dans les lieux, sans remboursement. Le Locataire
            est responsable de tous les dommages survenant de son fait, du
            fait des occupants déclarés, ou de toute personne admise dans le
            gîte avec son accord.
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle num="Art. 14" title="Données personnelles (RGPD)" />
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.1 Responsable du traitement —</Text>{' '}
            La SARL DE LA VOUTE est responsable du traitement des données
            personnelles du Locataire et des occupants majeurs déclarés.
            Contact : nicolas.terrafina@wanadoo.fr.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.2 Données collectées —</Text>{' '}
            Identité (civilité, nom, prénom) ; coordonnées (adresse postale,
            téléphone, courriel) ; données de réservation (dates, gîte,
            composition du foyer, identité des occupants majeurs) ; données
            financières (montants versés, dates et modalités — les données CB
            ne sont pas conservées par le Bailleur, elles transitent par le
            prestataire de paiement habilité) ; données de signature
            électronique (identifiant technique de la signature, horodatage,
            adresse IP du signataire, empreinte SHA-256 du document signé).
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.3 Finalités et bases légales —</Text>{' '}
            exécution du contrat (art. 6.1.b) ; obligation légale comptable
            (art. 6.1.c) ; intérêt légitime pour le registre de présence et la
            défense en justice (art. 6.1.f) ; consentement séparé pour
            communications commerciales (art. 6.1.a).
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.4 Destinataires —</Text>{' '}
            collaborateurs habilités du Bailleur ; sous-traitants strictement
            nécessaires : hébergeur du site et de la base de données (OVH SAS,
            données hébergées en France), Swikly (dépôt de garantie),
            prestataire de paiement, expert-comptable ; autorités sur
            réquisition légale. La signature électronique est recueillie
            directement par le Bailleur, sans prestataire tiers. Aucune
            donnée n&apos;est transférée hors UE sans encadrement juridique
            approprié.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.5 Durées de conservation —</Text>{' '}
            contrat, facture et pièces comptables : 10 ans · identité des
            occupants (registre) : 1 an après fin séjour · prospection
            commerciale : 3 ans depuis dernier contact · signature
            électronique : durée de prescription légale (10 ans).
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>14.6 Droits du Locataire —</Text> accès,
            rectification, effacement, limitation, opposition au traitement
            fondé sur l&apos;intérêt légitime, portabilité, retrait du
            consentement, réclamation auprès de la CNIL (3 Place de Fontenoy,
            75007 Paris — www.cnil.fr). Exercice par courriel à l&apos;adresse
            14.1 avec justificatif d&apos;identité.
          </Text>
        </View>

        <PageFooter data={data} />
      </Page>

      {/* ════════════════ PAGE 5 — ART. 15-16 + SIGNATURE ════════════════ */}
      <Page size="A4" style={styles.page}>
        <ArtHead data={data} logoUrl={logoUrl} />

        <View style={styles.art}>
          <ArtTitle
            num="Art. 15"
            title="Réclamations et médiation de la consommation"
          />
          <Text style={styles.p}>
            <Text style={styles.pBold}>15.1 Réclamation directe —</Text>{' '}
            Toute réclamation relative à l&apos;exécution du présent contrat
            doit être adressée au Bailleur par courriel à
            nicolas.terrafina@wanadoo.fr ou par courrier postal au siège
            social. Le Bailleur s&apos;engage à répondre dans un délai
            raisonnable n&apos;excédant pas{' '}
            <Text style={styles.pBold}>30 jours</Text>. S&apos;agissant
            spécifiquement de l&apos;état du gîte ou de l&apos;inventaire,
            l&apos;article 10.2 prévoit un délai impératif de 24 heures.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>
              15.2 Médiation de la consommation —
            </Text>{' '}
            Conformément aux articles L.611-1 et s. du Code de la
            consommation, le Locataire peut recourir gratuitement à un
            médiateur de la consommation. Le Bailleur adhère au dispositif
            suivant :
          </Text>
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              <Text style={styles.pAccent}>MEDICYS</Text> · 73 Boulevard de
              Clichy, 75009 PARIS · www.medicys.fr · Saisine en ligne
              possible.
            </Text>
          </View>
          <Text style={styles.p}>
            <Text style={styles.pBold}>15.3 Plateforme européenne RLL —</Text>{' '}
            Pour les locataires résidant dans un État membre de l&apos;UE,
            une plateforme de règlement en ligne des litiges est mise à
            disposition par la Commission européenne :
            https://ec.europa.eu/consumers/odr/
          </Text>
        </View>

        <View style={styles.art}>
          <ArtTitle
            num="Art. 16"
            title="Loi applicable et juridiction compétente"
          />
          <Text style={styles.p}>
            <Text style={styles.pBold}>16.1 Loi applicable —</Text> Le présent
            contrat est soumis au <Text style={styles.pBold}>droit français</Text>
            , à l&apos;exclusion de toute autre législation, et notamment aux
            dispositions du Code civil, du Code du tourisme et du Code de la
            consommation.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.pBold}>16.2 Juridiction compétente —</Text> À
            défaut de résolution amiable et après tentative de médiation, tout
            litige relatif au présent contrat relève de la compétence
            exclusive des{' '}
            <Text style={styles.pBold}>
              tribunaux du ressort du lieu de situation de l&apos;immeuble
              loué
            </Text>
            , soit le{' '}
            <Text style={styles.pBold}>
              Tribunal judiciaire de Privas (Ardèche)
            </Text>
            . Cette clause est sans préjudice de la faculté ouverte au
            Locataire consommateur, par les dispositions impératives du Code
            de la consommation, de saisir à son choix le tribunal de son
            domicile ou celui de la résidence du défendeur.
          </Text>
        </View>

        {/* Bloc signature finale */}
        <View style={styles.finalSig} wrap={false}>
          <Text style={styles.finalSigH3}>Signature électronique simple (SES)</Text>
          <Text style={[styles.p, { fontSize: 8 }]}>
            Signature électronique simple au sens de l&apos;
            <Text style={styles.pBold}>article 3, point 10</Text>, du
            règlement (UE) n° 910/2014 du Parlement européen et du Conseil du
            23 juillet 2014 (règlement eIDAS), recueillie directement par le
            Bailleur, sans prestataire de services de confiance tiers :
            validation par lien à usage unique, horodatage, enregistrement de
            l&apos;adresse IP du signataire et empreinte SHA-256 du document.
            Conformément à l&apos;<Text style={styles.pBold}>article 25</Text>{' '}
            du règlement eIDAS, elle ne peut être privée d&apos;effet juridique
            ni refusée comme preuve en justice au seul motif qu&apos;elle se
            présente sous forme électronique simple ; elle vaut signature au
            sens de l&apos;<Text style={styles.pBold}>article 1367</Text> du
            Code civil.
          </Text>

          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <View style={styles.metaRow}>
              <Text style={styles.metaK}>Identifiant unique</Text>
              <Text style={styles.metaV}>
                {data.signatureSesId || '— (à compléter après signature)'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaK}>Date / heure (heure de Paris)</Text>
              <Text style={styles.metaV}>
                {data.dateSignature || '— (à compléter après signature)'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaK}>IP du signataire</Text>
              <Text style={styles.metaV}>
                {data.adresseIpSignature ||
                  '— (à compléter après signature)'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaK}>Empreinte SHA-256</Text>
              <Text style={styles.metaV}>
                {data.documentHash || '— (à compléter après signature)'}
              </Text>
            </View>
          </View>

          <Text style={[styles.p, { fontSize: 8 }]}>
            <Text style={styles.pBold}>Acceptation expresse —</Text> En
            signant électroniquement le présent contrat, le Locataire
            reconnaît expressément : (1) avoir reçu et pris connaissance de
            l&apos;intégralité du contrat, de ses annexes et du règlement
            intérieur ; (2) avoir été informé de l&apos;
            <Text style={styles.pBold}>absence de droit de rétractation</Text>{' '}
            (article 8) ; (3) avoir été informé de la{' '}
            <Text style={styles.pBold}>nature juridique d&apos;acompte</Text>{' '}
            des sommes versées (article 5.2) ; (4) accepter sans réserve les
            conditions d&apos;utilisation des{' '}
            <Text style={styles.pBold}>équipements spécifiques</Text> (article
            12) ; (5) accepter les conditions de{' '}
            <Text style={styles.pBold}>traitement de ses données</Text>{' '}
            (article 14) ; (6) avoir conscience que la signature électronique
            a la même valeur juridique qu&apos;une signature manuscrite (art.
            1367 C. civ.).
          </Text>

          <Text style={[styles.p, { fontSize: 8, fontStyle: 'italic' }]}>
            Fait à distance, par signature électronique, le {data.dateEmission}.
          </Text>

          <View style={styles.signers}>
            <View style={styles.signerBlock}>
              <Text style={styles.signerWho}>Pour le Bailleur</Text>
              <Text style={styles.signerName}>
                M. Nicolas TERRAFINA{'\n'}
                <Text style={styles.signerSmall}>
                  Gérant de la SARL DE LA VOUTE
                </Text>
              </Text>
            </View>
            <View style={styles.signerBlock}>
              <Text style={styles.signerWho}>Pour le Locataire</Text>
              <Text style={styles.signerName}>
                {data.clientCivilite} {data.clientNom} {data.clientPrenom}
                {data.clientNomDeux ? (
                  <>
                    {'\n'}
                    <Text style={styles.signerSmall}>
                      co-signataire : {data.clientCiviliteDeux || 'M.'}{' '}
                      {data.clientNomDeux}
                      {data.clientPrenomDeux ? ` ${data.clientPrenomDeux}` : ''}
                    </Text>
                  </>
                ) : null}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.art} wrap={false}>
          <ArtTitle num="—" title="Annexes au présent contrat" />
          <View style={styles.tbl}>
            <View style={styles.tblHead}>
              <Text style={[styles.tblTh, { flex: 1.2 }]}>Annexe</Text>
              <Text style={[styles.tblTh, { flex: 5 }]}>Intitulé</Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 1.2 }]}>Annexe 1</Text>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Fiche descriptive du gîte (équipements, surface, plan, photos,
                charges)
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 1.2 }]}>Annexe 2</Text>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Règlement intérieur du gîte
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 1.2 }]}>Annexe 3</Text>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                État des lieux d&apos;entrée (template à compléter
                contradictoirement à l&apos;arrivée)
              </Text>
            </View>
            <View style={styles.tblRow}>
              <Text style={[styles.tblTd, { flex: 1.2 }]}>Annexe 4</Text>
              <Text style={[styles.tblTd, { flex: 5 }]}>
                Information précontractuelle RGPD complète
              </Text>
            </View>
          </View>
        </View>

        <PageFooter data={data} />
      </Page>
    </Document>
  );
}
