package smoke_test

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/cloud"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"github.com/benebsworth/acacia/backend/pro/internal/server"
	"github.com/benebsworth/acacia/backend/pro/internal/smoke"
)

type fakeVerifier struct {
	tokens map[string]*auth.Token
}

func (verifier fakeVerifier) VerifyIDToken(_ context.Context, idToken string) (*auth.Token, error) {
	token, ok := verifier.tokens[idToken]
	if !ok {
		return nil, errors.New("invalid token")
	}
	return token, nil
}

func TestRunExercisesCloudRunBackendAndAdminEntitlementPath(t *testing.T) {
	store := entitlements.NewMemoryStore()
	cloudStore := cloud.NewMemoryStore()
	handler := server.New(server.Config{
		Verifier: fakeVerifier{tokens: map[string]*auth.Token{
			"valid-token": {UID: "smoke-user", Email: "smoke@example.com"},
		}},
		Store:                 store,
		CloudStore:            cloudStore,
		AdminToken:            "admin-secret",
		Now:                   func() time.Time { return time.Date(2026, 5, 22, 12, 0, 0, 0, time.UTC) },
		AppAccountTokenSecret: []byte("smoke-secret"),
		ProProductIDs:         []string{"com.benebsworth.acacia.pro.monthly"},
	})
	testServer := httptest.NewServer(handler)
	defer testServer.Close()

	err := smoke.Run(t.Context(), smoke.Config{
		BaseURL:          testServer.URL,
		FirebaseIDToken:  "valid-token",
		AdminToken:       "admin-secret",
		AdminFirebaseUID: "smoke-user",
		AdminEmail:       "smoke@example.com",
		HTTPClient:       testServer.Client(),
	})

	if err != nil {
		t.Fatalf("smoke run failed: %v", err)
	}

	account, err := store.Get(t.Context(), "smoke-user")
	if err != nil {
		t.Fatalf("expected admin smoke upsert to persist account: %v", err)
	}
	if account.GetPlan() != prov1.Plan_PLAN_PRO {
		t.Fatalf("expected smoke account to be pro, got %v", account.GetPlan())
	}

	content, err := cloudStore.GetDocumentContent(t.Context(), "smoke-user", "smoke-roadmap")
	if err != nil {
		t.Fatalf("expected smoke run to persist document content: %v", err)
	}
	if string(content.Data) != "%PDF-1.7\n% Acacia Pro smoke document\n%%EOF\n" {
		t.Fatalf("expected smoke PDF content to round trip, got %q", string(content.Data))
	}
	if content.ContentType != "application/pdf" {
		t.Fatalf("expected application/pdf content type, got %q", content.ContentType)
	}
}

func TestRunRequiresAuthenticatedFirebaseToken(t *testing.T) {
	err := smoke.Run(t.Context(), smoke.Config{
		BaseURL: "https://acacia-pro.example.test",
	})

	if err == nil {
		t.Fatal("expected missing firebase token to fail")
	}
}
