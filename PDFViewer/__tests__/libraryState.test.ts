import {
  createInitialLibraryState,
  getCollectionCounts,
  getContinueReadingDocuments,
  getFilteredDocuments,
  libraryReducer,
} from '../src/domain/libraryState';

describe('library state', () => {
  it('filters documents by query, tags, and collections', () => {
    const state = createInitialLibraryState();

    const results = getFilteredDocuments(state, {
      query: 'market work q4',
      tagId: 'all',
      collectionId: 'all',
      scope: 'library',
      sortBy: 'lastOpened',
      viewMode: 'grid',
    });

    expect(results.map(document => document.title)).toEqual([
      'Q4 Market Analysis Report',
    ]);
  });

  it('updates tags, favorites, collections, and reading progress without mutating the source state', () => {
    const state = createInitialLibraryState();
    const documentId = 'q4-market-analysis';

    const updated = libraryReducer(state, {
      type: 'updateDocument',
      documentId,
      patch: {
        favorite: true,
        progress: 0.75,
        tags: ['work', 'research'],
        collectionIds: ['q4-reports', 'archive'],
      },
    });

    const originalDocument = state.documents.find(
      document => document.id === documentId,
    );
    const updatedDocument = updated.documents.find(
      document => document.id === documentId,
    );

    expect(originalDocument?.favorite).toBe(false);
    expect(originalDocument?.progress).toBe(0.25);
    expect(updatedDocument?.favorite).toBe(true);
    expect(updatedDocument?.progress).toBe(0.75);
    expect(updatedDocument?.tags).toEqual(['work', 'research']);
    expect(updatedDocument?.collectionIds).toEqual([
      'q4-reports',
      'archive',
    ]);
  });

  it('returns continue reading documents in progress order', () => {
    const state = createInitialLibraryState();
    const results = getContinueReadingDocuments(state, 3);

    expect(results).toHaveLength(3);
    expect(results.map(document => document.progress)).toEqual([0.6, 0.4, 0.25]);
  });

  it('filters documents by recent favorites and shared scopes', () => {
    const importedAt = '2026-05-12T12:00:00.000Z';
    const state = libraryReducer(createInitialLibraryState(), {
      type: 'addDocument',
      document: {
        id: 'manual-pdf',
        title: 'Manual Imported PDF',
        author: 'Local Document',
        kind: 'pdf',
        pageCount: 3,
        sizeMb: 1.4,
        progress: 0,
        createdAt: importedAt,
        modifiedAt: importedAt,
        lastOpenedAt: importedAt,
        tags: ['work'],
        collectionIds: ['archive'],
        favorite: false,
        shared: false,
        thumbnailTone: 'paper',
        path: '/tmp/manual.pdf',
      },
    });
    const baseFilter = {
      query: '',
      tagId: 'all',
      collectionId: 'all',
      sortBy: 'lastOpened' as const,
      viewMode: 'grid' as const,
    };

    expect(
      getFilteredDocuments(state, {...baseFilter, scope: 'favorites'}).map(
        document => document.id,
      ),
    ).toEqual(['product-roadmap', 'future-work']);
    expect(
      getFilteredDocuments(state, {...baseFilter, scope: 'shared'}).map(
        document => document.id,
      ),
    ).toEqual(['competitive-landscape', 'board-minutes-apr']);
    expect(
      getFilteredDocuments(state, {...baseFilter, scope: 'recent'}).map(
        document => document.id,
      ),
    ).toEqual([
      'manual-pdf',
      'q4-market-analysis',
      'competitive-landscape',
      'product-roadmap',
      'annual-financial-report',
      'future-work',
      'board-minutes-apr',
      'marketing-strategy',
      'invoice-0042',
    ]);
  });

  it('derives collection counts from the actual visible documents', () => {
    const state = createInitialLibraryState();

    expect(getCollectionCounts(state.documents)).toEqual({
      archive: 2,
      contracts: 0,
      invoices: 1,
      marketing: 1,
      'q4-reports': 3,
      'research-papers': 2,
    });

    const withNewCollection = libraryReducer(state, {
      type: 'addCollection',
      label: 'Client Decks',
    });

    expect(withNewCollection.collections).toContainEqual({
      id: 'client-decks',
      label: 'Client Decks',
      count: 0,
    });
  });

  it('updates storage quota after Pro entitlement sync', () => {
    const state = createInitialLibraryState();

    const updated = libraryReducer(state, {
      type: 'setStorageQuota',
      storageLimitGb: 20,
    });

    expect(updated.storageLimitGb).toBe(20);
    expect(updated.storageUsedGb).toBe(state.storageUsedGb);
  });
});
