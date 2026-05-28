package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"github.com/benebsworth/acacia/backend/pro/internal/appstore"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/cloud"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const ProtobufContentType = "application/x-protobuf"

var defaultProProductIDs = []string{
	"com.benebsworth.acacia.pro.monthly",
	"com.benebsworth.acacia.pro.yearly",
}

type Config struct {
	Verifier   accountauth.Verifier
	Store      entitlements.Store
	CloudStore cloud.Store
	AdminToken string
	Now        func() time.Time

	BundleID              string
	ProProductIDs         []string
	ProStorageQuotaBytes  int64
	AppAccountTokenSecret []byte
	AppleTokenRevoker     AppleTokenRevoker
	TransactionVerifier   appstore.TransactionVerifier
	NotificationVerifier  appstore.NotificationVerifier
}

type AppleTokenRevoker interface {
	RevokeAuthorizationCode(ctx context.Context, authorizationCode string) error
}

type Server struct {
	verifier              accountauth.Verifier
	store                 entitlements.Store
	cloudStore            cloud.Store
	adminToken            string
	now                   func() time.Time
	bundleID              string
	proProductIDs         []string
	proStorageQuotaBytes  int64
	appAccountTokenSecret []byte
	appleTokenRevoker     AppleTokenRevoker
	transactionVerifier   appstore.TransactionVerifier
	notificationVerifier  appstore.NotificationVerifier
}

func New(config Config) http.Handler {
	now := config.Now
	if now == nil {
		now = time.Now
	}
	proProductIDs := config.ProProductIDs
	if len(proProductIDs) == 0 {
		proProductIDs = defaultProProductIDs
	}
	bundleID := config.BundleID
	if bundleID == "" {
		bundleID = "com.benebsworth.acacia"
	}
	proStorageQuotaBytes := config.ProStorageQuotaBytes
	if proStorageQuotaBytes == 0 {
		proStorageQuotaBytes = 20 * 1024 * 1024 * 1024
	}

	return &Server{
		verifier:              config.Verifier,
		store:                 config.Store,
		cloudStore:            config.CloudStore,
		adminToken:            config.AdminToken,
		now:                   now,
		bundleID:              bundleID,
		proProductIDs:         append([]string(nil), proProductIDs...),
		proStorageQuotaBytes:  proStorageQuotaBytes,
		appAccountTokenSecret: append([]byte(nil), config.AppAccountTokenSecret...),
		appleTokenRevoker:     config.AppleTokenRevoker,
		transactionVerifier:   config.TransactionVerifier,
		notificationVerifier:  config.NotificationVerifier,
	}
}

func (server *Server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	switch {
	case request.Method == http.MethodGet && request.URL.Path == "/health":
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte("ok"))
	case request.Method == http.MethodPost && request.URL.Path == "/v1/account:get":
		server.handleGetAccount(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/account:delete":
		server.handleDeleteAccount(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/account/apple:revoke":
		server.handleRevokeAppleSignInToken(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/account:purchaseContext":
		server.handlePurchaseContext(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/app_store/transactions:sync":
		server.handleSyncAppStoreTransaction(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/library:sync":
		server.handleSyncLibrary(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/documents/content:upload":
		server.handleUploadDocumentContent(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/documents/content:download":
		server.handleDownloadDocumentContent(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/app_store/notifications":
		server.handleAppStoreNotification(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/admin/entitlements:upsert":
		server.handleAdminUpsert(response, request)
	default:
		writeError(response, http.StatusNotFound, "not_found", "route not found")
	}
}

func (server *Server) handleAppStoreNotification(response http.ResponseWriter, request *http.Request) {
	if server.notificationVerifier == nil || server.transactionVerifier == nil {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "app store notification verification is not configured")
		return
	}

	var requestBody appStoreNotificationRequest
	if err := json.NewDecoder(io.LimitReader(request.Body, 1<<20)).Decode(&requestBody); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", "could not decode app store notification")
		return
	}
	if requestBody.SignedPayload == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "signedPayload is required")
		return
	}

	notification, err := server.notificationVerifier.VerifySignedNotification(request.Context(), requestBody.SignedPayload)
	if err != nil {
		writeError(response, http.StatusUnauthorized, "invalid_notification", "app store notification could not be verified")
		return
	}
	transaction, err := server.transactionVerifier.VerifySignedTransaction(request.Context(), notification.SignedTransactionInfo)
	if err != nil {
		writeError(response, http.StatusUnauthorized, "invalid_transaction", "notification transaction could not be verified")
		return
	}
	if transaction.BundleID != server.bundleID || !server.isProProduct(transaction.ProductID) {
		writeError(response, http.StatusBadRequest, "invalid_transaction", "notification transaction does not match Acacia Pro")
		return
	}

	existing, err := server.store.GetByAppAccountToken(request.Context(), transaction.AppAccountToken)
	if err != nil {
		writeError(response, http.StatusNotFound, "account_not_found", "notification account token is not known")
		return
	}

	account := server.accountForNotification(existing, transaction, notification)
	if err := server.store.Put(request.Context(), account); err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not persist notification entitlement")
		return
	}

	writeProto(response, http.StatusOK, &prov1.SyncAppStoreTransactionResponse{Account: account})
}

func (server *Server) handleGetAccount(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}

	account, err := server.store.Get(request.Context(), token.UID)
	if errors.Is(err, entitlements.ErrNotFound) {
		account = defaultFreeAccount(token, server.now())
	} else if err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not load entitlement")
		return
	}

	account = normalizeAccount(account, token.Email, server.now())
	writeProto(response, http.StatusOK, &prov1.GetAccountResponse{Account: account})
}

func (server *Server) handleDeleteAccount(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}

	if server.cloudStore != nil {
		if err := server.cloudStore.DeleteAccount(request.Context(), token.UID); err != nil {
			writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not delete cloud account data")
			return
		}
	}
	if err := server.store.Delete(request.Context(), token.UID); err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not delete account entitlement")
		return
	}

	writeProto(response, http.StatusOK, &prov1.DeleteAccountResponse{Deleted: true})
}

func (server *Server) handleRevokeAppleSignInToken(response http.ResponseWriter, request *http.Request) {
	_, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if server.appleTokenRevoker == nil {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "sign in with apple token revocation is not configured")
		return
	}

	var requestBody prov1.RevokeAppleSignInTokenRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	authorizationCode := strings.TrimSpace(requestBody.GetAuthorizationCode())
	if authorizationCode == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "authorization_code is required")
		return
	}

	if err := server.appleTokenRevoker.RevokeAuthorizationCode(request.Context(), authorizationCode); err != nil {
		writeError(response, http.StatusBadGateway, "apple_revoke_failed", "could not revoke sign in with apple token")
		return
	}

	writeProto(response, http.StatusOK, &prov1.RevokeAppleSignInTokenResponse{Revoked: true})
}

func (server *Server) handlePurchaseContext(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if len(server.appAccountTokenSecret) == 0 {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "app account token secret is not configured")
		return
	}

	writeProto(response, http.StatusOK, &prov1.GetPurchaseContextResponse{
		AppAccountToken: appAccountTokenForUID(token.UID, server.appAccountTokenSecret),
		ProductIds:      append([]string(nil), server.proProductIDs...),
		BundleId:        server.bundleID,
	})
}

func (server *Server) handleSyncAppStoreTransaction(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if server.transactionVerifier == nil || len(server.appAccountTokenSecret) == 0 {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "app store transaction verification is not configured")
		return
	}

	var requestBody prov1.SyncAppStoreTransactionRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	if requestBody.GetSignedTransactionJws() == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "signed_transaction_jws is required")
		return
	}

	transaction, err := server.transactionVerifier.VerifySignedTransaction(request.Context(), requestBody.GetSignedTransactionJws())
	if err != nil {
		writeError(response, http.StatusUnauthorized, "invalid_transaction", "app store transaction could not be verified")
		return
	}
	if transaction.BundleID != server.bundleID {
		writeError(response, http.StatusBadRequest, "invalid_transaction", "transaction bundle id does not match this app")
		return
	}
	if !server.isProProduct(transaction.ProductID) {
		writeError(response, http.StatusBadRequest, "invalid_product", "transaction product is not an Acacia Pro product")
		return
	}
	expectedAppAccountToken := appAccountTokenForUID(token.UID, server.appAccountTokenSecret)
	appAccountToken := expectedAppAccountToken
	if transaction.AppAccountToken != expectedAppAccountToken {
		if !server.canRestoreKnownTransactionToCurrentUser(request, transaction) {
			writeError(response, http.StatusForbidden, "account_mismatch", "transaction app account token does not match this user")
			return
		}
		appAccountToken = transaction.AppAccountToken
	}
	if !transaction.RevokedAt.IsZero() {
		writeError(response, http.StatusPaymentRequired, "revoked", "app store transaction has been revoked")
		return
	}
	if transaction.ExpiresAt.IsZero() || !transaction.ExpiresAt.After(server.now()) {
		writeError(response, http.StatusPaymentRequired, "expired", "app store transaction is expired")
		return
	}

	account := &prov1.AccountEntitlement{
		FirebaseUid:                   token.UID,
		Email:                         token.Email,
		Plan:                          prov1.Plan_PLAN_PRO,
		Active:                        true,
		StorageQuotaBytes:             server.proStorageQuotaBytes,
		CustomerId:                    appAccountToken,
		AppStoreOriginalTransactionId: transaction.OriginalTransactionID,
		AppAccountToken:               appAccountToken,
		Source:                        prov1.EntitlementSource_ENTITLEMENT_SOURCE_APP_STORE,
		UpdatedAt:                     timestamppb.New(server.now()),
		ExpiresAt:                     timestamppb.New(transaction.ExpiresAt),
		Features:                      []string{"review_threads", "cloud_storage"},
	}
	if err := server.store.Put(request.Context(), account); err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not persist entitlement")
		return
	}

	writeProto(response, http.StatusOK, &prov1.SyncAppStoreTransactionResponse{Account: account})
}

func (server *Server) handleSyncLibrary(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	account, ok := server.requireProAccount(response, request, token)
	if !ok {
		return
	}
	if server.cloudStore == nil {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "cloud storage is not configured")
		return
	}

	var requestBody prov1.SyncLibraryRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	incoming := requestBody.GetSnapshot()
	if incoming == nil {
		writeError(response, http.StatusBadRequest, "invalid_argument", "snapshot is required")
		return
	}

	currentRevision := int64(0)
	existing, err := server.cloudStore.GetLibrary(request.Context(), token.UID)
	if err == nil {
		currentRevision = existing.GetRevision()
	} else if !errors.Is(err, cloud.ErrNotFound) {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not load cloud library")
		return
	}

	nextRevision := maxInt64(currentRevision, incoming.GetRevision()) + 1
	snapshot := normalizeCloudLibrarySnapshot(incoming, nextRevision, server.now())
	if err := server.cloudStore.PutLibrary(request.Context(), token.UID, snapshot); err != nil {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not persist cloud library")
		return
	}
	account = server.refreshStorageUsage(request, account)

	writeProto(response, http.StatusOK, &prov1.SyncLibraryResponse{
		Snapshot: snapshot,
		Account:  account,
	})
}

func (server *Server) handleUploadDocumentContent(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	account, ok := server.requireProAccount(response, request, token)
	if !ok {
		return
	}
	if server.cloudStore == nil {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "cloud storage is not configured")
		return
	}

	var requestBody prov1.UploadDocumentContentRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	if strings.TrimSpace(requestBody.GetDocumentId()) == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "document_id is required")
		return
	}
	if len(requestBody.GetData()) == 0 {
		writeError(response, http.StatusBadRequest, "invalid_argument", "data is required")
		return
	}

	currentUsage, err := server.cloudStore.StorageUsedBytes(request.Context(), token.UID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not calculate storage usage")
		return
	}
	var existingSize int64
	existingContent, err := server.cloudStore.GetDocumentContent(request.Context(), token.UID, requestBody.GetDocumentId())
	if err == nil {
		existingSize = int64(len(existingContent.Data))
	} else if !errors.Is(err, cloud.ErrNotFound) {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not load existing document content")
		return
	}
	projectedUsage := currentUsage - existingSize + int64(len(requestBody.GetData()))
	if account.GetStorageQuotaBytes() > 0 && projectedUsage > account.GetStorageQuotaBytes() {
		writeError(response, http.StatusPaymentRequired, "storage_quota_exceeded", "document exceeds Acacia Pro storage quota")
		return
	}

	if err := server.cloudStore.PutDocumentContent(request.Context(), token.UID, requestBody.GetDocumentId(), cloud.DocumentContent{
		Data:        requestBody.GetData(),
		ContentType: requestBody.GetContentType(),
	}); err != nil {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not persist document content")
		return
	}
	account = server.updateStorageUsage(request, account, projectedUsage)

	writeProto(response, http.StatusOK, &prov1.UploadDocumentContentResponse{
		DocumentId: requestBody.GetDocumentId(),
		SizeBytes:  int64(len(requestBody.GetData())),
		Account:    account,
	})
}

func (server *Server) handleDownloadDocumentContent(response http.ResponseWriter, request *http.Request) {
	token, ok := server.authenticate(response, request)
	if !ok {
		return
	}
	if _, ok := server.requireProAccount(response, request, token); !ok {
		return
	}
	if server.cloudStore == nil {
		writeError(response, http.StatusServiceUnavailable, "not_configured", "cloud storage is not configured")
		return
	}

	var requestBody prov1.DownloadDocumentContentRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	if strings.TrimSpace(requestBody.GetDocumentId()) == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "document_id is required")
		return
	}

	content, err := server.cloudStore.GetDocumentContent(request.Context(), token.UID, requestBody.GetDocumentId())
	if errors.Is(err, cloud.ErrNotFound) {
		writeError(response, http.StatusNotFound, "not_found", "document content not found")
		return
	}
	if err != nil {
		writeError(response, http.StatusInternalServerError, "cloud_store_error", "could not load document content")
		return
	}

	writeProto(response, http.StatusOK, &prov1.DownloadDocumentContentResponse{
		DocumentId:  requestBody.GetDocumentId(),
		Data:        content.Data,
		ContentType: content.ContentType,
		SizeBytes:   int64(len(content.Data)),
	})
}

func (server *Server) canRestoreKnownTransactionToCurrentUser(request *http.Request, transaction *appstore.Transaction) bool {
	if transaction.AppAccountToken == "" || transaction.OriginalTransactionID == "" {
		return false
	}
	existing, err := server.store.GetByAppAccountToken(request.Context(), transaction.AppAccountToken)
	if err != nil {
		return false
	}
	return existing.GetAppStoreOriginalTransactionId() == transaction.OriginalTransactionID
}

func (server *Server) accountForNotification(existing *prov1.AccountEntitlement, transaction *appstore.Transaction, notification *appstore.Notification) *prov1.AccountEntitlement {
	account := proto.Clone(existing).(*prov1.AccountEntitlement)
	account.AppAccountToken = transaction.AppAccountToken
	account.AppStoreOriginalTransactionId = transaction.OriginalTransactionID
	account.Source = prov1.EntitlementSource_ENTITLEMENT_SOURCE_APP_STORE
	account.UpdatedAt = timestamppb.New(server.now())
	account.ExpiresAt = timestamppb.New(transaction.ExpiresAt)

	if notificationDowngrades(notification.NotificationType) || !transaction.RevokedAt.IsZero() || transaction.ExpiresAt.IsZero() || !transaction.ExpiresAt.After(server.now()) {
		account.Plan = prov1.Plan_PLAN_FREE
		account.Active = true
		account.StorageQuotaBytes = 0
		account.Features = []string{"local_pdf_library", "local_annotations"}
		return account
	}

	account.Plan = prov1.Plan_PLAN_PRO
	account.Active = true
	account.StorageQuotaBytes = server.proStorageQuotaBytes
	account.Features = []string{"review_threads", "cloud_storage"}
	return account
}

func notificationDowngrades(notificationType string) bool {
	switch notificationType {
	case "EXPIRED", "REFUND", "REVOKE", "DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED":
		return true
	default:
		return false
	}
}

func (server *Server) handleAdminUpsert(response http.ResponseWriter, request *http.Request) {
	if server.adminToken == "" {
		writeError(response, http.StatusNotFound, "not_found", "admin entitlement endpoint is disabled")
		return
	}
	if bearerToken(request) != server.adminToken {
		writeError(response, http.StatusUnauthorized, "unauthorized", "admin token is required")
		return
	}

	var requestBody prov1.UpsertEntitlementRequest
	if !readProto(response, request, &requestBody) {
		return
	}
	account := requestBody.GetAccount()
	if account.GetFirebaseUid() == "" {
		writeError(response, http.StatusBadRequest, "invalid_argument", "account.firebase_uid is required")
		return
	}
	if account.GetPlan() == prov1.Plan_PLAN_UNSPECIFIED {
		writeError(response, http.StatusBadRequest, "invalid_argument", "account.plan is required")
		return
	}

	account.UpdatedAt = timestamppb.New(server.now())
	if account.GetSource() == prov1.EntitlementSource_ENTITLEMENT_SOURCE_UNSPECIFIED {
		account.Source = prov1.EntitlementSource_ENTITLEMENT_SOURCE_ADMIN
	}

	if err := server.store.Put(request.Context(), account); err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not persist entitlement")
		return
	}

	writeProto(response, http.StatusOK, &prov1.UpsertEntitlementResponse{Account: account})
}

func (server *Server) isProProduct(productID string) bool {
	for _, candidate := range server.proProductIDs {
		if productID == candidate {
			return true
		}
	}
	return false
}

func (server *Server) authenticate(response http.ResponseWriter, request *http.Request) (*accountauth.Token, bool) {
	idToken := bearerToken(request)
	if idToken == "" {
		writeError(response, http.StatusUnauthorized, "unauthorized", "firebase bearer token is required")
		return nil, false
	}

	token, err := server.verifier.VerifyIDToken(request.Context(), idToken)
	if err != nil {
		writeError(response, http.StatusUnauthorized, "unauthorized", "firebase bearer token is invalid")
		return nil, false
	}
	if token.UID == "" {
		writeError(response, http.StatusUnauthorized, "unauthorized", "firebase token uid is missing")
		return nil, false
	}
	return token, true
}

func (server *Server) requireProAccount(response http.ResponseWriter, request *http.Request, token *accountauth.Token) (*prov1.AccountEntitlement, bool) {
	account, err := server.store.Get(request.Context(), token.UID)
	if errors.Is(err, entitlements.ErrNotFound) {
		account = defaultFreeAccount(token, server.now())
	} else if err != nil {
		writeError(response, http.StatusInternalServerError, "store_error", "could not load entitlement")
		return nil, false
	}

	account = normalizeAccount(account, token.Email, server.now())
	if !account.GetActive() || account.GetPlan() != prov1.Plan_PLAN_PRO {
		writeError(response, http.StatusPaymentRequired, "pro_required", "Acacia Pro is required for cloud sync")
		return nil, false
	}
	return account, true
}

func (server *Server) refreshStorageUsage(request *http.Request, account *prov1.AccountEntitlement) *prov1.AccountEntitlement {
	if server.cloudStore == nil {
		return account
	}
	usage, err := server.cloudStore.StorageUsedBytes(request.Context(), account.GetFirebaseUid())
	if err != nil {
		return account
	}
	return server.updateStorageUsage(request, account, usage)
}

func (server *Server) updateStorageUsage(request *http.Request, account *prov1.AccountEntitlement, usage int64) *prov1.AccountEntitlement {
	updated := proto.Clone(account).(*prov1.AccountEntitlement)
	updated.StorageUsedBytes = usage
	updated.UpdatedAt = timestamppb.New(server.now())
	if err := server.store.Put(request.Context(), updated); err != nil {
		return account
	}
	return updated
}

func normalizeCloudLibrarySnapshot(snapshot *prov1.CloudLibrarySnapshot, revision int64, now time.Time) *prov1.CloudLibrarySnapshot {
	normalized := proto.Clone(snapshot).(*prov1.CloudLibrarySnapshot)
	normalized.Revision = revision
	normalized.UpdatedAt = now.Format(time.RFC3339Nano)

	for _, document := range normalized.Documents {
		if document.GetRevision() == 0 {
			document.Revision = revision
		}
	}
	for _, annotation := range normalized.Annotations {
		if annotation.GetRevision() == 0 {
			annotation.Revision = revision
		}
	}

	return normalized
}

func maxInt64(left int64, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func readProto(response http.ResponseWriter, request *http.Request, message proto.Message) bool {
	if request.Body == nil {
		return true
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, 64<<20))
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_request", "could not read request body")
		return false
	}
	if len(body) == 0 {
		return true
	}
	if err := proto.Unmarshal(body, message); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_protobuf", "could not decode protobuf body")
		return false
	}
	return true
}

func writeProto(response http.ResponseWriter, status int, message proto.Message) {
	body, err := proto.Marshal(message)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "encode_error", "could not encode protobuf response")
		return
	}
	response.Header().Set("Content-Type", ProtobufContentType)
	response.WriteHeader(status)
	_, _ = response.Write(body)
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	writeProto(response, status, &prov1.ErrorResponse{
		Code:    code,
		Message: message,
	})
}

func bearerToken(request *http.Request) string {
	header := request.Header.Get("Authorization")
	prefix := "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func defaultFreeAccount(token *accountauth.Token, now time.Time) *prov1.AccountEntitlement {
	return &prov1.AccountEntitlement{
		FirebaseUid: token.UID,
		Email:       token.Email,
		Plan:        prov1.Plan_PLAN_FREE,
		Active:      true,
		Source:      prov1.EntitlementSource_ENTITLEMENT_SOURCE_DEFAULT,
		UpdatedAt:   timestamppb.New(now),
		Features:    []string{"local_pdf_library", "local_annotations"},
	}
}

func normalizeAccount(account *prov1.AccountEntitlement, fallbackEmail string, now time.Time) *prov1.AccountEntitlement {
	account = proto.Clone(account).(*prov1.AccountEntitlement)
	if account.GetEmail() == "" {
		account.Email = fallbackEmail
	}
	if account.GetUpdatedAt() == nil {
		account.UpdatedAt = timestamppb.New(now)
	}
	return account
}

func appAccountTokenForUID(firebaseUID string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(firebaseUID))
	sum := mac.Sum(nil)
	uuidBytes := append([]byte(nil), sum[:16]...)
	uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40
	uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(uuidBytes)
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		encoded[0:8],
		encoded[8:12],
		encoded[12:16],
		encoded[16:20],
		encoded[20:32],
	)
}

func AppAccountTokenForTest(firebaseUID string, secret []byte) string {
	return appAccountTokenForUID(firebaseUID, secret)
}

type appStoreNotificationRequest struct {
	SignedPayload string `json:"signedPayload"`
}
