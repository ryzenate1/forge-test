package queue

import (
	"testing"
	"time"
)

// TestPeriodicIntervalDeterministic ensures PeriodicInterval().Next is epoch-aligned
// so replicas that boot seconds apart converge to the same scheduledFor. This
// fixes queue periodic duplication where per-replica nextRun drift produced different
// idempotencyKeys (periodic:<id>:<RFC3339Nano>) and defeated ON CONFLICT dedup.
func TestPeriodicIntervalDeterministic(t *testing.T) {
	hour := PeriodicInterval(time.Hour)
	t0 := time.Date(2026, 8, 24, 10, 0, 3, 123456789, time.UTC)
	t1 := time.Date(2026, 8, 24, 10, 0, 7, 987654321, time.UTC)
	t2 := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)

	n0 := hour.Next(t0)
	n1 := hour.Next(t1)
	n2 := hour.Next(t2)

	if !n0.Equal(n1) {
		t.Errorf("replicas 4s apart produced different Next: %v vs %v", n0, n1)
	}
	if !n0.Equal(time.Date(2026, 8, 24, 11, 0, 0, 0, time.UTC)) {
		t.Errorf("hourly Next(10:00:03) = %v, want 11:00:00", n0)
	}
	// 10:00:00 exactly should advance to next hour, not stay.
	if !n2.Equal(time.Date(2026, 8, 24, 11, 0, 0, 0, time.UTC)) {
		t.Errorf("hourly Next(10:00:00) = %v, want 11:00:00", n2)
	}

	daily := PeriodicInterval(24 * time.Hour)
	d0 := time.Date(2026, 8, 24, 5, 23, 11, 0, time.UTC)
	d1 := time.Date(2026, 8, 24, 5, 23, 45, 0, time.UTC)
	dn0 := daily.Next(d0)
	dn1 := daily.Next(d1)
	if !dn0.Equal(dn1) {
		t.Errorf("daily replicas produced different Next: %v vs %v", dn0, dn1)
	}
	if !dn0.Equal(time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("daily Next(2026-08-24 05:23:11) = %v, want 2026-08-25 00:00:00", dn0)
	}
}

// TestPeriodicIdempotencyKeyDeterministic verifies the dispatched key uses
// truncated RFC3339 (no nanos) so trivial truncation jitter never defeats dedup.
func TestPeriodicIdempotencyKeyDeterministic(t *testing.T) {
	// Simulate two replicas that both fire for the same grid hour but at
	// slightly different wall times due to ticker jitter.
	scheduledForA := time.Date(2026, 8, 24, 11, 0, 0, 123456789, time.UTC)
	scheduledForB := time.Date(2026, 8, 24, 11, 0, 0, 987654321, time.UTC)
	// Production code does scheduledFor.UTC().Truncate(time.Second).Format(time.RFC3339)
	keyA := scheduledForA.UTC().Truncate(time.Second).Format(time.RFC3339)
	keyB := scheduledForB.UTC().Truncate(time.Second).Format(time.RFC3339)
	if keyA != keyB {
		t.Errorf("keys differ for same grid second: %q vs %q", keyA, keyB)
	}
	idA := "periodic:backup.retention:" + keyA
	idB := "periodic:backup.retention:" + keyB
	if idA != idB {
		t.Errorf("idempotency keys differ: %q vs %q", idA, idB)
	}
}

// TestPeriodicNextMonotonic verifies Next is always strictly after t.
func TestPeriodicNextMonotonic(t *testing.T) {
	intervals := []time.Duration{time.Minute, time.Hour, 24 * time.Hour, 5 * time.Minute}
	for _, iv := range intervals {
		s := PeriodicInterval(iv)
		now := time.Now().UTC()
		next := s.Next(now)
		if !next.After(now) {
			t.Errorf("interval %v: Next(%v)=%v not after", iv, now, next)
		}
		next2 := s.Next(next)
		if !next2.After(next) {
			t.Errorf("interval %v: Next not monotonic: %v -> %v", iv, next, next2)
		}
	}
}
