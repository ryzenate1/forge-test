package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	acmesvc "gamepanel/forge/internal/services/acme"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHTTPSolverMounted(t *testing.T) {
	svc := acmesvc.New(nil, nil)
	require.NotNil(t, svc.HTTPSolver(), "acme service must expose HTTPSolver handler (F-NET-09)")

	// Simulate domain challenge present
	h := svc.HTTPSolver()
	// The handler implements Present/CleanUp; we can use the httpChallenger directly via type assertion to method
	// But we can go through the public API: we know it's http.Handler that stores tokens keyed by token+"/"+domain
	// To test mounting, we use http.NewServer which mounts the handler via registerAcmeChallengeRoute

	// Build a minimal app that mirrors NewServer's acme route mounting
	app := fiber.New()
	registerAcmeChallengeRoute(app, svc)

	// Present a challenge token for a domain
	token := "test-token-123"
	keyAuth := "test-token-123.keyAuthData"
	// Directly call Present via the underlying challenger by using ServeHTTP's internal map.
	// Since httpChallenger is private, we drive it via the HTTP provider setup:
	// For test, we can call Present via type assertion if we expose it, but we can also
	// simulate by calling the handler's Present directly through the service's internal challenger
	// We hack by using the http.Handler's ServeHTTP after manually injecting token via Present.
	// The httpChallenger type is unexported but we can use the fact that svc.HTTPSolver().(interface{Present}) exists.
	// Instead, we will call Present by casting to the known struct via reflection: we know it's *httpChallenger
	// So we just use the HTTP handler's behavior: after Present, ServeHTTP should return keyAuth for correct Host and path.

	// Use a small helper: call the challenger's Present via interface if available
	if presenter, ok := h.(interface {
		Present(domain, token, keyAuth string) error
	}); ok {
		require.NoError(t, presenter.Present("example.com", token, keyAuth))
	} else {
		t.Fatal("HTTPSolver does not implement Present")
	}

	// Test via net/http directly: handler should serve keyAuth for correct host
	req := httptest.NewRequest(http.MethodGet, "/.well-known/acme-challenge/"+token, nil)
	req.Host = "example.com"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, keyAuth, w.Body.String())

	// Test via Fiber app: should also be mounted and serve
	fReq := httptest.NewRequest(http.MethodGet, "/.well-known/acme-challenge/"+token, nil)
	fReq.Host = "example.com"
	resp, err := app.Test(fReq, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body := make([]byte, 1024)
	n, _ := resp.Body.Read(body)
	assert.Equal(t, keyAuth, string(body[:n]))

	// Test non-existent token returns 404
	req2 := httptest.NewRequest(http.MethodGet, "/.well-known/acme-challenge/notfound", nil)
	req2.Host = "example.com"
	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusNotFound, w2.Code)

	// Fiber 404 case
	fReq2 := httptest.NewRequest(http.MethodGet, "/.well-known/acme-challenge/notfound", nil)
	fReq2.Host = "example.com"
	resp2, err := app.Test(fReq2, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp2.StatusCode)

	// CleanUp should remove token
	if cleaner, ok := h.(interface {
		CleanUp(domain, token, keyAuth string) error
	}); ok {
		require.NoError(t, cleaner.CleanUp("example.com", token, keyAuth))
	}
	w3 := httptest.NewRecorder()
	h.ServeHTTP(w3, req)
	assert.Equal(t, http.StatusNotFound, w3.Code)
}

func TestAcmeChallengeRouteNotMountedWhenServiceNil(t *testing.T) {
	app := fiber.New()
	// Should not panic when service is nil
	registerAcmeChallengeRoute(app, nil)
	// Even without service, app should still start; request to challenge path should 404 (not mounted)
	req := httptest.NewRequest(http.MethodGet, "/.well-known/acme-challenge/token", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	// Without handler, Fiber returns 404
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
