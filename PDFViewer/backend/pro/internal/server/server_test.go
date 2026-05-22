package server_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"github.com/benebsworth/acacia/backend/pro/internal/appstore"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"github.com/benebsworth/acacia/backend/pro/internal/server"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
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

type fakeTransactionVerifier struct {
	transactions map[string]*appstore.Transaction
}

func (verifier fakeTransactionVerifier) VerifySignedTransaction(_ context.Context, signedTransaction string) (*appstore.Transaction, error) {
	transaction, ok := verifier.transactions[signedTransaction]
	if !ok {
		return nil, errors.New("invalid app store transaction")
	}
	return transaction, nil
}

type fakeNotificationVerifier struct {
	notifications map[string]*appstore.Notification
}

func (verifier fakeNotificationVerifier) VerifySignedNotification(_ context.Context, signedPayload string) (*appstore.Notification, error) {
	notification, ok := verifier.notifications[signedPayload]
	if !ok {
		return nil, errors.New("invalid app store notification")
	}
	return notification, nil
}

func TestHealthEndpointUsesCloudRunSafePath(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
	if response.Body.String() != "ok" {
		t.Fatalf("expected ok health body, got %q", response.Body.String())
	}
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

func TestPurchaseContextReturnsStableAppAccountTokenAndProducts(t *testing.T) {
	handler := newTestHandler()
	firstRequest := newProtoRequest(http.MethodPost, "/v1/account:purchaseContext", &prov1.GetPurchaseContextRequest{})
	firstRequest.Header.Set("Authorization", "Bearer valid-free-user")
	firstResponse := httptest.NewRecorder()

	handler.ServeHTTP(firstResponse, firstRequest)

	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected purchase context 200, got %d", firstResponse.Code)
	}

	var firstBody prov1.GetPurchaseContextResponse
	unmarshalProto(t, firstResponse.Body.Bytes(), &firstBody)
	assertUUID(t, firstBody.GetAppAccountToken())
	if len(firstBody.GetProductIds()) != 2 {
		t.Fatalf("expected two pro products, got %v", firstBody.GetProductIds())
	}

	secondRequest := newProtoRequest(http.MethodPost, "/v1/account:purchaseContext", &prov1.GetPurchaseContextRequest{})
	secondRequest.Header.Set("Authorization", "Bearer valid-free-user")
	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, secondRequest)

	var secondBody prov1.GetPurchaseContextResponse
	unmarshalProto(t, secondResponse.Body.Bytes(), &secondBody)
	if secondBody.GetAppAccountToken() != firstBody.GetAppAccountToken() {
		t.Fatalf("expected stable app account token, got %q then %q", firstBody.GetAppAccountToken(), secondBody.GetAppAccountToken())
	}
}

func TestSyncAppStoreTransactionPersistsProEntitlement(t *testing.T) {
	store := entitlements.NewMemoryStore()
	handler := newTestHandlerWithStore(store)
	contextRequest := newProtoRequest(http.MethodPost, "/v1/account:purchaseContext", &prov1.GetPurchaseContextRequest{})
	contextRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	contextResponse := httptest.NewRecorder()
	handler.ServeHTTP(contextResponse, contextRequest)
	var contextBody prov1.GetPurchaseContextResponse
	unmarshalProto(t, contextResponse.Body.Bytes(), &contextBody)

	syncRequest := newProtoRequest(http.MethodPost, "/v1/app_store/transactions:sync", &prov1.SyncAppStoreTransactionRequest{
		SignedTransactionJws: "valid-pro-transaction",
	})
	syncRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	syncResponse := httptest.NewRecorder()

	handler.ServeHTTP(syncResponse, syncRequest)

	if syncResponse.Code != http.StatusOK {
		t.Fatalf("expected sync 200, got %d: %s", syncResponse.Code, syncResponse.Body.String())
	}

	var syncBody prov1.SyncAppStoreTransactionResponse
	unmarshalProto(t, syncResponse.Body.Bytes(), &syncBody)
	account := syncBody.GetAccount()
	if account.GetPlan() != prov1.Plan_PLAN_PRO {
		t.Fatalf("expected pro plan, got %v", account.GetPlan())
	}
	if account.GetSource() != prov1.EntitlementSource_ENTITLEMENT_SOURCE_APP_STORE {
		t.Fatalf("expected app store source, got %v", account.GetSource())
	}
	if account.GetAppStoreOriginalTransactionId() != "original_tx_123" {
		t.Fatalf("expected original transaction id, got %q", account.GetAppStoreOriginalTransactionId())
	}
	if account.GetExpiresAt().AsTime() != fixedNow().Add(30*24*time.Hour) {
		t.Fatalf("expected expiry from app store transaction, got %s", account.GetExpiresAt().AsTime())
	}
	if account.GetStorageQuotaBytes() != 20*1024*1024*1024 {
		t.Fatalf("expected pro storage quota, got %d", account.GetStorageQuotaBytes())
	}
	if contextBody.GetAppAccountToken() == "" {
		t.Fatal("expected purchase context to provide app account token before syncing")
	}
}

func TestAppStoreNotificationRenewalExtendsStoredEntitlement(t *testing.T) {
	store := entitlements.NewMemoryStore()
	handler := newTestHandlerWithStore(store)
	syncProEntitlement(t, handler)
	notificationRequest := newJSONRequest("/v1/app_store/notifications", `{"signedPayload":"renewal-notification"}`)
	notificationResponse := httptest.NewRecorder()

	handler.ServeHTTP(notificationResponse, notificationRequest)

	if notificationResponse.Code != http.StatusOK {
		t.Fatalf("expected notification 200, got %d: %s", notificationResponse.Code, notificationResponse.Body.String())
	}

	account, err := store.Get(context.Background(), "user_pro")
	if err != nil {
		t.Fatalf("load stored entitlement: %v", err)
	}
	if account.GetPlan() != prov1.Plan_PLAN_PRO {
		t.Fatalf("expected renewed pro plan, got %v", account.GetPlan())
	}
	if account.GetExpiresAt().AsTime() != fixedNow().Add(60*24*time.Hour) {
		t.Fatalf("expected renewed expiry, got %s", account.GetExpiresAt().AsTime())
	}
}

func TestAppStoreNotificationExpirationDowngradesStoredEntitlement(t *testing.T) {
	store := entitlements.NewMemoryStore()
	handler := newTestHandlerWithStore(store)
	syncProEntitlement(t, handler)
	notificationRequest := newJSONRequest("/v1/app_store/notifications", `{"signedPayload":"expired-notification"}`)
	notificationResponse := httptest.NewRecorder()

	handler.ServeHTTP(notificationResponse, notificationRequest)

	if notificationResponse.Code != http.StatusOK {
		t.Fatalf("expected notification 200, got %d: %s", notificationResponse.Code, notificationResponse.Body.String())
	}

	account, err := store.Get(context.Background(), "user_pro")
	if err != nil {
		t.Fatalf("load stored entitlement: %v", err)
	}
	if account.GetPlan() != prov1.Plan_PLAN_FREE {
		t.Fatalf("expected expired notification to downgrade to free, got %v", account.GetPlan())
	}
	if account.GetStorageQuotaBytes() != 0 {
		t.Fatalf("expected expired quota to be cleared, got %d", account.GetStorageQuotaBytes())
	}
}

func TestSyncAppStoreTransactionRejectsMismatchedAppAccountToken(t *testing.T) {
	handler := newTestHandler()
	syncRequest := newProtoRequest(http.MethodPost, "/v1/app_store/transactions:sync", &prov1.SyncAppStoreTransactionRequest{
		SignedTransactionJws: "wrong-account-token-transaction",
	})
	syncRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	syncResponse := httptest.NewRecorder()

	handler.ServeHTTP(syncResponse, syncRequest)

	if syncResponse.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden mismatched token, got %d", syncResponse.Code)
	}
}

func TestSyncAppStoreTransactionRestoresKnownOriginalTransactionForNewAuthUID(t *testing.T) {
	store := entitlements.NewMemoryStore()
	oldAppAccountToken := server.AppAccountTokenForTest("user_pro", []byte("test-secret"))
	if err := store.Put(context.Background(), &prov1.AccountEntitlement{
		FirebaseUid:                   "user_pro",
		Email:                         "old@example.com",
		Plan:                          prov1.Plan_PLAN_PRO,
		Active:                        true,
		StorageQuotaBytes:             20 * 1024 * 1024 * 1024,
		AppAccountToken:               oldAppAccountToken,
		AppStoreOriginalTransactionId: "original_tx_123",
		Source:                        prov1.EntitlementSource_ENTITLEMENT_SOURCE_APP_STORE,
		UpdatedAt:                     timestamppb.New(fixedNow()),
		ExpiresAt:                     timestamppb.New(fixedNow().Add(30 * 24 * time.Hour)),
	}); err != nil {
		t.Fatalf("seed original entitlement: %v", err)
	}
	handler := newTestHandlerWithStore(store)
	syncRequest := newProtoRequest(http.MethodPost, "/v1/app_store/transactions:sync", &prov1.SyncAppStoreTransactionRequest{
		SignedTransactionJws: "valid-pro-transaction",
	})
	syncRequest.Header.Set("Authorization", "Bearer valid-free-user")
	syncResponse := httptest.NewRecorder()

	handler.ServeHTTP(syncResponse, syncRequest)

	if syncResponse.Code != http.StatusOK {
		t.Fatalf("expected restore sync 200, got %d: %s", syncResponse.Code, syncResponse.Body.String())
	}
	var syncBody prov1.SyncAppStoreTransactionResponse
	unmarshalProto(t, syncResponse.Body.Bytes(), &syncBody)
	account := syncBody.GetAccount()
	if account.GetFirebaseUid() != "user_free" {
		t.Fatalf("expected entitlement to move to new auth uid, got %q", account.GetFirebaseUid())
	}
	if account.GetPlan() != prov1.Plan_PLAN_PRO {
		t.Fatalf("expected restored pro plan, got %v", account.GetPlan())
	}
	if account.GetAppAccountToken() != oldAppAccountToken {
		t.Fatalf("expected restored notification token %q, got %q", oldAppAccountToken, account.GetAppAccountToken())
	}
}

func TestSyncAppStoreTransactionRejectsExpiredSubscription(t *testing.T) {
	handler := newTestHandler()
	syncRequest := newProtoRequest(http.MethodPost, "/v1/app_store/transactions:sync", &prov1.SyncAppStoreTransactionRequest{
		SignedTransactionJws: "expired-transaction",
	})
	syncRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	syncResponse := httptest.NewRecorder()

	handler.ServeHTTP(syncResponse, syncRequest)

	if syncResponse.Code != http.StatusPaymentRequired {
		t.Fatalf("expected payment required for expired subscription, got %d", syncResponse.Code)
	}
}

func newTestHandler() http.Handler {
	return newTestHandlerWithStore(entitlements.NewMemoryStore())
}

func newTestHandlerWithStore(store entitlements.Store) http.Handler {
	appAccountToken := server.AppAccountTokenForTest("user_pro", []byte("test-secret"))
	return server.New(server.Config{
		Verifier: fakeVerifier{
			tokens: map[string]*accountauth.Token{
				"valid-free-user": {UID: "user_free", Email: "free@example.com"},
				"valid-pro-user":  {UID: "user_pro", Email: "pro@example.com"},
			},
		},
		Store:                 store,
		AdminToken:            "admin-secret",
		Now:                   fixedNow,
		BundleID:              "com.benebsworth.acacia",
		ProProductIDs:         []string{"com.benebsworth.acacia.pro.monthly", "com.benebsworth.acacia.pro.yearly"},
		AppAccountTokenSecret: []byte("test-secret"),
		ProStorageQuotaBytes:  20 * 1024 * 1024 * 1024,
		TransactionVerifier: fakeTransactionVerifier{
			transactions: map[string]*appstore.Transaction{
				"valid-pro-transaction": {
					BundleID:              "com.benebsworth.acacia",
					ProductID:             "com.benebsworth.acacia.pro.monthly",
					OriginalTransactionID: "original_tx_123",
					TransactionID:         "tx_123",
					AppAccountToken:       appAccountToken,
					ExpiresAt:             fixedNow().Add(30 * 24 * time.Hour),
				},
				"wrong-account-token-transaction": {
					BundleID:              "com.benebsworth.acacia",
					ProductID:             "com.benebsworth.acacia.pro.monthly",
					OriginalTransactionID: "original_tx_456",
					TransactionID:         "tx_456",
					AppAccountToken:       "00000000-0000-4000-8000-000000000000",
					ExpiresAt:             fixedNow().Add(30 * 24 * time.Hour),
				},
				"expired-transaction": {
					BundleID:              "com.benebsworth.acacia",
					ProductID:             "com.benebsworth.acacia.pro.monthly",
					OriginalTransactionID: "original_tx_789",
					TransactionID:         "tx_789",
					AppAccountToken:       appAccountToken,
					ExpiresAt:             fixedNow().Add(-time.Hour),
				},
				"renewed-pro-transaction": {
					BundleID:              "com.benebsworth.acacia",
					ProductID:             "com.benebsworth.acacia.pro.monthly",
					OriginalTransactionID: "original_tx_123",
					TransactionID:         "tx_renewed",
					AppAccountToken:       appAccountToken,
					ExpiresAt:             fixedNow().Add(60 * 24 * time.Hour),
				},
			},
		},
		NotificationVerifier: fakeNotificationVerifier{
			notifications: map[string]*appstore.Notification{
				"renewal-notification": {
					NotificationType:      "DID_RENEW",
					SignedTransactionInfo: "renewed-pro-transaction",
					SignedDate:            fixedNow(),
				},
				"expired-notification": {
					NotificationType:      "EXPIRED",
					SignedTransactionInfo: "expired-transaction",
					SignedDate:            fixedNow(),
				},
			},
		},
	})
}

func syncProEntitlement(t *testing.T, handler http.Handler) {
	t.Helper()
	contextRequest := newProtoRequest(http.MethodPost, "/v1/account:purchaseContext", &prov1.GetPurchaseContextRequest{})
	contextRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	contextResponse := httptest.NewRecorder()
	handler.ServeHTTP(contextResponse, contextRequest)
	if contextResponse.Code != http.StatusOK {
		t.Fatalf("seed purchase context failed with %d", contextResponse.Code)
	}

	syncRequest := newProtoRequest(http.MethodPost, "/v1/app_store/transactions:sync", &prov1.SyncAppStoreTransactionRequest{
		SignedTransactionJws: "valid-pro-transaction",
	})
	syncRequest.Header.Set("Authorization", "Bearer valid-pro-user")
	syncResponse := httptest.NewRecorder()
	handler.ServeHTTP(syncResponse, syncRequest)
	if syncResponse.Code != http.StatusOK {
		t.Fatalf("seed transaction sync failed with %d", syncResponse.Code)
	}
}

func newProtoRequest(method string, path string, message proto.Message) *http.Request {
	body := bytes.NewReader(marshalProto(message))
	request := httptest.NewRequest(method, path, body)
	request.Header.Set("Content-Type", server.ProtobufContentType)
	return request
}

func newJSONRequest(path string, body string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(body)))
	request.Header.Set("Content-Type", "application/json")
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

func assertUUID(t *testing.T, value string) {
	t.Helper()
	pattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	if !pattern.MatchString(value) {
		t.Fatalf("expected UUID, got %q", value)
	}
}
