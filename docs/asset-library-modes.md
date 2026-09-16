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
