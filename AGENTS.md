# Forge — agent working notes

Forge is a control plane for deploying and operating workloads across
distributed infrastructure. Forge decides what should happen; **Beacon**, the
per-host agent, makes it happen on a machine.

## Layout

| Path | What it is |
| --- | --- |
| `forge/api` | Go control-plane API (Fiber v2). The authority for state, auth and orchestration. |
| `beacon` | Go per-host agent. Runs workloads, reports health, exposes host inspection. |
| `forge/web` | Next.js 15 App Router dashboard (`@forge/web`). The product UI. |
| `web` | Separate Next.js documentation site (`forge-documentation`). Not part of the app. |
| `packages/*` | npm workspace packages: `shared-types`, `sdk`, `ui`, `game-templates`. |
| `forge/api/migrations` | SQL migrations, applied by `Store.RunMigrations`. |
| `.reference-repos/` | Gitignored read-only study checkouts. Never built, imported or shipped. |

`go.work` spans `./beacon` and `./forge/api`. npm workspaces span `forge/web`
and `packages/*` — note `web/` is **not** a workspace member.

## Commands

```bash
# Everything
make build            # go build both modules + next build
make test             # go test -race both modules + vitest
make lint             # scripts/dev/lint.sh
make format           # scripts/dev/format.sh

# Go, per module
cd forge/api && go build ./... && go vet ./...
cd beacon    && go build ./... && go vet ./...
golangci-lint run     # config in .golangci.yml

# Frontend, from forge/web
npx tsc --noEmit      # typecheck
npx eslint .          # lint
npx vitest run        # unit tests
npx playwright test   # e2e (spins up its own mock API on :8080)
```

## Running a dev stack

`./native.sh start|stop|restart|status|logs` is the macOS runner: Postgres and
Redis as Homebrew services, Beacon as a launchd user agent, API and web as
background processes. Logs land in `.dev-logs/`, pids in `.dev-pids/`, state in
`.dev-data/`. `scripts/dev/start-dev.sh` is the container-based equivalent.

Docker on this machine is Colima (`~/.colima/default/docker.sock`). If Colima is
stopped, Beacon runs but cannot start containers — API and UI still work against
seeded Postgres data, so HTTP and UI paths remain verifiable while container
lifecycle does not.

Ports: API `8080`, web `3000`, Beacon `9090`, Postgres `5432`, Redis `6379`.

## Conventions that are actually in use

**Backend**

- Layering is `handlers (internal/http/handlers_*.go) → services
  (internal/services/<pkg>) → store (internal/store)`. Handlers receive a
  `Config` struct holding every service pointer.
- Most routes are registered by `register*Routes(...)` calls inside `NewServer`.
  A smaller plugin-style hook exists: `RegisterPhaseRegistrar(name, priority, fn)`
  in `internal/http/phase_registry.go`, invoked from `registerPhaseHooks`.
  A registrar only runs if some file calls `RegisterPhaseRegistrar` in an
  `init()` — defining the function is not enough.
- Auth is `authMiddleware` in `internal/http/auth.go`; session cookie is
  `__Host-forge_session`. Authorization has three layers: admin scopes
  (`requireAdminScope`), per-server RBAC (`requireServerPermission`), and org
  tenancy. Beacon talks back over `/api/remote` with node credentials, not user
  sessions.
- Panel → Beacon is **HTTP** via `internal/daemon.Client`. WebSockets carry
  console/stats/log streams only, never commands.

**Frontend**

- One HTTP primitive: `requestJSON` / `fetchJSON` in `lib/api/http.ts`. Domain
  modules live in `lib/api/*` and are re-exported through `lib/api.ts`. Do not
  add a second client.
- Server state is `@tanstack/react-query`. Bare `fetch` belongs in `lib/api/*`,
  not in components.
- UI primitives are hand-rolled in `components/ui/`. There is **no** Radix or
  shadcn dependency — extend what exists rather than introducing a second
  primitive set.
- Admin navigation is data-driven from `components/admin/admin-registry.ts`.
  Add a page there, not by hand-editing the sidebar.
- Fonts are Manrope (UI) and JetBrains Mono (technical values), self-hosted via
  `next/font` in `app/fonts.ts`.
- Design tokens are CSS variables in `app/globals.css`. Use `var(--token)`,
  never a raw hex.

## Pitfalls

- **Migrations**: numbered `NNN_description.sql`, applied in filename sort
  order. New files need a unique prefix — use a letter suffix (`221_a_...`) if
  the number is taken. Historical duplicate bare prefixes (`015 018 020 044 054
  057 080 082 083 087`) are grandfathered in `validateNoDuplicatePrefixes`;
  never rename an already-applied migration, its name is a primary key in
  `schema_migrations`.
- **`go vet ./...` in `forge/api` reports failures in test files** that
  reference symbols production code no longer exports. Production packages
  build clean. Check whether a failure is test drift before assuming a
  regression.
- **Never report success for work not performed.** A step that cannot do its
  job must return an error, not `nil`. Unknown is not zero, not-reported is not
  zero, and a stale reading is not a healthy one — this holds in the API, in
  Beacon and in the UI.
- **Never resolve an ambiguous target silently.** If a request omits the node it
  refers to, reject it; do not pick the first one that happens to have
  credentials.
- `.reference-repos/` holds third-party code under mixed licenses, several
  AGPL. Study concepts, re-implement in Forge's own code. Never copy source.
