package domain

import (
	"encoding/json"
	"testing"
)

func TestPlacementRequest_TenantFields(t *testing.T) {
	req := PlacementRequest{
		RegionID:  "region-1",
		CPU:       1024,
		MemoryMB:  2048,
		DiskMB:    10240,
		TenantID:  "org-abc",
		OrgID:     "org-abc",
		ProjectID: "proj-123",
	}
	if req.TenantID != "org-abc" || req.OrgID != "org-abc" || req.ProjectID != "proj-123" {
		t.Fatalf("tenant fields not preserved")
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded PlacementRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.TenantID != "org-abc" || decoded.OrgID != "org-abc" || decoded.ProjectID != "proj-123" {
		t.Fatalf("json round trip tenant fields mismatch: %+v", decoded)
	}
}

func TestPlacementDecision_TenantField(t *testing.T) {
	dec := PlacementDecision{
		NodeID:   "node-1",
		RegionID: "region-1",
		TenantID: "tenant-xyz",
	}
	data, err := json.Marshal(dec)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded PlacementDecision
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.TenantID != "tenant-xyz" {
		t.Fatalf("expected TenantID tenant-xyz, got %q", decoded.TenantID)
	}
}

func TestPlacementRequest_EmptyTenantOmitsJSON(t *testing.T) {
	req := PlacementRequest{RegionID: "r1", CPU: 1024}
	data, _ := json.Marshal(req)
	var m map[string]any
	_ = json.Unmarshal(data, &m)
	if _, ok := m["tenantId"]; ok {
		t.Fatalf("empty TenantID should be omitted from JSON, got %v", m)
	}
}
