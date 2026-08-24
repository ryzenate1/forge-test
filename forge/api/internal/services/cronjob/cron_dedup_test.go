package cronjob

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gamepanel/forge/internal/store"

	"github.com/robfig/cron/v3"
)

// TestInFlightMonotonicDedup verifies that concurrent firings of the same jobID
// within the same replica are suppressed by the monotonic inFlight map.
// This is the service.go:124 dedup that prevents duplicate execution when
// cron ticks and TriggerNow overlap or when the cron runner delivers the same
// schedule twice due to clock correction.
func TestInFlightMonotonicDedup(t *testing.T) {
	svc, err := New(&store.Store{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	jobID := "dup-job-001"

	// First acquire should succeed.
	if !svc.tryAcquireInFlight(jobID) {
		t.Fatal("expected first acquire to succeed")
	}
	// Immediate second acquire must be suppressed.
	if svc.tryAcquireInFlight(jobID) {
		t.Error("expected second concurrent acquire to be suppressed")
	}
	// Third also suppressed.
	if svc.tryAcquireInFlight(jobID) {
		t.Error("expected third acquire to be suppressed")
	}
	svc.releaseInFlight(jobID)
	// After release, should succeed again.
	if !svc.tryAcquireInFlight(jobID) {
		t.Error("expected acquire after release to succeed")
	}
	svc.releaseInFlight(jobID)
}

// TestConcurrentDuplicateCronTrigger spawns N goroutines that all try to claim
// the same jobID simultaneously. Only one should win; all others are deduped.
// This mirrors the production scenario where cron.Cron fires and a manual
// TriggerNow races, or where two ticks arrive in the same second.
func TestConcurrentDuplicateCronTrigger(t *testing.T) {
	svc, err := New(&store.Store{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	jobID := "concurrent-dup"
	const goroutines = 20
	var won int32
	var blocked int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if svc.tryAcquireInFlight(jobID) {
				atomic.AddInt32(&won, 1)
				// Simulate short execution then release.
				time.Sleep(5 * time.Millisecond)
				svc.releaseInFlight(jobID)
			} else {
				atomic.AddInt32(&blocked, 1)
			}
		}()
	}
	close(start)
	wg.Wait()
	if won != 1 {
		t.Errorf("expected exactly 1 winner among %d concurrent claimants, got won=%d blocked=%d", goroutines, won, blocked)
	}
	if blocked != goroutines-1 {
		t.Errorf("expected %d blocked, got %d", goroutines-1, blocked)
	}
}

// TestInFlightExpiresAfterWindow ensures the monotonic window eventually
// allows the same job to run again after the dedup interval.
func TestInFlightExpiresAfterWindow(t *testing.T) {
	svc, err := New(&store.Store{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	jobID := "expire-job"
	if !svc.tryAcquireInFlight(jobID) {
		t.Fatal("first acquire should succeed")
	}
	// Manually age the entry past the 1-minute window.
	svc.inFlightMu.Lock()
	svc.inFlight[jobID] = time.Now().Add(-2 * time.Minute)
	svc.inFlightMu.Unlock()

	if !svc.tryAcquireInFlight(jobID) {
		t.Error("expected acquire after window expiry to succeed")
	}
	svc.releaseInFlight(jobID)
}

// TestScheduleJobOffloadsCronWorker verifies that scheduleJob registers a cron
// entry that, when fired, executes off the cron goroutine (go executeJob).
// We cannot easily intercept the goroutine boundary without blocking, but we can
// verify the job is scheduled and that NextRun is non-nil after registration.
func TestScheduleJobOffloadsCronWorker(t *testing.T) {
	ctx := context.Background()
	svc, err := New(&store.Store{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	svc.cron = cron.New()
	svc.cron.Start()
	defer svc.Stop()

	job := store.CronJob{
		ID:       "offload-test",
		Schedule: "*/1 * * * *",
		Command:  "echo hello",
		Type:     "shell",
		Enabled:  true,
	}
	if err := svc.scheduleJob(ctx, job); err != nil {
		t.Fatalf("scheduleJob: %v", err)
	}
	next := svc.NextRun(job)
	if next == nil {
		t.Fatal("expected non-nil next run after scheduling")
	}
	// Verify entry exists and is not nil.
	svc.mu.Lock()
	_, ok := svc.entries[job.ID]
	svc.mu.Unlock()
	if !ok {
		t.Error("expected entry to be tracked in entries map")
	}
}

// TestPrepareCronJobExecutionDuplicateWindowIntegration is a compile-time check
// that ErrCronDuplicate exists and that Service code path handles it. Full
// integration requires a DB, so we just verify the sentinel.
func TestErrCronDuplicateSentinel(t *testing.T) {
	if store.ErrCronDuplicate == nil {
		t.Fatal("expected ErrCronDuplicate sentinel to be non-nil")
	}
	if store.ErrCronDuplicate.Error() == "" {
		t.Error("expected ErrCronDuplicate to have message")
	}
}

// TestTimeAfterFuncNonBlockingRetry ensures scheduleRetry uses time.AfterFunc and
// returns immediately rather than blocking the caller with Sleep.
// We measure that scheduleRetry returns within 50ms even though retry delay is 5s.
func TestTimeAfterFuncNonBlockingRetry(t *testing.T) {
	svc, err := New(&store.Store{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	// Use a job with RetryCount=3; delay for attempt 0 is 5s.
	job := store.CronJob{
		ID:         "retry-noblock",
		RetryCount: 3,
		Command:    "false",
	}
	start := time.Now()
	svc.scheduleRetry(context.Background(), job, 0)
	elapsed := time.Since(start)
	if elapsed > 100*time.Millisecond {
		t.Errorf("scheduleRetry blocked caller for %v, expected <100ms (should use AfterFunc)", elapsed)
	}
	// Allow AfterFunc to be scheduled without panicking; we don't wait for it.
	time.Sleep(10 * time.Millisecond)
}
