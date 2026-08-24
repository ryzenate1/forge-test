package server

import (
	"strings"
	"testing"
)

// TestSanitizeBackupName guards the control-plane-supplied backup name
// contract: names accepted here become archive filenames on the node, so
// path separators, traversal sequences, and control characters must never
// pass.
func TestSanitizeBackupName(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"   ", ""},
		{"daily-backup_01.zip", "daily-backup_01.zip"},
		{"Backup.2026.08.23", "Backup.2026.08.23"},
		{"../etc/passwd", ""},
		{"foo/bar", ""},
		{"foo\\bar", ""},
		{".hidden", ""},
		{"..dots", ""},
		{"a..b", ""},
		{"with space", ""},
		{"with$shell", ""},
		{"quote'", ""},
		{strings.Repeat("a", 101), ""},
		{strings.Repeat("a", 100), strings.Repeat("a", 100)},
	}
	for _, tc := range cases {
		if got := sanitizeBackupName(tc.in); got != tc.want {
			t.Errorf("sanitizeBackupName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
