package cronjob

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"

	"gamepanel/forge/internal/store"
)

// Regression tests for the subuser→control-plane RCE boundary (SEC-5.1).
// Server-targeted cron jobs must dispatch to the owning node through the
// injected dispatcher and must NEVER execute locally via "sh -c".

func TestDispatchServerCommandFailsClosedWithoutDispatcher(t *testing.T) {
	svc := newTestService(t)

	job := store.CronJob{
		ID:         "rce-regression",
		Command:    "touch /tmp/pwned-control-plane",
		Type:       "shell",
		TargetType: "server",
		TargetID:   "srv-123",
	}

	exitCode, output, errStr := svc.dispatchServerCommand(context.Background(), job)
	if exitCode == 0 {
		t.Fatal("expected fail-closed non-zero exit when no dispatcher is wired")
	}
	if output != "" {
		t.Errorf("expected empty stdout on fail-closed path, got %q", output)
	}
	if !strings.Contains(errStr, "node dispatcher is not wired") {
		t.Errorf("expected dispatcher-not-wired error, got %q", errStr)
	}
}

func TestDispatchServerCommandRoutesToNode(t *testing.T) {
	svc := newTestService(t)

	var dispatchedServerID, dispatchedCommand string
	var callCount int32
	svc.SetServerCommandDispatcher(func(ctx context.Context, serverID, command string) error {
		atomic.AddInt32(&callCount, 1)
		dispatchedServerID = serverID
		dispatchedCommand = command
		return nil
	})

	job := store.CronJob{
		ID:         "dispatch-test",
		Command:    "say hello from node",
		TargetType: "server",
		TargetID:   "srv-node-9",
	}

	exitCode, output, errStr := svc.dispatchServerCommand(context.Background(), job)
	if exitCode != 0 {
		t.Fatalf("expected successful dispatch, got exit %d (%s)", exitCode, errStr)
	}
	if atomic.LoadInt32(&callCount) != 1 {
		t.Fatalf("expected exactly one dispatch, got %d", callCount)
	}
	if dispatchedServerID != "srv-node-9" || dispatchedCommand != "say hello from node" {
		t.Errorf("dispatcher received wrong target: server=%q command=%q", dispatchedServerID, dispatchedCommand)
	}
	if output != "command dispatched to node" {
		t.Errorf("unexpected dispatch output %q", output)
	}
}

func TestDispatchServerCommandSurfacesDispatchFailure(t *testing.T) {
	svc := newTestService(t)
	svc.SetServerCommandDispatcher(func(ctx context.Context, serverID, command string) error {
		return errors.New("node unreachable")
	})

	job := store.CronJob{ID: "x", Command: "cmd", TargetType: "server", TargetID: "srv"}
	exitCode, _, errStr := svc.dispatchServerCommand(context.Background(), job)
	if exitCode != 1 {
		t.Errorf("expected exit 1 on dispatch failure, got %d", exitCode)
	}
	if !strings.Contains(errStr, "node dispatch failed") || !strings.Contains(errStr, "node unreachable") {
		t.Errorf("expected wrapped dispatch failure, got %q", errStr)
	}
}

func TestSetServerCommandDispatcherNilRestoresFailClosed(t *testing.T) {
	svc := newTestService(t)
	svc.SetServerCommandDispatcher(func(ctx context.Context, serverID, command string) error { return nil })
	svc.SetServerCommandDispatcher(nil)

	job := store.CronJob{ID: "y", Command: "cmd", TargetType: "server", TargetID: "srv"}
	exitCode, _, _ := svc.dispatchServerCommand(context.Background(), job)
	if exitCode == 0 {
		t.Fatal("expected fail-closed after dispatcher cleared")
	}
}

// Cron permissions must exist so handlers can require them explicitly.
func TestCronPermissionsRegistered(t *testing.T) {
	all := store.AllPermissions()
	want := []string{
		store.PermCronRead, store.PermCronCreate, store.PermCronUpdate,
		store.PermCronDelete, store.PermCronRun, store.PermBuildpackManage,
	}
	for _, w := range want {
		found := false
		for _, p := range all {
			if p == w {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("permission %q missing from AllPermissions()", w)
		}
	}

	if !store.HasPermission([]string{"cron.run"}, store.PermCronRun) {
		t.Error("HasPermission should honor explicit cron.run grant")
	}
	if store.HasPermission([]string{"cron.read"}, store.PermCronCreate) {
		t.Error("cron.read must not imply cron.create")
	}
	if store.HasPermission([]string{store.PermBuildpackManage}, "control.console") {
		t.Error("buildpack.manage must not imply control.console")
	}
}
