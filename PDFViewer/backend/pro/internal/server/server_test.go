package server_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"github.com/benebsworth/acacia/backend/pro/internal/server"
	"google.golang.org/protobuf/proto"
)

type fakeVerifier struct {
	tokens map[string]*accountauth.Token
}

func (verifier fakeVerifier) VerifyIDToken(_ context.Context, idToken string) (*accountauth.Token, error) {
	token, ok := verifier.tokens[idToken]
	if !ok {
		return nil, errors.New("invalid token")
	}
	return token, nil
}

func TestGetAccountRequiresFirebaseBearerToken(t *testing.T) {
	handler := newTestHandler()
	request := newProtoRequest(http.MethodPost, "/v1/account:get", &prov1.GetAccountRequest{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}

	var body prov1.ErrorResponse
	unmarshalProto(t, response.Body.Bytes(), &body)
	if body.GetCode() != "unauthorized" {
		t.Fatalf("expected unauthorized error, got %q", body.GetCode())
	}
}

func TestGetAccountReturnsSignedInFreeEntitlementWhenNoStoredProPlanExists(t *testing.T) {
	handler := newTestHandler()
	request := newProtoRequest(http.MethodPost, "/v1/account:get", &prov1.GetAccountRequest{})
	request.Header.Set("Authorization", "Bearer valid-free-user")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}

	var body prov1.GetAccountResponse
	unmarshalProto(t, response.Body.Bytes(), &body)
	account := body.GetAccount()
	if account.GetFirebaseUid() != "user_free" {
		t.Fatalf("expected firebase uid user_free, got %q", account.GetFirebaseUid())
	}
	if account.GetEmail() != "free@example.com" {
		t.Fatalf("expected email from verified token, got %q", account.GetEmail())
	}
	if account.GetPlan() != prov1.Plan_PLAN_FREE {
		t.Fatalf("expected free plan, got %v", account.GetPlan())
	}
	if !account.GetActive() {
		t.Fatal("expected signed-in account to be active")
	}
	if account.GetStorageQuotaBytes() != 0 {
		t.Fatalf("expected no cloud storage quota for free plan, got %d", account.GetStorageQuotaBytes())
	}
	if account.GetSource() != prov1.EntitlementSource_ENTITLEMENT_SOURCE_DEFAULT {
		t.Fatalf("expected default entitlement source, got %v", account.GetSource())
	}
}

func TestAdminUpsertPersistsProEntitlementForAuthenticatedAccount(t *testing.T) {
	store := entitlements.NewMemoryStore()
	handler := newTestHandlerWithStore(store)
	upsert := &prov1.UpsertEntitlementRequest{
		Account: &prov1.AccountEntitlement{
			FirebaseUid:       "user_pro",
			Email:             "pro@example.com",
			Plan:              prov1.Plan_PLAN_PRO,
			Active:            true,
			StorageQuotaBytes: 20 * 1024 * 1024 * 1024,
			CustomerId:        "cus_123",
			Source:            prov1.EntitlementSource_ENTITLEMENT_SOURCE_ADMIN,
			Features:          []string{"review_threads", "cloud_storage"},
		},
	}
	upsertRequest := newProtoRequest(http.MethodPost, "/v1/admin/entitlements:upsert", upsert)
	upsertRequest.Header.Set("Authorization", "Bearer admin-secret")
	upsertResponse := httptest.NewRecorder()

	handler.ServeHTTP(upsertResponse, upsertRequest)

	if upsertResponse.Code != http.StatusOK {
		t.Fatalf("expected admin upsert 200, got %d: %s", upsertResponse.Code, upsertResponse.Body.String())
	}

	getRequest := newProtoRequest(http.MethodPost, "/v1/account:get", &prov1.GetAccountRequest{})
	getRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	getResponse := httptest.NewRecorder()

	handler.ServeHTTP(getResponse, getRequest)

	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected get account 200, got %d", getResponse.Code)
	}

	var body prov1.GetAccountResponse
	unmarshalProto(t, getResponse.Body.Bytes(), &body)
	account := body.GetAccount()
	if account.GetPlan() != prov1.Plan_PLAN_PRO {
		t.Fatalf("expected pro plan, got %v", account.GetPlan())
	}
	if account.GetStorageQuotaBytes() != 20*1024*1024*1024 {
		t.Fatalf("expected stored quota, got %d", account.GetStorageQuotaBytes())
	}
	if account.GetUpdatedAt().AsTime() != fixedNow() {
		t.Fatalf("expected updated_at to be set by server clock, got %s", account.GetUpdatedAt().AsTime())
	}
}

func newTestHandler() http.Handler {
	return newTestHandlerWithStore(entitlements.NewMemoryStore())
}

func newTestHandlerWithStore(store entitlements.Store) http.Handler {
	return server.New(server.Config{
		Verifier: fakeVerifier{
			tokens: map[string]*accountauth.Token{
				"valid-free-user": {UID: "user_free", Email: "free@example.com"},
				"valid-pro-user":  {UID: "user_pro", Email: "pro@example.com"},
			},
		},
		Store:      store,
		AdminToken: "admin-secret",
		Now:        fixedNow,
	})
}

func newProtoRequest(method string, path string, message proto.Message) *http.Request {
	body := bytes.NewReader(marshalProto(message))
	request := httptest.NewRequest(method, path, body)
	request.Header.Set("Content-Type", server.ProtobufContentType)
	return request
}

func marshalProto(message proto.Message) []byte {
	body, err := proto.Marshal(message)
	if err != nil {
		panic(err)
	}
	return body
}

func unmarshalProto(t *testing.T, body []byte, message proto.Message) {
	t.Helper()
	if err := proto.Unmarshal(body, message); err != nil {
		t.Fatalf("failed to unmarshal proto response: %v", err)
	}
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 21, 12, 30, 0, 0, time.UTC)
}
