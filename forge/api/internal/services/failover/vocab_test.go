package failover

import "testing"

func TestCanonicalLocality(t *testing.T) {
	if canonicalLocality("local_only") != "local" {
		t.Errorf("canonical local_only => local, got %q", canonicalLocality("local_only"))
	}
	if canonicalLocality("LOCAL") != "local" {
		t.Error("case insensitive failed")
	}
	if canonicalLocality("shared") != "shared" {
		t.Error("shared should stay shared")
	}
}

func TestIsLocalOnlyHandlesAlias(t *testing.T) {
	if !isLocalOnly("local") {
		t.Error("local should be local_only")
	}
	if !isLocalOnly("local_only") {
		t.Error("local_only should be local_only")
	}
	if !isLocalOnly("LOCAL_ONLY") {
		t.Error("case insensitive local_only failed")
	}
	if isLocalOnly("shared") {
		t.Error("shared should not be local")
	}
}

func TestDetermineFailoverActionLocalSynonym(t *testing.T) {
	// local and local_only should behave identically: without backup, notify
	for _, loc := range []string{"local", "local_only", "LOCAL", "Local_Only"} {
		action := DetermineFailoverAction(loc, false, false)
		if action != FailoverActionNotify {
			t.Errorf("DetermineFailoverAction(%q, false, false) = %s, want notify", loc, action)
		}
	}
	// with replicated false, local should still notify even if isReplicated true? per logic, local_only with replicated still notify
	for _, loc := range []string{"local", "local_only"} {
		action := DetermineFailoverAction(loc, false, true)
		if action != FailoverActionNotify {
			t.Errorf("DetermineFailoverAction(%q, false, true) = %s, want notify for local even if replicated", loc, action)
		}
	}
	// shared/replicated should evacuate
	for _, loc := range []string{"shared", "replicated"} {
		action := DetermineFailoverAction(loc, false, false)
		if action != FailoverActionEvacuate {
			t.Errorf("DetermineFailoverAction(%q) = %s, want evacuate", loc, action)
		}
	}
	// local with verified backup should evacuate (hasVerifiedBackup true)
	for _, loc := range []string{"local", "local_only"} {
		action := DetermineFailoverAction(loc, true, false)
		if action != FailoverActionEvacuate {
			t.Errorf("DetermineFailoverAction(%q, true) = %s, want evacuate when backup verified", loc, action)
		}
	}
}
