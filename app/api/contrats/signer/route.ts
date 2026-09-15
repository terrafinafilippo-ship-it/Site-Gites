import { createElement } from 'react';
import { createHash } from 'crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, signatures } from '@/db/schema';
import { getStorage, isStorageError } from '@/lib/storage';
import { calculerMontants, mapContratData } from '@/lib/montants';
import { chargerReservationAvecGite } from '@/lib/reservations';
import { fmtDateFr } from '@/lib/format';
import { texteConsentement } from '@/lib/constantes';
import { isUniqueViolation, messageErreur, resolveLogoUrl } from '@/lib/route-helpers';
import { ContratPDF, type ContratData } from '@/components/pdf/ContratPDF';

// react-pdf utilise fontkit/zlib → runtime Node obligatoire (pas Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Durée de validité de l'URL signée du PDF signé renvoyée au signataire (1 h).
const SIGNED_URL_TTL = 60 * 60;

/** Échec d'une étape À L'INTÉRIEUR de la transaction : tout est annulé, preuve comprise. */
class EchecSignature extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EchecSignature';
  }
}

/**
 * POST /api/contrats/signer
 * Body : { token, signataire_nom, accepte: true }
 * Route publique : le jeton à usage unique (lien /signer/{token}) authentifie
 * le signataire, aucun secret n'est exigé.
 *
 * Recueille la signature électronique simple (SES) : valide le jeton, hache le
 * PDF NON signé tel que stocké, enregistre la preuve dans `signatures`, tamponne
 * et stocke un PDF SIGNÉ à un nouveau chemin, puis passe documents.statut='signe'.
 *
 * Preuve, PDF signé et statut sont écrits dans UNE transaction : si le rendu ou
 * l'écriture du fichier échoue, aucune preuve orpheline ne subsiste et le
 * signataire peut réessayer. La table `signatures` n'est JAMAIS mise à jour ni
 * vidée (trigger d'immutabilité) : une seule ligne, écrite une seule fois.
 */
export async function POST(request: Request) {
  // ── 1. Corps + validation ────────────────────────────────────────────────
  let body: { token?: unknown; signataire_nom?: unknown; accepte?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const signataireNom =
    typeof body.signataire_nom === 'string' ? body.signataire_nom.trim() : '';
  if (!token || !signataireNom || body.accepte !== true) {
    return NextResponse.json(
      { error: 'Champs requis : token, signataire_nom, accepte (true).' },
      { status: 400 },
    );
  }

  // ── 2. Capture serveur de l'IP et du user-agent (jamais via le client) ───
  // ip_signataire est de type inet : NULL quand l'adresse est inconnue,
  // jamais une chaîne de repli.
  const ip = extraireIp(request);
  const userAgent = request.headers.get('user-agent') || 'inconnu';

  const db = getDb();

  // ── 3. Validation du jeton (existe, non déjà signé, non expiré) ──────────
  const [doc] = await db
    .select({
      id: documents.id,
      reservation_id: documents.reservation_id,
      numero: documents.numero,
      url_pdf: documents.url_pdf,
      statut: documents.statut,
      token_expire_at: documents.token_expire_at,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(eq(documents.token, token))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: 'Lien de signature invalide.' }, { status: 404 });
  }
  if (doc.statut === 'signe') {
    return NextResponse.json({ error: 'Ce contrat a déjà été signé.' }, { status: 409 });
  }
  if (doc.token_expire_at && doc.token_expire_at.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Lien de signature expiré.' }, { status: 410 });
  }

  // ── 4. Réservation (source de vérité : email signataire, données PDF) ────
  const resa = await chargerReservationAvecGite(doc.reservation_id, db);
  if (!resa) {
    return NextResponse.json(
      { error: `Réservation introuvable : ${doc.reservation_id}` },
      { status: 404 },
    );
  }

  // ── 5. Hash SHA-256 du PDF NON signé, sur les octets EXACTS stockés ──────
  // (On NE régénère PAS le PDF pour le hasher : on hashe le fichier tel quel,
  //  sinon les octets diffèrent et la preuve d'intégrité saute.)
  const storage = getStorage();
  let octetsNonSignes: Buffer;
  try {
    octetsNonSignes = await storage.read(doc.url_pdf);
  } catch (e) {
    if (isStorageError(e, 'INTROUVABLE')) {
      return NextResponse.json(
        { error: `PDF non signé introuvable dans le stockage : ${doc.url_pdf}` },
        { status: 502 },
      );
    }
    throw e;
  }
  const documentHash = createHash('sha256').update(octetsNonSignes).digest('hex');

  const consentement = texteConsentement(doc.numero);
  const cheminSigne = `contrats/${doc.reservation_id}/${doc.numero}-signe.pdf`;
  const logoUrl = resolveLogoUrl(request);

  // ── 6 → 8. Transaction : preuve, PDF signé, statut ───────────────────────
  try {
    const sig = await db.transaction(async (tx) => {
      // 6. Preuve de signature (une seule ligne par document : index unique).
      const [inseree] = await tx
        .insert(signatures)
        .values({
          reservation_id: doc.reservation_id,
          document_id: doc.id,
          signataire_nom: signataireNom,
          signataire_email: resa.client_email ?? null,
          token,
          consentement_texte: consentement,
          document_hash: documentHash,
          document_storage_path: doc.url_pdf,
          ip_signataire: ip,
          user_agent: userAgent,
        })
        .returning({ id: signatures.id, signe_at: signatures.signe_at });

      // 7. Tamponner le bloc signature et écrire le PDF SIGNÉ (nouveau chemin).
      const montants = calculerMontants(resa);
      const dataSignee: ContratData = {
        ...mapContratData(resa, montants, {
          numeroContrat: doc.numero,
          dateEmission: fmtDateFr(doc.created_at.toISOString()),
        }),
        signatureSesId: inseree.id, // identifiant technique unique de la signature SES
        dateSignature: fmtDateHeure(inseree.signe_at),
        adresseIpSignature: ip ?? 'non disponible',
        documentHash,
      };

      let pdfSigne: Buffer;
      try {
        const element = createElement(ContratPDF, { data: dataSignee, logoUrl });
        pdfSigne = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
      } catch (e) {
        throw new EchecSignature(502, `Rendu du PDF signé échoué : ${messageErreur(e)}`);
      }

      // Aucune signature validée n'existe pour ce document (statut 'genere'
      // contrôlé, index unique respecté à l'insert ci-dessus) : un fichier
      // -signe.pdf déjà présent ne peut être que le reliquat d'une tentative
      // annulée. Il est remplacé pour correspondre à LA preuve enregistrée.
      try {
        await storage.upload(cheminSigne, pdfSigne, {
          contentType: 'application/pdf',
          overwrite: true,
        });
      } catch (e) {
        throw new EchecSignature(502, `Écriture du PDF signé échouée : ${messageErreur(e)}`);
      }

      // 8. Marquer le document comme signé.
      const maj = await tx
        .update(documents)
        .set({ statut: 'signe', date_signature: inseree.signe_at })
        .where(eq(documents.id, doc.id))
        .returning({ id: documents.id });
      if (maj.length !== 1) {
        throw new EchecSignature(500, 'Document introuvable au moment de la mise à jour du statut.');
      }

      return inseree;
    });

    return NextResponse.json({
      statut: 'signe',
      numero: doc.numero,
      signature_id: sig.id,
      document_signe_path: cheminSigne,
      document_signe_url: await storage.getSignedUrl(cheminSigne, SIGNED_URL_TTL),
    });
  } catch (e) {
    if (e instanceof EchecSignature) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // Une SES déjà posée (course / double clic) : l'index unique refuse la
    // seconde preuve, on ne réécrit rien et on renvoie un conflit clair.
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: 'Ce contrat a déjà été signé.' }, { status: 409 });
    }
    return NextResponse.json(
      { error: `Enregistrement de la signature échoué : ${messageErreur(e)}` },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Motif large d'adresse IPv4/IPv6 : évite qu'une valeur d'en-tête aberrante
// soit rejetée par le type inet au moment de l'INSERT.
const IP_REGEX = /^[0-9a-f.:]{3,45}$/i;

/** IP du signataire vue par le serveur (proxy en tête), ou null si inconnue. */
function extraireIp(request: Request): string | null {
  const candidat =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '';
  return IP_REGEX.test(candidat) ? candidat : null;
}

// Date + heure de Paris lisibles pour le tampon (ex. "4 juin 2026 à 14 h 32").
// Le serveur tourne en UTC : le fuseau est fixé explicitement.
function fmtDateHeure(d: Date): string {
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const heure = d
    .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' })
    .replace(':', ' h ');
  return `${date} à ${heure}`;
}
