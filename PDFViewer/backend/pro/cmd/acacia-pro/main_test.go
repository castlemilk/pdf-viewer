package main

import "testing"

func TestLoadConfigRequiresAppAccountTokenSecret(t *testing.T) {
	t.Setenv("ACACIA_ENTITLEMENTS_BUCKET", "acacia-entitlements")

	if _, err := loadConfig(); err == nil {
		t.Fatal("expected missing app account token secret to fail config loading")
	}
}

func TestLoadConfigParsesPaymentProductSettings(t *testing.T) {
	t.Setenv("ACACIA_ENTITLEMENTS_BUCKET", "acacia-entitlements")
	t.Setenv("ACACIA_APP_ACCOUNT_TOKEN_SECRET", "secret")
	t.Setenv("ACACIA_PRO_PRODUCT_IDS", "monthly, yearly")
	t.Setenv("ACACIA_PRO_STORAGE_QUOTA_BYTES", "42")

	config, err := loadConfig()

	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}
	if len(config.ProProductIDs) != 2 || config.ProProductIDs[0] != "monthly" || config.ProProductIDs[1] != "yearly" {
		t.Fatalf("unexpected product ids: %v", config.ProProductIDs)
	}
	if config.ProStorageQuotaBytes != 42 {
		t.Fatalf("unexpected quota: %d", config.ProStorageQuotaBytes)
	}
}
