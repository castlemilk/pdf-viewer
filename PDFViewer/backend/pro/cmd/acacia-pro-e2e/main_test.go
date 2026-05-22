package main

import "testing"

func TestLoadConfigDefaultsToDeterministicPurchaseFixture(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("ACACIA_E2E_FIREBASE_TOKEN", "")
	t.Setenv("ACACIA_E2E_FIREBASE_UID", "")
	t.Setenv("ACACIA_E2E_SIGNED_TRANSACTION_JWS", "")

	config := loadConfig()

	if config.port != "18080" {
		t.Fatalf("unexpected port %q", config.port)
	}
	if config.firebaseIDToken != "acacia-ui-test-token" {
		t.Fatalf("unexpected firebase token %q", config.firebaseIDToken)
	}
	if config.firebaseUID != "acacia-ui-test-user" {
		t.Fatalf("unexpected firebase uid %q", config.firebaseUID)
	}
	if config.signedTransactionJWS != "acacia-ui-test-jws" {
		t.Fatalf("unexpected signed transaction fixture %q", config.signedTransactionJWS)
	}
}
