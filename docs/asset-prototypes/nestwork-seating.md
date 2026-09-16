# NestWork Seating — assises cardinales

Bibliothèque d'assises originale conçue à partir de la grille du builder, et non
recadrée après coup autour de scènes de mobilier. Elle remplace dans le catalogue
la chaise de bureau isolée de façon incorrecte, le fauteuil diagonal et la table
café fusionnée avec ses chaises.

## Contrat de grille

- chaise de bureau : `1 × 1`, face, dos, gauche et droite ;
- chaise café : `1 × 1`, face, dos, gauche et droite ;
- fauteuil individuel : `1 × 1`, face, dos, gauche et droite ;
- table café ronde : `2 × 2`, sans chaise ni décoration fusionnée ;
- chaque asset possède une marge transparente et ne peut pas déborder de son
  rectangle logique.

## Fichiers

- Sources : `nestwork-seating-source-v1.png` et
  `nestwork-cafe-table-source-v2.png` ;
- Planche de compatibilité :
  `apps/web/public/NestWork/office/starter-seating-v1.png` ;
- Planche utilisée par le catalogue :
  `apps/web/public/NestWork/office/starter-seating-v2.png` ;
- Script reproductible : `node scripts/pack-nestwork-seating.mjs`.

Les images sources ont été générées pour NestWork à partir de la direction
artistique originale du projet. Aucun spritesheet LimeZu n'a servi de calque ou
de source graphique.

La V2 ramène toutes les assises individuelles dans une cellule `1 × 1` et réduit
la table à l'intérieur de son empreinte `2 × 2`. La V1 reste préchargée uniquement
pour afficher les objets posés avant ce changement d'échelle.

La table café possède une source isolée et une marge transparente contrôlée afin
que le plateau et le pied ne soient ni tronqués ni accompagnés de pixels détachés.
