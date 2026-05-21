package entitlements_test

import (
	"testing"

	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"github.com/benebsworth/acacia/backend/pro/internal/entitlements"
)

func TestMemoryStoreIndexesEntitlementsByAppAccountToken(t *testing.T) {
	store := entitlements.NewMemoryStore()
	account := &prov1.AccountEntitlement{
		FirebaseUid:       "user_pro",
		Email:             "pro@example.com",
		Plan:              prov1.Plan_PLAN_PRO,
		Active:            true,
		AppAccountToken:   "5cd16a20-ccf1-4b28-98db-163337e35ca2",
		StorageQuotaBytes: 20,
	}

	if err := store.Put(t.Context(), account); err != nil {
		t.Fatalf("put account: %v", err)
	}

	found, err := store.GetByAppAccountToken(t.Context(), account.GetAppAccountToken())
	if err != nil {
		t.Fatalf("get by app account token: %v", err)
	}
	if found.GetFirebaseUid() != "user_pro" {
		t.Fatalf("expected indexed account, got %q", found.GetFirebaseUid())
	}
}
