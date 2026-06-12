import type { Metadata } from "next";
import Link from "next/link";
import ImageSlot from "@/components/ui/ImageSlot";
import { GITES, type GiteData } from "@/lib/data/gites";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Nos gîtes — Les Gîtes de Samoyas",
};

interface RowContent {
  gite: GiteData;
  placeholder: string;
  caps: string[];
  lead: string;
  reverse?: boolean;
}

const ROWS: RowContent[] = [
  {
    gite: GITES.laphine,
    placeholder: "LaPhine — extérieur, fin de journée",
    caps: ["4 personnes", "2 chambres", "70 m²", "Spa encastré · garage"],
    lead: "L'écrin familial — un spa encastré sous la véranda chauffée, deux chambres calmes, et le garage qui vous épargne les averses.",
  },
  {
    gite: GITES.larmu,
    placeholder: "L'Armu — jacuzzi véranda, cheminée",
    caps: ["2 personnes", "1 chambre mansardée", "45 m²", "Jacuzzi · cheminée"],
    lead: "Un refuge pour deux — chambre mansardée à hauteur de toits, jacuzzi sous la véranda, cheminée d'ambiance pour les soirs frais.",
    reverse: true,
  },
  {
    gite: GITES.maisonvieille,
    placeholder: "La Maison Vieille — pierre ancienne, sauna",
    caps: ["4 personnes", "2 chambres", "85 m²", "Spa + sauna privatifs"],
    lead: "La plus ancienne du hameau — pierre apparente, volumes nobles, et la seule à conjuguer spa et sauna privatifs.",
  },
];

function GiteRow({ gite, placeholder, caps, lead, reverse }: RowContent) {
  const rating = gite.rating.toFixed(1).replace(".", ",");
  return (
    <section className={`${styles.giteRow}${reverse ? ` ${styles.reverse}` : ""}`}>
      <div className="wrap">
        <div className={styles.giteRowGrid}>
          <div className={styles.giteRowMedia}>
            <ImageSlot placeholder={placeholder} />
            <span className={styles.target}>{gite.short}</span>
          </div>
          <div className={styles.giteRowBody}>
            <div className={styles.giteRowHead}>
              <h2>{gite.name}</h2>
              <span className={styles.giteRowCode}>{gite.code}</span>
            </div>
            <div className={styles.giteRowCaps}>
              {caps.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <p className={styles.giteRowLead}>{lead}</p>
            <div className={styles.giteRowProof}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
              </svg>
              <strong>{rating}/5</strong>
              <span className={styles.sep} />
              <span>{gite.reviews} avis</span>
              <span className={styles.sep} />
              <span>{gite.reco} % reco</span>
            </div>
            <div className={styles.giteRowFoot}>
              <div className={styles.giteRowPrice}>
                <strong>Dès {gite.price} €</strong> <small>la semaine TTC</small>
              </div>
              <div className={styles.giteRowActions}>
                <Link className="btn btn-secondary" href={`/gites/${gite.id}`}>Voir le gîte</Link>
                <Link className="btn btn-primary" href={`/reserver?gite=${gite.id}`}>Réserver un séjour</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GitesPage() {
  return (
    <>
      <section className={styles.pageHero}>
        <div className="wrap">
          <div className={styles.pageHeroGrid}>
            <div>
              <span className="eyebrow">Nos trois écrins</span>
              <h1 style={{ marginTop: 16 }}>
                Trois gîtes,<br />un même hameau.
              </h1>
            </div>
            <p>
              Choisissez le gîte qui vous ressemble — l&apos;intime pour deux, l&apos;écrin familial,
              ou le plus ancien avec sauna. Et si vous êtes nombreux, regroupez-les jusqu&apos;à dix
              personnes. Un hameau à vous, sans pour autant être coupés du monde : commerces et
              services restent à cinq minutes.
            </p>
          </div>
        </div>
      </section>

      {ROWS.map((row) => (
        <GiteRow key={row.gite.id} {...row} />
      ))}

      {/* Combine block */}
      <section className={styles.combine}>
        <div className="wrap">
          <div className={styles.combineGrid}>
            <div>
              <span className="eyebrow">Tribu ou retrouvailles</span>
              <h2 style={{ marginTop: 14 }}>
                Regroupez les trois gîtes,<br />jusqu&apos;à dix personnes.
              </h2>
              <p>
                Les trois gîtes se touchent. Vous pouvez les louer ensemble pour un mariage, un
                anniversaire, ou simplement parce qu&apos;il fait bon se retrouver entre amis sans
                se gêner.
              </p>
              <p style={{ marginTop: 14 }}>
                <Link href="/contact" className="btn btn-secondary">
                  Nous écrire pour un séjour groupé
                </Link>
              </p>
            </div>
            <div className={styles.combineDiagram}>
              <div><strong>2</strong><small>L&apos;Armu</small></div>
              <div><strong>4</strong><small>LaPhine</small></div>
              <div><strong>4</strong><small>La Maison Vieille</small></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
