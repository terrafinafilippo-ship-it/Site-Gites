// Crée le compte du back-office (Phase 5, lot 1, D-32) et envoie le lien pour
// choisir le mot de passe. Si le compte existe déjà, renvoie seulement un lien
// (le mot de passe actuel reste valable tant que le lien n'est pas utilisé).
//
// Le mot de passe ne passe jamais par cette commande : la personne le choisit
// elle-même en ouvrant le lien reçu.
//
//   npm run gestion:compte -- contact@gitesdesamoyas.fr
//
// Le lien pointe vers NEXT_PUBLIC_SITE_URL (obligatoire). Sur la base réelle,
// c'est une ÉCRITURE : elle est faite par le gérant, pas par une session de
// développement (avec DB_CIBLE=test, elle va sur la base de test).
import "../db/env";

import { closeDb } from "../db";
import { creerCompte } from "../lib/gestion/connexion";
import { FORME_EMAIL } from "../lib/suivi";

async function main(): Promise<void> {
  const adresse = process.argv[2]?.trim();
  if (!adresse || !FORME_EMAIL.test(adresse)) {
    console.error("Usage : npm run gestion:compte -- adresse@domaine.fr");
    process.exitCode = 2;
    return;
  }
  const origine = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!origine) {
    console.error("NEXT_PUBLIC_SITE_URL manquante : le lien du courriel n'aurait pas d'adresse.");
    process.exitCode = 2;
    return;
  }
  console.log(`Base : ${process.env.DB_CIBLE === "test" ? "de TEST" : "RÉELLE"}. Site des liens : ${origine}`);
  const r = await creerCompte(adresse, origine);
  console.log(r.cree ? `Compte créé pour ${adresse}.` : `Le compte ${adresse} existait déjà : nouveau lien seulement.`);
  if (r.parti) console.log("Lien envoyé : il faut l'ouvrir pour choisir le mot de passe.");
  else {
    console.error("Le courriel n'est pas parti (voir l'erreur ci-dessus) : relancez la commande.");
    process.exitCode = 1;
  }
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
