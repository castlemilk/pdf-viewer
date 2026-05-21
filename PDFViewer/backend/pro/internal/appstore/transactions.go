package appstore

import (
	"context"
	"time"
)

type Transaction struct {
	BundleID              string
	ProductID             string
	TransactionID         string
	OriginalTransactionID string
	AppAccountToken       string
	ExpiresAt             time.Time
	RevokedAt             time.Time
}

type TransactionVerifier interface {
	VerifySignedTransaction(ctx context.Context, signedTransaction string) (*Transaction, error)
}
