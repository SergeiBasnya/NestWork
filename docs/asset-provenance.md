# Provenance des assets publics

Ce registre décrit les ressources couvertes par `LICENSE-ASSETS.md`. Toute
nouvelle ressource doit être ajoutée ici avant sa publication.

| Famille | Chemins distribués | Source modifiable | Méthode documentée |
| --- | --- | --- | --- |
| Personnages | `public/Characters/original/` | `docs/asset-prototypes/{aurore,milo,leo}-*.png` | Images créées pour NestWork, puis extraction, nettoyage et alignement par les scripts `pack-{aurore,milo,leo}.mjs` |
| Mobilier de bureau | `public/NestWork/office/` | `docs/asset-prototypes/nestwork-*-source-*.png` | Concepts NestWork originaux, normalisés et placés sur la grille par les scripts `pack-nestwork-*.mjs` |
| Espaces partagés | `public/NestWork/shared-spaces/` | `docs/asset-prototypes/nestwork-shared-spaces-source-v2.png` et sources correctives associées | Génération spécifique NestWork et conditionnement reproductible |
| Réunion et postes | `public/NestWork/{meeting,workstations,collaboration}/` | Sources portant les mêmes familles dans `docs/asset-prototypes/` | Génération spécifique NestWork, séparation des objets et placement sur la grille par scripts |
| Sols | `public/NestWork/floors/` | `apps/web/scripts/generate-nestwork-floors.mjs` et `scripts/build-nestwork-floors-*.mjs` | Textures répétables générées et vérifiées par code |
| Murs | `public/NestWork/construction/` | source de construction et scripts `build-nestwork-walls-*.mjs` / `build-nestwork-raised-walls-v3.mjs` | Concept visuel spécifique NestWork, puis géométrie et sprites RGBA générés par code sur la grille de 32 px |
| Terrain | `public/NestWork/terrain/` | `grass-source-v1.png` | Texture originale NestWork |
| Réactions | `public/NestWork/emotes/` | SVG présents dans le même dossier | Dessin vectoriel original créé directement pour l’édition publique |

Les documents de chaque famille précisent les dimensions, la grille et les
références internes utilisées. Ils déclarent qu’aucun spritesheet LimeZu n’a
servi de calque ou de source graphique.

## Règle d’admission

Une contribution visuelle est refusée si son auteur, sa licence, sa source ou sa
méthode de création sont inconnus. Modifier légèrement un asset tiers ou demander
une imitation reconnaissable ne suffit pas à en faire un asset original.

Avant la première publication, le mainteneur doit vérifier ce registre et
conserver hors dépôt les preuves utiles de création et, le cas échéant, les
conditions du service de génération utilisé à la date de création.
