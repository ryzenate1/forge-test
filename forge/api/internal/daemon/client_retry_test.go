package daemon

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

// countingTransport counts requests and can fail the first N attempts.
type countingTransport struct {
	failures   int
	statusCode int
	requests   int
	lastReq    *http.Request
}

func (c *countingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	c.requests++
	c.lastReq = req
	if c.requests <= c.failures {
		return nil, errors.New("transport error")
	}
	return &http.Response{
		StatusCode: c.statusCode,
		Body:       io.NopCloser(strings.NewReader("{}")),
		Header:     http.Header{},
		Request:    req,
	}, nil
}

func newTestRetryClient(base *countingTransport) *retryRoundTripper {
	return &retryRoundTripper{base: base}
}

func shortenBackoff(t *testing.T) {
	t.Helper()
	origBase, origMax := baseBackoff, maxBackoff
	baseBackoff = time.Millisecond
	maxBackoff = 2 * time.Millisecond
	t.Cleanup(func() {
		baseBackoff = origBase
		maxBackoff = origMax
	})
}

func fastRequest(t *testing.T, method, target string) *http.Request {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), method, "http://127.0.0.1:1"+target, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	return req
}

func TestRetryRoundTripper_RetriesIdempotentMethods(t *testing.T) {
	shortenBackoff(t)
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			base := &countingTransport{failures: 1, statusCode: http.StatusOK}
			rt := newTestRetryClient(base)
			resp, err := rt.RoundTrip(fastRequest(t, method, "/ping"))
			if err != nil {
				t.Fatalf("expected retry to succeed, got %v", err)
			}
			resp.Body.Close()
			if base.requests != 2 {
				t.Fatalf("requests = %d, want 2 (initial + 1 retry)", base.requests)
			}
		})
	}
}

func TestRetryRoundTripper_DoesNotRetryBlindPOST(t *testing.T) {
	base := &countingTransport{failures: 1, statusCode: http.StatusOK}
	rt := newTestRetryClient(base)
	_, err := rt.RoundTrip(fastRequest(t, http.MethodPost, "/servers/srv-1/power"))
	if err == nil {
		t.Fatal("expected transport error to surface without retry")
	}
	if base.requests != 1 {
		t.Fatalf("requests = %d, want 1 (no blind POST retries)", base.requests)
	}
}

func TestRetryRoundTripper_DoesNotRetryBlindPATCH(t *testing.T) {
	base := &countingTransport{failures: 1, statusCode: http.StatusOK}
	rt := newTestRetryClient(base)
	_, err := rt.RoundTrip(fastRequest(t, http.MethodPatch, "/files/rename"))
	if err == nil {
		t.Fatal("expected transport error to surface without retry")
	}
	if base.requests != 1 {
		t.Fatalf("requests = %d, want 1", base.requests)
	}
}

func TestRetryRoundTripper_RetriesPOSTWithCommandID(t *testing.T) {
	base := &countingTransport{failures: 1, statusCode: http.StatusOK}
	rt := newTestRetryClient(base)
	req := fastRequest(t, http.MethodPost, "/servers/srv-1/power")
	req.Header.Set("X-Forge-Command-ID", "op-123")
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatalf("expected idempotent POST to be retried, got %v", err)
	}
	resp.Body.Close()
	if base.requests != 2 {
		t.Fatalf("requests = %d, want 2", base.requests)
	}
}

func TestRetryRoundTripper_RetriesPOSTWithIdempotencyKey(t *testing.T) {
	base := &countingTransport{failures: 1, statusCode: http.StatusOK}
	rt := newTestRetryClient(base)
	req := fastRequest(t, http.MethodPost, "/servers")
	req.Header.Set("Idempotency-Key", "create:srv-9")
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatalf("expected keyed POST to be retried, got %v", err)
	}
	resp.Body.Close()
	if base.requests != 2 {
		t.Fatalf("requests = %d, want 2", base.requests)
	}
}

func TestRetryRoundTripper_RetriesRetryableStatusOnlyForSafeRequests(t *testing.T) {
	shortenBackoff(t)
	t.Run("GET retried on 503 then gives up after budget", func(t *testing.T) {
		base := &countingTransport{failures: 0, statusCode: http.StatusServiceUnavailable}
		rt := newTestRetryClient(base)
		resp, err := rt.RoundTrip(fastRequest(t, http.MethodGet, "/stats"))
		if err == nil {
			resp.Body.Close()
			t.Fatal("expected exhaustion error after retry budget")
		}
		if base.requests != maxRetries+1 {
			t.Fatalf("requests = %d, want %d", base.requests, maxRetries+1)
		}
	})
	t.Run("POST without key not retried on 503", func(t *testing.T) {
		base := &countingTransport{failures: 0, statusCode: http.StatusServiceUnavailable}
		rt := newTestRetryClient(base)
		resp, err := rt.RoundTrip(fastRequest(t, http.MethodPost, "/command"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want 503 surfaced as-is", resp.StatusCode)
		}
		if base.requests != 1 {
			t.Fatalf("requests = %d, want 1", base.requests)
		}
	})
	t.Run("POST with command-ID retried on 503", func(t *testing.T) {
		base := &countingTransport{failures: 0, statusCode: http.StatusServiceUnavailable}
		rt := newTestRetryClient(base)
		req := fastRequest(t, http.MethodPost, "/power")
		req.Header.Set("X-Forge-Command-ID", "op-42")
		resp, err := rt.RoundTrip(req)
		if err == nil {
			resp.Body.Close()
			t.Fatal("expected exhaustion error after retry budget")
		}
		if base.requests != maxRetries+1 {
			t.Fatalf("requests = %d, want %d", base.requests, maxRetries+1)
		}
	})
	t.Run("non-retryable status returned immediately", func(t *testing.T) {
		base := &countingTransport{failures: 0, statusCode: http.StatusBadRequest}
		rt := newTestRetryClient(base)
		resp, err := rt.RoundTrip(fastRequest(t, http.MethodGet, "/x"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		defer resp.Body.Close()
		if base.requests != 1 {
			t.Fatalf("requests = %d, want 1", base.requests)
		}
	})
}

func TestIsIdempotentMethod(t *testing.T) {
	idempotent := map[string]bool{
		http.MethodGet: true, http.MethodHead: true, http.MethodPut: true,
		http.MethodDelete: true, http.MethodOptions: true, http.MethodTrace: true,
		http.MethodPost: false, http.MethodPatch: false,
	}
	for method, want := range idempotent {
		if got := isIdempotentMethod(method); got != want {
			t.Fatalf("isIdempotentMethod(%q) = %v, want %v", method, got, want)
		}
	}
}

func TestValidateNodeURL_HTTPAllowedOnlyForLoopbackTargets(t *testing.T) {
	client := &Client{}
	cases := []struct {
		raw     string
		wantErr bool
	}{
		{"http://127.0.0.1:9090/servers", false},
		{"http://localhost:9090/servers", false},
		{"http://[::1]:9090/servers", false},
		{"https://beacon.example.com/servers", false},
		{"http://beacon.example.com/servers", true},
		{"http://10.1.2.3:9090/servers", true},
		{"http://192.168.1.10:9090/servers", true},
		{"ftp://beacon.example.com", true},
		{"http://user:pass@beacon.example.com", true},
	}
	for _, tc := range cases {
		parsed, err := url.Parse(tc.raw)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.raw, err)
		}
		err = client.validateNodeURL(parsed)
		if tc.wantErr && err == nil {
			t.Errorf("validateNodeURL(%q) = nil, want error", tc.raw)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("validateNodeURL(%q) = %v, want nil", tc.raw, err)
		}
	}
}

func TestValidateNodeURL_IndependentOfClientDefaultBase(t *testing.T) {
	// A client configured with a loopback default must NOT relax TLS for a
	// remote target: the decision is per request target host.
	client := &Client{defaultBaseURL: "http://127.0.0.1:9090", loopback: true}
	remote, _ := url.Parse("http://203.0.113.5:9090/servers")
	if err := client.validateNodeURL(remote); err == nil {
		t.Fatal("remote plain-HTTP target should be rejected even for loopback-configured clients")
	}
	local, _ := url.Parse("http://127.0.0.1:9090/servers")
	if err := client.validateNodeURL(local); err != nil {
		t.Fatalf("loopback target should be allowed: %v", err)
	}
}

func TestCreateServerAttachesCommandIDContext(t *testing.T) {
	base := &countingTransport{failures: 0, statusCode: http.StatusOK}
	client := &Client{httpClient: &http.Client{Transport: newRetryRoundTripper(base, nil)}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = client.CreateServer(ctx, "http://127.0.0.1:1", "token", CreateRequest{ServerID: "srv-cmd"})
	if base.lastReq == nil {
		t.Fatal("no request observed")
	}
	if got := base.lastReq.Header.Get("X-Forge-Command-ID"); got != "create:srv-cmd" {
		t.Fatalf("X-Forge-Command-ID = %q, want %q", got, "create:srv-cmd")
	}
	if got := base.lastReq.Header.Get("Idempotency-Key"); got == "" {
		t.Fatal("Idempotency-Key header missing; POST would not be safely retryable")
	}
}
