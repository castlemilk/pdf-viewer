package appleid

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultTokenURL  = "https://appleid.apple.com/auth/token"
	defaultRevokeURL = "https://appleid.apple.com/auth/revoke"
)

type Config struct {
	TeamID        string
	KeyID         string
	ClientID      string
	PrivateKeyPEM string
	HTTPClient    *http.Client
	TokenURL      string
	RevokeURL     string
	Now           func() time.Time
}

type Revoker struct {
	teamID     string
	keyID      string
	clientID   string
	privateKey *ecdsa.PrivateKey
	httpClient *http.Client
	tokenURL   string
	revokeURL  string
	now        func() time.Time
}

func NewRevoker(config Config) (*Revoker, error) {
	if strings.TrimSpace(config.TeamID) == "" {
		return nil, errors.New("apple team id is required")
	}
	if strings.TrimSpace(config.KeyID) == "" {
		return nil, errors.New("apple key id is required")
	}
	if strings.TrimSpace(config.ClientID) == "" {
		return nil, errors.New("apple client id is required")
	}
	privateKey, err := parsePrivateKey(config.PrivateKeyPEM)
	if err != nil {
		return nil, err
	}

	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	tokenURL := config.TokenURL
	if tokenURL == "" {
		tokenURL = defaultTokenURL
	}
	revokeURL := config.RevokeURL
	if revokeURL == "" {
		revokeURL = defaultRevokeURL
	}

	return &Revoker{
		teamID:     strings.TrimSpace(config.TeamID),
		keyID:      strings.TrimSpace(config.KeyID),
		clientID:   strings.TrimSpace(config.ClientID),
		privateKey: privateKey,
		httpClient: httpClient,
		tokenURL:   tokenURL,
		revokeURL:  revokeURL,
		now:        now,
	}, nil
}

func (revoker *Revoker) RevokeAuthorizationCode(ctx context.Context, authorizationCode string) error {
	authorizationCode = strings.TrimSpace(authorizationCode)
	if authorizationCode == "" {
		return errors.New("authorization code is required")
	}

	secret, err := revoker.clientSecret()
	if err != nil {
		return err
	}
	token, tokenTypeHint, err := revoker.exchangeAuthorizationCode(ctx, authorizationCode, secret)
	if err != nil {
		return err
	}
	return revoker.revokeToken(ctx, token, tokenTypeHint, secret)
}

func (revoker *Revoker) exchangeAuthorizationCode(ctx context.Context, authorizationCode string, clientSecret string) (string, string, error) {
	response, err := revoker.postForm(ctx, revoker.tokenURL, url.Values{
		"client_id":     {revoker.clientID},
		"client_secret": {clientSecret},
		"code":          {authorizationCode},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		return "", "", err
	}
	refreshToken := strings.TrimSpace(response["refresh_token"])
	if refreshToken != "" {
		return refreshToken, "refresh_token", nil
	}
	accessToken := strings.TrimSpace(response["access_token"])
	if accessToken != "" {
		return accessToken, "access_token", nil
	}
	return "", "", errors.New("apple token response did not include a revocable token")
}

func (revoker *Revoker) revokeToken(ctx context.Context, token string, tokenTypeHint string, clientSecret string) error {
	_, err := revoker.postForm(ctx, revoker.revokeURL, url.Values{
		"client_id":       {revoker.clientID},
		"client_secret":   {clientSecret},
		"token":           {token},
		"token_type_hint": {tokenTypeHint},
	})
	return err
}

func (revoker *Revoker) postForm(ctx context.Context, endpoint string, form url.Values) (map[string]string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := revoker.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("apple id endpoint returned %d", response.StatusCode)
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return map[string]string{}, nil
	}

	var decoded map[string]string
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, fmt.Errorf("decode apple id response: %w", err)
	}
	return decoded, nil
}

func (revoker *Revoker) clientSecret() (string, error) {
	now := revoker.now()
	header := map[string]string{
		"alg": "ES256",
		"kid": revoker.keyID,
	}
	claims := map[string]any{
		"iss": revoker.teamID,
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
		"aud": "https://appleid.apple.com",
		"sub": revoker.clientID,
	}
	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	unsigned := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(claimsJSON)
	digest := sha256.Sum256([]byte(unsigned))
	r, s, err := ecdsa.Sign(rand.Reader, revoker.privateKey, digest[:])
	if err != nil {
		return "", err
	}
	signature := append(padInt(r, 32), padInt(s, 32)...)
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func parsePrivateKey(value string) (*ecdsa.PrivateKey, error) {
	value = strings.TrimSpace(strings.ReplaceAll(value, `\n`, "\n"))
	if value == "" {
		return nil, errors.New("apple private key is required")
	}
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, errors.New("apple private key is not valid PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse apple private key: %w", err)
	}
	ecdsaKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("apple private key must be an ECDSA key")
	}
	return ecdsaKey, nil
}

func padInt(value *big.Int, size int) []byte {
	bytes := value.Bytes()
	if len(bytes) >= size {
		return bytes[len(bytes)-size:]
	}
	output := make([]byte, size)
	copy(output[size-len(bytes):], bytes)
	return output
}
