# Les Gîtes de Samoyas

Site vitrine et back office pour les 3 gîtes du hameau de Samoyas (Ardèche) : LaPhine, L'Armu et La Maison Vieille.

Site statique HTML/CSS/JS — aucun build nécessaire. Pour le voir en local :

```bash
npx serve .
```

puis ouvrir http://localhost:3000.

## Structure

- `index.html` — accueil (hero, présentation des 3 gîtes)
- `gites.html` / `gite.html` — liste et fiche détaillée d'un gîte
- `activites.html` — spa et activités alentour
- `reserver.html` — tunnel de réservation
- `suivi.html` — suivi de réservation côté client
- `contact.html`, `legal.html`, `404.html`
- `admin/` — back office : tableau de bord, réservations, calendrier, fiche réservation, contrats & factures, tarifs & saisons, pages des gîtes, bons cadeaux, paramètres
- `assets/` — `tokens.css` (design tokens), `site.css`/`site.js` (site public), `admin.css`/`admin-shell.js` (back office), logos

## Photos

Les emplacements d'images utilisent le composant `<image-slot>` (`assets/image-slot.js`) et affichent pour l'instant des légendes de remplacement. Pour mettre une vraie photo, ajouter l'attribut `src` sur le slot, par ex. :

```html
<image-slot id="home-hero" src="assets/photos/hameau.jpg" placeholder="…"></image-slot>
```
