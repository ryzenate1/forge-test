package tls

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

func genCA(t testing.TB) ([]byte, []byte, *x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gen CA key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "TestCA"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour * 24),
		KeyUsage:     x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		IsCA:         true, BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create CA: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	cert, _ := x509.ParseCertificate(der)
	return certPEM, keyPEM, cert, key
}

func genLeaf(t testing.TB, caCert *x509.Certificate, caKey *rsa.PrivateKey, cn string, isClient bool) ([]byte, []byte) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gen leaf: %v", err)
	}
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour * 24),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		BasicConstraintsValid: true,
	}
	if isClient {
		tmpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	} else {
		tmpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
		tmpl.DNSNames = []string{"localhost"}
		tmpl.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, caCert, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create leaf: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return certPEM, keyPEM
}

func writeFile(t testing.TB, dir, name string, data []byte) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, data, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

func TestTLSConfig_ManualWithClientCAEnablesmTLS(t *testing.T) {
	dir := t.TempDir()
	caPEM, _, caCert, caKey := genCA(t)
	srvCertPEM, srvKeyPEM := genLeaf(t, caCert, caKey, "beacon", false)
	caPath := writeFile(t, dir, "ca.pem", caPEM)
	certPath := writeFile(t, dir, "srv.pem", srvCertPEM)
	keyPath := writeFile(t, dir, "srv.key", srvKeyPEM)

	cfg := &Config{Mode: ModeManual, CertFile: certPath, KeyFile: keyPath, ClientCAFile: caPath}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	srv := &http.Server{}
	if err := cfg.Apply(srv); err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if srv.TLSConfig == nil {
		t.Fatal("expected TLSConfig")
	}
	if srv.TLSConfig.ClientAuth != 4 { // RequireAndVerifyClientCert = 4
		t.Fatalf("expected RequireAndVerifyClientCert, got %v", srv.TLSConfig.ClientAuth)
	}
	if srv.TLSConfig.ClientCAs == nil {
		t.Fatal("expected ClientCAs")
	}
}

func TestTLSConfig_ManualWithoutClientCAIsNoClientCert(t *testing.T) {
	dir := t.TempDir()
	_, _, caCert, caKey := genCA(t)
	srvCertPEM, srvKeyPEM := genLeaf(t, caCert, caKey, "beacon", false)
	certPath := writeFile(t, dir, "srv.pem", srvCertPEM)
	keyPath := writeFile(t, dir, "srv.key", srvKeyPEM)
	cfg := &Config{Mode: ModeManual, CertFile: certPath, KeyFile: keyPath}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	srv := &http.Server{}
	if err := cfg.Apply(srv); err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if srv.TLSConfig.ClientAuth != 0 {
		t.Fatalf("expected NoClientCert, got %v", srv.TLSConfig.ClientAuth)
	}
}

func TestTLSConfig_NoneWithClientCAFails(t *testing.T) {
	cfg := &Config{Mode: ModeNone, ClientCAFile: "/tmp/ca.pem"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected error for client CA with none mode")
	}
}

func TestTLSConfig_AutoTLSWithClientCAFails(t *testing.T) {
	cfg := &Config{Mode: ModeAutoTLS, Hostname: "example.com", ClientCAFile: "/tmp/ca.pem"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected error for client CA with autotls")
	}
}

func TestBeaconmTLSIntegration_ValidCertPassesInvalidFails(t *testing.T) {
	caPEM, _, caCert, caKey := genCA(t)
	srvCertPEM, srvKeyPEM := genLeaf(t, caCert, caKey, "beacon", false)
	clientCertPEM, clientKeyPEM := genLeaf(t, caCert, caKey, "panel", true)
	// bad CA
	_, _, badCACert, badCAKey := genCA(t)
	badClientPEM, badClientKeyPEM := genLeaf(t, badCACert, badCAKey, "panel-bad", true)

	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caPEM)
	srvCert := x509KeyPair(srvCertPEM, srvKeyPEM)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			http.Error(w, "no client cert", http.StatusUnauthorized)
			return
		}
		if r.Header.Get("X-Panel-Signature") == "" {
			http.Error(w, "missing HMAC", http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// Manual test using httptest with TLS
	srv := httptest.NewUnstartedServer(handler)
	srv.TLS = tlsConfigForTest(srvCert, caPool, true)
	srv.StartTLS()
	defer srv.Close()
	// Valid client
	validTLS := clientTLSForTest(caPEM, clientCertPEM, clientKeyPEM)
	cli := &http.Client{Transport: &http.Transport{TLSClientConfig: validTLS}}
	req, _ := http.NewRequest("GET", srv.URL, nil)
	req.Header.Set("X-Panel-Signature", "sig")
	resp, err := cli.Do(req)
	if err != nil {
		t.Fatalf("valid cert: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("valid cert status %d", resp.StatusCode)
	}
	// Invalid cert (signed by different CA)
	invalidTLS := clientTLSForTest(caPEM, badClientPEM, badClientKeyPEM)
	cli2 := &http.Client{Transport: &http.Transport{TLSClientConfig: invalidTLS}}
	req2, _ := http.NewRequest("GET", srv.URL, nil)
	req2.Header.Set("X-Panel-Signature", "sig")
	_, err = cli2.Do(req2)
	if err == nil {
		t.Fatal("expected invalid cert to fail")
	}
	// Missing cert
	missingTLS := &tls.Config{RootCAs: caPool, MinVersion: tls.VersionTLS12, ServerName: "localhost"}
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: missingTLS}}
	req3, _ := http.NewRequest("GET", srv.URL, nil)
	req3.Header.Set("X-Panel-Signature", "sig")
	_, err = client.Do(req3)
	if err == nil {
		t.Fatal("expected missing cert to fail")
	}
	// When mTLS disabled (NoClientCert), HMAC without cert passes
	srv2 := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Panel-Signature") == "" {
			http.Error(w, "missing HMAC", 401)
			return
		}
		w.WriteHeader(200)
	}))
	srv2.TLS = tlsConfigForTest(srvCert, nil, false)
	srv2.StartTLS()
	defer srv2.Close()
	missingTLS2 := &tls.Config{RootCAs: caPool, MinVersion: tls.VersionTLS12, ServerName: "localhost"}
	cli3 := &http.Client{Transport: &http.Transport{TLSClientConfig: missingTLS2}}
	req4, _ := http.NewRequest("GET", srv2.URL, nil)
	req4.Header.Set("X-Panel-Signature", "sig")
	resp4, err := cli3.Do(req4)
	if err != nil {
		t.Fatalf("HMAC without mTLS: %v", err)
	}
	resp4.Body.Close()
	if resp4.StatusCode != 200 {
		t.Fatalf("HMAC without mTLS status %d", resp4.StatusCode)
	}
}

// helpers for test TLS
func x509KeyPair(certPEM, keyPEM []byte) tls.Certificate {
	c, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		panic(err)
	}
	return c
}

func tlsConfigForTest(srvCert tls.Certificate, caPool *x509.CertPool, requireClient bool) *tls.Config {
	cfg := &tls.Config{Certificates: []tls.Certificate{srvCert}, MinVersion: tls.VersionTLS12}
	if requireClient {
		cfg.ClientAuth = tls.RequireAndVerifyClientCert
		cfg.ClientCAs = caPool
	}
	return cfg
}

func clientTLSForTest(caPEM, certPEM, keyPEM []byte) *tls.Config {
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(caPEM)
	cert, _ := tls.X509KeyPair(certPEM, keyPEM)
	return &tls.Config{RootCAs: pool, Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12, ServerName: "localhost"}
}
