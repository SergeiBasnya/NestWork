# Self-hosting NestWork

NestWork has three runtime parts: the Next.js web application, the Express and
Socket.IO server, and PostgreSQL. Use Node.js 22 and pnpm 11 for both builds.

Self-hosting means deploying these services to Internet-accessible hosting. A
localhost or LAN installation is useful for development and testing, but it is
not a production NestWork workspace: remote members must be able to reach the
web application and the real-time server through public HTTPS/WSS endpoints.

Docker is not required in production. Use a managed PostgreSQL service and
deploy the web and server applications to providers that support their runtime
requirements. In particular, the stateful Socket.IO server must run on a host
that supports persistent WebSocket connections.

## Required configuration

Server variables:

- `DATABASE_URL`: PostgreSQL connection string;
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: distinct random secrets of at least 32
  characters;
- `CLIENT_ORIGIN`: exact HTTPS web origins, comma-separated;
- `REFRESH_COOKIE_SAME_SITE`: `lax` when the web app and API share the same
  registrable domain, or `none` when they are hosted on different sites;
- `NODE_ENV=production`;
- optional Cloudflare TURN credentials for reliable WebRTC behind strict NATs.

Web build variables:

- `NEXT_PUBLIC_API_URL`: public HTTPS server URL;
- optional `NEXT_PUBLIC_WS_URL`: separate Socket.IO URL;
- `NEXT_PUBLIC_ASSET_LIBRARY=original` for the public distribution.

Never commit production values. `NEXT_PUBLIC_*` values are embedded at build
time, so rebuild the web application after changing them.
Production builds intentionally fail when `NEXT_PUBLIC_API_URL` is missing,
invalid or insecure, instead of creating an online frontend that targets
localhost.

Workspace owners and administrators can upload private PNG/WebP decorator
assets. They are stored in PostgreSQL, served only through authenticated API
routes and count toward the database backup. Plan storage for the default quota
of 50 MB per workspace. Modern Interiors files must be supplied by a user who
has purchased and accepted the third-party license; they are never bundled by
NestWork.

## Deployment order

1. Provision PostgreSQL and a tested backup/restore procedure.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Apply additive migrations with
   `pnpm --filter @nestwork/server db:deploy`.
4. Build with `pnpm build`.
5. Start the API with `node apps/server/dist/index.js`; verify `/health` for
   process liveness and `/ready` for database-backed readiness.
6. Deploy the built Next.js application.
7. Create initial accounts with the seed only when its explicit credentials are
   safe for the target environment. Production seeding additionally requires
   `ALLOW_PRODUCTION_SEED=true`.

The production deployment is ready only when teammates outside the operator's
local network can load the web URL, authenticate and establish a Socket.IO
connection over WSS.

Serve both applications over HTTPS. Hosting the web and API under the same
registrable domain is recommended for predictable cookie behaviour. Restrict
`CLIENT_ORIGIN` to the exact frontend origins.

If the two applications use different registrable domains, set
`REFRESH_COOKIE_SAME_SITE=none`; secure cookies are already enforced in
production. Without this setting, browsers will not send the refresh cookie on
cross-site API requests.

## Media reliability

STUN-only WebRTC can fail on strict company networks, carrier NAT or some mobile
connections. Configure TURN before promising reliable calls to external teams.

## Upgrades and rollback

Use expand/contract database migrations: add new structures first, deploy code
that tolerates both schemas, backfill, then remove obsolete structures in a
later release. A code rollback does not roll back PostgreSQL.

Before each upgrade, record the currently deployed commit, verify a recent
database backup and define the operator responsible for post-deployment checks.
