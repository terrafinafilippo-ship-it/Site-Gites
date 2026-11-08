import Link from "next/link";
import { notFound } from "next/navigation";

import { jourBlocage, jourLevee, lireReglagesCaution } from "@/lib/caution";
import { centimesDepuisNumeric } from "@/lib/centimes";
import { aujourdhuiParis } from "@/lib/dates-civiles";
import { fmtDateAvecJour, fmtDateLongue, fmtEuro, fmtHeure } from "@/lib/format";
import { LIBELLES_FACTURE } from "@/lib/gestion/documents";
import { lireFiche, montantDe } from "@/lib/gestion/reservations";
import { isUuid } from "@/lib/route-helpers";
import { dateLimiteSolde } from "@/lib/solde";
import { getStorage } from "@/lib/storage";
import { dateLimiteVirement } from "@/lib/virement";
import { getDb } from "@/db";

import {
  actionCautionRecue,
  actionCautionRendue,
  actionCoordonnees,
  actionLienCaution,
  actionLiberer,
  actionRenvoyerContrat,
  actionRetenir,
  actionSoldeVirement,
} from "../../actions-reservations";
import { actionRenvoyerDocument } from "../../actions-calendrier";
import Entete from "../../Entete";
import styles from "../../gestion.module.css";
import { exigerSession } from "../../outils";
import { FormulaireRetenue, FormulaireSoldeVirement, GesteBouton, GesteFormulaire } from "../Gestes";

export const dynamic = "force-dynamic";

const STATUTS_RESA: Record<string, string> = { confirmee: "Confirmée", terminee: "Terminée", annulee: "Annulée" };
const TYPES_PAIEMENT: Record<string, string> = { acompte: "Acompte", total: "Séjour payé en une fois", solde: "Solde", caution: "Caution (carte)" };
const STATUTS_PAIEMENT: Record<string, string> = {
  en_attente: "en attente",
  reussi: "reçu",
  echoue: "refusé",
  annule: "annulé",
  a_rembourser: "à rembourser",
  rembourse: "remboursé",
  bloque: "bloquée",
  libere: "libérée",
  retenu: "retenue",
};
const STATUTS_COURRIEL: Record<string, string> = { a_envoyer: "à envoyer", envoye: "envoyé", echec: "non parti" };
const ACTIONS_JOURNAL: Record<string, string> = {
  caution_liberee: "Caution libérée",
  caution_retenue: "Retenue sur la caution",
  caution_recue: "Caution notée reçue",
  caution_rendue: "Caution notée rendue",
  lien_caution_envoye: "Lien de caution envoyé",
  solde_recu_virement: "Solde noté reçu par virement",
  coordonnees_modifiees: "Coordonnées modifiées",
  lien_signature_renvoye: "Lien de signature renvoyé",
  contrat_renvoye: "Contrat signé renvoyé",
  facture_renvoyee: "Facture renvoyée",
  effacement_tentative: "Tentative effacée",
};

function quand(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Centimes → « 403,66 », tel qu'on le tape. */
function saisi(centimes: number): string {
  return fmtEuro(centimes).replace(/\s?€$/, "").replace(/ | /g, "");
}

export default async function FicheReservation({ params }: { params: Promise<{ id: string }> }) {
  await exigerSession();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const fiche = await lireFiche(id);
  if (!fiche) notFound();
  const { resa, montants, solde, ligneCaution, retenue } = fiche;
  const aujourdhui = aujourdhuiParis();
  const heures = await lireReglagesCaution(getDb());
  const client = [resa.client_prenom, (resa.client_nom ?? "").toUpperCase()].filter(Boolean).join(" ") || "Client";
  const confirmee = resa.statut === "confirmee";
  const departPasse = aujourdhui >= resa.date_depart;
  const contrat = fiche.documents.find((d) => d.type === "contrat_location") ?? null;
  const caution = resa.caution ?? 0;
  const liens = retenue
    ? await Promise.all(retenue.pieces.map(async (p) => ({ ...p, url: await getStorage().getSignedUrl(p.chemin, 3600) })))
    : [];

  return (
    <>
      <Entete courante="/gestion/reservations" />
      <main className={styles.page}>
        <p className={styles.liens}>
          <Link href="/gestion/reservations">← Réservations</Link>
        </p>
        <h1>
          {client} — {resa.gites?.nom}
        </h1>
        <p className={styles.aide}>
          {resa.reference} · <span className={styles.etiquette}>{STATUTS_RESA[resa.statut] ?? resa.statut}</span> · réservée le{" "}
          {quand(resa.created_at)}
        </p>

        <section className={styles.carte}>
          <h2>Séjour</h2>
          <dl className={styles.lectureSeule}>
            <dt>Arrivée</dt>
            <dd>
              {fmtDateAvecJour(resa.date_arrivee)} à partir de {fmtHeure((resa.heure_arrivee ?? "").slice(0, 5))}
            </dd>
            <dt>Départ</dt>
            <dd>
              {fmtDateAvecJour(resa.date_depart)} avant {fmtHeure((resa.heure_depart ?? "").slice(0, 5))}
            </dd>
            <dt>Voyageurs</dt>
            <dd>
              {resa.nb_adultes} adulte{resa.nb_adultes > 1 ? "s" : ""}
              {resa.nb_enfants ? `, ${resa.nb_enfants} enfant${resa.nb_enfants > 1 ? "s" : ""}` : ""}
              {resa.nb_bebes ? `, ${resa.nb_bebes} bébé${resa.nb_bebes > 1 ? "s" : ""}` : ""}
            </dd>
            <dt>Langue du client</dt>
            <dd>{resa.langue === "en" ? "anglais" : "français"}</dd>
          </dl>
        </section>

        <section className={styles.carte}>
          <h2>Client</h2>
          <p className={styles.aide}>
            {[resa.client_adresse, [resa.client_code_postal, resa.client_ville].filter(Boolean).join(" "), resa.client_pays].filter(Boolean).join(", ")}
            {resa.client_nom_conjoint ? ` · avec ${[resa.client_prenom_conjoint, resa.client_nom_conjoint].filter(Boolean).join(" ")}` : ""}
          </p>
          <p className={styles.aide}>
            Le nom et l&apos;adresse sont écrits sur le contrat et les factures : ils ne se modifient pas ici.
          </p>
          <GesteFormulaire action={actionCoordonnees.bind(null, resa.id)} libelle="Enregistrer">
            <div className={styles.grille}>
              <div className={styles.champ}>
                <label htmlFor="email">Courriel</label>
                <input id="email" name="email" type="email" defaultValue={resa.client_email ?? ""} required className={styles.large} />
              </div>
              <div className={styles.champ}>
                <label htmlFor="telephone">Téléphone</label>
                <input id="telephone" name="telephone" type="tel" defaultValue={resa.client_telephone ?? ""} className={styles.large} />
              </div>
            </div>
            <div className={styles.champ}>
              <label htmlFor="note">Note interne (jamais montrée au client)</label>
              <textarea id="note" name="note" rows={3} maxLength={4000} defaultValue={resa.note_interne ?? ""} className={styles.large} />
            </div>
          </GesteFormulaire>
        </section>

        {montants && (
          <section className={styles.carte}>
            <h2>Montants</h2>
            <dl className={styles.lectureSeule}>
              <dt>Location</dt>
              <dd>{fmtEuro(resa.prix_location ?? 0)}</dd>
              <dt>Ménage</dt>
              <dd>{fmtEuro(montants.forfaitMenage)}</dd>
              <dt>Taxe de séjour</dt>
              <dd>{fmtEuro(montants.taxeSejour)}</dd>
              <dt>Total</dt>
              <dd>{fmtEuro(montants.totalTtc)}</dd>
              {resa.paiement_integral ? (
                <>
                  <dt>Payé en une fois</dt>
                  <dd>{fmtEuro(montants.totalTtc)}</dd>
                </>
              ) : (
                <>
                  <dt>Acompte</dt>
                  <dd>{fmtEuro(montants.acompte)}</dd>
                  <dt>Solde</dt>
                  <dd>{fmtEuro(montants.solde)}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        {solde && (
          <section className={styles.carte}>
            <h2>Solde</h2>
            <p>
              {solde.etat === "paye" && `Payé${solde.date ? ` le ${quand(solde.date)}` : ""}.`}
              {solde.etat === "prelevement_prevu" && `Prélèvement prévu le ${fmtDateLongue(solde.dateLimite)} sur la carte enregistrée.`}
              {solde.etat === "en_cours" && "Un paiement est en cours à la banque."}
              {solde.etat === "a_payer" &&
                `${fmtEuro(solde.montant)} à payer au plus tard le ${fmtDateLongue(dateLimiteSolde(resa))}${aujourdhui > solde.dateLimite ? " : en retard" : ""}${solde.refuse ? " (prélèvement refusé)" : ""}. Le client a le lien pour payer en ligne.`}
            </p>
            {confirmee && (solde.etat === "a_payer" || solde.etat === "prelevement_prevu") && (
              <FormulaireSoldeVirement
                action={actionSoldeVirement.bind(null, resa.id)}
                soldeTexte={fmtEuro(solde.montant)}
                soldeSaisi={saisi(solde.montant)}
                aujourdhui={aujourdhui}
              />
            )}
          </section>
        )}

        {caution > 0 && resa.moyen_caution && (
          <section className={styles.carte}>
            <h2>Caution — {fmtEuro(caution)}</h2>
            {resa.moyen_caution === "carte" ? (
              <>
                <p>
                  {!ligneCaution && confirmee && `Par carte : sera bloquée le ${fmtDateLongue(jourBlocage(resa.date_depart))} à ${fmtHeure(heures.blocage)}, la veille du départ.`}
                  {ligneCaution?.statut === "bloque" &&
                    `Bloquée sur la carte. Libérée automatiquement le ${fmtDateLongue(jourLevee(resa.date_depart))} à ${fmtHeure(heures.liberation)} si rien n'est retenu.`}
                  {ligneCaution?.statut === "libere" && `Libérée${ligneCaution.date_liberation ? ` le ${quand(ligneCaution.date_liberation)}` : ""} : rien n'a été débité.`}
                  {ligneCaution?.statut === "retenu" && `Retenue : ${fmtEuro(centimesDepuisNumeric(ligneCaution.montant_retenu ?? "0"))} encaissés.`}
                  {(ligneCaution?.statut === "echoue" || (ligneCaution?.statut === "en_attente" && ligneCaution.reference_externe)) &&
                    "Refusée par la banque : le client a reçu le lien pour la valider."}
                </p>
                {ligneCaution?.statut === "bloque" &&
                  (departPasse ? (
                    <div className={styles.grille}>
                      <div>
                        <h3>Tout est en ordre</h3>
                        <GesteBouton
                          action={actionLiberer.bind(null, resa.id)}
                          libelle="Libérer maintenant"
                          confirmation={`Vous allez libérer la caution de ${fmtEuro(montantDe(ligneCaution))} sur la carte de ${client}. C'est définitif : plus aucun débit ne sera possible.`}
                        />
                      </div>
                      <div>
                        <h3>Quelque chose est abîmé</h3>
                        <FormulaireRetenue
                          action={actionRetenir.bind(null, resa.id)}
                          caution={montantDe(ligneCaution)}
                          cautionTexte={fmtEuro(montantDe(ligneCaution))}
                          client={client}
                          moyen="carte"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className={styles.aide}>Libérer ou retenir se fait à partir du jour du départ.</p>
                  ))}
              </>
            ) : (
              <>
                <p>
                  Par {resa.moyen_caution === "virement" ? `virement (au plus tard le ${fmtDateLongue(dateLimiteVirement(resa))})` : "chèque, remis à l'arrivée"}.{" "}
                  {resa.caution_recue_at ? `Reçue le ${fmtDateLongue(aujourdhuiParis(resa.caution_recue_at))}.` : "Pas encore notée reçue."}{" "}
                  {resa.caution_rendue_at && !retenue ? `Rendue le ${fmtDateLongue(aujourdhuiParis(resa.caution_rendue_at))}.` : ""}
                </p>
                {confirmee && !resa.caution_recue_at && (
                  <div className={styles.grille}>
                    <GesteFormulaire action={actionCautionRecue.bind(null, resa.id)} libelle="Caution reçue">
                      <div className={styles.champ}>
                        <label htmlFor="date-caution">Reçue le</label>
                        <input id="date-caution" name="date" type="date" defaultValue={aujourdhui} max={aujourdhui} required />
                      </div>
                    </GesteFormulaire>
                    {!resa.stripe_payment_method_id && aujourdhui <= resa.date_depart && (
                      <div>
                        <p className={styles.aide}>
                          Client arrivé sans caution : il reçoit le lien pour enregistrer une carte (article 6.6 du contrat).
                          {resa.carte_caution_demandee_at ? ` Déjà envoyé le ${quand(resa.carte_caution_demandee_at)}.` : ""}
                        </p>
                        {!resa.carte_caution_demandee_at && (
                          <GesteBouton action={actionLienCaution.bind(null, resa.id)} libelle="Envoyer le lien de caution" discret />
                        )}
                      </div>
                    )}
                  </div>
                )}
                {resa.caution_recue_at && !resa.caution_rendue_at &&
                  (departPasse ? (
                    <div className={styles.grille}>
                      <div>
                        <h3>Tout est en ordre</h3>
                        <GesteBouton
                          action={actionCautionRendue.bind(null, resa.id)}
                          libelle="Caution rendue entière"
                          confirmation={`Vous notez la caution de ${fmtEuro(caution)} rendue entière à ${client}. Le client reçoit un courriel.`}
                        />
                      </div>
                      <div>
                        <h3>Quelque chose est abîmé</h3>
                        <FormulaireRetenue
                          action={actionRetenir.bind(null, resa.id)}
                          caution={caution}
                          cautionTexte={fmtEuro(caution)}
                          client={client}
                          moyen={resa.moyen_caution}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className={styles.aide}>Rendre ou retenir se fait à partir du jour du départ.</p>
                  ))}
              </>
            )}
            {retenue?.faite_at && (
              <div className={styles.confirmation}>
                <p>
                  <strong>
                    Retenue de {fmtEuro(centimesDepuisNumeric(retenue.montant))} le {quand(retenue.faite_at)}
                  </strong>{" "}
                  ({retenue.acteur}).
                </p>
                <p>Motif : {retenue.motif}</p>
                {liens.length > 0 && (
                  <ul>
                    {liens.map((p) => (
                      <li key={p.chemin}>
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.nom}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <section className={styles.carte}>
          <h2>Contrat et factures</h2>
          <ul>
            <li>
              Contrat :{" "}
              {contrat ? `${contrat.numero}, ${contrat.statut === "signe" ? `signé${contrat.date_signature ? ` le ${quand(contrat.date_signature)}` : ""}` : "pas encore signé"}` : "pas encore créé"}
              {contrat && (
                <>
                  {" — "}
                  <a href={`/gestion/documents/pdf?sorte=contrat&id=${contrat.id}`} target="_blank" rel="noopener">
                    Ouvrir le PDF
                  </a>
                </>
              )}
              {contrat?.statut === "signe" && (
                <GesteBouton
                  action={actionRenvoyerDocument.bind(null, "contrat", contrat.id)}
                  libelle="Renvoyer le contrat signé"
                  confirmation={`Renvoyer le contrat signé ${contrat.numero} à ${resa.client_email ?? "(aucune adresse)"} ?`}
                  discret
                />
              )}
            </li>
            {fiche.factures.map((f) => (
              <li key={f.id}>
                {LIBELLES_FACTURE[f.type] ?? "Facture"} {f.numero} : {fmtEuro(centimesDepuisNumeric(f.montant_ttc))}, émise le{" "}
                {fmtDateLongue(String(f.date_emission).slice(0, 10))}
                {f.pdf_url && (
                  <>
                    {" — "}
                    <a href={`/gestion/documents/pdf?sorte=facture&id=${f.id}`} target="_blank" rel="noopener">
                      Ouvrir le PDF
                    </a>
                  </>
                )}
                <GesteBouton
                  action={actionRenvoyerDocument.bind(null, "facture", f.id)}
                  libelle="Renvoyer la facture"
                  confirmation={`Renvoyer la facture ${f.numero} à ${resa.client_email ?? "(aucune adresse)"} ?`}
                  discret
                />
              </li>
            ))}
          </ul>
          {confirmee && contrat && contrat.statut !== "signe" && (
            <GesteBouton action={actionRenvoyerContrat.bind(null, resa.id)} libelle="Renvoyer le lien de signature" discret />
          )}
        </section>

        <section className={`${styles.carte} ${styles.defile}`}>
          <h2>Paiements</h2>
          <table className={styles.tableau}>
            <tbody>
              {fiche.paiements.map((p) => (
                <tr key={p.id}>
                  <td>{TYPES_PAIEMENT[p.type] ?? p.type}</td>
                  <td>{fmtEuro(montantDe(p))}</td>
                  <td>
                    {STATUTS_PAIEMENT[p.statut] ?? p.statut}
                    {p.prestataire === "virement" ? " (virement)" : ""}
                  </td>
                  <td>{p.date_paiement ? quand(p.date_paiement) : quand(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={`${styles.carte} ${styles.defile}`}>
          <h2>Courriels</h2>
          <table className={styles.tableau}>
            <tbody>
              {fiche.courriels.map((c, i) => (
                <tr key={i}>
                  <td>{quand(c.quand)}</td>
                  <td>{c.sujet ?? c.objet}</td>
                  <td>{c.destinataire}</td>
                  <td>{STATUTS_COURRIEL[c.statut] ?? c.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {fiche.journal.length > 0 && (
          <section className={styles.carte}>
            <h2>Journal</h2>
            <ul>
              {fiche.journal.map((j) => (
                <li key={j.id}>
                  {quand(j.created_at)} — {ACTIONS_JOURNAL[j.action] ?? j.action} — {j.acteur}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
