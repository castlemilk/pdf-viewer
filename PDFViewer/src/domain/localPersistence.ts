import {createInitialLibraryState, getCollectionCounts} from './libraryState';
import {createInitialViewerState} from './viewerState';
import type {
  Annotation,
  DocumentRecord,
  LibraryFilter,
  LibraryState,
  ViewerState,
} from './types';

export const APP_STATE_SIDECAR_ID = '__acacia_app_state__';

export type PersistedScreenMode = 'library' | 'viewer' | 'compare';

export type PersistedAccountState = {
  signedIn: boolean;
  plan: 'free' | 'pro';
};

export type PersistedSignatureProfile = {
  id: string;
  label: string;
  value: string;
  updatedAt: string;
};

export type SeededPdfRecord = {
  id: string;
  title: string;
  author: string;
  pageCount: number;
  sizeMb: number;
  createdAt: string;
  modifiedAt: string;
  path: string;
  bookmark: string;
};

export type PersistedAppStateV1 = {
  schemaVersion: 1;
  libraryState: LibraryState;
  filter: LibraryFilter;
  screenMode: PersistedScreenMode;
  selectedDocumentId: string;
  viewerState: ViewerState;
  annotations: Annotation[];
  signatures: PersistedSignatureProfile[];
  activeSignatureId: string;
  accountState: PersistedAccountState;
  compareSynced: boolean;
  updatedAt: string;
};

export const defaultLibraryFilter: LibraryFilter = {
  query: '',
  tagId: 'all',
  collectionId: 'all',
  scope: 'library',
  sortBy: 'lastOpened',
  viewMode: 'grid',
};

export function createPersistedAppState(
  input: Partial<PersistedAppStateV1> = {},
): PersistedAppStateV1 {
  const libraryState = normalizeLibraryState(
    input.libraryState ?? createInitialLibraryState(),
  );
  const requestedSelectedDocumentId =
    input.selectedDocumentId ??
    libraryState.documents[0]?.id ??
    'q4-market-analysis';
  const selectedDocument =
    libraryState.documents.find(
      document => document.id === requestedSelectedDocumentId,
    ) ??
    libraryState.documents[0];
  const selectedDocumentId =
    selectedDocument?.id ?? requestedSelectedDocumentId;
  const viewerState =
    input.viewerState ??
    createInitialViewerState(
      selectedDocument?.id ?? selectedDocumentId,
      selectedDocument?.pageCount ?? 1,
    );

  return {
    schemaVersion: 1,
    libraryState,
    filter: sanitizeFilter(input.filter),
    screenMode: input.screenMode ?? 'library',
    selectedDocumentId,
    viewerState: sanitizeViewerState(viewerState, selectedDocument),
    annotations: Array.isArray(input.annotations) ? input.annotations : [],
    signatures:
      input.signatures && input.signatures.length > 0
        ? input.signatures
        : [createDefaultSignature()],
    activeSignatureId:
      input.activeSignatureId ??
      input.signatures?.[0]?.id ??
      'signature-default',
    accountState: input.accountState ?? {signedIn: false, plan: 'free'},
    compareSynced: input.compareSynced ?? true,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function parsePersistedAppState(
  raw: string | undefined,
): PersistedAppStateV1 | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppStateV1>;
    if (parsed.schemaVersion !== 1 || !parsed.libraryState) {
      return undefined;
    }

    return createPersistedAppState(parsed);
  } catch {
    return undefined;
  }
}

export function serializePersistedAppState(
  state: PersistedAppStateV1,
): string {
  return JSON.stringify({
    ...createPersistedAppState(state),
    updatedAt: new Date().toISOString(),
  });
}

export function mergeSeededDemoPdfsIntoPersistedState(
  state: PersistedAppStateV1,
  seededPdfs: SeededPdfRecord[],
): PersistedAppStateV1 {
  if (seededPdfs.length === 0) {
    return createPersistedAppState(state);
  }

  const defaults = createInitialLibraryState();
  const documents = [...state.libraryState.documents];

  for (const seeded of seededPdfs) {
    const index = documents.findIndex(document => document.id === seeded.id);
    const defaultDemoDocument = defaults.documents.find(
      document => document.id === seeded.id,
    );
    const patch: Partial<DocumentRecord> = {
      title: seeded.title,
      author: seeded.author,
      pageCount: seeded.pageCount,
      sizeMb: seeded.sizeMb,
      createdAt: seeded.createdAt,
      modifiedAt: seeded.modifiedAt,
      path: seeded.path,
      bookmark: seeded.bookmark,
    };

    if (index >= 0) {
      documents[index] = {
        ...documents[index],
        ...patch,
      };
    } else if (defaultDemoDocument) {
      documents.push({
        ...defaultDemoDocument,
        ...patch,
      });
    }
  }

  return createPersistedAppState({
    ...state,
    libraryState: normalizeLibraryState({
      ...state.libraryState,
      documents,
    }),
  });
}

function normalizeLibraryState(state: LibraryState): LibraryState {
  const defaults = createInitialLibraryState();
  const tags = mergeById(defaults.tags, state.tags);
  const collections = mergeById(defaults.collections, state.collections);
  const documents = (
    Array.isArray(state.documents)
      ? state.documents.filter(document => !isTransientTestDocument(document))
      : defaults.documents
  );
  const safeDocuments = documents.length > 0
    ? documents
    : defaults.documents;
  const counts = getCollectionCounts(safeDocuments, collections);

  return {
    documents: safeDocuments,
    tags,
    collections: collections.map(collection => ({
      ...collection,
      count: counts[collection.id] ?? 0,
    })),
    storageUsedGb: Number.isFinite(state.storageUsedGb)
      ? state.storageUsedGb
      : defaults.storageUsedGb,
    storageLimitGb: Number.isFinite(state.storageLimitGb)
      ? state.storageLimitGb
      : defaults.storageLimitGb,
  };
}

function isTransientTestDocument(document: DocumentRecord): boolean {
  const path = document.path ?? '';

  return (
    path.includes('.xctrunner/') ||
    path.includes('/AcaciaUITests/') ||
    path.includes('/AcaciaUITestFixtures/')
  );
}

function sanitizeFilter(filter?: LibraryFilter): LibraryFilter {
  if (!filter) {
    return defaultLibraryFilter;
  }

  return {
    ...defaultLibraryFilter,
    ...filter,
    query: filter.query ?? '',
  };
}

function sanitizeViewerState(
  viewerState: ViewerState,
  selectedDocument?: DocumentRecord,
): ViewerState {
  const pageCount = selectedDocument?.pageCount ?? viewerState.pageCount ?? 1;

  return {
    ...viewerState,
    documentId: selectedDocument?.id ?? viewerState.documentId,
    pageCount,
    pageIndex: Math.max(
      0,
      Math.min(viewerState.pageIndex ?? 0, Math.max(0, pageCount - 1)),
    ),
    zoom: Math.max(0.25, Math.min(viewerState.zoom ?? 1, 3)),
    activeTool: 'select',
    inspectorTab: viewerState.inspectorTab ?? 'info',
    showThumbnails: viewerState.showThumbnails ?? true,
    searchQuery: viewerState.searchQuery ?? '',
  };
}

function createDefaultSignature(): PersistedSignatureProfile {
  return {
    id: 'signature-default',
    label: 'Default Signature',
    value: 'Ben Ebsworth',
    updatedAt: '2026-05-11T08:10:00.000Z',
  };
}

function mergeById<T extends {id: string}>(defaults: T[], saved: T[]) {
  const merged = new Map<string, T>();

  for (const item of defaults) {
    merged.set(item.id, item);
  }
  for (const item of saved ?? []) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}
