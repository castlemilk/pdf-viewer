import {demoCollections, demoDocuments, demoTags} from './fixtures';
import type {
  Collection,
  DocumentRecord,
  LibraryFilter,
  LibraryState,
} from './types';

export type LibraryAction =
  | {type: 'replaceState'; state: LibraryState}
  | {type: 'addDocument'; document: DocumentRecord}
  | {
      type: 'updateDocument';
      documentId: string;
      patch: Partial<DocumentRecord>;
    }
  | {type: 'addCollection'; label: string}
  | {type: 'addTagToDocument'; documentId: string; tagId: string}
  | {type: 'setStorageQuota'; storageLimitGb: number}
  | {type: 'setStorageUsage'; storageUsedGb: number};

export function createInitialLibraryState(): LibraryState {
  return {
    documents: demoDocuments,
    tags: demoTags,
    collections: withCollectionCounts(demoCollections, demoDocuments),
    storageUsedGb: 1.2,
    storageLimitGb: 10,
  };
}

export function libraryReducer(
  state: LibraryState,
  action: LibraryAction,
): LibraryState {
  switch (action.type) {
    case 'replaceState':
      return {
        ...action.state,
        collections: withCollectionCounts(
          action.state.collections,
          action.state.documents,
        ),
      };
    case 'addDocument': {
      const documents = [
        action.document,
        ...state.documents.filter(document => document.id !== action.document.id),
      ];

      return {
        ...state,
        documents,
        collections: withCollectionCounts(state.collections, documents),
      };
    }
    case 'updateDocument': {
      const documents = state.documents.map(document =>
        document.id === action.documentId
          ? {...document, ...action.patch}
          : document,
      );

      return {
        ...state,
        documents,
        collections: withCollectionCounts(state.collections, documents),
      };
    }
    case 'addCollection': {
      const collection = createCollection(action.label, state.collections);

      return {
        ...state,
        collections: withCollectionCounts([...state.collections, collection], state.documents),
      };
    }
    case 'addTagToDocument': {
      const documents = state.documents.map(document =>
        document.id === action.documentId
          ? {
              ...document,
              tags: document.tags.includes(action.tagId)
                ? document.tags
                : [...document.tags, action.tagId],
            }
          : document,
      );

      return {
        ...state,
        documents,
      };
    }
    case 'setStorageQuota':
      return {
        ...state,
        storageLimitGb: action.storageLimitGb,
      };
    case 'setStorageUsage':
      return {
        ...state,
        storageUsedGb: action.storageUsedGb,
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
      const words = getSearchableWords(state, document);
      const matchesQuery =
        queryTerms.length === 0 ||
        queryTerms.every(term =>
          words.some(word => word.includes(term) || term.includes(word)),
        );
      const matchesTag =
        filter.tagId === 'all' || document.tags.includes(filter.tagId);
      const matchesCollection =
        filter.collectionId === 'all' ||
        document.collectionIds.includes(filter.collectionId);
      const matchesScope = matchesLibraryScope(document, filter.scope);

      return matchesQuery && matchesTag && matchesCollection && matchesScope;
    })
    .sort((left, right) => compareDocuments(left, right, filter.sortBy));
}

function matchesLibraryScope(
  document: DocumentRecord,
  scope: LibraryFilter['scope'],
) {
  switch (scope) {
    case 'recent':
      return Number.isFinite(dateValue(document.lastOpenedAt));
    case 'favorites':
      return document.favorite;
    case 'shared':
      return document.shared;
    case 'library':
    default:
      return true;
  }
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

function getSearchableWords(state: LibraryState, document: DocumentRecord) {
  const tagLabels = document.tags
    .map(tagId => state.tags.find(tag => tag.id === tagId)?.label ?? tagId)
    .join(' ');
  const collectionLabels = document.collectionIds
    .map(
      collectionId =>
        state.collections.find(collection => collection.id === collectionId)
          ?.label ?? collectionId,
    )
    .join(' ');

  return `${document.title} ${document.author} ${tagLabels} ${collectionLabels}`
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter(Boolean);
}

export function getCollectionCounts(
  documents: DocumentRecord[],
  collections: Collection[] = demoCollections,
) {
  const initialCounts = collections.reduce<Record<string, number>>(
    (counts, collection) => {
      counts[collection.id] = 0;
      return counts;
    },
    {},
  );

  return documents.reduce<Record<string, number>>((counts, document) => {
    for (const collectionId of document.collectionIds) {
      counts[collectionId] = (counts[collectionId] ?? 0) + 1;
    }

    return counts;
  }, initialCounts);
}

function withCollectionCounts(
  collections: Collection[],
  documents: DocumentRecord[],
) {
  const counts = getCollectionCounts(documents, collections);

  return collections.map(collection => ({
    ...collection,
    count: counts[collection.id] ?? 0,
  }));
}

function createCollection(label: string, collections: Collection[]): Collection {
  const baseId = slugify(label);
  let id = baseId;
  let suffix = 2;

  while (collections.some(collection => collection.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {id, label, count: 0};
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : `collection-${Date.now()}`;
}
