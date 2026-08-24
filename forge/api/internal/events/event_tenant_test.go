package events

import (
	"encoding/json"
	"testing"
)

func TestEnvelopeTenantID_Present(t *testing.T) {
	env := NewEnvelope(EventServerCreated, "test", "server", "srv-1", map[string]any{"tenant_id": "org-123"})
	if env.TenantID != "org-123" {
		t.Fatalf("expected TenantID org-123, got %q", env.TenantID)
	}
	// orgId alias
	env2 := NewEnvelope(EventServerCreated, "test", "server", "srv-1", map[string]any{"orgId": "org-456"})
	if env2.TenantID != "org-456" {
		t.Fatalf("expected tenant alias orgId to map to TenantID, got %q", env2.TenantID)
	}
	// empty payload -> empty tenant
	env3 := NewEnvelope(EventServerCreated, "test", "server", "srv-1", nil)
	if env3.TenantID != "" {
		t.Fatalf("expected empty TenantID for nil payload, got %q", env3.TenantID)
	}
}

func TestEnvelopeWithTenant_Explicit(t *testing.T) {
	env := NewEnvelopeWithTenant(EventServerCreated, "test", "server", "srv-1", "tenant-999", map[string]any{})
	if env.TenantID != "tenant-999" {
		t.Fatalf("expected explicit TenantID, got %q", env.TenantID)
	}
	// payload fallback when explicit empty
	env2 := NewEnvelopeWithTenant(EventServerCreated, "test", "server", "srv-1", "", map[string]any{"tenantId": "fallback-111"})
	if env2.TenantID != "fallback-111" {
		t.Fatalf("expected fallback TenantID from payload, got %q", env2.TenantID)
	}
}

func TestEnvelopeTenant_JsonRoundTrip(t *testing.T) {
	env := NewEnvelopeWithTenant(EventServerCreated, "test", "server", "srv-1", "org-xyz", map[string]any{"foo": "bar"})
	data, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded Envelope
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.TenantID != "org-xyz" {
		t.Fatalf("round trip TenantID mismatch: %q", decoded.TenantID)
	}
	if decoded.Payload["foo"] != "bar" {
		t.Fatalf("payload lost")
	}
}

func TestEnvelopeValidate_TenantOptional(t *testing.T) {
	env := NewEnvelope(EventServerCreated, "test", "server", "srv-1", nil)
	if err := env.Validate(); err != nil {
		t.Fatalf("validate should pass without TenantID: %v", err)
	}
	env.TenantID = "some-tenant"
	if err := env.Validate(); err != nil {
		t.Fatalf("validate should pass with TenantID: %v", err)
	}
}
