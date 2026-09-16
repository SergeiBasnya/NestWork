# Leo — animations intégrées

Personnage original NestWork : cheveux blond sable ébouriffés, silhouette ronde
et compacte, sweat bordeaux, jean bleu désaturé et baskets ivoire. Sa tenue part
d'une direction visuelle fournie pour le projet, puis a été entièrement
redessinée dans la direction artistique d'Aurore et Milo.

## Format runtime

- `apps/web/public/Characters/original/Leo_walk.png`
- `apps/web/public/Characters/original/Leo_idle.png`
- PNG RGBA, 1152 × 64 pixels, 24 images horizontales de 48 × 64 pixels.
- Images 0–5 : droite ; 6–11 : dos ; 12–17 : gauche ; 18–23 : face.
- Six appuis de marche et six poses de repos par direction.
- Échelle Phaser : 0,75 ; hauteur affichée de 48 pixels dans le monde.
- Pieds alignés au bas de chaque cellule, marges transparentes sur les côtés et
  au-dessus de la mèche.

Le sélecteur d'avatar, les joueurs locaux et les joueurs distants utilisent le
même contrat `characterSpriteSpec` qu'Aurore et Milo.

## Fabrication

Les trois sources de travail sont conservées dans `docs/asset-prototypes/` :

- `leo-turnaround-reference-v1.png` : droite, dos, gauche et face ;
- `leo-walk-source.png` : quatre lignes de six poses de marche ;
- `leo-idle-source.png` : quatre lignes de six poses de repos.

Le dessin a été réalisé avec l'outil intégré **imagegen**. La référence fournie
a servi uniquement à cadrer les attributs généraux — cheveux blonds, sweat
bordeaux, jean et baskets. Aurore et Milo ont fixé les proportions, les contours
et la densité de pixels. Aucun pixel de la référence n'est copié dans les
planches runtime.

Le script `node scripts/pack-leo.mjs` retire uniquement le blanc extérieur,
extrait les 48 figures, les redimensionne sans interpolation et aligne leurs
pieds. Il génère aussi `leo-runtime-sheet.png` pour la revue visuelle.

La planche de marche a été reprise pour rendre lisibles les six phases même à
48 × 64 pixels : contact gauche, compression, passage, contact droit,
compression et passage opposé. Les pieds et les bras alternent dans les quatre
directions, avec un rebond discret du corps et du sweat.
