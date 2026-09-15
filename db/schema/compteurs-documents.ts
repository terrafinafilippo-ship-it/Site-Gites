// Table `compteurs_documents` : compteur de numérotation par série et par
// année (ex. FAC/2026, CTR/2026).
//
// Pas de SEQUENCE Postgres : une séquence ne se rembobine pas quand la
// transaction échoue et produirait des trous, illégaux au regard du CGI
// (article 289). Le compteur est incrémenté par un UPSERT atomique dans la
// fonction prochain_numero (migration 0001) : la ligne est verrouillée jusqu'à
// la fin de la transaction, deux émissions simultanées ne peuvent pas obtenir
// le même numéro, et une transaction annulée ne consomme rien.
import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const compteurs_documents = pgTable(
  "compteurs_documents",
  {
    serie: text().notNull(),
    annee: integer().notNull(),
    dernier_numero: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.serie, t.annee] })],
);
