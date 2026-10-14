// Tarification FICTIVE de la base de TEST : barème, tarifs, périodes de fin 2026
// à fin 2027, taxe de séjour. Appelée par reinitialiser.ts.
//
// RIEN ICI N'EST UN PRIX RÉEL. Les tarifs, les prix et les dates des périodes
// sont des valeurs d'essai, marquées « (essai) » dans leur nom pour qu'une page
// qui les afficherait par erreur se dénonce d'elle-même. Les vrais tarifs sont
// saisis par les propriétaires au back-office (Phase 5).
//
// Seuls les réglages de TAXE DE SÉJOUR reprennent les valeurs officielles de
// Savas (délibération d'Annonay Rhône Agglo CC_2025_119) : c'est ce qui permet
// de contrôler le calcul sur des montants vrais.
//
// REFUSE de s'exécuter hors de la base de test : elle efface toute la
// tarification avant d'écrire la sienne.
import type { Pool } from "pg";

import { numericDepuisCentimes } from "../../lib/centimes";

type Slug = "laphine" | "armu" | "maison-vieille";

interface TarifFictif {
  nom: string;
  /** Prix d'une nuit par gîte, en CENTIMES. */
  prix: Record<Slug, number>;
  nuitsMinimum?: number;
  joursArrivee?: number[];
  joursDepart?: number[];
}

/** Le barème donné en exemple au cadrage (11 octobre 2026). */
const BAREME_ESSAI = ["1.0000", "1.0000", "0.9000", "0.8500", "0.8000", "0.7500", "0.7000"];

const TARIFS: TarifFictif[] = [
  { nom: "Basse saison (essai)", prix: { laphine: 11200, armu: 7500, "maison-vieille": 11500 } },
  { nom: "Moyenne saison (essai)", prix: { laphine: 13000, armu: 9300, "maison-vieille": 13700 } },
  { nom: "Haute saison (essai)", prix: { laphine: 15300, armu: 11500, "maison-vieille": 16000 } },
  { nom: "Vacances scolaires (essai)", prix: { laphine: 17500, armu: 13700, "maison-vieille": 18200 } },
  {
    nom: "Été (essai)",
    prix: { laphine: 17500, armu: 13700, "maison-vieille": 18200 },
    // Samedi → samedi, une semaine au moins : la règle testée en exemple au cadrage.
    nuitsMinimum: 7,
    joursArrivee: [6],
    joursDepart: [6],
  },
];

/** Périodes contiguës, chacune du samedi (inclus) au samedi (exclu). */
const PERIODES: Array<[tarif: string, debut: string, fin: string]> = [
  ["Moyenne saison (essai)", "2026-10-03", "2026-10-17"],
  ["Vacances scolaires (essai)", "2026-10-17", "2026-10-31"],
  ["Basse saison (essai)", "2026-10-31", "2026-12-19"],
  ["Vacances scolaires (essai)", "2026-12-19", "2027-01-02"],
  ["Basse saison (essai)", "2027-01-02", "2027-02-06"],
  ["Vacances scolaires (essai)", "2027-02-06", "2027-03-06"],
  ["Moyenne saison (essai)", "2027-03-06", "2027-04-03"],
  ["Vacances scolaires (essai)", "2027-04-03", "2027-05-01"],
  ["Moyenne saison (essai)", "2027-05-01", "2027-05-29"],
  ["Haute saison (essai)", "2027-05-29", "2027-07-03"],
  ["Été (essai)", "2027-07-03", "2027-08-28"],
  ["Haute saison (essai)", "2027-08-28", "2027-10-02"],
  ["Moyenne saison (essai)", "2027-10-02", "2027-10-23"],
  ["Vacances scolaires (essai)", "2027-10-23", "2027-11-06"],
  ["Basse saison (essai)", "2027-11-06", "2027-12-18"],
  ["Vacances scolaires (essai)", "2027-12-18", "2028-01-01"],
];

export async function chargerTarifsFictifs(pool: Pool): Promise<void> {
  if (process.env.DB_CIBLE !== "test") {
    throw new Error("DB_CIBLE doit valoir \"test\" : ce script efface toute la tarification.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Vider dans l'ordre des dépendances. DELETE plutôt que TRUNCATE : la table
    // reglages référence baremes, et TRUNCATE refuserait tant qu'elle existe.
    await client.query("update reglages set bareme_general_id = null where id = 1");
    await client.query("delete from periodes");
    await client.query("delete from tarifs_prix");
    await client.query("delete from tarifs");
    await client.query("delete from baremes");
    await client.query("delete from taxes_sejour");

    const gites = (await client.query<{ id: string; slug: Slug }>("select id, slug from gites")).rows;
    const idGite = (slug: Slug): string => {
      const g = gites.find((x) => x.slug === slug);
      if (!g) throw new Error(`Gîte ${slug} absent : lancez d'abord npm run db:seed.`);
      return g.id;
    };

    const bareme = await client.query<{ id: string }>(
      "insert into baremes (nom) values ('Barème général (essai)') returning id",
    );
    const baremeId = bareme.rows[0].id;
    for (const [i, coefficient] of BAREME_ESSAI.entries()) {
      await client.query(
        "insert into baremes_coefficients (bareme_id, rang, coefficient) values ($1, $2, $3)",
        [baremeId, i + 1, coefficient],
      );
    }

    // Règle générale « complètement libre », jour de début des périodes : samedi.
    await client.query(
      `update reglages
          set nuits_minimum = 1, jours_arrivee = '{1,2,3,4,5,6,7}', jours_depart = '{1,2,3,4,5,6,7}',
              bareme_general_id = $1, periodes_jour_debut = 6, updated_at = now()
        where id = 1`,
      [baremeId],
    );

    const idTarif = new Map<string, string>();
    for (const t of TARIFS) {
      const { rows } = await client.query<{ id: string }>(
        `insert into tarifs (nom, nuits_minimum, jours_arrivee, jours_depart)
         values ($1, $2, $3, $4) returning id`,
        [t.nom, t.nuitsMinimum ?? null, t.joursArrivee ?? null, t.joursDepart ?? null],
      );
      idTarif.set(t.nom, rows[0].id);
      for (const [slug, centimes] of Object.entries(t.prix) as Array<[Slug, number]>) {
        await client.query(
          "insert into tarifs_prix (tarif_id, gite_id, prix_nuit) values ($1, $2, $3)",
          [rows[0].id, idGite(slug), numericDepuisCentimes(centimes)],
        );
      }
    }

    for (const [nom, debut, fin] of PERIODES) {
      await client.query(
        "insert into periodes (tarif_id, date_debut, date_fin) values ($1, $2, $3)",
        [idTarif.get(nom), debut, fin],
      );
    }

    // Taxe de séjour : valeurs OFFICIELLES de Savas depuis le 1er janvier 2026.
    for (const slug of ["laphine", "armu", "maison-vieille"] as const) {
      await client.query(
        `insert into taxes_sejour (gite_id, date_debut, mode, taux, plafond, taxe_additionnelle,
                                   menage_dans_assiette, source)
         values ($1, '2026-01-01', 'proportionnel', 5.00, 4.40, 10.00, false,
                 'Annonay Rhône Agglo, délibération CC_2025_119 (26 juin 2025)')`,
        [idGite(slug)],
      );
    }

    await client.query("COMMIT");
    console.log(
      `Tarification d'essai chargée : ${TARIFS.length} tarifs, ${PERIODES.length} périodes ` +
        `(${PERIODES[0][1]} → ${PERIODES[PERIODES.length - 1][2]}), barème de ${BAREME_ESSAI.length} rangs, ` +
        "taxe de séjour de Savas pour les 3 gîtes.",
    );
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
