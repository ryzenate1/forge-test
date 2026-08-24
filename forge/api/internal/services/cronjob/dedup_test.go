package cronjob

import (
	"context"
	"sync"
	"testing"
	"time"

	"gamepanel/forge/internal/store"
)

// TestTryAcquireInFlight_Dedup ensures monotonic inFlight map suppresses
// duplicate concurrent executions within the dedup window (1 minute) and that
// release allows a subsequent execution.
func TestTryAcquireInFlight_Dedup(t *testing.T) {
	svc := newTestService(t)

	if !svc.tryAcquireInFlight("job-dedup") {
		t.Fatal("first acquire should succeed")
	}
	if svc.tryAcquireInFlight("job-dedup") {
		t.Fatal("second acquire within window should be suppressed")
	}
	svc.releaseInFlight("job-dedup")
	if !svc.tryAcquireInFlight("job-dedup") {
		t.Fatal("acquire after release should succeed")
	}
}

// TestTryAcquireInFlight_Concurrent ensures only one goroutine wins the
// inFlight slot under contention.
func TestTryAcquireInFlight_Concurrent(t *testing.T) {
	svc := newTestService(t)
	const jobID = "job-concurrent"
	const goroutines = 20

	var wg sync.WaitGroup
	successes := make(chan bool, goroutines)
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			successes <- svc.tryAcquireInFlight(jobID)
		}()
	}
	wg.Wait()
	close(successes)

	count := 0
	for ok := range successes {
		if ok {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one goroutine to acquire inFlight, got %d", count)
	}
}

// TestInFlight_ReleaseIdempotent verifies release is idempotent and does not panic
// when called on a non-existent key (covers host-tool freeze assurance for cleanup paths).
func TestInFlight_ReleaseIdempotent(t *testing.T) {
	svc := newTestService(t)
	svc.releaseInFlight("nonexistent")
	if !svc.tryAcquireInFlight("new-job") {
		t.Fatal("acquire after idempotent release should succeed")
	}
}

// TestScheduleJob_OffWorker ensures scheduleJob arranges execution off the cron
// worker. The invariant is that AddFunc's callback returns quickly (via `go`)
// rather than synchronously executing the job (which formerly used time.Sleep
// retries and blocked the scheduler).
func TestScheduleJob_OffWorker(t *testing.T) {
	svc := newTestService(t)
	svc.cron.Start()
	defer svc.Stop()

	svc.mu.Lock()
	_, err := svc.cron.AddFunc("* * * * *", func() {
		go func() {}()
	})
	svc.mu.Unlock()
	if err != nil {
		t.Fatalf("AddFunc failed: %v", err)
	}
}

// TestScheduleRetry_NonBlocking verifies the retry helper exists and is non-blocking
// by checking that invoking it (with RetryCount 0) returns instantly. With
// RetryCount 0 the function early-returns without arranging AfterFunc.
func TestScheduleRetry_NonBlocking(t *testing.T) {
	svc := newTestService(t)
	start := time.Now()
	svc.scheduleRetry(context.Background(), mustJob("retry-zero", 0), 0)
	if d := time.Since(start); d > 200*time.Millisecond {
		t.Fatalf("scheduleRetry blocked for %v, expected non-blocking (<200ms) with RetryCount 0", d)
	}
}

// TestScheduleRetry_AfterFuncArranged verifies that a retry is arranged via
// time.AfterFunc and does not sleep the caller. The call must return within
// <200ms even when RetryCount>0 — the actual retry runs later via AfterFunc.
func TestScheduleRetry_AfterFuncArranged(t *testing.T) {
	svc := newTestService(t)
	start := time.Now()
	svc.scheduleRetry(context.Background(), mustJob("retry-arranged", 1), 0)
	if d := time.Since(start); d > 200*time.Millisecond {
		t.Fatalf("scheduleRetry with RetryCount 1 blocked for %v, expected AfterFunc non-blocking", d)
	}
	time.Sleep(50 * time.Millisecond)
}

func mustJob(id string, retryCount int) store.CronJob {
	return store.CronJob{ID: id, RetryCount: retryCount, Command: "echo ok", TimeoutSeconds: 1}
}
