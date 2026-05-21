package entitlements

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	"cloud.google.com/go/storage"
	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"google.golang.org/protobuf/proto"
)

var ErrNotFound = errors.New("entitlement not found")

type Store interface {
	Get(ctx context.Context, firebaseUID string) (*prov1.AccountEntitlement, error)
	Put(ctx context.Context, entitlement *prov1.AccountEntitlement) error
}

type MemoryStore struct {
	mu      sync.RWMutex
	records map[string]*prov1.AccountEntitlement
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		records: map[string]*prov1.AccountEntitlement{},
	}
}

func (store *MemoryStore) Get(_ context.Context, firebaseUID string) (*prov1.AccountEntitlement, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	record, ok := store.records[firebaseUID]
	if !ok {
		return nil, ErrNotFound
	}
	return proto.Clone(record).(*prov1.AccountEntitlement), nil
}

func (store *MemoryStore) Put(_ context.Context, entitlement *prov1.AccountEntitlement) error {
	if entitlement.GetFirebaseUid() == "" {
		return errors.New("firebase uid is required")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	store.records[entitlement.GetFirebaseUid()] = proto.Clone(entitlement).(*prov1.AccountEntitlement)
	return nil
}

type GCSStore struct {
	bucket *storage.BucketHandle
	prefix string
}

func NewGCSStore(client *storage.Client, bucketName string, prefix string) (*GCSStore, error) {
	if bucketName == "" {
		return nil, errors.New("bucket name is required")
	}
	return &GCSStore{
		bucket: client.Bucket(bucketName),
		prefix: strings.Trim(prefix, "/"),
	}, nil
}

func (store *GCSStore) Get(ctx context.Context, firebaseUID string) (*prov1.AccountEntitlement, error) {
	reader, err := store.bucket.Object(store.objectName(firebaseUID)).NewReader(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("open entitlement object: %w", err)
	}
	defer reader.Close()

	var data bytes.Buffer
	if _, err := io.Copy(&data, reader); err != nil {
		return nil, fmt.Errorf("read entitlement object: %w", err)
	}

	var entitlement prov1.AccountEntitlement
	if err := proto.Unmarshal(data.Bytes(), &entitlement); err != nil {
		return nil, fmt.Errorf("decode entitlement object: %w", err)
	}
	return &entitlement, nil
}

func (store *GCSStore) Put(ctx context.Context, entitlement *prov1.AccountEntitlement) error {
	if entitlement.GetFirebaseUid() == "" {
		return errors.New("firebase uid is required")
	}

	data, err := proto.Marshal(entitlement)
	if err != nil {
		return fmt.Errorf("encode entitlement object: %w", err)
	}

	writer := store.bucket.Object(store.objectName(entitlement.GetFirebaseUid())).NewWriter(ctx)
	writer.ContentType = "application/x-protobuf"
	writer.ChunkSize = 0
	if _, err := writer.Write(data); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write entitlement object: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close entitlement object: %w", err)
	}
	return nil
}

func (store *GCSStore) objectName(firebaseUID string) string {
	encodedUID := base64.RawURLEncoding.EncodeToString([]byte(firebaseUID))
	name := "accounts/" + encodedUID + ".pb"
	if store.prefix == "" {
		return name
	}
	return store.prefix + "/" + name
}
