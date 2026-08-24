package http

import (
	"strings"
	"testing"
)

// TestValidBackupName guards the panel-side mirror of Beacon's filename
// rules: a name accepted by the API must be byte-identical to the archive
// filename the node creates, so unsafe names must be rejected with 400.
func TestValidBackupName(t *testing.T) {
	valid := []string{
		"daily-backup_01.zip",
		"Backup.2026.08.23",
		strings.Repeat("a", 100),
	}
	invalid := []string{
		"",
		"   ",
		"../etc/passwd",
		"foo/bar",
		"foo\\bar",
		".hidden",
		"..dots",
		"a..b",
		"with space",
		"with$shell",
		"quote'",
		strings.Repeat("a", 101),
	}
	for _, name := range valid {
		if !validBackupName(name) {
			t.Errorf("validBackupName(%q) = false, want true", name)
		}
	}
	for _, name := range invalid {
		if validBackupName(name) {
			t.Errorf("validBackupName(%q) = true, want false", name)
		}
	}
}
