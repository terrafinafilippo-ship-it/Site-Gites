# Facture / Quittance — Templates

> **Modèle retenu** : Modèle B — **une facture par encaissement** (1 facture d'acompte + 1 facture de solde par séjour).
> **Numérotation** : `FAC-{{annee}}-{{seq}}`, série annuelle à partir de `FAC-2026-001` (rupture avec l'ancien système GdF).
> **Régime TVA** : exonération de plein droit (art. 261 D 4° CGI) — aucune ligne TVA.

---

## Mentions légales obligatoires — base commune aux deux factures

Toute facture émise par la SARL DE LA VOUTE doit comporter les mentions ci-dessous, conformément à :
- Article L.441-9 du Code de commerce
- Articles R.123-237 et R.123-238 du Code de commerce (identification de la société)
- Article 242 nonies A de l'annexe II du CGI (mentions fiscales)
- Article 289 du CGI (obligation d'émission)

### En-tête émetteur (constant)

```
SARL DE LA VOUTE
Société à responsabilité limitée au capital de 500 euros
Siège social : 176 Route de Samoyas, 07100 Boulieu-lès-Annonay
RCS Annonay 831 170 782 — SIRET 831 170 782 00013
Gérant : Nicolas TERRAFINA
Téléphone : 06 79 33 23 51 — Courriel : nicolas.terrafina@wanadoo.fr

Enseigne commerciale : Les Gîtes de Samoyas
```

### Bloc destinataire

```
{{client_civilite}} {{client_nom}} {{client_prenom}}
{{client_adresse}}
{{client_code_postal}} {{client_ville}}
{{client_pays}}
```

### Bloc identification de la facture

```
Facture n° {{numero_facture}}
Date d'émission : {{date_emission_facture}}
Référence contrat : {{numero_contrat}}
```

### Mention TVA (obligatoire — emplacement visible)

> **Exonération de TVA — article 261 D 4° du Code général des impôts.**
> *Aucune TVA n'est applicable aux prestations facturées.*

### Mention médiation (obligatoire en B2C — art. L.616-1 C. conso)

> Conformément à l'article L.612-1 du Code de la consommation, le client peut recourir gratuitement au service de médiation **MEDICYS** (73 Boulevard de Clichy, 75009 Paris — www.medicys.fr).

### Pied de page (constant)

```
SARL DE LA VOUTE — Capital 500 € — RCS Annonay 831 170 782 — SIRET 831 170 782 00013
Exonération de TVA — article 261 D 4° du CGI
```

---

## Template 1 — Facture d'ACOMPTE (30 %)

> Émise immédiatement après le versement effectif de l'acompte par le client.

### Structure complète

```
═══════════════════════════════════════════════════════════════════════════════
  [Logo Les Gîtes de Samoyas]
  
                              FACTURE D'ACOMPTE
                           N° FAC-{{annee}}-{{seq}}
═══════════════════════════════════════════════════════════════════════════════

ÉMETTEUR                              DESTINATAIRE
────────────────────────────          ────────────────────────────
SARL DE LA VOUTE                      {{client_civilite}} {{client_nom}} {{client_prenom}}
SARL au capital de 500 €              {{client_adresse}}
176 Route de Samoyas                  {{client_code_postal}} {{client_ville}}
07100 Boulieu-lès-Annonay             {{client_pays}}
RCS Annonay 831 170 782               
SIRET 831 170 782 00013               Courriel : {{client_email}}
Gérant : Nicolas TERRAFINA            

───────────────────────────────────────────────────────────────────────────────

Facture n° :                FAC-{{annee}}-{{seq}}
Date d'émission :           {{date_emission_facture}}
Référence contrat :         {{numero_contrat}}
Date d'exécution prévue :   {{date_arrivee}} au {{date_depart}}

───────────────────────────────────────────────────────────────────────────────

OBJET : Acompte sur location saisonnière en meublé de tourisme

Désignation du séjour :
  • Gîte : {{gite_nom}} (réf. {{gite_ref_gdf}})
  • Adresse : {{gite_adresse_complete}}
  • Période : du {{date_arrivee}} au {{date_depart}} ({{nb_nuits}} nuit(s))
  • Occupants : {{nb_adultes}} adulte(s), {{nb_enfants}} enfant(s), {{nb_bebes}} bébé(s)

───────────────────────────────────────────────────────────────────────────────

DÉTAIL DU SÉJOUR (pour information)

  Prix de la location ({{nb_nuits}} nuits)            {{prix_location}} €
  Forfait ménage obligatoire                          {{forfait_menage}} €
  Sous-total prestations                              {{sous_total}} €
  Taxe de séjour ({{taux_taxe_sejour}} %)             {{montant_taxe_sejour}} €
  ─────────────────────────────────────────────────────────────────────────
  TOTAL DU SÉJOUR                                     {{total_ttc}} €

───────────────────────────────────────────────────────────────────────────────

MONTANT FACTURÉ AU TITRE DU PRÉSENT ACOMPTE

  Acompte de {{taux_acompte}} % du total du séjour    {{montant_acompte}} €
  
  ═════════════════════════════════════════════════════════════════════════
  MONTANT À PAYER (ou DÉJÀ PAYÉ — voir ci-dessous)    {{montant_acompte}} €
  ═════════════════════════════════════════════════════════════════════════

  Le solde de {{montant_solde}} € fera l'objet d'une facture distincte,
  émise lors de son versement à J-{{delai_solde}} avant l'arrivée
  (soit au plus tard le {{date_butoir_solde}}).

───────────────────────────────────────────────────────────────────────────────

PAIEMENT

  Mode de règlement :       {{mode_paiement}}
  Date du paiement :        {{date_paiement}}
  Référence transaction :   {{reference_transaction}}

                          ╔═══════════════════════╗
                          ║   FACTURE ACQUITTÉE   ║
                          ╚═══════════════════════╝

───────────────────────────────────────────────────────────────────────────────

MENTIONS LÉGALES

  • Exonération de TVA — article 261 D 4° du Code général des impôts.
  
  • Pas d'escompte pour règlement anticipé.
  
  • Médiation de la consommation : conformément à l'article L.612-1 du Code
    de la consommation, le client peut recourir gratuitement au service de
    médiation MEDICYS, 73 Boulevard de Clichy, 75009 Paris (www.medicys.fr).

  • La présente facture constitue la pièce justificative du versement de
    l'acompte au sens de l'article 1590 du Code civil, et engage fermement
    les deux parties conformément à l'article 5.2 du contrat de location
    n° {{numero_contrat}}.

  • Conservation conseillée : 10 ans.

───────────────────────────────────────────────────────────────────────────────

SARL DE LA VOUTE — Capital 500 € — RCS Annonay 831 170 782 — SIRET 831 170 782 00013
Exonération de TVA — article 261 D 4° du CGI

═══════════════════════════════════════════════════════════════════════════════
```

---

## Template 2 — Facture de SOLDE (70 %)

> Émise immédiatement après le versement effectif du solde par le client (à J-{{delai_solde}} avant arrivée).

### Structure complète

```
═══════════════════════════════════════════════════════════════════════════════
  [Logo Les Gîtes de Samoyas]
  
                               FACTURE DE SOLDE
                           N° FAC-{{annee}}-{{seq}}
═══════════════════════════════════════════════════════════════════════════════

ÉMETTEUR                              DESTINATAIRE
────────────────────────────          ────────────────────────────
SARL DE LA VOUTE                      {{client_civilite}} {{client_nom}} {{client_prenom}}
SARL au capital de 500 €              {{client_adresse}}
176 Route de Samoyas                  {{client_code_postal}} {{client_ville}}
07100 Boulieu-lès-Annonay             {{client_pays}}
RCS Annonay 831 170 782               
SIRET 831 170 782 00013               Courriel : {{client_email}}
Gérant : Nicolas TERRAFINA            

───────────────────────────────────────────────────────────────────────────────

Facture n° :                FAC-{{annee}}-{{seq}}
Date d'émission :           {{date_emission_facture}}
Référence contrat :         {{numero_contrat}}
Date d'exécution prévue :   {{date_arrivee}} au {{date_depart}}

───────────────────────────────────────────────────────────────────────────────

OBJET : Solde sur location saisonnière en meublé de tourisme

Désignation du séjour :
  • Gîte : {{gite_nom}} (réf. {{gite_ref_gdf}})
  • Adresse : {{gite_adresse_complete}}
  • Période : du {{date_arrivee}} au {{date_depart}} ({{nb_nuits}} nuit(s))
  • Occupants : {{nb_adultes}} adulte(s), {{nb_enfants}} enfant(s), {{nb_bebes}} bébé(s)

───────────────────────────────────────────────────────────────────────────────

RÉCAPITULATIF FINANCIER COMPLET

  Prix de la location ({{nb_nuits}} nuits)            {{prix_location}} €
  Forfait ménage obligatoire                          {{forfait_menage}} €
  Sous-total prestations                              {{sous_total}} €
  Taxe de séjour ({{taux_taxe_sejour}} %)             {{montant_taxe_sejour}} €
  ─────────────────────────────────────────────────────────────────────────
  TOTAL DU SÉJOUR                                     {{total_ttc}} €

  Acompte versé le {{date_paiement_acompte}}
  (facture n° {{numero_facture_acompte}})            - {{montant_acompte}} €
  ─────────────────────────────────────────────────────────────────────────
  SOLDE RESTANT DÛ                                    {{montant_solde}} €

───────────────────────────────────────────────────────────────────────────────

MONTANT FACTURÉ AU TITRE DU PRÉSENT SOLDE

  Solde de {{taux_solde}} % du total du séjour        {{montant_solde}} €
  
  ═════════════════════════════════════════════════════════════════════════
  MONTANT À PAYER (ou DÉJÀ PAYÉ — voir ci-dessous)    {{montant_solde}} €
  ═════════════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────────────────

PAIEMENT

  Mode de règlement :       {{mode_paiement}}
  Date du paiement :        {{date_paiement}}
  Référence transaction :   {{reference_transaction}}

                          ╔═══════════════════════╗
                          ║   FACTURE ACQUITTÉE   ║
                          ╚═══════════════════════╝

  Le séjour est intégralement réglé. Bienvenue aux Gîtes de Samoyas.

───────────────────────────────────────────────────────────────────────────────

MENTIONS LÉGALES

  • Exonération de TVA — article 261 D 4° du Code général des impôts.
  
  • Pas d'escompte pour règlement anticipé.
  
  • Médiation de la consommation : conformément à l'article L.612-1 du Code
    de la consommation, le client peut recourir gratuitement au service de
    médiation MEDICYS, 73 Boulevard de Clichy, 75009 Paris (www.medicys.fr).

  • Conservation conseillée : 10 ans.

───────────────────────────────────────────────────────────────────────────────

SARL DE LA VOUTE — Capital 500 € — RCS Annonay 831 170 782 — SIRET 831 170 782 00013
Exonération de TVA — article 261 D 4° du CGI

═══════════════════════════════════════════════════════════════════════════════
```

---

## Cas particuliers de facturation

### Facture de remboursement (annulation tolérance commerciale > J-30)

Lorsque le Bailleur procède au remboursement de l'acompte au titre de la tolérance commerciale (article 7.2 du contrat), il convient d'émettre une **facture d'avoir** (note de crédit), numérotée dans la même série :

```
N° AVO-{{annee}}-{{seq}}
```

Mentions :
- Référence à la facture d'acompte initiale annulée
- Motif explicite : « Remboursement à titre de tolérance commerciale unilatérale du Bailleur — annulation du locataire avant J-30 conformément à l'article 7.2 du contrat n° {{numero_contrat}} »
- Montant négatif équivalent à l'acompte initialement perçu

Cette mention écrite explicite est **importante juridiquement** : elle confirme la nature de faveur commerciale et exclut toute requalification ultérieure du régime acompte en régime arrhes.

### Facture pour débit sur caution Swikly

Lorsque le Bailleur procède au débit de tout ou partie de la caution Swikly (article 6.4), il émet une facture distincte :

```
N° FAC-{{annee}}-{{seq}}
Objet : Prélèvement sur dépôt de garantie — Contrat n° {{numero_contrat}}
```

Avec :
- Détail précis des dégradations / frais imputés
- Justificatifs annexés (devis, factures de remise en état)
- Montant prélevé

---

## Variables back-office utilisées

### Variables communes (en plus des variables contrat déjà documentées)

| Variable | Description | Source |
|---|---|---|
| `numero_facture` | Format `FAC-{{annee}}-{{seq}}` | Séquence annuelle de factures |
| `date_emission_facture` | Date d'émission de la facture | `now()` au moment de la génération |
| `mode_paiement` | Type de règlement (Carte bancaire / Virement / ...) | Données PSP |
| `date_paiement` | Date effective de l'encaissement | Données PSP |
| `reference_transaction` | ID transaction PSP (Stripe / autre) | Données PSP |

### Variables spécifiques facture de solde

| Variable | Description |
|---|---|
| `date_paiement_acompte` | Date d'encaissement de l'acompte (pour le rappel) |
| `numero_facture_acompte` | Référence de la facture d'acompte (pour le rappel) |

### Variables pour facture d'avoir (annulation)

| Variable | Description |
|---|---|
| `numero_avoir` | Format `AVO-{{annee}}-{{seq}}` (série séparée) |
| `numero_facture_annulee` | Référence facture initiale annulée |
| `montant_avoir` | Montant remboursé (positif sur l'avoir, mais signifie un crédit) |
| `date_avoir` | Date d'émission |

---

## Règles de numérotation à implémenter

1. **Séquence annuelle ininterrompue par série** — chaque série (FAC, AVO, CTR) a sa propre séquence indépendante par année civile.
2. **Pas de rupture, pas de trou** — toute facture émise est conservée même en cas d'erreur (émettre un avoir pour annuler, jamais supprimer un numéro).
3. **Reset au 1er janvier** — `FAC-2027-001` succède à `FAC-2026-NNN`.
4. **Verrou de séquence en base** — la génération d'un numéro doit être atomique (verrou transactionnel) pour éviter les doublons en cas de concurrence.

---

## Conformité — checklist de mentions obligatoires

| Mention | Présent ? |
|---|---|
| Dénomination sociale, forme, capital | ✅ |
| Adresse du siège social | ✅ |
| SIRET / SIREN | ✅ |
| RCS + ville d'immatriculation | ✅ |
| Date d'émission | ✅ |
| Numéro unique et séquentiel | ✅ |
| Identité du destinataire (nom + adresse) | ✅ |
| Désignation précise des prestations | ✅ |
| Date d'exécution de la prestation | ✅ |
| Prix unitaire (par nuit) | ✅ (via prix_location / nb_nuits implicite) |
| Montant total à payer | ✅ |
| Mention exonération TVA + référence article | ✅ (261 D 4° CGI) |
| Conditions d'escompte (ou absence) | ✅ (« Pas d'escompte ») |
| Médiation conso (B2C) | ✅ (MEDICYS) |
| Mode de paiement | ✅ |

Pénalités de retard et indemnité forfaitaire de 40 € : **non applicables** en B2C (réservés aux factures B2B selon L.441-10 C. com.).
