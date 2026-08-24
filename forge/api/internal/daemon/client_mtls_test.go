package daemon

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func generateCATest(t testing.TB) ([]byte, []byte, *x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate CA key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "TestCA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour * 24),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create CA: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse CA: %v", err)
	}
	return certPEM, keyPEM, cert, key
}

func generateLeafTest(t testing.TB, caCert *x509.Certificate, caKey *rsa.PrivateKey, commonName string, isClient bool, hosts []string) ([]byte, []byte) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate leaf key: %v", err)
	}
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	template := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: commonName},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour * 24),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		BasicConstraintsValid: true,
	}
	if isClient {
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	} else {
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
		template.DNSNames = hosts
		template.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
	}
	der, err := x509.CreateCertificate(rand.Reader, template, caCert, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create leaf: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return certPEM, keyPEM
}

func writeTempFile(t testing.TB, dir, name string, data []byte, perm os.FileMode) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, perm); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

func TestDaemonMTLSConfig_DisabledReturnsNil(t *testing.T) {
	t.Setenv("MTLS_ENABLED", "false")
	t.Setenv("MTLS_CA_CERT", "")
	t.Setenv("MTLS_CERT", "")
	t.Setenv("MTLS_KEY", "")
	cfg, err := daemonMTLSConfig()
	if err != nil {
		t.Fatalf("unexpected error when disabled: %v", err)
	}
	if cfg != nil {
		t.Fatalf("expected nil config when disabled, got %+v", cfg)
	}
}

func TestDaemonMTLSConfig_EnabledValidLoads(t *testing.T) {
	dir := t.TempDir()
	caPEM, _, caCert, caKey := generateCATest(t)
	clientCertPEM, clientKeyPEM := generateLeafTest(t, caCert, caKey, "panel", true, nil)
	caPath := writeTempFile(t, dir, "ca.pem", caPEM, 0o600)
	certPath := writeTempFile(t, dir, "client.pem", clientCertPEM, 0o600)
	keyPath := writeTempFile(t, dir, "client.key", clientKeyPEM, 0o600)

	t.Setenv("MTLS_ENABLED", "true")
	t.Setenv("MTLS_CA_CERT", caPath)
	t.Setenv("MTLS_CERT", certPath)
	t.Setenv("MTLS_KEY", keyPath)

	cfg, err := daemonMTLSConfig()
	if err != nil {
		t.Fatalf("daemonMTLSConfig: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected config, got nil")
	}
	if cfg.RootCAs == nil {
		t.Fatal("expected RootCAs")
	}
	if len(cfg.Certificates) != 1 {
		t.Fatalf("expected 1 certificate, got %d", len(cfg.Certificates))
	}
	if cfg.GetClientCertificate == nil {
		t.Fatal("expected GetClientCertificate")
	}
	// Verify GetClientCertificate reloads correctly
	cert, err := cfg.GetClientCertificate(nil)
	if err != nil {
		t.Fatalf("GetClientCertificate: %v", err)
	}
	if cert == nil {
		t.Fatal("expected cert from callback")
	}
}

func TestDaemonMTLSConfig_EnabledMissingCertFails(t *testing.T) {
	t.Setenv("MTLS_ENABLED", "true")
	t.Setenv("MTLS_CA_CERT", "/nonexistent/ca.pem")
	t.Setenv("MTLS_CERT", "/nonexistent/client.pem")
	t.Setenv("MTLS_KEY", "/nonexistent/client.key")
	_, err := daemonMTLSConfig()
	if err == nil {
		t.Fatal("expected error when cert files missing")
	}
}

func TestDaemonMTLSConfig_EnabledBadPermsFails(t *testing.T) {
	dir := t.TempDir()
	caPEM, _, caCert, caKey := generateCATest(t)
	clientCertPEM, clientKeyPEM := generateLeafTest(t, caCert, caKey, "panel", true, nil)
	caPath := writeTempFile(t, dir, "ca.pem", caPEM, 0o600)
	certPath := writeTempFile(t, dir, "client.pem", clientCertPEM, 0o600)
	keyPath := writeTempFile(t, dir, "client.key", clientKeyPEM, 0o644) // bad perm

	t.Setenv("MTLS_ENABLED", "true")
	t.Setenv("MTLS_CA_CERT", caPath)
	t.Setenv("MTLS_CERT", certPath)
	t.Setenv("MTLS_KEY", keyPath)
	_, err := daemonMTLSConfig()
	if err == nil {
		t.Fatal("expected error for bad key perms")
	}
}

func TestDaemonTransport_UsesMTLSWhenEnabled(t *testing.T) {
	dir := t.TempDir()
	caPEM, _, caCert, caKey := generateCATest(t)
	clientCertPEM, clientKeyPEM := generateLeafTest(t, caCert, caKey, "panel", true, nil)
	caPath := writeTempFile(t, dir, "ca.pem", caPEM, 0o600)
	certPath := writeTempFile(t, dir, "client.pem", clientCertPEM, 0o600)
	keyPath := writeTempFile(t, dir, "client.key", clientKeyPEM, 0o600)

	t.Setenv("MTLS_ENABLED", "true")
	t.Setenv("MTLS_CA_CERT", caPath)
	t.Setenv("MTLS_CERT", certPath)
	t.Setenv("MTLS_KEY", keyPath)

	tr, err := daemonTransport()
	if err != nil {
		t.Fatalf("daemonTransport: %v", err)
	}
	if tr.TLSClientConfig == nil || tr.TLSClientConfig.RootCAs == nil || len(tr.TLSClientConfig.Certificates) == 0 {
		t.Fatal("expected mTLS TLS config in transport")
	}
	// Disabled case
	t.Setenv("MTLS_ENABLED", "false")
	tr2, err := daemonTransport()
	if err != nil {
		t.Fatalf("daemonTransport disabled: %v", err)
	}
	if tr2.TLSClientConfig.RootCAs != nil || len(tr2.TLSClientConfig.Certificates) != 0 {
		t.Fatalf("disabled transport should not have mTLS, got RootCAs=%v certs=%d", tr2.TLSClientConfig.RootCAs, len(tr2.TLSClientConfig.Certificates))
	}
}

// TestDaemonMTLSIntegration_ValidCertPasses validates that a valid client cert
// is presented and the TLS handshake succeeds. Invalid/missing cert cases are
// tested to fail, while HMAC-only mode still passes when mTLS disabled.
func TestDaemonMTLSIntegration_ValidCertPasses(t *testing.T) {
	_ = t.TempDir()
	caPEM, _, caCert, caKey := generateCATest(t)
	serverCertPEM, serverKeyPEM := generateLeafTest(t, caCert, caKey, "beacon", false, []string{"localhost"})
	clientCertPEM, clientKeyPEM := generateLeafTest(t, caCert, caKey, "panel", true, nil)
	// also generate a bad CA/client for negative test
	badCAPEM, _, badCACert, badCAKey := generateCATest(t)
	badClientCertPEM, badClientKeyPEM := generateLeafTest(t, badCACert, badCAKey, "panel-bad", true, nil)

	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caPEM)
	// Server TLS config requiring client cert
	serverCert, _ := tls.X509KeyPair(serverCertPEM, serverKeyPEM)
	serverTLS := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    caPool,
		MinVersion:   tls.VersionTLS12,
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Also verify HMAC-like header present for defense-in-depth check
		if r.Header.Get("X-Panel-Signature") == "" {
			http.Error(w, "missing HMAC", http.StatusUnauthorized)
			return
		}
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			http.Error(w, "missing client cert", http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	srv := httptest.NewUnstartedServer(handler)
	srv.TLS = serverTLS
	srv.StartTLS()
	defer srv.Close()

	// Helper to build a client TLS config similar to daemonMTLSConfig but for test
	buildClientTLS := func(caPEM, certPEM, keyPEM []byte) *tls.Config {
		pool := x509.NewCertPool()
		pool.AppendCertsFromPEM(caPEM)
		cert, _ := tls.X509KeyPair(certPEM, keyPEM)
		return &tls.Config{
			RootCAs:      pool,
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS12,
			ServerName:   "localhost",
		}
	}

	// Positive: valid cert + HMAC passes
	t.Run("valid cert passes", func(t *testing.T) {
		tlsCfg := buildClientTLS(caPEM, clientCertPEM, clientKeyPEM)
		client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsCfg}}
		req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
		req.Header.Set("X-Panel-Signature", "dummy-hmac-for-test")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("valid cert request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("valid cert status=%d, want 200", resp.StatusCode)
		}
	})

	// Negative: invalid cert (signed by different CA) fails handshake
	t.Run("invalid cert fails", func(t *testing.T) {
		_ = badCAPEM
		tlsCfg := buildClientTLS(caPEM, badClientCertPEM, badClientKeyPEM)
		client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsCfg}}
		req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
		req.Header.Set("X-Panel-Signature", "dummy")
		_, err := client.Do(req)
		if err == nil {
			t.Fatal("expected handshake failure with invalid client cert")
		}
	})

	// Negative: missing cert fails (no Certificates)
	t.Run("missing cert fails", func(t *testing.T) {
		pool := x509.NewCertPool()
		pool.AppendCertsFromPEM(caPEM)
		tlsCfg := &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12, ServerName: "localhost"}
		client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsCfg}}
		req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
		req.Header.Set("X-Panel-Signature", "dummy")
		_, err := client.Do(req)
		if err == nil {
			t.Fatal("expected failure with missing client cert")
		}
	})

	// When mTLS disabled, HMAC-only passes (no client cert required)
	t.Run("HMAC without mTLS passes when disabled", func(t *testing.T) {
		// Server without ClientAuth
		noMTLSServerTLS := &tls.Config{
			Certificates: []tls.Certificate{serverCert},
			ClientAuth:   tls.NoClientCert,
			MinVersion:   tls.VersionTLS12,
		}
		handler2 := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Panel-Signature") == "" {
				http.Error(w, "missing HMAC", http.StatusUnauthorized)
				return
			}
			// mTLS disabled: do not check PeerCertificates
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		})
		srv2 := httptest.NewUnstartedServer(handler2)
		srv2.TLS = noMTLSServerTLS
		srv2.StartTLS()
		defer srv2.Close()
		pool := x509.NewCertPool()
		pool.AppendCertsFromPEM(caPEM)
		tlsCfg := &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12, ServerName: "localhost"}
		client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsCfg}}
		req, _ := http.NewRequest(http.MethodGet, srv2.URL, nil)
		req.Header.Set("X-Panel-Signature", "dummy-hmac")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("HMAC-only request failed when mTLS disabled: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("HMAC-only status=%d, want 200", resp.StatusCode)
		}
	})
}

func TestDaemonClient_NewClient_FailsWhenMTLSMisconfigured(t *testing.T) {
	// Use non-loopback URL to trigger daemonTransport path
	url := "https://beacon.example.com:9090"
	t.Setenv("MTLS_ENABLED", "true")
	t.Setenv("MTLS_CERT", "/tmp/missing.pem")
	t.Setenv("MTLS_KEY", "/tmp/missing.key")
	t.Setenv("MTLS_CA_CERT", "/tmp/missing-ca.pem")
	_, err := NewClient(url, "node.secret")
	if err == nil {
		t.Fatal("expected NewClient to fail when MTLS_ENABLED but files missing")
	}
	// When disabled, same URL should succeed
	t.Setenv("MTLS_ENABLED", "false")
	t.Setenv("MTLS_CERT", "")
	t.Setenv("MTLS_KEY", "")
	t.Setenv("MTLS_CA_CERT", "")
	cli, err := NewClient(url, "node.secret")
	if err != nil {
		t.Fatalf("NewClient without mTLS should succeed: %v", err)
	}
	if cli == nil {
		t.Fatal("expected client")
	}
}
