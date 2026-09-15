# Contrôles sur les PDF RÉELLEMENT PRODUITS : les montants imprimés, le fait
# que les lignes s'additionnent, la présence ou l'absence de la ligne
# « Options », le nombre de pages et la présence du logo.
#
#   python scripts/parcours/controler-pdf.py [dossier de stockage]
#
# Dossier par défaut : la valeur de STORAGE_PATH si elle est définie, sinon
# ./.data/documents-test.
#
# Dépendances : pypdf (texte) et pymupdf (images). Installation :
#   python -m pip install --user pypdf pymupdf
#
# Un PDF qui passe tous les contrôles automatiques peut encore être visuellement
# cassé : ce script écrit aussi un PNG de la première page de chaque document
# (option --png) pour un coup d'œil humain. Le faire au moins une fois après
# toute modification du rendu.
import os
import re
import sys
from pathlib import Path

from pypdf import PdfReader

# Montants attendus, en centimes. Doivent correspondre à scripts/parcours/reference.ts.
ATTENDUS = {
    "TEST-2026-ARMU-001": {
        "prixLocation": 45730, "forfaitMenage": 8000, "options": 2550,
        "sousTotal": 56280, "taxeSejour": 1386, "totalTtc": 57666,
        "acompte": 17300, "solde": 40366, "caution": 40000,
    },
    "TEST-2026-LAPHINE-002": {
        "prixLocation": 62000, "forfaitMenage": 8000, "options": 0,
        "sousTotal": 70000, "taxeSejour": 1540, "totalTtc": 71540,
        "acompte": 21462, "solde": 50078, "caution": 50000,
    },
}
# Les documents d'une réservation : le numéro de contrat du parcours nominal.
DOCUMENTS = {
    "TEST-2026-ARMU-001": {"contrat": "CTR-2026-001", "acompte": "FAC-2026-001", "solde": "FAC-2026-002"},
    "TEST-2026-LAPHINE-002": {"contrat": "CTR-2026-002", "acompte": "FAC-2026-003", "solde": "FAC-2026-004"},
}

echecs = 0


def noter(ok, libelle, detail=""):
    global echecs
    if not ok:
        echecs += 1
    print(f"  [{'OK' if ok else 'KO'}] {libelle}{f' ({detail})' if detail else ''}")


def centimes(texte):
    """« 1 234,56 € » → 123456. Espaces fines insécables comprises."""
    return int(texte.replace(" ", "").replace(" ", "").replace(" ", "").replace(",", ""))


def lire(chemin):
    lecteur = PdfReader(chemin)
    texte = "\n".join((p.extract_text() or "") for p in lecteur.pages)
    images = sum(len(p.images) for p in lecteur.pages)
    return texte, len(lecteur.pages), images


def montant(texte, motif):
    """Montant en centimes qui suit la première occurrence du motif, ou None.

    re.M pour que « ^Options » désigne bien un début de ligne du PDF."""
    m = re.search(motif + r"[^\n€]*?(\d[\d   ]*,\d\d) €", texte, re.M)
    return centimes(m.group(1)) if m else None


def controler_facture(chemin, reference, genre):
    a = ATTENDUS[reference]
    texte, pages, images = lire(chemin)
    nom = Path(chemin).name
    print(f"\n{nom} — facture de {genre} ({reference})")

    noter(pages == 1, "tient sur une seule page", f"{pages} page(s)")
    noter(images >= 1, "logo présent (au moins une image)", f"{images} image(s)")

    loc = montant(texte, "Prix de la location")
    men = montant(texte, "Forfait ménage")
    opt = montant(texte, "^Options")
    sst = montant(texte, "Sous-total")
    tax = montant(texte, "Taxe de séjour")
    tot = montant(texte, "Total du séjour")

    noter(loc == a["prixLocation"], "ligne « Prix de la location »", str(loc))
    noter(men == a["forfaitMenage"], "ligne « Forfait ménage »", str(men))
    if a["options"]:
        noter(opt == a["options"], "ligne « Options » présente et exacte", str(opt))
    else:
        noter("Options" not in texte, "aucune ligne « Options » (séjour sans option)")
        opt = 0
    noter(sst == a["sousTotal"], "sous-total", str(sst))
    noter(tax == a["taxeSejour"], "taxe de séjour", str(tax))
    noter(tot == a["totalTtc"], "total du séjour", str(tot))

    # Le contrôle qui compte pour le client : les lignes s'additionnent.
    noter(
        None not in (loc, men, sst) and loc + men + (opt or 0) == sst,
        f"les lignes s'additionnent : {loc} + {men} + {opt} = {sst}",
    )
    noter(None not in (sst, tax, tot) and sst + tax == tot, "sous-total + taxe = total")

    if genre == "acompte":
        ac = montant(texte, "Acompte de 30 %")
        so = montant(texte, "Le solde de")
        noter(ac == a["acompte"], "montant facturé (acompte)", str(ac))
        noter(so == a["solde"], "solde annoncé", str(so))
        noter(None not in (ac, so) and ac + so == a["totalTtc"], "acompte + solde = total TTC")
    else:
        ac = montant(texte, "Acompte déjà facturé")
        so = montant(texte, "Solde réglé du séjour")
        noter(ac == a["acompte"], "acompte rappelé", str(ac))
        noter(so == a["solde"], "montant facturé (solde)", str(so))
        noter(None not in (ac, so) and ac + so == a["totalTtc"], "acompte + solde = total TTC")


def controler_contrat(chemin, reference, signe):
    a = ATTENDUS[reference]
    texte, pages, images = lire(chemin)
    nom = Path(chemin).name
    print(f"\n{nom} — contrat{' signé' if signe else ''} ({reference})")

    noter(pages == 10, "10 pages", f"{pages}")
    noter(images >= 5, "logo sur chaque en-tête (au moins 5 images)", f"{images} image(s)")
    noter(montant(texte, "Caution") == a["caution"], "caution", str(montant(texte, "Caution")))
    noter(montant(texte, "Location \\(") == a["prixLocation"], "ligne « Location »")
    noter(montant(texte, "Sous-total prestations") == a["sousTotal"], "sous-total (article 4.1)")
    noter(montant(texte, "TOTAL DU SÉJOUR") == a["totalTtc"], "total du séjour")
    noter(montant(texte, r"\(a\) Acompte") == a["acompte"], "échéance (a) acompte")
    noter(montant(texte, r"\(b\) Solde") == a["solde"], "échéance (b) solde")
    if a["options"]:
        noter(texte.count("Options") >= 2, "ligne « Options » dans les deux tableaux", f"{texte.count('Options')}")
        noter(montant(texte, "^Options") == a["options"], "montant des options")
    else:
        noter("Options" not in texte, "aucune ligne « Options » (séjour sans option)")
    if signe:
        noter("Signature électronique simple" in texte, "bloc de signature électronique simple")


def png_premiere_page(chemin, dossier_png):
    try:
        import pymupdf
    except ImportError:
        print("  (pymupdf absent : pas de PNG ; python -m pip install --user pymupdf)")
        return
    doc = pymupdf.open(chemin)
    cible = Path(dossier_png) / (Path(chemin).stem + "-p1.png")
    cible.parent.mkdir(parents=True, exist_ok=True)
    doc[0].get_pixmap(dpi=80).save(str(cible))
    print(f"  PNG de contrôle visuel : {cible}")


def main():
    args = [a for a in sys.argv[1:] if a != "--png"]
    avec_png = "--png" in sys.argv[1:]
    racine = Path(args[0] if args else os.environ.get("STORAGE_PATH", "./.data/documents-test"))
    if not racine.is_dir():
        print(f"ERREUR : dossier de stockage introuvable : {racine}", file=sys.stderr)
        sys.exit(2)
    dossier_png = Path(os.environ.get("PARCOURS_SORTIE", ".parcours")) / "png"

    for reference, docs in DOCUMENTS.items():
        for genre in ("acompte", "solde"):
            chemin = racine / "factures" / f"{docs[genre]}.pdf"
            if not chemin.exists():
                noter(False, f"{chemin.name} introuvable")
                continue
            controler_facture(chemin, reference, genre)
            if avec_png:
                png_premiere_page(chemin, dossier_png)

        # Le contrat vit sous contrats/{reservation_id}/ : on le retrouve par son numéro.
        for suffixe, signe in ((".pdf", False), ("-signe.pdf", True)):
            trouves = list((racine / "contrats").glob(f"*/{docs['contrat']}{suffixe}"))
            if not trouves:
                noter(False, f"{docs['contrat']}{suffixe} introuvable")
                continue
            controler_contrat(trouves[0], reference, signe)
            if avec_png:
                png_premiere_page(trouves[0], dossier_png)

    print(f"\n{echecs} échec(s).")
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
