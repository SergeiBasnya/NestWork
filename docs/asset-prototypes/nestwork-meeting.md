# NestWork — tables de réunion modulaires

Ce lot remplace la table de réunion historique dont les quatre chaises étaient
fusionnées dans le même sprite. Il fournit deux tables seules, utilisables avec
les chaises cardinales de la collection `Assises & café`.

## Contrat de grille

- table horizontale : `4 × 2` cases ;
- table verticale : `2 × 4` cases ;
- aucun siège, accessoire ou décor fusionné ;
- marge transparente sur les quatre côtés ;
- identifiants stables `nw-meeting_table-horizontal_*` et
  `nw-meeting_table-vertical_*`.

## Fichiers

- source générée : `nestwork-meeting-tables-source-v1.png` ;
- planche du jeu :
  `apps/web/public/NestWork/meeting/meeting-tables-v1.png` ;
- reconstruction : `node scripts/pack-nestwork-meeting.mjs`.

La source a été générée avec l'outil Imagegen intégré, en prenant la planche
originale NestWork uniquement comme référence de direction artistique. Aucun
asset LimeZu n'a été utilisé comme calque ou source graphique.
