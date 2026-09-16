# NestWork Starter Construction — sols et modules originaux

Ce kit de construction original complète le mobilier NestWork avec quatre sols
répétables en pixel art natif et un système de murs en hauteur v3. Les murs du
fond occupent deux cases afin de montrer une face verticale, un sommet et une
plinthe. Les côtés utilisent des tranches empilables de 1 × 3 case, disponibles
à gauche et à droite en versions pleine et vitrée. Elles reprennent exactement
les contours, le crème, la plinthe et le verre des murs du fond. Les angles,
passages et fenêtres restent entièrement contenus dans leur empreinte de grille.

## Fichiers

- Source : `nestwork-construction-source-v1.png`
- Référence visuelle : `nestwork-construction-source-v1.png`
- Sols utilisés par le jeu : `apps/web/public/NestWork/floors/*-32-v4.png`
- Planche de structures :
  `apps/web/public/NestWork/construction/raised-walls-v3.png`
- Script reproductible : `node scripts/pack-nestwork-construction.mjs`
- Sols v4 : `node scripts/build-nestwork-floors-v4.mjs`
- Murs en hauteur v3 : `node scripts/build-nestwork-raised-walls-v3.mjs`

Tous les éléments sont conditionnés sur une grille native de 32 pixels. Les sols
v4 sont dessinés directement en 32 × 32 pixels : une texture correspond exactement
à une case du builder. Leur motif interne reste volontairement plus fin que la
grille de placement. Ils utilisent une palette courte, sans réduction d'une image
haute définition, et sont opaques et raccordables pour le pinceau de remplissage.
Les planches de murs v1 et v2 restent disponibles uniquement pour les cartes
déjà sauvegardées ; elles sont masquées dans le décorateur.

## Direction artistique

Le kit reprend la palette du mobilier original : contours bleu nuit/anthracite,
surfaces crème neutre, verre indigo désaturé, gris ardoise et orange miel utilisé
uniquement comme accent. Les proportions sont définies par la même grille que les
avatars et le mobilier afin de préserver une échelle cohérente dans le jeu.

La génération a pris pour référence uniquement la planche de mobilier originale
NestWork. Aucun spritesheet LimeZu n'a servi de calque ou de source graphique.
