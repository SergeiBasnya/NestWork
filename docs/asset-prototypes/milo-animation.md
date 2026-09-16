# Milo — animations intégrées

Personnage original NestWork : peau brune, cheveux courts et ondulés, silhouette
arrondie, surchemise vert sauge, tee-shirt crème, pantalon bleu anthracite et
baskets rouille. Il partage les proportions et la densité de pixels d'Aurore,
avec une identité et une silhouette distinctes.

## Format

- `apps/web/public/Characters/original/Milo_walk.png`
- `apps/web/public/Characters/original/Milo_idle.png`
- PNG RGBA, 1152 × 64 pixels, 24 images horizontales de 48 × 64 pixels.
- Images 0–5 : droite ; 6–11 : dos ; 12–17 : gauche ; 18–23 : face.
- Marche à six poses et repos avec respiration discrète et clignement.
- Pieds alignés au bas de chaque cellule, marge transparente sur les côtés.
- Échelle Phaser : 0,75 ; cellule affichée à 36 × 48 pixels dans le monde.

## Fabrication

Le turnaround et les deux planches sources ont été créés avec l'outil intégré
**imagegen**, en utilisant uniquement Aurore comme référence de direction
artistique NestWork. Milo est une nouvelle création : aucune planche LimeZu n'a
servi de calque ou de source graphique.

Le script `node scripts/pack-milo.mjs` retire le blanc extérieur, découpe les
24 figures de chaque source, les redimensionne sans interpolation et aligne leurs
pieds. `milo-runtime-sheet.png` regroupe les 48 images réellement utilisées par
le moteur pour inspection.

La planche de marche a été reprise pour rendre lisibles les six phases même à
48 × 64 pixels : contact gauche, compression, passage, contact droit,
compression et passage opposé. Les pieds alternent clairement de face et de dos,
avec balancement inverse des bras et mouvement discret de la surchemise.
