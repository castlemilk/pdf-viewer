import {createInitialLibraryState} from '../src/domain';
import type {Annotation, LibraryState} from '../src/domain';
import {
  applyCloudLibrarySnapshot,
  createCloudLibrarySnapshot,
  createProCloudSynchronizer,
} from '../src/pro/proCloudSynchronizer';

const createdAt = '2026-05-20T10:00:00.000Z';
const modifiedAt = '2026-05-21T10:00:00.000Z';

function localLibrary(): LibraryState {
  const initial = createInitialLibraryState();
  return {
    ...initial,
    documents: [
      {
        id: 'roadmap',
        title: 'Product Roadmap',
        author: 'Product',
        kind: 'pdf',
        pageCount: 44,
        sizeMb: 1.2,
        progress: 0.6,
        createdAt,
        modifiedAt,
        lastOpenedAt: '2026-05-22T10:00:00.000Z',
        tags: ['work'],
        collectionIds: ['briefs'],
        favorite: true,
        shared: false,
        thumbnailTone: 'navy',
        path: '/Users/eshe/Documents/roadmap.pdf',
        bookmark: 'security-bookmark',
        versionLabel: '2.0',
      },
    ],
  };
}

function localAnnotation(): Annotation {
  return {
    id: 'highlight-1',
    documentId: 'roadmap',
    pageIndex: 2,
    kind: 'highlight',
    color: '#F8D867',
    bounds: {x: 10.25, y: 20.5, width: 160, height: 18.75},
    text: 'steady growth',
    createdAt,
    updatedAt: modifiedAt,
  };
}

test('creates a privacy-safe cloud snapshot from local library and annotations', () => {
  const snapshot = createCloudLibrarySnapshot(localLibrary(), [localAnnotation()]);

  expect(snapshot.documents).toEqual([
    expect.objectContaining({
      id: 'roadmap',
      title: 'Product Roadmap',
      sizeBytes: Math.round(1.2 * 1024 * 1024),
      progress: 0.6,
      tags: ['work'],
      collectionIds: ['briefs'],
      favorite: true,
      thumbnailTone: 'navy',
      versionLabel: '2.0',
    }),
  ]);
  expect(snapshot).not.toEqual(
    expect.objectContaining({
      path: expect.any(String),
      bookmark: expect.any(String),
    }),
  );
  expect(snapshot.annotations).toEqual([
    expect.objectContaining({
      id: 'highlight-1',
      documentId: 'roadmap',
      bounds: {x: 10.25, y: 20.5, width: 160, height: 18.75},
      text: 'steady growth',
    }),
  ]);
});

test('applies cloud snapshot while preserving local file access fields', () => {
  const result = applyCloudLibrarySnapshot(localLibrary(), [localAnnotation()], {
    documents: [
      {
        id: 'roadmap',
        title: 'Product Roadmap Updated',
        author: 'Product',
        pageCount: 45,
        sizeBytes: 2 * 1024 * 1024,
        progress: 0.75,
        createdAt,
        modifiedAt: '2026-05-23T10:00:00.000Z',
        lastOpenedAt: '2026-05-24T10:00:00.000Z',
        tags: ['work', 'signed'],
        collectionIds: ['briefs'],
        favorite: false,
        shared: true,
        thumbnailTone: 'paper',
        versionLabel: '2.1',
        revision: 3,
      },
    ],
    annotations: [
      {
        ...localAnnotation(),
        text: 'remote steady growth',
        revision: 4,
      },
    ],
    revision: 5,
  });

  expect(result.libraryState.documents[0]).toEqual(
    expect.objectContaining({
      title: 'Product Roadmap Updated',
      pageCount: 45,
      path: '/Users/eshe/Documents/roadmap.pdf',
      bookmark: 'security-bookmark',
      shared: true,
    }),
  );
  expect(result.annotations).toEqual([
    expect.objectContaining({
      id: 'highlight-1',
      text: 'remote steady growth',
    }),
  ]);
});

test('cloud synchronizer no-ops when auth or backend is unavailable', async () => {
  const synchronizer = createProCloudSynchronizer({});

  await expect(
    synchronizer.syncLibrary(createCloudLibrarySnapshot(localLibrary(), [])),
  ).resolves.toBeUndefined();
});

test('cloud synchronizer sends snapshots with Firebase auth token', async () => {
  const backendClient = {
    syncLibrary: jest.fn(async (_token, snapshot) => ({
      snapshot: {
        ...snapshot,
        revision: 6,
      },
    })),
    uploadDocumentContent: jest.fn(),
  };
  const synchronizer = createProCloudSynchronizer({
    authTokenProvider: {getIDToken: jest.fn(async () => 'firebase-token')},
    backendClient,
  });
  const snapshot = createCloudLibrarySnapshot(localLibrary(), [localAnnotation()]);

  await expect(synchronizer.syncLibrary(snapshot)).resolves.toEqual({
    snapshot: expect.objectContaining({revision: 6}),
  });
  expect(backendClient.syncLibrary).toHaveBeenCalledWith(
    'firebase-token',
    snapshot,
  );
});

test('cloud synchronizer uploads document content with Firebase auth token', async () => {
  const backendClient = {
    syncLibrary: jest.fn(),
    uploadDocumentContent: jest.fn(async () => ({
      documentId: 'roadmap',
      sizeBytes: 4,
    })),
  };
  const synchronizer = createProCloudSynchronizer({
    authTokenProvider: {getIDToken: jest.fn(async () => 'firebase-token')},
    backendClient,
  });
  const data = Uint8Array.from([1, 2, 3, 4]);

  await expect(
    synchronizer.uploadDocumentContent({
      documentId: 'roadmap',
      data,
      contentType: 'application/pdf',
    }),
  ).resolves.toEqual({documentId: 'roadmap', sizeBytes: 4});
  expect(backendClient.uploadDocumentContent).toHaveBeenCalledWith(
    'firebase-token',
    {
      documentId: 'roadmap',
      data,
      contentType: 'application/pdf',
    },
  );
});
