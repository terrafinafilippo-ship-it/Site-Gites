# Contrat de location saisonnière en meublé de tourisme — Template

> **Statut de rédaction** : complet — 16 articles + bloc signature + plan des annexes.

> **Convention de notation** : les variables `{{nom_variable}}` sont remplies dynamiquement depuis le back-office au moment de l'émission du contrat. Les valeurs en clair correspondent à des constantes (mentions légales, références d'articles, etc.).

---

## En-tête

```
CONTRAT DE LOCATION SAISONNIÈRE
EN MEUBLÉ DE TOURISME

N° {{numero_contrat}}
Établi le {{date_emission}}
```

---

## Identification des parties

### Le Bailleur

```
LA SARL DE LA VOUTE
Société à responsabilité limitée au capital de 500 euros
Siège social : 176 Route de Samoyas, 07100 Boulieu-lès-Annonay
Immatriculée au RCS d'Annonay sous le numéro 831 170 782
SIRET : 831 170 782 00013
Représentée par Monsieur Nicolas TERRAFINA, en sa qualité de gérant
Téléphone : 06 79 33 23 51
Courriel : nicolas.terrafina@wanadoo.fr

Exploitant l'enseigne commerciale « Les Gîtes de Samoyas »

Ci-après dénommée « le Bailleur ».
```

### Le Locataire

```
{{client_civilite}} {{client_nom}} {{client_prenom}}
Demeurant : {{client_adresse}}, {{client_code_postal}} {{client_ville}}, {{client_pays}}
Téléphone : {{client_telephone}}
Courriel : {{client_email}}

Ci-après dénommé(e) « le Locataire ».
```

---

## Préambule

Le Bailleur exploite, sous l'enseigne commerciale « Les Gîtes de Samoyas », trois gîtes labellisés Gîtes de France situés à Savas (Ardèche), dans le cadre d'une activité de location saisonnière en meublé de tourisme exercée à titre civil.

Le Locataire ayant souhaité louer l'un de ces gîtes aux conditions ci-après définies, les parties sont convenues de ce qui suit.

---

## Article 1 — Objet et désignation du bien loué

Le Bailleur donne en location saisonnière au Locataire, qui accepte, à usage exclusif d'habitation temporaire et de loisirs, le gîte ci-après désigné :

| Élément | Valeur |
|---|---|
| Désignation commerciale | {{gite_nom}} |
| Référence Gîtes de France | {{gite_ref_gdf}} |
| Classement | {{gite_classement}} épis Gîtes de France |
| Adresse exacte | {{gite_adresse_complete}} (commune de Savas, Ardèche) |
| Capacité d'accueil maximale | {{gite_capacite_max}} personnes |
| Équipements spécifiques | {{gite_equipements_specifiques}} |

La désignation détaillée du bien, son descriptif et son inventaire complet font l'objet de l'**Annexe 1 — Fiche descriptive**, qui constitue avec le présent contrat un ensemble contractuel indivisible.

Le présent contrat est conclu **exclusivement à usage d'habitation saisonnière** au sens de l'article L.324-1-1 du Code du tourisme. Toute autre utilisation — notamment à des fins professionnelles, commerciales, événementielles, ou de réception de tiers non déclarés à l'article 3 — est strictement interdite et entraîne la résiliation immédiate du contrat aux torts du Locataire.

---

## Article 2 — Durée du séjour

Le présent contrat est conclu pour une durée déterminée :

- **Du** {{date_arrivee}}, à partir de {{heure_arrivee}}
- **Au** {{date_depart}}, avant {{heure_depart}}
- **Soit** {{nb_nuits}} nuit(s).

Conformément à l'article 1737 du Code civil, le présent contrat prend fin de plein droit à l'expiration du terme fixé, sans qu'il soit nécessaire de donner congé. Le Locataire ne pourra en aucune circonstance se prévaloir d'un quelconque droit au maintien dans les lieux à l'issue du séjour.

La durée du séjour ne peut excéder **quatre-vingt-dix (90) jours consécutifs**, conformément à la réglementation applicable aux meublés de tourisme.

---

## Article 3 — Composition du foyer occupant

Le séjour est réservé pour les seules personnes ci-après désignées :

| Catégorie | Nombre |
|---|---|
| Adultes (18 ans et plus) | {{nb_adultes}} |
| Enfants (3 à 17 ans) | {{nb_enfants}} |
| Bébés (moins de 3 ans) | {{nb_bebes}} |

**Identité des occupants majeurs** :

{{liste_occupants_majeurs}}

Le nombre total d'occupants ne peut en aucun cas excéder la capacité maximale du gîte définie à l'article 1, soit **{{gite_capacite_max}} personnes**.

Tout dépassement non préalablement autorisé par écrit par le Bailleur constitue un manquement contractuel grave entraînant la résiliation immédiate du contrat aux torts du Locataire, sans remboursement des sommes versées, et sans préjudice de toute action en réparation.

La collecte de l'identité des occupants majeurs est effectuée pour des motifs de sécurité, de respect de la capacité d'accueil et de tenue du registre de présence, sur le fondement de l'intérêt légitime du Bailleur (article 6.1.f du RGPD). Les conditions de traitement de ces données sont détaillées à l'**article 14**.

---

## Article 4 — Prix et composition tarifaire

### 4.1 — Décomposition du prix

Le prix total du séjour est fixé comme suit :

| Poste | Montant |
|---|---|
| Prix de la location ({{nb_nuits}} nuits) | {{prix_location}} € |
| Forfait ménage obligatoire | {{forfait_menage}} € |
| **Sous-total prestations du Bailleur** | **{{sous_total}} €** |
| Taxe de séjour ({{taux_taxe_sejour}} %) | {{montant_taxe_sejour}} € |
| **TOTAL DU SÉJOUR** | **{{total_ttc}} €** |

### 4.2 — Charges comprises

Le prix de la location s'entend toutes charges comprises : eau, électricité, chauffage, draps et linge de toilette fournis à l'arrivée, accès Internet le cas échéant. Les charges éventuelles non incluses, ainsi que les options à la carte, sont précisées à l'**Annexe 1**.

### 4.3 — Régime fiscal

> **Exonération de TVA — article 261 D 4° du Code général des impôts.**

### 4.4 — Taxe de séjour

La taxe de séjour est collectée par le Bailleur pour le compte de la commune de Savas, conformément aux articles L.2333-26 et suivants du Code général des collectivités territoriales. Son montant n'entre pas dans l'assiette des prestations du Bailleur et est intégralement reversé à la commune.

### 4.5 — Forfait ménage

Le forfait ménage est **obligatoire** et ne peut être ni supprimé ni minoré, y compris si le Locataire souhaite assurer lui-même le nettoyage du gîte avant son départ.

---

## Article 5 — Modalités de paiement et nature juridique de l'acompte

### 5.1 — Échéancier

Le règlement du prix total défini à l'article 4 est échelonné comme suit :

| Échéance | Montant | Date limite | Modalité |
|---|---|---|---|
| **(a) Acompte** — {{taux_acompte}} % du total | {{montant_acompte}} € | À la signature du contrat | Paiement en ligne par carte bancaire |
| **(b) Solde** — {{taux_solde}} % du total | {{montant_solde}} € | Au plus tard {{delai_solde}} jours avant l'arrivée, soit le {{date_butoir_solde}} | Paiement en ligne par carte bancaire |

### 5.2 — Nature juridique de l'acompte

**Les parties conviennent expressément que les sommes versées au titre de l'acompte visé au 5.1 (a) constituent un ACOMPTE au sens de l'article 1590 du Code civil, à l'exclusion expresse de toute qualification d'arrhes.**

En conséquence, et conformément à la jurisprudence constante de la Cour de cassation, la réservation engage fermement et irrévocablement les deux parties dès le versement de l'acompte. Aucune des parties ne peut se dédire unilatéralement par le simple renoncement à la somme versée ou à son double.

Les conditions d'annulation, qui obéissent aux principes ci-dessus, sont définies de manière exhaustive à l'**article 7** du présent contrat.

### 5.3 — Conséquences du non-versement du solde

À défaut de versement du solde à la date limite fixée au 5.1 (b), et après mise en demeure adressée au Locataire par courriel restée sans effet pendant un délai de **quarante-huit (48) heures**, le Bailleur est en droit de considérer le contrat comme résilié de plein droit aux torts exclusifs du Locataire.

Dans cette hypothèse :

- l'acompte versé reste **acquis au Bailleur** à titre d'indemnité forfaitaire et irréductible ;
- le Bailleur recouvre la libre disposition du gîte aux dates initialement réservées ;
- le tout sans préjudice de toute action complémentaire en réparation du préjudice subi.

---

## Article 6 — Dépôt de garantie (caution)

### 6.1 — Montant et finalité

Le Locataire constitue auprès du Bailleur un dépôt de garantie d'un montant de **{{caution_montant}} euros**, destiné à couvrir les éventuels dommages causés au gîte, à son mobilier, à ses équipements ou à ses dépendances pendant la durée du séjour.

### 6.2 — Modalité de constitution

La constitution de ce dépôt s'opère par **empreinte bancaire pré-autorisée** auprès du prestataire spécialisé **Swikly**. Les conditions générales d'utilisation de Swikly sont portées à la connaissance du Locataire lors de la mise en place de l'empreinte et acceptées par lui dans ce cadre.

### 6.3 — Nature de l'empreinte bancaire

> **L'empreinte bancaire constituée via Swikly NE CONSTITUE PAS UN ENCAISSEMENT.** Aucune somme n'est prélevée sur le compte du Locataire au moment de sa mise en place.

Le Bailleur dispose uniquement de la faculté de procéder au prélèvement, en tout ou partie, dans les conditions limitativement définies au 6.4 ci-après.

### 6.4 — Conditions et modalités de débit

Le Bailleur ne peut procéder au débit de tout ou partie du dépôt de garantie que dans les cas suivants, dûment constatés à l'état des lieux de sortie ou dans les heures suivant le départ du Locataire :

1. **Dégradations matérielles** du gîte, du mobilier ou des équipements ;
2. **Manquements aux obligations d'entretien** définies à l'article 11 ;
3. **Vol ou disparition** d'éléments d'inventaire ;
4. **Frais de remise en état exceptionnels** (nettoyage non standard, traitement post-tabac, dépollution suite à présence d'animal non déclaré, etc.) ;
5. **Dépassement non autorisé** de la capacité d'accueil constaté pendant le séjour.

Le montant prélevé correspond strictement au coût réel de la remise en état, justifié par devis ou facture remis au Locataire dans un délai maximal de **trente (30) jours** suivant son départ.

### 6.5 — Mainlevée

À défaut de constat de dommage à l'état des lieux de sortie, ou à l'issue de l'évaluation du préjudice le cas échéant, le Bailleur procède à la mainlevée de l'empreinte bancaire dans un délai maximal de **sept (7) jours** suivant le départ du Locataire.

---

## Variables back-office utilisées (articles 1 à 6)

| Variable | Description | Source |
|---|---|---|
| `numero_contrat` | Format `CTR-{{annee}}-{{seq}}` | Séquence annuelle DB |
| `date_emission` | Date d'établissement du contrat | `now()` au moment de la génération |
| `client_*` (12 champs) | Identité et coordonnées du locataire | Formulaire de réservation |
| `gite_nom`, `gite_ref_gdf`, `gite_classement`, `gite_adresse_complete`, `gite_capacite_max`, `gite_equipements_specifiques` | Désignation du gîte loué | Table `gite` |
| `date_arrivee`, `heure_arrivee`, `date_depart`, `heure_depart`, `nb_nuits` | Période du séjour | Réservation |
| `nb_adultes`, `nb_enfants`, `nb_bebes`, `liste_occupants_majeurs` | Composition du foyer | Formulaire |
| `prix_location`, `forfait_menage`, `taux_taxe_sejour`, `montant_taxe_sejour`, `sous_total`, `total_ttc` | Calculs tarifaires | Computés depuis tarifs |
| `taux_acompte`, `montant_acompte`, `taux_solde`, `montant_solde`, `delai_solde`, `date_butoir_solde`, `date_versement_acompte` | Échéancier paiement | Paramètres + computés |
| `caution_montant` | Montant caution Swikly | Table `gite` |

---

## Article 7 — Annulation et inexécution

### 7.1 — Principe : engagement ferme

Conformément à la nature juridique d'acompte définie à l'article 5.2, la réservation engage fermement les deux parties dès le versement de l'acompte. **Le Locataire ne dispose d'aucun droit légal au remboursement de l'acompte en cas d'annulation de son fait.**

### 7.2 — Tolérance commerciale du Bailleur

À titre de **geste commercial unilatéral et révocable**, le Bailleur consent au Locataire les modalités suivantes en cas d'annulation à l'initiative de ce dernier, dûment notifiée par courriel ou courrier recommandé :

- **Plus de {{delai_tolerance_commerciale}} jours avant la date d'arrivée** : remboursement intégral de l'acompte versé. Cette tolérance constitue une faveur commerciale du Bailleur et ne constitue en aucun cas la reconnaissance d'un droit au sens du régime des arrhes (article 1590 du Code civil).
- **Entre la date limite ci-dessus et le jour de l'arrivée** : l'acompte reste acquis au Bailleur et le solde demeure exigible dans son intégralité.

### 7.3 — Force majeure

En cas d'événement constitutif de force majeure au sens de l'article 1218 du Code civil dûment justifié, et empêchant définitivement l'exécution du séjour, les parties reprennent leurs prestations respectives. Le Bailleur procède au remboursement intégral des sommes versées sans indemnité.

Ne constituent pas, à eux seuls, des cas de force majeure : les empêchements personnels du Locataire (maladie sans hospitalisation, contraintes professionnelles, problèmes de transport), les conditions météorologiques sauf catastrophe naturelle officiellement déclarée, ou les épidémies sauf restrictions sanitaires gouvernementales rendant le séjour impossible.

### 7.4 — Annulation par le Bailleur

En cas d'annulation à l'initiative du Bailleur, pour quelque motif que ce soit, le Locataire reçoit le **remboursement intégral des sommes versées**, dans un délai maximal de quatorze (14) jours, sans autre indemnité.

### 7.5 — Absence du Locataire à l'arrivée

Si le Locataire ne se présente pas et n'a pas prévenu le Bailleur de son retard dans les vingt-quatre (24) heures suivant l'heure d'arrivée prévue à l'article 2, le présent contrat est considéré comme **résilié de plein droit aux torts du Locataire**. Le Bailleur recouvre la libre disposition du gîte et conserve l'intégralité des sommes déjà versées (acompte et solde).

### 7.6 — Départ anticipé

Le départ anticipé du Locataire de sa propre initiative, pour quelque cause que ce soit autre qu'un manquement du Bailleur dûment constaté, n'ouvre droit à **aucun remboursement** des sommes versées au titre du prix de la location, du forfait ménage ou de la taxe de séjour.

---

## Article 8 — Absence de droit de rétractation

> ## ⚠️ ABSENCE DE DROIT DE RÉTRACTATION
>
> **Conformément aux dispositions de l'article L.221-28, 12° du Code de la consommation, le Locataire ne bénéficie d'AUCUN DROIT DE RÉTRACTATION pour la présente prestation d'hébergement, fournie à une date ou selon une périodicité déterminée.**
>
> **Le Locataire reconnaît expressément avoir été informé de cette absence de droit de rétractation préalablement à la conclusion du contrat.**

*Cette mention doit être affichée en caractères apparents (gras, encadrée, taille de police supérieure au corps du texte) dans le PDF final.*

---

## Article 9 — Arrivée et remise des clés

### 9.1 — Horaires

Le Locataire est attendu le {{date_arrivee}} à partir de {{heure_arrivee}}. L'accueil ne peut être assuré au-delà de {{heure_limite_arrivee}} sans accord préalable du Bailleur.

### 9.2 — Accueil

L'accueil du Locataire est assuré physiquement par le Bailleur ou son représentant. Il comprend la remise des clés, la présentation du gîte et de ses équipements, ainsi que la signature contradictoire de l'état des lieux d'entrée prévu à l'article 10.

### 9.3 — Arrivée tardive ou différée

En cas d'arrivée tardive ou différée, le Locataire est tenu de prévenir le Bailleur dans les meilleurs délais, par téléphone au {{contact_arrivee_tel}}. À défaut, les dispositions de l'article 7.5 s'appliquent.


---

## Article 10 — État des lieux

### 10.1 — État des lieux d'entrée

Un état des lieux d'entrée est établi contradictoirement par les parties à l'arrivée du Locataire, accompagné de l'inventaire détaillé du gîte. Il est signé par les deux parties. Cet état des lieux constitue la seule référence en cas de litige concernant l'état du gîte.

### 10.2 — Réclamations à l'entrée

Toute réclamation concernant l'état du gîte ou son inventaire doit être formulée auprès du Bailleur **dans les vingt-quatre (24) heures** suivant la prise de possession. À défaut, l'état des lieux est réputé accepté sans réserve.

### 10.3 — État des lieux de sortie

Un état des lieux de sortie est établi contradictoirement le jour du départ, à l'heure convenue avec le Bailleur, et au plus tard à l'heure mentionnée à l'article 2. Le Locataire restitue alors les clés et l'ensemble des éléments d'inventaire.

### 10.4 — Départ anticipé empêchant l'EDL

En cas de départ anticipé du Locataire empêchant l'établissement de l'état des lieux le jour même, l'état des lieux peut être établi unilatéralement par le Bailleur. La mainlevée de la caution intervient alors dans les conditions prévues à l'article 6.5, le cas échéant après application des articles 6.3 et 6.4.

---

## Article 11 — Obligations du Locataire et règles d'utilisation

### 11.1 — Usage paisible et conformité à la destination

Le Locataire est tenu d'occuper paisiblement le gîte et d'en faire usage conformément à sa destination d'habitation saisonnière. Il s'engage à respecter le caractère résidentiel du voisinage et la tranquillité des riverains.

### 11.2 — Interdictions générales

Sont strictement interdits dans le gîte et ses dépendances :

1. **Toute sous-location ou cession** du présent contrat, même à titre gratuit ;
2. **L'organisation de fêtes, événements, réceptions** ou tout rassemblement excédant le nombre d'occupants déclaré à l'article 3 ;
3. **L'accueil de tiers** non déclarés, même temporaire (dîners, soirées, nuitées additionnelles) sans accord préalable et écrit du Bailleur ;
4. **Le tabac à l'intérieur** des locaux (voir 11.3) ;
5. **Les animaux de compagnie** (voir 11.4) ;
6. **Toute utilisation commerciale, professionnelle ou événementielle** du gîte.

Tout manquement à ces interdictions constitue une cause de résiliation immédiate du contrat aux torts du Locataire, sans remboursement, et sans préjudice de toute action en réparation.

### 11.3 — Tabac

Il est **strictement interdit de fumer à l'intérieur** du gîte, y compris dans la cheminée, sur le pas des portes, et aux fenêtres. Des espaces extérieurs dédiés peuvent être identifiés par le Bailleur. En cas de constat de manquement (odeur, traces, mégots, détecteurs), les frais de nettoyage spécifique et de neutralisation des odeurs (estimés forfaitairement à 200 € minimum) sont prélevés sur la caution conformément à l'article 6.

### 11.4 — Animaux

> **La présence d'animaux de compagnie est strictement interdite dans tous les gîtes exploités par le Bailleur, sans exception.**

Le manquement à cette interdiction constitue une cause de résiliation immédiate du contrat aux torts du Locataire. Le Bailleur peut refuser l'accès au gîte ou exiger le départ immédiat du Locataire et de l'animal, sans aucun remboursement. Les frais de nettoyage et de dépollution éventuels sont prélevés sur la caution.

### 11.5 — Entretien quotidien

Pendant la durée du séjour, le nettoyage courant et l'entretien quotidien du gîte (vaisselle, propreté des sols, déchets) sont à la charge du Locataire. Le forfait ménage prévu à l'article 4 couvre exclusivement le nettoyage final entre deux locations.

### 11.6 — Tri des déchets et collecte

Le Locataire est tenu de respecter les consignes de tri sélectif et de collecte des ordures ménagères en vigueur sur la commune de Savas, telles que précisées dans le règlement intérieur (Annexe 2).

### 11.7 — Règlement intérieur

Les règles détaillées de fonctionnement du gîte (horaires de tranquillité, utilisation des équipements, consignes de sécurité incendie, etc.) figurent au **règlement intérieur** annexé au présent contrat (Annexe 2). Le Locataire en reconnaît expressément la communication et l'acceptation.

---

## Article 12 — Équipements spécifiques : spa et sauna

### 12.1 — Champ d'application

Le présent article s'applique à l'utilisation du spa (jacuzzi) présent dans tous les gîtes, ainsi qu'au sauna installé exclusivement dans le gîte « La Maison Vieille ».

### 12.2 — Conditions d'utilisation du spa

L'utilisation du spa est subordonnée au respect des règles suivantes :

1. **Température maximale** : 38 °C (réglage verrouillé par le Bailleur) ;
2. **Interdiction absolue** de consommation d'alcool, de tabac, de nourriture, ou de substances psychotropes dans ou à proximité immédiate du spa ;
3. **Surveillance permanente des mineurs** par un adulte responsable. **L'utilisation par des enfants de moins de 6 ans est interdite.** Pour les enfants de 6 à 16 ans, la présence active d'un adulte dans le spa est obligatoire ;
4. **Respect du nombre maximal** d'utilisateurs simultanés indiqué sur le panneau d'information à proximité de l'équipement.

### 12.3 — Conditions d'utilisation du sauna *(La Maison Vieille uniquement)*

1. **Interdiction d'accès** aux enfants de moins de 12 ans ;
2. Mineurs de 12 à 17 ans : accompagnement obligatoire par un adulte ;
3. **Interdiction d'alcool, tabac, nourriture, substances psychotropes** ;
4. Respect strict des consignes affichées (températures, hygrométrie).

### 12.4 — Précaution médicale générale

> **Il appartient à chaque utilisateur de vérifier, le cas échéant auprès de son médecin, l'absence de contre-indication à l'utilisation du spa et du sauna, notamment en cas de grossesse, de problème cardiovasculaire ou de traitement médical en cours.**

### 12.5 — Décharge de responsabilité

Le Locataire et l'ensemble des occupants utilisent le spa et le sauna **sous leur propre responsabilité**, en pleine conscience des risques inhérents (brûlures, glissades, malaises, déshydratation, légionellose en cas de non-respect des règles d'hygiène). Le Locataire reconnaît avoir été informé des règles d'utilisation et des contre-indications, et s'engage à les respecter et à les faire respecter par l'ensemble des occupants.

### 12.6 — Maintenance et eau du spa

Le Bailleur procède à l'entretien et au contrôle régulier de la qualité de l'eau du spa entre chaque location. Si le Locataire constate une anomalie pendant son séjour (couleur, odeur, mousse, dysfonctionnement), il en avise immédiatement le Bailleur et suspend l'utilisation jusqu'à intervention.

### 12.7 — Sanctions en cas de manquement

Tout manquement grave aux règles ci-dessus, en particulier l'introduction de produits prohibés ou la mise en danger de mineurs, autorise le Bailleur à interdire l'accès aux équipements pour la durée restante du séjour, sans remboursement.

---

## Article 13 — Assurance villégiature

Le Locataire déclare être titulaire d'une **assurance de responsabilité civile vie privée d'occupant d'immeuble pris en location temporaire** (dite « assurance villégiature »), couvrant les risques locatifs (incendie, dégât des eaux, explosion) et sa responsabilité civile personnelle pendant la durée du séjour.

Une attestation d'assurance datée de l'année en cours peut être exigée par le Bailleur à l'arrivée. À défaut de production d'une attestation valide, le Bailleur se réserve la faculté de refuser l'entrée dans les lieux, sans remboursement.

Le Locataire est responsable de tous les dommages survenant de son fait, du fait des occupants déclarés, ou de toute personne admise dans le gîte avec son accord.

---

## Article 14 — Données personnelles (RGPD)

### 14.1 — Responsable du traitement

La SARL DE LA VOUTE, identifiée en tête du présent contrat, est responsable du traitement des données personnelles du Locataire et des occupants majeurs déclarés.

**Contact pour toute question relative aux données personnelles :** nicolas.terrafina@wanadoo.fr

### 14.2 — Données collectées

Sont collectées dans le cadre du présent contrat :

- **Identité** : civilité, nom, prénom ;
- **Coordonnées** : adresse postale, téléphone, courriel ;
- **Données de réservation** : dates, gîte loué, composition du foyer, identité des occupants majeurs ;
- **Données financières** : montants versés, dates et modalités de paiement (les données de carte bancaire ne sont pas conservées par le Bailleur ; elles transitent par le prestataire de paiement habilité) ;
- **Données de signature électronique** : identifiant technique de la signature, horodatage, adresse IP du signataire, empreinte SHA-256 du document signé.

### 14.3 — Finalités et bases légales

| Finalité | Base légale (RGPD) |
|---|---|
| Conclusion et exécution du contrat de location | Exécution du contrat (art. 6.1.b) |
| Émission de la facture et tenue de la comptabilité | Obligation légale (art. 6.1.c) |
| Tenue du registre de présence (sécurité, capacité) | Intérêt légitime (art. 6.1.f) |
| Gestion de la relation client (réclamations, médiation) | Exécution du contrat (art. 6.1.b) |
| Défense en justice en cas de litige | Intérêt légitime (art. 6.1.f) |
| Communications commerciales (offres, nouveautés) | Consentement (art. 6.1.a) — recueilli séparément |

### 14.4 — Destinataires des données

Les données peuvent être communiquées :

- aux **collaborateurs habilités** du Bailleur ;
- aux **prestataires sous-traitants** strictement nécessaires : hébergeur du site et de la base de données (OVH SAS, données hébergées en France), Swikly (dépôt de garantie), prestataire de paiement, expert-comptable. La signature électronique est recueillie directement par le Bailleur, sans prestataire tiers ;
- aux **autorités administratives ou judiciaires** sur réquisition légale.

Aucune donnée n'est transférée hors de l'Union européenne sans encadrement juridique approprié (clauses contractuelles types ou décision d'adéquation).

### 14.5 — Durée de conservation

| Catégorie | Durée |
|---|---|
| Contrat, facture et pièces comptables associées | 10 ans (obligation comptable et fiscale) |
| Identité des occupants (registre de présence) | 1 an après la fin du séjour |
| Données de prospection commerciale | 3 ans à compter du dernier contact actif |
| Données de signature électronique (preuve probatoire) | Durée légale de prescription (10 ans) |

### 14.6 — Droits du Locataire

Conformément au RGPD et à la loi Informatique et Libertés, le Locataire dispose des droits suivants :

- **Accès** à ses données ;
- **Rectification** des données inexactes ;
- **Effacement** dans les conditions prévues par la réglementation ;
- **Limitation** du traitement ;
- **Opposition** au traitement fondé sur l'intérêt légitime ;
- **Portabilité** des données ;
- **Retrait du consentement** à tout moment (pour les traitements fondés sur celui-ci) ;
- **Réclamation** auprès de la CNIL (3 Place de Fontenoy, 75007 Paris — www.cnil.fr).

Ces droits s'exercent par courriel à l'adresse indiquée au 14.1, accompagné d'un justificatif d'identité.

---

## Article 15 — Réclamations et médiation de la consommation

### 15.1 — Réclamation directe

Toute réclamation relative à l'exécution du présent contrat doit être adressée au Bailleur, dans les meilleurs délais, par courriel à `nicolas.terrafina@wanadoo.fr` ou par courrier postal à l'adresse du siège social. Le Bailleur s'engage à apporter une réponse dans un délai raisonnable n'excédant pas trente (30) jours.

S'agissant spécifiquement de l'état du gîte ou de l'inventaire, l'article 10.2 prévoit un délai impératif de 24 heures.

### 15.2 — Médiation de la consommation

À défaut de résolution amiable, et conformément aux articles L.611-1 et suivants du Code de la consommation, le Locataire est informé qu'il peut recourir gratuitement à un médiateur de la consommation. Le Bailleur adhère au dispositif suivant :

> **MEDICYS**
> 73 Boulevard de Clichy, 75009 PARIS
> Site internet : www.medicys.fr
> Saisine en ligne possible.

### 15.3 — Plateforme européenne de règlement des litiges

Pour les locataires résidant dans un État membre de l'Union européenne, une plateforme de règlement en ligne des litiges est mise à disposition par la Commission européenne : https://ec.europa.eu/consumers/odr/

---

## Article 16 — Loi applicable et juridiction compétente

### 16.1 — Loi applicable

Le présent contrat est soumis au **droit français**, à l'exclusion de toute autre législation, et notamment aux dispositions du Code civil, du Code du tourisme et du Code de la consommation.

### 16.2 — Juridiction compétente

À défaut de résolution amiable et après tentative de médiation, tout litige relatif à la formation, l'interprétation, l'exécution ou la résiliation du présent contrat relève de la compétence exclusive des **tribunaux du ressort du lieu de situation de l'immeuble loué**, soit le **Tribunal judiciaire de Privas** (Ardèche).

Cette clause est sans préjudice de la faculté ouverte au Locataire consommateur, par les dispositions impératives du Code de la consommation, de saisir à son choix le tribunal de son domicile ou le tribunal de la résidence du défendeur.

---

## Bloc signature électronique simple (SES, règlement eIDAS)

### Mention de signature

> **Signature électronique simple au sens de l'article 3, point 10, du règlement (UE) n° 910/2014 du Parlement européen et du Conseil du 23 juillet 2014 (règlement eIDAS), recueillie directement par le Bailleur, sans prestataire de services de confiance tiers : validation par lien à usage unique, horodatage, enregistrement de l'adresse IP du signataire et empreinte SHA-256 du document. Conformément à l'article 25 du règlement eIDAS, elle ne peut être privée d'effet juridique ni refusée comme preuve en justice au seul motif qu'elle se présente sous forme électronique simple ; elle vaut signature au sens de l'article 1367 du Code civil.**

### Métadonnées de signature

| Élément | Valeur |
|---|---|
| Identifiant unique de la signature | {{signature_ses_id}} |
| Date et heure (UTC+1) de signature | {{date_signature}} |
| Adresse IP du signataire | {{adresse_ip_signature}} |
| Empreinte SHA-256 du document signé | {{document_hash}} |

### Acceptation expresse

En signant électroniquement le présent contrat, le Locataire reconnaît expressément :

1. avoir reçu et pris connaissance de l'intégralité du contrat, de ses annexes et du règlement intérieur ;
2. avoir été informé de l'**absence de droit de rétractation** (article 8) ;
3. avoir été informé de la **nature juridique d'acompte** des sommes versées (article 5.2) ;
4. accepter sans réserve les conditions d'utilisation des **équipements spécifiques** (article 12) et la décharge de responsabilité associée ;
5. accepter les conditions de **traitement de ses données personnelles** (article 14) ;
6. avoir conscience que la signature électronique a la même valeur juridique qu'une signature manuscrite (article 1367 du Code civil).

Fait à distance, par signature électronique, le {{date_signature}}.

**Pour le Bailleur** : Monsieur Nicolas TERRAFINA, gérant de la SARL DE LA VOUTE.
**Pour le Locataire** : {{client_civilite}} {{client_nom}} {{client_prenom}}.

---

## Annexes

| Annexe | Intitulé | Statut | Source |
|---|---|---|---|
| **Annexe 1** | Fiche descriptive du gîte (équipements, surface, plan, photos, charges) | À produire par gîte | Base `gite` + champs descriptifs |
| **Annexe 2** | Règlement intérieur du gîte | À produire par gîte | Document Markdown par gîte |
| **Annexe 3** | État des lieux d'entrée (template) | Template vide à compléter | Formulaire numérique signé contradictoirement |
| **Annexe 4** | Information précontractuelle RGPD complète | À produire (template unique) | Document Markdown |

---

## Variables back-office complètes

### Variables d'identification (article en-tête)

| Variable | Description |
|---|---|
| `numero_contrat` | Format `CTR-{{annee}}-{{seq}}` |
| `date_emission` | Date de génération du contrat |

### Variables locataire (12 champs)

| Variable | Description |
|---|---|
| `client_civilite` | Madame / Monsieur / Autre |
| `client_nom`, `client_prenom` | Identité |
| `client_adresse`, `client_code_postal`, `client_ville`, `client_pays` | Adresse postale |
| `client_telephone`, `client_email` | Contact |

### Variables gîte

| Variable | Description |
|---|---|
| `gite_nom` | LaPhine / L'Armu / La Maison Vieille |
| `gite_ref_gdf` | Référence Gîtes de France |
| `gite_classement` | Nombre d'épis |
| `gite_adresse_complete` | Adresse précise |
| `gite_capacite_max` | Capacité d'accueil |
| `gite_equipements_specifiques` | Spa, sauna, etc. |
| `gite_a_spa`, `gite_a_sauna` | Booléens pour activation des sous-sections |

### Variables séjour

| Variable | Description |
|---|---|
| `date_arrivee`, `heure_arrivee`, `heure_limite_arrivee` | Arrivée |
| `date_depart`, `heure_depart` | Départ |
| `nb_nuits` | Durée |
| `nb_adultes`, `nb_enfants`, `nb_bebes` | Composition |
| `liste_occupants_majeurs` | Identité des majeurs |

### Variables tarifaires

| Variable | Description |
|---|---|
| `prix_location` | Prix nuitées (computé) |
| `forfait_menage` | Paramètre par gîte |
| `taux_taxe_sejour` | 5,5 % (paramétrable) |
| `montant_taxe_sejour` | Computé |
| `sous_total` | Computé |
| `total_ttc` | Computé |

### Variables paiement

| Variable | Description |
|---|---|
| `taux_acompte` | 30 % (paramétrable) |
| `montant_acompte` | Computé |
| `taux_solde` | 70 % (= 100 - taux_acompte) |
| `montant_solde` | Computé |
| `delai_solde` | 30 jours (paramétrable) |
| `date_butoir_solde` | Computé : date_arrivee - delai_solde |
| `date_versement_acompte` | Renseigné lors du paiement |

### Variables annulation

| Variable | Description |
|---|---|
| `delai_tolerance_commerciale` | 30 jours (paramétrable, défaut = delai_solde) |

### Variables caution

| Variable | Description |
|---|---|
| `caution_montant` | Paramètre par gîte |

### Variables contact

| Variable | Description |
|---|---|
| `contact_arrivee_tel` | Numéro joignable pour arrivée |

### Variables signature

| Variable | Description |
|---|---|
| `signature_ses_id` | Identifiant technique de la signature SES (colonne `signatures.id`) |
| `date_signature` | Date/heure de la signature électronique |
| `adresse_ip_signature` | IP du signataire (preuve probatoire) |
| `document_hash` | Empreinte SHA-256 du document signé |
