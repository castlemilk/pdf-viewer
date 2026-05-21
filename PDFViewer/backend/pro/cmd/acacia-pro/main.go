package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"cloud.google.com/go/storage"
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
		Verifier:   verifier,
		Store:      store,
		AdminToken: config.AdminToken,
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
	Port               string
	FirebaseProjectID  string
	EntitlementsBucket string
	EntitlementsPrefix string
	AdminToken         string
}

func loadConfig() (config, error) {
	output := config{
		Port:               envOrDefault("PORT", "8080"),
		FirebaseProjectID:  os.Getenv("FIREBASE_PROJECT_ID"),
		EntitlementsBucket: os.Getenv("ACACIA_ENTITLEMENTS_BUCKET"),
		EntitlementsPrefix: envOrDefault("ACACIA_ENTITLEMENTS_PREFIX", "pro"),
		AdminToken:         os.Getenv("ACACIA_ADMIN_TOKEN"),
	}
	if output.EntitlementsBucket == "" {
		return config{}, errors.New("ACACIA_ENTITLEMENTS_BUCKET is required")
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
