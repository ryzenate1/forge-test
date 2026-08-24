-- 217_api_perf_indexes.sql (SQLite dialect - pg_trgm not applicable)
-- Mirrors pg migration 217_api_perf_indexes.sql with SQLite-compatible syntax.
CREATE INDEX IF NOT EXISTS idx_servers_node_created_at ON servers (node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_servers_org_created_at ON servers (org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subusers_user_server ON subusers (user_id, server_id);
CREATE INDEX IF NOT EXISTS idx_subusers_server_user ON subusers (server_id, user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_node_port ON allocations (node_id, port);
CREATE INDEX IF NOT EXISTS idx_allocations_server_port ON allocations (server_id, port) WHERE server_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backups_status_created_at ON backups (status, created_at) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_token_revoked ON user_sessions (user_id, session_token_hash, is_revoked);
CREATE INDEX IF NOT EXISTS idx_audit_events_target_created ON audit_events (target_type, target_id, created_at DESC) WHERE target_id IS NOT NULL;
