// L'ENVOI d'un courriel (Phase 3, lot 4) : par Brevo, ou dans un fichier.
//
// Brevo (API HTTP « transactional emails ») quand BREVO_API_KEY est présente ;
// sinon chaque courriel est ÉCRIT dans un fichier (COURRIELS_DOSSIER, par
// défaut .data/courriels), lisible dans un navigateur : rien ne part.
//
// Garde absolue : une adresse RÉSERVÉE AUX ESSAIS (example.com/.net/.org,
// .example, .invalid, .test, .localhost — RFC 2606 et 6761) n'est JAMAIS
// envoyée, même avec la clé : les clients fictifs des contrôles et du
// parcours ne partent pas chez Brevo.
//
// La clé est un secret serveur : jamais de préfixe NEXT_PUBLIC_, jamais dans
// un fichier suivi par git (.env.example ne porte que son nom).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Message {
  expediteur: { email: string; nom: string };
  repondreA: string;
  destinataire: string;
  sujet: string;
  html: string;
  texte: string;
  /** Étiquette visible dans le tableau de bord Brevo (l'objet du courriel). */
  etiquette: string;
}

export interface Envoi {
  voie: "brevo" | "fichier";
  /** Identifiant chez Brevo, ou chemin du fichier écrit. */
  reference: string;
}

export interface Messagerie {
  envoyer(m: Message): Promise<Envoi>;
}

const DOMAINES_DE_TEST = /(^|\.)(example\.(com|net|org)|example|invalid|test|localhost)$/i;

/** Adresse réservée aux essais : jamais envoyée. */
export function adresseDeTest(email: string): boolean {
  const domaine = email.split("@").pop()?.trim() ?? "";
  return DOMAINES_DE_TEST.test(domaine);
}

/** Écrit le courriel dans un fichier HTML (en-têtes en commentaire). */
export class MessagerieFichier implements Messagerie {
  constructor(private readonly dossier = process.env.COURRIELS_DOSSIER || path.join(".data", "courriels")) {}

  async envoyer(m: Message): Promise<Envoi> {
    await mkdir(this.dossier, { recursive: true });
    const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
    const nom = `${horodatage}-${m.etiquette}-${m.destinataire.replace(/[^a-z0-9@._-]/gi, "_")}.html`;
    const chemin = path.join(this.dossier, nom);
    const entete = [
      `De : ${m.expediteur.nom} <${m.expediteur.email}>`,
      `Répondre à : ${m.repondreA}`,
      `À : ${m.destinataire}`,
      `Objet : ${m.sujet}`,
    ].join("\n");
    await writeFile(chemin, `<!--\n${entete.replace(/--/g, "- -")}\n-->\n${m.html}`, "utf8");
    return { voie: "fichier", reference: chemin };
  }
}

/** Envoi par l'API de Brevo (POST /v3/smtp/email). */
export class MessagerieBrevo implements Messagerie {
  constructor(private readonly cle: string) {}

  async envoyer(m: Message): Promise<Envoi> {
    const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.cle, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: m.expediteur.email, name: m.expediteur.nom },
        replyTo: { email: m.repondreA },
        to: [{ email: m.destinataire }],
        subject: m.sujet,
        htmlContent: m.html,
        textContent: m.texte,
        tags: [m.etiquette],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corps = await reponse.text();
    if (!reponse.ok) {
      // Le message d'erreur de Brevo ne contient pas la clé : il peut être journalisé.
      throw new Error(`Brevo a refusé l'envoi (HTTP ${reponse.status}) : ${corps.slice(0, 300)}`);
    }
    let messageId = "";
    try {
      messageId = String((JSON.parse(corps) as { messageId?: unknown }).messageId ?? "");
    } catch {
      // Réponse acceptée mais illisible : l'envoi a eu lieu, sans référence.
    }
    return { voie: "brevo", reference: messageId };
  }
}

/** Choisit la voie : fichier pour une adresse de test ou sans clé, Brevo sinon. */
export class MessagerieDuSite implements Messagerie {
  private readonly fichier = new MessagerieFichier();

  async envoyer(m: Message): Promise<Envoi> {
    const cle = process.env.BREVO_API_KEY?.trim();
    if (!cle || adresseDeTest(m.destinataire)) return this.fichier.envoyer(m);
    return new MessagerieBrevo(cle).envoyer(m);
  }
}

let courante: Messagerie | null = null;

export function messagerie(): Messagerie {
  if (!courante) courante = new MessagerieDuSite();
  return courante;
}

/** POUR LES CONTRÔLES SEULEMENT (scripts/verifier-courriels.ts) : messagerie simulée. */
export function remplacerMessagerie(m: Messagerie): void {
  courante = m;
}
