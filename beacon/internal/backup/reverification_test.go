package backup_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"gamepanel/beacon/internal/backup"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFlockPreventsConcurrentBackup verifies local.go:90 lockNamespace uses
// cross-process flock on backupRoot/<ns>/.backup.lock (BK-09 fix) rather than
// in-process map. We verify by running concurrent Create operations for the
// same namespace: with correct flock they serialize and both succeed without
// corruption or .partial leaks, and the lock file is created.
func TestFlockPreventsConcurrentBackup(t *testing.T) {
	backupRoot := t.TempDir()
	adapter, err := backup.NewLocalBackup(backupRoot)
	require.NoError(t, err)

	// Prepare a minimal server root with a file to archive.
	base := t.TempDir()
	serverRoot := filepath.Join(base, "srv")
	require.NoError(t, os.MkdirAll(serverRoot, 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(serverRoot, "data.txt"), []byte("flock-test-content"), 0o640))

	ns := "ns-flock-reverify"

	// Run two concurrent backups for same namespace with different names.
	// If flock were in-process only or missing, the two zip creations could
	// interleave or one would clobber the other's .partial.
	var wg sync.WaitGroup
	errs := make([]error, 2)
	names := []string{"a.zip", "b.zip"}
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = adapter.Create(context.Background(), serverRoot, ns, names[idx], nil)
		}(i)
	}
	wg.Wait()
	for i, e := range errs {
		require.NoError(t, e, "concurrent Create %d failed", i)
	}

	// Both archives must exist.
	for _, name := range names {
		p := filepath.Join(backupRoot, ns, name)
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected archive %s to exist: %v", name, err)
		}
		// No .partial must remain.
		if _, err := os.Stat(p + ".partial"); !os.IsNotExist(err) {
			t.Fatalf("partial file leaked for %s", name)
		}
	}

	// Lock file must have been created at backupRoot/<ns>/.backup.lock
	lockPath := filepath.Join(backupRoot, ns, ".backup.lock")
	if _, err := os.Stat(lockPath); err != nil {
		t.Fatalf("lock file not created at %s: %v", lockPath, err)
	}

	// Additional check: concurrent GCPartial + Create for same namespace must
	// not race or delete live data. Run them together.
	wg.Add(2)
	var gcErr, createErr error
	go func() {
		defer wg.Done()
		// Create an orphan partial to give GC something to do while Create holds lock
		orphan := filepath.Join(backupRoot, ns, "orphan-concurrent.zip.partial")
		_ = os.WriteFile(orphan, []byte("orphan"), 0o600)
		_ = os.Chtimes(orphan, time.Now().Add(-48*time.Hour), time.Now().Add(-48*time.Hour))
		_, gcErr = adapter.GCPartial(context.Background(), 24*time.Hour)
	}()
	go func() {
		defer wg.Done()
		_, createErr = adapter.Create(context.Background(), serverRoot, ns, "c.zip", nil)
	}()
	wg.Wait()
	// One or both may succeed; the key is no panic and no invalid state.
	// At least the Create should have succeeded or GC should have succeeded.
	if gcErr != nil && createErr != nil {
		t.Fatalf("both concurrent ops failed: gc=%v create=%v", gcErr, createErr)
	}

	// Verify namespace still valid and list still works
	list, err := adapter.List(ns)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(list), 2, "expected at least 2 backups after concurrent ops")
}

// TestRetention_UnionOR verifies retention.go:60 union OR semantics: a backup
// is kept if ANY active rule keeps it. This converges with the single
// RetentionEngine used in store_backups. We construct backups where each rule
// keeps a distinct backup, and ensure AND semantics would delete them.
func TestRetention_UnionOR(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	_, err = db.Exec(`
        CREATE TABLE backups (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            status TEXT,
            size_bytes INTEGER,
            files INTEGER,
            duration INTEGER,
            adapter TEXT,
            path TEXT,
            error TEXT
        );
    `)
	require.NoError(t, err)

	store := backup.NewSQLiteStore(db)
	now := time.Now()

	// 5 backups at different ages: 1=1h (daily+maxAge), 2=2d (weekly), 3=8d (monthly-weekly boundary), 4=20d (monthly), 5=60d (old)
	backups := []backup.Backup{
		{ID: "1", ServerID: "s1", CompletedAt: now.Add(-1 * time.Hour), Status: backup.BackupStatusCompleted},
		{ID: "2", ServerID: "s1", CompletedAt: now.Add(-48 * time.Hour), Status: backup.BackupStatusCompleted},
		{ID: "3", ServerID: "s1", CompletedAt: now.Add(-8 * 24 * time.Hour), Status: backup.BackupStatusCompleted},
		{ID: "4", ServerID: "s1", CompletedAt: now.Add(-20 * 24 * time.Hour), Status: backup.BackupStatusCompleted},
		{ID: "5", ServerID: "s1", CompletedAt: now.Add(-60 * 24 * time.Hour), Status: backup.BackupStatusCompleted},
	}
	for _, b := range backups {
		require.NoError(t, store.Create(context.Background(), b))
	}

	// Policy where each rule keeps a different backup:
	// MaxBackups=2 keeps 1,2 (newest 2)
	// KeepWeekly=1 keeps the newest in 24h-168h => 2
	// KeepMonthly=1 keeps newest in 168h-720h => 3
	// OR union => 1,2,3 kept. AND would keep only 2.
	policy := backup.RetentionPolicy{
		MaxBackups:  2,
		KeepWeekly:  1,
		KeepMonthly: 1,
	}
	require.NoError(t, policy.Apply(context.Background(), store, "s1"))
	remaining, err := store.List(context.Background(), "s1", 0)
	require.NoError(t, err)
	ids := make(map[string]bool)
	for _, r := range remaining {
		ids[r.ID] = true
	}
	assert.True(t, ids["1"], "1 kept via MaxBackups (OR)")
	assert.True(t, ids["2"], "2 kept via MaxBackups+KeepWeekly (OR)")
	assert.True(t, ids["3"], "3 kept via KeepMonthly (OR) - would be deleted under AND")
	assert.False(t, ids["4"], "4 should be deleted - not kept by any rule")
	assert.False(t, ids["5"], "5 should be deleted - not kept by any rule")

	// Second scenario: MaxAge alone keeps recent, KeepDaily keeps another window
	// Ensure a backup kept ONLY by MaxAge survives even if KeepDaily/MaxBackups wouldn't keep it.
	db2, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db2.Close()
	_, err = db2.Exec(`
        CREATE TABLE backups (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            status TEXT,
            size_bytes INTEGER,
            files INTEGER,
            duration INTEGER,
            adapter TEXT,
            path TEXT,
            error TEXT
        );
    `)
	require.NoError(t, err)
	store2 := backup.NewSQLiteStore(db2)
	// 3 backups: 1=30m (young, kept by MaxAge), 2=2d (kept by KeepWeekly), 3=40d (kept by KeepMonthly if we set KeepMonthly)
	// Actually test that a backup kept by MaxAge but not by count-based rules survives.
	b2 := []backup.Backup{
		{ID: "a", ServerID: "s2", CompletedAt: now.Add(-30 * time.Minute), Status: backup.BackupStatusCompleted},
		{ID: "b", ServerID: "s2", CompletedAt: now.Add(-5 * 24 * time.Hour), Status: backup.BackupStatusCompleted},
		{ID: "c", ServerID: "s2", CompletedAt: now.Add(-40 * 24 * time.Hour), Status: backup.BackupStatusCompleted},
	}
	for _, b := range b2 {
		require.NoError(t, store2.Create(context.Background(), b))
	}
	// MaxAge 2h keeps only "a", KeepMonthly 1 keeps "c" (since c is 40d -> not in monthly? Let's use 20d for monthly)
	// Adjust: use a more precise set
	// Clear and redo with correct ages for this subtest
	_, _ = db2.Exec(`DELETE FROM backups`)
	b3 := []backup.Backup{
		{ID: "a", ServerID: "s2", CompletedAt: now.Add(-30 * time.Minute), Status: backup.BackupStatusCompleted},    // kept by MaxAge 1h
		{ID: "b", ServerID: "s2", CompletedAt: now.Add(-5 * 24 * time.Hour), Status: backup.BackupStatusCompleted},  // kept by KeepWeekly
		{ID: "c", ServerID: "s2", CompletedAt: now.Add(-20 * 24 * time.Hour), Status: backup.BackupStatusCompleted}, // kept by KeepMonthly (168-720h, 20d is 480h <720 so inside monthly)
		{ID: "d", ServerID: "s2", CompletedAt: now.Add(-60 * 24 * time.Hour), Status: backup.BackupStatusCompleted}, // kept by none
	}
	for _, b := range b3 {
		require.NoError(t, store2.Create(context.Background(), b))
	}
	policy2 := backup.RetentionPolicy{
		MaxAge:      1 * time.Hour,
		KeepWeekly:  1,
		KeepMonthly: 1,
	}
	require.NoError(t, policy2.Apply(context.Background(), store2, "s2"))
	remaining2, err := store2.List(context.Background(), "s2", 0)
	require.NoError(t, err)
	ids2 := make(map[string]bool)
	for _, r := range remaining2 {
		ids2[r.ID] = true
	}
	assert.True(t, ids2["a"], "a kept via MaxAge alone (OR)")
	assert.True(t, ids2["b"], "b kept via KeepWeekly")
	assert.True(t, ids2["c"], "c kept via KeepMonthly")
	// d should be deleted unless safety rail keeps it - but safety rail keeps newest which is a, so d can be deleted
	assert.False(t, ids2["d"], "d should be deleted - no rule keeps it")

	// Also verify safety rail: even if policy would delete all, newest is kept
	db3, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db3.Close()
	_, err = db3.Exec(`
        CREATE TABLE backups (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            status TEXT,
            size_bytes INTEGER,
            files INTEGER,
            duration INTEGER,
            adapter TEXT,
            path TEXT,
            error TEXT
        );
    `)
	require.NoError(t, err)
	store3 := backup.NewSQLiteStore(db3)
	require.NoError(t, store3.Create(context.Background(), backup.Backup{ID: "only1", ServerID: "s3", CompletedAt: now.Add(-100 * 24 * time.Hour), Status: backup.BackupStatusCompleted}))
	require.NoError(t, store3.Create(context.Background(), backup.Backup{ID: "only2", ServerID: "s3", CompletedAt: now.Add(-101 * 24 * time.Hour), Status: backup.BackupStatusCompleted}))
	policy3 := backup.RetentionPolicy{MaxAge: 1 * time.Nanosecond} // would delete both without rail
	require.NoError(t, policy3.Apply(context.Background(), store3, "s3"))
	remaining3, _ := store3.List(context.Background(), "s3", 0)
	assert.Len(t, remaining3, 1)
	assert.Equal(t, "only1", remaining3[0].ID, "safety rail must keep newest")
}

// TestGCPartialReapsOrphan verifies local.go GCPartial (BK-08) correctly reaps
// orphan .partial files older than maxAge, acquires flock per namespace, and
// handles edge cases.
func TestGCPartialReapsOrphan(t *testing.T) {
	backupRoot := t.TempDir()
	adapter, err := backup.NewLocalBackup(backupRoot)
	require.NoError(t, err)

	ns := "gc-reverify"
	dir := filepath.Join(backupRoot, ns)
	require.NoError(t, os.MkdirAll(dir, 0o750))

	// Old partial should be reaped
	oldPartial := filepath.Join(dir, "old.zip.partial")
	require.NoError(t, os.WriteFile(oldPartial, []byte("old-partial"), 0o600))
	oldTime := time.Now().Add(-48 * time.Hour)
	require.NoError(t, os.Chtimes(oldPartial, oldTime, oldTime))
	// Its metadata should also be removed
	oldMeta := oldPartial + ".metadata.json"
	require.NoError(t, os.WriteFile(oldMeta, []byte(`{"checksum":"abc","size":1}`), 0o600))

	// Recent partial must be kept
	recentPartial := filepath.Join(dir, "recent.zip.partial")
	require.NoError(t, os.WriteFile(recentPartial, []byte("recent"), 0o600))
	// mtime is now (recent)

	// Regular file (not .partial) must be kept even if old
	regular := filepath.Join(dir, "keep.zip")
	require.NoError(t, os.WriteFile(regular, []byte("keep"), 0o600))
	require.NoError(t, os.Chtimes(regular, oldTime, oldTime))

	// Non-partial metadata must not be touched
	require.NoError(t, os.WriteFile(filepath.Join(dir, "keep.zip.metadata.json"), []byte(`{}`), 0o600))

	// Directory entries must be skipped
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "subdir.zip.partial"), 0o750))

	// Invalid namespace dir should be skipped entirely (GCPartial validates namespace)
	invalidNsDir := filepath.Join(backupRoot, "invalid-ns!")
	require.NoError(t, os.MkdirAll(invalidNsDir, 0o750))
	invalidPartial := filepath.Join(invalidNsDir, "evil.zip.partial")
	require.NoError(t, os.WriteFile(invalidPartial, []byte("evil"), 0o600))
	require.NoError(t, os.Chtimes(invalidPartial, oldTime, oldTime))

	removed, err := adapter.GCPartial(context.Background(), 24*time.Hour)
	require.NoError(t, err)
	assert.Equal(t, 1, removed, "only old partial in valid namespace should be removed")

	if _, err := os.Stat(oldPartial); !os.IsNotExist(err) {
		t.Fatalf("old partial not removed")
	}
	if _, err := os.Stat(oldMeta); !os.IsNotExist(err) {
		t.Fatalf("old partial metadata not removed alongside partial")
	}
	if _, err := os.Stat(recentPartial); err != nil {
		t.Fatalf("recent partial incorrectly removed: %v", err)
	}
	if _, err := os.Stat(regular); err != nil {
		t.Fatalf("regular file incorrectly removed: %v", err)
	}
	if _, err := os.Stat(invalidPartial); err != nil {
		t.Fatalf("invalid namespace partial should be skipped, but was removed: %v", err)
	}

	// Test default maxAge handling (0 => 24h)
	old2 := filepath.Join(dir, "old2.zip.partial")
	require.NoError(t, os.WriteFile(old2, []byte("old2"), 0o600))
	require.NoError(t, os.Chtimes(old2, time.Now().Add(-25*time.Hour), time.Now().Add(-25*time.Hour)))
	removed, err = adapter.GCPartial(context.Background(), 0)
	require.NoError(t, err)
	assert.Equal(t, 1, removed, "default maxAge 0 should behave as 24h")

	// Test context cancellation does not leak
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = adapter.GCPartial(ctx, 24*time.Hour)
	// Should return context error or 0; we just ensure it doesn't panic and handles ctx
	if err != nil {
		assert.ErrorIs(t, err, context.Canceled)
	}

	// Test non-existent backupRoot returns 0 without error
	emptyRoot := filepath.Join(t.TempDir(), "nonexistent-root")
	emptyAdapter, err := backup.NewLocalBackup(emptyRoot)
	require.NoError(t, err)
	// Remove the root to simulate IsNotExist on ReadDir
	require.NoError(t, os.RemoveAll(emptyRoot))
	removed, err = emptyAdapter.GCPartial(context.Background(), 24*time.Hour)
	require.NoError(t, err)
	assert.Equal(t, 0, removed)
}
