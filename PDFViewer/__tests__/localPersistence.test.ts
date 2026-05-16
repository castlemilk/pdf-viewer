import {
  APP_STATE_SIDECAR_ID,
  createPersistedAppState,
  mergeSeededDemoPdfsIntoPersistedState,
  parsePersistedAppState,
} from '../src/domain/localPersistence';
import {createInitialLibraryState, createInitialViewerState} from '../src/domain';
import type {Annotation} from '../src/domain';

const importedAt = '2026-05-12T12:00:00.000Z';

describe('local app persistence', () => {
  it('uses a stable sidecar id that survives app updates', () => {
    expect(APP_STATE_SIDECAR_ID).toBe('__acacia_app_state__');
  });

  it('round-trips library history, preferences, annotations, and signatures', () => {
    const libraryState = createInitialLibraryState();
    const importedDocument = {
      ...libraryState.documents[0],
      id: 'manual-imported-pdf',
      title: 'Manual Imported PDF',
      lastOpenedAt: importedAt,
      progress: 0.42,
      path: '/Users/ben/Documents/manual.pdf',
      bookmark: 'bookmark-data',
      pageThumbnailPaths: {
        0: '/tmp/acacia-thumbnails/manual/page-0.png',
      },
    };
    const annotation: Annotation = {
      id: 'persisted-highlight',
      documentId: importedDocument.id,
      pageIndex: 2,
      kind: 'highlight',
      color: '#F7D64A',
      bounds: {x: 120, y: 180, width: 220, height: 24},
      text: 'Persist this highlight',
      createdAt: importedAt,
      updatedAt: importedAt,
    };

    const state = createPersistedAppState({
      libraryState: {
        ...libraryState,
        documents: [importedDocument, ...libraryState.documents],
      },
      filter: {
        query: '',
        tagId: 'all',
        collectionId: 'all',
        scope: 'recent',
        sortBy: 'lastOpened',
        viewMode: 'list',
      },
      screenMode: 'viewer',
      selectedDocumentId: importedDocument.id,
      viewerState: {
        ...createInitialViewerState(importedDocument.id, importedDocument.pageCount),
        pageIndex: 2,
        zoom: 1.4,
        activeTool: 'highlight',
      },
      annotations: [annotation],
      signatures: [
        {
          id: 'signature-custom',
          label: 'Ben',
          value: 'Ben Ebsworth',
          updatedAt: importedAt,
        },
      ],
      activeSignatureId: 'signature-custom',
      accountState: {signedIn: true, plan: 'pro'},
      compareSynced: false,
    });

    const parsed = parsePersistedAppState(JSON.stringify(state));

    expect(parsed?.selectedDocumentId).toBe(importedDocument.id);
    expect(parsed?.filter.scope).toBe('recent');
    expect(parsed?.filter.viewMode).toBe('list');
    expect(parsed?.viewerState.pageIndex).toBe(2);
    expect(parsed?.viewerState.zoom).toBe(1.4);
    expect(parsed?.viewerState.activeTool).toBe('select');
    expect(parsed?.annotations).toEqual([annotation]);
    expect(parsed?.signatures[0].value).toBe('Ben Ebsworth');
    expect(
      parsed?.libraryState.documents.find(
        document => document.id === importedDocument.id,
      )?.bookmark,
    ).toBe('bookmark-data');
    expect(
      parsed?.libraryState.documents.find(
        document => document.id === importedDocument.id,
      )?.pageThumbnailPaths?.[0],
    ).toBe('/tmp/acacia-thumbnails/manual/page-0.png');
  });

  it('does not restore transient markup tools over normal text selection', () => {
    const persisted = createPersistedAppState({
      viewerState: {
        ...createInitialViewerState('q4-market-analysis', 32),
        activeTool: 'pen',
      },
      screenMode: 'viewer',
      selectedDocumentId: 'q4-market-analysis',
    });

    expect(persisted.viewerState.activeTool).toBe('select');
  });

  it('merges freshly seeded demo PDFs without dropping user imports or recents', () => {
    const persisted = createPersistedAppState();
    const importedDocument = {
      ...persisted.libraryState.documents[0],
      id: 'manual-imported-pdf',
      title: 'Manual Imported PDF',
      lastOpenedAt: importedAt,
      path: '/Users/ben/Documents/manual.pdf',
      bookmark: 'bookmark-data',
    };
    const userState = {
      ...persisted,
      libraryState: {
        ...persisted.libraryState,
        documents: [importedDocument, ...persisted.libraryState.documents],
      },
      selectedDocumentId: importedDocument.id,
    };

    const merged = mergeSeededDemoPdfsIntoPersistedState(userState, [
      {
        id: 'q4-market-analysis',
        title: 'Q4 Market Analysis Report',
        author: 'Analytics Team',
        pageCount: 32,
        sizeMb: 0.44,
        createdAt: '2026-05-16T00:00:00.000Z',
        modifiedAt: '2026-05-16T00:00:00.000Z',
        path: '/Applications Support/Acacia/DemoPDFs/q4-market-analysis.pdf',
        bookmark: '',
      },
    ]);

    expect(merged.selectedDocumentId).toBe(importedDocument.id);
    expect(merged.libraryState.documents[0].id).toBe(importedDocument.id);
    expect(
      merged.libraryState.documents.find(
        document => document.id === 'manual-imported-pdf',
      )?.bookmark,
    ).toBe('bookmark-data');
    expect(
      merged.libraryState.documents.find(
        document => document.id === 'q4-market-analysis',
      )?.path,
    ).toBe('/Applications Support/Acacia/DemoPDFs/q4-market-analysis.pdf');
    expect(
      merged.libraryState.collections.find(
        collection => collection.id === 'q4-reports',
      )?.count,
    ).toBeGreaterThan(0);
  });

  it('falls back to demo content when stored state is absent or corrupt', () => {
    expect(parsePersistedAppState(undefined)).toBeUndefined();
    expect(parsePersistedAppState('{bad json')).toBeUndefined();

    const fresh = createPersistedAppState();

    expect(fresh.libraryState.documents.length).toBeGreaterThan(0);
    expect(fresh.selectedDocumentId).toBe('q4-market-analysis');
    expect(fresh.viewerState.documentId).toBe('q4-market-analysis');
  });
});
