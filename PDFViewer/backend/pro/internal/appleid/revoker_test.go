package appleid_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/benebsworth/acacia/backend/pro/internal/appleid"
)

func TestRevokerExchangesAuthorizationCodeAndRevokesRefreshToken(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if err := request.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		requests = append(requests, request.URL.Path+" "+request.Form.Encode())
		if request.URL.Path == "/auth/token" {
			if request.Form.Get("code") != "apple-auth-code" {
				t.Fatalf("expected authorization code, got %q", request.Form.Get("code"))
			}
			if !strings.Contains(request.Form.Get("client_secret"), ".") {
				t.Fatal("expected signed client secret")
			}
			response.Header().Set("Content-Type", "application/json")
			_, _ = response.Write([]byte(`{"refresh_token":"apple-refresh-token"}`))
			return
		}
		if request.URL.Path == "/auth/revoke" {
			if request.Form.Get("token") != "apple-refresh-token" {
				t.Fatalf("expected refresh token, got %q", request.Form.Get("token"))
			}
			if request.Form.Get("token_type_hint") != "refresh_token" {
				t.Fatalf("expected refresh token hint, got %q", request.Form.Get("token_type_hint"))
			}
			response.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(response, request)
	}))
	defer server.Close()

	revoker, err := appleid.NewRevoker(appleid.Config{
		TeamID:        "TEAMID1234",
		KeyID:         "KEYID1234",
		ClientID:      "com.benebsworth.acacia",
		PrivateKeyPEM: testPrivateKeyPEM(t),
		TokenURL:      server.URL + "/auth/token",
		RevokeURL:     server.URL + "/auth/revoke",
		Now:           func() time.Time { return time.Unix(1_700_000_000, 0) },
	})
	if err != nil {
		t.Fatalf("create revoker: %v", err)
	}

	if err := revoker.RevokeAuthorizationCode(context.Background(), "apple-auth-code"); err != nil {
		t.Fatalf("revoke authorization code: %v", err)
	}
	if len(requests) != 2 {
		t.Fatalf("expected token and revoke requests, got %#v", requests)
	}
}

func testPrivateKeyPEM(t *testing.T) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	encoded, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded}))
}
