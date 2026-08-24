package daemon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestComposeDeployRequest_AllowsMountsAndIsAdmin(t *testing.T) {
	req := ComposeDeployRequest{
		StackID:       "cps-abc123",
		ComposeYAML:   "services:\n  app:\n    image: nginx\n",
		AllowedMounts: []string{"/mnt/allowed", "/etc"},
		IsAdmin:       true,
	}
	if len(req.AllowedMounts) != 2 {
		t.Fatalf("allowed mounts not preserved")
	}
	if !req.IsAdmin {
		t.Fatalf("IsAdmin not preserved")
	}
	// Ensure JSON marshals correctly
	// Use client ComposeDeploy to verify request body contains those fields
	var captured string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(body)
		captured = string(body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"stackId":"cps-abc123"}`))
	}))
	defer srv.Close()
	client := &Client{httpClient: srv.Client()}
	_, err := client.ComposeDeploy(context.Background(), srv.URL, "token", req)
	if err != nil {
		t.Fatalf("compose deploy failed: %v", err)
	}
	if captured == "" {
		t.Fatal("no captured body")
	}
	// Simple check that allowedMounts appears
	if len(captured) == 0 || !contains(captured, "allowedMounts") {
		t.Fatalf("expected allowedMounts in body, got %q", captured)
	}
	if !contains(captured, "isAdmin") {
		t.Fatalf("expected isAdmin in body, got %q", captured)
	}
}

func TestComposeDeleteWithOptions_QueryBuilding(t *testing.T) {
	tests := []struct {
		volumes       bool
		removeOrphans bool
		expectedQuery string
	}{
		{false, false, ""},
		{true, false, "volumes=true"},
		{false, true, "removeOrphans=true"},
		{true, true, "removeOrphans=true&volumes=true"}, // order may vary due to url.Values sorting
	}
	for _, tc := range tests {
		var capturedPath string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			capturedPath = r.URL.RequestURI()
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"stackId":"cps-abc"}`))
		}))
		client := &Client{httpClient: srv.Client()}
		_, err := client.ComposeDeleteWithOptions(context.Background(), srv.URL, "token", "cps-abc", tc.volumes, tc.removeOrphans)
		srv.Close()
		if err != nil {
			t.Fatalf("delete failed: %v", err)
		}
		u, _ := url.Parse(capturedPath)
		q := u.Query()
		if tc.volumes && q.Get("volumes") != "true" {
			t.Errorf("volumes=true expected in query %q", capturedPath)
		}
		if !tc.volumes && q.Get("volumes") != "" {
			t.Errorf("unexpected volumes param in %q", capturedPath)
		}
		if tc.removeOrphans && q.Get("removeOrphans") != "true" {
			t.Errorf("removeOrphans=true expected in query %q", capturedPath)
		}
		if !tc.removeOrphans && q.Get("removeOrphans") != "" {
			t.Errorf("unexpected removeOrphans param in %q", capturedPath)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && indexOf(s, substr) >= 0
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
