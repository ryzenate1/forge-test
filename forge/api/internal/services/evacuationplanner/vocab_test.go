package evacuationplanner

import "testing"

func TestStorageLocalityCanonical(t *testing.T) {
	if canonicalStorageLocality("local_only") != "local" {
		t.Errorf("canonical local_only should be local, got %q", canonicalStorageLocality("local_only"))
	}
	if canonicalStorageLocality("local") != "local" {
		t.Error("local should stay local")
	}
	if canonicalStorageLocality("LOCAL_ONLY") != "local" {
		t.Error("case insensitive canonical failed")
	}
	if canonicalStorageLocality("shared") != "shared" {
		t.Error("shared should stay shared")
	}
}

func TestIsLocalOnlyLocality(t *testing.T) {
	if !isLocalOnlyLocality(StorageLocalOnly) {
		t.Error("StorageLocalOnly should be local")
	}
	if !isLocalOnlyLocality(StorageLocalOnlyLegacy) {
		t.Error("legacy local_only should be considered local")
	}
	if !isLocalOnlyLocality("local_only") {
		t.Error("string local_only should be local")
	}
	if isLocalOnlyLocality(StorageShared) {
		t.Error("shared should not be local_only")
	}
	if isLocalOnlyLocality(StorageReplicated) {
		t.Error("replicated should not be local_only")
	}
}

func TestStorageLocalityConstantsSingleVocab(t *testing.T) {
	// Single vocabulary is "local" – legacy alias still accepted but canonical is local
	if StorageLocalOnly != "local" {
		t.Errorf("StorageLocalOnly canonical should be \"local\", got %q", StorageLocalOnly)
	}
	// Ensure legacy still exists for backward compat
	if StorageLocalOnlyLegacy != "local_only" {
		t.Errorf("legacy constant should remain local_only, got %q", StorageLocalOnlyLegacy)
	}
	// Ensure canonical helper treats both as equal
	if canonicalStorageLocality(string(StorageLocalOnly)) != canonicalStorageLocality(string(StorageLocalOnlyLegacy)) {
		t.Error("canonical should equate local and local_only")
	}
}
