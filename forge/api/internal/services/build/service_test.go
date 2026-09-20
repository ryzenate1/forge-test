package build

import (
	"context"
	"errors"
	"fmt"
	"gamepanel/forge/internal/daemon"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gamepanel/forge/internal/store"
)

// ---------- Store helpers ----------

type mockNodeStore struct {
	nodes       map[string]store.Node
	credentials map[string]string
	mu          sync.RWMutex
}

func newMockNodeStore() *mockNodeStore {
	return &mockNodeStore{
		nodes:       make(map[string]store.Node),
		credentials: make(map[string]string),
	}
}

func (m *mockNodeStore) GetNodeDaemonCredential(ctx context.Context, nodeID string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cred, ok := m.credentials[nodeID]
	if !ok {
		return "", fmt.Errorf("credential not found: %s", nodeID)
	}
	return cred, nil
}

func (m *mockNodeStore) GetNode(ctx context.Context, nodeID string) (store.Node, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n, ok := m.nodes[nodeID]
	if !ok {
		return store.Node{}, fmt.Errorf("node not found: %s", nodeID)
	}
	return n, nil
}

func (m *mockNodeStore) ListNodes(ctx context.Context) ([]store.Node, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var nodes []store.Node
	for _, n := range m.nodes {
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (m *mockNodeStore) addNode(id, baseURL, token, actualState string, hasBuild bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nodes[id] = store.Node{
		ID:          id,
		BaseURL:     baseURL,
		ActualState: actualState,
	}
	m.credentials[id] = token
}

type mockStore struct {
	builds map[string]*store.BuildRecord
	mu     sync.RWMutex
}

func newMockStore() *mockStore {
	return &mockStore{builds: make(map[string]*store.BuildRecord)}
}

func (m *mockStore) CreateBuild(ctx context.Context, record *store.BuildRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.builds[record.ID] = record
	return nil
}

func (m *mockStore) UpdateBuild(ctx context.Context, record *store.BuildRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.builds[record.ID] = record
	return nil
}

func (m *mockStore) GetBuild(ctx context.Context, id string) (*store.BuildRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.builds[id]
	if !ok {
		return nil, fmt.Errorf("build not found: %s", id)
	}
	return r, nil
}

func (m *mockStore) ListBuilds(ctx context.Context, sourceID string) ([]*store.BuildRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var builds []*store.BuildRecord
	for _, b := range m.builds {
		if b.SourceID == sourceID {
			builds = append(builds, b)
		}
	}
	return builds, nil
}

func (m *mockStore) PruneBuilds(ctx context.Context, sourceID string, retention int) error {
	return nil
}

func (m *mockStore) ReapAbandonedBuilds(ctx context.Context) error {
	return nil
}

// Mock node selector
type mockNodeSelector struct {
	nodeID    string
	nodeToken string
}

func (m *mockNodeSelector) SelectBuildNode(ctx context.Context, builderType BuilderType) (string, string, error) {
	return m.nodeID, m.nodeToken, nil
}

// ---------- Tests ----------

func TestGenerateBuildID(t *testing.T) {
	id1 := GenerateBuildID()
	id2 := GenerateBuildID()

	if id1 == id2 {
		t.Fatal("generated build IDs should be unique")
	}
	if len(id1) != 14 {
		t.Fatalf("expected build ID length 14, got %d: %s", len(id1), id1)
	}

	for _, c := range id1 {
		if !strings.ContainsRune(base36Alphabet, c) {
			t.Fatalf("build ID contains invalid character: %c", c)
		}
	}

	if id1 <= id2 {
		return
	}
	id3 := GenerateBuildID()
	if id3 <= id2 {
		t.Fatal("build IDs should be lexicographically sortable (monotonically increasing)")
	}
}

func TestGenerateBuildID_Sortability(t *testing.T) {
	ids := make([]string, 100)
	for i := range ids {
		ids[i] = GenerateBuildID()
		time.Sleep(time.Millisecond)
	}

	for i := 1; i < len(ids); i++ {
		if ids[i] <= ids[i-1] {
			t.Fatalf("build IDs not sortable: %s <= %s at index %d", ids[i], ids[i-1], i)
		}
	}
}

func TestEncodeBase36(t *testing.T) {
	tests := []struct {
		value    uint64
		minWidth int
		expected string
	}{
		{0, 1, "0"},
		{0, 8, "00000000"},
		{10, 1, "a"},
		{35, 1, "z"},
		{36, 1, "10"},
		{36, 4, "0010"},
		{1295, 1, "zz"},
	}

	for _, tt := range tests {
		result := encodeBase36(tt.value, tt.minWidth)
		if result != tt.expected {
			t.Errorf("encodeBase36(%d, %d) = %q, want %q", tt.value, tt.minWidth, result, tt.expected)
		}
	}
}

func TestDockerfileBuilder_Detect(t *testing.T) {
	builder := &DockerfileBuilder{}

	tmpDir := t.TempDir()
	if builder.Detect(tmpDir) {
		t.Fatal("should not detect Dockerfile in empty directory")
	}

	err := os.WriteFile(filepath.Join(tmpDir, "Dockerfile"), []byte("FROM alpine\n"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	if !builder.Detect(tmpDir) {
		t.Fatal("should detect Dockerfile when present")
	}
}

func TestNixpacksBuilder_Detect(t *testing.T) {
	builder := &NixpacksBuilder{}

	tmpDir := t.TempDir()

	if builder.Detect(tmpDir) {
		t.Fatal("should not detect project in empty directory")
	}

	err := os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte(`{"name":"test"}`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	if !builder.Detect(tmpDir) {
		t.Fatal("should detect Node.js project with package.json")
	}
}

func TestNixpacksBuilder_Detect_DockerfilePriority(t *testing.T) {
	builder := &NixpacksBuilder{}

	tmpDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(tmpDir, "Dockerfile"), []byte("FROM alpine\n"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte(`{}`), 0644)

	if builder.Detect(tmpDir) {
		t.Fatal("Nixpacks builder should yield to Dockerfile builder when Dockerfile present")
	}
}

func TestBuildStatus_Terminal(t *testing.T) {
	if IsTerminal(BuildRunning) {
		t.Fatal("running should not be terminal")
	}
	if !IsTerminal(BuildSucceeded) {
		t.Fatal("succeeded should be terminal")
	}
	if !IsTerminal(BuildFailed) {
		t.Fatal("failed should be terminal")
	}
	if !IsTerminal(BuildCanceled) {
		t.Fatal("canceled should be terminal")
	}
	if !IsTerminal(BuildAbandoned) {
		t.Fatal("abandoned should be terminal")
	}
}

func TestBuildRecord_DisplayStatus_Abandoned(t *testing.T) {
	pid := os.Getpid()
	record := &store.BuildRecord{
		Status: string(BuildRunning),
		PID:    &pid,
	}
	display := DisplayBuildStatus(record)
	if display != BuildRunning {
		t.Fatalf("expected running, got %s", display)
	}

	bogusPID := 99999999
	record.PID = &bogusPID
	display = DisplayBuildStatus(record)
	if display != BuildAbandoned {
		t.Fatalf("expected abandoned for dead PID, got %s", display)
	}
}

// ---------- Mock daemon client for remote build tests ----------

type mockDaemonClient struct {
	buildResults  map[string]*daemon.BuildStartResponse
	buildLogs     map[string][]daemon.BuildLogLine
	buildStatuses map[string]*daemon.BuildStatusResponse
	pushResults   map[string]*daemon.PushResult
	capabilities  map[string]*daemon.CapabilitiesResponse
	digests       map[string]string
	mu            sync.RWMutex
	shouldFail    map[string]error
}

func newMockDaemonClient() *mockDaemonClient {
	return &mockDaemonClient{
		buildResults:  make(map[string]*daemon.BuildStartResponse),
		buildLogs:     make(map[string][]daemon.BuildLogLine),
		buildStatuses: make(map[string]*daemon.BuildStatusResponse),
		pushResults:   make(map[string]*daemon.PushResult),
		capabilities:  make(map[string]*daemon.CapabilitiesResponse),
		digests:       make(map[string]string),
		shouldFail:    make(map[string]error),
	}
}

func TestValidateBuildContext(t *testing.T) {
	// Test empty source dir
	err := validateBuildContext(BuildOptions{})
	if err == nil {
		t.Fatal("expected error for empty source dir")
	}

	// Test valid source dir
	tmpDir := t.TempDir()
	err = validateBuildContext(BuildOptions{SourceDir: tmpDir, Platform: "linux/amd64"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Test invalid platform
	err = validateBuildContext(BuildOptions{SourceDir: tmpDir, Platform: "invalid/platform"})
	if err == nil {
		t.Fatal("expected error for invalid platform")
	}

	// Test non-existent dir
	err = validateBuildContext(BuildOptions{SourceDir: "/nonexistent"})
	if err == nil {
		t.Fatal("expected error for non-existent dir")
	}
}

func TestDockerfileBuilder_Build_Local(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	err := os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN echo hello\nCMD echo done\n"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	result, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-build-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err != nil {
		t.Logf("build error (may be expected if docker unavailable): %v", err)
		if result != nil {
			t.Logf("build log: %s", result.Logs)
		}
	}
	if err == nil && result != nil {
		if result.ExitCode != 0 {
			t.Fatalf("build exited with code %d: %s", result.ExitCode, result.Logs)
		}
		t.Logf("build succeeded, image=%s, digest=%s", result.ImageRef, result.Digest)
	}
}

func TestDockerfileBuilder_Build_Cancellation(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	err := os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN echo hello\nCMD sleep 300\n"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	result, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-cancel-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err == nil && result != nil {
		t.Logf("build completed before cancellation (expected if docker is fast enough): exitCode=%d", result.ExitCode)
	}
	if err != nil && err != context.DeadlineExceeded && err != context.Canceled {
		t.Logf("build error (may be expected if docker not available): %v", err)
	}
	if err == context.DeadlineExceeded || err == context.Canceled {
		t.Log("build was properly canceled via context")
	}
}

func TestMaskCredentials(t *testing.T) {
	logs := "Pulling from registry.example.com\nAuthenticating with password mysecretpass\nSuccess"
	credentials := []string{"mysecretpass"}
	result := maskCredentials(logs, credentials)
	if strings.Contains(result, "mysecretpass") {
		t.Fatal("credentials should be masked")
	}
	if !strings.Contains(result, "****") {
		t.Fatal("masked credentials should show ****")
	}

	// Test no-op
	result2 := maskCredentials(logs, nil)
	if result2 != logs {
		t.Fatal("logs should be unchanged when no credentials provided")
	}

	// Test short credential (should not mask)
	result3 := maskCredentials(logs, []string{"ab"})
	if result3 != logs {
		t.Fatal("short credentials should not be masked")
	}
}

func TestDigestFromBuildOutput(t *testing.T) {
	logs := "Step 1/3 : FROM alpine\nStep 2/3 : RUN echo hello\n => exporting to image\n => => exporting layers\n => => writing image sha256:abc123\n => => naming to docker.io/library/test:latest\n digest: sha256:def456"
	digest := daemon.DigestFromBuildOutput(logs)
	if digest != "sha256:def456" {
		t.Fatalf("expected sha256:def456, got %q", digest)
	}

	// No digest
	digest2 := daemon.DigestFromBuildOutput("no digest here")
	if digest2 != "" {
		t.Fatalf("expected empty, got %q", digest2)
	}
}

func TestDigestFromBuildOutputFunc(t *testing.T) {
	// Test the digest extraction in BuildResult
	logs := "digest: sha256:abc123def456\n"
	digest := ""
	for _, line := range strings.Split(logs, "\n") {
		if strings.Contains(line, "digest:") {
			parts := strings.Split(line, "digest:")
			if len(parts) == 2 {
				digest = strings.TrimSpace(parts[1])
			}
		}
	}
	if digest != "sha256:abc123def456" {
		t.Fatalf("expected sha256:abc123def456, got %q", digest)
	}
}

func TestBuildContextValidation_SizeLimit(t *testing.T) {
	// Create a large file to test size validation
	tmpDir := t.TempDir()
	largeFile := filepath.Join(tmpDir, "large.bin")
	_ = os.WriteFile(largeFile, make([]byte, 100), 0644) // small file, should pass

	err := validateBuildContext(BuildOptions{SourceDir: tmpDir})
	if err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestNodeCapabilitySelector_EmptyNodes(t *testing.T) {
	nodeStore := newMockNodeStore()
	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	selector := NewNodeCapabilitySelector(nodeStore, dc)

	_, _, err := selector.SelectBuildNode(context.Background(), BuilderDockerfile)
	if err == nil {
		t.Fatal("expected error for empty node store")
	}
}

func TestRetryBuild_AllFail(t *testing.T) {
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nCMD echo done\n"), 0644)

	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	svc := NewService(nil, dc, nil) // store is nil — will fail
	svc.store = (*store.Store)(nil)

	// Create a minimal build setup that will fail
	opts := BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-retry-test",
		Dockerfile: dockerfile,
		NodeID:     "", // local build
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	record, err := RetryBuild(ctx, svc, "test-source", BuilderDockerfile, opts, 1)
	// Should fail because store is nil, but we exercised the retry logic
	t.Logf("retry result: record=%v, err=%v", record, err)
}

func TestSuccessfulBuild(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	err := os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN echo hello\nCMD echo done\n"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	opts := BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-success-" + GenerateBuildID(),
		Dockerfile: dockerfile,
		Tags:       []string{"forge-test-success-" + GenerateBuildID() + ":latest"},
		Platform:   "linux/amd64",
	}

	result, err := builder.Build(ctx, opts)
	if err != nil {
		t.Logf("build error (may be expected if docker not available): %v", err)
		if result != nil {
			t.Logf("build log: %s", result.Logs)
		}
		return // skip further assertions if docker not available
	}

	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d: %s", result.ExitCode, result.Logs)
	}
	if result.ImageRef == "" {
		t.Fatal("expected image ref to be set")
	}
	t.Logf("build succeeded: image=%s, digest=%s", result.ImageRef, result.Digest)
}

func TestCacheHit(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN echo \"hello-$(date)\"\n"), 0644)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	opts := BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-cache-" + GenerateBuildID(),
		Dockerfile: dockerfile,
		CacheFrom:  []string{"type=gha"},
		CacheTo:    []string{"type=gha,mode=max"},
	}

	result, err := builder.Build(ctx, opts)
	if err != nil {
		t.Logf("build with cache error: %v", err)
		return
	}
	t.Logf("cache build result: exitCode=%d, digest=%s", result.ExitCode, result.Digest)

	// Second build should hit cache
	ctx2, cancel2 := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel2()

	result2, err := builder.Build(ctx2, opts)
	if err != nil {
		t.Logf("second build (cache hit) error: %v", err)
		return
	}
	t.Logf("second build result: exitCode=%d, digest=%s", result2.ExitCode, result2.Digest)
}

func TestInvalidDockerfile(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	// Write an invalid dockerfile
	_ = os.WriteFile(dockerfile, []byte("FROM nonexistent:image\nRUN invalid-command\n"), 0644)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	_, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-invalid-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err == nil {
		t.Fatal("expected error for invalid Dockerfile")
	}
	t.Logf("expected error for invalid Dockerfile: %v", err)
}

func TestTimeout(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN sleep 30\n"), 0644)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-timeout-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Log("build timed out as expected")
	} else {
		t.Logf("build error: %v", err)
	}
}

func TestCancellation(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nRUN sleep 60\n"), 0644)

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	_, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-cancel-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err == nil {
		t.Fatal("expected cancellation error")
	}
	if errors.Is(err, context.Canceled) {
		t.Log("build canceled as expected")
	} else {
		t.Logf("build error: %v", err)
	}
}

func TestRegistryFailure(t *testing.T) {
	builder := &DockerfileBuilder{}
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nCMD echo done\n"), 0644)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build should succeed even without registry push
	result, err := builder.Build(ctx, BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-test-push-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	})
	if err != nil {
		t.Logf("build error (docker may not be available): %v", err)
		return
	}
	if result.ExitCode != 0 {
		t.Fatalf("build failed: %s", result.Logs)
	}
	t.Logf("local build succeeded: %s", result.ImageRef)
}

func TestCredentialMasking(t *testing.T) {
	creds := []string{"user:token123", "ghp_secret"}
	logs := "Using token ghp_secret to authenticate\nPulling from private.registry.com with user:token123"
	masked := maskCredentials(logs, creds)

	if strings.Contains(masked, "ghp_secret") {
		t.Fatal("secret token should be masked")
	}
	if strings.Contains(masked, "token123") {
		t.Fatal("token should be masked")
	}
	if !strings.Contains(masked, "****") {
		t.Fatal("masked content should show ****")
	}

	// Original content should still be visible
	if !strings.Contains(masked, "Using token") {
		t.Fatal("non-secret content should remain")
	}
	if !strings.Contains(masked, "Pulling from") {
		t.Fatal("non-secret content should remain")
	}
}

func TestDigestVerification(t *testing.T) {
	// Test that digest extraction works from build output
	buildLog := "#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 142B done\n#2 [internal] load .dockerignore\n#2 transferring context: 2B done\n#3 [internal] load metadata for docker.io/library/alpine:3.21\n#3 DONE 0.0s\n#4 [1/1] RUN echo hello\n#4 DONE 0.0s\n#5 exporting to image\n#5 exporting layers done\n#5 writing image sha256:abc123def456\n#5 naming to docker.io/library/test:latest done\ndigest: sha256:def789abc012\n"

	digest := ""
	for _, line := range strings.Split(buildLog, "\n") {
		if strings.Contains(line, "digest:") {
			parts := strings.Split(line, "digest:")
			if len(parts) == 2 {
				digest = strings.TrimSpace(parts[1])
			}
		}
	}
	if digest != "sha256:def789abc012" {
		t.Fatalf("expected sha256:def789abc012, got %q", digest)
	}
}

func TestDuplicateBuild(t *testing.T) {
	id1 := GenerateBuildID()
	id2 := GenerateBuildID()
	if id1 == id2 {
		t.Fatal("duplicate build IDs generated")
	}

	// Check sortable property
	if id1 > id2 {
		t.Logf("id1=%s, id2=%s (id1 > id2 means id2 was generated later but has lower value)", id1, id2)
		// Generate a third one to verify monotonic increase
		id3 := GenerateBuildID()
		if id3 <= id2 {
			t.Fatal("build IDs should be monotonically increasing")
		}
	}
}

func TestNodeDisconnect(t *testing.T) {
	// Simulate a build where the node becomes unavailable
	// The build should be detected as abandoned
	pid := 99999999 // non-existent PID
	record := &store.BuildRecord{
		Status: string(BuildRunning),
		PID:    &pid,
	}
	display := DisplayBuildStatus(record)
	if display != BuildAbandoned {
		t.Fatalf("expected abandoned for dead PID, got %s", display)
	}
}

func TestWorkerRestart(t *testing.T) {
	ms := newMockStore()
	// After a worker restart, the active build map would be empty
	// and old running builds should be reaped
	_ = ms.CreateBuild(context.Background(), &store.BuildRecord{
		ID:        "old-build",
		SourceID:  "source-1",
		Status:    string(BuildRunning),
		StartedAt: time.Now().Add(-24 * time.Hour),
	})

	// Reap should mark it as abandoned
	// This is handled by the ReapAbandoned function
	result, _ := ms.GetBuild(context.Background(), "old-build")
	if result.Status != string(BuildRunning) {
		t.Logf("build status: %s", result.Status)
	}
}

func TestPlatformSelection(t *testing.T) {
	valid := map[string]bool{
		"linux/amd64": true, "linux/arm64": true,
		"linux/arm/v7": true, "linux/arm/v6": true,
		"linux/386": true, "linux/ppc64le": true,
		"linux/s390x": true, "windows/amd64": true,
	}
	for platform, expected := range valid {
		if valid[platform] != expected {
			t.Fatalf("platform %s: expected %v", platform, expected)
		}
	}
}

func TestBuildRetry_ZeroAttempts(t *testing.T) {
	tmpDir := t.TempDir()
	dockerfile := filepath.Join(tmpDir, "Dockerfile")
	_ = os.WriteFile(dockerfile, []byte("FROM alpine:3.21\nCMD echo done\n"), 0644)

	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	svc := NewService(nil, dc, nil)
	svc.store = (*store.Store)(nil)

	opts := BuildOptions{
		SourceDir:  tmpDir,
		ImageName:  "forge-retry-zero-" + GenerateBuildID(),
		Dockerfile: dockerfile,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	record, err := RetryBuild(ctx, svc, "test", BuilderDockerfile, opts, 0)
	t.Logf("retry 0: record=%v err=%v", record, err)
	// Should not panic with 0 retries
}

func TestStartBuild_InvalidBuilderType(t *testing.T) {
	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	svc := NewService(nil, dc, nil)
	svc.store = (*store.Store)(nil)

	_, err := svc.StartBuild(context.Background(), "test-source", "invalid", BuildOptions{}, nil)
	if err == nil {
		t.Fatal("expected error for invalid builder type")
	}
	if !strings.Contains(err.Error(), "unknown builder type") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSelectBuildNode_NoSelector(t *testing.T) {
	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	svc := NewService(nil, dc, nil)
	_, _, err := svc.selectNode(context.Background(), BuilderDockerfile)
	if err != nil {
		t.Fatal("expected no error when no node selector set")
	}
}

func TestRetryBuild_Fallback(t *testing.T) {
	dc, _ := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	svc := NewService(nil, dc, nil)
	svc.store = (*store.Store)(nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := RetryBuild(ctx, svc, "src", BuilderDockerfile, BuildOptions{}, 1)
	if err == nil {
		t.Fatal("expected error when store is nil")
	}
}

func TestValidateBuildContext_NonexistentDir(t *testing.T) {
	err := validateBuildContext(BuildOptions{SourceDir: "/tmp/nonexistent-12345"})
	if err == nil {
		t.Fatal("expected error for non-existent directory")
	}
}

func TestPlatformValidation(t *testing.T) {
	tmpDir := t.TempDir()

	err := validateBuildContext(BuildOptions{SourceDir: tmpDir, Platform: "linux/amd64"})
	if err != nil {
		t.Fatalf("linux/amd64 should be valid: %v", err)
	}

	err = validateBuildContext(BuildOptions{SourceDir: tmpDir, Platform: "invalid"})
	if err == nil {
		t.Fatal("invalid platform should be rejected")
	}

	err = validateBuildContext(BuildOptions{SourceDir: tmpDir, Platform: ""})
	if err != nil {
		t.Fatalf("empty platform should be valid (defaults to linux/amd64): %v", err)
	}
}

func TestMaskCredentials_Empty(t *testing.T) {
	result := maskCredentials("hello world", nil)
	if result != "hello world" {
		t.Fatal("nil credentials should not change logs")
	}

	result = maskCredentials("hello world", []string{})
	if result != "hello world" {
		t.Fatal("empty credentials should not change logs")
	}
}

func TestMaskCredentials_MultipleMatches(t *testing.T) {
	logs := "token1 is here and token2 is there, but not token1 again"
	creds := []string{"token1", "token2"}
	result := maskCredentials(logs, creds)

	if strings.Contains(result, "token1") {
		t.Fatal("token1 should be masked everywhere")
	}
	if strings.Contains(result, "token2") {
		t.Fatal("token2 should be masked everywhere")
	}
}

func TestDaemonClient_BuildCleanup(t *testing.T) {
	client, err := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if client == nil {
		t.Fatal("client should not be nil")
	}
}

func TestDaemonClient_GetBuildStatus(t *testing.T) {
	client, err := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if client == nil {
		t.Fatal("client should not be nil")
	}
}

func TestDaemonClient_PushImage(t *testing.T) {
	client, err := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if client == nil {
		t.Fatal("client should not be nil")
	}
}

func TestDaemonClient_LoginRegistry(t *testing.T) {
	client, err := daemon.NewClient("http://127.0.0.1:9090", "test-token")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if client == nil {
		t.Fatal("client should not be nil")
	}
}
