package smoke

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"google.golang.org/protobuf/proto"
)

const protobufContentType = "application/x-protobuf"

type Config struct {
	BaseURL          string
	FirebaseIDToken  string
	AdminToken       string
	AdminFirebaseUID string
	AdminEmail       string
	HTTPClient       *http.Client
}

func Run(ctx context.Context, config Config) error {
	baseURL := strings.TrimRight(config.BaseURL, "/")
	if baseURL == "" {
		return errors.New("base URL is required")
	}
	if config.FirebaseIDToken == "" {
		return errors.New("firebase ID token is required")
	}

	client := config.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	if err := checkHealth(ctx, client, baseURL); err != nil {
		return err
	}
	if err := expectUnauthorized(ctx, client, baseURL); err != nil {
		return err
	}
	if err := checkPurchaseContext(ctx, client, baseURL, config.FirebaseIDToken); err != nil {
		return err
	}
	if err := checkAccount(ctx, client, baseURL, config.FirebaseIDToken); err != nil {
		return err
	}
	if config.AdminToken != "" && config.AdminFirebaseUID != "" {
		if err := upsertAdminEntitlement(ctx, client, baseURL, config); err != nil {
			return err
		}
		if err := requireProAccount(ctx, client, baseURL, config.FirebaseIDToken); err != nil {
			return err
		}
	}

	return nil
}

func checkHealth(ctx context.Context, client *http.Client, baseURL string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/health", nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("health request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("health returned %d", response.StatusCode)
	}
	return nil
}

func expectUnauthorized(ctx context.Context, client *http.Client, baseURL string) error {
	var body prov1.GetAccountResponse
	status, err := postProto(ctx, client, baseURL+"/v1/account:get", "", &prov1.GetAccountRequest{}, &body)
	if err != nil {
		return err
	}
	if status != http.StatusUnauthorized {
		return fmt.Errorf("unauthorized account:get returned %d", status)
	}
	return nil
}

func checkPurchaseContext(ctx context.Context, client *http.Client, baseURL string, firebaseIDToken string) error {
	var body prov1.GetPurchaseContextResponse
	status, err := postProto(ctx, client, baseURL+"/v1/account:purchaseContext", firebaseIDToken, &prov1.GetPurchaseContextRequest{}, &body)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("purchaseContext returned %d", status)
	}
	if body.GetAppAccountToken() == "" {
		return errors.New("purchaseContext missing app account token")
	}
	if len(body.GetProductIds()) == 0 {
		return errors.New("purchaseContext missing product ids")
	}
	return nil
}

func checkAccount(ctx context.Context, client *http.Client, baseURL string, firebaseIDToken string) error {
	var body prov1.GetAccountResponse
	status, err := postProto(ctx, client, baseURL+"/v1/account:get", firebaseIDToken, &prov1.GetAccountRequest{}, &body)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("account:get returned %d", status)
	}
	if body.GetAccount() == nil || !body.GetAccount().GetActive() {
		return errors.New("account:get did not return an active account")
	}
	return nil
}

func requireProAccount(ctx context.Context, client *http.Client, baseURL string, firebaseIDToken string) error {
	var body prov1.GetAccountResponse
	status, err := postProto(ctx, client, baseURL+"/v1/account:get", firebaseIDToken, &prov1.GetAccountRequest{}, &body)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("post-admin account:get returned %d", status)
	}
	if body.GetAccount().GetPlan() != prov1.Plan_PLAN_PRO {
		return fmt.Errorf("post-admin account plan is %v, want pro", body.GetAccount().GetPlan())
	}
	return nil
}

func upsertAdminEntitlement(ctx context.Context, client *http.Client, baseURL string, config Config) error {
	email := config.AdminEmail
	if email == "" {
		email = "smoke@example.com"
	}

	var body prov1.UpsertEntitlementResponse
	status, err := postProto(ctx, client, baseURL+"/v1/admin/entitlements:upsert", config.AdminToken, &prov1.UpsertEntitlementRequest{
		Account: &prov1.AccountEntitlement{
			FirebaseUid:       config.AdminFirebaseUID,
			Email:             email,
			Plan:              prov1.Plan_PLAN_PRO,
			Active:            true,
			StorageQuotaBytes: 20 * 1024 * 1024 * 1024,
			Source:            prov1.EntitlementSource_ENTITLEMENT_SOURCE_ADMIN,
			Features:          []string{"review_threads", "cloud_storage"},
		},
	}, &body)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("admin upsert returned %d", status)
	}
	if body.GetAccount().GetPlan() != prov1.Plan_PLAN_PRO {
		return errors.New("admin upsert did not return pro account")
	}
	return nil
}

func postProto(ctx context.Context, client *http.Client, url string, bearerToken string, requestMessage proto.Message, responseMessage proto.Message) (int, error) {
	requestBody, err := proto.Marshal(requestMessage)
	if err != nil {
		return 0, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(requestBody))
	if err != nil {
		return 0, err
	}
	request.Header.Set("Content-Type", protobufContentType)
	request.Header.Set("Accept", protobufContentType)
	if bearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+bearerToken)
	}

	response, err := client.Do(request)
	if err != nil {
		return 0, fmt.Errorf("post %s failed: %w", url, err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return 0, err
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 && len(responseBody) > 0 {
		if err := proto.Unmarshal(responseBody, responseMessage); err != nil {
			return 0, fmt.Errorf("decode %s response: %w", url, err)
		}
	}
	return response.StatusCode, nil
}
