package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/benebsworth/acacia/backend/pro/internal/appstore"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"github.com/benebsworth/acacia/backend/pro/internal/server"
)

func main() {
	if err := run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	config, err := loadConfig()
	if err != nil {
		return err
	}

	verifier, err := accountauth.NewFirebaseVerifier(ctx, config.FirebaseProjectID)
	if err != nil {
		return err
	}

	storageClient, err := storage.NewClient(ctx)
	if err != nil {
		return fmt.Errorf("initialize storage client: %w", err)
	}
	defer storageClient.Close()

	store, err := entitlements.NewGCSStore(
		storageClient,
		config.EntitlementsBucket,
		config.EntitlementsPrefix,
	)
	if err != nil {
		return err
	}

	handler := server.New(server.Config{
		Verifier:              verifier,
		Store:                 store,
		AdminToken:            config.AdminToken,
		BundleID:              config.BundleID,
		ProProductIDs:         config.ProProductIDs,
		ProStorageQuotaBytes:  config.ProStorageQuotaBytes,
		AppAccountTokenSecret: []byte(config.AppAccountTokenSecret),
		TransactionVerifier:   appstore.NewSignedTransactionVerifier(nil),
		NotificationVerifier:  appstore.NewSignedNotificationVerifier(nil),
	})

	httpServer := &http.Server{
		Addr:              ":" + config.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("acacia pro backend listening on :%s", config.Port)
	return httpServer.ListenAndServe()
}

type config struct {
	Port                  string
	FirebaseProjectID     string
	EntitlementsBucket    string
	EntitlementsPrefix    string
	AdminToken            string
	AppAccountTokenSecret string
	BundleID              string
	ProProductIDs         []string
	ProStorageQuotaBytes  int64
}

func loadConfig() (config, error) {
	quotaBytes, err := strconv.ParseInt(envOrDefault("ACACIA_PRO_STORAGE_QUOTA_BYTES", "21474836480"), 10, 64)
	if err != nil || quotaBytes <= 0 {
		return config{}, errors.New("ACACIA_PRO_STORAGE_QUOTA_BYTES must be a positive integer")
	}
	output := config{
		Port:                  envOrDefault("PORT", "8080"),
		FirebaseProjectID:     os.Getenv("FIREBASE_PROJECT_ID"),
		EntitlementsBucket:    os.Getenv("ACACIA_ENTITLEMENTS_BUCKET"),
		EntitlementsPrefix:    envOrDefault("ACACIA_ENTITLEMENTS_PREFIX", "pro"),
		AdminToken:            strings.TrimSpace(os.Getenv("ACACIA_ADMIN_TOKEN")),
		AppAccountTokenSecret: strings.TrimSpace(os.Getenv("ACACIA_APP_ACCOUNT_TOKEN_SECRET")),
		BundleID:              envOrDefault("ACACIA_BUNDLE_ID", "com.benebsworth.acacia"),
		ProProductIDs:         splitCSV(envOrDefault("ACACIA_PRO_PRODUCT_IDS", "com.benebsworth.acacia.pro.monthly,com.benebsworth.acacia.pro.yearly")),
		ProStorageQuotaBytes:  quotaBytes,
	}
	if output.EntitlementsBucket == "" {
		return config{}, errors.New("ACACIA_ENTITLEMENTS_BUCKET is required")
	}
	if output.AppAccountTokenSecret == "" {
		return config{}, errors.New("ACACIA_APP_ACCOUNT_TOKEN_SECRET is required")
	}
	if len(output.ProProductIDs) == 0 {
		return config{}, errors.New("ACACIA_PRO_PRODUCT_IDS must include at least one product id")
	}
	return output, nil
}

func envOrDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			output = append(output, trimmed)
		}
	}
	return output
}
