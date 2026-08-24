-- SQLite variant of 212_appstore_upgrade_guards.sql
ALTER TABLE app_store_apps ADD COLUMN cross_version BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE app_store_installs ADD COLUMN ignore_upgrade BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE app_store_installs ADD COLUMN app_ignore_upgrade BOOLEAN NOT NULL DEFAULT 0;
