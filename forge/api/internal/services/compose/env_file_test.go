package compose

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const composeWithEnvFile = `
services:
  web:
    image: nginx:latest
    env_file: ./app.env
    environment:
      INLINE_VAR: value
`

const composeWithEnvFileList = `
services:
  web:
    image: nginx:latest
    env_file:
      - ./frontend.env
      - ./backend.env
  api:
    image: myapp:latest
    env_file: .env
`

const composeWithEnvFileInclude = `
include:
  - path: ./common.yml
    env_file: ./env/common.env
services:
  web:
    image: nginx:latest
`

func TestEnvFile_StrictFails(t *testing.T) {
	t.Setenv("FORGE_ENV_FILE_STRICT", "true")
	svc, _ := New(nil, nil)

	_, err := svc.Parse([]byte(composeWithEnvFile), "/app")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "env_file not supported")

	result := svc.Validate([]byte(composeWithEnvFile), "/app")
	assert.False(t, result.Valid)
	found := false
	for _, e := range result.Errors {
		if strings.Contains(strings.ToLower(e.Message), "env_file") || strings.Contains(strings.ToLower(e.Field), "env_file") {
			found = true
			assert.Equal(t, "env_file not supported, inline env vars", e.Message)
		}
	}
	assert.True(t, found, "expected env_file validation error in strict mode")

	// also test list form
	_, err = svc.Parse([]byte(composeWithEnvFileList), "/app")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "env_file not supported")
}

func TestEnvFile_NonStrictWarnsButPasses(t *testing.T) {
	t.Setenv("FORGE_ENV_FILE_STRICT", "false")
	svc, _ := New(nil, nil)

	parsed, err := svc.Parse([]byte(composeWithEnvFile), "/app")
	require.NoError(t, err)
	require.NotNil(t, parsed)
	assert.Len(t, parsed.Services, 1)

	result := svc.Validate([]byte(composeWithEnvFile), "/app")
	assert.True(t, result.Valid, "non-strict mode should not fail validation for env_file, but warn")
	// Should have a warning about env_file being ignored.
	foundWarn := false
	for _, w := range result.Warnings {
		if strings.Contains(strings.ToLower(w.Field), "env_file") {
			foundWarn = true
		}
	}
	assert.True(t, foundWarn, "expected env_file warning in non-strict mode")
}

func TestEnvFile_NonStrictUnsetDefaultsToWarn(t *testing.T) {
	// Unset env var should default to non-strict (false)
	os.Unsetenv("FORGE_ENV_FILE_STRICT")
	svc, _ := New(nil, nil)
	parsed, err := svc.Parse([]byte(composeWithEnvFile), "/app")
	require.NoError(t, err)
	assert.NotNil(t, parsed)
	result := svc.Validate([]byte(composeWithEnvFile), "/app")
	assert.True(t, result.Valid)
}

func TestEnvFile_ValidComposeWithoutEnvFilePassesStrict(t *testing.T) {
	t.Setenv("FORGE_ENV_FILE_STRICT", "true")
	svc, _ := New(nil, nil)
	content := `
services:
  web:
    image: nginx:latest
    environment:
      FOO: bar
`
	parsed, err := svc.Parse([]byte(content), "/app")
	require.NoError(t, err)
	assert.Len(t, parsed.Services, 1)
	result := svc.Validate([]byte(content), "/app")
	assert.True(t, result.Valid)
	assert.Empty(t, result.Errors)
}

func TestEnvFile_IncludeEnvFileStrict(t *testing.T) {
	t.Setenv("FORGE_ENV_FILE_STRICT", "true")
	svc, _ := New(nil, nil)
	_, err := svc.Parse([]byte(composeWithEnvFileInclude), "/app")
	// Parse currently checks Include env_file when strict; should error.
	// If not, Validate should error.
	if err == nil {
		result := svc.Validate([]byte(composeWithEnvFileInclude), "/app")
		assert.False(t, result.Valid)
		assert.True(t, len(result.Errors) > 0)
		found := false
		for _, e := range result.Errors {
			if strings.Contains(strings.ToLower(e.Message), "env_file") {
				found = true
			}
		}
		assert.True(t, found)
	} else {
		assert.Contains(t, err.Error(), "env_file")
	}
}
