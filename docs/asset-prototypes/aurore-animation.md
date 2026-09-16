# Aurore — animations intégrées

Personnage original NestWork : cheveux orange en chignon, silhouette arrondie,
petit corps, veste bleue, tee-shirt blanc, pantalon bleu-gris, peau pêche.
La direction visuelle reprend le côté accueillant des villageois d'Animal Crossing
avec un rendu 2D pixel art et sans dominante jaune.

## Essayer

Avec le serveur web local lancé, ouvrir `/previews/aurore.html` : les huit boucles
utilisent les fichiers réellement chargés par le jeu. Déplacement au clic ou au
clavier, pause, fonds clair/sombre et comparaison d'échelle avec Adam.

Dans l'application : menu du profil → **Ton avatar** → **Aurore**.
Les comptes sans choix explicite utilisent désormais Aurore ; les choix déjà
enregistrés restent disponibles.

## Format

- `apps/web/public/Characters/original/Aurore_walk.png`
- `apps/web/public/Characters/original/Aurore_idle.png`
- PNG RGBA, 1152 × 64 pixels, 24 images horizontales de 48 × 64 pixels.
- Images 0–5 : droite ; 6–11 : dos ; 12–17 : gauche ; 18–23 : face.
- Marche : 10 images/s. Repos : 1200, 180, 180, 180, 100 et 360 ms.
- Pieds alignés au bas de chaque cellule. Marge transparente en haut et sur les côtés.
- Échelle Phaser : 0,75 ; cellule affichée à 36 × 48 pixels dans le monde.

La planche `aurore-runtime-sheet.png` regroupe exactement ces images en huit
lignes pour inspection. Le sélecteur, les joueurs locaux/distants et le marqueur
de déplacement utilisent les dimensions déclarées dans `characterSpriteSpec`.

## Fabrication

Dessin réalisé avec l'outil intégré **imagegen** à partir de
`aurore-turnaround-reference-v3-neutral.png`. Les planches générées sont conservées
dans `aurore-animation-source.png` et `aurore-walk-source.png`.
Le script `node scripts/pack-aurore.mjs` assure uniquement le découpage,
la suppression du blanc extérieur, la mise à l'échelle et l'alignement des pieds.
Il préserve le blanc enfermé dans les contours du tee-shirt. Il utilise Sharp,
déjà installé avec Next.js, sans nouveau générateur de dessins géométriques.

### Brief transmis à imagegen

Conserver l'identité de la référence : tête ronde, chignon orange, petit corps,
veste marine, tee-shirt blanc neutre, pantalon bleu-gris, peau pêche, chaussures
anthracite. Pixel art net, palette contrôlée, sans filtre jaune ni texture papier.

Première génération : grille de six colonnes et huit lignes. Quatre lignes de
marche dans l'ordre droite/dos/gauche/face, puis quatre lignes de repos dans le
même ordre. Six poses par direction. Repos avec pieds plantés, respiration
discrète et clignement en cinquième image. Fond transparent demandé, blanc pur
si impossible ; aucun faux damier, texte, quadrillage ou ombre portée.

Seconde génération ciblée : refaire les quatre lignes de marche (six colonnes,
24 poses) avec de vrais appuis alternés. Cycle demandé : contact pied gauche,
descente, passage du pied droit, contact pied droit, descente, passage du pied
gauche ; bras opposés, tête stable, tous les personnages complets. Conserver
strictement l'identité et la palette, sans clignement volontaire pendant la marche.

Ces images sont des créations assistées par génération d'images, distinctes du
pack LimeZu ; voir `CREDITS.md`. Cette intégration ne remplace pas les autres
personnages et décors sous licence présents dans le projet.

### Correction du chignon en profil gauche

Retouche ciblée via imagegen, conservée dans `aurore-bun-correction-source.png`.
Prompt : déplacer uniquement le chignon des six poses de la septième ligne vers
le haut arrière du crâne (à droite de l'image puisque le visage regarde à gauche),
comme dans les poses de marche. Supprimer l'ancienne attache au-dessus du front,
conserver les expressions, le clignement, la tenue et les proportions.
Le découpage reprend seulement ces six poses ; les 42 autres images restent
issues des sources précédentes.
