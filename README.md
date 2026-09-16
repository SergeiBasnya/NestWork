# NestWork

[English](#english) · [Français](#français)

## English

NestWork is an open-source 2D virtual office for small remote and hybrid teams.
People move through a shared space, see who is available, and start talking by
walking up to a teammate.

### Current features

- real-time multiplayer 2D workspace;
- proximity-based audio and video conversations;
- screen sharing and microphone/camera controls;
- persistent channels, direct messages and reactions;
- map editor for floors, walls, furniture and collisions;
- free original asset library, custom imports and optional Modern Interiors compatibility;
- workspace and member management;
- original, grid-native NestWork visual library.

### Stack

Next.js, React, Phaser, Node.js, Express, Socket.IO, PostgreSQL, Prisma and
WebRTC.

### Local development

Requirements: Node.js 22 and pnpm 11. Docker is optional and only provides a
convenient development PostgreSQL instance.

```bash
pnpm install
pnpm setup
pnpm dev
```

`pnpm setup` creates local environment files without overwriting existing ones,
starts a development PostgreSQL instance through Docker, applies migrations and
seeds two development accounts. The account emails and local-only passwords are
in `apps/server/.env`.

If PostgreSQL is already running, use `pnpm setup -- --skip-docker`. To create
only the environment files, use `pnpm setup -- --env-only`.

The web application runs on <http://localhost:3000> and the API health check on
<http://localhost:4000/health>.

Localhost is a development environment, not the intended way to use NestWork.
A real collaborative workspace must be deployed on the Internet with a public
HTTPS web URL, a public HTTPS/WSS API, PostgreSQL and TURN for reliable calls.
See [`SELF_HOSTING.md`](SELF_HOSTING.md).

### Open-source and asset separation

The NestWork code is licensed under **AGPL-3.0-only**. Original NestWork visual
assets are licensed separately under **CC BY 4.0**; see
[`LICENSE-ASSETS.md`](LICENSE-ASSETS.md).

The repository-safe default uses only original assets. A private deployment
that separately owns Modern Interiors may enable its local commercial library
with `NEXT_PUBLIC_ASSET_LIBRARY=full`. Those files are never part of the public
export. See [`docs/asset-library-modes.md`](docs/asset-library-modes.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The release procedure is documented in
[`docs/public-release.md`](docs/public-release.md).
Deployment requirements are documented in [`SELF_HOSTING.md`](SELF_HOSTING.md).

### Contributing and security

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting code or visual
assets. Report vulnerabilities privately as described in
[`SECURITY.md`](SECURITY.md).

NestWork is developed by **Sébastien Lafontaine**.

---

## Français

NestWork est un bureau virtuel 2D open source pensé pour les petites équipes à
distance ou en hybride. Les membres se déplacent dans un espace commun, voient
qui est disponible et démarrent une conversation en rapprochant leurs avatars.

### Fonctionnalités actuelles

- espace de travail 2D multijoueur en temps réel ;
- conversations audio et vidéo déclenchées par la proximité ;
- partage d’écran et contrôles micro/caméra ;
- canaux persistants, messages privés et réactions ;
- décorateur avec sols, murs, mobilier et collisions ;
- bibliothèque originale gratuite, imports personnalisés et compatibilité Modern Interiors optionnelle ;
- gestion des membres et des espaces ;
- bibliothèque visuelle NestWork originale adaptée à la grille.

### Stack

Next.js, React, Phaser, Node.js, Express, Socket.IO, PostgreSQL, Prisma et
WebRTC.

### Développement local

Prérequis : Node.js 22 et pnpm 11. Docker est facultatif et sert uniquement à
fournir facilement une base PostgreSQL de développement.

```bash
pnpm install
pnpm setup
pnpm dev
```

`pnpm setup` crée les fichiers d’environnement locaux sans écraser ceux qui
existent, démarre une base PostgreSQL de développement avec Docker, applique
les migrations et crée deux comptes de développement. Leurs adresses et mots
de passe locaux se trouvent ensuite dans `apps/server/.env`.

Si PostgreSQL tourne déjà, utilise `pnpm setup -- --skip-docker`. Pour créer
uniquement les fichiers d’environnement : `pnpm setup -- --env-only`.

L’application web démarre sur <http://localhost:3000> et l’API expose son état
sur <http://localhost:4000/health>.

Le mode local sert au développement, pas à l’utilisation normale de NestWork.
Un véritable espace collaboratif doit être déployé sur Internet avec une URL
web publique en HTTPS, une API publique en HTTPS/WSS, PostgreSQL et un serveur
TURN pour fiabiliser les appels. Voir [`SELF_HOSTING.md`](SELF_HOSTING.md).

### Open source et séparation des assets

Le code NestWork est placé sous **AGPL-3.0-only**. Les créations visuelles
originales NestWork utilisent séparément la licence **CC BY 4.0** ; voir
[`LICENSE-ASSETS.md`](LICENSE-ASSETS.md).

Le mode sûr par défaut ne charge que les assets originaux. Un déploiement privé
possédant séparément Modern Interiors peut activer sa bibliothèque locale avec
`NEXT_PUBLIC_ASSET_LIBRARY=full`. Ces fichiers ne sont jamais inclus dans
l’export public. Les propriétaires et administrateurs peuvent aussi importer
des créations PNG/WebP ou leurs propres fichiers Modern Interiors dans la
bibliothèque privée d'un espace ; ils restent authentifiés, stockés en base et
exclus des cartes publiques. Voir
[`docs/asset-library-modes.md`](docs/asset-library-modes.md)
et [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

En pratique, chacun peut choisir entre la bibliothèque NestWork originale,
gratuite et incluse, ou le catalogue Modern Interiors de LimeZu après avoir
acheté séparément le pack et accepté sa licence.

La procédure de publication se trouve dans
[`docs/public-release.md`](docs/public-release.md).
Les exigences de déploiement sont détaillées dans
[`SELF_HOSTING.md`](SELF_HOSTING.md).

### Contributions et sécurité

Lis [`CONTRIBUTING.md`](CONTRIBUTING.md) avant de proposer du code ou un asset.
Les vulnérabilités doivent être signalées en privé selon
[`SECURITY.md`](SECURITY.md).

NestWork est développé par **Sébastien Lafontaine**.
