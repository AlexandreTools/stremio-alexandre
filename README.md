# Recos Alexandre — add-on Stremio perso

Deux rangées pour l'accueil de Stremio, mises à jour chaque nuit par GitHub Actions et servies par GitHub Pages :

- **Au cinéma** : les films sortis en salle en France ces 10 dernières semaines (ceux que Stremio met aussi en « Populaires » d'abord).
- **Classiques à rattraper** : films de plus de 10 ans très bien notés (≥ 8/10, ≥ 3 000 votes sur TMDB), une nouvelle sélection chaque jour.

Installation dans Stremio : ajouter l'add-on avec l'adresse `https://alexandretools.github.io/stremio-alexandre/manifest.json`.

Réglages : la clé TMDB est dans *Settings → Secrets and variables → Actions → `TMDB_KEY`*.
Mise à jour à la main : onglet *Actions → Mise à jour des rangées → Run workflow*.

Données et images : [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
