# NestWork Starter Office — mobilier original

Première bibliothèque de mobilier entièrement originale destinée à l'édition
open source de NestWork. Elle contient 16 objets couvrant les besoins essentiels
d'un bureau : postes individuels et doubles, assises, réunion, rangement, café,
plantes, impression, éclairage et tri.

## Fichiers

- Source : `nestwork-office-starter-source-v1.png`
- Source isolée normalisée du lampadaire : `nestwork-floor-lamp-source-v4.png`
- Planche utilisée par le jeu :
  `apps/web/public/NestWork/office/starter-office-v2.png`
- Script reproductible : `node scripts/pack-nestwork-office.mjs`

La planche finale est un PNG RGBA transparent de 384 × 320 pixels, soit une
grille de 12 × 10 tuiles de 32 pixels. Chaque objet possède un rectangle nommé
dans `apps/web/game/nestworkOffice.ts`. La chaise de bureau, le fauteuil diagonal
et l'ensemble table-chaises restent enregistrés pour les anciennes cartes, mais
sont remplacés dans le décorateur par le pack cardinal décrit dans
`nestwork-seating.md`.

## Direction artistique

Pixel art net et chaleureux, perspective orthographique trois-quarts, contours
anthracite et palette crème, bleu sourd, vert sauge. L'orange miel reste un
accent ponctuel afin d'éviter une dominante jaune artificielle.

La génération a pris pour référence uniquement une planche conceptuelle créée
précédemment pour NestWork. Aucun spritesheet LimeZu n'a été utilisé comme calque
ou source graphique.

La grande plante est détourée avec une marge supérieure conservant toute sa
couronne. Le lampadaire utilise une source isolée afin que son abat-jour et son
pied restent complets dans la cellule du builder.

Les nouvelles sources isolées sont produites sur fond technique magenta, puis
converties une seule fois en PNG RGBA avec
`scripts/normalize-nestwork-sprite-source.mjs`. Le packer refuse une source sans
marge alpha suffisante au lieu de tenter de corriger silencieusement une coupe.
