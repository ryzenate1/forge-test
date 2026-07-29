package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gamepanel/beacon/internal/tokens"
)

const testServerID = "123e4567-e89b-12d3-a456-426614174000"

func newTestHandler(t *testing.T, token ...string) http.Handler {
	t.Helper()
	_, handler := NewServer(nil, t.TempDir(), token...)
	return handler
}

func newTestHandlerWithDir(t *testing.T, dataDir string, token ...string) http.Handler {
	t.Helper()
	_, handler := NewServer(nil, dataDir, token...)
	return handler
}

func TestHealth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	newTestHandler(t).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}

func TestMetricsRequireAuthenticationWhenTokenConfigured(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	newTestHandler(t, "secret").ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "game_panel_daemon_uptime_seconds") {
		t.Fatalf("unauthenticated response leaked daemon metrics: %q", rec.Body.String())
	}
}

func TestPowerRejectsInvalidSignal(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/servers/"+testServerID+"/power", strings.NewReader(`{"signal":"explode"}`))
	rec := httptest.NewRecorder()

	newTestHandler(t).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}
}

func TestCreateRejectsUnavailableRuntime(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(`{"serverId":"`+testServerID+`","image":"busybox","memoryMb":128,"cpuShares":128}`))
	rec := httptest.NewRecorder()

	newTestHandler(t).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}
}

func TestSignedRequestsAreRequiredWhenTokenConfigured(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/servers", strings.NewReader(`{"serverId":"`+testServerID+`","image":"busybox"}`))
	rec := httptest.NewRecorder()

	newTestHandler(t, "secret").ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestSignedRequestReachesUnavailableRuntime(t *testing.T) {
	body := []byte(`{"serverId":"` + testServerID + `","image":"busybox"}`)
	req := httptest.NewRequest(http.MethodPost, "/servers", bytes.NewReader(body))
	timestamp := time.Now().UTC().Format(time.RFC3339)
	nonce := "0123456789abcdef0123456789abcdef"
	req.Header.Set("X-Panel-Timestamp", timestamp)
	req.Header.Set("X-Panel-Nonce", nonce)
	req.Header.Set("X-Panel-Signature", sign("secret", req.Method, req.URL.RequestURI(), timestamp, body, nonce))
	rec := httptest.NewRecorder()

	newTestHandler(t, "secret").ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}
}

func TestSignedRequestNonceCannotBeReplayed(t *testing.T) {
	body := []byte(`{"serverId":"` + testServerID + `","image":"busybox"}`)
	timestamp := time.Now().UTC().Format(time.RFC3339)
	nonce := "abcdef0123456789abcdef0123456789"
	handler := newTestHandler(t, "secret")
	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/servers", bytes.NewReader(body))
		req.Header.Set("X-Panel-Timestamp", timestamp)
		req.Header.Set("X-Panel-Nonce", nonce)
		req.Header.Set("X-Panel-Signature", sign("secret", req.Method, req.URL.RequestURI(), timestamp, body, nonce))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}
	if status := send(); status == http.StatusUnauthorized {
		t.Fatalf("first signed request was rejected as replay")
	}
	if status := send(); status != http.StatusUnauthorized {
		t.Fatalf("replayed signed request status = %d, want 401", status)
	}
}

func TestWebSocketOriginValidation(t *testing.T) {
	previous := allowedWebSocketOrigins
	allowedWebSocketOrigins = []string{"https://panel.example"}
	t.Cleanup(func() { allowedWebSocketOrigins = previous })
	for origin, want := range map[string]bool{
		"":                      true,
		"https://panel.example": true,
		"https://evil.example":  false,
		"://invalid":            false,
	} {
		req := httptest.NewRequest(http.MethodGet, "/ws", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if got := websocketUpgrader.CheckOrigin(req); got != want {
			t.Errorf("origin %q accepted=%t, want %t", origin, got, want)
		}
	}
}

func TestContainerExecRejectsInterpreterBeforeDockerAccess(t *testing.T) {
	body := []byte(`{"cmd":["python","-c","print(1)"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/containers/example/exec", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	timestamp := time.Now().UTC().Format(time.RFC3339)
	nonce := "11111111111111111111111111111111"
	req.Header.Set("X-Panel-Timestamp", timestamp)
	req.Header.Set("X-Panel-Nonce", nonce)
	req.Header.Set("X-Panel-Signature", sign("secret", req.Method, req.URL.RequestURI(), timestamp, body, nonce))
	rec := httptest.NewRecorder()
	newTestHandler(t, "secret").ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("interpreter exec status = %d, want 403; body=%s", rec.Code, rec.Body.String())
	}
}

func TestScopedWebSocketTokenReachesRouteWithoutPanelSignature(t *testing.T) {
	server, handler := NewServer(&stubRuntime{}, t.TempDir(), "secret")
	generator := tokens.NewGenerator([]byte("secret"))
	server.SetTokenGenerator(generator)
	token, err := generator.GenerateWebsocket(testServerID, "user-1", time.Minute)
	if err != nil {
		t.Fatalf("generate websocket token: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/servers/"+testServerID+"/ws/stats?token="+token, nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected websocket upgrade to reach route and fail with 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "signature") {
		t.Fatalf("scoped websocket request was incorrectly handled as panel HMAC: %s", rec.Body.String())
	}
}

func TestFileAPIRejectsPathTraversal(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/servers/"+testServerID+"/files?path=../outside", nil)
	rec := httptest.NewRecorder()

	newTestHandler(t).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}
}

func TestFileAPIRejectsSymlinkEscape(t *testing.T) {
	dataDir := t.TempDir()
	serverDir := filepath.Join(dataDir, testServerID)
	if err := os.MkdirAll(serverDir, 0o750); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	link := filepath.Join(serverDir, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/servers/"+testServerID+"/files?path=escape", nil)
	rec := httptest.NewRecorder()

	newTestHandlerWithDir(t, dataDir).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}
}

func TestChunkedUploadAssemblesFile(t *testing.T) {
	dataDir := t.TempDir()
	handler := newTestHandlerWithDir(t, dataDir)

	first := httptest.NewRequest(http.MethodPut, "/servers/"+testServerID+"/files/upload?path=config/server.properties&uploadId=test-upload&offset=0&final=false", strings.NewReader("hello "))
	firstRec := httptest.NewRecorder()
	handler.ServeHTTP(firstRec, first)
	if firstRec.Code != http.StatusOK {
		t.Fatalf("expected first chunk status 200, got %d", firstRec.Code)
	}

	second := httptest.NewRequest(http.MethodPut, "/servers/"+testServerID+"/files/upload?path=config/server.properties&uploadId=test-upload&offset=6&final=true", strings.NewReader("world"))
	secondRec := httptest.NewRecorder()
	handler.ServeHTTP(secondRec, second)
	if secondRec.Code != http.StatusOK {
		t.Fatalf("expected final chunk status 200, got %d", secondRec.Code)
	}

	body, err := os.ReadFile(filepath.Join(dataDir, testServerID, "config", "server.properties"))
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "hello world" {
		t.Fatalf("unexpected file body %q", body)
	}
}

func TestChunkedUploadRejectsOffsetMismatch(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodPut, "/servers/"+testServerID+"/files/upload?path=server.properties&uploadId=test-upload&offset=12&final=false", strings.NewReader("hello"))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", rec.Code)
	}
}
