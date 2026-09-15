// Contrôles EN BASE après le parcours complet : les montants, la numérotation,
// les instantanés de facture, les signatures et le registre des documents.
//
// La ligne en base est le document légal : c'est elle qui est contrôlée ici.
// Les PDF sont contrôlés à part (controler-pdf.py).
//
//   DB_CIBLE=test npx tsx scripts/parcours/controler.ts
//
// Code de sortie 1 si un contrôle échoue.
import "../../db/env";

import { Pool } from "pg";

import { centimesDepuisNumeric } from "../../lib/centimes";
import { fmtEuro } from "../../lib/format";
import { RESERVATIONS_REFERENCE, type MontantsAttendus } from "./reference";

let nbControles = 0;
let nbEchecs = 0;

function noter(ok: boolean, libelle: string, detail?: string): void {
  nbControles += 1;
  if (!ok) nbEchecs += 1;
  console.log(`  ${ok ? "[OK]" : "[KO]"} ${libelle}${detail ? ` (${detail})` : ""}`);
}

function titre(t: string): void {
  console.log(`\n${t}`);
}

interface LigneFacture {
  numero: string;
  type: "acompte" | "solde";
  montant_ttc: string;
  date_emission: string;
  pdf_url: string | null;
  donnees: Record<string, number | string | undefined>;
  reference: string;
}

async function main(): Promise<void> {
  const url = process.env.DB_CIBLE === "test" ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("Chaîne de connexion absente (DATABASE_URL_TEST avec DB_CIBLE=test).");
  const pool = new Pool({ connectionString: url });

  try {
    const factures = (
      await pool.query<LigneFacture>(
        `select f.numero, f.type, f.montant_ttc::text as montant_ttc,
                f.date_emission::text as date_emission, f.pdf_url, f.donnees, r.reference
           from factures f join reservations r on r.id = f.reservation_id
          order by f.numero`,
      )
    ).rows;

    for (const resa of RESERVATIONS_REFERENCE) {
      titre(`Réservation ${resa.reference} (${resa.giteNom})`);
      const a = resa.attendu;

      // ── Numéro de contrat recopié sur la réservation ─────────────────────
      const ligneResa = (
        await pool.query<{ numero_contrat: string | null; prix_location: string | null }>(
          "select numero_contrat, prix_location::text from reservations where reference = $1",
          [resa.reference],
        )
      ).rows[0];
      noter(
        /^CTR-\d{4}-\d{3,}$/.test(ligneResa?.numero_contrat ?? ""),
        "numero_contrat recopié sur la réservation",
        ligneResa?.numero_contrat ?? "absent",
      );
      noter(
        centimesDepuisNumeric(ligneResa?.prix_location ?? null) === a.prixLocation,
        `prix_location = ${fmtEuro(a.prixLocation)} (aucune modification résiduelle)`,
        ligneResa?.prix_location ?? "null",
      );

      // ── Les deux factures ────────────────────────────────────────────────
      const siennes = factures.filter((f) => f.reference === resa.reference);
      noter(siennes.length === 2, "une facture d'acompte et une facture de solde", `${siennes.length}`);

      for (const f of siennes) {
        const attenduTtc = f.type === "acompte" ? a.acompte : a.solde;
        const enCentimes = centimesDepuisNumeric(f.montant_ttc);
        noter(
          enCentimes === attenduTtc,
          `${f.numero} : montant_ttc = ${fmtEuro(attenduTtc)}`,
          `${f.montant_ttc} € = ${enCentimes} centimes`,
        );
        noter(f.pdf_url === `factures/${f.numero}.pdf`, `${f.numero} : pdf_url renseigné`, f.pdf_url ?? "null");

        const d = f.donnees;
        // L'instantané porte son propre numéro et sa date réelle (chantier 4).
        noter(d.numeroFacture === f.numero, `${f.numero} : donnees.numeroFacture = numero`, String(d.numeroFacture));
        noter(
          typeof d.dateEmission === "string" && d.dateEmission.length > 0,
          `${f.numero} : donnees.dateEmission renseignée`,
          String(d.dateEmission),
        );
        // Auto-description de l'unité (chantier 1f).
        noter(d.unite === "centimes", `${f.numero} : donnees.unite = "centimes"`, String(d.unite));
        noter(d.formatVersion === 2, `${f.numero} : donnees.formatVersion = 2`, String(d.formatVersion));

        // Les montants de l'instantané, poste par poste.
        const postes: Array<[keyof MontantsAttendus, string]> = [
          ["prixLocation", "prixLocation"],
          ["forfaitMenage", "forfaitMenage"],
          ["options", "montantOptions"],
          ["sousTotal", "sousTotal"],
          ["taxeSejour", "montantTaxeSejour"],
          ["totalTtc", "totalTtc"],
        ];
        for (const [cle, champ] of postes) {
          noter(d[champ] === a[cle], `${f.numero} : ${champ} = ${fmtEuro(a[cle])}`, String(d[champ]));
        }
        // Les lignes doivent s'additionner jusqu'au sous-total (chantier 2).
        const somme = Number(d.prixLocation) + Number(d.forfaitMenage) + Number(d.montantOptions);
        noter(somme === a.sousTotal, `${f.numero} : location + ménage + options = sous-total`, `${somme}`);
        noter(
          a.sousTotal + a.taxeSejour === a.totalTtc,
          `${f.numero} : sous-total + taxe de séjour = total TTC`,
        );
        // Garde structurelle : acompte + solde = total, exact en centimes.
        noter(
          Number(d.montantAcompte) + Number(d.montantSolde) === a.totalTtc,
          `${f.numero} : acompte + solde = total TTC`,
          `${d.montantAcompte} + ${d.montantSolde}`,
        );
      }

      // Égalité vérifiée sur les colonnes montant_ttc elles-mêmes, pas seulement
      // sur l'instantané : c'est ce couple de lignes qui fait foi.
      const acompte = siennes.find((f) => f.type === "acompte");
      const solde = siennes.find((f) => f.type === "solde");
      if (acompte && solde) {
        const total = centimesDepuisNumeric(acompte.montant_ttc)! + centimesDepuisNumeric(solde.montant_ttc)!;
        noter(total === a.totalTtc, `montant_ttc acompte + solde = ${fmtEuro(a.totalTtc)}`, `${total} centimes`);
      }

      // ── Documents et signature ───────────────────────────────────────────
      const docs = (
        await pool.query<{ numero: string; type: string; statut: string }>(
          `select d.numero, d.type, d.statut from documents d
             join reservations r on r.id = d.reservation_id
            where r.reference = $1 order by d.created_at`,
          [resa.reference],
        )
      ).rows;
      noter(docs.length === 3, "3 documents (contrat, facture d'acompte, facture de solde)", `${docs.length}`);
      noter(
        docs.some((d) => d.type === "contrat_location" && d.statut === "signe"),
        "contrat au statut « signe »",
      );

      const sig = (
        await pool.query<{ n: string; hash: number; consentement: boolean; ip: string | null }>(
          `select count(*)::text n, max(length(s.document_hash))::int hash,
                  bool_and(s.consentement_texte like 'Je reconnais avoir lu%') consentement,
                  max(s.ip_signataire::text) ip
             from signatures s join reservations r on r.id = s.reservation_id
            where r.reference = $1`,
          [resa.reference],
        )
      ).rows[0];
      noter(sig.n === "1", "une preuve de signature", `${sig.n}`);
      noter(sig.hash === 64, "empreinte SHA-256 du PDF (64 caractères)", String(sig.hash));
      noter(sig.consentement === true, "texte de consentement enregistré mot pour mot");
    }

    // ── Numérotation ───────────────────────────────────────────────────────
    titre("Numérotation");
    const compteurs = (
      await pool.query<{ serie: string; dernier_numero: number }>(
        "select serie, dernier_numero from compteurs_documents order by serie",
      )
    ).rows;
    const ctr = compteurs.find((c) => c.serie === "CTR")?.dernier_numero ?? 0;
    const fac = compteurs.find((c) => c.serie === "FAC")?.dernier_numero ?? 0;
    const attenduCtr = RESERVATIONS_REFERENCE.length;
    const attenduFac = RESERVATIONS_REFERENCE.length * 2;
    noter(ctr === attenduCtr, `compteur CTR = ${attenduCtr} (idempotence : aucun numéro en trop)`, `${ctr}`);
    noter(fac === attenduFac, `compteur FAC = ${attenduFac} (un refus 409 ne consomme aucun numéro)`, `${fac}`);

    // Numérotation continue, sans trou : l'année est celle du premier numéro
    // frappé (heure de Paris), elle n'est pas recalculée ici.
    const numeros = (await pool.query<{ numero: string }>("select numero from factures order by numero")).rows
      .map((n) => n.numero);
    const annee = numeros[0]?.split("-")[1] ?? "";
    const attendus = Array.from({ length: attenduFac }, (_, i) => `FAC-${annee}-${String(i + 1).padStart(3, "0")}`);
    noter(numeros.join(",") === attendus.join(","), "numérotation continue, sans trou", numeros.join(" "));
  } finally {
    await pool.end();
  }

  console.log(`\n${nbControles} contrôle(s), ${nbEchecs} échec(s).`);
  process.exitCode = nbEchecs === 0 ? 0 : 1;
}

main().catch((e: unknown) => {
  console.error("Échec des contrôles :", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
