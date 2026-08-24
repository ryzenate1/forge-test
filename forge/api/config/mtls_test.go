package config

import (
	"testing"
)

func TestMTLSConfig_ProductionPanics(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("MTLS_DEV_BYPASS", "true")
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("expected panic when MTLS_DEV_BYPASS true in production")
		}
	}()
	_ = MTLSConfig()
}

func TestMTLSConfig_DevAllowed(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("MTLS_DEV_BYPASS", "true")
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("unexpected panic in development: %v", r)
		}
	}()
	cfg := MTLSConfig()
	if !cfg.DevBypass {
		t.Fatalf("expected DevBypass true in dev")
	}
}

func TestValidateMTLS_ProductionReturnsError(t *testing.T) {
	cfg := MTLS{DevBypass: true}
	if err := ValidateMTLS(cfg, "production"); err == nil {
		t.Fatalf("expected error for production with DevBypass")
	}
	if err := ValidateMTLS(cfg, "Production"); err == nil {
		t.Fatalf("expected error for case-insensitive Production")
	}
	if err := ValidateMTLS(cfg, "development"); err != nil {
		t.Fatalf("unexpected error for development: %v", err)
	}
}

func TestMTLSConfig_ForgeEnvIgnored(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("FORGE_ENV", "production")
	t.Setenv("MTLS_DEV_BYPASS", "true")
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("FORGE_ENV should be ignored, got panic: %v", r)
		}
	}()
	_ = MTLSConfig()
}

func TestMTLSConfig_ApiAliasProductionPanics(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("MTLS_DEV_BYPASS", "false")
	t.Setenv("API_MTLS_DEV_BYPASS", "true")
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("expected panic when API_MTLS_DEV_BYPASS true in production")
		}
	}()
	_ = MTLSConfig()
}

func TestValidateMTLS_ApiAliasEnv(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("API_MTLS_DEV_BYPASS", "true")
	t.Setenv("MTLS_DEV_BYPASS", "false")
	cfg := MTLS{DevBypass: false}
	if err := ValidateMTLS(cfg, "production"); err == nil {
		t.Fatalf("expected error for API_MTLS_DEV_BYPASS in production")
	}
}
