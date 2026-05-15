import React, {useEffect, useMemo, useReducer, useState} from 'react';
import {
  Alert,
  type TextProps,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {type CanvasAnnotationRequest, PdfCanvas} from './src/components/PdfCanvas';
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
  LibraryScope,
  LibrarySort,
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
  forceCompactLayout?: boolean;
};

type AccountState = {
  signedIn: boolean;
  plan: 'free' | 'pro';
};

type SignatureProfile = {
  id: string;
  label: string;
  value: string;
  updatedAt: string;
};

type ScopeCounts = Record<LibraryScope, number>;
type CommentAnnotationFilter =
  | 'all'
  | 'highlight'
  | 'note'
  | 'drawing'
  | 'signature';

const initialFilter: LibraryFilter = {
  query: '',
  tagId: 'all',
  collectionId: 'all',
  scope: 'library',
  sortBy: 'lastOpened',
  viewMode: 'grid',
};

const libraryScopeOptions: LibraryScope[] = [
  'library',
  'recent',
  'favorites',
  'shared',
];

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

function App({screenshotMode = 'library', forceCompactLayout = false}: AppProps) {
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
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [signatures, setSignatures] = useState<SignatureProfile[]>([
    {
      id: 'signature-default',
      label: 'Default Signature',
      value: 'Ben Ebsworth',
      updatedAt: '2026-05-11T08:10:00.000Z',
    },
  ]);
  const [activeSignatureId, setActiveSignatureId] = useState('signature-default');
  const [accountState, setAccountState] = useState<AccountState>({
    signedIn: false,
    plan: 'free',
  });
  const [compareSynced, setCompareSynced] = useState(true);
  const windowMetrics = useWindowDimensions();

  const visibleDocuments = useMemo(
    () => getFilteredDocuments(libraryState, filter),
    [filter, libraryState],
  );
  const scopeCounts = useMemo(
    () => getScopeCounts(libraryState.documents),
    [libraryState.documents],
  );
  useEffect(() => {
    if (
      visibleDocuments.length > 0 &&
      !visibleDocuments.some(document => document.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(visibleDocuments[0].id);
    }
  }, [selectedDocumentId, visibleDocuments]);
  const continueReading = useMemo(
    () => getContinueReadingDocuments(libraryState, 4),
    [libraryState],
  );
  const selectedAnnotations = annotations.filter(
    annotation => annotation.documentId === selectedDocument.id,
  );
  const canUseReviewFeatures =
    accountState.signedIn && accountState.plan === 'pro';
  const compareRightDocument =
    libraryState.documents.find(
      document => document.id === 'annual-financial-report',
    ) ?? selectedDocument;
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
    dispatchLibrary({
      type: 'updateDocument',
      documentId: document.id,
      patch: {
        lastOpenedAt: new Date().toISOString(),
        progress: document.progress > 0 ? document.progress : 0.01,
      },
    });
    setSelectedDocumentId(document.id);
    setViewerState(createInitialViewerState(document.id, document.pageCount));
    setScreenMode(mode);
  }

  function openAdjacentDocument(offset: 1 | -1 = 1) {
    const source = visibleDocuments.length > 0 ? visibleDocuments : libraryState.documents;
    const currentIndex = source.findIndex(document => document.id === selectedDocument.id);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextDocument = source[(safeIndex + offset + source.length) % source.length];

    if (nextDocument) {
      openDocument(nextDocument, screenMode === 'compare' ? 'compare' : 'viewer');
    }
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

  function selectViewerTool(tool: ViewerTool) {
    updateViewer({type: 'setTool', tool});

    if (tool === 'comment') {
      updateViewer({type: 'setInspectorTab', tab: 'comments'});
    }

    if (tool === 'signature') {
      updateViewer({type: 'setInspectorTab', tab: 'info'});
    }
  }

  function addCanvasAnnotation(request: CanvasAnnotationRequest) {
    const signature = signatures.find(item => item.id === activeSignatureId) ?? signatures[0];
    const copy = annotationCopyForRequest(request, signature?.value);
    const annotation = createAnnotation({
      id: `${request.kind}-${Date.now()}`,
      documentId: selectedDocument.id,
      pageIndex: request.pageIndex,
      kind: request.kind,
      color: annotationColorForKind(request.kind),
      bounds: request.bounds,
      points: request.points,
      text: copy,
    });

    setAnnotations(current => [...current, annotation]);
    updateViewer({
      type: 'setInspectorTab',
      tab: request.kind === 'signature' ? 'info' : 'comments',
    });
  }

  function addBookmark() {
    const annotation = createAnnotation({
      id: `bookmark-${Date.now()}`,
      documentId: selectedDocument.id,
      pageIndex: viewerState.pageIndex,
      kind: 'bookmark',
      color: '#2E74F5',
      bounds: {x: 88, y: 92, width: 24, height: 32},
      text: `Bookmark on page ${viewerState.pageIndex + 1}`,
    });

    setAnnotations(current => [...current, annotation]);
    updateViewer({type: 'setInspectorTab', tab: 'comments'});
  }

  function unlockReviewFeatures() {
    setAccountState({signedIn: true, plan: 'pro'});
  }

  function toggleFavorite(document: DocumentRecord) {
    dispatchLibrary({
      type: 'updateDocument',
      documentId: document.id,
      patch: {favorite: !document.favorite},
    });
  }

  function addCollection() {
    dispatchLibrary({type: 'addCollection', label: nextCollectionLabel(libraryState.collections)});
  }

  function addTagToSelectedDocument() {
    const preferredTags = ['research', 'finance', 'marketing', 'personal', 'work'];
    const nextTag =
      preferredTags.find(tagId => !selectedDocument.tags.includes(tagId)) ??
      libraryState.tags.find(tag => !selectedDocument.tags.includes(tag.id))?.id;

    if (!nextTag) {
      return;
    }

    dispatchLibrary({
      type: 'addTagToDocument',
      documentId: selectedDocument.id,
      tagId: nextTag,
    });
  }

  function saveSignature(value: string) {
    const trimmedValue = value.trim();

    if (trimmedValue.length === 0) {
      return;
    }

    setSignatures(current => {
      const updatedAt = new Date().toISOString();
      const existing = current.find(item => item.id === activeSignatureId);

      if (existing) {
        return current.map(item =>
          item.id === activeSignatureId
            ? {...item, value: trimmedValue, label: trimmedValue, updatedAt}
            : item,
        );
      }

      const signature = {
        id: `signature-${Date.now()}`,
        label: trimmedValue,
        value: trimmedValue,
        updatedAt,
      };
      setActiveSignatureId(signature.id);
      return [...current, signature];
    });
  }

  async function submitSearch(overrideQuery?: string) {
    const query =
      overrideQuery?.trim() ??
      (screenMode === 'library'
        ? filter.query.trim()
        : viewerState.searchQuery.trim());

    if (query.length === 0) {
      return;
    }

    if (screenMode === 'library') {
      const firstMatch = getFilteredDocuments(libraryState, {
        ...filter,
        query,
      })[0];
      if (firstMatch) {
        openDocument(firstMatch);
      }
      return;
    }

    if (selectedDocument.path) {
      const matches = await PdfKitBridge.search(
        selectedDocument.path,
        query,
        selectedDocument.bookmark,
      );
      if (matches[0]) {
        updateViewer({type: 'setPage', pageIndex: matches[0].pageIndex});
      }
      return;
    }

    const demoMatch = searchDemoDocument(selectedDocument, query);
    if (demoMatch !== undefined) {
      updateViewer({type: 'setPage', pageIndex: demoMatch});
    }
  }

  function showLocalAction(title: string, message: string) {
    Alert.alert(title, message);
  }

  async function exportCurrentDocument(
    format: 'png' | 'jpg' | 'text' | 'annotated',
  ) {
    if (!selectedDocument.path) {
      showLocalAction(
        'Import a PDF to export',
        'Demo documents can be inspected locally. Open a PDF from your Mac to export rendered pages or page text.',
      );
      return;
    }

    try {
      let outputPath: string | undefined;

      if (format === 'annotated') {
        outputPath = await PdfKitBridge.exportAnnotatedCopy(
          selectedDocument.path,
          selectedAnnotations,
          selectedDocument.bookmark,
        );
      } else if (format === 'text') {
        outputPath = await PdfKitBridge.exportPageText(
          selectedDocument.path,
          viewerState.pageIndex,
          selectedDocument.bookmark,
        );
      } else {
        outputPath = await PdfKitBridge.exportPageImage(
          selectedDocument.path,
          viewerState.pageIndex,
          selectedDocument.bookmark,
          format,
        );
      }

      if (!outputPath) {
        showLocalAction(
          'Export unavailable',
          'The native PDF exporter did not return an output file.',
        );
        return;
      }

      showLocalAction(
        'Export ready',
        `${selectedDocument.title} page ${viewerState.pageIndex + 1} was exported to ${outputPath}`,
      );
    } catch (error) {
      showLocalAction(
        'Export failed',
        error instanceof Error ? error.message : 'The selected page could not be exported.',
      );
    }
  }

  const isCompactPhone =
    forceCompactLayout ||
    (!isJestRuntime() &&
      (Platform.OS === 'ios' || Platform.OS === 'android') &&
      windowMetrics.width > 0 &&
      windowMetrics.width < 760);

  if (isCompactPhone) {
    return (
      <MobileExperience
        screenMode={screenMode}
        filter={filter}
        selectedDocument={selectedDocument}
        rightDocument={compareRightDocument}
        tags={libraryState.tags}
        scopeCounts={scopeCounts}
        documents={visibleDocuments}
        continueReading={continueReading}
        viewer={viewerState}
        annotations={selectedAnnotations}
        canUseReviewFeatures={canUseReviewFeatures}
        compareSummary={compareSummary}
        signatures={signatures}
        activeSignatureId={activeSignatureId}
        onQueryChange={query => setFilter(current => ({...current, query}))}
        onSearchSubmit={submitSearch}
        onFilterChange={patch => setFilter(current => ({...current, ...patch}))}
        onOpenFile={openImportedPdf}
        onSelectDocument={document => setSelectedDocumentId(document.id)}
        onOpenDocument={openDocument}
        onBack={() => setScreenMode('library')}
        onCompare={() => setScreenMode('compare')}
        onViewerAction={updateViewer}
        onSelectTool={selectViewerTool}
        onCanvasAnnotation={addCanvasAnnotation}
        onUnlockReviewFeatures={unlockReviewFeatures}
        onSelectSignature={setActiveSignatureId}
        onSaveSignature={saveSignature}
      />
    );
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
        documentCount={libraryState.documents.length}
        query={screenMode === 'library' ? filter.query : viewerState.searchQuery}
        onQueryChange={query =>
          screenMode === 'library'
            ? setFilter(current => ({...current, query}))
            : updateViewer({type: 'setSearchQuery', query})
        }
        onSearchSubmit={submitSearch}
        onBack={() => setScreenMode('library')}
        onForward={() => openAdjacentDocument(1)}
        onOpenFile={openImportedPdf}
      />
      {screenMode === 'library' ? (
        <LibraryScreen
          filter={filter}
          selectedDocument={selectedDocument}
          stateTags={libraryState.tags}
          collections={libraryState.collections}
          scopeCounts={scopeCounts}
          documents={visibleDocuments}
          continueReading={continueReading}
          filterPanelOpen={filterPanelOpen}
          storageUsedGb={libraryState.storageUsedGb}
          storageLimitGb={libraryState.storageLimitGb}
          canShowStorage={accountState.signedIn}
          onOpenFile={openImportedPdf}
          onFilterChange={patch =>
            setFilter(current => ({...current, ...patch}))
          }
          onClearFilters={() =>
            setFilter(current => ({
              ...current,
              query: '',
              tagId: 'all',
              collectionId: 'all',
              scope: 'library',
            }))
          }
          onToggleFilterPanel={() => setFilterPanelOpen(current => !current)}
          onAddCollection={addCollection}
          onSelectScope={scope =>
            setFilter(current => ({
              ...current,
              query: '',
              tagId: 'all',
              collectionId: 'all',
              scope,
              sortBy: scope === 'recent' ? 'lastOpened' : current.sortBy,
            }))
          }
          onSelectDocument={document => setSelectedDocumentId(document.id)}
          onOpenDocument={openDocument}
          onAddTag={addTagToSelectedDocument}
          onToggleFavorite={toggleFavorite}
          onShare={document =>
            showLocalAction('Share', `${document.title} is ready for local export or system sharing.`)
          }
          onCompare={() => setScreenMode('compare')}
        />
      ) : screenMode === 'compare' ? (
        <CompareScreen
          leftDocument={selectedDocument}
          rightDocument={compareRightDocument}
          summary={compareSummary}
          viewer={viewerState}
          annotations={selectedAnnotations}
          syncedScroll={compareSynced}
          onBack={() => setScreenMode('library')}
          onToggleSyncedScroll={() => setCompareSynced(current => !current)}
          onViewerAction={updateViewer}
          onViewChangeReport={() =>
            showLocalAction('Change Report', 'The changes panel is showing the local comparison summary.')
          }
        />
      ) : (
        <ViewerScreen
          document={selectedDocument}
          documents={libraryState.documents}
          tags={libraryState.tags}
          viewer={viewerState}
          annotations={selectedAnnotations}
          canUseReviewFeatures={canUseReviewFeatures}
          onBack={() => setScreenMode('library')}
          onCompare={() => setScreenMode('compare')}
          onViewerAction={updateViewer}
          onSelectTool={selectViewerTool}
          onCanvasAnnotation={addCanvasAnnotation}
          onAddBookmark={addBookmark}
          onUnlockReviewFeatures={unlockReviewFeatures}
          signatures={signatures}
          activeSignatureId={activeSignatureId}
          onSelectSignature={setActiveSignatureId}
          onSaveSignature={saveSignature}
          onExport={exportCurrentDocument}
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

function MobileExperience({
  screenMode,
  filter,
  selectedDocument,
  rightDocument,
  tags,
  scopeCounts,
  documents,
  continueReading,
  viewer,
  annotations,
  canUseReviewFeatures,
  compareSummary,
  signatures,
  activeSignatureId,
  onQueryChange,
  onSearchSubmit,
  onFilterChange,
  onOpenFile,
  onSelectDocument,
  onOpenDocument,
  onBack,
  onCompare,
  onViewerAction,
  onSelectTool,
  onCanvasAnnotation,
  onUnlockReviewFeatures,
  onSelectSignature,
  onSaveSignature,
}: {
  screenMode: ScreenMode;
  filter: LibraryFilter;
  selectedDocument: DocumentRecord;
  rightDocument: DocumentRecord;
  tags: Tag[];
  scopeCounts: ScopeCounts;
  documents: DocumentRecord[];
  continueReading: DocumentRecord[];
  viewer: ViewerState;
  annotations: Annotation[];
  canUseReviewFeatures: boolean;
  compareSummary: CompareSummary;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit: (query?: string) => void | Promise<void>;
  onFilterChange: (patch: Partial<LibraryFilter>) => void;
  onOpenFile: () => void;
  onSelectDocument: (document: DocumentRecord) => void;
  onOpenDocument: (document: DocumentRecord, mode?: ScreenMode) => void;
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onCanvasAnnotation: (request: CanvasAnnotationRequest) => void;
  onUnlockReviewFeatures: () => void;
  onSelectSignature: (signatureId: string) => void;
  onSaveSignature: (value: string) => void;
}) {
  const shouldShowContinueReading =
    filter.scope === 'library' &&
    filter.query.trim().length === 0 &&
    filter.tagId === 'all' &&
    filter.collectionId === 'all';
  const sectionTitle = librarySectionTitle(filter.scope);

  if (screenMode === 'viewer') {
    return (
      <MobileViewer
        document={selectedDocument}
        viewer={viewer}
        annotations={annotations}
        canUseReviewFeatures={canUseReviewFeatures}
        onBack={onBack}
        onCompare={onCompare}
        onViewerAction={onViewerAction}
        onSelectTool={onSelectTool}
        onCanvasAnnotation={onCanvasAnnotation}
        onUnlockReviewFeatures={onUnlockReviewFeatures}
        signatures={signatures}
        activeSignatureId={activeSignatureId}
        onSelectSignature={onSelectSignature}
        onSaveSignature={onSaveSignature}
      />
    );
  }

  if (screenMode === 'compare') {
    return (
      <MobileCompare
        leftDocument={selectedDocument}
        rightDocument={rightDocument}
        summary={compareSummary}
        viewer={viewer}
        annotations={annotations}
        onBack={onBack}
        onViewerAction={onViewerAction}
      />
    );
  }

  return (
    <MobileSafeArea>
      <View
        style={mobileStyles.shell}
        testID="mobile-library-screen">
        <View style={mobileStyles.header}>
          <View>
            <Text style={mobileStyles.appTitle}>Acacia</Text>
            <Text style={mobileStyles.headerMeta}>PDF workspace</Text>
          </View>
          <MobileButton label="Open" icon="+" primary onPress={onOpenFile} />
        </View>
        <View style={mobileStyles.searchBox}>
          <TextInput
            testID="mobile-library-search-input"
            accessibilityLabel="Search documents"
            value={filter.query}
            onChangeText={onQueryChange}
            onSubmitEditing={event => onSearchSubmit(event.nativeEvent.text)}
            returnKeyType="search"
            placeholder="Search documents"
            placeholderTextColor="#7A8393"
            style={mobileStyles.searchInput}
          />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={mobileStyles.libraryContent}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={mobileStyles.scopeScroller}>
            {libraryScopeOptions.map(scope => (
              <MobileTagButton
                key={scope}
                label={mobileScopeLabel(scope)}
                icon={scopeIcon(scope)}
                count={scopeCounts[scope]}
                active={filter.scope === scope}
                testID={`mobile-scope-${scope}`}
                onPress={() =>
                  onFilterChange({
                    scope,
                    tagId: 'all',
                    collectionId: 'all',
                  })
                }
              />
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={mobileStyles.tagScroller}>
            <MobileTagButton
              label="All"
              active={filter.tagId === 'all'}
              testID="mobile-tag-all"
              icon="🏷️"
              onPress={() => onFilterChange({scope: 'library', tagId: 'all'})}
            />
            {tags.map(tag => (
              <MobileTagButton
                key={tag.id}
                label={tag.label}
                active={filter.tagId === tag.id}
                tone={tag.tone}
                icon={tagEmoji(tag.id)}
                testID={`mobile-tag-${tag.id}`}
                onPress={() =>
                  onFilterChange({scope: 'library', tagId: tag.id})
                }
              />
            ))}
          </ScrollView>
          {shouldShowContinueReading ? (
            <>
              <View style={mobileStyles.sectionHeader}>
                <Text style={mobileStyles.sectionTitle}>Continue Reading</Text>
                <MobileButton label="Compare" icon="↔️" onPress={onCompare} />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={mobileStyles.cardScroller}>
                {continueReading.map(document => (
                  <MobileDocumentCard
                    key={document.id}
                    document={document}
                    selected={selectedDocument.id === document.id}
                    onPress={() => {
                      onSelectDocument(document);
                      onOpenDocument(document);
                    }}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}
          <Text
            testID="mobile-results-summary"
            accessibilityLabel={`${formatDocumentCount(documents.length)} in ${sectionTitle}`}
            style={mobileStyles.resultsSummary}>
            {formatDocumentCount(documents.length)} in {sectionTitle}
          </Text>
          <Text style={mobileStyles.sectionTitle}>{sectionTitle}</Text>
          <View style={mobileStyles.documentList}>
            {documents.map(document => (
              <MobileDocumentRow
                key={document.id}
                document={document}
                tags={tags}
                selected={selectedDocument.id === document.id}
                onPress={() => {
                  onSelectDocument(document);
                  onOpenDocument(document);
                }}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </MobileSafeArea>
  );
}

function MobileViewer({
  document,
  viewer,
  annotations,
  canUseReviewFeatures,
  onBack,
  onCompare,
  onViewerAction,
  onSelectTool,
  onCanvasAnnotation,
  onUnlockReviewFeatures,
  signatures,
  activeSignatureId,
  onSelectSignature,
  onSaveSignature,
}: {
  document: DocumentRecord;
  viewer: ViewerState;
  annotations: Annotation[];
  canUseReviewFeatures: boolean;
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onCanvasAnnotation: (request: CanvasAnnotationRequest) => void;
  onUnlockReviewFeatures: () => void;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  onSelectSignature: (signatureId: string) => void;
  onSaveSignature: (value: string) => void;
}) {
  return (
    <MobileSafeArea>
      <View
        style={mobileStyles.shell}
        testID="mobile-viewer-screen">
        <MobileTopBar
          title={document.title}
          subtitle={`Page ${viewer.pageIndex + 1} of ${document.pageCount}`}
          onBack={onBack}
          actionLabel="Compare"
          onAction={onCompare}
        />
        <View style={mobileStyles.viewerToolbar}>
          <MobileButton
            label="−"
            testID="mobile-zoom-out"
            onPress={() =>
              onViewerAction({type: 'setZoom', zoom: viewer.zoom - 0.1})
            }
          />
          <Text testID="mobile-zoom-label" style={mobileStyles.zoomLabel}>
            {Math.round(viewer.zoom * 100)}%
          </Text>
          <MobileButton
            label="+"
            testID="mobile-zoom-in"
            onPress={() =>
              onViewerAction({type: 'setZoom', zoom: viewer.zoom + 0.1})
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={mobileStyles.viewerToolRail}
            contentContainerStyle={mobileStyles.viewerToolScroller}>
            <MobileButton
              label="Highlight"
              icon="🖍"
              primary
              testID="mobile-highlight"
              onPress={() => onSelectTool('highlight')}
            />
            <MobileButton
              label="Note"
              icon="💬"
              testID="mobile-note"
              onPress={() => onSelectTool('comment')}
            />
            <MobileButton
              label="Draw"
              icon="✏️"
              testID="mobile-draw"
              onPress={() => onSelectTool('pen')}
            />
            <MobileButton
              label="Sign"
              icon="✍️"
              testID="mobile-signature"
              onPress={() => onSelectTool('signature')}
            />
          </ScrollView>
        </View>
        <View style={mobileStyles.mobileCanvasFrame}>
          <PdfCanvas
            document={document}
            viewer={viewer}
            annotations={annotations}
            compact
            onCreateAnnotation={onCanvasAnnotation}
            onPageChange={pageIndex =>
              onViewerAction({type: 'setPage', pageIndex})
            }
          />
        </View>
        <View style={mobileStyles.pageControls}>
          <MobileButton
            label="Previous"
            icon="‹"
            testID="mobile-page-previous"
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})
            }
          />
          <Text testID="mobile-page-label" style={mobileStyles.pageLabel}>
            {viewer.pageIndex + 1} / {viewer.pageCount}
          </Text>
          <MobileButton
            label="Next"
            icon="›"
            primary
            testID="mobile-page-next"
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})
            }
          />
        </View>
        <ScrollView
          testID="mobile-detail-panel"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={mobileStyles.detailPanel}>
          <Text style={mobileStyles.sectionTitle}>Information</Text>
          <InfoGrid document={document} />
          {viewer.activeTool === 'signature' ? (
            <SignatureManager
              signatures={signatures}
              activeSignatureId={activeSignatureId}
              onSelectSignature={onSelectSignature}
              onSaveSignature={onSaveSignature}
            />
          ) : null}
          <View style={mobileStyles.mobileCommentsHeader}>
            <Text style={mobileStyles.sectionTitle}>Comments</Text>
            <Text style={mobileStyles.headerMeta}>{annotations.length}</Text>
          </View>
          {canUseReviewFeatures ? (
            <CommentsPanel annotations={annotations} />
          ) : (
            <ReviewFeatureGate
              annotationsCount={annotations.length}
              onUnlock={onUnlockReviewFeatures}
              mobile
            />
          )}
        </ScrollView>
      </View>
    </MobileSafeArea>
  );
}

function MobileCompare({
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
    <MobileSafeArea>
      <View
        style={mobileStyles.shell}
        testID="mobile-compare-screen">
        <MobileTopBar
          title="Compare"
          subtitle={`${leftDocument.title} vs ${rightDocument.title}`}
          onBack={onBack}
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={mobileStyles.compareContent}>
          <View style={mobileStyles.compareStats}>
            <ChangeStat label="Added" value={summary.added} tone="green" />
            <ChangeStat label="Removed" value={summary.removed} tone="red" />
            <ChangeStat
              label="Modified"
              value={summary.modified}
              tone="amber"
            />
          </View>
          <View style={mobileStyles.mobileCanvasFrameSmall}>
            <Text style={mobileStyles.comparePaneLabel}>Version 1.0</Text>
            <PdfCanvas
              document={leftDocument}
              viewer={viewer}
              annotations={annotations}
              compact
            />
          </View>
          <View style={mobileStyles.mobileCanvasFrameSmall}>
            <Text style={mobileStyles.comparePaneLabel}>Version 1.1</Text>
            <PdfCanvas
              document={rightDocument}
              viewer={viewer}
              annotations={[]}
              compact
            />
          </View>
          <View style={mobileStyles.pageControls}>
            <MobileButton
              label="Previous"
              onPress={() =>
                onViewerAction({
                  type: 'setPage',
                  pageIndex: viewer.pageIndex - 1,
                })
              }
            />
            <Text style={mobileStyles.pageLabel}>
              Page {viewer.pageIndex + 1}
            </Text>
            <MobileButton
              label="Next"
              primary
              onPress={() =>
                onViewerAction({
                  type: 'setPage',
                  pageIndex: viewer.pageIndex + 1,
                })
              }
            />
          </View>
          <Text style={mobileStyles.sectionTitle}>
            {summary.totalChanges} changes
          </Text>
          {summary.pages.map(page => (
            <View
              key={`${page.pageIndex}-${page.status}`}
              style={mobileStyles.changeRow}>
              <View style={[styles.changeDot, changeDotStyle(page.status)]} />
              <View style={mobileStyles.changeText}>
                <Text style={styles.rowTitle}>Page {page.pageIndex + 1}</Text>
                <Text style={styles.rowText}>{page.title}</Text>
              </View>
              <Text style={styles.rowText}>{page.changeCount}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </MobileSafeArea>
  );
}

function MobileSafeArea({children}: {children: React.ReactNode}) {
  const Root =
    Platform.OS === 'ios' && !isJestRuntime() ? SafeAreaView : View;

  return <Root style={mobileStyles.safeArea}>{children}</Root>;
}

function MobileTopBar({
  title,
  subtitle,
  onBack,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={mobileStyles.topBar}>
      <MobileButton label="Library" icon="▣" onPress={onBack} />
      <View style={mobileStyles.topBarTitle}>
        <SelectableText
          numberOfLines={1}
          testID="mobile-title-document-name"
          selectable
          style={mobileStyles.readerTitle}>
          {title}
        </SelectableText>
        <Text numberOfLines={1} style={mobileStyles.headerMeta}>
          {subtitle}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <MobileButton
          label={actionLabel}
          icon={actionLabel === 'Compare' ? '⇄' : undefined}
          primary
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}

function SelectableText({children, ...props}: TextProps) {
  return (
    <Text {...props} selectable>
      {children}
    </Text>
  );
}

function MobileDocumentCard({
  document,
  selected,
  onPress,
}: {
  document: DocumentRecord;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`mobile-doc-card-${document.id}`}
      accessible
      accessibilityLabel={`Open ${document.title}`}
      accessibilityRole="button"
      style={[
        mobileStyles.documentCard,
        selected && mobileStyles.documentCardSelected,
      ]}
      onPress={onPress}>
      <PdfCover document={document} large />
      <Text numberOfLines={2} style={mobileStyles.documentTitle}>
        {document.title}
      </Text>
      <Text style={mobileStyles.documentMeta}>
        {document.pageCount} pages - {document.sizeMb.toFixed(1)} MB
      </Text>
    </Pressable>
  );
}

function MobileDocumentRow({
  document,
  tags,
  selected,
  onPress,
}: {
  document: DocumentRecord;
  tags: Tag[];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`mobile-doc-row-${document.id}`}
      accessible
      accessibilityLabel={`Open ${document.title}`}
      accessibilityRole="button"
      style={[mobileStyles.documentRow, selected && mobileStyles.rowSelected]}
      onPress={onPress}>
      <PdfCover document={document} />
      <View style={mobileStyles.documentRowBody}>
        <Text numberOfLines={1} style={mobileStyles.rowTitle}>
          {document.title}
        </Text>
        <Text numberOfLines={1} style={mobileStyles.documentMeta}>
          {document.author} - {formatShortDate(document.modifiedAt)}
        </Text>
        <View style={styles.inlineTags}>
          {document.tags.slice(0, 2).map(tagId => {
            const tag = tags.find(item => item.id === tagId);
            return tag ? <TagPill key={tag.id} tag={tag} /> : null;
          })}
        </View>
      </View>
      <Text style={mobileStyles.openChevron}>{'>'}</Text>
    </Pressable>
  );
}

function MobileTagButton({
  label,
  active = false,
  icon,
  count,
  tone,
  testID,
  onPress,
}: {
  label: string;
  active?: boolean;
  icon?: string;
  count?: number;
  tone?: TagTone;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        count === undefined ? label : `${label}, ${formatDocumentCount(count)}`
      }
      style={[mobileStyles.tagButton, active && mobileStyles.tagButtonActive]}
      onPress={onPress}>
      {icon ? <Text style={mobileStyles.tagIcon}>{icon}</Text> : null}
      {tone ? <View style={[styles.tagDot, toneStyle(tone)]} /> : null}
      <Text
        style={[
          mobileStyles.tagText,
          active && mobileStyles.tagTextActive,
        ]}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={[mobileStyles.tagCount, active && mobileStyles.tagCountActive]}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MobileButton({
  label,
  icon,
  primary = false,
  testID,
  onPress,
}: {
  label: string;
  icon?: string;
  primary?: boolean;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        mobileStyles.button,
        primary && mobileStyles.buttonPrimary,
        pressed && styles.buttonPressed,
      ]}
      onPress={onPress}>
      {icon ? (
        <Text
          style={[
            mobileStyles.buttonIcon,
            primary && mobileStyles.buttonTextPrimary,
          ]}>
          {icon}
        </Text>
      ) : null}
      <Text
        style={[
          mobileStyles.buttonText,
          primary && mobileStyles.buttonTextPrimary,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TitleBar({
  mode,
  selectedDocument,
  documentCount,
  query,
  onQueryChange,
  onSearchSubmit,
  onBack,
  onForward,
  onOpenFile,
}: {
  mode: ScreenMode;
  selectedDocument: DocumentRecord;
  documentCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit: (query?: string) => void | Promise<void>;
  onBack: () => void;
  onForward: () => void;
  onOpenFile: () => void;
}) {
  const isLibrary = mode === 'library';

  return (
    <View style={styles.titleBar}>
      {isLibrary ? (
        <View style={styles.titleBlock}>
          <Text style={styles.titleText}>Library</Text>
          <Text style={styles.titleMeta}>{documentCount} documents</Text>
        </View>
      ) : (
        <View style={styles.readerTitleBlock}>
          <ButtonChrome
            label="Back"
            icon="⬅️"
            onPress={onBack}
            quiet
            compact
            testID="title-back-button"
            accessibilityLabel="Back to library"
          />
          <ButtonChrome
            label="Forward"
            icon="➡️"
            onPress={onForward}
            quiet
            compact
            testID="title-forward-button"
            accessibilityLabel="Forward"
          />
          <View>
            <SelectableText
              testID="title-document-name"
              selectable
              style={styles.titleText}>
              {selectedDocument.title}
            </SelectableText>
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
        accessibilityLabel={isLibrary ? 'Library search box' : 'Document search box'}>
        <Text style={styles.searchIcon}>🔎</Text>
        <TextInput
          testID={isLibrary ? 'library-search-input' : 'document-search-input'}
          accessibilityLabel={isLibrary ? 'Library search' : 'Document search'}
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={event => onSearchSubmit(event.nativeEvent.text)}
          placeholder={
            isLibrary
              ? 'Search title, author, tag, collection'
              : 'Search this document'
          }
          placeholderTextColor="#7A8393"
          style={styles.searchInput}
        />
      </View>
      {isLibrary ? (
        <ButtonChrome
          label="Open PDF"
          icon="📂"
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
  scopeCounts,
  documents,
  continueReading,
  filterPanelOpen,
  storageUsedGb,
  storageLimitGb,
  canShowStorage,
  onFilterChange,
  onClearFilters,
  onToggleFilterPanel,
  onAddCollection,
  onSelectScope,
  onSelectDocument,
  onOpenDocument,
  onAddTag,
  onToggleFavorite,
  onShare,
  onOpenFile,
  onCompare,
}: {
  filter: LibraryFilter;
  selectedDocument: DocumentRecord;
  stateTags: Tag[];
  collections: Collection[];
  scopeCounts: ScopeCounts;
  documents: DocumentRecord[];
  continueReading: DocumentRecord[];
  filterPanelOpen: boolean;
  storageUsedGb: number;
  storageLimitGb: number;
  canShowStorage: boolean;
  onFilterChange: (patch: Partial<LibraryFilter>) => void;
  onClearFilters: () => void;
  onToggleFilterPanel: () => void;
  onAddCollection: () => void;
  onSelectScope: (scope: LibraryScope) => void;
  onSelectDocument: (document: DocumentRecord) => void;
  onOpenDocument: (document: DocumentRecord) => void;
  onAddTag: () => void;
  onToggleFavorite: (document: DocumentRecord) => void;
  onShare: (document: DocumentRecord) => void;
  onOpenFile: () => void;
  onCompare: () => void;
}) {
  const filterCount = activeFilterCount(filter);
  const sectionTitle = librarySectionTitle(filter.scope);

  return (
    <View
      style={styles.body}
      testID="library-screen"
      accessible
      accessibilityLabel="Library screen">
      <Sidebar
        tags={stateTags}
        collections={collections}
        scopeCounts={scopeCounts}
        selectedScope={filter.scope}
        selectedTagId={filter.tagId}
        selectedCollectionId={filter.collectionId}
        storageUsedGb={storageUsedGb}
        storageLimitGb={storageLimitGb}
        canShowStorage={canShowStorage}
        onSelectScope={onSelectScope}
        onSelectTag={tagId => onFilterChange({scope: 'library', tagId})}
        onSelectCollection={collectionId =>
          onFilterChange({scope: 'library', collectionId})
        }
        onAddCollection={onAddCollection}
      />
      <ScrollView style={styles.libraryMain}>
        <View style={styles.libraryToolbar}>
          <SegmentedControl
            value={filter.viewMode}
            options={[
              {label: '▦ Grid', value: 'grid'},
              {label: '☰ List', value: 'list'},
            ]}
            onChange={value =>
              onFilterChange({viewMode: value as LibraryFilter['viewMode']})
            }
            testIDPrefix="view-mode"
          />
          <View style={styles.toolbarRight}>
            <ButtonChrome
              label={`Sort: ${sortLabel(filter.sortBy)}`}
              icon="🧭"
              onPress={() => onFilterChange({sortBy: nextSort(filter.sortBy)})}
              testID="sort-last-opened-button"
              tooltip="Cycle library sorting"
            />
            <ButtonChrome
              label={filterCount > 0 ? `Filters (${filterCount})` : 'Filters'}
              icon="🎛️"
              onPress={onToggleFilterPanel}
              active={filterPanelOpen}
              testID="filter-button"
              accessibilityLabel={
                filterCount > 0
                  ? `Filters, ${filterCount} active`
                  : 'Filters'
              }
              tooltip="Show tag and collection filters"
            />
            <ButtonChrome
              label="Open PDF"
              icon="📂"
              onPress={onOpenFile}
              primary
              testID="toolbar-open-file-button"
            />
          </View>
        </View>
        {filterPanelOpen ? (
          <FilterPanel
            filter={filter}
            tags={stateTags}
            collections={collections}
            onFilterChange={onFilterChange}
            onClearFilters={onClearFilters}
          />
        ) : null}
        <LibraryResultsSummary
          filter={filter}
          tags={stateTags}
          collections={collections}
          resultCount={documents.length}
          onClearFilters={onClearFilters}
        />
        <Text style={styles.sectionTitle}>Continue Reading</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.cardRow}>
            {continueReading.map(document => (
              <DocumentCard
                key={document.id}
                document={document}
                selected={selectedDocument.id === document.id}
                onPress={() => onOpenDocument(document)}
                onOpen={() => onSelectDocument(document)}
              />
            ))}
          </View>
        </ScrollView>
        <View style={styles.recentHeader}>
          <Text
            testID="library-section-title"
            accessibilityLabel={sectionTitle}
            style={styles.sectionTitle}>
            {sectionTitle}
          </Text>
          <ButtonChrome
            label="Compare"
            icon="↔️"
            onPress={onCompare}
            testID="library-compare-button"
          />
        </View>
        {documents.length === 0 ? (
          <LibraryEmptyState
            onClearFilters={onClearFilters}
            onOpenFile={onOpenFile}
          />
        ) : filter.viewMode === 'grid' ? (
          <View style={styles.recentGrid} testID="recent-grid">
            {documents.map(document => (
              <DocumentCard
                key={document.id}
                document={document}
                selected={selectedDocument.id === document.id}
                onPress={() => onOpenDocument(document)}
                onOpen={() => onSelectDocument(document)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.table} testID="recent-table">
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
                onPress={() => onOpenDocument(document)}
                onOpen={() => onSelectDocument(document)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <LibraryInspector
        document={selectedDocument}
        tags={stateTags}
        onOpen={() => onOpenDocument(selectedDocument)}
        onAddTag={onAddTag}
        onShare={() => onShare(selectedDocument)}
        onToggleFavorite={() => onToggleFavorite(selectedDocument)}
        onCompare={onCompare}
      />
    </View>
  );
}

function LibraryResultsSummary({
  filter,
  tags,
  collections,
  resultCount,
  onClearFilters,
}: {
  filter: LibraryFilter;
  tags: Tag[];
  collections: Collection[];
  resultCount: number;
  onClearFilters: () => void;
}) {
  const title = librarySectionTitle(filter.scope);
  const chips = getActiveFilterChips(filter, tags, collections);
  const hasActiveFilters = chips.length > 0;

  return (
    <View
      testID="library-results-summary"
      accessible
      accessibilityLabel="Library results summary"
      style={styles.summaryStrip}>
      <Text style={styles.summaryIcon}>{scopeIcon(filter.scope)}</Text>
      <View style={styles.summaryBody}>
        <Text
          testID="library-results-summary-text"
          accessible
          accessibilityLabel={`Showing ${formatDocumentCount(resultCount)} in ${title}`}
          style={styles.summaryText}>
          {`Showing ${formatDocumentCount(resultCount)} in ${title}`}
        </Text>
        {hasActiveFilters ? (
          <View style={styles.summaryChips}>
            {chips.map(chip => (
              <Text key={chip} style={styles.summaryChip}>
                {chip}
              </Text>
            ))}
            <Pressable
              testID="clear-summary-filters"
              accessible
              accessibilityLabel="Clear active filters"
              accessibilityRole="button"
              {...tooltipProps('Clear active filters')}
              onPress={onClearFilters}>
              <Text style={styles.summaryClear}>Clear</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.summaryHint}>
            Use search, tags, or collections to narrow the workspace.
          </Text>
        )}
      </View>
    </View>
  );
}

function LibraryEmptyState({
  onClearFilters,
  onOpenFile,
}: {
  onClearFilters: () => void;
  onOpenFile: () => void;
}) {
  return (
    <View
      testID="library-empty-state"
      accessible
      accessibilityLabel="No documents found"
      style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>🔎</Text>
      <Text style={styles.emptyStateTitle}>No documents found</Text>
      <Text style={styles.emptyStateCopy}>
        Try a broader search, clear the active filters, or import a local PDF.
      </Text>
      <View style={styles.emptyStateActions}>
        <ButtonChrome
          label="Clear Filters"
          icon="🧹"
          onPress={onClearFilters}
          testID="clear-empty-state-filters"
          flush
        />
        <ButtonChrome
          label="Open PDF"
          icon="📂"
          onPress={onOpenFile}
          primary
          testID="empty-state-open-file"
        />
      </View>
    </View>
  );
}

function ViewerScreen({
  document,
  documents,
  tags,
  viewer,
  annotations,
  canUseReviewFeatures,
  signatures,
  activeSignatureId,
  onBack,
  onCompare,
  onViewerAction,
  onSelectTool,
  onCanvasAnnotation,
  onAddBookmark,
  onUnlockReviewFeatures,
  onSelectSignature,
  onSaveSignature,
  onExport,
}: {
  document: DocumentRecord;
  documents: DocumentRecord[];
  tags: Tag[];
  viewer: ViewerState;
  annotations: Annotation[];
  canUseReviewFeatures: boolean;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onCanvasAnnotation: (request: CanvasAnnotationRequest) => void;
  onAddBookmark: () => void;
  onUnlockReviewFeatures: () => void;
  onSelectSignature: (id: string) => void;
  onSaveSignature: (value: string) => void;
  onExport: (format: 'png' | 'jpg' | 'text' | 'annotated') => void;
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
        onSelectTool={onSelectTool}
      />
      <View style={styles.readerBody} testID="reader-body">
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
          onCreateAnnotation={onCanvasAnnotation}
          onPageChange={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
        />
        <ViewerInspector
          document={document}
          documents={documents}
          tags={tags}
          viewer={viewer}
          annotations={annotations}
          canUseReviewFeatures={canUseReviewFeatures}
          signatures={signatures}
          activeSignatureId={activeSignatureId}
          onAction={onViewerAction}
          onSelectTool={onSelectTool}
          onAddBookmark={onAddBookmark}
          onUnlockReviewFeatures={onUnlockReviewFeatures}
          onSelectSignature={onSelectSignature}
          onSaveSignature={onSaveSignature}
          onExport={onExport}
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
  syncedScroll,
  onBack,
  onToggleSyncedScroll,
  onViewerAction,
  onViewChangeReport,
}: {
  leftDocument: DocumentRecord;
  rightDocument: DocumentRecord;
  summary: CompareSummary;
  viewer: ViewerState;
  annotations: Annotation[];
  syncedScroll: boolean;
  onBack: () => void;
  onToggleSyncedScroll: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onViewChangeReport: () => void;
}) {
  return (
    <View
      style={styles.readerShell}
      testID="compare-screen"
      accessible
      accessibilityLabel={`Compare screen ${leftDocument.title}`}>
      <View style={styles.readerToolbar} testID="compare-toolbar">
        <ButtonChrome
          label="Library"
          icon="🗂️"
          onPress={onBack}
          testID="compare-library-button"
        />
        <ButtonChrome
          label="Compare"
          icon="↔️"
          onPress={() => onViewerAction({type: 'setInspectorTab', tab: 'changes'})}
          primary
          testID="compare-mode-button"
        />
        <ButtonChrome
          label={syncedScroll ? 'Sync On' : 'Sync Off'}
          icon={syncedScroll ? '🔗' : '○'}
          onPress={onToggleSyncedScroll}
          testID="sync-scroll-button"
        />
        <View style={styles.pageStepper}>
          <ButtonChrome
            label="Previous page"
            icon="◀️"
            compact
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})
            }
            testID="compare-page-previous"
          />
          <Text style={styles.stepperText}>
            {viewer.pageIndex + 1} / {leftDocument.pageCount}
          </Text>
          <ButtonChrome
            label="Next page"
            icon="▶️"
            compact
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})
            }
            testID="compare-page-next"
          />
        </View>
      </View>
      <View style={styles.readerBody} testID="compare-reader-body">
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
        <ChangesPanel summary={summary} onViewReport={onViewChangeReport} />
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
  scopeCounts,
  selectedScope,
  selectedTagId,
  selectedCollectionId,
  storageUsedGb,
  storageLimitGb,
  canShowStorage,
  onSelectScope,
  onSelectTag,
  onSelectCollection,
  onAddCollection,
}: {
  tags: Tag[];
  collections: Collection[];
  scopeCounts: ScopeCounts;
  selectedScope: LibraryScope;
  selectedTagId: string;
  selectedCollectionId: string;
  storageUsedGb: number;
  storageLimitGb: number;
  canShowStorage: boolean;
  onSelectScope: (scope: LibraryScope) => void;
  onSelectTag: (tagId: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onAddCollection: () => void;
}) {
  return (
    <View style={styles.sidebar}>
      <NavItem
        label="Library"
        icon="📚"
        count={scopeCounts.library}
        accessibilityLabel={`Library, ${formatDocumentCount(scopeCounts.library)}`}
        active={selectedScope === 'library'}
        onPress={() => onSelectScope('library')}
        testID="nav-library"
      />
      <NavItem
        label="Recent"
        icon="🕘"
        count={scopeCounts.recent}
        accessibilityLabel={`Recent, ${formatDocumentCount(scopeCounts.recent)}`}
        active={selectedScope === 'recent'}
        onPress={() => onSelectScope('recent')}
        testID="nav-recent"
      />
      <NavItem
        label="Favorites"
        icon="⭐"
        count={scopeCounts.favorites}
        accessibilityLabel={`Favorites, ${formatDocumentCount(scopeCounts.favorites)}`}
        active={selectedScope === 'favorites'}
        onPress={() => onSelectScope('favorites')}
        testID="nav-favorites"
      />
      <NavItem
        label="Shared"
        icon="📤"
        count={scopeCounts.shared}
        accessibilityLabel={`Shared, ${formatDocumentCount(scopeCounts.shared)}`}
        active={selectedScope === 'shared'}
        onPress={() => onSelectScope('shared')}
        testID="nav-shared"
      />
      <View style={styles.sidebarRule} />
      <Text style={styles.sidebarCaption}>Tags</Text>
      {tags.map(tag => (
        <Pressable
          key={tag.id}
          testID={`tag-filter-${tag.id}`}
          accessible
          accessibilityLabel={`Filter by ${tag.label}`}
          accessibilityRole="button"
          style={styles.sidebarTag}
          onPress={() => onSelectTag(tag.id)}>
          <Text style={styles.sidebarEmoji}>{tagEmoji(tag.id)}</Text>
          <Text
            style={[
              styles.sidebarText,
              selectedTagId === tag.id && styles.sidebarTextActive,
            ]}>
            {tag.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        testID="all-tags-filter"
        accessible
        accessibilityLabel="Show all tags"
        accessibilityRole="button"
        style={styles.sidebarTag}
        onPress={() => onSelectTag('all')}>
        <Text style={styles.sidebarEmoji}>🏷️</Text>
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
        <Pressable
          testID="add-collection-button"
          accessible
          accessibilityLabel="Add collection"
          accessibilityRole="button"
          {...tooltipProps('Add a local collection')}
          onPress={onAddCollection}>
          <Text style={styles.addText}>＋</Text>
        </Pressable>
      </View>
      {collections.map(collection => (
        <Pressable
          key={collection.id}
          testID={`collection-${collection.id}`}
          accessible
          accessibilityLabel={`Collection ${collection.label} ${collection.count} documents`}
          accessibilityRole="button"
          style={styles.collectionItem}
          onPress={() => onSelectCollection(collection.id)}>
          <Text
            style={[
              styles.sidebarText,
              selectedCollectionId === collection.id &&
                styles.sidebarTextActive,
            ]}>
            📁 {collection.label}
          </Text>
          <Text style={styles.collectionCount}>{collection.count}</Text>
        </Pressable>
      ))}
      <Pressable
        testID="all-collections-filter"
        accessible
        accessibilityLabel="Show all collections"
        accessibilityRole="button"
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
      {canShowStorage ? (
      <View style={styles.storageBlock} testID="account-storage-usage">
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
      ) : null}
    </View>
  );
}

function FilterPanel({
  filter,
  tags,
  collections,
  onFilterChange,
  onClearFilters,
}: {
  filter: LibraryFilter;
  tags: Tag[];
  collections: Collection[];
  onFilterChange: (patch: Partial<LibraryFilter>) => void;
  onClearFilters: () => void;
}) {
  return (
    <View
      testID="filter-panel"
      style={styles.filterPanel}
      accessible
      accessibilityLabel="Library filters">
      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Tags</Text>
        <ButtonChrome
          label="All"
          icon="🏷️"
          compact={false}
          active={filter.tagId === 'all'}
          onPress={() => onFilterChange({tagId: 'all'})}
          testID="filter-tag-all"
        />
        {tags.map(tag => (
          <ButtonChrome
            key={tag.id}
            label={tag.label}
            icon={tagEmoji(tag.id)}
            active={filter.tagId === tag.id}
            onPress={() => onFilterChange({scope: 'library', tagId: tag.id})}
            testID={`filter-tag-${tag.id}`}
          />
        ))}
      </View>
      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Collections</Text>
        <ButtonChrome
          label="All"
          icon="🗂️"
          active={filter.collectionId === 'all'}
          onPress={() => onFilterChange({collectionId: 'all'})}
          testID="filter-collection-all"
        />
        {collections.slice(0, 4).map(collection => (
          <ButtonChrome
            key={collection.id}
            label={`${collection.label} (${collection.count})`}
            icon="📁"
            active={filter.collectionId === collection.id}
            onPress={() =>
              onFilterChange({scope: 'library', collectionId: collection.id})
            }
            testID={`filter-collection-${collection.id}`}
          />
        ))}
      </View>
      <ButtonChrome
        label="Clear"
        icon="🧹"
        onPress={onClearFilters}
        testID="clear-filters-button"
        tooltip="Clear all library filters"
      />
    </View>
  );
}

function NavItem({
  label,
  icon,
  count,
  accessibilityLabel,
  active = false,
  onPress,
  testID,
}: {
  label: string;
  icon: string;
  count?: number;
  accessibilityLabel?: string;
  active?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        (count === undefined ? label : `${label}, ${formatDocumentCount(count)}`)
      }
      accessibilityRole="button"
      style={[styles.navItem, active && styles.navItemActive]}
      onPress={onPress}>
      <Text style={[styles.navIcon, active && styles.navTextActive]}>
        {icon}
      </Text>
      <View style={styles.navTextBlock}>
        <Text style={[styles.navText, active && styles.navTextActive]}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text style={[styles.navCount, active && styles.navCountActive]}>
            {count}
          </Text>
        ) : null}
      </View>
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
      {large && document.progress > 0 ? (
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
  onAddTag,
  onShare,
  onToggleFavorite,
  onCompare,
}: {
  document: DocumentRecord;
  tags: Tag[];
  onOpen: () => void;
  onAddTag: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onCompare: () => void;
}) {
  return (
    <View style={styles.inspector}>
      <PdfCover document={document} large />
      <SelectableText
        testID="library-inspector-title"
        selectable
        style={styles.inspectorTitle}>
        {document.title}
      </SelectableText>
      <Text style={styles.inspectorSub}>
        PDF Document - {document.pageCount} pages
      </Text>
      <Text style={styles.inspectorCaption}>Tags</Text>
      <View style={styles.inlineTags}>
        {document.tags.map(tagId => {
          const tag = tags.find(item => item.id === tagId);
          return tag ? <TagPill key={tag.id} tag={tag} /> : null;
        })}
        <Pressable
          testID="add-tag-button"
          accessible
          accessibilityLabel="Add tag"
          accessibilityRole="button"
          {...tooltipProps('Add the next useful tag')}
          onPress={onAddTag}>
          <Text style={styles.addTag}>＋ Tag</Text>
        </Pressable>
      </View>
      <InfoGrid document={document} />
      <Text style={styles.inspectorCaption}>Quick Actions</Text>
      <ActionRow
        label="Open"
        icon="↗"
        onPress={onOpen}
        testID="inspector-open-action"
      />
      <ActionRow
        label="Share"
        icon="⇧"
        onPress={onShare}
        testID="inspector-share-action"
      />
      <ActionRow
        label={document.favorite ? 'Remove Favorite' : 'Add to Favorites'}
        icon="★"
        onPress={onToggleFavorite}
        testID="inspector-favorite-action"
      />
      <ActionRow
        label="Compare Versions"
        icon="⇄"
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
  onSelectTool,
}: {
  viewer: ViewerState;
  onBack: () => void;
  onCompare: () => void;
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
}) {
  const tools: Array<{label: string; icon: string; value: ViewerTool}> = [
    {label: 'Select', icon: '↖️', value: 'select'},
    {label: 'Hand', icon: '✋', value: 'pan'},
    {label: 'Text', icon: 'A', value: 'text'},
    {label: 'Highlight', icon: '🖍', value: 'highlight'},
    {label: 'Comment', icon: '💬', value: 'comment'},
    {label: 'Pen', icon: '✏️', value: 'pen'},
    {label: 'Sign', icon: '✍️', value: 'signature'},
  ];

  return (
    <View style={styles.readerToolbar} testID="reader-toolbar">
      <ButtonChrome
        label="Library"
        icon="🗂️"
        onPress={onBack}
        compact
        testID="viewer-library-button"
        accessibilityLabel="Back to library"
        tooltip="Back to library"
      />
      <ButtonChrome
        label="Zoom out"
        icon="−"
        compact
        onPress={() => onAction({type: 'setZoom', zoom: viewer.zoom - 0.1})}
        testID="viewer-zoom-out"
        accessibilityLabel="Zoom out"
      />
      <Text testID="viewer-zoom-label" style={styles.zoomText}>
        {Math.round(viewer.zoom * 100)}%
      </Text>
      <ButtonChrome
        label="Zoom in"
        icon="+"
        compact
        onPress={() => onAction({type: 'setZoom', zoom: viewer.zoom + 0.1})}
        testID="viewer-zoom-in"
        accessibilityLabel="Zoom in"
      />
      <View style={styles.pageStepper}>
        <ButtonChrome
        label="Previous page"
        icon="◀️"
        compact
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
        label="Next page"
        icon="▶️"
        compact
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
            icon={tool.icon}
            compact
            onPress={() => onSelectTool(tool.value)}
            active={viewer.activeTool === tool.value}
            testID={`tool-${tool.value}`}
            accessibilityLabel={`${tool.label} tool`}
            tooltip={`${tool.label} tool`}
          />
        ))}
      </View>
      <ButtonChrome
        label="Compare"
        icon="↔️"
        onPress={onCompare}
        primary
        compact
        testID="viewer-compare-button"
        accessibilityLabel="Compare versions"
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
  const pages = thumbnailPages(document.pageCount, pageIndex, compare);

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

function thumbnailPages(
  pageCount: number,
  pageIndex: number,
  compare = false,
) {
  const maxCompactPages = compare ? 5 : 7;
  const safePageCount = Math.max(0, pageCount);

  if (safePageCount <= maxCompactPages) {
    return Array.from({length: safePageCount}, (_, index) => index);
  }

  const screenshotAnchors = compare
    ? [0, 1, 7, 8, 9]
    : [0, 1, 7, 8, 9, 11, 12];
  const currentCluster = [pageIndex - 1, pageIndex, pageIndex + 1];

  return Array.from(new Set([...screenshotAnchors, ...currentCluster]))
    .filter(page => page >= 0 && page < safePageCount)
    .sort((left, right) => left - right);
}

function ViewerInspector({
  document,
  documents,
  tags,
  viewer,
  annotations,
  canUseReviewFeatures,
  signatures,
  activeSignatureId,
  onAction,
  onSelectTool,
  onAddBookmark,
  onUnlockReviewFeatures,
  onSelectSignature,
  onSaveSignature,
  onExport,
}: {
  document: DocumentRecord;
  documents: DocumentRecord[];
  tags: Tag[];
  viewer: ViewerState;
  annotations: Annotation[];
  canUseReviewFeatures: boolean;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onAddBookmark: () => void;
  onUnlockReviewFeatures: () => void;
  onSelectSignature: (id: string) => void;
  onSaveSignature: (value: string) => void;
  onExport: (format: 'png' | 'jpg' | 'text' | 'annotated') => void;
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
        <ScrollView
          testID="inspector-scroll"
          style={styles.inspectorScroll}
          contentContainerStyle={styles.inspectorScrollContent}>
          {canUseReviewFeatures ? (
            <CommentsPanel annotations={annotations} />
          ) : (
            <ReviewFeatureGate
              annotationsCount={annotations.length}
              onUnlock={onUnlockReviewFeatures}
            />
          )}
        </ScrollView>
      ) : (
        <ScrollView
          testID="inspector-scroll"
          style={styles.inspectorScroll}
          contentContainerStyle={styles.inspectorScrollContent}>
          <View style={styles.documentIdentity}>
            <PdfCover document={document} />
            <View style={styles.identityText}>
              <SelectableText
                testID="viewer-inspector-title"
                selectable
                style={styles.inspectorTitle}>
                {document.title}
              </SelectableText>
              <Text style={styles.inspectorSub}>
                PDF Document - {document.pageCount} pages
              </Text>
            </View>
          </View>
          <InfoGrid document={document} />
          <Text style={styles.inspectorCaption}>Export</Text>
          <ActionRow
            label="Export as PNG"
            icon="▧"
            onPress={() => onExport('png')}
            testID="export-png-action"
          />
          <ActionRow
            label="Export as JPG"
            icon="▧"
            onPress={() => onExport('jpg')}
            testID="export-jpg-action"
          />
          <ActionRow
            label="Export as Text"
            icon="Aa"
            onPress={() => onExport('text')}
            testID="export-text-action"
          />
          <ActionRow
            label="Export Annotated PDF"
            icon="🧾"
            onPress={() => onExport('annotated')}
            testID="export-annotated-action"
          />
          {viewer.activeTool === 'signature' ? (
            <SignatureManager
              signatures={signatures}
              activeSignatureId={activeSignatureId}
              onSelectSignature={onSelectSignature}
              onSaveSignature={onSaveSignature}
            />
          ) : null}
          <Text style={styles.inspectorCaption}>Quick Actions</Text>
          <ActionRow
            label="Add Note"
            icon="💬"
            badge={!canUseReviewFeatures ? 'Pro' : undefined}
            onPress={() => onSelectTool('comment')}
            testID="quick-action-add-note"
          />
          <ActionRow
            label="Highlight Text"
            icon="🖍"
            onPress={() => onSelectTool('highlight')}
            testID="quick-action-highlight"
          />
          <ActionRow
            label="Draw"
            icon="✏️"
            onPress={() => onSelectTool('pen')}
            testID="quick-action-draw"
          />
          <ActionRow
            label="Add Signature"
            icon="✍️"
            onPress={() => onSelectTool('signature')}
            testID="quick-action-signature"
          />
          <ActionRow
            label="Add Bookmark"
            icon="🔖"
            onPress={onAddBookmark}
            testID="quick-action-bookmark"
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
        </ScrollView>
      )}
    </View>
  );
}

function ChangesPanel({
  summary,
  onViewReport,
}: {
  summary: CompareSummary;
  onViewReport: () => void;
}) {
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
        icon="▤"
        onPress={onViewReport}
        testID="view-change-report-button"
      />
    </View>
  );
}

function ReviewFeatureGate({
  annotationsCount,
  onUnlock,
  mobile = false,
}: {
  annotationsCount: number;
  onUnlock: () => void;
  mobile?: boolean;
}) {
  return (
    <View
      testID="comments-paywall"
      accessible
      accessibilityLabel="Sign in to unlock comments"
      style={[styles.paywallCard, mobile && mobileStyles.paywallCard]}>
      <Text style={styles.paywallIcon}>💬</Text>
      <Text style={styles.paywallTitle}>Sign in to unlock comments</Text>
      <Text style={styles.paywallCopy}>
        Comments, notes, and review threads are included with Acacia Pro.
        {annotationsCount > 0
          ? ` ${annotationsCount} local item${annotationsCount === 1 ? '' : 's'} will appear after sign-in.`
          : ''}
      </Text>
      {mobile ? (
        <MobileButton
          label="Sign in"
          icon="↗"
          primary
          onPress={onUnlock}
          testID="unlock-comments-button"
        />
      ) : (
        <ButtonChrome
          label="Sign in"
          icon="↗"
          primary
          flush
          onPress={onUnlock}
          testID="unlock-comments-button"
        />
      )}
    </View>
  );
}

function SignatureManager({
  signatures,
  activeSignatureId,
  onSelectSignature,
  onSaveSignature,
}: {
  signatures: SignatureProfile[];
  activeSignatureId: string;
  onSelectSignature: (id: string) => void;
  onSaveSignature: (value: string) => void;
}) {
  const activeSignature =
    signatures.find(signature => signature.id === activeSignatureId) ??
    signatures[0];
  const [draft, setDraft] = useState(activeSignature?.value ?? '');

  useEffect(() => {
    setDraft(activeSignature?.value ?? '');
  }, [activeSignature?.value]);

  return (
    <View
      testID="signature-manager"
      style={styles.signaturePanel}
      accessible
      accessibilityLabel="Signature manager">
      <Text style={styles.inspectorCaption}>Signature</Text>
      <TextInput
        testID="signature-name-input"
        accessibilityLabel="Signature text"
        value={draft}
        onChangeText={setDraft}
        placeholder="Type your signature"
        placeholderTextColor="#7A8393"
        style={styles.signatureInput}
      />
      <View style={styles.signaturePreview}>
        <Text style={styles.signaturePreviewText}>{draft || 'Signature'}</Text>
      </View>
      <View style={styles.signatureRows}>
        {signatures.map(signature => (
          <Pressable
            key={signature.id}
            testID={`signature-option-${signature.id}`}
            accessible
            accessibilityLabel={`Use ${signature.label}`}
            accessibilityRole="button"
            {...tooltipProps(`Use ${signature.label}`)}
            style={[
              styles.signatureChip,
              signature.id === activeSignatureId && styles.signatureChipActive,
            ]}
            onPress={() => onSelectSignature(signature.id)}>
            <Text
              style={[
                styles.signatureChipText,
                signature.id === activeSignatureId &&
                  styles.signatureChipTextActive,
              ]}>
              {signature.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ButtonChrome
        label="Save Signature"
        icon="💾"
        onPress={() => onSaveSignature(draft)}
        testID="save-signature-button"
        tooltip="Save this signature for stamping"
      />
      <Text style={styles.signatureHint}>
        Select the signature tool, then click the page to stamp it.
      </Text>
    </View>
  );
}

function CommentsPanel({annotations}: {annotations: Annotation[]}) {
  const [filter, setFilter] = useState<CommentAnnotationFilter>('all');
  const visibleAnnotations = annotations.filter(annotation =>
    commentFilterMatchesAnnotation(filter, annotation),
  );

  return (
    <ScrollView
      testID="comments-panel"
      contentContainerStyle={styles.commentsPanel}>
      <View style={styles.commentFilterRow}>
        <TagLike
          label={`All ${annotations.length}`}
          active={filter === 'all'}
          testID="comment-filter-all"
          onPress={() => setFilter('all')}
        />
        <TagLike
          label={`Highlights ${countAnnotationsByKind(annotations, 'highlight')}`}
          active={filter === 'highlight'}
          testID="comment-filter-highlights"
          onPress={() => setFilter('highlight')}
        />
        <TagLike
          label={`Notes ${countAnnotationsByKind(annotations, 'note')}`}
          active={filter === 'note'}
          testID="comment-filter-notes"
          onPress={() => setFilter('note')}
        />
        <TagLike
          label={`Drawings ${countAnnotationsByKind(annotations, 'drawing')}`}
          active={filter === 'drawing'}
          testID="comment-filter-drawings"
          onPress={() => setFilter('drawing')}
        />
        <TagLike
          label={`Signatures ${countAnnotationsByKind(annotations, 'signature')}`}
          active={filter === 'signature'}
          testID="comment-filter-signatures"
          onPress={() => setFilter('signature')}
        />
      </View>
      {visibleAnnotations.length === 0 ? (
        <Text style={styles.emptyText}>No comments on this page yet.</Text>
      ) : (
        visibleAnnotations.map((annotation, index) => {
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
              <View style={[styles.annotationTypeDot, {backgroundColor: annotation.color}]}>
                <Text style={styles.annotationTypeIcon}>
                  {annotationIcon(annotation)}
                </Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentMetaRow}>
                  <Text style={styles.commentAuthor}>
                    {annotationLabel(annotation)}
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

function commentFilterMatchesAnnotation(
  filter: CommentAnnotationFilter,
  annotation: Annotation,
) {
  if (filter === 'all') {
    return true;
  }

  return annotation.kind === filter;
}

function countAnnotationsByKind(
  annotations: Annotation[],
  kind: Annotation['kind'],
) {
  return annotations.filter(annotation => annotation.kind === kind).length;
}

function annotationCopyForRequest(
  request: CanvasAnnotationRequest,
  signatureValue?: string,
) {
  switch (request.kind) {
    case 'signature':
      return signatureValue ?? 'Signature';
    case 'note':
      return `Local note on page ${request.pageIndex + 1}`;
    case 'drawing':
      return `Local drawing on page ${request.pageIndex + 1}`;
    case 'highlight':
    default:
      return 'Local non-destructive highlight';
  }
}

function annotationColorForKind(kind: CanvasAnnotationRequest['kind']) {
  switch (kind) {
    case 'signature':
      return '#1F2937';
    case 'note':
      return '#A9CBFF';
    case 'drawing':
      return '#EF4444';
    case 'highlight':
    default:
      return '#F7D64A';
  }
}

function annotationLabel(annotation: Annotation) {
  switch (annotation.kind) {
    case 'highlight':
      return 'Highlight';
    case 'signature':
      return 'Signature';
    case 'bookmark':
      return 'Bookmark';
    case 'drawing':
      return 'Drawing';
    case 'note':
      return 'Note';
    default:
      return 'Review item';
  }
}

function annotationIcon(annotation: Annotation) {
  switch (annotation.kind) {
    case 'highlight':
      return '🖍';
    case 'signature':
      return '✍';
    case 'bookmark':
      return '🔖';
    case 'drawing':
      return '✏';
    case 'note':
      return '💬';
    default:
      return '•';
  }
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
  const steps = scrubberPages(viewer.pageCount, viewer.pageIndex);
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

function scrubberPages(pageCount: number, pageIndex: number) {
  const safePageCount = Math.max(0, pageCount);

  if (safePageCount <= 32) {
    return Array.from({length: safePageCount}, (_, index) => index);
  }

  const leadingPages = Array.from({length: 28}, (_, index) => index);
  const currentCluster = [pageIndex - 1, pageIndex, pageIndex + 1];
  const finalPage = safePageCount - 1;

  return Array.from(new Set([...leadingPages, ...currentCluster, finalPage]))
    .filter(page => page >= 0 && page < safePageCount)
    .sort((left, right) => left - right);
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
          <SelectableText
            testID={`info-value-${slugify(label)}`}
            selectable
            style={styles.infoValue}>
            {value}
          </SelectableText>
        </View>
      ))}
    </View>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ActionRow({
  label,
  icon,
  badge,
  onPress,
  testID,
}: {
  label: string;
  icon?: string;
  badge?: string;
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
      accessibilityHint={label}
      {...tooltipProps(label)}
      accessibilityRole="button">
      <View style={styles.actionTextGroup}>
        {icon ? <Text style={styles.actionIcon}>{icon}</Text> : null}
        <Text style={styles.actionLabel}>{label}</Text>
      </View>
      {badge ? <Text style={styles.actionBadge}>{badge}</Text> : null}
      <Text style={styles.actionChevron}>{'>'}</Text>
    </Pressable>
  );
}

function ButtonChrome({
  label,
  icon,
  onPress,
  primary = false,
  quiet = false,
  active = false,
  compact = false,
  flush = false,
  testID,
  accessibilityLabel,
  tooltip,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  primary?: boolean;
  quiet?: boolean;
  active?: boolean;
  compact?: boolean;
  flush?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  tooltip?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={tooltip ?? accessibilityLabel ?? label}
      accessibilityRole="button"
      {...tooltipProps(tooltip ?? accessibilityLabel ?? label)}
      style={({pressed}) => [
        styles.button,
        primary && styles.buttonPrimary,
        quiet && styles.buttonQuiet,
        active && styles.buttonActive,
        compact && styles.buttonCompact,
        flush && styles.buttonFlush,
        pressed && styles.buttonPressed,
      ]}
      onPress={onPress}>
      {icon ? (
        <Text
          style={[
            styles.buttonIcon,
            primary && styles.buttonTextPrimary,
            active && styles.buttonTextActive,
            compact && styles.buttonIconCompact,
          ]}>
          {icon}
        </Text>
      ) : null}
      {compact ? null : (
        <Text
          style={[
            styles.buttonText,
            primary && styles.buttonTextPrimary,
            active && styles.buttonTextActive,
          ]}>
          {label}
        </Text>
      )}
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
  onPress,
}: {
  label: string;
  active?: boolean;
  testID?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.commentFilter, active && styles.commentFilterActive]}>
      <Text style={[styles.commentFilterText, active && styles.commentFilterTextActive]}>
        {label}
      </Text>
    </Pressable>
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

function sortLabel(sortBy: LibrarySort) {
  switch (sortBy) {
    case 'modified':
      return 'Modified';
    case 'name':
      return 'Name';
    case 'size':
      return 'Size';
    case 'lastOpened':
    default:
      return 'Last Opened';
  }
}

function librarySectionTitle(scope: LibraryScope) {
  switch (scope) {
    case 'recent':
      return 'Recently Opened';
    case 'favorites':
      return 'Favorite Documents';
    case 'shared':
      return 'Shared Documents';
    case 'library':
    default:
      return 'Recent Documents';
  }
}

function mobileScopeLabel(scope: LibraryScope) {
  switch (scope) {
    case 'recent':
      return 'Recent';
    case 'favorites':
      return 'Favorites';
    case 'shared':
      return 'Shared';
    case 'library':
    default:
      return 'Library';
  }
}

function scopeIcon(scope: LibraryScope) {
  switch (scope) {
    case 'recent':
      return '🕘';
    case 'favorites':
      return '⭐';
    case 'shared':
      return '📤';
    case 'library':
    default:
      return '📚';
  }
}

function getScopeCounts(documents: DocumentRecord[]): ScopeCounts {
  return {
    library: documents.length,
    recent: documents.filter(document => document.lastOpenedAt).length,
    favorites: documents.filter(document => document.favorite).length,
    shared: documents.filter(document => document.shared).length,
  };
}

function activeFilterCount(filter: LibraryFilter) {
  return getActiveFilterChips(filter, [], []).length;
}

function getActiveFilterChips(
  filter: LibraryFilter,
  tags: Tag[],
  collections: Collection[],
) {
  const chips: string[] = [];
  const query = filter.query.trim();

  if (filter.scope !== 'library') {
    chips.push(librarySectionTitle(filter.scope));
  }

  if (query.length > 0) {
    chips.push(`Search: ${query}`);
  }

  if (filter.tagId !== 'all') {
    const tag = tags.find(item => item.id === filter.tagId);
    chips.push(tag ? `${tagEmoji(tag.id)} ${tag.label}` : `Tag: ${filter.tagId}`);
  }

  if (filter.collectionId !== 'all') {
    const collection = collections.find(item => item.id === filter.collectionId);
    chips.push(collection ? `📁 ${collection.label}` : `Collection: ${filter.collectionId}`);
  }

  return chips;
}

function formatDocumentCount(count: number) {
  return `${count} document${count === 1 ? '' : 's'}`;
}

function nextSort(sortBy: LibrarySort): LibrarySort {
  const order: LibrarySort[] = ['lastOpened', 'modified', 'name', 'size'];
  const index = order.indexOf(sortBy);

  return order[(index + 1) % order.length];
}

function nextCollectionLabel(collections: Collection[]) {
  const base = 'New Collection';
  if (!collections.some(collection => collection.label === base)) {
    return base;
  }

  let suffix = 2;
  while (
    collections.some(collection => collection.label === `${base} ${suffix}`)
  ) {
    suffix += 1;
  }

  return `${base} ${suffix}`;
}

function searchDemoDocument(document: DocumentRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const pages = demoSearchPages(document);

  return pages.find(page =>
    page.text.toLowerCase().includes(normalizedQuery),
  )?.pageIndex;
}

function demoSearchPages(document: DocumentRecord) {
  if (document.id === 'future-work') {
    return [
      {
        pageIndex: 0,
        text: 'Future of Work trends and insights executive summary',
      },
      {
        pageIndex: 11,
        text: 'The Hybrid Work Evolution hybrid work productivity culture autonomy',
      },
      {
        pageIndex: 12,
        text: 'Workforce planning operating model collaboration',
      },
    ];
  }

  return [
    {
      pageIndex: 0,
      text: `${document.title} ${document.author}`,
    },
    {
      pageIndex: 7,
      text: 'Market Overview global markets growth technology healthcare',
    },
    {
      pageIndex: 8,
      text: 'Revenue by Region market share investment inflows',
    },
  ];
}

function tagEmoji(tagId: string) {
  switch (tagId) {
    case 'work':
      return '💼';
    case 'finance':
      return '💹';
    case 'research':
      return '🔬';
    case 'personal':
      return '🏠';
    case 'marketing':
      return '📣';
    default:
      return '🏷️';
  }
}

function tooltipProps(label: string) {
  return Platform.OS === 'macos'
    ? ({tooltip: label} as Record<string, unknown>)
    : {};
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

function isJestRuntime() {
  const globals = globalThis as {it?: unknown; jest?: unknown};

  return typeof globals.it === 'function' || globals.jest !== undefined;
}

const styles = StyleSheet.create({
  window: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  titleBar: {
    position: 'relative',
    height: 64,
    backgroundColor: '#FBFBFD',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 3,
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
    height: 36,
    borderColor: '#CDD4DF',
    borderWidth: 1,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
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
    flexDirection: 'row',
    alignItems: 'center',
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
  navIcon: {
    width: 20,
    color: '#5D6676',
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
    textAlign: 'center',
  },
  navTextBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navCount: {
    minWidth: 22,
    color: '#697386',
    backgroundColor: '#ECEFF5',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  navCountActive: {
    color: '#1769E8',
    backgroundColor: '#FFFFFF',
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
  sidebarEmoji: {
    width: 22,
    color: '#4B5563',
    fontSize: 14,
    marginRight: 6,
    textAlign: 'center',
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
  filterPanel: {
    borderColor: '#D9E1EE',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 16,
  },
  summaryStrip: {
    minHeight: 52,
    borderColor: '#DCE4F2',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
    color: '#1769E8',
    backgroundColor: '#EAF1FF',
    fontSize: 17,
    lineHeight: 34,
    textAlign: 'center',
    marginRight: 12,
  },
  summaryBody: {
    flex: 1,
    minWidth: 0,
  },
  summaryText: {
    color: '#273040',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryStrong: {
    color: '#1769E8',
    fontWeight: '900',
  },
  summaryHint: {
    color: '#6A7484',
    fontSize: 11,
    marginTop: 3,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
  },
  summaryChip: {
    color: '#2E3746',
    backgroundColor: '#F0F4FA',
    borderColor: '#DEE6F1',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    marginRight: 6,
    marginBottom: 4,
  },
  summaryClear: {
    color: '#1769E8',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  filterLabel: {
    color: '#4D5665',
    fontSize: 11,
    fontWeight: '800',
    width: 76,
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
    marginBottom: 22,
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
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 30,
  },
  emptyState: {
    minHeight: 260,
    borderColor: '#DDE4EF',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    marginBottom: 30,
  },
  emptyStateIcon: {
    width: 44,
    height: 44,
    color: '#1769E8',
    backgroundColor: '#EAF1FF',
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 44,
    fontSize: 22,
    marginBottom: 14,
  },
  emptyStateTitle: {
    color: '#171B22',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyStateCopy: {
    color: '#5E6878',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 16,
  },
  emptyStateActions: {
    flexDirection: 'row',
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
  signaturePanel: {
    borderColor: '#DAE2EF',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 12,
  },
  signatureInput: {
    height: 34,
    borderColor: '#CDD4DF',
    borderWidth: 1,
    borderRadius: 7,
    color: '#1F2937',
    fontSize: 13,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  signaturePreview: {
    minHeight: 50,
    borderColor: '#E1E6EE',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FBFCFE',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  signaturePreviewText: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  signatureRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  signatureChip: {
    borderColor: '#D7DEE9',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  signatureChipActive: {
    borderColor: '#2E74F5',
    backgroundColor: '#EAF1FF',
  },
  signatureChipText: {
    color: '#4A5362',
    fontSize: 11,
    fontWeight: '700',
  },
  signatureChipTextActive: {
    color: '#1769E8',
  },
  signatureHint: {
    color: '#677184',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
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
  actionTextGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    width: 22,
    color: '#303746',
    fontSize: 14,
    fontWeight: '800',
    marginRight: 8,
    textAlign: 'center',
  },
  actionLabel: {
    color: '#47505F',
    fontSize: 12,
  },
  actionBadge: {
    color: '#1769E8',
    backgroundColor: '#EAF1FF',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
    marginRight: 8,
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
    flexDirection: 'row',
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
  buttonCompact: {
    minWidth: 34,
    paddingHorizontal: 8,
  },
  buttonFlush: {
    marginLeft: 0,
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
  buttonIcon: {
    color: '#303746',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 5,
    textAlign: 'center',
  },
  buttonIconCompact: {
    marginRight: 0,
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
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    zIndex: 0,
  },
  readerToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 54,
    backgroundColor: '#FAFBFD',
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 10,
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
    flexShrink: 0,
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
    flexShrink: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  readerBody: {
    position: 'absolute',
    top: 54,
    right: 0,
    bottom: 52,
    left: 0,
    flexDirection: 'row',
    overflow: 'hidden',
    zIndex: 0,
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
  inspectorScroll: {
    flex: 1,
  },
  inspectorScrollContent: {
    paddingBottom: 28,
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
  paywallCard: {
    borderColor: '#D9E2F5',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  paywallIcon: {
    width: 34,
    height: 34,
    color: '#1769E8',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 34,
    fontSize: 18,
    marginBottom: 12,
  },
  paywallTitle: {
    color: '#171B22',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  paywallCopy: {
    color: '#5C6676',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  commentFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  commentFilter: {
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
    borderColor: '#D8DEE8',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  commentFilterActive: {
    borderColor: '#AFC8FF',
    backgroundColor: '#EAF1FF',
  },
  commentFilterText: {
    color: '#4C5564',
    fontSize: 12,
    fontWeight: '700',
  },
  commentFilterTextActive: {
    color: '#1769E8',
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
    width: 24,
    height: 24,
    borderRadius: 6,
    marginTop: 1,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annotationTypeIcon: {
    color: '#111827',
    fontSize: 12,
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
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 52,
    backgroundColor: '#FAFBFD',
    borderTopColor: '#DADDE4',
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
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

const mobileStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  shell: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    backgroundColor: '#FBFBFD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appTitle: {
    color: '#121721',
    fontSize: 28,
    fontWeight: '900',
  },
  headerMeta: {
    color: '#687282',
    fontSize: 12,
    marginTop: 3,
  },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 42,
    borderColor: '#D7DCE5',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#18202D',
    fontSize: 15,
    padding: 0,
  },
  libraryContent: {
    padding: 16,
    paddingBottom: 32,
  },
  scopeScroller: {
    paddingBottom: 10,
  },
  tagScroller: {
    paddingBottom: 14,
  },
  tagButton: {
    height: 34,
    borderColor: '#D7DCE5',
    borderWidth: 1,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagButtonActive: {
    borderColor: '#2E74F5',
    backgroundColor: '#EAF1FF',
  },
  tagText: {
    color: '#3D4655',
    fontSize: 13,
    fontWeight: '700',
  },
  tagIcon: {
    color: '#2E3746',
    fontSize: 13,
    marginRight: 6,
  },
  tagCount: {
    minWidth: 21,
    color: '#647085',
    backgroundColor: '#EEF1F5',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    marginLeft: 7,
  },
  tagCountActive: {
    color: '#1769E8',
    backgroundColor: '#FFFFFF',
  },
  tagTextActive: {
    color: '#1769E8',
  },
  sectionHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#151B25',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 12,
  },
  resultsSummary: {
    color: '#5F6979',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
  },
  cardScroller: {
    paddingBottom: 20,
  },
  documentCard: {
    width: 142,
    minHeight: 236,
    marginRight: 14,
    borderColor: '#DFE4EC',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  documentCardSelected: {
    borderColor: '#2E74F5',
    backgroundColor: '#F4F8FF',
  },
  documentTitle: {
    color: '#18202D',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  documentMeta: {
    color: '#6C7584',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  documentList: {
    borderColor: '#DFE4EC',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  documentRow: {
    minHeight: 82,
    borderBottomColor: '#E6E9EF',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowSelected: {
    backgroundColor: '#F4F8FF',
  },
  documentRowBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowTitle: {
    color: '#17202D',
    fontSize: 15,
    fontWeight: '800',
  },
  openChevron: {
    color: '#6D7583',
    fontSize: 18,
    fontWeight: '800',
  },
  topBar: {
    minHeight: 68,
    borderBottomColor: '#DADDE4',
    borderBottomWidth: 1,
    backgroundColor: '#FBFBFD',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    marginHorizontal: 12,
  },
  readerTitle: {
    color: '#151B25',
    fontSize: 16,
    fontWeight: '900',
  },
  viewerToolbar: {
    height: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#E0E4EB',
    borderBottomWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  zoomLabel: {
    color: '#202938',
    fontSize: 13,
    fontWeight: '800',
    marginHorizontal: 10,
    minWidth: 42,
    textAlign: 'center',
  },
  toolbarSpacer: {
    flex: 1,
  },
  viewerToolRail: {
    flex: 1,
    marginLeft: 10,
  },
  viewerToolScroller: {
    gap: 8,
    alignItems: 'center',
    paddingRight: 2,
  },
  mobileCanvasFrame: {
    height: 430,
    margin: 12,
    borderColor: '#DADDE4',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ECEEF2',
  },
  mobileCanvasFrameSmall: {
    height: 320,
    borderColor: '#DADDE4',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ECEEF2',
    marginBottom: 12,
  },
  pageControls: {
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageLabel: {
    color: '#2E3746',
    fontSize: 14,
    fontWeight: '900',
  },
  detailPanel: {
    padding: 16,
    paddingBottom: 34,
  },
  mobileCommentsHeader: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  paywallCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  compareContent: {
    padding: 12,
    paddingBottom: 34,
  },
  compareStats: {
    borderColor: '#DADDE4',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginBottom: 12,
    flexDirection: 'row',
  },
  comparePaneLabel: {
    position: 'absolute',
    zIndex: 2,
    top: 10,
    left: 10,
    color: '#1769E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
  },
  changeRow: {
    minHeight: 58,
    borderBottomColor: '#E2E6EE',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  changeText: {
    flex: 1,
  },
  button: {
    minHeight: 34,
    borderColor: '#D7DCE5',
    borderWidth: 1,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonPrimary: {
    borderColor: '#2E74F5',
    backgroundColor: '#2E74F5',
  },
  buttonText: {
    color: '#303948',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonIcon: {
    color: '#303948',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 6,
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
});

export default App;
