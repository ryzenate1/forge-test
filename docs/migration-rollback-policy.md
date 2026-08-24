# Migration Rollback Policy — Phase 10

**Status:** Forward-only is canonical. Rollbacks are best-effort and incomplete.

## Finding

- Ups: 197 migrations (`001_init.sql` … `210_servers_created_at_index.sql`)
- Downs: 14 rollbacks in `forge/api/migrations/rollbacks/` (only for selected batches, e.g. `104`, `127`, `138`, `139`, `140`, `170-172`, `202-207`)
- Coverage: ~7% — `migrate down` cannot reconstruct the full history and was never the vetted production path.

Historical rollbacks were added ad-hoc for Batch 2 and a few risky DDLs. The majority of migrations are deliberately `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` and are idempotent forward, but their down files would require destructive `DROP TABLE/COLUMN` with data loss and have not been maintained.

## Decision: Forward-only + Backup/Restore

**Migrations are forward-only.** Operators must not rely on `rollback/*.down.sql` for production downgrade.

**Canonical recovery is backup/restore** as documented in `docs/upgrading.md:6`:

1. **Pre-upgrade backup (mandatory):** `infra/postgres-backup.sh` (nightly) + manual `pg_dump --format=custom --no-owner --no-acl` captured by `UpgradeService.createBackup` (`forge/api/internal/services/upgrade/service.go:418 backupDatabase:455`). Verify `database.dump` non-empty, `chmod 600`, off-host copy to S3 (`$S3_BACKUP_BUCKET`).
2. **Upgrade:** `docker compose pull && up -d api` — API startup runs `Store.RunMigrations` (`forge/api/internal/store/store.go:1191 runMigrations` with `pg_advisory_lock` `0x466F7267656D6967`) and `eventstore.Migrate` within a 10-minute context. Rerun-safe (applied rows keyed by full filename in `schema_migrations`).
3. **Verify:** `curl /api/v1/health/ready | jq .details.migrationCount` and `SELECT count(*) FROM schema_migrations` match expected number; run `scripts/test/validate_migrations.sh` (duplicate-prefix, order, FK checks).
4. **Rollback on failure:** **Restore from backup**, not `migrate down`:
   - In-app: `UpgradeService.rollbackUpgrade:488 restoreFromBackup:514` → `pg_restore --clean --if-exists --no-owner --no-acl --dbname $PGDATABASE $dump`
   - Manual: §6.2 in `docs/upgrading.md` — stop `api/daemon/web`, `docker compose cp $BACKUP_DIR/database.dump postgres:/tmp/restore.dump && pg_restore ...`, revert `TAG` in `infra/.env`, `up -d`.

Beacon's embedded SQLite migrations (`beacon/internal/server/...`) are likewise forward-only; downgrade requires restoring `beacon.db` from the same backup window.

## Why rollbacks are not extended

- **Data loss:** Many migrations add columns with backfillable data, encrypt secrets, or create new tables. Down would drop data irreversibly.
- **Orphan history:** `schema_migrations` filenames are immutable once shipped (see `store/migration.go:261 validateNoDuplicatePrefixes`). Renaming or adding down files retroactively breaks production histories.
- **Operational reality:** No production rollback has used `rollback/*.down.sql`; all documented recoveries use `pg_restore` (see `docs/upgrading.md` §6 and `infra/compose.yml` backup service).

The 14 existing down files are retained for local dev convenience (e.g., `go test -tags integration` can `Rollback` a single batch in a disposable DB) but are not a supported production downgrade path.

## CI Guards

- **Static:** `scripts/test/validate_migrations.sh` — duplicate-prefix, ordering, FK, Batch 2 entity checks; wired in `.github/workflows/ci.yml:migrations` (static validation + `psql -f` fresh apply).
- **Fresh + Upgrade integration:** `forge/api/internal/store/migration_comprehensive_test.go:23 TestComprehensiveMigrationValidation` (fresh install, Batch 1→Batch 2 upgrade with data survival) and `migration_duplicate_test.go`, `migration_runner_unified_test.go` (idempotent, duplicate-prefix). Wired in `.github/workflows/ci.yml:forge-api-integration` (`go test -tags integration`).
- **Advisory lock:** `store.go:35 acquireMigrationLock` serializes migrations across horizontally scaled API instances; `pg_advisory_xact_lock` for setup wizard (`store_setup.go:11 setupAdvisoryLockID`).

## References

- Runner: `forge/api/internal/store/store.go:1191 RunMigrations`, `forge/api/internal/store/migration.go:24 MigrationRunner.Run`
- Rollback stub: `forge/api/internal/store/store.go:1268 Rollback` (requires down file; fails closed if missing)
- Upgrading guide: `docs/upgrading.md:245 6.Rollback`
- Backup service: `infra/postgres-backup.sh`, `infra/compose.yml:137 postgres-backup`
- Migration 210 (Phase 10): `forge/api/migrations/210_servers_created_at_index.sql` (hot-path `servers.created_at DESC` index)
