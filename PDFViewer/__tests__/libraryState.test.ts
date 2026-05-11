import {
  createInitialLibraryState,
  getContinueReadingDocuments,
  getFilteredDocuments,
  libraryReducer,
} from '../src/domain/libraryState';

describe('library state', () => {
  it('filters documents by query and sorts by last opened descending', () => {
    const state = createInitialLibraryState();

    const results = getFilteredDocuments(state, {
      query: 'market',
      tagId: 'all',
      collectionId: 'all',
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
});
