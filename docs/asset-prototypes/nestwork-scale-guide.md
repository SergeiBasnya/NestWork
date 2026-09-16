# Guide d'échelle des assets NestWork

La grille logique reste fixée à 32 pixels. **Aurore**, **Milo** et **Leo** sont l'étalon :
leurs frames mesurent 48 × 64 pixels et sont affichées à 75 %, soit une hauteur
maximale de 48 pixels dans le monde.

## Gabarits visuels

| Élément | Encombrement visible cible |
| --- | --- |
| Chaise de bureau | 32 × 44 px maximum |
| Bureau individuel | 64 × 48 px maximum |
| Canapé deux places | 64 × 48 px maximum |
| Meuble haut / cabine | 48–64 × 68–84 px |
| Table collaborative | 96 × 60 px maximum |
| Comptoir d'accueil | 96 × 64 px maximum |
| Petit accessoire | 20–32 × 30–48 px |

Le rectangle de catalogue peut être plus grand que le dessin afin de conserver
des identifiants compatibles, mais le dessin ne doit jamais être agrandi pour
remplir artificiellement tout ce rectangle.

## Règles de production

1. Une case du catalogue contient un seul objet logique.
2. Les composants détachés non intentionnels sont supprimés avant le packing.
3. Les matières de sol sont au minimum en 64 × 64 et leurs bords opposés sont
   identiques.
4. Tous les connecteurs de murs occupent exactement 18 pixels au centre d'un
   bord de 32 pixels.
5. Les anciens assets restent préchargés pour les cartes sauvegardées, mais ne
   sont plus proposés lorsque leur remplacement est disponible.
