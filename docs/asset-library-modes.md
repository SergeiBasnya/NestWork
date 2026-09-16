# Bibliothèques d'assets NestWork

NestWork sépare les assets originaux distribuables du pack commercial privé.
Le mode par défaut est volontairement sûr pour un dépôt open source : seuls les
sprites créés pour NestWork sont proposés et chargés par le navigateur.

## Mode open source (défaut)

Aucune variable n'est nécessaire. Le décorateur expose uniquement les familles
`NestWork · Sols`, `NestWork · Murs`, `NestWork · Mobilier` et
`NestWork · Extérieur`. Le sélecteur d'avatar n'affiche que les personnages
originaux. Les réactions utilisent les icônes originales rangées dans
`public/NestWork/emotes/`.

Tous les espaces peuvent aussi constituer leur propre bibliothèque privée depuis
le décorateur. Un propriétaire ou administrateur peut importer :

- ses propres objets PNG/WebP, automatiquement alignés sur la grille de 32 px ;
- ses propres spritesheets PNG/WebP déjà alignées sur une grille de 32 px ;
- les spritesheets Modern Interiors qu'il a lui-même achetées.

Ces fichiers sont stockés en base, accessibles uniquement aux membres
authentifiés de l'espace et ne sont jamais copiés dans Git ou dans l'export
public. Les cartes publiques ne peuvent pas être publiées tant qu'elles
référencent un asset privé. Les limites par défaut sont de 2,6 Mo par fichier,
100 assets et 50 Mo par espace.

L'option Modern Interiors affiche un lien vers la page officielle d'achat et
demande une attestation de licence. NestWork ne vend pas le pack, ne vérifie pas
la transaction et ne transfère aucun droit : chaque utilisateur reste
responsable du respect de la licence obtenue auprès de l'auteur.

## Mode privé complet

Une installation qui possède légalement le pack commercial peut définir cette
variable au moment du build web :

```dotenv
NEXT_PUBLIC_ASSET_LIBRARY=full
```

Le décorateur réactive alors les collections commerciales, les objets animés et
les anciens personnages. Les identifiants de catalogue historiques restent
connus dans les deux modes afin de ne pas modifier les données sauvegardées.

Les fichiers commerciaux ne doivent pas être publiés dans le dépôt open source.
Ils restent dans leurs chemins privés existants (`public/Modern`,
`public/Characters` hors `original`, `public/AnimObjects` et `public/Emotes`)
uniquement pour le déploiement complet. Le script `pnpm public:export` les retire
automatiquement et `pnpm public:check` vérifie aussi leurs empreintes afin de
détecter une copie renommée.

Ce mode historique est indépendant des imports privés. Il permet à l'exploitant
d'une instance de préinstaller localement un catalogue commercial complet au
moment du build, tandis que les imports privés sont ajoutés espace par espace à
l'exécution.
