# Contributing to NestWork

Thank you for helping improve NestWork.

## Development setup

1. Install Node.js 22, pnpm 11 and Docker.
2. Run `pnpm install`.
3. Run `pnpm setup`.
4. Start both applications with `pnpm dev`.

Before opening a pull request, run:

```bash
pnpm lint
pnpm build
pnpm --filter @nestwork/server test
pnpm --filter @nestwork/web test
pnpm public:check
```

## Assets

Only submit visual assets that you created yourself or that can legally be
distributed under `LICENSE-ASSETS.md`. Include the source, author, license and
creation method in the pull request. Do not submit Modern Interiors files,
modified copies of those files, or other assets with unclear provenance.
Update `docs/asset-provenance.md` with every accepted visual contribution.

By submitting a contribution, you agree that code contributions are provided
under AGPL-3.0-only and original visual-asset contributions under CC BY 4.0,
unless the contribution explicitly states another compatible license.
