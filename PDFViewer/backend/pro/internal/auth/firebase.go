package auth

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
)

type Token struct {
	UID   string
	Email string
}

type Verifier interface {
	VerifyIDToken(ctx context.Context, idToken string) (*Token, error)
}

type FirebaseVerifier struct {
	client *firebaseauth.Client
}

func NewFirebaseVerifier(ctx context.Context, projectID string) (*FirebaseVerifier, error) {
	config := &firebase.Config{}
	if projectID != "" {
		config.ProjectID = projectID
	}

	app, err := firebase.NewApp(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("initialize firebase app: %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("initialize firebase auth client: %w", err)
	}

	return &FirebaseVerifier{client: client}, nil
}

func (verifier *FirebaseVerifier) VerifyIDToken(ctx context.Context, idToken string) (*Token, error) {
	verified, err := verifier.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("verify firebase id token: %w", err)
	}

	email, _ := verified.Claims["email"].(string)
	return &Token{
		UID:   verified.UID,
		Email: email,
	}, nil
}
