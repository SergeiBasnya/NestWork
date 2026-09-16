# NestWork Shared Spaces — mobilier original

Deuxième bibliothèque de mobilier originale destinée aux zones communes et aux
espaces collaboratifs. Elle contient 16 objets : accueil, présentation,
rangement, services, détente et végétation.

## Fichiers

- Source nettoyée utilisée : `nestwork-shared-spaces-source-v2.png`
- Source de remplacement de l'arbre complet :
  `nestwork-indoor-tree-source-v1.png`
- Sources isolées corrigées : `nestwork-vending-source-v2.png` et
  `nestwork-round-rug-source-v2.png`
- Planche utilisée par le jeu :
  `apps/web/public/NestWork/shared-spaces/starter-shared-spaces-v2.png`
- Script reproductible : `node scripts/pack-nestwork-shared-spaces.mjs`

La planche finale est un PNG RGBA transparent de 416 × 416 pixels, soit une
grille de 13 × 13 tuiles de 32 pixels. Chaque objet possède un rectangle nommé
dans `apps/web/game/nestworkSharedSpaces.ts` et apparaît comme une carte
distincte dans le décorateur.

Le tableau blanc mobile occupe `2 × 2` cellules et l'armoire de secours `1 × 2`.
Leurs pixels visibles restent strictement à l'intérieur de ces empreintes.

## Direction artistique

La perspective, les contours bleu nuit, les tons crème, l'indigo sourd, le vert
sauge et les accents orange limités reprennent la grammaire visuelle des packs
NestWork précédents. Les dimensions ont été définies relativement au mobilier,
aux portes et aux avatars déjà intégrés.

La génération a utilisé uniquement les planches originales NestWork comme
références de style et d'échelle. Aucun spritesheet LimeZu n'a servi de calque ou
de source graphique.

L'arbre d'intérieur utilise une source isolée afin que sa couronne complète ne
soit jamais contrainte par les limites d'une cellule de planche contact.
Le distributeur et le tapis rond utilisent eux aussi des sources isolées : leur
détourage est nettoyé avant redimensionnement pour éviter franges et résidus.
