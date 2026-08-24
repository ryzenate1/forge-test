package eventstore

import (
	"context"
	"os"
	"testing"

	"gamepanel/forge/internal/events"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func tenantTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/forge_test?sslmode=disable"
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Skipf("no test database: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Skipf("db unreachable: %v", err)
	}
	return pool
}

func TestEventStore_TenantColumn_PublishAndRoundTrip(t *testing.T) {
	pool := tenantTestPool(t)
	defer pool.Close()
	// ensure migration
	if err := Migrate(pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	store := New(pool)
	ctx := context.Background()
	tenantID := uuid.NewString()
	env := events.NewEnvelopeWithTenant(events.EventServerCreated, "test", "server", uuid.NewString(), tenantID, map[string]any{"foo": "bar"})
	if err := store.Publish(ctx, env); err != nil {
		t.Fatalf("publish with tenant: %v", err)
	}
	// query raw tenant_id column to verify persisted
	var storedTenant string
	err := pool.QueryRow(ctx, `SELECT COALESCE(tenant_id::text,'') FROM events WHERE id = $1`, env.ID).Scan(&storedTenant)
	if err != nil {
		// column may not exist if migration 211 not yet run via file migrations (eventstore migration adds it)
		t.Fatalf("query tenant_id column: %v", err)
	}
	if storedTenant != tenantID {
		t.Fatalf("tenant_id persisted mismatch: got %q want %q", storedTenant, tenantID)
	}
	// Pending should return tenant
	pending, err := store.Pending(ctx, 10)
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	found := false
	for _, e := range pending {
		if e.ID == env.ID {
			if e.TenantID != tenantID {
				t.Fatalf("pending StoredEvent TenantID mismatch: %q vs %q", e.TenantID, tenantID)
			}
			found = true
		}
	}
	if !found {
		t.Logf("published event not in pending (may be dispatched already); checking ClaimPending")
		claimed, err := store.ClaimPending(ctx, 10, "test-claim", 60*1000000000)
		if err != nil {
			t.Fatalf("claim: %v", err)
		}
		for _, e := range claimed {
			if e.ID == env.ID && e.TenantID != tenantID {
				t.Fatalf("claimed TenantID mismatch: %q", e.TenantID)
			}
		}
	}
	// cleanup
	_, _ = pool.Exec(ctx, `DELETE FROM events WHERE id = $1`, env.ID)
}

func TestEventStore_TenantNull_BackwardsCompatible(t *testing.T) {
	pool := tenantTestPool(t)
	defer pool.Close()
	if err := Migrate(pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	store := New(pool)
	ctx := context.Background()
	env := events.NewEnvelope(events.EventServerCreated, "test", "server", uuid.NewString(), map[string]any{})
	// NewEnvelope without tenant should publish with NULL tenant_id
	if env.TenantID != "" {
		t.Fatalf("expected empty tenant for no payload tenant")
	}
	if err := store.Publish(ctx, env); err != nil {
		t.Fatalf("publish without tenant: %v", err)
	}
	var storedTenant *string
	// may be null
	var nt *string
	err := pool.QueryRow(ctx, `SELECT tenant_id::text FROM events WHERE id = $1`, env.ID).Scan(&nt)
	if err != nil {
		t.Fatalf("query tenant_id: %v", err)
	}
	if nt != nil && *nt != "" {
		t.Fatalf("expected NULL/empty tenant for legacy publish, got %q", *nt)
	}
	_ = storedTenant
	_, _ = pool.Exec(ctx, `DELETE FROM events WHERE id = $1`, env.ID)
}

func TestEventStore_Migration_File_ContainsTenantColumn(t *testing.T) {
	// Verify the additive migration file exists and contains required DDL (tenant column presence test)
	path := "../../migrations/215_tenant_scoping_additive.sql"
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("migration file missing: %v", err)
	}
	content := string(data)
	for _, needle := range []string{
		"ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id",
		"ALTER TABLE placement_decisions ADD COLUMN IF NOT EXISTS tenant_id",
		"ALTER TABLE reconcile_plans ADD COLUMN IF NOT EXISTS tenant_id",
		"idx_events_tenant",
		"idx_placement_decisions_tenant",
		"idx_reconcile_plans_tenant",
	} {
		if !contains(content, needle) {
			t.Fatalf("migration missing expected fragment %q", needle)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
