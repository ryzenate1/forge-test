# web/ — Legacy Documentation Site (NOT the main panel)

**This directory is NOT the active frontend.** It contains a standalone Next.js documentation site (`forge-documentation`) that is NOT part of the main workspace.

- **Active frontend:** `forge/web/` — `@forge/web` (Next.js 15, included in root `package.json` workspaces `["forge/web", "packages/*"]`)
- **This directory:** `web/` — `forge-documentation` (Next.js 15, standalone, not built by `npm run build` or `npm run typecheck`)

## Why two directories?

- `web/` was the original Pterodactyl-style docs site; it remains for historical reference and is NOT deployed by `infra/compose.yml` (which serves `forge/web`)
- `forge/web/` is the production control plane UI (530 TS/TSX files, 297 migrations wired)

## What to do

- **If you are working on the panel UI:** edit `forge/web/` only
- **If you are working on docs:** edit `web/` and run `npm --workspace forge-documentation run dev` from `web/` directory
- **Do not import** `forge/web` components into `web/` or vice versa — they have separate `node_modules` and configs

## Recommendation (see Forge review HIGH 7)

This split is intentional but confusing. Long-term, either:
1. Move `web/` to `docs/site/` and update `web/package.json` name, or
2. Archive `web/` if documentation is now in `docs/` + `forge/web` help panels

Do NOT delete `web/` without migrating its docs content to `docs/`.

---
*Added as fix for Forge review HIGH 7 — Duplicate Code Between web/ and forge/web/*
