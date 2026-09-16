# NestWork — postes de travail modulaires

Ce lot complète les chaises cardinales avec deux bureaux individuels séparés et
alignés sur la grille. Il remplace le bureau double historique dont les chaises,
écrans et accessoires formaient un seul sprite impossible à recomposer.

## Contrat de grille

- bureau horizontal : `3 × 2` cases ;
- bureau vertical : `2 × 3` cases ;
- aucune chaise, plante ou décoration fusionnée ;
- ordinateur fermé et passe-câble intégrés au bureau ;
- marges transparentes sur les quatre côtés ;
- identifiants stables `nw-workstations_desk-horizontal_*` et
  `nw-workstations_desk-vertical_*`.

## Fichiers

- source générée : `nestwork-workstations-source-v1.png` ;
- planche du jeu :
  `apps/web/public/NestWork/workstations/workstations-v1.png` ;
- reconstruction : `node scripts/pack-nestwork-workstations.mjs`.

La source a été générée avec l'outil Imagegen intégré en prenant seulement les
assets originaux NestWork comme référence visuelle. Aucun sprite LimeZu n'a été
utilisé comme calque ou source graphique.
