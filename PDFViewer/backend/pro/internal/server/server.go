package server

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const ProtobufContentType = "application/x-protobuf"

type Config struct {
	Verifier   accountauth.Verifier
	Store      entitlements.Store
	AdminToken string
	Now        func() time.Time
}

type Server struct {
	verifier   accountauth.Verifier
	store      entitlements.Store
	adminToken string
	now        func() time.Time
}

func New(config Config) http.Handler {
	now := config.Now
	if now == nil {
		now = time.Now
	}

	return &Server{
		verifier:   config.Verifier,
		store:      config.Store,
		adminToken: config.AdminToken,
		now:        now,
	}
}

func (server *Server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	switch {
	case request.Method == http.MethodGet && request.URL.Path == "/healthz":
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte("ok"))
	case request.Method == http.MethodPost && request.URL.Path == "/v1/account:get":
		server.handleGetAccount(response, request)
	case request.Method == http.MethodPost && request.URL.Path == "/v1/admin/entitlements:upsert":
		server.handleAdminUpsert(response, request)
	default:
		writeError(response, http.StatusNotFound, "not_found", "route not found")
	}
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

func readProto(response http.ResponseWriter, request *http.Request, message proto.Message) bool {
	if request.Body == nil {
		return true
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, 1<<20))
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
