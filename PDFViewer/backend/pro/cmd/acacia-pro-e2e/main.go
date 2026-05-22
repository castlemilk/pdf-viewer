package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/benebsworth/acacia/backend/pro/internal/appstore"
	accountauth "github.com/benebsworth/acacia/backend/pro/internal/auth"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
	"github.com/benebsworth/acacia/backend/pro/internal/server"
)

func main() {
	config := loadConfig()
	appAccountToken := server.AppAccountTokenForTest(config.firebaseUID, []byte(config.appAccountTokenSecret))
	handler := server.New(server.Config{
		Verifier: fakeVerifier{tokens: map[string]*accountauth.Token{
			config.firebaseIDToken: {
				UID:   config.firebaseUID,
				Email: config.email,
			},
		}},
		Store:                 entitlements.NewMemoryStore(),
		Now:                   time.Now,
		BundleID:              config.bundleID,
		ProProductIDs:         []string{config.productID},
		ProStorageQuotaBytes:  20 * 1024 * 1024 * 1024,
		AppAccountTokenSecret: []byte(config.appAccountTokenSecret),
		TransactionVerifier: fakeTransactionVerifier{transactions: map[string]*appstore.Transaction{
			config.signedTransactionJWS: {
				BundleID:              config.bundleID,
				ProductID:             config.productID,
				TransactionID:         "acacia-ui-test-transaction",
				OriginalTransactionID: "acacia-ui-test-original-transaction",
				AppAccountToken:       appAccountToken,
				ExpiresAt:             time.Now().Add(30 * 24 * time.Hour),
			},
		}},
	})

	log.Printf("acacia pro e2e backend listening on :%s", config.port)
	log.Fatal(http.ListenAndServe(":"+config.port, handler))
}

type config struct {
	port                  string
	firebaseIDToken       string
	firebaseUID           string
	email                 string
	signedTransactionJWS  string
	appAccountTokenSecret string
	bundleID              string
	productID             string
}

func loadConfig() config {
	return config{
		port:                  envOrDefault("PORT", "18080"),
		firebaseIDToken:       envOrDefault("ACACIA_E2E_FIREBASE_TOKEN", "acacia-ui-test-token"),
		firebaseUID:           envOrDefault("ACACIA_E2E_FIREBASE_UID", "acacia-ui-test-user"),
		email:                 envOrDefault("ACACIA_E2E_EMAIL", "purchase-test@acacia.local"),
		signedTransactionJWS:  envOrDefault("ACACIA_E2E_SIGNED_TRANSACTION_JWS", "acacia-ui-test-jws"),
		appAccountTokenSecret: envOrDefault("ACACIA_APP_ACCOUNT_TOKEN_SECRET", "acacia-ui-test-secret"),
		bundleID:              envOrDefault("ACACIA_BUNDLE_ID", "com.benebsworth.acacia"),
		productID:             envOrDefault("ACACIA_PRO_PRODUCT_ID", "com.benebsworth.acacia.pro.monthly"),
	}
}

func envOrDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

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
