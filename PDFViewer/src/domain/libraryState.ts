import {demoCollections, demoDocuments, demoTags} from './fixtures';
import type {DocumentRecord, LibraryFilter, LibraryState} from './types';

export type LibraryAction =
  | {type: 'addDocument'; document: DocumentRecord}
  | {
      type: 'updateDocument';
      documentId: string;
      patch: Partial<DocumentRecord>;
    };

export function createInitialLibraryState(): LibraryState {
  return {
    documents: demoDocuments,
    tags: demoTags,
    collections: demoCollections,
    storageUsedGb: 1.2,
    storageLimitGb: 10,
  };
}

export function libraryReducer(
  state: LibraryState,
  action: LibraryAction,
): LibraryState {
  switch (action.type) {
    case 'addDocument':
      return {
        ...state,
        documents: [action.document, ...state.documents],
      };
    case 'updateDocument':
      return {
        ...state,
        documents: state.documents.map(document =>
          document.id === action.documentId
            ? {...document, ...action.patch}
            : document,
        ),
      };
    default:
      return state;
  }
}

export function getFilteredDocuments(
  state: LibraryState,
  filter: LibraryFilter,
): DocumentRecord[] {
  const queryTerms = filter.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return state.documents
    .filter(document => {
      const words = `${document.title} ${document.author}`
        .toLowerCase()
        .split(/[^a-z0-9#]+/)
        .filter(Boolean);
      const matchesQuery =
        queryTerms.length === 0 ||
        queryTerms.every(term => words.includes(term));
      const matchesTag =
        filter.tagId === 'all' || document.tags.includes(filter.tagId);
      const matchesCollection =
        filter.collectionId === 'all' ||
        document.collectionIds.includes(filter.collectionId);

      return matchesQuery && matchesTag && matchesCollection;
    })
    .sort((left, right) => compareDocuments(left, right, filter.sortBy));
}

export function getContinueReadingDocuments(
  state: LibraryState,
  limit = 4,
): DocumentRecord[] {
  return [...state.documents]
    .filter(document => document.progress > 0 && document.progress < 1)
    .sort((left, right) => right.progress - left.progress)
    .slice(0, limit);
}

function compareDocuments(
  left: DocumentRecord,
  right: DocumentRecord,
  sortBy: LibraryFilter['sortBy'],
) {
  switch (sortBy) {
    case 'name':
      return left.title.localeCompare(right.title);
    case 'size':
      return right.sizeMb - left.sizeMb;
    case 'modified':
      return dateValue(right.modifiedAt) - dateValue(left.modifiedAt);
    case 'lastOpened':
    default:
      return dateValue(right.lastOpenedAt) - dateValue(left.lastOpenedAt);
  }
}

function dateValue(value: string) {
  return new Date(value).getTime();
}
