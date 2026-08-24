package http

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestGetWebSocketAllowedOrigins_MergesPanelAndCORS(t *testing.T) {
	origCORS := os.Getenv("API_CORS_ALLOWED_ORIGINS")
	origWS := os.Getenv("API_WS_ALLOWED_ORIGINS")
	origPanel := os.Getenv("PANEL_URL")
	t.Cleanup(func() {
		os.Setenv("API_CORS_ALLOWED_ORIGINS", origCORS)
		os.Setenv("API_WS_ALLOWED_ORIGINS", origWS)
		os.Setenv("PANEL_URL", origPanel)
	})

	os.Setenv("API_CORS_ALLOWED_ORIGINS", "https://cors.example.com")
	os.Setenv("PANEL_URL", "https://panel.example.com")
	os.Setenv("API_WS_ALLOWED_ORIGINS", "")

	cfg := Config{
		AppEnv:   "development",
		PanelURL: "https://panel.example.com",
		CORSConfig: CORSConfig{
			AllowedOrigins: []string{"https://cors.example.com"},
		},
	}
	allowed := getWebSocketAllowedOrigins(cfg)
	assertContains := func(want string) {
		for _, a := range allowed {
			if strings.EqualFold(a, want) {
				return
			}
		}
		t.Fatalf("allowed origins %v does not contain %q", allowed, want)
	}
	assertContains("https://panel.example.com")
	assertContains("https://cors.example.com")

	// Explicit WS env should also be included
	os.Setenv("API_WS_ALLOWED_ORIGINS", "https://ws.example.com")
	allowed = getWebSocketAllowedOrigins(cfg)
	assertContains("https://ws.example.com")
	// Panel URL still present even with explicit WS env (merged)
	assertContains("https://panel.example.com")

	// Wildcard stripped in production
	os.Setenv("API_WS_ALLOWED_ORIGINS", "*, https://panel.example.com")
	cfg.AppEnv = "production"
	allowed = getWebSocketAllowedOrigins(cfg)
	for _, a := range allowed {
		if a == "*" {
			t.Fatal("wildcard should be stripped in production")
		}
	}
	assertContains("https://panel.example.com")
}

func TestValidateWebSocketOrigin_CookieRequiresOrigin(t *testing.T) {
	os.Setenv("PANEL_URL", "https://panel.example.com")
	os.Setenv("API_WS_ALLOWED_ORIGINS", "https://panel.example.com")
	cfg := Config{
		AppEnv:     "development",
		PanelURL:   "https://panel.example.com",
		CORSConfig: CORSConfig{AllowedOrigins: []string{"https://panel.example.com"}},
	}
	allowed := getWebSocketAllowedOrigins(cfg)

	// Cookie auth + missing origin -> 403
	if err := validateWebSocketOrigin("", allowed, true); err == nil {
		t.Fatal("expected error for missing origin with cookie auth")
	}
	// Token auth + missing origin -> allowed
	if err := validateWebSocketOrigin("", allowed, false); err != nil {
		t.Fatalf("token auth should allow missing origin: %v", err)
	}
	// Cookie auth + allowed origin -> ok
	if err := validateWebSocketOrigin("https://panel.example.com", allowed, true); err != nil {
		t.Fatalf("allowed origin should pass: %v", err)
	}
	// Cookie auth + disallowed origin -> 403
	if err := validateWebSocketOrigin("https://evil.example.com", allowed, true); err == nil {
		t.Fatal("disallowed origin should be rejected")
	}
	// Token auth + disallowed origin -> also 403 (defense in depth)
	if err := validateWebSocketOrigin("https://evil.example.com", allowed, false); err == nil {
		t.Fatal("token auth with disallowed origin should still be rejected")
	}
	// Invalid origin format -> 403
	if err := validateWebSocketOrigin("://invalid", allowed, false); err == nil {
		t.Fatal("invalid origin should be rejected")
	}
}

func TestWSOriginMiddleware_Integration(t *testing.T) {
	os.Setenv("PANEL_URL", "https://panel.example.com")
	os.Setenv("API_WS_ALLOWED_ORIGINS", "https://panel.example.com")
	os.Unsetenv("API_CORS_ALLOWED_ORIGINS")
	cfg := Config{
		AppEnv:     "development",
		PanelURL:   "https://panel.example.com",
		CORSConfig: CORSConfig{AllowedOrigins: []string{"https://panel.example.com"}},
	}

	app := fiber.New()
	// Simulate protected route with authSource cookie
	app.Get("/ws-cookie", func(c *fiber.Ctx) error {
		c.Locals("authSource", authSourceCookieSession)
		return c.Next()
	}, wsOriginMiddleware(cfg), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	app.Get("/ws-token", func(c *fiber.Ctx) error {
		c.Locals("authSource", authSourceAPIKey)
		return c.Next()
	}, wsOriginMiddleware(cfg), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	// Also test fallback detection via Cookie header when no authSource
	app.Get("/ws-fallback-cookie", wsOriginMiddleware(cfg), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	tests := []struct {
		name       string
		path       string
		origin     string
		cookie     string
		authHeader string
		wantCode   int
	}{
		{"cookie allowed origin", "/ws-cookie", "https://panel.example.com", "", "", 200},
		{"cookie disallowed origin", "/ws-cookie", "https://evil.com", "", "", 403},
		{"cookie missing origin", "/ws-cookie", "", "", "", 403},
		{"token allowed origin", "/ws-token", "https://panel.example.com", "", "", 200},
		{"token disallowed origin", "/ws-token", "https://evil.com", "", "", 403},
		{"token missing origin allowed", "/ws-token", "", "", "", 200},
		{"fallback cookie missing origin via Cookie header", "/ws-fallback-cookie", "", "forge_session=abc", "", 403},
		{"fallback token missing origin via Bearer", "/ws-fallback-cookie", "", "", "Bearer tok", 200},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.cookie != "" {
				req.Header.Set("Cookie", tt.cookie)
			}
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != tt.wantCode {
				t.Fatalf("got %d want %d for %s", resp.StatusCode, tt.wantCode, tt.name)
			}
		})
	}
}

func TestSameSiteNone_StillRequiresOrigin(t *testing.T) {
	// Even when SameSite=None, cookie WS must require origin
	os.Setenv("SESSION_COOKIE_SAME_SITE", "none")
	os.Setenv("SESSION_COOKIE_SECURE", "true")
	defer os.Unsetenv("SESSION_COOKIE_SAME_SITE")
	defer os.Unsetenv("SESSION_COOKIE_SECURE")

	cfg := Config{
		AppEnv:     "development",
		PanelURL:   "https://panel.example.com",
		CORSConfig: CORSConfig{AllowedOrigins: []string{"https://panel.example.com"}},
	}
	os.Setenv("PANEL_URL", "https://panel.example.com")
	os.Setenv("API_WS_ALLOWED_ORIGINS", "https://panel.example.com")
	allowed := getWebSocketAllowedOrigins(cfg)
	// Simulate cookie session with SameSite None but missing origin -> still rejected
	if err := validateWebSocketOrigin("", allowed, true); err == nil {
		t.Fatal("SameSite=None should not bypass origin check for missing origin")
	}
	// Correct origin passes
	if err := validateWebSocketOrigin("https://panel.example.com", allowed, true); err != nil {
		t.Fatalf("valid origin should pass even with SameSite=None: %v", err)
	}
	// Evil origin still blocked
	if err := validateWebSocketOrigin("https://evil.com", allowed, true); err == nil {
		t.Fatal("evil origin should be blocked even with SameSite=None")
	}
	// Ensure cookie config reflects None
	sessCfg := LoadSessionCookieConfig()
	if sessCfg.SameSite != http.SameSiteNoneMode {
		t.Fatalf("expected SameSite None, got %v", sessCfg.SameSite)
	}
}
