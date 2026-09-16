# Public release runbook

This runbook creates the open-source repository without rewriting or exposing
the history of the private repository.

## 1. Freeze and verify the private source

```bash
pnpm lint
pnpm build
pnpm --filter @nestwork/server test
pnpm --filter @nestwork/web test
pnpm public:check
```

Create a private backup tag only after reviewing the current changes.

## 2. Export outside the private repository

Use an empty destination outside this checkout:

```bash
pnpm public:export -- ../NestWork-public
pnpm public:check -- ../NestWork-public
```

The exporter excludes local environment files, Git history and every raw file
from the optional Modern Interiors library. Never copy `.git` into the public
directory.

## 3. Test the exact public tree

From the exported directory:

```bash
pnpm install --frozen-lockfile
pnpm setup -- --env-only
pnpm dev
```

Point `DATABASE_URL` to a disposable PostgreSQL database before applying the
migrations and starting the applications. Docker may be used for this test, but
it is not part of the production architecture.

Verify two-account login, movement, proximity media, messaging, map editing,
persistence after reload and a browser console without missing assets.

Then validate the intended online deployment from two separate Internet
connections. Confirm HTTPS, WSS, authentication and a proximity call; a LAN-only
test is not sufficient for a collaborative release.

The public API must return `200` on `/health` and `/ready`. The second endpoint
also proves that the deployed server can reach PostgreSQL.

## 4. Create the public history

After the exact export passes review:

```bash
git init -b main
git add .
git commit -m "feat: publish NestWork v0.1.0"
```

Before adding a remote, inspect the staged file list and confirm that these
commands return no commercial asset:

```bash
git ls-files | rg 'public/(Modern|AnimObjects|Emotes)|public/Characters/(named/|[^/]+\\.png)'
git rev-list --objects --all | rg 'public/(Modern|AnimObjects|Emotes)|public/Characters/(named/|[^/]+\\.png)'
```

Both commands must produce no output.

## 5. Release gate

The release remains `NO-GO` while any of the following is true:

- a commercial raw asset exists in the public tree or history;
- the exact public export has not passed CI and fresh-clone testing;
- an original asset has unclear provenance or is missing from
  `docs/asset-provenance.md`;
- the production web or real-time server is only reachable from a local network;
- the deployment does not expose a working link to the corresponding source;
- rollback ownership and the post-release monitoring window are undefined.

Publish the repository and tag `v0.1.0` only after every item is closed. This
runbook does not authorize a production deployment or a force-push.
