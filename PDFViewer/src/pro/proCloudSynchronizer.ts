import {
  createInitialLibraryState,
  getCollectionCounts,
  type Annotation,
  type DocumentRecord,
  type LibraryState,
  type Tag,
} from '../domain';
import type {ProAuthTokenProvider} from './proPurchaseCoordinator';
import type {
  CloudAnnotation,
  CloudDocument,
  CloudLibrarySnapshot,
  SyncLibraryResponse,
  UploadDocumentContentResponse,
} from './protobuf';

export type ProCloudBackend = {
  syncLibrary: (
    firebaseIDToken: string,
    snapshot: CloudLibrarySnapshot,
  ) => Promise<SyncLibraryResponse>;
  uploadDocumentContent?: (
    firebaseIDToken: string,
    input: {
      documentId: string;
      data: Uint8Array;
      contentType: string;
    },
  ) => Promise<UploadDocumentContentResponse>;
};

export type ProCloudSynchronizer = {
  syncLibrary: (
    snapshot: CloudLibrarySnapshot,
  ) => Promise<SyncLibraryResponse | undefined>;
  uploadDocumentContent: (input: {
    documentId: string;
    data: Uint8Array;
    contentType: string;
  }) => Promise<UploadDocumentContentResponse | undefined>;
};

export function createProCloudSynchronizer({
  authTokenProvider,
  backendClient,
}: {
  authTokenProvider?: ProAuthTokenProvider;
  backendClient?: ProCloudBackend;
}): ProCloudSynchronizer {
  return {
    async syncLibrary(snapshot) {
      if (!authTokenProvider || !backendClient) {
        return undefined;
      }

      const firebaseIDToken = await authTokenProvider.getIDToken();
      if (!firebaseIDToken) {
        return undefined;
      }

      return backendClient.syncLibrary(firebaseIDToken, snapshot);
    },

    async uploadDocumentContent(input) {
      if (!authTokenProvider || !backendClient?.uploadDocumentContent) {
        return undefined;
      }

      const firebaseIDToken = await authTokenProvider.getIDToken();
      if (!firebaseIDToken) {
        return undefined;
      }

      return backendClient.uploadDocumentContent(firebaseIDToken, input);
    },
  };
}

export function createCloudLibrarySnapshot(
  libraryState: LibraryState,
  annotations: Annotation[],
): CloudLibrarySnapshot {
  return {
    documents: libraryState.documents.map(documentToCloudDocument),
    annotations: annotations.map(annotationToCloudAnnotation),
    updatedAt: new Date().toISOString(),
  };
}

export function applyCloudLibrarySnapshot(
  libraryState: LibraryState,
  annotations: Annotation[],
  snapshot: CloudLibrarySnapshot,
): {
  libraryState: LibraryState;
  annotations: Annotation[];
} {
  const localById = new Map(
    libraryState.documents.map(document => [document.id, document]),
  );
  const remoteDocuments = snapshot.documents.map(document =>
    cloudDocumentToLocalDocument(document, localById.get(document.id)),
  );
  const remoteDocumentIds = new Set(remoteDocuments.map(document => document.id));
  const documents = [
    ...remoteDocuments,
    ...libraryState.documents.filter(document => !remoteDocumentIds.has(document.id)),
  ];
  const collections = libraryState.collections.map(collection => ({
    ...collection,
    count: getCollectionCounts(documents, libraryState.collections)[collection.id] ?? 0,
  }));

  return {
    libraryState: {
      ...libraryState,
      documents,
      tags: mergeTags(libraryState.tags, snapshot.documents),
      collections,
    },
    annotations: mergeAnnotations(annotations, snapshot.annotations),
  };
}

function documentToCloudDocument(document: DocumentRecord): CloudDocument {
  return {
    id: document.id,
    title: document.title,
    author: document.author,
    pageCount: document.pageCount,
    sizeBytes: Math.round(document.sizeMb * 1024 * 1024),
    progress: document.progress,
    createdAt: document.createdAt,
    modifiedAt: document.modifiedAt,
    lastOpenedAt: document.lastOpenedAt,
    tags: document.tags,
    collectionIds: document.collectionIds,
    favorite: document.favorite,
    shared: document.shared,
    thumbnailTone: document.thumbnailTone,
    versionLabel: document.versionLabel ?? '',
  };
}

function annotationToCloudAnnotation(annotation: Annotation): CloudAnnotation {
  return {
    id: annotation.id,
    documentId: annotation.documentId,
    pageIndex: annotation.pageIndex,
    kind: annotation.kind,
    color: annotation.color,
    bounds: annotation.bounds,
    points: annotation.points ?? [],
    text: annotation.text ?? '',
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

function cloudDocumentToLocalDocument(
  document: CloudDocument,
  existing?: DocumentRecord,
): DocumentRecord {
  return {
    ...(existing ??
      createInitialLibraryState().documents[0] ?? {
        kind: 'pdf',
        pageThumbnailPaths: {},
      }),
    id: document.id,
    title: document.title,
    author: document.author,
    kind: 'pdf',
    pageCount: document.pageCount,
    sizeMb: document.sizeBytes / (1024 * 1024),
    progress: document.progress,
    createdAt: document.createdAt,
    modifiedAt: document.modifiedAt,
    lastOpenedAt: document.lastOpenedAt,
    tags: document.tags,
    collectionIds: document.collectionIds,
    favorite: document.favorite,
    shared: document.shared,
    thumbnailTone: thumbnailTone(document.thumbnailTone),
    versionLabel: document.versionLabel || undefined,
    path: existing?.path,
    bookmark: existing?.bookmark,
    pageThumbnailPaths: existing?.pageThumbnailPaths,
  };
}

function mergeAnnotations(
  localAnnotations: Annotation[],
  cloudAnnotations: CloudAnnotation[],
): Annotation[] {
  const merged = new Map<string, Annotation>();
  for (const annotation of localAnnotations) {
    merged.set(annotation.id, annotation);
  }
  for (const annotation of cloudAnnotations) {
    merged.set(annotation.id, {
      id: annotation.id,
      documentId: annotation.documentId,
      pageIndex: annotation.pageIndex,
      kind: annotation.kind as Annotation['kind'],
      color: annotation.color,
      bounds: annotation.bounds,
      points: annotation.points,
      text: annotation.text,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
    });
  }
  return Array.from(merged.values());
}

function mergeTags(existingTags: Tag[], cloudDocuments: CloudDocument[]): Tag[] {
  const tags = new Map(existingTags.map(tag => [tag.id, tag]));
  for (const document of cloudDocuments) {
    for (const tagId of document.tags) {
      if (!tags.has(tagId)) {
        tags.set(tagId, {id: tagId, label: tagId, tone: 'gray'});
      }
    }
  }
  return Array.from(tags.values());
}

function thumbnailTone(value: string): DocumentRecord['thumbnailTone'] {
  switch (value) {
    case 'pastel':
    case 'navy':
    case 'ice':
    case 'paper':
    case 'red':
    case 'teal':
      return value;
    default:
      return 'paper';
  }
}
