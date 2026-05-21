package appstore

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
	"time"
)

func TestSignedTransactionVerifierVerifiesJWSAndDecodesPayload(t *testing.T) {
	key, cert, roots := generateSigningCert(t)
	signed := signTransaction(t, key, cert, map[string]any{
		"bundleId":              "com.benebsworth.acacia",
		"productId":             "com.benebsworth.acacia.pro.monthly",
		"transactionId":         "tx_123",
		"originalTransactionId": "original_tx_123",
		"appAccountToken":       "5cd16a20-ccf1-4b28-98db-163337e35ca2",
		"expiresDate":           int64(1780000000000),
	})
	verifier := NewSignedTransactionVerifier(roots)

	transaction, err := verifier.VerifySignedTransaction(t.Context(), signed)

	if err != nil {
		t.Fatalf("expected transaction to verify: %v", err)
	}
	if transaction.BundleID != "com.benebsworth.acacia" {
		t.Fatalf("unexpected bundle id %q", transaction.BundleID)
	}
	if transaction.ProductID != "com.benebsworth.acacia.pro.monthly" {
		t.Fatalf("unexpected product id %q", transaction.ProductID)
	}
	if transaction.OriginalTransactionID != "original_tx_123" {
		t.Fatalf("unexpected original transaction id %q", transaction.OriginalTransactionID)
	}
	if transaction.AppAccountToken != "5cd16a20-ccf1-4b28-98db-163337e35ca2" {
		t.Fatalf("unexpected app account token %q", transaction.AppAccountToken)
	}
	if transaction.ExpiresAt.UnixMilli() != 1780000000000 {
		t.Fatalf("unexpected expiry %s", transaction.ExpiresAt)
	}
}

func TestSignedTransactionVerifierRejectsTamperedPayload(t *testing.T) {
	key, cert, roots := generateSigningCert(t)
	signed := signTransaction(t, key, cert, map[string]any{
		"bundleId":              "com.benebsworth.acacia",
		"productId":             "com.benebsworth.acacia.pro.monthly",
		"transactionId":         "tx_123",
		"originalTransactionId": "original_tx_123",
		"appAccountToken":       "5cd16a20-ccf1-4b28-98db-163337e35ca2",
		"expiresDate":           int64(1780000000000),
	})
	parts := strings.Split(signed, ".")
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(`{"bundleId":"com.attacker.app"}`))
	verifier := NewSignedTransactionVerifier(roots)

	if _, err := verifier.VerifySignedTransaction(t.Context(), strings.Join(parts, ".")); err == nil {
		t.Fatal("expected tampered payload to fail verification")
	}
}

func TestSignedNotificationVerifierVerifiesJWSAndDecodesPayload(t *testing.T) {
	key, cert, roots := generateSigningCert(t)
	signedTransaction := signTransaction(t, key, cert, map[string]any{
		"bundleId":              "com.benebsworth.acacia",
		"productId":             "com.benebsworth.acacia.pro.monthly",
		"transactionId":         "tx_123",
		"originalTransactionId": "original_tx_123",
		"appAccountToken":       "5cd16a20-ccf1-4b28-98db-163337e35ca2",
		"expiresDate":           int64(1780000000000),
	})
	signedNotification := signTransaction(t, key, cert, map[string]any{
		"notificationType": "DID_RENEW",
		"subtype":          "BILLING_RECOVERY",
		"signedDate":       int64(1770000000000),
		"data": map[string]any{
			"signedTransactionInfo": signedTransaction,
		},
	})
	verifier := NewSignedNotificationVerifier(roots)

	notification, err := verifier.VerifySignedNotification(t.Context(), signedNotification)

	if err != nil {
		t.Fatalf("expected notification to verify: %v", err)
	}
	if notification.NotificationType != "DID_RENEW" {
		t.Fatalf("unexpected notification type %q", notification.NotificationType)
	}
	if notification.Subtype != "BILLING_RECOVERY" {
		t.Fatalf("unexpected subtype %q", notification.Subtype)
	}
	if notification.SignedTransactionInfo != signedTransaction {
		t.Fatalf("unexpected signed transaction info")
	}
	if notification.SignedDate.UnixMilli() != 1770000000000 {
		t.Fatalf("unexpected signed date %s", notification.SignedDate)
	}
}

func generateSigningCert(t *testing.T) (*ecdsa.PrivateKey, *x509.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName: "App Store Test Transaction Signing",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse cert: %v", err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(cert)
	return key, cert, roots
}

func signTransaction(t *testing.T, key *ecdsa.PrivateKey, cert *x509.Certificate, payload map[string]any) string {
	t.Helper()
	header := map[string]any{
		"alg": "ES256",
		"x5c": []string{base64.StdEncoding.EncodeToString(cert.Raw)},
	}
	headerJSON, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	headerPart := base64.RawURLEncoding.EncodeToString(headerJSON)
	payloadPart := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signingInput := headerPart + "." + payloadPart
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatalf("sign transaction: %v", err)
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}
