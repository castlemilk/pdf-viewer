export type TagTone = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray';

export type Tag = {
  id: string;
  label: string;
  tone: TagTone;
};

export type Collection = {
  id: string;
  label: string;
  count: number;
};

export type DocumentRecord = {
  id: string;
  title: string;
  author: string;
  kind: 'pdf';
  pageCount: number;
  sizeMb: number;
  progress: number;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string;
  tags: string[];
  collectionIds: string[];
  favorite: boolean;
  shared: boolean;
  thumbnailTone: 'pastel' | 'navy' | 'ice' | 'paper' | 'red' | 'teal';
  pageThumbnailPaths?: Record<number, string>;
  path?: string;
  bookmark?: string;
  versionLabel?: string;
};

export type LibraryViewMode = 'grid' | 'list';

export type LibrarySort = 'lastOpened' | 'modified' | 'name' | 'size';

export type LibraryScope = 'library' | 'recent' | 'favorites' | 'shared';

export type LibraryFilter = {
  query: string;
  tagId: string;
  collectionId: string;
  scope: LibraryScope;
  sortBy: LibrarySort;
  viewMode: LibraryViewMode;
};

export type LibraryState = {
  documents: DocumentRecord[];
  tags: Tag[];
  collections: Collection[];
  storageUsedGb: number;
  storageLimitGb: number;
};

export type AnnotationKind =
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'note'
  | 'drawing'
  | 'signature'
  | 'bookmark';

export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPoint = {
  x: number;
  y: number;
};

export type Annotation = {
  id: string;
  documentId: string;
  pageIndex: number;
  kind: AnnotationKind;
  color: string;
  bounds: PdfRect;
  points?: PdfPoint[];
  text?: string;
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type CommentThread = {
  id: string;
  documentId: string;
  pageIndex: number;
  anchorAnnotationId?: string;
  comments: Comment[];
};

export type AnnotationSidecar = {
  schemaVersion: 1;
  documentId: string;
  sourceFingerprint: string;
  annotations: Annotation[];
  commentThreads: CommentThread[];
};

export type ViewerTool =
  | 'select'
  | 'pan'
  | 'text'
  | 'highlight'
  | 'comment'
  | 'pen'
  | 'signature';

export type InspectorTab =
  | 'outline'
  | 'comments'
  | 'notes'
  | 'ask'
  | 'info'
  | 'annotations'
  | 'changes';

export type ViewerState = {
  documentId: string;
  pageCount: number;
  pageIndex: number;
  zoom: number;
  activeTool: ViewerTool;
  inspectorTab: InspectorTab;
  showThumbnails: boolean;
  searchQuery: string;
};

export type PageChange = {
  pageIndex: number;
  changeCount: number;
  status: 'added' | 'removed' | 'modified';
  title: string;
};

export type CompareSummary = {
  added: number;
  removed: number;
  modified: number;
  totalChanges: number;
  pages: PageChange[];
};

export type CompareSession = {
  id: string;
  leftDocumentId: string;
  rightDocumentId: string;
  syncedScroll: boolean;
  summary: CompareSummary;
};
