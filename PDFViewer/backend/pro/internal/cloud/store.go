package cloud

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"sync"

	"cloud.google.com/go/storage"
	prov1 "github.com/benebsworth/acacia/backend/pro/gen/acacia/pro/v1"
	"google.golang.org/api/iterator"
	"google.golang.org/protobuf/proto"
)

var ErrNotFound = errors.New("cloud document not found")

type DocumentContent struct {
	Data        []byte
	ContentType string
}

type Store interface {
	GetLibrary(ctx context.Context, firebaseUID string) (*prov1.CloudLibrarySnapshot, error)
	PutLibrary(ctx context.Context, firebaseUID string, snapshot *prov1.CloudLibrarySnapshot) error
	PutDocumentContent(ctx context.Context, firebaseUID string, documentID string, content DocumentContent) error
	GetDocumentContent(ctx context.Context, firebaseUID string, documentID string) (*DocumentContent, error)
	StorageUsedBytes(ctx context.Context, firebaseUID string) (int64, error)
	DeleteAccount(ctx context.Context, firebaseUID string) error
}

type MemoryStore struct {
	mu        sync.RWMutex
	libraries map[string]*prov1.CloudLibrarySnapshot
	contents  map[string]DocumentContent
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		libraries: map[string]*prov1.CloudLibrarySnapshot{},
		contents:  map[string]DocumentContent{},
	}
}

func (store *MemoryStore) GetLibrary(_ context.Context, firebaseUID string) (*prov1.CloudLibrarySnapshot, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	library, ok := store.libraries[firebaseUID]
	if !ok {
		return nil, ErrNotFound
	}
	return proto.Clone(library).(*prov1.CloudLibrarySnapshot), nil
}

func (store *MemoryStore) PutLibrary(_ context.Context, firebaseUID string, snapshot *prov1.CloudLibrarySnapshot) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	store.libraries[firebaseUID] = proto.Clone(snapshot).(*prov1.CloudLibrarySnapshot)
	return nil
}

func (store *MemoryStore) PutDocumentContent(_ context.Context, firebaseUID string, documentID string, content DocumentContent) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}
	if documentID == "" {
		return errors.New("document id is required")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	store.contents[contentKey(firebaseUID, documentID)] = DocumentContent{
		Data:        append([]byte(nil), content.Data...),
		ContentType: normalizedContentType(content.ContentType),
	}
	return nil
}

func (store *MemoryStore) GetDocumentContent(_ context.Context, firebaseUID string, documentID string) (*DocumentContent, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	content, ok := store.contents[contentKey(firebaseUID, documentID)]
	if !ok {
		return nil, ErrNotFound
	}
	return &DocumentContent{
		Data:        append([]byte(nil), content.Data...),
		ContentType: normalizedContentType(content.ContentType),
	}, nil
}

func (store *MemoryStore) StorageUsedBytes(_ context.Context, firebaseUID string) (int64, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	var total int64
	for key, content := range store.contents {
		if strings.HasPrefix(key, firebaseUID+"\x00") {
			total += int64(len(content.Data))
		}
	}
	return total, nil
}

func (store *MemoryStore) DeleteAccount(_ context.Context, firebaseUID string) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.libraries, firebaseUID)
	for key := range store.contents {
		if strings.HasPrefix(key, firebaseUID+"\x00") {
			delete(store.contents, key)
		}
	}
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

func (store *GCSStore) GetLibrary(ctx context.Context, firebaseUID string) (*prov1.CloudLibrarySnapshot, error) {
	reader, err := store.bucket.Object(store.libraryObjectName(firebaseUID)).NewReader(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("open cloud library object: %w", err)
	}
	defer reader.Close()

	var data bytes.Buffer
	if _, err := io.Copy(&data, reader); err != nil {
		return nil, fmt.Errorf("read cloud library object: %w", err)
	}

	var snapshot prov1.CloudLibrarySnapshot
	if err := proto.Unmarshal(data.Bytes(), &snapshot); err != nil {
		return nil, fmt.Errorf("decode cloud library object: %w", err)
	}
	return &snapshot, nil
}

func (store *GCSStore) PutLibrary(ctx context.Context, firebaseUID string, snapshot *prov1.CloudLibrarySnapshot) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}
	data, err := proto.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("encode cloud library object: %w", err)
	}

	writer := store.bucket.Object(store.libraryObjectName(firebaseUID)).NewWriter(ctx)
	writer.ContentType = "application/x-protobuf"
	writer.ChunkSize = 0
	if _, err := writer.Write(data); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write cloud library object: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close cloud library object: %w", err)
	}
	return nil
}

func (store *GCSStore) PutDocumentContent(ctx context.Context, firebaseUID string, documentID string, content DocumentContent) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}
	if documentID == "" {
		return errors.New("document id is required")
	}

	writer := store.bucket.Object(store.contentObjectName(firebaseUID, documentID)).NewWriter(ctx)
	writer.ContentType = normalizedContentType(content.ContentType)
	writer.ChunkSize = 0
	if _, err := writer.Write(content.Data); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write document content object: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close document content object: %w", err)
	}
	return nil
}

func (store *GCSStore) GetDocumentContent(ctx context.Context, firebaseUID string, documentID string) (*DocumentContent, error) {
	reader, err := store.bucket.Object(store.contentObjectName(firebaseUID, documentID)).NewReader(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("open document content object: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read document content object: %w", err)
	}
	return &DocumentContent{
		Data:        data,
		ContentType: normalizedContentType(reader.Attrs.ContentType),
	}, nil
}

func (store *GCSStore) StorageUsedBytes(ctx context.Context, firebaseUID string) (int64, error) {
	objects := store.bucket.Objects(ctx, &storage.Query{
		Prefix: store.contentPrefix(firebaseUID),
	})

	var total int64
	for {
		attrs, err := objects.Next()
		if errors.Is(err, iterator.Done) {
			return total, nil
		}
		if err != nil {
			return 0, fmt.Errorf("list document content objects: %w", err)
		}
		total += attrs.Size
	}
}

func (store *GCSStore) DeleteAccount(ctx context.Context, firebaseUID string) error {
	if firebaseUID == "" {
		return errors.New("firebase uid is required")
	}

	objects := store.bucket.Objects(ctx, &storage.Query{
		Prefix: store.accountPrefix(firebaseUID),
	})

	for {
		attrs, err := objects.Next()
		if errors.Is(err, iterator.Done) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("list cloud account objects: %w", err)
		}
		if err := deleteGCSObject(ctx, store.bucket.Object(attrs.Name)); err != nil {
			return fmt.Errorf("delete cloud account object: %w", err)
		}
	}
}

func (store *GCSStore) libraryObjectName(firebaseUID string) string {
	return store.objectName(firebaseUID, "library.pb")
}

func (store *GCSStore) contentObjectName(firebaseUID string, documentID string) string {
	return store.objectName(firebaseUID, path.Join("documents", encodePathPart(documentID), "source.pdf"))
}

func (store *GCSStore) contentPrefix(firebaseUID string) string {
	return path.Join(store.accountPrefix(firebaseUID), "documents") + "/"
}

func (store *GCSStore) accountPrefix(firebaseUID string) string {
	name := path.Join("cloud", encodePathPart(firebaseUID)) + "/"
	if store.prefix == "" {
		return name
	}
	return store.prefix + "/" + name
}

func (store *GCSStore) objectName(firebaseUID string, suffix string) string {
	name := path.Join("cloud", encodePathPart(firebaseUID), suffix)
	if store.prefix == "" {
		return name
	}
	return store.prefix + "/" + name
}

func encodePathPart(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func contentKey(firebaseUID string, documentID string) string {
	return firebaseUID + "\x00" + documentID
}

func normalizedContentType(value string) string {
	if strings.TrimSpace(value) == "" {
		return "application/pdf"
	}
	return value
}

func deleteGCSObject(ctx context.Context, object *storage.ObjectHandle) error {
	err := object.Delete(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil
	}
	return err
}
