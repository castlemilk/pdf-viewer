package appstore

import (
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

type SignedTransactionVerifier struct {
	roots *x509.CertPool
}

type SignedNotificationVerifier struct {
	roots *x509.CertPool
}

func NewSignedTransactionVerifier(roots *x509.CertPool) *SignedTransactionVerifier {
	return &SignedTransactionVerifier{roots: roots}
}

func NewSignedNotificationVerifier(roots *x509.CertPool) *SignedNotificationVerifier {
	return &SignedNotificationVerifier{roots: roots}
}

func (verifier *SignedTransactionVerifier) VerifySignedTransaction(_ context.Context, signedTransaction string) (*Transaction, error) {
	payloadBytes, err := verifyCompactJWS(signedTransaction, verifier.roots)
	if err != nil {
		return nil, err
	}

	var payload jwsTransactionPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("parse jws payload: %w", err)
	}

	return &Transaction{
		BundleID:              payload.BundleID,
		ProductID:             payload.ProductID,
		TransactionID:         payload.TransactionID,
		OriginalTransactionID: payload.OriginalTransactionID,
		AppAccountToken:       payload.AppAccountToken,
		ExpiresAt:             unixMillisTime(payload.ExpiresDate),
		RevokedAt:             unixMillisTime(payload.RevocationDate),
	}, nil
}

func (verifier *SignedNotificationVerifier) VerifySignedNotification(_ context.Context, signedPayload string) (*Notification, error) {
	payloadBytes, err := verifyCompactJWS(signedPayload, verifier.roots)
	if err != nil {
		return nil, err
	}

	var payload jwsNotificationPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("parse notification payload: %w", err)
	}
	return &Notification{
		NotificationType:      payload.NotificationType,
		Subtype:               payload.Subtype,
		SignedDate:            unixMillisTime(payload.SignedDate),
		SignedTransactionInfo: payload.Data.SignedTransactionInfo,
	}, nil
}

func verifyCompactJWS(signedValue string, roots *x509.CertPool) ([]byte, error) {
	parts := strings.Split(signedValue, ".")
	if len(parts) != 3 {
		return nil, errors.New("signed transaction must use compact JWS serialization")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode jws header: %w", err)
	}
	var header jwsHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("parse jws header: %w", err)
	}
	if header.Alg != "ES256" {
		return nil, fmt.Errorf("unsupported jws algorithm %q", header.Alg)
	}

	certs, err := parseCertificateChain(header.X5C)
	if err != nil {
		return nil, err
	}
	leaf := certs[0]
	if err := verifyCertificateChain(certs, roots); err != nil {
		return nil, err
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("decode jws signature: %w", err)
	}
	if len(signature) != 64 {
		return nil, fmt.Errorf("invalid ES256 signature length %d", len(signature))
	}

	publicKey, ok := leaf.PublicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, errors.New("jws certificate public key is not ECDSA")
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])
	if !ecdsa.Verify(publicKey, digest[:], r, s) {
		return nil, errors.New("jws signature verification failed")
	}

	return base64.RawURLEncoding.DecodeString(parts[1])
}

func verifyCertificateChain(certs []*x509.Certificate, roots *x509.CertPool) error {
	if roots == nil {
		systemRoots, err := x509.SystemCertPool()
		if err != nil {
			return fmt.Errorf("load system cert pool: %w", err)
		}
		roots = systemRoots
	}

	intermediates := x509.NewCertPool()
	for _, cert := range certs[1:] {
		intermediates.AddCert(cert)
	}
	if _, err := certs[0].Verify(x509.VerifyOptions{
		Roots:         roots,
		Intermediates: intermediates,
		CurrentTime:   time.Now(),
	}); err != nil {
		return fmt.Errorf("verify jws certificate chain: %w", err)
	}
	return nil
}

func parseCertificateChain(encodedCerts []string) ([]*x509.Certificate, error) {
	if len(encodedCerts) == 0 {
		return nil, errors.New("jws header missing x5c certificate chain")
	}
	certs := make([]*x509.Certificate, 0, len(encodedCerts))
	for _, encoded := range encodedCerts {
		der, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("decode x5c certificate: %w", err)
		}
		cert, err := x509.ParseCertificate(der)
		if err != nil {
			return nil, fmt.Errorf("parse x5c certificate: %w", err)
		}
		certs = append(certs, cert)
	}
	return certs, nil
}

func unixMillisTime(value int64) time.Time {
	if value == 0 {
		return time.Time{}
	}
	return time.UnixMilli(value).UTC()
}

type jwsHeader struct {
	Alg string   `json:"alg"`
	X5C []string `json:"x5c"`
}

type jwsTransactionPayload struct {
	BundleID              string `json:"bundleId"`
	ProductID             string `json:"productId"`
	TransactionID         string `json:"transactionId"`
	OriginalTransactionID string `json:"originalTransactionId"`
	AppAccountToken       string `json:"appAccountToken"`
	ExpiresDate           int64  `json:"expiresDate"`
	RevocationDate        int64  `json:"revocationDate"`
}

type jwsNotificationPayload struct {
	NotificationType string `json:"notificationType"`
	Subtype          string `json:"subtype"`
	SignedDate       int64  `json:"signedDate"`
	Data             struct {
		SignedTransactionInfo string `json:"signedTransactionInfo"`
	} `json:"data"`
}
