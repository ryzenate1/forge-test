package deployment

import (
	"context"
	"fmt"
	"time"

	"gamepanel/forge/internal/daemon"
	"gamepanel/forge/internal/store"
)

// BeaconRuntimeExecutor is the production RuntimeExecutor: it drives the
// node's beacon through the daemon client, the same canonical channel used
// by clustermanager (ServerControlTarget → configuration sync → power).
type BeaconRuntimeExecutor struct {
	Store  *store.Store
	Daemon *daemon.Client
}

// WireBeaconExecutor attaches the beacon-backed runtime bridge to svc. It is
// a no-op when any dependency is missing, leaving the deployment service in
// fail-closed mode (provision refuses to report success).
func WireBeaconExecutor(svc *Service, st *store.Store, cli *daemon.Client) {
	if svc == nil || st == nil || cli == nil {
		return
	}
	svc.SetRuntimeExecutor(&BeaconRuntimeExecutor{Store: st, Daemon: cli})
}

// ApplyDeployment syncs the new image into the server's node configuration
// and starts the workload. The beacon recreates the container from synced
// configuration, so success means the node will actually run the image.
func (b *BeaconRuntimeExecutor) ApplyDeployment(ctx context.Context, serverID, image string) error {
	targetCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	target, err := b.Store.ServerControlTarget(targetCtx, serverID)
	if err != nil {
		return fmt.Errorf("resolve node target: %w", err)
	}
	srv, err := b.Store.GetServer(targetCtx, serverID)
	if err != nil {
		return fmt.Errorf("load server: %w", err)
	}
	config := buildServerConfig(srv, image)
	if err := b.Daemon.SyncServerConfiguration(ctx, target.NodeURL, target.NodeToken, serverID, config); err != nil {
		return fmt.Errorf("sync configuration to node: %w", err)
	}
	if _, err := b.Daemon.SendPower(ctx, target.NodeURL, target.NodeToken, serverID, "start"); err != nil {
		return fmt.Errorf("start workload on node: %w", err)
	}
	return nil
}

// VerifyRunning asks the node whether the workload is currently observable.
// Beacon's stats endpoint errors for missing containers, so success confirms
// the container exists post-provision; combined with SendPower("start")'s
// own failure semantics inside ApplyDeployment this catches image failures,
// node outages, and start failures. It cannot distinguish "running" from
// "exited moments ago" — beacon exposes no state field today.
func (b *BeaconRuntimeExecutor) VerifyRunning(ctx context.Context, serverID string) (bool, error) {
	targetCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	target, err := b.Store.ServerControlTarget(targetCtx, serverID)
	if err != nil {
		return false, fmt.Errorf("resolve node target: %w", err)
	}
	if _, err := b.Daemon.Stats(ctx, target.NodeURL, target.NodeToken, serverID); err != nil {
		return false, fmt.Errorf("node stats: %w", err)
	}
	return true, nil
}

// buildServerConfig maps the stored server row plus the deployment's image
// into the beacon ServerConfiguration shape.
func buildServerConfig(srv store.Server, image string) daemon.ServerConfiguration {
	cfg := daemon.ServerConfiguration{
		UUID:        srv.ID,
		Name:        srv.Name,
		Suspended:   srv.Suspended,
		Environment: map[string]string{},
		DockerImage: image,
		Egg:         map[string]any{},
		Build: map[string]any{
			"memory_mb":    srv.MemoryMB,
			"disk_mb":      srv.DiskMB,
			"cpu_shares":   srv.CPUShares,
			"io_weight":    srv.IOWeight,
			"swap_mb":      srv.SwapMB,
			"oom_disabled": srv.OOMDisabled,
		},
		Allocations: map[string]any{},
		Config:      map[string]any{},
		Invocation:  srv.StartupCommand,
	}
	return cfg
}
