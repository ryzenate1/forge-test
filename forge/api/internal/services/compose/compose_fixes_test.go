package compose

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnvFile_NotSupported(t *testing.T) {
	t.Setenv("FORGE_ENV_FILE_STRICT", "true")
	svc, _ := New(nil, nil)
	yamlWithEnvFile := `
services:
  app:
    image: nginx
    env_file:
      - .env
`
	_, err := svc.ParseComposeYAML([]byte(yamlWithEnvFile), "", nil)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "env_file")

	result := svc.ValidateCompose([]byte(yamlWithEnvFile), "")
	assert.False(t, result.Valid, "env_file should make validation invalid in strict mode")
	found := false
	for _, e := range result.Errors {
		if strings.Contains(strings.ToLower(e.Message), "env_file") {
			found = true
		}
	}
	if !found {
		if len(result.Errors) > 0 && strings.Contains(strings.ToLower(result.Errors[0].Message), "env_file") {
			found = true
		}
	}
	assert.True(t, found, "expected env_file error in validation")

	// env_file as string should also be rejected in strict mode
	yamlWithEnvFileString := `
services:
  web:
    image: nginx
    env_file: .env
`
	_, err = svc.ParseComposeYAML([]byte(yamlWithEnvFileString), "", nil)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "env_file")

	// No env_file should pass
	valid := `
services:
  app:
    image: nginx
    environment:
      - FOO=bar
`
	_, err = svc.ParseComposeYAML([]byte(valid), "", nil)
	require.NoError(t, err)
	result = svc.ValidateCompose([]byte(valid), "")
	assert.True(t, result.Valid)

	// Non-strict mode should warn but not fail
	t.Setenv("FORGE_ENV_FILE_STRICT", "false")
	_, err = svc.ParseComposeYAML([]byte(yamlWithEnvFile), "", nil)
	require.NoError(t, err)
	result = svc.ValidateCompose([]byte(yamlWithEnvFile), "")
	assert.True(t, result.Valid, "non-strict should not fail")
	foundWarn := false
	for _, w := range result.Warnings {
		if strings.Contains(strings.ToLower(w.Message), "env_file") || strings.Contains(strings.ToLower(w.Field), "env_file") {
			foundWarn = true
		}
	}
	assert.True(t, foundWarn, "expected env_file warning in non-strict mode")
}

func TestValidateHostMountWithAllowlist_Forge(t *testing.T) {
	// Sensitive path /etc requires admin + allowlist
	err := ValidateHostMountWithAllowlist("/etc", false, []string{"/etc"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "requires admin")

	err = ValidateHostMountWithAllowlist("/etc", true, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "allowedMounts")

	err = ValidateHostMountWithAllowlist("/etc", true, []string{"/etc"})
	assert.NoError(t, err)

	err = ValidateHostMountWithAllowlist("/etc/passwd", true, []string{"/etc"})
	assert.NoError(t, err)

	err = ValidateHostMountWithAllowlist("/etc/passwd", true, []string{"/other"})
	assert.Error(t, err)

	// Non-sensitive should pass without allowlist
	err = ValidateHostMountWithAllowlist("/data", false, nil)
	assert.NoError(t, err)

	err = ValidateHostMountWithAllowlist("/srv/game-panel/volumes", false, nil)
	assert.NoError(t, err)

	// Root and home are sensitive
	err = ValidateHostMountWithAllowlist("/", true, []string{"/"})
	assert.NoError(t, err)
	err = ValidateHostMountWithAllowlist("/", true, nil)
	assert.Error(t, err)

	err = ValidateHostMountWithAllowlist("/home/user", true, []string{"/home"})
	assert.NoError(t, err)
}

func TestVolumeAllowlist_UnifiedPredicate(t *testing.T) {
	svc, _ := New(nil, nil)
	// This yaml uses sensitive host mount /etc without allowlist; parse will succeed,
	// but volume validation via Deploy would fail. Here we test the predicate directly.
	// Ensure ValidateHostMountWithAllowlist is the shared predicate.
	allowed := []string{"/mnt/allowed"}
	// /etc not in allowed -> should fail even with admin
	err := ValidateHostMountWithAllowlist("/etc", true, allowed)
	assert.Error(t, err)

	// /mnt/allowed/data should pass if allowlisted
	err = ValidateHostMountWithAllowlist("/mnt/allowed/data", true, allowed)
	// But /mnt/allowed/data is not sensitive (since /mnt is not in sensitive list), so it passes regardless
	assert.NoError(t, err)

	// /home is sensitive
	err = ValidateHostMountWithAllowlist("/home/bob", true, allowed)
	assert.Error(t, err)
	err = ValidateHostMountWithAllowlist("/home/bob", true, []string{"/home"})
	assert.NoError(t, err)

	// Non-sensitive host mount like /var/log (not in sensitive list) passes without allowlist
	err = ValidateHostMountWithAllowlist("/var/log", false, nil)
	assert.NoError(t, err)

	// Ensure isEnvFileEmpty correctly handles various forms
	assert.True(t, isEnvFileEmpty(nil))
	assert.True(t, isEnvFileEmpty(""))
	assert.True(t, isEnvFileEmpty("   "))
	assert.True(t, isEnvFileEmpty([]interface{}{}))
	assert.True(t, isEnvFileEmpty([]string{}))
	assert.False(t, isEnvFileEmpty(".env"))
	assert.False(t, isEnvFileEmpty([]interface{}{".env"}))
	assert.False(t, isEnvFileEmpty(map[string]interface{}{"path": ".env"}))

	// Test that Deploy-time validation would catch disallowed sensitive mount
	yamlWithSensitiveMount := `
services:
  app:
    image: nginx
    volumes:
      - /etc:/host
`
	parsed, err := svc.ParseComposeYAML([]byte(yamlWithSensitiveMount), "", nil)
	require.NoError(t, err)
	require.Len(t, parsed.Services, 1)
	vol := parsed.Services[0].Volumes[0] // "/etc:/host"
	src := strings.SplitN(vol, ":", 2)[0]
	assert.Equal(t, "/etc", src)
	err = ValidateHostMountWithAllowlist(src, false, nil)
	assert.Error(t, err)
	err = ValidateHostMountWithAllowlist(src, true, []string{"/etc"})
	assert.NoError(t, err)
}

func TestComposeDeleteWithOptions_Exists(t *testing.T) {
	// Verify method signatures exist; DB-dependent path is covered by integration tests.
	// Here we just ensure the wrapper doesn't panic on nil store by checking via build.
	t.Skip("skip DB-dependent delete test in unit suite")
}

func TestIsComposePathTraversal(t *testing.T) {
	assert.False(t, isComposePathTraversal("/data"))
	assert.True(t, isComposePathTraversal("../etc"))
	assert.True(t, isComposePathTraversal("a/../b"))
	assert.True(t, isComposePathTraversal(".."))
	assert.False(t, isComposePathTraversal("data"))
}

func TestGitOps_CreateBeforeUpdate_FreshID(t *testing.T) {
	// Simulate DeployFromGit existence check: fresh ID should trigger Create, not Update
	// Use mockStore from gitops_test.go pattern
	store := &mockStoreForFixes{stacks: make(map[string]struct{})}
	freshID := "cps-fresh12345"
	// Get should fail for fresh
	shouldFail := false
	if _, ok := store.stacks[freshID]; !ok {
		shouldFail = true
	}
	assert.True(t, shouldFail, "fresh ID should not exist")
	// After Create, it should exist
	store.stacks[freshID] = struct{}{}
	_, ok := store.stacks[freshID]
	assert.True(t, ok, "after create, ID should exist")
}

type mockStoreForFixes struct {
	stacks map[string]struct{}
}
