import React, {useMemo, useReducer, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PdfCanvas} from './src/components/PdfCanvas';
import {
  compareDocumentText,
  createAnnotation,
  createInitialLibraryState,
  createInitialViewerState,
  getContinueReadingDocuments,
  getFilteredDocuments,
  libraryReducer,
  viewerReducer,
} from './src/domain';
import type {
  Annotation,
  Collection,
  CompareSummary,
  DocumentRecord,
  InspectorTab,
  LibraryFilter,
  Tag,
  TagTone,
  ViewerState,
  ViewerTool,
} from './src/domain';
import {importedPdfToDocument, PdfKitBridge} from './src/native/PdfKitBridge';

type ScreenMode = 'library' | 'viewer' | 'compare';
type ScreenshotMode = 'library' | 'viewer-info' | 'comments' | 'compare';

type AppProps = {
  screenshotMode?: ScreenshotMode;
};

const initialFilter: LibraryFilter = {
  query: '',
  tagId: 'all',
  collectionId: 'all',
  sortBy: 'lastOpened',
  viewMode: 'grid',
};

const initialAnnotations: Annotation[] = [
  createAnnotation({
    id: 'future-work-highlight',
    documentId: 'future-work',
    pageIndex: 11,
    kind: 'highlight',
    color: '#F7D64A',
    bounds: {x: 138, y: 250, width: 310, height: 24},
    text: 'The hybrid model is no longer an experiment',
    createdAt: '2026-05-11T08:00:00.000Z',
  }),
  createAnnotation({
    id: 'q4-market-note',
    documentId: 'q4-market-analysis',
    pageIndex: 7,
    kind: 'note',
    color: '#A9CBFF',
    bounds: {x: 170, y: 488, width: 270, height: 22},
    text: 'Global markets closed the year with steady growth.',
    createdAt: '2026-05-11T08:05:00.000Z',
  }),
];

function App({screenshotMode = 'library'}: AppProps) {
  const [libraryState, dispatchLibrary] = useReducer(
    libraryReducer,
    createInitialLibraryState(),
  );
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    getInitialScreenMode(screenshotMode),
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    getInitialDocumentId(screenshotMode),
  );
  const selectedDocument =
    libraryState.documents.find(document => document.id === selectedDocumentId) ??
    libraryState.documents[0];
  const [viewerState, setViewerState] = useState<ViewerState>(() =>
    createInitialViewerStateForMode(selectedDocument, screenshotMode),
  );
  const [annotations, setAnnotations] =
    useState<Annotation[]>(initialAnnotations);

  const visibleDocuments = useMemo(
    () => getFilteredDocuments(libraryState, filter),
    [filter, libraryState],
  );
  const continueReading = useMemo(
    () => getContinueReadingDocuments(libraryState, 4),
    [libraryState],
  );
  const selectedAnnotations = annotations.filter(
    annotation => annotation.documentId === selectedDocument.id,
  );
  const compareSummary = useMemo(
    () =>
      compareDocumentText(
        [
          'Market Overview\nGlobal markets closed with steady growth.',
          'Key Takeaways\nInvestment inflows increased.',
          'Risks\nSupply constraints remain elevated.',
        ],
        [
          'Market Overview\nGlobal markets closed with strong growth.',
          'Key Takeaways\nInvestment inflows increased.',
          'Risks\nSupply constraints remain elevated.',
          'Appendix\nNew revenue by region table.',
        ],
      ),
    [],
  );

  function updateViewer(action: Parameters<typeof viewerReducer>[1]) {
    setViewerState(current => viewerReducer(current, action));
  }

  function openDocument(document: DocumentRecord, mode: ScreenMode = 'viewer') {
    setSelectedDocumentId(document.id);
    setViewerState(createInitialViewerState(document.id, document.pageCount));
    setScreenMode(mode);
  }

  async function openImportedPdf() {
    try {
      const imported = await PdfKitBridge.openPdf();

      if (!imported) {
        return;
      }

      const document = importedPdfToDocument(imported);
      dispatchLibrary({type: 'addDocument', document});
      openDocument(document);
    } catch (error) {
      Alert.alert(
        'Unable to open PDF',
        error instanceof Error ? error.message : 'The document could not open.',
      );
    }
  }

  function addHighlight() {
    const annotation = createAnnotation({
      id: `annotation-${Date.now()}`,
      documentId: selectedDocument.id,
      pageIndex: viewerState.pageIndex,
      kind: 'highlight',
      color: '#F7D64A',
      bounds: {x: 132, y: 252, width: 320, height: 24},
      text: 'Local non-destructive highlight',
    });

    setAnnotations(current => [...current, annotation]);
    updateViewer({type: 'setTool', tool: 'highlight'});
    updateViewer({type: 'setInspectorTab', tab: 'comments'});
  }

  return (
    <View
      style={styles.window}
      testID="app-window"
      accessible
      accessibilityLabel="App window">
      <TitleBar
        mode={screenMode}
        selectedDocument={selectedDocument}
        query={filter.query}
        onQueryChange={query => setFilter(current => ({...current, query}))}
        onBack={() => setScreenMode('library')}
        onOpenFile={openImportedPdf}
      />
      {screenMode === 'library' ? (
        <LibraryScreen
          filter={filter}
          selectedDocument={selectedDocument}
          stateTags={libraryState.tags}
          collections={libraryState.collections}
          documents={visibleDocuments}
          continueReading={continueReading}
          storageUsedGb={libraryState.storageUsedGb}
          storageLimitGb={libraryState.storageLimitGb}
          onOpenFile={openImportedPdf}
          onFilterChange={patch =>
            setFilter(current => ({...current, ...patch}))
          }
          onSelectDocument={document => setSelectedDocumentId(document.id)}
          onOpenDocument={openDocument}
          onCompare={() => setScreenMode('compare')}
        />
      ) : screenMode === 'compare' ? (
        <CompareScreen
          leftDocument={selectedDocument}
          rightDocument={
            libraryState.documents.find(
              document => document.id === 'annual-financial-report',
            ) ?? selectedDocument
          }
          summary={compareSummary}
          viewer={viewerState}
          annotations={selectedAnnotations}
          onBack={() => setScreenMode('library')}
          onViewerAction={updateViewer}
        />
      ) : (
        <ViewerScreen
          document={selectedDocument}
          documents={libraryState.documents}
          tags={libraryState.tags}
          viewer={viewerState}
          annotations={selectedAnnotations}
          onBack={() => setScreenMode('library')}
          onCompare={() => setScreenMode('compare')}
          onViewerAction={updateViewer}
          onAddHighlight={addHighlight}
        />
      )}
    </View>
  );
}

function getInitialScreenMode(screenshotMode: ScreenshotMode): ScreenMode {
  if (screenshotMode === 'compare') {
    return 'compare';
  }

  if (screenshotMode === 'viewer-info' || screenshotMode === 'comments') {
    return 'viewer';
  }

  return 'library';
}

function getInitialDocumentId(screenshotMode: ScreenshotMode): string {
  if (screenshotMode === 'comments') {
    return 'future-work';
  }

  return 'q4-market-analysis';
}

function createInitialViewerStateForMode(
  document: DocumentRecord,
  screenshotMode: ScreenshotMode,
): ViewerState {
  const state = createInitialViewerState(document.id, document.pageCount);

  if (screenshotMode === 'viewer-info' || screenshotMode === 'compare') {
    return {
      ...state,
      pageIndex: Math.min(7, document.pageCount - 1),
    };
  }

  if (screenshotMode === 'comments') {
    return {
      ...state,
      pageIndex: Math.min(11, document.pageCount - 1),
      activeTool: 'highlight',
      inspectorTab: 'comments',
    };
  }

  return state;
}

function TitleBar({
  mode,
  selectedDocument,
  query,
  onQueryChange,
  onBack,
  onOpenFile,
}: {
  mode: ScreenMode;
  selectedDocument: DocumentRecord;
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onOpenFile: () => void;
}) {
  return (
    <View style={styles.titleBar}>
      <View style={styles.trafficLights} accessibilityLabel="Window controls">
        <View style={[styles.trafficLight, styles.closeLight]} />
        <View style={[styles.trafficLight, styles.minimizeLight]} />
        <View style={[styles.trafficLight, styles.zoomLight]} />
      </View>
      <View style={styles.titleDivider} />
      {mode === 'library' ? (
        <View style={styles.titleBlock}>
          <Text style={styles.titleText}>Library</Text>
          <Text style={styles.titleMeta}>32 documents</Text>
        </View>
      ) : (
        <View style={styles.readerTitleBlock}>
          <ButtonChrome
            label="<"
            onPress={onBack}
            quiet
            testID="title-back-button"
            accessibilityLabel="Back to library"
          />
          <ButtonChrome
            label=">"
            onPress={() => undefined}
            quiet
            testID="title-forward-button"
            accessibilityLabel="Forward"
          />
          <View>
            <Text style={styles.titleText}>{selectedDocument.title}</Text>
            {mode === 'compare' ? (
              <Text style={styles.titleMeta}>Compare: v1.0 vs v1.1</Text>
            ) : (
              <Text style={styles.titleMeta}>PDF</Text>
            )}
          </View>
        </View>
      )}
      <View
        style={styles.searchBox}
        testID="search-box"
        accessible
        accessibilityLabel="Search box">
        <Text style={styles.searchIcon}>Search</Text>
        <TextInput
          testID="library-search-input"
          accessibilityLabel="Library search"
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search"
          placeholderTextColor="#7A8393"
          style={styles.searchInput}
        />
      </View>
      {mode === 'library' ? (
        <ButtonChrome
          label="Open File"
          onPress={onOpenFile}
          primary
          testID="open-file-button"
        />
      ) : null}
    </View>
  );
}

function LibraryScreen({
  filter,
  selectedDocument,
  stateTags,
  collections,
  documents,
  continueReading,
  storageUsedGb,
  storageLimitGb,
  onFilterChange,
  onSelectDocument,
  onOpenDocument,
  onOpenFile,
  onCompare,
}: {
  filter: LibraryFilter;
  selectedDocument: DocumentRecord;
  stateTags: Tag[];
  collections: Collection[];
  documents: DocumentRecord[];
  continueReading: DocumentRecord[];
  storageUsedGb: number;
  storageLimitGb: number;
  onFilterChange: (patch: Partial<LibraryFilter>) => void;
  onSelectDocument: (document: DocumentRecord) => void;
  onOpenDocument: (document: DocumentRecord) => void;
  onOpenFile: () => void;
  onCompare: () => void;
}) {
  return (
    <View
      style={styles.body}
      testID="library-screen"
      accessible
      accessibilityLabel="Library screen">
      <Sidebar
        tags={stateTags}
        collections={collections}
        selectedTagId={filter.tagId}
        selectedCollectionId={filter.collectionId}
        storageUsedGb={storageUsedGb}
        storageLimitGb={storageLimitGb}
        onSelectTag={tagId => onFilterChange({tagId})}
        onSelectCollection={collectionId => onFilterChange({collectionId})}
      />
      <ScrollView style={styles.libraryMain}>
        <View style={styles.libraryToolbar}>
          <SegmentedControl
            value={filter.viewMode}
            options={[
              {label: 'Grid', value: 'grid'},
              {label: 'List', value: 'list'},
            ]}
            onChange={value =>
              onFilterChange({viewMode: value as LibraryFilter['viewMode']})
            }
            testIDPrefix="view-mode"
          />
          <View style={styles.toolbarRight}>
            <ButtonChrome
              label="Sort: Last Opened"
              onPress={() => onFilterChange({sortBy: 'lastOpened'})}
              testID="sort-last-opened-button"
            />
            <ButtonChrome
              label="Filter"
              onPress={() => undefined}
              testID="filter-button"
            />
            <ButtonChrome
              label="Open File"
              onPress={onOpenFile}
              primary
              testID="toolbar-open-file-button"
            />
          </View>
        </View>
        <Text style={styles.sectionTitle}>Continue Reading</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.cardRow}>
            {continueReading.map(document => (
              <DocumentCard
                key={document.id}
                document={document}
                selected={selectedDocument.id === document.id}
                onPress={() => onSelectDocument(document)}
                onOpen={() => onOpenDocument(document)}
              />
            ))}
          </View>
        </ScrollView>
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent Documents</Text>
          <ButtonChrome
            label="Compare"
            onPress={onCompare}
            testID="library-compare-button"
          />
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadText, styles.nameColumn]}>Name</Text>
            <Text style={[styles.tableHeadText, styles.authorColumn]}>
              Author
            </Text>
            <Text style={[styles.tableHeadText, styles.dateColumn]}>
              Modified
            </Text>
            <Text style={[styles.tableHeadText, styles.sizeColumn]}>Size</Text>
            <Text style={[styles.tableHeadText, styles.tagsColumn]}>Tags</Text>
          </View>
          {documents.map(document => (
            <DocumentRow
              key={document.id}
              document={document}
              tags={stateTags}
              selected={selectedDocument.id === document.id}
              onPress={() => onSelectDocument(document)}
              onOpen={() => onOpenDocument(document)}
            />
          ))}
        </View>
      </ScrollView>
      <LibraryInspector
        document={selectedDocument}
        tags={stateTags}
        onOpen={() => onOpenDocument(selectedDocument)}
        onCompare={onCompare}
      />
    </View>
  );
}

function ViewerScreen({
  document,
  documents,
  tags,
  viewer,
  annotations,
  onBack,
  onCompare,
  onViewerAction,
  onAddHighlight,
}: {
  document: DocumentRecord;
  documents: DocumentRecord[];
  tags: Tag[];
  viewer: ViewerState;
  annotations: Annotation[];
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onAddHighlight: () => void;
}) {
  return (
    <View
      style={styles.readerShell}
      testID="viewer-screen"
      accessible
      accessibilityLabel={`Viewer screen ${document.title}`}>
      <ReaderToolbar
        viewer={viewer}
        onBack={onBack}
        onCompare={onCompare}
        onAction={onViewerAction}
        onAddHighlight={onAddHighlight}
      />
      <View style={styles.readerBody}>
        {viewer.showThumbnails ? (
          <ThumbnailRail
            document={document}
            pageIndex={viewer.pageIndex}
            onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
          />
        ) : null}
        <PdfCanvas
          document={document}
          viewer={viewer}
          annotations={annotations}
        />
        <ViewerInspector
          document={document}
          documents={documents}
          tags={tags}
          viewer={viewer}
          annotations={annotations}
          onAction={onViewerAction}
          onAddHighlight={onAddHighlight}
        />
      </View>
      <BottomScrubber
        viewer={viewer}
        onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
      />
    </View>
  );
}

function CompareScreen({
  leftDocument,
  rightDocument,
  summary,
  viewer,
  annotations,
  onBack,
  onViewerAction,
}: {
  leftDocument: DocumentRecord;
  rightDocument: DocumentRecord;
  summary: CompareSummary;
  viewer: ViewerState;
  annotations: Annotation[];
  onBack: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
}) {
  return (
    <View
      style={styles.readerShell}
      testID="compare-screen"
      accessible
      accessibilityLabel={`Compare screen ${leftDocument.title}`}>
      <View style={styles.readerToolbar}>
        <ButtonChrome label="Library" onPress={onBack} testID="compare-library-button" />
        <ButtonChrome
          label="Compare"
          onPress={() => undefined}
          primary
          testID="compare-mode-button"
        />
        <ButtonChrome
          label="Sync Scroll"
          onPress={() => undefined}
          testID="sync-scroll-button"
        />
        <View style={styles.pageStepper}>
          <ButtonChrome
            label="<"
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})
            }
            testID="compare-page-previous"
          />
          <Text style={styles.stepperText}>
            {viewer.pageIndex + 1} / {leftDocument.pageCount}
          </Text>
          <ButtonChrome
            label=">"
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})
            }
            testID="compare-page-next"
          />
        </View>
      </View>
      <View style={styles.readerBody}>
        <ThumbnailRail
          document={leftDocument}
          pageIndex={viewer.pageIndex}
          onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
          compare
        />
        <View style={styles.compareCanvasArea}>
          <View style={styles.comparePane}>
            <PdfCanvas
              document={leftDocument}
              viewer={viewer}
              annotations={annotations}
              compact
            />
          </View>
          <View style={styles.comparePane}>
            <PdfCanvas
              document={rightDocument}
              viewer={viewer}
              annotations={[]}
              compact
            />
          </View>
        </View>
        <ChangesPanel summary={summary} />
      </View>
      <BottomScrubber
        viewer={viewer}
        onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
        labelLeft={`Page ${viewer.pageIndex + 1} of ${leftDocument.pageCount} (v1.0)`}
      />
    </View>
  );
}

function Sidebar({
  tags,
  collections,
  selectedTagId,
  selectedCollectionId,
  storageUsedGb,
  storageLimitGb,
  onSelectTag,
  onSelectCollection,
}: {
  tags: Tag[];
  collections: Collection[];
  selectedTagId: string;
  selectedCollectionId: string;
  storageUsedGb: number;
  storageLimitGb: number;
  onSelectTag: (tagId: string) => void;
  onSelectCollection: (collectionId: string) => void;
}) {
  return (
    <View style={styles.sidebar}>
      <NavItem label="Library" active onPress={() => onSelectTag('all')} />
      <NavItem label="Recent" onPress={() => onSelectTag('all')} />
      <NavItem label="Favorites" onPress={() => onSelectTag('all')} />
      <NavItem label="Shared" onPress={() => onSelectTag('all')} />
      <View style={styles.sidebarRule} />
      <Text style={styles.sidebarCaption}>Tags</Text>
      {tags.map(tag => (
        <Pressable
          key={tag.id}
          style={styles.sidebarTag}
          onPress={() => onSelectTag(tag.id)}>
          <View style={[styles.tagDot, toneStyle(tag.tone)]} />
          <Text
            style={[
              styles.sidebarText,
              selectedTagId === tag.id && styles.sidebarTextActive,
            ]}>
            {tag.label}
          </Text>
        </Pressable>
      ))}
      <Pressable style={styles.sidebarTag} onPress={() => onSelectTag('all')}>
        <View style={[styles.tagDot, styles.grayDot]} />
        <Text
          style={[
            styles.sidebarText,
            selectedTagId === 'all' && styles.sidebarTextActive,
          ]}>
          All Tags
        </Text>
      </Pressable>
      <View style={styles.sidebarRule} />
      <View style={styles.collectionHeading}>
        <Text style={styles.sidebarCaption}>Collections</Text>
        <Text style={styles.addText}>+</Text>
      </View>
      {collections.map(collection => (
        <Pressable
          key={collection.id}
          style={styles.collectionItem}
          onPress={() => onSelectCollection(collection.id)}>
          <Text
            style={[
              styles.sidebarText,
              selectedCollectionId === collection.id &&
                styles.sidebarTextActive,
            ]}>
            {collection.label}
          </Text>
          <Text style={styles.collectionCount}>{collection.count}</Text>
        </Pressable>
      ))}
      <Pressable
        style={styles.collectionItem}
        onPress={() => onSelectCollection('all')}>
        <Text
          style={[
            styles.sidebarText,
            selectedCollectionId === 'all' && styles.sidebarTextActive,
          ]}>
          All Collections
        </Text>
      </Pressable>
      <View style={styles.storageBlock}>
        <View style={styles.storageTrack}>
          <View
            style={[
              styles.storageFill,
              {width: `${(storageUsedGb / storageLimitGb) * 100}%`},
            ]}
          />
        </View>
        <Text style={styles.titleMeta}>
          {storageUsedGb.toFixed(1)} GB of {storageLimitGb} GB used
        </Text>
      </View>
    </View>
  );
}

function NavItem({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.navItem, active && styles.navItemActive]}
      onPress={onPress}>
      <Text style={[styles.navText, active && styles.navTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DocumentCard({
  document,
  selected,
  onPress,
  onOpen,
}: {
  document: DocumentRecord;
  selected: boolean;
  onPress: () => void;
  onOpen: () => void;
}) {
  return (
    <Pressable
      testID={`doc-card-${document.id}`}
      accessible
      accessibilityLabel={`Document card ${document.title}`}
      accessibilityRole="button"
      style={[styles.documentCard, selected && styles.documentCardSelected]}
      onPress={onPress}
      onLongPress={onOpen}>
      <PdfCover document={document} large />
      <Text numberOfLines={2} style={styles.cardTitle}>
        {document.title}
      </Text>
      <Text style={styles.cardMeta}>
        PDF - {document.sizeMb.toFixed(1)} MB
      </Text>
    </Pressable>
  );
}

function DocumentRow({
  document,
  tags,
  selected,
  onPress,
  onOpen,
}: {
  document: DocumentRecord;
  tags: Tag[];
  selected: boolean;
  onPress: () => void;
  onOpen: () => void;
}) {
  return (
    <Pressable
      testID={`doc-row-${document.id}`}
      accessible
      accessibilityLabel={`Document row ${document.title}`}
      accessibilityRole="button"
      style={[styles.tableRow, selected && styles.tableRowSelected]}
      onPress={onPress}
      onLongPress={onOpen}>
      <View style={[styles.nameColumn, styles.rowName]}>
        <PdfCover document={document} />
        <Text numberOfLines={1} style={styles.rowTitle}>
          {document.title}
        </Text>
      </View>
      <Text numberOfLines={1} style={[styles.rowText, styles.authorColumn]}>
        {document.author}
      </Text>
      <Text style={[styles.rowText, styles.dateColumn]}>
        {formatShortDate(document.modifiedAt)}
      </Text>
      <Text style={[styles.rowText, styles.sizeColumn]}>
        {document.sizeMb.toFixed(1)} MB
      </Text>
      <View style={[styles.tagsColumn, styles.inlineTags]}>
        {document.tags.map(tagId => {
          const tag = tags.find(item => item.id === tagId);
          return tag ? <TagPill key={tag.id} tag={tag} /> : null;
        })}
      </View>
    </Pressable>
  );
}

function PdfCover({
  document,
  large = false,
}: {
  document: DocumentRecord;
  large?: boolean;
}) {
  return (
    <View
      style={[
        styles.cover,
        large && styles.coverLarge,
        coverToneStyle(document.thumbnailTone),
      ]}>
      <Text numberOfLines={3} style={[styles.coverTitle, large && styles.coverTitleLarge]}>
        {document.title}
      </Text>
      <Text style={styles.coverAuthor}>{document.author}</Text>
      {document.progress > 0 ? (
        <Text style={styles.progressBadge}>
          {Math.round(document.progress * 100)}%
        </Text>
      ) : null}
    </View>
  );
}

function LibraryInspector({
  document,
  tags,
  onOpen,
  onCompare,
}: {
  document: DocumentRecord;
  tags: Tag[];
  onOpen: () => void;
  onCompare: () => void;
}) {
  return (
    <View style={styles.inspector}>
      <PdfCover document={document} large />
      <Text style={styles.inspectorTitle}>{document.title}</Text>
      <Text style={styles.inspectorSub}>
        PDF Document - {document.pageCount} pages
      </Text>
      <Text style={styles.inspectorCaption}>Tags</Text>
      <View style={styles.inlineTags}>
        {document.tags.map(tagId => {
          const tag = tags.find(item => item.id === tagId);
          return tag ? <TagPill key={tag.id} tag={tag} /> : null;
        })}
        <Text style={styles.addTag}>+</Text>
      </View>
      <InfoGrid document={document} />
      <Text style={styles.inspectorCaption}>Quick Actions</Text>
      <ActionRow
        label="Open"
        onPress={onOpen}
        testID="inspector-open-action"
      />
      <ActionRow
        label="Share"
        onPress={() => undefined}
        testID="inspector-share-action"
      />
      <ActionRow
        label="Add to Favorites"
        onPress={() => undefined}
        testID="inspector-favorite-action"
      />
      <ActionRow
        label="Compare Versions"
        onPress={onCompare}
        testID="inspector-compare-action"
      />
    </View>
  );
}

function ReaderToolbar({
  viewer,
  onBack,
  onCompare,
  onAction,
  onAddHighlight,
}: {
  viewer: ViewerState;
  onBack: () => void;
  onCompare: () => void;
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onAddHighlight: () => void;
}) {
  const tools: Array<{label: string; value: ViewerTool}> = [
    {label: 'Select', value: 'select'},
    {label: 'Hand', value: 'pan'},
    {label: 'Text', value: 'text'},
    {label: 'Highlight', value: 'highlight'},
    {label: 'Comment', value: 'comment'},
    {label: 'Pen', value: 'pen'},
    {label: 'Sign', value: 'signature'},
  ];

  return (
    <View style={styles.readerToolbar}>
      <ButtonChrome
        label="Library"
        onPress={onBack}
        testID="viewer-library-button"
      />
      <ButtonChrome
        label="-"
        onPress={() => onAction({type: 'setZoom', zoom: viewer.zoom - 0.1})}
        testID="viewer-zoom-out"
        accessibilityLabel="Zoom out"
      />
      <Text style={styles.zoomText}>{Math.round(viewer.zoom * 100)}%</Text>
      <ButtonChrome
        label="+"
        onPress={() => onAction({type: 'setZoom', zoom: viewer.zoom + 0.1})}
        testID="viewer-zoom-in"
        accessibilityLabel="Zoom in"
      />
      <View style={styles.pageStepper}>
        <ButtonChrome
          label="<"
          onPress={() => onAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})}
          testID="viewer-page-previous"
          accessibilityLabel="Previous page"
        />
        <TextInput
          testID="viewer-page-input"
          accessibilityLabel="Current page"
          style={styles.pageInput}
          value={`${viewer.pageIndex + 1}`}
          onChangeText={value => {
            const nextPage = Number.parseInt(value, 10);
            if (!Number.isNaN(nextPage)) {
              onAction({type: 'setPage', pageIndex: nextPage - 1});
            }
          }}
        />
        <Text style={styles.stepperText}>/ {viewer.pageCount}</Text>
        <ButtonChrome
          label=">"
          onPress={() => onAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})}
          testID="viewer-page-next"
          accessibilityLabel="Next page"
        />
      </View>
      <View style={styles.toolGroup}>
        {tools.map(tool => (
          <ButtonChrome
            key={tool.value}
            label={tool.label}
            onPress={() =>
              tool.value === 'highlight'
                ? onAddHighlight()
                : onAction({type: 'setTool', tool: tool.value})
            }
            active={viewer.activeTool === tool.value}
            testID={`tool-${tool.value}`}
            accessibilityLabel={`${tool.label} tool`}
          />
        ))}
      </View>
      <ButtonChrome
        label="Compare"
        onPress={onCompare}
        primary
        testID="viewer-compare-button"
      />
    </View>
  );
}

function ThumbnailRail({
  document,
  pageIndex,
  onPage,
  compare = false,
}: {
  document: DocumentRecord;
  pageIndex: number;
  onPage: (pageIndex: number) => void;
  compare?: boolean;
}) {
  const pages = compare ? [0, 1, 7, 8, 9] : [0, 1, 7, 8, 9, 11, 12];

  return (
    <View
      style={styles.thumbnailRail}
      testID={compare ? 'compare-thumbnail-rail' : 'thumbnail-rail'}
      accessible
      accessibilityLabel={compare ? 'Compare thumbnail rail' : 'Thumbnail rail'}>
      <Text style={styles.inspectorCaption}>Pages</Text>
      <ScrollView>
        {pages.map(page => (
          <Pressable
            key={page}
            testID={`${compare ? 'compare-' : ''}thumbnail-page-${page + 1}`}
            accessible
            accessibilityLabel={`Page ${page + 1} thumbnail`}
            accessibilityRole="button"
            style={[
              styles.thumbnail,
              pageIndex === page && styles.thumbnailActive,
            ]}
            onPress={() => onPage(page)}>
            <PdfCover document={document} />
            <Text style={styles.thumbnailLabel}>{page + 1}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ViewerInspector({
  document,
  documents,
  tags,
  viewer,
  annotations,
  onAction,
  onAddHighlight,
}: {
  document: DocumentRecord;
  documents: DocumentRecord[];
  tags: Tag[];
  viewer: ViewerState;
  annotations: Annotation[];
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onAddHighlight: () => void;
}) {
  return (
    <View style={styles.readerInspector}>
      <View style={styles.inspectorTabs}>
        {(['info', 'comments'] as InspectorTab[]).map(tab => (
          <Pressable
            key={tab}
            testID={`inspector-tab-${tab}`}
            accessible
            accessibilityLabel={`${capitalize(tab)} tab`}
            accessibilityRole="button"
            style={[
              styles.inspectorTab,
              viewer.inspectorTab === tab && styles.inspectorTabActive,
            ]}
            onPress={() => onAction({type: 'setInspectorTab', tab})}>
            <Text
              style={[
                styles.inspectorTabText,
                viewer.inspectorTab === tab && styles.inspectorTabTextActive,
              ]}>
              {capitalize(tab)}
            </Text>
          </Pressable>
        ))}
      </View>
      {viewer.inspectorTab === 'comments' ? (
        <CommentsPanel annotations={annotations} />
      ) : (
        <>
          <View style={styles.documentIdentity}>
            <PdfCover document={document} />
            <View style={styles.identityText}>
              <Text style={styles.inspectorTitle}>{document.title}</Text>
              <Text style={styles.inspectorSub}>
                PDF Document - {document.pageCount} pages
              </Text>
            </View>
          </View>
          <InfoGrid document={document} />
          <Text style={styles.inspectorCaption}>Quick Actions</Text>
          <ActionRow
            label="Add Note"
            onPress={() => onAction({type: 'setTool', tool: 'comment'})}
            testID="quick-action-add-note"
          />
          <ActionRow
            label="Highlight Text"
            onPress={onAddHighlight}
            testID="quick-action-highlight"
          />
          <ActionRow
            label="Draw"
            onPress={() => onAction({type: 'setTool', tool: 'pen'})}
            testID="quick-action-draw"
          />
          <ActionRow
            label="Add Signature"
            onPress={() => onAction({type: 'setTool', tool: 'signature'})}
            testID="quick-action-signature"
          />
          <ActionRow
            label="Add Bookmark"
            onPress={() => undefined}
            testID="quick-action-bookmark"
          />
          <Text style={styles.inspectorCaption}>Export</Text>
          <ActionRow
            label="Export as PNG"
            onPress={() => undefined}
            testID="export-png-action"
          />
          <ActionRow
            label="Export as JPG"
            onPress={() => undefined}
            testID="export-jpg-action"
          />
          <ActionRow
            label="Export as Text"
            onPress={() => undefined}
            testID="export-text-action"
          />
          <Text style={styles.inspectorCaption}>Open Documents</Text>
          {documents.slice(0, 3).map(item => (
            <Text key={item.id} numberOfLines={1} style={styles.relatedDoc}>
              {item.title}
            </Text>
          ))}
          <View style={styles.inlineTags}>
            {document.tags.map(tagId => {
              const tag = tags.find(item => item.id === tagId);
              return tag ? <TagPill key={tag.id} tag={tag} /> : null;
            })}
          </View>
        </>
      )}
    </View>
  );
}

function ChangesPanel({summary}: {summary: CompareSummary}) {
  return (
    <View
      style={styles.readerInspector}
      testID="changes-panel"
      accessible
      accessibilityLabel="Changes panel">
      <View style={styles.inspectorTabs}>
        <View style={styles.inspectorTab}>
          <Text style={styles.inspectorTabText}>Outline</Text>
        </View>
        <View style={[styles.inspectorTab, styles.inspectorTabActive]}>
          <Text style={[styles.inspectorTabText, styles.inspectorTabTextActive]}>
            Changes
          </Text>
        </View>
      </View>
      <Text style={styles.inspectorTitle}>{summary.totalChanges} changes</Text>
      <View style={styles.changeStats}>
        <ChangeStat
          label="Added"
          value={summary.added}
          tone="green"
          testID="change-stat-added"
        />
        <ChangeStat
          label="Removed"
          value={summary.removed}
          tone="red"
          testID="change-stat-removed"
        />
        <ChangeStat
          label="Modified"
          value={summary.modified}
          tone="amber"
          testID="change-stat-modified"
        />
      </View>
      {summary.pages.map(page => (
        <View
          key={`${page.pageIndex}-${page.status}`}
          style={styles.changeRow}
          testID={`change-row-page-${page.pageIndex + 1}`}
          accessible
          accessibilityLabel={`Page ${page.pageIndex + 1} change row`}>
          <View style={[styles.changeDot, changeDotStyle(page.status)]} />
          <View style={styles.changeTextBlock}>
            <Text style={styles.rowTitle}>Page {page.pageIndex + 1}</Text>
            <Text style={styles.rowText}>{page.title}</Text>
          </View>
          <Text style={styles.rowText}>{page.changeCount} changes</Text>
        </View>
      ))}
      <ButtonChrome
        label="View Change Report"
        onPress={() => undefined}
        testID="view-change-report-button"
      />
    </View>
  );
}

function CommentsPanel({annotations}: {annotations: Annotation[]}) {
  return (
    <ScrollView
      testID="comments-panel"
      accessible
      accessibilityLabel="Comments panel"
      contentContainerStyle={styles.commentsPanel}>
      <View style={styles.commentFilterRow}>
        <TagLike label={`All ${annotations.length}`} active testID="comment-filter-all" />
        <TagLike label="Highlights" testID="comment-filter-highlights" />
        <TagLike label="Notes" testID="comment-filter-notes" />
      </View>
      {annotations.length === 0 ? (
        <Text style={styles.emptyText}>No comments on this page yet.</Text>
      ) : (
        annotations.map((annotation, index) => {
          const testID =
            annotation.text === 'Local non-destructive highlight'
              ? 'comment-item-local-highlight'
              : `comment-item-${annotation.id}`;

          return (
            <View
              key={annotation.id}
              style={styles.commentItem}
              testID={testID}
              accessible
              accessibilityLabel={annotation.text ?? 'Review this annotation'}>
              <View style={[styles.annotationTypeDot, {backgroundColor: annotation.color}]} />
              <View style={styles.commentBody}>
                <View style={styles.commentMetaRow}>
                  <Text style={styles.commentAuthor}>
                    {index % 2 === 0 ? 'Olivia Harper' : 'Ethan Miller'}
                  </Text>
                  <Text style={styles.rowText}>9:{41 + index * 9} AM</Text>
                </View>
                <Text style={styles.commentText}>
                  {annotation.text ?? 'Review this annotation.'}
                </Text>
                <Text style={styles.replyText}>Reply</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function BottomScrubber({
  viewer,
  onPage,
  labelLeft,
}: {
  viewer: ViewerState;
  onPage: (pageIndex: number) => void;
  labelLeft?: string;
}) {
  const steps = Array.from({length: Math.min(viewer.pageCount, 32)}, (_, index) => index);
  const pageLabel = labelLeft ?? `Page ${viewer.pageIndex + 1} of ${viewer.pageCount}`;

  return (
    <View
      style={styles.bottomBar}
      testID="bottom-scrubber"
      accessible
      accessibilityLabel={pageLabel}>
      <Text
        style={styles.bottomLabel}
        testID="bottom-page-label"
        accessible
        accessibilityLabel={pageLabel}>
        {pageLabel}
      </Text>
      <View style={styles.scrubberTrack}>
        {steps.map(step => (
          <Pressable
            key={step}
            testID={`scrubber-page-${step + 1}`}
            accessible
            accessibilityLabel={`Go to page ${step + 1}`}
            accessibilityRole="button"
            style={[
              styles.scrubberTick,
              step <= viewer.pageIndex && styles.scrubberTickActive,
            ]}
            onPress={() => onPage(step)}
          />
        ))}
      </View>
      <Text style={styles.bottomLabel}>{Math.round(viewer.zoom * 25)}%</Text>
    </View>
  );
}

function InfoGrid({document}: {document: DocumentRecord}) {
  const rows = [
    ['Author', document.author],
    ['Created', formatShortDate(document.createdAt)],
    ['Modified', formatShortDate(document.modifiedAt)],
    ['File Size', `${document.sizeMb.toFixed(1)} MB`],
    ['PDF Version', '1.7'],
    ['Page Size', 'A4 (210 x 297 mm)'],
    ['Pages', `${document.pageCount}`],
  ];

  return (
    <View style={styles.infoGrid}>
      <Text style={styles.inspectorCaption}>Information</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionRow({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      style={styles.actionRow}
      onPress={onPress}
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityRole="button">
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionChevron}>{'>'}</Text>
    </Pressable>
  );
}

function ButtonChrome({
  label,
  onPress,
  primary = false,
  quiet = false,
  active = false,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  quiet?: boolean;
  active?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      style={({pressed}) => [
        styles.button,
        primary && styles.buttonPrimary,
        quiet && styles.buttonQuiet,
        active && styles.buttonActive,
        pressed && styles.buttonPressed,
      ]}
      onPress={onPress}>
      <Text
        style={[
          styles.buttonText,
          primary && styles.buttonTextPrimary,
          active && styles.buttonTextActive,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
  testIDPrefix,
}: {
  value: string;
  options: Array<{label: string; value: string}>;
  onChange: (value: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.segmentedControl}>
      {options.map(option => (
        <Pressable
          key={option.value}
          testID={
            testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined
          }
          accessible
          accessibilityRole="button"
          accessibilityLabel={option.label}
          style={[
            styles.segment,
            value === option.value && styles.segmentActive,
          ]}
          onPress={() => onChange(option.value)}>
          <Text
            style={[
              styles.segmentText,
              value === option.value && styles.segmentTextActive,
            ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TagPill({tag}: {tag: Tag}) {
  return (
    <Text style={[styles.tagPill, tagPillToneStyle(tag.tone)]}>
      {tag.label}
    </Text>
  );
}

function TagLike({
  label,
  active = false,
  testID,
}: {
  label: string;
  active?: boolean;
  testID?: string;
}) {
  return (
    <Text
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={[styles.commentFilter, active && styles.commentFilterActive]}>
      {label}
    </Text>
  );
}

function ChangeStat({
  label,
  value,
  tone,
  testID,
}: {
  label: string;
  value: number;
  tone: TagTone;
  testID?: string;
}) {
  return (
    <View
      style={styles.changeStat}
      testID={testID}
      accessible
      accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.changeStatNumber, tagTextToneStyle(tone)]}>
        {value}
      </Text>
      <Text style={styles.changeStatLabel}>{label}</Text>
    </View>
  );
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toneStyle(tone: TagTone) {
  switch (tone) {
    case 'blue':
      return styles.blueDot;
    case 'green':
      return styles.greenDot;
    case 'purple':
      return styles.purpleDot;
    case 'amber':
      return styles.amberDot;
    case 'red':
      return styles.redDot;
    default:
      return styles.grayDot;
  }
}

function tagPillToneStyle(tone: TagTone) {
  switch (tone) {
    case 'blue':
      return styles.bluePill;
    case 'green':
      return styles.greenPill;
    case 'purple':
      return styles.purplePill;
    case 'amber':
      return styles.amberPill;
    case 'red':
      return styles.redPill;
    default:
      return styles.grayPill;
  }
}

function tagTextToneStyle(tone: TagTone) {
  switch (tone) {
    case 'green':
      return styles.greenText;
    case 'red':
      return styles.redText;
    case 'amber':
      return styles.amberText;
    default:
      return styles.blueText;
  }
}

function coverToneStyle(tone: DocumentRecord['thumbnailTone']) {
  switch (tone) {
    case 'navy':
      return styles.coverNavy;
    case 'ice':
      return styles.coverIce;
    case 'red':
      return styles.coverRed;
    case 'teal':
      return styles.coverTeal;
    case 'paper':
      return styles.coverPaper;
    default:
      return styles.coverPastel;
  }
}

function changeDotStyle(status: 'added' | 'removed' | 'modified') {
  switch (status) {
    case 'added':
      return styles.greenDot;
    case 'removed':
      return styles.redDot;
    default:
      return styles.amberDot;
  }
}

const styles = StyleSheet.create({
  window: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  titleBar: {
    height: 64,
    backgroundColor: '#FBFBFD',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  trafficLights: {
    flexDirection: 'row',
    marginRight: 18,
  },
  trafficLight: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  closeLight: {
    backgroundColor: '#FF5F57',
  },
  minimizeLight: {
    backgroundColor: '#FEBB2E',
  },
  zoomLight: {
    backgroundColor: '#28C840',
  },
  titleDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#E0E3EA',
    marginRight: 18,
  },
  titleBlock: {
    width: 250,
  },
  readerTitleBlock: {
    width: 430,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    color: '#1B1F27',
    fontSize: 14,
    fontWeight: '700',
  },
  titleMeta: {
    color: '#737B8B',
    fontSize: 12,
    marginTop: 3,
  },
  searchBox: {
    flex: 1,
    height: 34,
    borderColor: '#DADDE5',
    borderWidth: 1,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    marginRight: 12,
  },
  searchIcon: {
    color: '#565E6D',
    fontSize: 12,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#1D2430',
    padding: 0,
    fontSize: 13,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 224,
    backgroundColor: '#F6F7FA',
    borderRightColor: '#DADDE4',
    borderRightWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  navItem: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    marginBottom: 6,
  },
  navItemActive: {
    backgroundColor: '#E6EEFF',
  },
  navText: {
    color: '#343B48',
    fontSize: 13,
  },
  navTextActive: {
    color: '#1769E8',
    fontWeight: '700',
  },
  sidebarRule: {
    height: 1,
    backgroundColor: '#DDE1E8',
    marginVertical: 14,
  },
  sidebarCaption: {
    color: '#181D25',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  sidebarTag: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
  },
  sidebarText: {
    color: '#343B48',
    fontSize: 13,
  },
  sidebarTextActive: {
    color: '#1769E8',
    fontWeight: '700',
  },
  tagDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginRight: 10,
  },
  blueDot: {
    backgroundColor: '#2E74F5',
  },
  greenDot: {
    backgroundColor: '#4CC76A',
  },
  purpleDot: {
    backgroundColor: '#9B62E8',
  },
  amberDot: {
    backgroundColor: '#F6AA2D',
  },
  redDot: {
    backgroundColor: '#F2484B',
  },
  grayDot: {
    backgroundColor: '#B5BBC5',
  },
  collectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addText: {
    color: '#343B48',
    fontSize: 18,
  },
  collectionItem: {
    minHeight: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collectionCount: {
    color: '#586170',
    backgroundColor: '#EDEFF3',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
  },
  storageBlock: {
    marginTop: 'auto',
    paddingBottom: 22,
  },
  storageTrack: {
    height: 3,
    backgroundColor: '#D8DDE6',
    marginBottom: 10,
  },
  storageFill: {
    height: 3,
    backgroundColor: '#2E74F5',
  },
  libraryMain: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  libraryToolbar: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#171B22',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 14,
  },
  cardRow: {
    flexDirection: 'row',
    paddingBottom: 22,
  },
  documentCard: {
    width: 158,
    marginRight: 24,
  },
  documentCardSelected: {
    opacity: 1,
  },
  cover: {
    width: 34,
    height: 46,
    borderColor: '#D8DDE6',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
    padding: 4,
  },
  coverLarge: {
    width: 124,
    height: 172,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#1F2937',
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: {width: 0, height: 6},
  },
  coverPastel: {
    backgroundColor: '#DDE8EE',
  },
  coverNavy: {
    backgroundColor: '#0F477A',
  },
  coverIce: {
    backgroundColor: '#EFF5FC',
  },
  coverRed: {
    backgroundColor: '#FF424C',
  },
  coverTeal: {
    backgroundColor: '#E8F7F5',
  },
  coverPaper: {
    backgroundColor: '#FEFEFD',
  },
  coverTitle: {
    color: '#0F1730',
    fontSize: 5,
    fontWeight: '800',
  },
  coverTitleLarge: {
    fontSize: 13,
  },
  coverAuthor: {
    color: '#374151',
    fontSize: 4,
    marginTop: 3,
  },
  progressBadge: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    color: '#203040',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    color: '#1A1F29',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  cardMeta: {
    color: '#687282',
    fontSize: 11,
    marginTop: 4,
  },
  recentHeader: {
    borderTopColor: '#DADDE4',
    borderTopWidth: 1,
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  table: {
    marginBottom: 30,
  },
  tableHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
  },
  tableHeadText: {
    color: '#4E5665',
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#E4E7ED',
    borderBottomWidth: 1,
  },
  tableRowSelected: {
    backgroundColor: '#F3F6FD',
  },
  nameColumn: {
    flex: 2.1,
  },
  authorColumn: {
    flex: 1.3,
  },
  dateColumn: {
    flex: 1.2,
  },
  sizeColumn: {
    flex: 0.7,
  },
  tagsColumn: {
    flex: 1.5,
  },
  rowName: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    color: '#1E2430',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
  rowText: {
    color: '#596272',
    fontSize: 12,
  },
  inlineTags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagPill: {
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 6,
    marginBottom: 4,
  },
  bluePill: {
    color: '#1769E8',
    backgroundColor: '#E3ECFF',
  },
  greenPill: {
    color: '#20984B',
    backgroundColor: '#E4F6E9',
  },
  purplePill: {
    color: '#8550D6',
    backgroundColor: '#EFE5FF',
  },
  amberPill: {
    color: '#A86C00',
    backgroundColor: '#FFF0CE',
  },
  redPill: {
    color: '#E1353A',
    backgroundColor: '#FFE3E5',
  },
  grayPill: {
    color: '#56606F',
    backgroundColor: '#EDF0F4',
  },
  inspector: {
    width: 260,
    borderLeftColor: '#DADDE4',
    borderLeftWidth: 1,
    backgroundColor: '#F8F9FB',
    padding: 20,
  },
  inspectorTitle: {
    color: '#1A1F29',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  inspectorSub: {
    color: '#626B7A',
    fontSize: 12,
    marginBottom: 18,
  },
  inspectorCaption: {
    color: '#1A1F29',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 10,
  },
  addTag: {
    color: '#3E4654',
    backgroundColor: '#F0F2F5',
    borderColor: '#D8DDE5',
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  infoGrid: {
    borderTopColor: '#D9DDE5',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    color: '#687282',
    fontSize: 12,
  },
  infoValue: {
    color: '#363E4E',
    fontSize: 12,
    maxWidth: 132,
    textAlign: 'right',
  },
  actionRow: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLabel: {
    color: '#47505F',
    fontSize: 12,
  },
  actionChevron: {
    color: '#7B8494',
    fontSize: 13,
  },
  button: {
    minHeight: 32,
    borderColor: '#DADDE5',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginLeft: 8,
  },
  buttonPrimary: {
    backgroundColor: '#2E74F5',
    borderColor: '#2E74F5',
  },
  buttonQuiet: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    minWidth: 26,
    paddingHorizontal: 6,
  },
  buttonActive: {
    borderColor: '#2E74F5',
    backgroundColor: '#EAF1FF',
  },
  buttonPressed: {
    opacity: 0.74,
  },
  buttonText: {
    color: '#303746',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
  buttonTextActive: {
    color: '#1769E8',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#CBD4E4',
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  segment: {
    minWidth: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#EAF1FF',
  },
  segmentText: {
    color: '#4C5564',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#1769E8',
  },
  readerShell: {
    flex: 1,
  },
  readerToolbar: {
    height: 54,
    backgroundColor: '#FAFBFD',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  zoomText: {
    color: '#1F2633',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  pageStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 14,
    marginRight: 14,
  },
  pageInput: {
    width: 54,
    height: 32,
    borderColor: '#DADDE5',
    borderWidth: 1,
    borderRadius: 7,
    color: '#1F2633',
    fontSize: 13,
    textAlign: 'center',
    marginLeft: 8,
  },
  stepperText: {
    color: '#343B48',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  toolGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  readerBody: {
    flex: 1,
    flexDirection: 'row',
  },
  thumbnailRail: {
    width: 214,
    backgroundColor: '#F7F8FA',
    borderRightColor: '#DADDE4',
    borderRightWidth: 1,
    padding: 14,
  },
  thumbnail: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 10,
  },
  thumbnailActive: {
    borderColor: '#2E74F5',
    backgroundColor: '#EEF4FF',
  },
  thumbnailLabel: {
    color: '#2F3745',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  readerInspector: {
    width: 286,
    backgroundColor: '#F8F9FB',
    borderLeftColor: '#DADDE4',
    borderLeftWidth: 1,
    padding: 16,
  },
  inspectorTabs: {
    height: 36,
    flexDirection: 'row',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  inspectorTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  inspectorTabActive: {
    borderBottomColor: '#2E74F5',
  },
  inspectorTabText: {
    color: '#495261',
    fontSize: 12,
    fontWeight: '700',
  },
  inspectorTabTextActive: {
    color: '#1769E8',
  },
  documentIdentity: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  identityText: {
    flex: 1,
    marginLeft: 12,
  },
  relatedDoc: {
    color: '#596272',
    fontSize: 12,
    marginBottom: 8,
  },
  commentsPanel: {
    paddingBottom: 24,
  },
  commentFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  commentFilter: {
    color: '#4C5564',
    fontSize: 12,
    marginRight: 12,
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commentFilterActive: {
    color: '#1769E8',
    backgroundColor: '#EAF1FF',
  },
  emptyText: {
    color: '#6B7483',
    fontSize: 12,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  annotationTypeDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginTop: 4,
    marginRight: 10,
  },
  commentBody: {
    flex: 1,
  },
  commentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  commentAuthor: {
    color: '#222936',
    fontSize: 12,
    fontWeight: '800',
  },
  commentText: {
    color: '#333B49',
    fontSize: 12,
    lineHeight: 18,
  },
  replyText: {
    color: '#4C5564',
    fontSize: 12,
    marginTop: 8,
  },
  bottomBar: {
    height: 52,
    backgroundColor: '#FAFBFD',
    borderTopColor: '#DADDE4',
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  bottomLabel: {
    width: 190,
    color: '#4E5665',
    fontSize: 13,
  },
  scrubberTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrubberTick: {
    flex: 1,
    height: 2,
    backgroundColor: '#CFD5DF',
    marginRight: 2,
  },
  scrubberTickActive: {
    backgroundColor: '#2E74F5',
  },
  compareCanvasArea: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ECEEF2',
    padding: 18,
  },
  comparePane: {
    flex: 1,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  changeStats: {
    flexDirection: 'row',
    borderColor: '#DADDE4',
    borderWidth: 1,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 18,
  },
  changeStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRightColor: '#DADDE4',
    borderRightWidth: 1,
  },
  changeStatNumber: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  changeStatLabel: {
    color: '#313947',
    fontSize: 11,
    fontWeight: '700',
  },
  changeRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#E2E5EB',
    borderBottomWidth: 1,
  },
  changeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  changeTextBlock: {
    flex: 1,
  },
  greenText: {
    color: '#1D9E4F',
  },
  redText: {
    color: '#E1353A',
  },
  amberText: {
    color: '#D18300',
  },
  blueText: {
    color: '#1769E8',
  },
});

export default App;
