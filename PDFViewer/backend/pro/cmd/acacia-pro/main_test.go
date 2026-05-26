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
	if config.CloudBucket != "acacia-entitlements" {
		t.Fatalf("expected cloud bucket to default to entitlement bucket, got %q", config.CloudBucket)
	}
}

func TestLoadConfigAllowsDedicatedCloudBucket(t *testing.T) {
	t.Setenv("ACACIA_ENTITLEMENTS_BUCKET", "acacia-entitlements")
	t.Setenv("ACACIA_CLOUD_BUCKET", "acacia-cloud")
	t.Setenv("ACACIA_CLOUD_PREFIX", "cloud-prefix")
	t.Setenv("ACACIA_APP_ACCOUNT_TOKEN_SECRET", "secret")

	config, err := loadConfig()

	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}
	if config.CloudBucket != "acacia-cloud" {
		t.Fatalf("unexpected cloud bucket: %q", config.CloudBucket)
	}
	if config.CloudPrefix != "cloud-prefix" {
		t.Fatalf("unexpected cloud prefix: %q", config.CloudPrefix)
	}
}

func TestLoadConfigTrimsSecretManagerNewlines(t *testing.T) {
	t.Setenv("ACACIA_ENTITLEMENTS_BUCKET", "acacia-entitlements")
	t.Setenv("ACACIA_APP_ACCOUNT_TOKEN_SECRET", "app-secret\n")
	t.Setenv("ACACIA_ADMIN_TOKEN", "admin-secret\n")

	config, err := loadConfig()

	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}
	if config.AppAccountTokenSecret != "app-secret" {
		t.Fatalf("expected trimmed app account token secret, got %q", config.AppAccountTokenSecret)
	}
	if config.AdminToken != "admin-secret" {
		t.Fatalf("expected trimmed admin token, got %q", config.AdminToken)
	}
}
