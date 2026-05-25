import React, {useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {
  type AccessibilityActionEvent,
  AccessibilityInfo,
  Alert,
  Image,
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
import {
  type CanvasAnnotationRequest,
  PdfCanvas,
  type SearchHighlight,
} from './src/components/PdfCanvas';
import {ICON_PATHS, Icon, type IconName} from './src/components/Icon';
import {acacia} from './src/design/acaciaTheme';
import {
  compareDocumentText,
  createAnnotation,
  createInitialLibraryState,
  createInitialViewerState,
  createPersistedAppState,
  defaultLibraryFilter,
  getContinueReadingDocuments,
  getFilteredDocuments,
  APP_STATE_SIDECAR_ID,
  libraryReducer,
  mergeSeededDemoPdfsIntoPersistedState,
  parsePersistedAppState,
  serializePersistedAppState,
  shouldAllowLocalProUnlock,
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
  PdfRect,
  PersistedAccountState,
  PersistedSignatureProfile,
  Tag,
  TagTone,
  ViewerState,
  ViewerTool,
} from './src/domain';
import {
  type ImportedPdf,
  importedPdfToDocument,
  PdfKitBridge,
} from './src/native/PdfKitBridge';
import {
  createDefaultProAccountSynchronizer,
  createDefaultProPurchaseCoordinator,
  ProBackendError,
  type ProAccountSynchronizer,
  type ProPurchaseCoordinator,
  ProPurchaseUnavailableError,
} from './src/pro';

type ScreenMode = 'library' | 'viewer' | 'compare';
type ScreenshotMode =
  | 'library'
  | 'library-command'
  | 'viewer-info'
  | 'viewer-outline'
  | 'viewer-annotations'
  | 'comments'
  | 'compare';

type AppProps = {
  screenshotMode?: ScreenshotMode;
  forceCompactLayout?: boolean;
  isUiTestingLaunch?: boolean;
  isProPurchaseTestingLaunch?: boolean;
  proAccountSynchronizer?: ProAccountSynchronizer;
  proPurchaseCoordinator?: ProPurchaseCoordinator;
};

declare const require: (assetPath: string) => number;

const acaciaLogoSource = require('./ios/PDFViewer/Images.xcassets/AppIcon.appiconset/ios_marketing_icon_1024x1024.png');

type AccountState = PersistedAccountState;

type SignatureProfile = PersistedSignatureProfile;
type SearchHighlightSet = {
  documentId: string;
  query: string;
  highlights: SearchHighlight[];
};
type ExportFormat = 'png' | 'jpg' | 'text' | 'annotated' | 'markdown';

type ScopeCounts = Record<LibraryScope, number>;
type CommentAnnotationFilter =
  | 'all'
  | 'highlight'
  | 'note'
  | 'drawing'
  | 'signature';

const initialFilter: LibraryFilter = defaultLibraryFilter;

const libraryScopeOptions: LibraryScope[] = [
  'library',
  'recent',
  'favorites',
  'shared',
];

const highlightColorOptions = [
  {id: 'yellow', label: 'Yellow highlight', color: '#F7D64A'},
  {id: 'green', label: 'Green highlight', color: '#8CC79E'},
  {id: 'blue', label: 'Blue highlight', color: '#A7BAE8'},
  {id: 'rose', label: 'Rose highlight', color: '#E2A0B7'},
  {id: 'gray', label: 'Gray highlight', color: '#CFCFCB'},
] as const;

const controlHitSlop = {top: 8, right: 8, bottom: 8, left: 8};
const compactControlHitSlop = {top: 10, right: 10, bottom: 10, left: 10};
const expandedControlHitSlop = {top: 14, right: 14, bottom: 14, left: 14};
const pageAccessibilityActions = [
  {name: 'decrement', label: 'Previous page'},
  {name: 'increment', label: 'Next page'},
];

type AppleAccessibilityPreferences = {
  boldTextEnabled: boolean;
  grayscaleEnabled: boolean;
  invertColorsEnabled: boolean;
  reduceMotionEnabled: boolean;
  darkerSystemColorsEnabled: boolean;
  reduceTransparencyEnabled: boolean;
  screenReaderEnabled: boolean;
  prefersCrossFadeTransitions: boolean;
  fontScale: number;
  largeTextEnabled: boolean;
};

const defaultAppleAccessibilityPreferences: AppleAccessibilityPreferences = {
  boldTextEnabled: false,
  grayscaleEnabled: false,
  invertColorsEnabled: false,
  reduceMotionEnabled: false,
  darkerSystemColorsEnabled: false,
  reduceTransparencyEnabled: false,
  screenReaderEnabled: false,
  prefersCrossFadeTransitions: false,
  fontScale: 1,
  largeTextEnabled: false,
};

const AppleAccessibilityContext = React.createContext(
  defaultAppleAccessibilityPreferences,
);

function useAppleAccessibility() {
  return React.useContext(AppleAccessibilityContext);
}

function AppleAccessibilityProvider({
  preferences,
  children,
}: {
  preferences: AppleAccessibilityPreferences;
  children: React.ReactNode;
}) {
  return (
    <AppleAccessibilityContext.Provider value={preferences}>
      {children}
    </AppleAccessibilityContext.Provider>
  );
}

function useAppleAccessibilityPreferences(fontScale = 1) {
  const [preferences, setPreferences] =
    useState<AppleAccessibilityPreferences>(() => ({
      ...defaultAppleAccessibilityPreferences,
      fontScale,
      largeTextEnabled: fontScale >= 1.2,
    }));

  useEffect(() => {
    setPreferences(current => ({
      ...current,
      fontScale,
      largeTextEnabled: fontScale >= 1.2,
    }));
  }, [fontScale]);

  useEffect(() => {
    let isMounted = true;

    async function refreshPreferences() {
      const [
        boldTextEnabled,
        grayscaleEnabled,
        invertColorsEnabled,
        reduceMotionEnabled,
        darkerSystemColorsEnabled,
        reduceTransparencyEnabled,
        screenReaderEnabled,
        prefersCrossFadeTransitions,
      ] = await Promise.all([
        queryAccessibilityPreference('isBoldTextEnabled'),
        queryAccessibilityPreference('isGrayscaleEnabled'),
        queryAccessibilityPreference('isInvertColorsEnabled'),
        queryAccessibilityPreference('isReduceMotionEnabled'),
        queryAccessibilityPreference('isDarkerSystemColorsEnabled'),
        queryAccessibilityPreference('isReduceTransparencyEnabled'),
        queryAccessibilityPreference('isScreenReaderEnabled'),
        queryAccessibilityPreference('prefersCrossFadeTransitions'),
      ]);

      if (!isMounted) {
        return;
      }

      setPreferences(current => ({
        ...current,
        boldTextEnabled,
        grayscaleEnabled,
        invertColorsEnabled,
        reduceMotionEnabled,
        darkerSystemColorsEnabled,
        reduceTransparencyEnabled,
        screenReaderEnabled,
        prefersCrossFadeTransitions,
      }));
    }

    refreshPreferences().catch(() => {});

    const subscriptions = [
      addAccessibilityPreferenceListener('boldTextChanged', value =>
        setPreferenceIfMounted('boldTextEnabled', value),
      ),
      addAccessibilityPreferenceListener('grayscaleChanged', value =>
        setPreferenceIfMounted('grayscaleEnabled', value),
      ),
      addAccessibilityPreferenceListener('invertColorsChanged', value =>
        setPreferenceIfMounted('invertColorsEnabled', value),
      ),
      addAccessibilityPreferenceListener('reduceMotionChanged', value =>
        setPreferenceIfMounted('reduceMotionEnabled', value),
      ),
      addAccessibilityPreferenceListener('darkerSystemColorsChanged', value =>
        setPreferenceIfMounted('darkerSystemColorsEnabled', value),
      ),
      addAccessibilityPreferenceListener('reduceTransparencyChanged', value =>
        setPreferenceIfMounted('reduceTransparencyEnabled', value),
      ),
      addAccessibilityPreferenceListener('screenReaderChanged', value =>
        setPreferenceIfMounted('screenReaderEnabled', value),
      ),
    ];

    function setPreferenceIfMounted(
      key: keyof Omit<
        AppleAccessibilityPreferences,
        'fontScale' | 'largeTextEnabled' | 'prefersCrossFadeTransitions'
      >,
      value: boolean,
    ) {
      if (!isMounted) {
        return;
      }

      setPreferences(current => ({...current, [key]: value}));
    }

    return () => {
      isMounted = false;
      for (const subscription of subscriptions) {
        subscription?.remove();
      }
    };
  }, []);

  return preferences;
}

async function queryAccessibilityPreference(
  method:
    | 'isBoldTextEnabled'
    | 'isGrayscaleEnabled'
    | 'isInvertColorsEnabled'
    | 'isReduceMotionEnabled'
    | 'isDarkerSystemColorsEnabled'
    | 'isReduceTransparencyEnabled'
    | 'isScreenReaderEnabled'
    | 'prefersCrossFadeTransitions',
) {
  try {
    const query = AccessibilityInfo[method];
    return typeof query === 'function' ? await query() : false;
  } catch {
    return false;
  }
}

function addAccessibilityPreferenceListener(
  eventName:
    | 'boldTextChanged'
    | 'grayscaleChanged'
    | 'invertColorsChanged'
    | 'reduceMotionChanged'
    | 'darkerSystemColorsChanged'
    | 'reduceTransparencyChanged'
    | 'screenReaderChanged',
  handler: (value: boolean) => void,
) {
  try {
    return AccessibilityInfo.addEventListener(eventName, handler);
  } catch {
    return undefined;
  }
}

function applePlatformSupportsLargeContentViewer() {
  return Platform.OS === 'ios' || (Platform.OS as string) === 'macos';
}

function accessibilityControlHitSlop(
  preferences: AppleAccessibilityPreferences,
  compact = false,
) {
  if (preferences.largeTextEnabled || preferences.screenReaderEnabled) {
    return expandedControlHitSlop;
  }

  return compact ? compactControlHitSlop : controlHitSlop;
}

function pageAccessibilityActionHandler({
  pageIndex,
  pageCount,
  onPage,
}: {
  pageIndex: number;
  pageCount: number;
  onPage: (pageIndex: number) => void;
}) {
  return (event: AccessibilityActionEvent) => {
    const actionName = event.nativeEvent.actionName;

    if (actionName === 'increment' && pageIndex < pageCount - 1) {
      onPage(pageIndex + 1);
    }

    if (actionName === 'decrement' && pageIndex > 0) {
      onPage(pageIndex - 1);
    }
  };
}

const documentAccessibilityActions = [
  {name: 'activate', label: 'Open document'},
  {name: 'longpress', label: 'Show details'},
];

function documentAccessibilityActionHandler({
  onPress,
  onOpen,
}: {
  onPress: () => void;
  onOpen?: () => void;
}) {
  return (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'longpress' && onOpen) {
      onOpen();
      return;
    }

    onPress();
  };
}

function announceForAccessibility(message: string) {
  if (isJestRuntime()) {
    return;
  }

  if (typeof AccessibilityInfo.announceForAccessibilityWithOptions === 'function') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {queue: true});
    return;
  }

  AccessibilityInfo.announceForAccessibility(message);
}

function pageAccessibilityValue(pageIndex: number, pageCount: number) {
  const currentPage = pageIndex + 1;

  return {
    min: 1,
    max: pageCount,
    now: currentPage,
    text: `Page ${currentPage} of ${pageCount}`,
  };
}

function documentAccessibilityLabel(document: DocumentRecord) {
  const progress = Math.round(document.progress * 100);
  const progressCopy = progress > 0 ? `, ${progress}% read` : '';

  return `${document.title}, ${document.author}, ${document.pageCount} pages, ${document.sizeMb.toFixed(1)} MB${progressCopy}`;
}

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

function App({
  screenshotMode,
  forceCompactLayout = false,
  isUiTestingLaunch = false,
  isProPurchaseTestingLaunch = false,
  proAccountSynchronizer,
  proPurchaseCoordinator,
}: AppProps) {
  const isScreenshotLaunch = screenshotMode !== undefined;
  const initialScreenshotMode = screenshotMode ?? 'library';
  const [libraryState, dispatchLibrary] = useReducer(
    libraryReducer,
    createInitialLibraryState(),
  );
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    getInitialScreenMode(initialScreenshotMode),
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    getInitialDocumentId(initialScreenshotMode),
  );
  const selectedDocument =
    libraryState.documents.find(document => document.id === selectedDocumentId) ??
    libraryState.documents[0];
  const [viewerState, setViewerState] = useState<ViewerState>(() =>
    createInitialViewerStateForMode(selectedDocument, initialScreenshotMode),
  );
  const [annotations, setAnnotations] =
    useState<Annotation[]>(initialAnnotations);
  const [searchHighlightSet, setSearchHighlightSet] =
    useState<SearchHighlightSet | undefined>(undefined);
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
  const [highlightColor, setHighlightColor] = useState<string>(
    highlightColorOptions[0].color,
  );
  const [mobileAnnotationSheetOpen, setMobileAnnotationSheetOpen] =
    useState(false);
  const [accountState, setAccountState] = useState<AccountState>({
    signedIn: false,
    plan: 'free',
  });
  const [proUnlocking, setProUnlocking] = useState(false);
  const [compareSynced, setCompareSynced] = useState(true);
  const accountSynchronizer = useMemo(
    () => proAccountSynchronizer ?? createDefaultProAccountSynchronizer(),
    [proAccountSynchronizer],
  );
  const windowMetrics = useWindowDimensions();
  const appleAccessibility = useAppleAccessibilityPreferences(
    windowMetrics.fontScale ?? 1,
  );
  const menuOpenHandlerRef = useRef<(imported: ImportedPdf) => void>(() => {});
  const persistenceHydratedRef = useRef(false);
  const proActivationGenerationRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const viewerSearchTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const lastViewerSearchKeyRef = useRef('');
  const localIdSequenceRef = useRef(0);
  const lastPageAnnouncementRef = useRef({
    documentId: selectedDocumentId,
    pageIndex: viewerState.pageIndex,
  });
  const initialPersistedSnapshotRef = useRef<
    ReturnType<typeof createPersistedAppState> | undefined
  >(undefined);

  if (!initialPersistedSnapshotRef.current) {
    initialPersistedSnapshotRef.current = createPersistedAppState({
      libraryState,
      filter,
      screenMode,
      selectedDocumentId,
      viewerState,
      annotations,
      signatures,
      activeSignatureId,
      accountState,
      compareSynced,
    });
  }

  const visibleDocuments = useMemo(
    () => getFilteredDocuments(libraryState, filter),
    [filter, libraryState],
  );
  const commandPaletteDocuments = useMemo(
    () => getCommandPaletteDocuments(libraryState.documents, filter.query),
    [filter.query, libraryState.documents],
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
  const selectedSearchHighlights =
    searchHighlightSet?.documentId === selectedDocument.id &&
    searchHighlightSet.query === viewerState.searchQuery.trim()
      ? searchHighlightSet.highlights
      : [];
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

  useEffect(() => {
    if (screenMode === 'library') {
      return;
    }

    const previous = lastPageAnnouncementRef.current;
    if (
      previous.documentId === selectedDocument.id &&
      previous.pageIndex === viewerState.pageIndex
    ) {
      return;
    }

    lastPageAnnouncementRef.current = {
      documentId: selectedDocument.id,
      pageIndex: viewerState.pageIndex,
    };
    announceForAccessibility(
      `${selectedDocument.title}, page ${viewerState.pageIndex + 1} of ${selectedDocument.pageCount}`,
    );
  }, [
    screenMode,
    selectedDocument.id,
    selectedDocument.pageCount,
    selectedDocument.title,
    viewerState.pageIndex,
  ]);

  function updateViewer(action: Parameters<typeof viewerReducer>[1]) {
    setViewerState(current => viewerReducer(current, action));
  }

  function openDocument(document: DocumentRecord, mode: ScreenMode = 'viewer') {
    setSearchHighlightSet(undefined);
    dispatchLibrary({
      type: 'updateDocument',
      documentId: document.id,
      patch: {
        lastOpenedAt: new Date().toISOString(),
        progress: document.progress > 0 ? document.progress : 0.01,
      },
    });
    setSelectedDocumentId(document.id);
    announceForAccessibility(`Opened ${document.title}`);
    setViewerState(current =>
      current.documentId === document.id
        ? {
            ...current,
            pageCount: document.pageCount,
            pageIndex: Math.min(current.pageIndex, document.pageCount - 1),
            activeTool: 'select',
          }
        : createInitialViewerState(document.id, document.pageCount),
    );
    setScreenMode(mode);
  }

  function importDocument(imported: ImportedPdf) {
    const document = importedPdfToDocument(imported);
    dispatchLibrary({type: 'addDocument', document});
    openDocument(document);
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

      importDocument(imported);
    } catch (error) {
      Alert.alert(
        'Unable to open PDF',
        error instanceof Error ? error.message : 'The document could not open.',
      );
    }
  }

  function applySeededDemoPdfs(importedPdfs: ImportedPdf[]) {
    for (const imported of importedPdfs) {
      dispatchLibrary({
        type: 'updateDocument',
        documentId: imported.id,
        patch: {
          pageCount: imported.pageCount,
          sizeMb: imported.sizeMb,
          createdAt: imported.createdAt,
          modifiedAt: imported.modifiedAt,
          path: imported.path,
          bookmark: imported.bookmark,
        },
      });
    }
  }

  function applyPersistedState(state: ReturnType<typeof createPersistedAppState>) {
    dispatchLibrary({type: 'replaceState', state: state.libraryState});
    setFilter(state.filter);
    setScreenMode(state.screenMode);
    setSelectedDocumentId(state.selectedDocumentId);
    setViewerState(state.viewerState);
    setAnnotations(state.annotations);
    setSignatures(state.signatures);
    setActiveSignatureId(state.activeSignatureId);
    setAccountState(state.accountState);
    setCompareSynced(state.compareSynced);
  }

  function cachePageThumbnail(
    documentId: string,
    pageIndex: number,
    thumbnailPath: string,
  ) {
    const document = libraryState.documents.find(item => item.id === documentId);

    dispatchLibrary({
      type: 'updateDocument',
      documentId,
      patch: {
        pageThumbnailPaths: {
          ...(document?.pageThumbnailPaths ?? {}),
          [pageIndex]: thumbnailPath,
        },
      },
    });
  }

  menuOpenHandlerRef.current = importDocument;

  useEffect(() => {
    let isCancelled = false;

    async function hydrateAndSeed() {
      let activeState =
        initialPersistedSnapshotRef.current ?? createPersistedAppState();

      if (!isScreenshotLaunch) {
        try {
          const rawState = await PdfKitBridge.readSidecar(APP_STATE_SIDECAR_ID);
          const persisted = parsePersistedAppState(rawState);

          if (!isCancelled && persisted) {
            activeState = persisted;
            applyPersistedState(persisted);
          }
        } catch {
          // A corrupt or unavailable app-state sidecar should never block launch.
        }
      }

      try {
        const importedPdfs = await PdfKitBridge.seedDemoPdfs();
        if (!isCancelled && importedPdfs.length > 0) {
          const merged = mergeSeededDemoPdfsIntoPersistedState(
            activeState,
            importedPdfs,
          );
          applyPersistedState(merged);
        }
      } catch {
        if (!isCancelled && activeState.libraryState.documents.length === 0) {
          applySeededDemoPdfs([]);
        }
      } finally {
        if (!isCancelled) {
          persistenceHydratedRef.current = true;
          if (!isScreenshotLaunch) {
            const syncActivationGeneration = proActivationGenerationRef.current;
            accountSynchronizer
              .syncAccount()
              .then(result => {
                if (isCancelled || !result) {
                  return;
                }

                setAccountState(current => {
                  if (
                    proActivationGenerationRef.current !==
                      syncActivationGeneration &&
                    current.signedIn &&
                    current.plan === 'pro' &&
                    result.accountState.plan !== 'pro'
                  ) {
                    return current;
                  }
                  return result.accountState;
                });
                if (result.storageLimitGb !== undefined) {
                  dispatchLibrary({
                    type: 'setStorageQuota',
                    storageLimitGb: result.storageLimitGb,
                  });
                }
                if (result.storageUsedGb !== undefined) {
                  dispatchLibrary({
                    type: 'setStorageUsage',
                    storageUsedGb: result.storageUsedGb,
                  });
                }
              })
              .catch(() => {});
          }
        }
      }
    }

    hydrateAndSeed().catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [accountSynchronizer, isScreenshotLaunch]);

  useEffect(() => {
    if (!persistenceHydratedRef.current) {
      return;
    }

    if (isScreenshotLaunch) {
      return;
    }

    const save = () => {
      PdfKitBridge.writeSidecar(
        APP_STATE_SIDECAR_ID,
        serializePersistedAppState(
          createPersistedAppState({
            libraryState,
            filter,
            screenMode,
            selectedDocumentId,
            viewerState,
            annotations,
            signatures,
            activeSignatureId,
            accountState,
            compareSynced,
          }),
        ),
      ).catch(() => {});
    };

    if (isJestRuntime()) {
      save();
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(save, 250);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    accountState,
    activeSignatureId,
    annotations,
    compareSynced,
    filter,
    libraryState,
    screenMode,
    selectedDocumentId,
    isScreenshotLaunch,
    signatures,
    viewerState,
  ]);

  useEffect(() => {
    const subscription = PdfKitBridge.addOpenedPdfListener(imported => {
      menuOpenHandlerRef.current(imported);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  function selectViewerTool(tool: ViewerTool) {
    updateViewer({type: 'setTool', tool});
    announceForAccessibility(`${viewerToolLabel(tool)} selected`);

    if (tool === 'comment') {
      updateViewer({type: 'setInspectorTab', tab: 'comments'});
    }

    if (tool === 'signature') {
      updateViewer({type: 'setInspectorTab', tab: 'info'});
    }
  }

  function selectHighlightColor(color: string) {
    setHighlightColor(color);
    const option = highlightColorOptions.find(item => item.color === color);
    announceForAccessibility(`${option?.label ?? 'Highlight color'} selected`);
  }

  function nextLocalId(prefix: string) {
    const existingIds = new Set([
      ...annotations.map(annotation => annotation.id),
      ...signatures.map(signature => signature.id),
    ]);
    let candidate = '';

    do {
      localIdSequenceRef.current += 1;
      candidate = `${prefix}-${Date.now()}-${localIdSequenceRef.current}`;
    } while (existingIds.has(candidate));

    return candidate;
  }

  function addCanvasAnnotation(request: CanvasAnnotationRequest) {
    const signature = signatures.find(item => item.id === activeSignatureId) ?? signatures[0];
    const copy = annotationCopyForRequest(request, signature?.value);
    const annotation = createAnnotation({
      id: nextLocalId(request.kind),
      documentId: selectedDocument.id,
      pageIndex: request.pageIndex,
      kind: request.kind,
      color:
        request.kind === 'highlight'
          ? highlightColor
          : annotationColorForKind(request.kind),
      bounds: request.bounds,
      points: request.points,
      text: copy,
    });

    setAnnotations(current => [...current, annotation]);
    announceForAccessibility(
      `${annotationLabel(annotation)} added on page ${request.pageIndex + 1}`,
    );
    if (request.kind === 'highlight') {
      setMobileAnnotationSheetOpen(true);
    }
    setViewerState(current => {
      if (request.kind === 'signature') {
        return viewerReducer(current, {type: 'setInspectorTab', tab: 'info'});
      }

      if (current.activeTool === 'signature') {
        return current;
      }

      return viewerReducer(current, {type: 'setInspectorTab', tab: 'comments'});
    });
  }

  function addBookmark() {
    const annotation = createAnnotation({
      id: nextLocalId('bookmark'),
      documentId: selectedDocument.id,
      pageIndex: viewerState.pageIndex,
      kind: 'bookmark',
      color: '#2E74F5',
      bounds: {x: 88, y: 92, width: 24, height: 32},
      text: `Bookmark on page ${viewerState.pageIndex + 1}`,
    });

    setAnnotations(current => [...current, annotation]);
    announceForAccessibility(`Bookmark added on page ${viewerState.pageIndex + 1}`);
    updateViewer({type: 'setInspectorTab', tab: 'comments'});
  }

  async function activateReviewFeatures(action: 'purchase' | 'restore') {
    if (
      shouldAllowLocalProUnlock({
        isJestRuntime: isJestRuntime(),
        isScreenshotLaunch,
        isUiTestingLaunch,
        isProPurchaseTestingLaunch,
      })
    ) {
      setAccountState({signedIn: true, plan: 'pro'});
      return;
    }

    if (proUnlocking) {
      return;
    }

    setProUnlocking(true);

    try {
      const coordinator =
        proPurchaseCoordinator ?? createDefaultProPurchaseCoordinator();
      const result =
        action === 'restore'
          ? await coordinator.restorePro()
          : await coordinator.purchasePro();
      proActivationGenerationRef.current += 1;
      setAccountState(result.accountState);

      if (result.storageLimitGb !== undefined) {
        dispatchLibrary({
          type: 'setStorageQuota',
          storageLimitGb: result.storageLimitGb,
        });
      }

      Alert.alert(
        'Acacia Pro',
        action === 'restore'
          ? 'Pro has been restored on this account.'
          : 'Pro is active on this account.',
      );
    } catch (error) {
      Alert.alert('Acacia Pro', proPurchaseFailureMessage(error));
    } finally {
      setProUnlocking(false);
    }
  }

  async function unlockReviewFeatures() {
    await activateReviewFeatures('purchase');
  }

  async function restoreReviewFeatures() {
    await activateReviewFeatures('restore');
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
        id: nextLocalId('signature'),
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
        announceForAccessibility(`Opening first result, ${firstMatch.title}`);
        openDocument(firstMatch);
      } else {
        announceForAccessibility(`No library results for ${query}`);
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
        setSearchHighlightSet({
          documentId: selectedDocument.id,
          query,
          highlights: searchHighlightsFromMatches(selectedDocument, query, matches),
        });
        updateViewer({type: 'setPage', pageIndex: matches[0].pageIndex});
        announceForAccessibility(
          `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for ${query}`,
        );
      } else {
        setSearchHighlightSet(undefined);
        announceForAccessibility(`No matches for ${query}`);
      }
      return;
    }

    const demoMatch = searchDemoDocumentMatch(selectedDocument, query);
    if (demoMatch !== undefined) {
      setSearchHighlightSet({
        documentId: selectedDocument.id,
        query,
        highlights: [demoMatch.highlight],
      });
      updateViewer({type: 'setPage', pageIndex: demoMatch.pageIndex});
      announceForAccessibility(`1 match for ${query}`);
    } else {
      setSearchHighlightSet(undefined);
      announceForAccessibility(`No matches for ${query}`);
    }
  }

  useEffect(() => {
    if (screenMode === 'library') {
      lastViewerSearchKeyRef.current = '';
      setSearchHighlightSet(undefined);
      return;
    }

    const query = viewerState.searchQuery.trim();
    if (query.length < 2) {
      lastViewerSearchKeyRef.current = '';
      setSearchHighlightSet(undefined);
      return;
    }

    const searchKey = `${selectedDocument.id}:${selectedDocument.path ?? 'demo'}:${query}`;
    if (lastViewerSearchKeyRef.current === searchKey) {
      return;
    }
    lastViewerSearchKeyRef.current = searchKey;

    if (viewerSearchTimerRef.current) {
      clearTimeout(viewerSearchTimerRef.current);
    }

    let isCancelled = false;
    viewerSearchTimerRef.current = setTimeout(() => {
      async function runSearch() {
        if (selectedDocument.path) {
          const matches = await PdfKitBridge.search(
            selectedDocument.path,
            query,
            selectedDocument.bookmark,
          );
          if (!isCancelled && matches[0]) {
            setSearchHighlightSet({
              documentId: selectedDocument.id,
              query,
              highlights: searchHighlightsFromMatches(
                selectedDocument,
                query,
                matches,
              ),
            });
            setViewerState(current =>
              viewerReducer(current, {
                type: 'setPage',
                pageIndex: matches[0].pageIndex,
              }),
            );
          } else if (!isCancelled) {
            setSearchHighlightSet(undefined);
          }
          return;
        }

        const demoMatch = searchDemoDocumentMatch(selectedDocument, query);
        if (!isCancelled && demoMatch !== undefined) {
          setSearchHighlightSet({
            documentId: selectedDocument.id,
            query,
            highlights: [demoMatch.highlight],
          });
          setViewerState(current =>
            viewerReducer(current, {type: 'setPage', pageIndex: demoMatch.pageIndex}),
          );
        } else if (!isCancelled) {
          setSearchHighlightSet(undefined);
        }
      }

      runSearch().catch(() => {});
    }, 250);

    return () => {
      isCancelled = true;
      if (viewerSearchTimerRef.current) {
        clearTimeout(viewerSearchTimerRef.current);
      }
    };
  }, [
    screenMode,
    selectedDocument,
    selectedDocument.bookmark,
    selectedDocument.id,
    selectedDocument.path,
    viewerState.searchQuery,
  ]);

  function showLocalAction(title: string, message: string) {
    Alert.alert(title, message);
  }

  async function exportCurrentDocument(format: ExportFormat) {
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
      } else if (format === 'markdown') {
        outputPath = await PdfKitBridge.exportMarkdown(
          selectedDocument.path,
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
      <AppleAccessibilityProvider preferences={appleAccessibility}>
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
          searchHighlights={selectedSearchHighlights}
          annotationSheetOpen={mobileAnnotationSheetOpen}
          canUseReviewFeatures={canUseReviewFeatures}
          compareSummary={compareSummary}
          signatures={signatures}
          activeSignatureId={activeSignatureId}
          highlightColor={highlightColor}
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
          onDismissAnnotationSheet={() => setMobileAnnotationSheetOpen(false)}
          onUnlockReviewFeatures={unlockReviewFeatures}
          onRestoreReviewFeatures={restoreReviewFeatures}
          onSelectSignature={setActiveSignatureId}
          onSaveSignature={saveSignature}
          onSelectHighlightColor={selectHighlightColor}
        />
      </AppleAccessibilityProvider>
    );
  }

  const DesktopRoot =
    Platform.OS === 'ios' && !isJestRuntime() ? SafeAreaView : View;

  return (
    <AppleAccessibilityProvider preferences={appleAccessibility}>
      <DesktopRoot
        style={[
          styles.window,
          appleAccessibility.reduceTransparencyEnabled &&
            styles.accessibilityOpaqueSurface,
        ]}
        testID="app-window"
        accessible={false}
        accessibilityLabel="App window"
        accessibilityLanguage="en">
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
        {screenMode === 'library' && filter.query.trim().length > 0 ? (
          <CommandPalette
            query={filter.query}
            documents={commandPaletteDocuments}
            onOpenFile={openImportedPdf}
            onAddCollection={addCollection}
            onClose={() => setFilter(current => ({...current, query: ''}))}
            onAsk={() =>
              showLocalAction(
                'Ask across library',
                `Acacia can search titles, OCR, highlights, and notes for “${filter.query.trim()}”.`,
              )
            }
            onOpenDocument={document => openDocument(document)}
          />
        ) : null}
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
            canShowStorage={canUseReviewFeatures}
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
            onPageThumbnail={cachePageThumbnail}
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
            searchHighlights={selectedSearchHighlights}
            canUseReviewFeatures={canUseReviewFeatures}
            onBack={() => setScreenMode('library')}
            onCompare={() => setScreenMode('compare')}
            onViewerAction={updateViewer}
            onSelectTool={selectViewerTool}
            onCanvasAnnotation={addCanvasAnnotation}
            onAddBookmark={addBookmark}
            onPageThumbnail={cachePageThumbnail}
            onUnlockReviewFeatures={unlockReviewFeatures}
            onRestoreReviewFeatures={restoreReviewFeatures}
            signatures={signatures}
            activeSignatureId={activeSignatureId}
            highlightColor={highlightColor}
            onSelectSignature={setActiveSignatureId}
            onSaveSignature={saveSignature}
            onExport={exportCurrentDocument}
            onSelectHighlightColor={selectHighlightColor}
          />
        )}
      </DesktopRoot>
    </AppleAccessibilityProvider>
  );
}

function getInitialScreenMode(screenshotMode: ScreenshotMode): ScreenMode {
  if (screenshotMode === 'compare') {
    return 'compare';
  }

  if (
    screenshotMode === 'viewer-info' ||
    screenshotMode === 'viewer-outline' ||
    screenshotMode === 'viewer-annotations' ||
    screenshotMode === 'comments'
  ) {
    return 'viewer';
  }

  return 'library';
}

function getInitialDocumentId(screenshotMode: ScreenshotMode): string {
  if (screenshotMode === 'comments') {
    return 'future-work';
  }

  if (
    screenshotMode === 'viewer-outline' ||
    screenshotMode === 'viewer-annotations'
  ) {
    return 'product-roadmap';
  }

  return 'q4-market-analysis';
}

function createInitialViewerStateForMode(
  document: DocumentRecord,
  screenshotMode: ScreenshotMode,
): ViewerState {
  const state = createInitialViewerState(document.id, document.pageCount);

  if (
    screenshotMode === 'viewer-info' ||
    screenshotMode === 'viewer-outline' ||
    screenshotMode === 'viewer-annotations' ||
    screenshotMode === 'compare'
  ) {
    const inspectorTab =
      screenshotMode === 'viewer-outline'
        ? 'outline'
        : screenshotMode === 'viewer-annotations'
          ? 'annotations'
          : state.inspectorTab;
    return {
      ...state,
      pageIndex:
        screenshotMode === 'viewer-outline'
          ? Math.min(2, document.pageCount - 1)
          : Math.min(7, document.pageCount - 1),
      inspectorTab,
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
  searchHighlights,
  annotationSheetOpen,
  canUseReviewFeatures,
  compareSummary,
  signatures,
  activeSignatureId,
  highlightColor,
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
  onDismissAnnotationSheet,
  onUnlockReviewFeatures,
  onRestoreReviewFeatures,
  onSelectSignature,
  onSaveSignature,
  onSelectHighlightColor,
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
  searchHighlights: SearchHighlight[];
  annotationSheetOpen: boolean;
  canUseReviewFeatures: boolean;
  compareSummary: CompareSummary;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  highlightColor: string;
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
  onDismissAnnotationSheet: () => void;
  onUnlockReviewFeatures: () => void;
  onRestoreReviewFeatures: () => void;
  onSelectSignature: (signatureId: string) => void;
  onSaveSignature: (value: string) => void;
  onSelectHighlightColor: (color: string) => void;
}) {
  const shouldShowContinueReading =
    filter.scope === 'library' &&
    filter.query.trim().length === 0 &&
    filter.tagId === 'all' &&
    filter.collectionId === 'all';
  const sectionTitle = librarySectionTitle(filter.scope);
  const accessibility = useAppleAccessibility();

  if (screenMode === 'viewer') {
    return (
      <MobileViewer
        document={selectedDocument}
        viewer={viewer}
        annotations={annotations}
        searchHighlights={searchHighlights}
        annotationSheetOpen={annotationSheetOpen}
        canUseReviewFeatures={canUseReviewFeatures}
        onBack={onBack}
        onCompare={onCompare}
        onViewerAction={onViewerAction}
        onSelectTool={onSelectTool}
        onCanvasAnnotation={onCanvasAnnotation}
        onDismissAnnotationSheet={onDismissAnnotationSheet}
        onUnlockReviewFeatures={onUnlockReviewFeatures}
        onRestoreReviewFeatures={onRestoreReviewFeatures}
        signatures={signatures}
        activeSignatureId={activeSignatureId}
        highlightColor={highlightColor}
        onSelectSignature={onSelectSignature}
        onSaveSignature={onSaveSignature}
        onSelectHighlightColor={onSelectHighlightColor}
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
        style={[
          mobileStyles.shell,
          accessibility.reduceTransparencyEnabled &&
            styles.accessibilityOpaqueSurface,
        ]}
        testID="mobile-library-screen"
        accessibilityLabel="Mobile library screen"
        accessibilityLanguage="en">
        <View style={mobileStyles.header}>
          <View>
            <Text style={mobileStyles.appTitle}>Acacia</Text>
          </View>
          <MobileButton label="Open" icon="plus" primary onPress={onOpenFile} />
        </View>
        <View style={mobileStyles.searchBox}>
          <TextInput
            testID="mobile-library-search-input"
            accessibilityLabel="Search documents"
            accessibilityHint="Search by title, author, tag, or collection"
            accessibilityLanguage="en"
            maxFontSizeMultiplier={1.8}
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
              icon="tag"
              onPress={() => onFilterChange({scope: 'library', tagId: 'all'})}
            />
            {tags.map(tag => (
              <MobileTagButton
                key={tag.id}
                label={tag.label}
                active={filter.tagId === tag.id}
                tone={tag.tone}
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
                <Text style={mobileStyles.headerMeta}>{continueReading.length} in progress</Text>
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
  searchHighlights,
  annotationSheetOpen,
  canUseReviewFeatures,
  onBack,
  onCompare,
  onViewerAction,
  onSelectTool,
  onCanvasAnnotation,
  onDismissAnnotationSheet,
  onUnlockReviewFeatures,
  onRestoreReviewFeatures,
  signatures,
  activeSignatureId,
  highlightColor,
  onSelectSignature,
  onSaveSignature,
  onSelectHighlightColor,
}: {
  document: DocumentRecord;
  viewer: ViewerState;
  annotations: Annotation[];
  searchHighlights: SearchHighlight[];
  annotationSheetOpen: boolean;
  canUseReviewFeatures: boolean;
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onCanvasAnnotation: (request: CanvasAnnotationRequest) => void;
  onDismissAnnotationSheet: () => void;
  onUnlockReviewFeatures: () => void;
  onRestoreReviewFeatures: () => void;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  highlightColor: string;
  onSelectSignature: (signatureId: string) => void;
  onSaveSignature: (value: string) => void;
  onSelectHighlightColor: (color: string) => void;
}) {
  const accessibility = useAppleAccessibility();

  return (
    <MobileSafeArea>
      <View
        style={[
          mobileStyles.shell,
          accessibility.reduceTransparencyEnabled &&
            styles.accessibilityOpaqueSurface,
        ]}
        testID="mobile-viewer-screen"
        accessibilityLabel={`Mobile viewer, ${document.title}`}
        accessibilityLanguage="en"
        onAccessibilityEscape={onBack}
        onMagicTap={onCompare}>
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
            accessibilityLabel="Zoom out"
            accessibilityHint="Decreases the PDF zoom level"
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
            accessibilityLabel="Zoom in"
            accessibilityHint="Increases the PDF zoom level"
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
              icon="highlighter"
              primary
              active={viewer.activeTool === 'highlight'}
              testID="mobile-highlight"
              accessibilityLabel="Highlight tool"
              accessibilityHint="Selects the highlighter. Drag on the page or select text, then use Highlight."
              onPress={() => onSelectTool('highlight')}
            />
            {viewer.activeTool === 'highlight' ? (
              <HighlightPalette
                selectedColor={highlightColor}
                onSelectColor={onSelectHighlightColor}
                testIDPrefix="mobile-highlight-color"
                compact
              />
            ) : null}
            <MobileButton
              label="Note"
              icon="comment"
              testID="mobile-note"
              active={viewer.activeTool === 'comment'}
              accessibilityLabel="Note tool"
              accessibilityHint="Selects note placement on the page"
              onPress={() => onSelectTool('comment')}
            />
            <MobileButton
              label="Draw"
              icon="pen"
              testID="mobile-draw"
              active={viewer.activeTool === 'pen'}
              accessibilityLabel="Pen tool"
              accessibilityHint="Selects freehand drawing on the page"
              onPress={() => onSelectTool('pen')}
            />
            <MobileButton
              label="Sign"
              icon="signature"
              testID="mobile-signature"
              active={viewer.activeTool === 'signature'}
              accessibilityLabel="Signature tool"
              accessibilityHint="Selects signature stamping on the page"
              onPress={() => onSelectTool('signature')}
            />
          </ScrollView>
        </View>
        <View style={mobileStyles.mobileCanvasFrame}>
          <PdfCanvas
            document={document}
            viewer={viewer}
            annotations={annotations}
            searchHighlights={searchHighlights}
            signaturePreviewText={
              signatures.find(signature => signature.id === activeSignatureId)?.value
            }
            compact
            onCreateAnnotation={onCanvasAnnotation}
            onPageChange={pageIndex =>
              onViewerAction({type: 'setPage', pageIndex})
            }
          />
        </View>
        <View style={mobileStyles.pageControls}>
          <View style={mobileStyles.pageControlSlot}>
            <MobileButton
              label="Previous"
              icon="‹"
              testID="mobile-page-previous"
              accessibilityLabel="Previous page"
              accessibilityHint="Moves to the previous page"
              disabled={viewer.pageIndex <= 0}
              onPress={() =>
                onViewerAction({
                  type: 'setPage',
                  pageIndex: viewer.pageIndex - 1,
                })
              }
            />
          </View>
          <View
            testID="mobile-page-meter"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Current page"
            accessibilityActions={pageAccessibilityActions}
            accessibilityValue={pageAccessibilityValue(
              viewer.pageIndex,
              viewer.pageCount,
            )}
            accessibilityHint="Use Previous page and Next page to move through the document"
            accessibilityLiveRegion="polite"
            onAccessibilityAction={pageAccessibilityActionHandler({
              pageIndex: viewer.pageIndex,
              pageCount: viewer.pageCount,
              onPage: pageIndex =>
                onViewerAction({type: 'setPage', pageIndex}),
            })}
            style={mobileStyles.pageMeter}>
            <Text testID="mobile-page-label" style={mobileStyles.pageLabel}>
              <Text testID="mobile-page-current" style={mobileStyles.pageCurrent}>
                {viewer.pageIndex + 1}
              </Text>
              <Text style={mobileStyles.pageSlash}> / </Text>
              <Text style={mobileStyles.pageTotal}>{viewer.pageCount}</Text>
            </Text>
          </View>
          <View style={[mobileStyles.pageControlSlot, mobileStyles.pageControlSlotEnd]}>
            <MobileButton
              label="Next"
              icon="›"
              primary
              testID="mobile-page-next"
              accessibilityLabel="Next page"
              accessibilityHint="Moves to the next page"
              disabled={viewer.pageIndex >= viewer.pageCount - 1}
              onPress={() =>
                onViewerAction({
                  type: 'setPage',
                  pageIndex: viewer.pageIndex + 1,
                })
              }
            />
          </View>
        </View>
        <ScrollView
          testID="mobile-detail-panel"
          accessibilityElementsHidden={annotationSheetOpen}
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
              onRestore={onRestoreReviewFeatures}
              mobile
            />
          )}
        </ScrollView>
        {annotationSheetOpen ? (
          <MobileAnnotationSheet
            annotations={annotations}
            onClose={onDismissAnnotationSheet}
          />
        ) : null}
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
  const accessibility = useAppleAccessibility();

  return (
    <MobileSafeArea>
      <View
        style={[
          mobileStyles.shell,
          accessibility.reduceTransparencyEnabled &&
            styles.accessibilityOpaqueSurface,
        ]}
        testID="mobile-compare-screen"
        accessibilityLanguage="en"
        onAccessibilityEscape={onBack}>
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
            <Text
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Current comparison page"
              accessibilityActions={pageAccessibilityActions}
              accessibilityValue={pageAccessibilityValue(
                viewer.pageIndex,
                leftDocument.pageCount,
              )}
              accessibilityHint="Use Previous page and Next page to move both comparison panes"
              accessibilityLiveRegion="polite"
              onAccessibilityAction={pageAccessibilityActionHandler({
                pageIndex: viewer.pageIndex,
                pageCount: leftDocument.pageCount,
                onPage: pageIndex =>
                  onViewerAction({type: 'setPage', pageIndex}),
              })}
              style={mobileStyles.pageLabel}>
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

function MobileAnnotationSheet({
  annotations,
  onClose,
}: {
  annotations: Annotation[];
  onClose: () => void;
}) {
  const accessibility = useAppleAccessibility();
  const highlight =
    annotations.find(annotation => annotation.kind === 'highlight') ??
    annotations[annotations.length - 1];
  const excerpt =
    highlight?.text && highlight.text !== 'Local non-destructive highlight'
      ? highlight.text
      : 'Customer behavior has shifted: enterprises are no longer evaluating AI in isolation...';

  return (
    <View
      testID="mobile-annotation-sheet"
      accessible={false}
      accessibilityLabel="Annotation actions"
      accessibilityViewIsModal
      accessibilityLanguage="en"
      onAccessibilityEscape={onClose}
      style={[
        mobileStyles.annotationSheet,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityReducedShadow,
      ]}>
      <View style={mobileStyles.sheetGrabber} />
      <View style={mobileStyles.sheetQuoteRow}>
        <View style={mobileStyles.sheetAccent} />
        <Text style={mobileStyles.sheetQuote}>“{excerpt}”</Text>
        <Pressable
          testID="mobile-annotation-close"
          accessible
          accessibilityRole="button"
          accessibilityLabel="Close annotation actions"
          onPress={onClose}
          style={mobileStyles.sheetClose}>
          <Icon name="close" size={15} color={acacia.color.ink2} />
        </Pressable>
      </View>
      <View style={mobileStyles.annotationSwatches}>
        {[
          acacia.color.yellow,
          acacia.color.green,
          acacia.color.blue,
          acacia.color.rose,
          acacia.color.gray,
        ].map((color, index) => (
          <View
            key={color}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[
              mobileStyles.annotationSwatch,
              {backgroundColor: color},
              index === 0 && mobileStyles.annotationSwatchActive,
            ]}
          />
        ))}
      </View>
      <View style={mobileStyles.sheetActions}>
        <MobileButton
          label="Note"
          icon="comment"
          testID="mobile-annotation-note"
          onPress={() => {}}
        />
        <MobileButton
          label="Ask"
          icon="sparkles"
          testID="mobile-annotation-ask"
          onPress={() => {}}
        />
        <MobileButton
          label="Link"
          icon="link"
          testID="mobile-annotation-link"
          onPress={() => {}}
        />
        <MobileButton
          label="Share"
          icon="share"
          testID="mobile-annotation-share"
          onPress={() => {}}
        />
      </View>
      <View style={mobileStyles.sheetTags}>
        <Text style={styles.tagPill}>TL;DR</Text>
        <Text style={styles.tagPill}>Tone</Text>
        <Text style={styles.addTag}>+ Tag</Text>
      </View>
    </View>
  );
}

function MobileSafeArea({children}: {children: React.ReactNode}) {
  const Root =
    Platform.OS === 'ios' && !isJestRuntime() ? SafeAreaView : View;
  const accessibility = useAppleAccessibility();

  return (
    <Root
      style={[
        mobileStyles.safeArea,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityOpaqueSurface,
      ]}
      accessibilityLanguage="en">
      {children}
    </Root>
  );
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
        <MobileButton
          label="Library"
          icon="▣"
          accessibilityLabel="Back to library"
          accessibilityHint="Returns to the document library"
          onPress={onBack}
        />
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
          accessibilityHint={
            actionLabel === 'Compare'
              ? 'Opens a side-by-side document comparison'
              : undefined
          }
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}

function SelectableText({children, ...props}: TextProps) {
  return (
    <Text
      maxFontSizeMultiplier={2}
      accessibilityLanguage="en"
      {...props}
      selectable>
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
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={`mobile-doc-card-${document.id}`}
      accessible
      accessibilityLabel={`Open ${documentAccessibilityLabel(document)}`}
      accessibilityHint="Opens this document in the reader"
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityActions={[documentAccessibilityActions[0]]}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={document.title}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[
        mobileStyles.documentCard,
        selected && mobileStyles.documentCardSelected,
      ]}
      onAccessibilityAction={documentAccessibilityActionHandler({onPress})}
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
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={`mobile-doc-row-${document.id}`}
      accessible
      accessibilityLabel={`Open ${documentAccessibilityLabel(document)}`}
      accessibilityHint="Opens this document in the reader"
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityActions={[documentAccessibilityActions[0]]}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={document.title}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[mobileStyles.documentRow, selected && mobileStyles.rowSelected]}
      onAccessibilityAction={documentAccessibilityActionHandler({onPress})}
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
  const iconName = iconNameFor(icon);
  const iconColor = active ? acacia.color.paper : '#2E3746';
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        count === undefined ? label : `${label}, ${formatDocumentCount(count)}`
      }
      accessibilityHint="Filters the document list"
      accessibilityState={{selected: active}}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={label}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[
        mobileStyles.tagButton,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
        accessibility.darkerSystemColorsEnabled &&
          styles.accessibilityStrongBorder,
        active && mobileStyles.tagButtonActive,
      ]}
      onPress={onPress}>
      {icon ? (
        iconName ? (
          <Icon
            name={iconName}
            size={13}
            color={iconColor}
            style={mobileStyles.tagIconFrame}
          />
        ) : (
          <Text style={mobileStyles.tagIcon}>{icon}</Text>
        )
      ) : null}
      {tone ? <View style={[styles.tagDot, toneStyle(tone)]} /> : null}
      <Text
        style={[
          mobileStyles.tagText,
          active && mobileStyles.tagTextActive,
          accessibility.boldTextEnabled && styles.accessibilityBoldText,
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
  active = false,
  disabled = false,
  testID,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  label: string;
  icon?: string;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const iconName = iconNameFor(icon);
  const accessibility = useAppleAccessibility();
  const largeContentTitle = accessibilityLabel ?? label;

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{selected: active, disabled}}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={largeContentTitle}
      accessibilityLanguage="en"
      disabled={disabled}
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={({pressed}) => [
        mobileStyles.button,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
        accessibility.darkerSystemColorsEnabled &&
          styles.accessibilityStrongBorder,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityOpaqueSurface,
        primary && mobileStyles.buttonPrimary,
        active && mobileStyles.buttonActive,
        disabled && mobileStyles.buttonDisabled,
        pressed && !accessibility.reduceMotionEnabled && styles.buttonPressed,
      ]}
      onPress={onPress}>
      {icon ? (
        iconName ? (
          <Icon
            name={iconName}
            size={15}
            color={primary ? acacia.color.paper : acacia.color.ink2}
            style={mobileStyles.buttonIconFrame}
          />
        ) : (
        <Text
          style={[
            mobileStyles.buttonIcon,
            primary && mobileStyles.buttonTextPrimary,
            accessibility.boldTextEnabled && styles.accessibilityBoldText,
          ]}>
          {icon}
        </Text>
        )
      ) : null}
      <Text
        style={[
          mobileStyles.buttonText,
          primary && mobileStyles.buttonTextPrimary,
          accessibility.boldTextEnabled && styles.accessibilityBoldText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function HighlightPalette({
  selectedColor,
  onSelectColor,
  testIDPrefix,
  compact = false,
}: {
  selectedColor: string;
  onSelectColor: (color: string) => void;
  testIDPrefix: string;
  compact?: boolean;
}) {
  const accessibility = useAppleAccessibility();

  return (
    <View
      testID={`${testIDPrefix}-palette`}
      accessible={false}
      accessibilityLabel="Highlight colors"
      style={[styles.highlightPalette, compact && styles.highlightPaletteCompact]}>
      {highlightColorOptions.map(option => {
        const active = option.color === selectedColor;
        return (
          <Pressable
            key={option.id}
            testID={`${testIDPrefix}-${option.id}`}
            accessible
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityHint="Changes the highlight color"
            accessibilityState={{selected: active}}
            accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
            accessibilityLargeContentTitle={option.label}
            accessibilityLanguage="en"
            hitSlop={accessibilityControlHitSlop(accessibility, compact)}
            {...tooltipProps(option.label)}
            style={({pressed}) => [
              styles.highlightSwatchButton,
              compact && styles.highlightSwatchButtonCompact,
              (accessibility.largeTextEnabled ||
                accessibility.screenReaderEnabled) &&
                styles.accessibilityLargeTarget,
              accessibility.darkerSystemColorsEnabled &&
                styles.accessibilityStrongBorder,
              accessibility.grayscaleEnabled && styles.accessibilityStrongBorder,
              active && styles.highlightSwatchButtonActive,
              pressed &&
                !accessibility.reduceMotionEnabled &&
                styles.buttonPressed,
            ]}
            onPress={() => onSelectColor(option.color)}>
            <View
              style={[
                styles.highlightSwatch,
                compact && styles.highlightSwatchCompact,
                {backgroundColor: option.color},
              ]}
            />
          </Pressable>
        );
      })}
    </View>
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
  const accessibility = useAppleAccessibility();

  return (
    <View style={styles.titleBar}>
      {isLibrary ? (
        <View style={styles.titleBlock}>
          <View
            style={styles.appBrand}
            accessible
            accessibilityLabel={`Acacia library, ${documentCount} documents`}>
            <View style={styles.appMark}>
              <Image
                testID="app-logo-image"
                source={acaciaLogoSource}
                accessibilityIgnoresInvertColors={
                  accessibility.invertColorsEnabled
                }
                style={styles.appLogoImage}
              />
            </View>
            <Text style={styles.appName}>Acacia</Text>
            <Text style={styles.commandHint}>⌘K</Text>
          </View>
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
        accessible={false}
        accessibilityLabel={isLibrary ? 'Library search box' : 'Document search box'}>
        <Icon name="search" size={14} color={acacia.color.ink4} style={styles.searchIconFrame} />
        <TextInput
          testID={isLibrary ? 'library-search-input' : 'document-search-input'}
          accessibilityLabel={isLibrary ? 'Library search' : 'Document search'}
          accessibilityHint={
            isLibrary
              ? 'Searches titles, authors, tags, and collections'
              : 'Searches text in the current document'
          }
          accessibilityLanguage="en"
          maxFontSizeMultiplier={1.8}
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
          icon="plus"
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
      accessible={false}
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
              label={sortLabel(filter.sortBy)}
              icon="sort"
              onPress={() => onFilterChange({sortBy: nextSort(filter.sortBy)})}
              testID="sort-last-opened-button"
              tooltip="Cycle library sorting"
            />
            <ButtonChrome
              label={filterCount > 0 ? `Filter ${filterCount}` : 'Filter'}
              icon="filter"
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
              icon="plus"
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
  const summaryText = `Showing ${formatDocumentCount(resultCount)} in ${title}`;

  return (
    <View
      testID="library-results-summary"
      accessible={false}
      accessibilityLabel={`Library results summary: ${summaryText}`}
      style={styles.summaryStrip}>
      <View style={styles.summaryIcon}>
        <Icon
          name={scopeIconName(filter.scope)}
          size={16}
          color={acacia.color.ink3}
        />
      </View>
      <View style={styles.summaryBody}>
        <Text
          testID="library-results-summary-text"
          accessible
          accessibilityLabel={summaryText}
          style={styles.summaryText}>
          {summaryText}
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
      accessible={false}
      accessibilityLabel="No documents found"
      style={styles.emptyState}>
      <View style={styles.emptyStateIcon}>
        <Icon name="search" size={20} color={acacia.color.ink3} />
      </View>
      <Text accessible accessibilityRole="text" style={styles.emptyStateTitle}>
        No documents found
      </Text>
      <Text style={styles.emptyStateCopy}>
        Try a broader search, clear the active filters, or import a local PDF.
      </Text>
      <View style={styles.emptyStateActions}>
        <ButtonChrome
          label="Clear Filters"
          icon="trash"
          onPress={onClearFilters}
          testID="clear-empty-state-filters"
          flush
        />
        <ButtonChrome
          label="Open PDF"
          icon="plus"
          onPress={onOpenFile}
          primary
          testID="empty-state-open-file"
        />
      </View>
    </View>
  );
}

function CommandPalette({
  query,
  documents,
  onOpenFile,
  onAddCollection,
  onClose,
  onAsk,
  onOpenDocument,
}: {
  query: string;
  documents: DocumentRecord[];
  onOpenFile: () => void;
  onAddCollection: () => void;
  onClose: () => void;
  onAsk: () => void;
  onOpenDocument: (document: DocumentRecord) => void;
}) {
  const normalizedQuery = query.trim();

  return (
    <View
      testID="command-palette"
      accessible={false}
      accessibilityLabel={`Command palette for ${normalizedQuery}`}
      accessibilityViewIsModal
      accessibilityLanguage="en"
      onAccessibilityEscape={onClose}
      style={styles.commandOverlay}>
      <View style={styles.commandPanel}>
        <View style={styles.commandSearchRow}>
          <Icon name="search" size={16} color={acacia.color.ink2} />
          <Text style={styles.commandQuery}>{normalizedQuery}</Text>
          <View style={styles.commandScope}>
            <Icon name="filter" size={13} color={acacia.color.ink3} />
            <Text style={styles.commandScopeText}>Briefs</Text>
          </View>
          <Pressable
            testID="command-palette-close"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close command palette"
            accessibilityHint="Closes search results"
            hitSlop={controlHitSlop}
            onPress={onClose}
            style={styles.commandClose}>
            <Icon name="close" size={15} color={acacia.color.ink2} />
          </Pressable>
        </View>
        <Text style={styles.commandSectionLabel}>Suggested Actions</Text>
        <CommandAction
          label="Open PDF..."
          icon="upload"
          shortcut="⌘O"
          onPress={onOpenFile}
        />
        <CommandAction
          label="New collection"
          icon="plus"
          shortcut="⌘N"
          onPress={onAddCollection}
        />
        <CommandAction
          label="Ask across library"
          icon="sparkles"
          shortcut="⌘↩"
          onPress={onAsk}
        />
        <Text style={styles.commandSectionLabel}>
          Documents · {documents.length} matches
        </Text>
        {documents.slice(0, 4).map((document, index) => (
          <Pressable
            key={document.id}
            testID={`command-result-${document.id}`}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Open ${documentAccessibilityLabel(document)}`}
            accessibilityHint="Opens this search result in the reader"
            accessibilityState={{selected: index === 0}}
            hitSlop={controlHitSlop}
            onPress={() => onOpenDocument(document)}
            style={[
              styles.commandResult,
              index === 0 && styles.commandResultActive,
            ]}>
            <Icon name="doc" size={16} color={acacia.color.ink3} />
            <View style={styles.commandResultBody}>
              <Text style={styles.commandResultTitle}>{document.title}</Text>
              <Text style={styles.commandResultText} numberOfLines={1}>
                “Global markets closed the year with {normalizedQuery} across key segments.”
              </Text>
              <Text style={styles.commandResultMeta}>
                p. {index + 1} · {document.author} · {document.pageCount} pp
              </Text>
            </View>
            {index === 0 ? (
              <Icon name="return" size={15} color={acacia.color.ink3} />
            ) : null}
          </Pressable>
        ))}
        <View style={styles.commandFooter}>
          <Text style={styles.commandFooterText}>↑ ↓ navigate</Text>
          <Text style={styles.commandFooterText}>↩ open</Text>
          <Text style={styles.commandFooterText}>
            Searches title, contents, OCR, highlights, notes
          </Text>
        </View>
      </View>
    </View>
  );
}

function CommandAction({
  label,
  icon,
  shortcut,
  onPress,
}: {
  label: string;
  icon: IconName;
  shortcut: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Runs ${label}`}
      hitSlop={controlHitSlop}
      onPress={onPress}
      style={styles.commandAction}>
      <Icon name={icon} size={16} color={acacia.color.ink2} />
      <Text style={styles.commandActionLabel}>{label}</Text>
      <Text style={styles.commandShortcut}>{shortcut}</Text>
    </Pressable>
  );
}

function ViewerScreen({
  document,
  documents,
  tags,
  viewer,
  annotations,
  searchHighlights,
  canUseReviewFeatures,
  signatures,
  activeSignatureId,
  highlightColor,
  onBack,
  onCompare,
  onViewerAction,
  onSelectTool,
  onCanvasAnnotation,
  onAddBookmark,
  onPageThumbnail,
  onUnlockReviewFeatures,
  onRestoreReviewFeatures,
  onSelectSignature,
  onSaveSignature,
  onExport,
  onSelectHighlightColor,
}: {
  document: DocumentRecord;
  documents: DocumentRecord[];
  tags: Tag[];
  viewer: ViewerState;
  annotations: Annotation[];
  searchHighlights: SearchHighlight[];
  canUseReviewFeatures: boolean;
  signatures: SignatureProfile[];
  activeSignatureId: string;
  highlightColor: string;
  onBack: () => void;
  onCompare: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onCanvasAnnotation: (request: CanvasAnnotationRequest) => void;
  onAddBookmark: () => void;
  onPageThumbnail: (
    documentId: string,
    pageIndex: number,
    thumbnailPath: string,
  ) => void;
  onUnlockReviewFeatures: () => void;
  onRestoreReviewFeatures: () => void;
  onSelectSignature: (id: string) => void;
  onSaveSignature: (value: string) => void;
  onExport: (format: ExportFormat) => void;
  onSelectHighlightColor: (color: string) => void;
}) {
  const accessibility = useAppleAccessibility();

  return (
    <View
      style={[
        styles.readerShell,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityOpaqueSurface,
      ]}
      testID="viewer-screen"
      accessible={false}
      accessibilityLabel={`Viewer screen ${document.title}`}
      accessibilityLanguage="en"
      onAccessibilityEscape={onBack}
      onMagicTap={onCompare}>
      <ReaderToolbar
        viewer={viewer}
        onBack={onBack}
        onCompare={onCompare}
        onAction={onViewerAction}
        onSelectTool={onSelectTool}
        highlightColor={highlightColor}
        onSelectHighlightColor={onSelectHighlightColor}
      />
      <View style={styles.readerBody} testID="reader-body">
        {viewer.showThumbnails ? (
          <ThumbnailRail
            document={document}
            pageIndex={viewer.pageIndex}
            onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
            onPageThumbnail={onPageThumbnail}
          />
        ) : null}
        <PdfCanvas
          document={document}
          viewer={viewer}
          annotations={annotations}
          searchHighlights={searchHighlights}
          signaturePreviewText={
            signatures.find(signature => signature.id === activeSignatureId)?.value
          }
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
          highlightColor={highlightColor}
          onSelectHighlightColor={onSelectHighlightColor}
          onAddBookmark={onAddBookmark}
          onUnlockReviewFeatures={onUnlockReviewFeatures}
          onRestoreReviewFeatures={onRestoreReviewFeatures}
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
  onPageThumbnail,
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
  onPageThumbnail: (
    documentId: string,
    pageIndex: number,
    thumbnailPath: string,
  ) => void;
  onBack: () => void;
  onToggleSyncedScroll: () => void;
  onViewerAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onViewChangeReport: () => void;
}) {
  const accessibility = useAppleAccessibility();

  return (
    <View
      style={[
        styles.readerShell,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityOpaqueSurface,
      ]}
      testID="compare-screen"
      accessible={false}
      accessibilityLabel={`Compare screen ${leftDocument.title}`}
      accessibilityLanguage="en"
      onAccessibilityEscape={onBack}
      onMagicTap={onViewChangeReport}>
      <View style={styles.readerToolbar} testID="compare-toolbar">
        <ButtonChrome
          label="Library"
          icon="arrow_left"
          onPress={onBack}
          testID="compare-library-button"
        />
        <ButtonChrome
          label="Compare"
          icon="compare"
          onPress={() => onViewerAction({type: 'setInspectorTab', tab: 'changes'})}
          primary
          testID="compare-mode-button"
        />
        <ButtonChrome
          label={syncedScroll ? 'Sync On' : 'Sync Off'}
          icon={syncedScroll ? 'link' : 'minus'}
          onPress={onToggleSyncedScroll}
          testID="sync-scroll-button"
        />
        <View style={styles.pageStepper}>
          <ButtonChrome
            label="Previous page"
            icon="chevron_left"
            compact
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})
            }
            testID="compare-page-previous"
            disabled={viewer.pageIndex <= 0}
            accessibilityHint="Moves both comparison panes to the previous page"
          />
          <View
            testID="compare-page-meter"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Current comparison page"
            accessibilityActions={pageAccessibilityActions}
            accessibilityValue={pageAccessibilityValue(
              viewer.pageIndex,
              leftDocument.pageCount,
            )}
            accessibilityHint="Use Previous page and Next page to move both comparison panes"
            accessibilityLiveRegion="polite"
            onAccessibilityAction={pageAccessibilityActionHandler({
              pageIndex: viewer.pageIndex,
              pageCount: leftDocument.pageCount,
              onPage: pageIndex =>
                onViewerAction({type: 'setPage', pageIndex}),
            })}
            style={styles.pageMeter}>
            <Text style={styles.pageMeterCurrent}>{viewer.pageIndex + 1}</Text>
            <Text style={styles.pageMeterDivider}>/</Text>
            <Text style={styles.pageMeterTotal}>{leftDocument.pageCount}</Text>
          </View>
          <ButtonChrome
            label="Next page"
            icon="chevron_right"
            compact
            onPress={() =>
              onViewerAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})
            }
            testID="compare-page-next"
            disabled={viewer.pageIndex >= leftDocument.pageCount - 1}
            accessibilityHint="Moves both comparison panes to the next page"
          />
        </View>
      </View>
      <View style={styles.readerBody} testID="compare-reader-body">
        <ThumbnailRail
          document={leftDocument}
          pageIndex={viewer.pageIndex}
          onPage={pageIndex => onViewerAction({type: 'setPage', pageIndex})}
          onPageThumbnail={onPageThumbnail}
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
  const accessibility = useAppleAccessibility();

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
          accessibilityHint="Filters documents by tag"
          accessibilityState={{selected: selectedTagId === tag.id}}
          accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
          accessibilityLargeContentTitle={tag.label}
          accessibilityLanguage="en"
          hitSlop={accessibilityControlHitSlop(accessibility)}
          style={[
            styles.sidebarTag,
            (accessibility.largeTextEnabled ||
              accessibility.screenReaderEnabled) &&
              styles.accessibilityLargeTarget,
          ]}
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
      <Pressable
        testID="all-tags-filter"
        accessible
        accessibilityLabel="Show all tags"
        accessibilityRole="button"
        accessibilityHint="Clears the selected tag filter"
        accessibilityState={{selected: selectedTagId === 'all'}}
        accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
        accessibilityLargeContentTitle="All Tags"
        accessibilityLanguage="en"
        hitSlop={accessibilityControlHitSlop(accessibility)}
        style={[
          styles.sidebarTag,
          (accessibility.largeTextEnabled ||
            accessibility.screenReaderEnabled) &&
            styles.accessibilityLargeTarget,
        ]}
        onPress={() => onSelectTag('all')}>
        <Icon name="tag" size={14} color={acacia.color.ink4} style={styles.sidebarIconFrame} />
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
          accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
          accessibilityLargeContentTitle="Add collection"
          accessibilityLanguage="en"
          hitSlop={accessibilityControlHitSlop(accessibility, true)}
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
          accessibilityHint="Filters documents by collection"
          accessibilityState={{selected: selectedCollectionId === collection.id}}
          accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
          accessibilityLargeContentTitle={collection.label}
          accessibilityLanguage="en"
          hitSlop={accessibilityControlHitSlop(accessibility)}
          style={[
            styles.collectionItem,
            (accessibility.largeTextEnabled ||
              accessibility.screenReaderEnabled) &&
              styles.accessibilityLargeTarget,
          ]}
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
        testID="all-collections-filter"
        accessible
        accessibilityLabel="Show all collections"
        accessibilityRole="button"
        accessibilityHint="Clears the selected collection filter"
        accessibilityState={{selected: selectedCollectionId === 'all'}}
        accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
        accessibilityLargeContentTitle="All Collections"
        accessibilityLanguage="en"
        hitSlop={accessibilityControlHitSlop(accessibility)}
        style={[
          styles.collectionItem,
          (accessibility.largeTextEnabled ||
            accessibility.screenReaderEnabled) &&
            styles.accessibilityLargeTarget,
        ]}
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
      accessible={false}
      accessibilityLabel="Library filters">
      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Tags</Text>
        <ButtonChrome
          label="All"
          icon="tag"
          compact={false}
          active={filter.tagId === 'all'}
          onPress={() => onFilterChange({tagId: 'all'})}
          testID="filter-tag-all"
        />
        {tags.map(tag => (
          <ButtonChrome
            key={tag.id}
            label={tag.label}
            icon="tag"
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
          icon="library"
          active={filter.collectionId === 'all'}
          onPress={() => onFilterChange({collectionId: 'all'})}
          testID="filter-collection-all"
        />
        {collections.slice(0, 4).map(collection => (
          <ButtonChrome
            key={collection.id}
            label={`${collection.label} (${collection.count})`}
            icon="folder"
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
        icon="trash"
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
  const iconName = iconNameFor(icon);
  const accessibility = useAppleAccessibility();
  const largeContentTitle = accessibilityLabel ?? label;

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        (count === undefined ? label : `${label}, ${formatDocumentCount(count)}`)
      }
      accessibilityRole="button"
      accessibilityHint="Changes the library section"
      accessibilityState={{selected: active}}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={largeContentTitle}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[
        styles.navItem,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
        accessibility.darkerSystemColorsEnabled &&
          styles.accessibilityStrongBorder,
        active && styles.navItemActive,
      ]}
      onPress={onPress}>
      {iconName ? (
        <Icon
          name={iconName}
          size={15}
          color={active ? acacia.color.ink : acacia.color.ink3}
          style={styles.navIconFrame}
        />
      ) : (
        <Text style={[styles.navIcon, active && styles.navTextActive]}>
          {icon}
        </Text>
      )}
      <View style={styles.navTextBlock}>
        <Text
          style={[
            styles.navText,
            active && styles.navTextActive,
            accessibility.boldTextEnabled && styles.accessibilityBoldText,
          ]}>
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
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={`doc-card-${document.id}`}
      accessible
      accessibilityLabel={`Open ${documentAccessibilityLabel(document)}`}
      accessibilityHint="Opens this document in the reader. Long press selects it for the details panel."
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityActions={documentAccessibilityActions}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={document.title}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[styles.documentCard, selected && styles.documentCardSelected]}
      onAccessibilityAction={documentAccessibilityActionHandler({
        onPress,
        onOpen,
      })}
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
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={`doc-row-${document.id}`}
      accessible
      accessibilityLabel={`Open ${documentAccessibilityLabel(document)}`}
      accessibilityHint="Opens this document in the reader. Long press selects it for the details panel."
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityActions={documentAccessibilityActions}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={document.title}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      style={[styles.tableRow, selected && styles.tableRowSelected]}
      onAccessibilityAction={documentAccessibilityActionHandler({
        onPress,
        onOpen,
      })}
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
  const accessibility = useAppleAccessibility();

  return (
    <View
      accessibilityIgnoresInvertColors={accessibility.invertColorsEnabled}
      style={[
        styles.cover,
        large && styles.coverLarge,
        coverToneStyle(document.thumbnailTone),
      ]}>
      <Text
        numberOfLines={3}
        style={[
          styles.coverTitle,
          document.thumbnailTone === 'navy' && styles.coverTitleInverse,
          large && styles.coverTitleLarge,
        ]}>
        {document.title}
      </Text>
      <Text
        style={[
          styles.coverAuthor,
          document.thumbnailTone === 'navy' && styles.coverAuthorInverse,
        ]}>
        {document.author}
      </Text>
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
        icon="arrow_up_right"
        onPress={onOpen}
        testID="inspector-open-action"
      />
      <ActionRow
        label="Share"
        icon="share"
        onPress={onShare}
        testID="inspector-share-action"
      />
      <ActionRow
        label={document.favorite ? 'Remove Favorite' : 'Add to Favorites'}
        icon="star"
        onPress={onToggleFavorite}
        testID="inspector-favorite-action"
      />
      <ActionRow
        label="Compare Versions"
        icon="compare"
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
  highlightColor,
  onSelectHighlightColor,
}: {
  viewer: ViewerState;
  onBack: () => void;
  onCompare: () => void;
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  highlightColor: string;
  onSelectHighlightColor: (color: string) => void;
}) {
  const tools: Array<{label: string; icon: string; value: ViewerTool}> = [
    {label: 'Select', icon: 'arrow_up_right', value: 'select'},
    {label: 'Hand', icon: 'hand', value: 'pan'},
    {label: 'Text', icon: 'text', value: 'text'},
    {label: 'Highlight', icon: 'highlighter', value: 'highlight'},
    {label: 'Comment', icon: 'comment', value: 'comment'},
    {label: 'Pen', icon: 'pen', value: 'pen'},
    {label: 'Sign', icon: 'signature', value: 'signature'},
  ];

  return (
    <View style={styles.readerToolbar} testID="reader-toolbar">
      <ButtonChrome
        label="Library"
        icon="arrow_left"
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
          accessibilityHint="Decreases the PDF zoom level"
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
          accessibilityHint="Increases the PDF zoom level"
        />
      <View style={styles.pageStepper}>
        <ButtonChrome
          label="Previous page"
          icon="chevron_left"
          compact
          onPress={() =>
            onAction({type: 'setPage', pageIndex: viewer.pageIndex - 1})
          }
          testID="viewer-page-previous"
          accessibilityLabel="Previous page"
          accessibilityHint="Moves to the previous page"
          disabled={viewer.pageIndex <= 0}
        />
        <View
          testID="viewer-page-meter"
          accessible={false}
          style={styles.pageMeter}>
          <TextInput
            testID="viewer-page-input"
            accessibilityRole="adjustable"
            accessibilityLabel="Current page"
            accessibilityActions={pageAccessibilityActions}
            accessibilityValue={pageAccessibilityValue(
              viewer.pageIndex,
              viewer.pageCount,
            )}
            accessibilityHint={`Enter a page number from 1 to ${viewer.pageCount}`}
            accessibilityLiveRegion="polite"
            accessibilityLanguage="en"
            maxFontSizeMultiplier={1.8}
            onAccessibilityAction={pageAccessibilityActionHandler({
              pageIndex: viewer.pageIndex,
              pageCount: viewer.pageCount,
              onPage: pageIndex => onAction({type: 'setPage', pageIndex}),
            })}
            style={styles.pageInput}
            value={`${viewer.pageIndex + 1}`}
            onChangeText={value => {
              const nextPage = Number.parseInt(value, 10);
              if (!Number.isNaN(nextPage)) {
                onAction({type: 'setPage', pageIndex: nextPage - 1});
              }
            }}
          />
          <Text style={styles.pageMeterDivider}>/</Text>
          <Text style={styles.pageMeterTotal}>{viewer.pageCount}</Text>
        </View>
        <ButtonChrome
          label="Next page"
          icon="chevron_right"
          compact
          onPress={() =>
            onAction({type: 'setPage', pageIndex: viewer.pageIndex + 1})
          }
          testID="viewer-page-next"
          accessibilityLabel="Next page"
          accessibilityHint="Moves to the next page"
          disabled={viewer.pageIndex >= viewer.pageCount - 1}
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
            accessibilityHint={`Selects the ${tool.label.toLowerCase()} tool`}
            tooltip={`${tool.label} tool`}
          />
        ))}
      </View>
      {viewer.activeTool === 'highlight' ? (
        <HighlightPalette
          selectedColor={highlightColor}
          onSelectColor={onSelectHighlightColor}
          testIDPrefix="highlight-color"
        />
      ) : null}
      <ButtonChrome
        label="Compare"
        icon="compare"
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
  onPageThumbnail,
  compare = false,
}: {
  document: DocumentRecord;
  pageIndex: number;
  onPage: (pageIndex: number) => void;
  onPageThumbnail?: (
    documentId: string,
    pageIndex: number,
    thumbnailPath: string,
  ) => void;
  compare?: boolean;
}) {
  const pages = useMemo(
    () => thumbnailPages(document.pageCount, pageIndex, compare),
    [compare, document.pageCount, pageIndex],
  );
  const requestedThumbnailsRef = useRef<Set<string>>(new Set());
  const [localThumbnailPaths, setLocalThumbnailPaths] = useState<
    Record<number, string>
  >({});
  const pageThumbnailPaths = useMemo(
    () => ({
      ...(document.pageThumbnailPaths ?? {}),
      ...localThumbnailPaths,
    }),
    [document.pageThumbnailPaths, localThumbnailPaths],
  );

  useEffect(() => {
    setLocalThumbnailPaths({});
    requestedThumbnailsRef.current.clear();
  }, [document.id]);

  useEffect(() => {
    if (!document.path || !onPageThumbnail) {
      return;
    }

    for (const page of pages) {
      if (pageThumbnailPaths[page]) {
        continue;
      }

      const requestKey = `${document.id}:${page}`;
      if (requestedThumbnailsRef.current.has(requestKey)) {
        continue;
      }

      requestedThumbnailsRef.current.add(requestKey);
      PdfKitBridge.renderPageThumbnail(
        document.path,
        page,
        document.bookmark,
        document.id,
      )
        .then(thumbnailPath => {
          if (thumbnailPath) {
            setLocalThumbnailPaths(current => ({
              ...current,
              [page]: thumbnailPath,
            }));
            onPageThumbnail(document.id, page, thumbnailPath);
          }
        })
        .catch(() => {
          requestedThumbnailsRef.current.delete(requestKey);
        });
    }
  }, [
    document.bookmark,
    document.id,
    document.path,
    onPageThumbnail,
    pageThumbnailPaths,
    pages,
  ]);

  return (
    <View
      style={styles.thumbnailRail}
      testID={compare ? 'compare-thumbnail-rail' : 'thumbnail-rail'}
      accessible={false}
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
            accessibilityHint="Moves the reader to this page"
            accessibilityState={{selected: pageIndex === page}}
            hitSlop={controlHitSlop}
            style={[
              styles.thumbnail,
              pageIndex === page && styles.thumbnailActive,
            ]}
            onPress={() => onPage(page)}>
            <PageThumbnail
              document={{...document, pageThumbnailPaths}}
              pageIndex={page}
            />
            <Text style={styles.thumbnailLabel}>{page + 1}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function PageThumbnail({
  document,
  pageIndex,
}: {
  document: DocumentRecord;
  pageIndex: number;
}) {
  const thumbnailPath = document.pageThumbnailPaths?.[pageIndex];

  if (!thumbnailPath) {
    return (
      <View
        testID={`thumbnail-fallback-page-${pageIndex + 1}`}
        style={[styles.thumbnailImage, styles.thumbnailFallback]}>
        <Text numberOfLines={2} style={styles.thumbnailFallbackTitle}>
          {document.title}
        </Text>
        <View style={styles.thumbnailFallbackRule} />
        {[0.78, 0.64, 0.72, 0.54, 0.68].map((width, index) => (
          <View
            key={`${pageIndex}-${index}`}
            style={[styles.thumbnailFallbackLine, {width: `${width * 100}%`}]}
          />
        ))}
        <View style={styles.thumbnailFallbackBlock} />
      </View>
    );
  }

  return (
    <Image
      testID={`thumbnail-image-page-${pageIndex + 1}`}
      accessible
      accessibilityLabel={`Rendered page ${pageIndex + 1} thumbnail`}
      source={{uri: fileUriForPath(thumbnailPath)}}
      style={styles.thumbnailImage}
      resizeMode="contain"
    />
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
  highlightColor,
  onAction,
  onSelectTool,
  onSelectHighlightColor,
  onAddBookmark,
  onUnlockReviewFeatures,
  onRestoreReviewFeatures,
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
  highlightColor: string;
  onAction: (action: Parameters<typeof viewerReducer>[1]) => void;
  onSelectTool: (tool: ViewerTool) => void;
  onSelectHighlightColor: (color: string) => void;
  onAddBookmark: () => void;
  onUnlockReviewFeatures: () => void;
  onRestoreReviewFeatures: () => void;
  onSelectSignature: (id: string) => void;
  onSaveSignature: (value: string) => void;
  onExport: (format: ExportFormat) => void;
}) {
  const inspectorTabs: Array<{tab: InspectorTab; label: string; icon: IconName}> =
    [
      {tab: 'outline', label: 'Outline', icon: 'table_of_contents'},
      {tab: 'comments', label: 'Notes', icon: 'pencil'},
      {tab: 'ask', label: 'Ask', icon: 'sparkles'},
      {tab: 'info', label: 'Info', icon: 'doc'},
    ];

  return (
    <View style={styles.readerInspector} testID="reader-inspector">
      <View style={styles.inspectorTabs}>
        {inspectorTabs.map(({tab, label, icon}) => (
          <Pressable
            key={tab}
            testID={`inspector-tab-${tab}`}
            accessible
            accessibilityLabel={`${capitalize(tab)} tab`}
            accessibilityRole="button"
            accessibilityState={{selected: viewer.inspectorTab === tab}}
            hitSlop={controlHitSlop}
            style={[
              styles.inspectorTab,
              viewer.inspectorTab === tab && styles.inspectorTabActive,
            ]}
            onPress={() => onAction({type: 'setInspectorTab', tab})}>
            <Icon
              name={icon}
              size={13}
              color={
                viewer.inspectorTab === tab
                  ? acacia.color.ink
                  : acacia.color.ink4
              }
            />
            <Text
              style={[
                styles.inspectorTabText,
                viewer.inspectorTab === tab && styles.inspectorTabTextActive,
              ]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {viewer.inspectorTab === 'outline' ? (
        <OutlinePanel
          document={document}
          currentPageIndex={viewer.pageIndex}
          onPage={pageIndex => onAction({type: 'setPage', pageIndex})}
        />
      ) : viewer.inspectorTab === 'ask' ? (
        <AskPanel document={document} />
      ) : viewer.inspectorTab === 'comments' ||
        viewer.inspectorTab === 'notes' ||
        viewer.inspectorTab === 'annotations' ? (
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
              onRestore={onRestoreReviewFeatures}
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
          <Text style={styles.inspectorCaption}>Quick Actions</Text>
          <ActionRow
            label="Add Note"
            icon="comment"
            badge={!canUseReviewFeatures ? 'Pro' : undefined}
            onPress={() => onSelectTool('comment')}
            testID="quick-action-add-note"
          />
          <ActionRow
            label="Highlight Text"
            icon="highlighter"
            onPress={() => onSelectTool('highlight')}
            testID="quick-action-highlight"
          />
          {viewer.activeTool === 'highlight' ? (
            <HighlightPalette
              selectedColor={highlightColor}
              onSelectColor={onSelectHighlightColor}
              testIDPrefix="inspector-highlight-color"
            />
          ) : null}
          <ActionRow
            label="Draw"
            icon="pen"
            onPress={() => onSelectTool('pen')}
            testID="quick-action-draw"
          />
          <ActionRow
            label="Add Signature"
            icon="signature"
            onPress={() => onSelectTool('signature')}
            testID="quick-action-signature"
          />
          <ActionRow
            label="Add Bookmark"
            icon="bookmark"
            onPress={onAddBookmark}
            testID="quick-action-bookmark"
          />
          <Text style={styles.inspectorCaption}>Export</Text>
          <ActionRow
            label="Export as PNG"
            icon="doc"
            onPress={() => onExport('png')}
            testID="export-png-action"
          />
          <ActionRow
            label="Export as JPG"
            icon="doc"
            onPress={() => onExport('jpg')}
            testID="export-jpg-action"
          />
          <ActionRow
            label="Export as Text"
            icon="text"
            onPress={() => onExport('text')}
            testID="export-text-action"
          />
          <ActionRow
            label="Export as Markdown"
            icon="doc_lines"
            onPress={() => onExport('markdown')}
            testID="export-markdown-action"
          />
          <ActionRow
            label="Export Annotated PDF"
            icon="doc_lines"
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
          <InfoGrid document={document} />
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

function OutlinePanel({
  document,
  currentPageIndex,
  onPage,
}: {
  document: DocumentRecord;
  currentPageIndex: number;
  onPage: (pageIndex: number) => void;
}) {
  const rows = outlineRowsForDocument(document);

  return (
    <View testID="reader-outline-panel" style={styles.outlinePanel}>
      <Text style={styles.inspectorCaption}>Contents</Text>
      {rows.map(row => (
        <Pressable
          key={`${row.label}-${row.pageIndex}`}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${row.label}, page ${row.pageIndex + 1}`}
          accessibilityHint="Moves the reader to this section"
          accessibilityState={{selected: currentPageIndex === row.pageIndex}}
          hitSlop={controlHitSlop}
          onPress={() => onPage(row.pageIndex)}
          style={[
            styles.outlineRow,
            currentPageIndex === row.pageIndex && styles.outlineRowActive,
          ]}>
          <Text style={styles.outlinePrefix}>{row.prefix}</Text>
          <Text
            style={[
              styles.outlineLabel,
              currentPageIndex === row.pageIndex && styles.outlineLabelActive,
            ]}>
            {row.label}
          </Text>
          <Text style={styles.outlinePage}>{row.pageIndex + 1}</Text>
        </Pressable>
      ))}
      <View style={styles.outlineEmptyCard}>
        <Icon name="sparkles" size={16} color={acacia.color.ink4} />
        <Text style={styles.outlineEmptyText}>
          No bookmarks set in this document.
        </Text>
        <Text style={styles.outlineAdd}>Add</Text>
      </View>
    </View>
  );
}

function AskPanel({document}: {document: DocumentRecord}) {
  return (
    <View style={styles.askPanel}>
      <Text style={styles.inspectorCaption}>Ask</Text>
      <Text style={styles.askCopy}>
        Ask questions across {document.title}, OCR, highlights, and notes.
      </Text>
      <View style={styles.askPrompt}>
        <Icon name="sparkles" size={16} color={acacia.color.ink2} />
        <Text style={styles.askPromptText}>Summarize the risks on this page</Text>
      </View>
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
  onRestore,
  mobile = false,
}: {
  annotationsCount: number;
  onUnlock: () => void;
  onRestore: () => void;
  mobile?: boolean;
}) {
  return (
    <Pressable
      testID="comments-paywall"
      accessible={false}
      accessibilityLabel="Sign in to unlock comments"
      onPress={onUnlock}
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
        <>
          <MobileButton
            label="Start Pro"
            icon="↗"
            primary
            onPress={onUnlock}
            testID="unlock-comments-button"
          />
          <MobileButton
            label="Restore"
            icon="↺"
            onPress={onRestore}
            testID="restore-purchases-button"
          />
        </>
      ) : (
        <View style={styles.paywallActions}>
          <ButtonChrome
            label="Start Pro"
            icon="↗"
            primary
            flush
            onPress={onUnlock}
            testID="unlock-comments-button"
          />
          <ButtonChrome
            label="Restore"
            icon="↺"
            flush
            onPress={onRestore}
            testID="restore-purchases-button"
          />
        </View>
      )}
    </Pressable>
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
        accessibilityLanguage="en"
        maxFontSizeMultiplier={1.8}
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
            accessibilityState={{selected: signature.id === activeSignatureId}}
            hitSlop={controlHitSlop}
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
              accessibilityLabel={commentAnnotationAccessibilityLabel(annotation)}>
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

function commentAnnotationAccessibilityLabel(annotation: Annotation) {
  const copy = annotation.text ? `, ${annotation.text}` : '';

  return `${annotationLabel(annotation)} annotation on page ${annotation.pageIndex + 1}${copy}`;
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

function viewerToolLabel(tool: ViewerTool) {
  switch (tool) {
    case 'highlight':
      return 'Highlight tool';
    case 'comment':
      return 'Comment tool';
    case 'pen':
      return 'Pen tool';
    case 'signature':
      return 'Signature tool';
    case 'pan':
      return 'Pan tool';
    case 'select':
    default:
      return 'Select tool';
  }
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
      accessible={false}
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
            accessibilityState={{selected: step === viewer.pageIndex}}
            hitSlop={compactControlHitSlop}
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
  const iconName = iconNameFor(icon);
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      style={[
        styles.actionRow,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
      ]}
      onPress={onPress}
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityHint={`Runs ${label}`}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={label}
      accessibilityLanguage="en"
      {...tooltipProps(label)}
      hitSlop={accessibilityControlHitSlop(accessibility)}
      accessibilityRole="button">
      <View style={styles.actionTextGroup}>
        {icon ? (
          iconName ? (
            <Icon
              name={iconName}
              size={15}
              color={acacia.color.ink2}
              style={styles.actionIconFrame}
            />
          ) : (
            <Text style={styles.actionIcon}>{icon}</Text>
          )
        ) : null}
        <Text
          style={[
            styles.actionLabel,
            accessibility.boldTextEnabled && styles.accessibilityBoldText,
          ]}>
          {label}
        </Text>
      </View>
      {badge ? <Text style={styles.actionBadge}>{badge}</Text> : null}
      <Icon name="chevron_right" size={14} color={acacia.color.ink4} />
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
  disabled = false,
  compact = false,
  flush = false,
  testID,
  accessibilityLabel,
  accessibilityHint,
  tooltip,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  primary?: boolean;
  quiet?: boolean;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  flush?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  tooltip?: string;
}) {
  const iconName = iconNameFor(icon);
  const accessibility = useAppleAccessibility();
  const largeContentTitle = accessibilityLabel ?? tooltip ?? label;

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint ?? tooltip}
      accessibilityRole="button"
      accessibilityState={{selected: active, disabled}}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={largeContentTitle}
      accessibilityLanguage="en"
      disabled={disabled}
      hitSlop={accessibilityControlHitSlop(accessibility, compact)}
      {...tooltipProps(tooltip ?? accessibilityLabel ?? label)}
      style={({pressed}) => [
        styles.button,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
        accessibility.darkerSystemColorsEnabled &&
          styles.accessibilityStrongBorder,
        accessibility.reduceTransparencyEnabled &&
          styles.accessibilityOpaqueSurface,
        primary && styles.buttonPrimary,
        quiet && styles.buttonQuiet,
        active && styles.buttonActive,
        compact && styles.buttonCompact,
        flush && styles.buttonFlush,
        disabled && styles.buttonDisabled,
        pressed && !accessibility.reduceMotionEnabled && styles.buttonPressed,
      ]}
      onPress={onPress}>
      {icon ? (
        iconName ? (
          <Icon
            name={iconName}
            size={compact ? 15 : 16}
            color={
              primary
                ? acacia.color.paper
                : active
                  ? acacia.color.ink
                  : acacia.color.ink2
            }
            style={[styles.buttonIconFrame, compact && styles.buttonIconCompactFrame]}
          />
        ) : (
        <Text
          style={[
            styles.buttonIcon,
            primary && styles.buttonTextPrimary,
            active && styles.buttonTextActive,
            compact && styles.buttonIconCompact,
            accessibility.boldTextEnabled && styles.accessibilityBoldText,
          ]}>
          {icon}
        </Text>
        )
      ) : null}
      {compact ? null : (
        <Text
          style={[
            styles.buttonText,
            primary && styles.buttonTextPrimary,
            active && styles.buttonTextActive,
            accessibility.boldTextEnabled && styles.accessibilityBoldText,
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function iconNameFor(icon?: string): IconName | undefined {
  if (!icon) {
    return undefined;
  }

  if (icon in ICON_PATHS) {
    return icon as IconName;
  }

  const aliases: Record<string, IconName> = {
    '+': 'plus',
    '＋': 'plus',
    '-': 'minus',
    '−': 'minus',
    '<': 'chevron_left',
    '>': 'chevron_right',
    '‹': 'chevron_left',
    '›': 'chevron_right',
    '←': 'arrow_left',
    '→': 'arrow_right',
    '⬅️': 'arrow_left',
    '➡️': 'arrow_right',
    '↗': 'arrow_up_right',
    '↔️': 'compare',
    '⇄': 'compare',
    '📚': 'library',
    '🗂️': 'library',
    '📁': 'folder',
    '📂': 'upload',
    '🕘': 'clock',
    '⭐': 'star',
    '📤': 'share',
    '🔎': 'search',
    '🎛️': 'filter',
    '🧭': 'sort',
    '🧹': 'trash',
    '💬': 'comment',
    '🖍': 'highlighter',
    '🖍️': 'highlighter',
    '✏️': 'pen',
    '✏': 'pen',
    '✍️': 'signature',
    '✍': 'signature',
    '🔖': 'bookmark',
    '🧾': 'doc_lines',
    '▧': 'doc',
    '▤': 'list',
    'Aa': 'text',
    A: 'text',
    '↖️': 'arrow_up_right',
    '✋': 'hand',
    '◀️': 'chevron_left',
    '▶️': 'chevron_right',
    '○': 'minus',
    '🔗': 'link',
    '💾': 'check',
  };

  return aliases[icon];
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
  const accessibility = useAppleAccessibility();

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
          accessibilityState={{selected: value === option.value}}
          accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
          accessibilityLargeContentTitle={option.label}
          accessibilityLanguage="en"
          hitSlop={accessibilityControlHitSlop(accessibility)}
          style={[
            styles.segment,
            (accessibility.largeTextEnabled ||
              accessibility.screenReaderEnabled) &&
              styles.accessibilityLargeTarget,
            value === option.value && styles.segmentActive,
          ]}
          onPress={() => onChange(option.value)}>
          <Text
            style={[
              styles.segmentText,
              value === option.value && styles.segmentTextActive,
              accessibility.boldTextEnabled && styles.accessibilityBoldText,
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
  const accessibility = useAppleAccessibility();

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      accessibilityShowsLargeContentViewer={applePlatformSupportsLargeContentViewer()}
      accessibilityLargeContentTitle={label}
      accessibilityLanguage="en"
      hitSlop={accessibilityControlHitSlop(accessibility)}
      onPress={onPress}
      style={[
        styles.commentFilter,
        (accessibility.largeTextEnabled || accessibility.screenReaderEnabled) &&
          styles.accessibilityLargeTarget,
        accessibility.darkerSystemColorsEnabled &&
          styles.accessibilityStrongBorder,
        active && styles.commentFilterActive,
      ]}>
      <Text
        style={[
          styles.commentFilterText,
          active && styles.commentFilterTextActive,
          accessibility.boldTextEnabled && styles.accessibilityBoldText,
        ]}>
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
  return scopeIconName(scope);
}

function scopeIconName(scope: LibraryScope): IconName {
  switch (scope) {
    case 'recent':
      return 'clock';
    case 'favorites':
      return 'star';
    case 'shared':
      return 'share';
    case 'library':
    default:
      return 'library';
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

function searchDemoDocumentMatch(document: DocumentRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const pages = demoSearchPages(document);
  const match = pages.find(page =>
    page.text.toLowerCase().includes(normalizedQuery),
  );

  if (!match) {
    return undefined;
  }

  return {
    pageIndex: match.pageIndex,
    highlight: {
      id: `${document.id}-${match.pageIndex + 1}-${slugify(query) || 'match'}`,
      pageIndex: match.pageIndex,
      bounds: demoSearchHighlightBounds(document, match.pageIndex),
    },
  };
}

function searchHighlightsFromMatches(
  document: DocumentRecord,
  query: string,
  matches: Array<{pageIndex: number; snippet: string; bounds?: PdfRect[]}>,
): SearchHighlight[] {
  return matches.flatMap((match, matchIndex) => {
    const bounds =
      match.bounds && match.bounds.length > 0
        ? match.bounds
        : [demoSearchHighlightBounds(document, match.pageIndex)];

    return bounds.map((bound, boundIndex) => ({
      id: `${document.id}-${slugify(query) || 'match'}-${match.pageIndex + 1}-${matchIndex}-${boundIndex}`,
      pageIndex: match.pageIndex,
      bounds: bound,
    }));
  });
}

function demoSearchHighlightBounds(document: DocumentRecord, pageIndex: number): PdfRect {
  if (document.id === 'future-work') {
    return {x: 42, y: 104, width: 380, height: 44};
  }

  if (document.id === 'product-roadmap') {
    return {x: 42, y: 196, width: 430, height: 64};
  }

  return pageIndex === 0
    ? {x: 42, y: 104, width: 360, height: 42}
    : {x: 42, y: 128, width: 400, height: 28};
}

function outlineRowsForDocument(document: DocumentRecord) {
  if (document.id === 'product-roadmap') {
    return [
      {prefix: '1', label: 'Vision', pageIndex: 1},
      {prefix: '1.1', label: 'Why now', pageIndex: 2},
      {prefix: '1.2', label: 'Where we play', pageIndex: 4},
      {prefix: '2', label: 'Themes', pageIndex: 7},
      {prefix: '2.1', label: 'Platform', pageIndex: 8},
      {prefix: '2.2', label: 'Trust', pageIndex: 13},
      {prefix: '2.3', label: 'Reach', pageIndex: 16},
      {prefix: '3', label: 'Bets', pageIndex: 21},
      {prefix: '4', label: 'Risks', pageIndex: 30},
      {prefix: '5', label: 'Appendix', pageIndex: 38},
    ];
  }

  return [
    {prefix: '1', label: 'Overview', pageIndex: 0},
    {prefix: '2', label: 'Market', pageIndex: Math.min(7, document.pageCount - 1)},
    {prefix: '3', label: 'Risks', pageIndex: Math.min(14, document.pageCount - 1)},
    {prefix: '4', label: 'Appendix', pageIndex: Math.max(0, document.pageCount - 2)},
  ];
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
      text: 'Market Overview global markets closed the year with steady growth across key segments',
    },
    {
      pageIndex: 8,
      text: 'Revenue by Region market share investment inflows',
    },
  ];
}

function getCommandPaletteDocuments(
  documents: DocumentRecord[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  const matches = documents.filter(document => {
    const searchable = [
      document.title,
      document.author,
      ...demoSearchPages(document).map(page => page.text),
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });

  if (matches.length > 0) {
    return matches;
  }

  return documents.slice(0, 4);
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

function fileUriForPath(path: string) {
  if (path.startsWith('file://')) {
    return path;
  }

  return `file://${path}`;
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

function proPurchaseFailureMessage(error: unknown) {
  if (error instanceof ProPurchaseUnavailableError) {
    return error.message;
  }
  if (error instanceof ProBackendError) {
    return error.message;
  }

  const bridgedError = error as {code?: string; message?: string};
  if (bridgedError.code === 'purchase_cancelled') {
    return 'The App Store purchase was cancelled.';
  }

  if (bridgedError.message) {
    return bridgedError.message;
  }

  return 'Acacia Pro could not be activated. Try again in a moment.';
}

const styles = StyleSheet.create({
  window: {
    flex: 1,
    backgroundColor: acacia.color.paper,
  },
  accessibilityOpaqueSurface: {
    backgroundColor: acacia.color.paper,
  },
  accessibilityStrongBorder: {
    borderColor: acacia.color.ink,
    borderWidth: 2,
  },
  accessibilityLargeTarget: {
    minHeight: 44,
  },
  accessibilityBoldText: {
    fontWeight: '900',
  },
  accessibilityReducedShadow: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: {width: 0, height: 0},
  },
  titleBar: {
    position: 'relative',
    height: 52,
    backgroundColor: acacia.color.paper,
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
    width: 220,
    paddingLeft: 58,
  },
  appBrand: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  appMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    overflow: 'hidden',
  },
  appLogoImage: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  appMarkText: {
    color: acacia.color.paper,
    fontFamily: acacia.font.ui,
    fontSize: 12,
    fontWeight: '900',
  },
  appName: {
    flex: 1,
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 14,
    fontWeight: '800',
  },
  commandHint: {
    color: acacia.color.ink4,
    borderColor: acacia.color.hairline,
    borderWidth: 1,
    borderRadius: 5,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: acacia.font.mono,
    fontSize: 10,
  },
  readerTitleBlock: {
    width: 370,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 58,
  },
  titleText: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 14,
    fontWeight: '700',
  },
  titleMeta: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.ui,
    fontSize: 12,
    marginTop: 3,
  },
  searchBox: {
    flex: 1,
    height: 30,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: acacia.color.paper,
    marginRight: 12,
  },
  searchIcon: {
    color: '#565E6D',
    fontSize: 12,
    marginRight: 8,
  },
  searchIconFrame: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    padding: 0,
    fontSize: 13,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 232,
    backgroundColor: acacia.color.surface,
    borderRightColor: acacia.color.hairline,
    borderRightWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  navItem: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  navItemActive: {
    backgroundColor: acacia.color.sunken,
  },
  navText: {
    color: acacia.color.ink2,
    fontFamily: acacia.font.ui,
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
  navIconFrame: {
    width: 20,
    marginRight: 8,
  },
  navTextBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navCount: {
    minWidth: 18,
    color: acacia.color.ink3,
    backgroundColor: 'transparent',
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  navCountActive: {
    color: acacia.color.ink,
    backgroundColor: acacia.color.paper,
  },
  navTextActive: {
    color: acacia.color.ink,
    fontWeight: '700',
  },
  sidebarRule: {
    height: 1,
    backgroundColor: acacia.color.hairline,
    marginVertical: 14,
  },
  sidebarCaption: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  sidebarIconFrame: {
    width: 22,
    marginRight: 6,
  },
  sidebarText: {
    color: acacia.color.ink2,
    fontSize: 13,
  },
  sidebarTextActive: {
    color: acacia.color.ink,
    fontWeight: '700',
  },
  tagDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
    marginRight: 9,
  },
  blueDot: {
    backgroundColor: acacia.color.blue,
  },
  greenDot: {
    backgroundColor: acacia.color.green,
  },
  purpleDot: {
    backgroundColor: acacia.color.gray,
  },
  amberDot: {
    backgroundColor: acacia.color.yellow,
  },
  redDot: {
    backgroundColor: acacia.color.rose,
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
    paddingHorizontal: 28,
    paddingTop: 26,
    backgroundColor: acacia.color.paper,
  },
  libraryToolbar: {
    height: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    minHeight: 0,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 20,
  },
  summaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: acacia.color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryBody: {
    flex: 1,
    minWidth: 0,
  },
  summaryText: {
    color: acacia.color.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  summaryStrong: {
    color: '#1769E8',
    fontWeight: '900',
  },
  summaryHint: {
    color: acacia.color.ink3,
    fontSize: 12,
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
    color: acacia.color.ink,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    paddingBottom: 22,
  },
  documentCard: {
    width: 136,
    marginRight: 20,
    marginBottom: 22,
  },
  documentCardSelected: {
    opacity: 1,
  },
  cover: {
    width: 32,
    height: 44,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: 3,
    overflow: 'hidden',
    padding: 4,
  },
  coverLarge: {
    width: 132,
    height: 176,
    padding: 12,
    marginBottom: 10,
    shadowColor: acacia.color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  coverPastel: {
    backgroundColor: acacia.color.surface,
  },
  coverNavy: {
    backgroundColor: acacia.color.ink,
  },
  coverIce: {
    backgroundColor: acacia.color.sunken,
  },
  coverRed: {
    backgroundColor: acacia.color.rose,
  },
  coverTeal: {
    backgroundColor: acacia.color.gray,
  },
  coverPaper: {
    backgroundColor: acacia.color.paper,
  },
  coverTitle: {
    color: acacia.color.ink,
    fontFamily: acacia.font.display,
    fontSize: 5,
    fontWeight: '800',
  },
  coverTitleLarge: {
    fontSize: 13,
  },
  coverTitleInverse: {
    color: acacia.color.paper,
  },
  coverAuthor: {
    color: acacia.color.ink4,
    fontSize: 4,
    marginTop: 3,
  },
  coverAuthorInverse: {
    color: acacia.color.hairlineStrong,
  },
  progressBadge: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    color: acacia.color.paper,
    backgroundColor: acacia.color.ink,
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    color: acacia.color.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  cardMeta: {
    color: acacia.color.ink4,
    fontSize: 11,
    marginTop: 4,
  },
  recentHeader: {
    borderTopColor: acacia.color.hairline,
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
    backgroundColor: acacia.color.sunken,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: acacia.color.ink4,
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
    backgroundColor: acacia.color.surface,
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
    width: 282,
    borderLeftColor: acacia.color.hairline,
    borderLeftWidth: 1,
    backgroundColor: acacia.color.surface,
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
  actionIconFrame: {
    width: 22,
    marginRight: 8,
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
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: acacia.color.paper,
    marginLeft: 8,
    flexDirection: 'row',
  },
  buttonPrimary: {
    backgroundColor: acacia.color.ink,
    borderColor: acacia.color.ink,
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
    borderColor: acacia.color.ink,
    backgroundColor: acacia.color.sunken,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.74,
  },
  buttonText: {
    color: acacia.color.ink2,
    fontFamily: acacia.font.ui,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonIcon: {
    color: acacia.color.ink2,
    fontSize: 13,
    fontWeight: '900',
    marginRight: 5,
    textAlign: 'center',
  },
  buttonIconCompact: {
    marginRight: 0,
  },
  buttonIconFrame: {
    marginRight: 7,
  },
  buttonIconCompactFrame: {
    marginRight: 0,
  },
  buttonTextPrimary: {
    color: acacia.color.paper,
  },
  buttonTextActive: {
    color: acacia.color.ink,
  },
  highlightPalette: {
    minHeight: 32,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: acacia.color.paper,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  highlightPaletteCompact: {
    minHeight: 34,
    paddingHorizontal: 4,
    marginLeft: 0,
  },
  highlightSwatchButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  highlightSwatchButtonCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  highlightSwatchButtonActive: {
    borderColor: acacia.color.ink,
    backgroundColor: '#FFFFFF',
  },
  highlightSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderColor: 'rgba(17, 17, 16, 0.18)',
    borderWidth: 1,
  },
  highlightSwatchCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: acacia.color.hairline,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  segment: {
    minWidth: 58,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: acacia.color.sunken,
  },
  segmentText: {
    color: acacia.color.ink3,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: acacia.color.ink,
  },
  readerShell: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    zIndex: 0,
    backgroundColor: acacia.color.paper,
  },
  readerToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    backgroundColor: acacia.color.paper,
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
    marginLeft: 8,
    marginRight: 8,
    flexShrink: 0,
  },
  pageMeter: {
    minWidth: 92,
    height: 32,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: acacia.radius.md,
    backgroundColor: acacia.color.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginHorizontal: 8,
  },
  pageInput: {
    width: 30,
    height: 30,
    color: '#1F2633',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  pageMeterCurrent: {
    minWidth: 22,
    color: acacia.color.ink,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  pageMeterDivider: {
    color: acacia.color.ink4,
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 5,
  },
  pageMeterTotal: {
    minWidth: 22,
    color: acacia.color.ink3,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'left',
  },
  toolGroup: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  readerBody: {
    position: 'absolute',
    top: 52,
    right: 0,
    bottom: 52,
    left: 0,
    flexDirection: 'row',
    overflow: 'hidden',
    zIndex: 0,
  },
  thumbnailRail: {
    width: 136,
    backgroundColor: acacia.color.surface,
    borderRightColor: acacia.color.hairline,
    borderRightWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  thumbnail: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 0,
    marginBottom: 10,
  },
  thumbnailActive: {
    backgroundColor: acacia.color.sunken,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  thumbnailImage: {
    width: 84,
    height: 119,
    borderRadius: 4,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  thumbnailFallback: {
    padding: 8,
  },
  thumbnailFallbackTitle: {
    color: acacia.color.ink,
    fontFamily: acacia.font.display,
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 9,
  },
  thumbnailFallbackRule: {
    height: 8,
    backgroundColor: acacia.color.hairline,
    marginTop: 7,
    marginBottom: 5,
  },
  thumbnailFallbackLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: acacia.color.ink2,
    marginBottom: 3,
  },
  thumbnailFallbackBlock: {
    height: 18,
    backgroundColor: acacia.color.hairline,
    marginTop: 8,
  },
  thumbnailLabel: {
    color: acacia.color.ink3,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  readerInspector: {
    width: 318,
    backgroundColor: acacia.color.paper,
    borderLeftColor: acacia.color.hairline,
    borderLeftWidth: 1,
    padding: 16,
  },
  outlinePanel: {
    flex: 1,
  },
  outlineRow: {
    minHeight: 34,
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  outlineRowActive: {
    backgroundColor: acacia.color.hairline,
  },
  outlinePrefix: {
    width: 28,
    color: acacia.color.ink4,
    fontFamily: acacia.font.mono,
    fontSize: 11,
  },
  outlineLabel: {
    flex: 1,
    color: acacia.color.ink2,
    fontSize: 12,
    fontWeight: '600',
  },
  outlineLabelActive: {
    color: acacia.color.ink,
    fontWeight: '800',
  },
  outlinePage: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.mono,
    fontSize: 11,
  },
  outlineEmptyCard: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: acacia.color.sunken,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 18,
  },
  outlineEmptyText: {
    flex: 1,
    color: acacia.color.ink3,
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 10,
  },
  outlineAdd: {
    color: acacia.color.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  askPanel: {
    flex: 1,
  },
  askCopy: {
    color: acacia.color.ink3,
    fontSize: 12,
    lineHeight: 18,
  },
  askPrompt: {
    minHeight: 42,
    borderColor: acacia.color.hairline,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: acacia.color.paper,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 14,
  },
  askPromptText: {
    color: acacia.color.ink2,
    fontSize: 12,
    marginLeft: 9,
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
    borderBottomColor: acacia.color.ink,
  },
  inspectorTabText: {
    color: '#495261',
    fontSize: 12,
    fontWeight: '700',
  },
  inspectorTabTextActive: {
    color: acacia.color.ink,
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
  paywallActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
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
    backgroundColor: acacia.color.paper,
    borderTopColor: acacia.color.hairline,
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
    backgroundColor: acacia.color.ink,
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
  commandOverlay: {
    position: 'absolute',
    top: 72,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 30,
    alignItems: 'center',
    paddingTop: 24,
    backgroundColor: 'rgba(17,17,16,0.22)',
  },
  commandPanel: {
    width: 640,
    maxWidth: '86%',
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: acacia.color.paper,
    shadowColor: acacia.color.ink,
    shadowOpacity: 0.2,
    shadowRadius: 34,
    shadowOffset: {width: 0, height: 18},
    overflow: 'hidden',
  },
  commandSearchRow: {
    height: 58,
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  commandQuery: {
    flex: 1,
    color: acacia.color.ink,
    fontSize: 17,
    marginLeft: 12,
  },
  commandScope: {
    height: 28,
    borderColor: acacia.color.hairline,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  commandClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandScopeText: {
    color: acacia.color.ink2,
    fontSize: 12,
    marginLeft: 5,
  },
  commandSectionLabel: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginTop: 13,
    marginBottom: 6,
    paddingHorizontal: 18,
  },
  commandAction: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  commandActionLabel: {
    flex: 1,
    color: acacia.color.ink,
    fontSize: 14,
    marginLeft: 13,
  },
  commandShortcut: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.mono,
    fontSize: 11,
  },
  commandResult: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  commandResultActive: {
    borderLeftColor: acacia.color.ink,
    borderLeftWidth: 2,
    backgroundColor: acacia.color.hairline,
  },
  commandResultBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  commandResultTitle: {
    color: acacia.color.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  commandResultText: {
    color: acacia.color.ink3,
    fontFamily: acacia.font.display,
    fontSize: 13,
    lineHeight: 18,
  },
  commandResultMeta: {
    color: acacia.color.ink4,
    fontSize: 11,
    marginTop: 3,
  },
  commandFooter: {
    minHeight: 44,
    borderTopColor: acacia.color.hairline,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  commandFooterText: {
    color: acacia.color.ink4,
    fontSize: 11,
    marginRight: 18,
  },
});

const mobileStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: acacia.color.paper,
  },
  shell: {
    flex: 1,
    backgroundColor: acacia.color.paper,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomColor: 'transparent',
    borderBottomWidth: 0,
    backgroundColor: acacia.color.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appTitle: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 18,
    fontWeight: '900',
  },
  headerMeta: {
    color: acacia.color.ink4,
    fontFamily: acacia.font.ui,
    fontSize: 12,
    marginTop: 3,
  },
  searchBox: {
    marginHorizontal: 20,
    marginTop: 8,
    height: 42,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 12,
    backgroundColor: acacia.color.sunken,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 15,
    padding: 0,
  },
  libraryContent: {
    padding: 20,
    paddingBottom: 32,
  },
  scopeScroller: {
    paddingBottom: 10,
  },
  tagScroller: {
    paddingBottom: 14,
  },
  tagButton: {
    height: 32,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 17,
    backgroundColor: acacia.color.sunken,
    paddingHorizontal: 12,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagButtonActive: {
    borderColor: acacia.color.ink,
    backgroundColor: acacia.color.ink,
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
  tagIconFrame: {
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
    color: acacia.color.ink,
    backgroundColor: '#FFFFFF',
  },
  tagTextActive: {
    color: acacia.color.paper,
  },
  sectionHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
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
    width: 126,
    minHeight: 234,
    marginRight: 14,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  documentCardSelected: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
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
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  documentRow: {
    minHeight: 76,
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowSelected: {
    backgroundColor: acacia.color.surface,
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
    minHeight: 58,
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    backgroundColor: acacia.color.paper,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    marginHorizontal: 12,
  },
  readerTitle: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 16,
    fontWeight: '900',
  },
  viewerToolbar: {
    height: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: acacia.color.hairline,
    borderBottomWidth: 1,
    backgroundColor: acacia.color.paper,
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
    height: 458,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 10,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: acacia.color.sunken,
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
    justifyContent: 'center',
  },
  pageControlSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageControlSlotEnd: {
    justifyContent: 'flex-end',
  },
  pageMeter: {
    minWidth: 86,
    height: 34,
    borderRadius: 10,
    backgroundColor: acacia.color.paper,
    borderColor: acacia.color.hairlineStrong,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pageLabel: {
    color: acacia.color.ink,
    fontFamily: acacia.font.ui,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  pageCurrent: {
    color: acacia.color.ink,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
  },
  pageSlash: {
    color: acacia.color.ink4,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  pageTotal: {
    color: acacia.color.ink2,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
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
  annotationSheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: acacia.color.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 26,
    shadowColor: acacia.color.ink,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: -8},
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: acacia.color.ink4,
    opacity: 0.5,
    marginBottom: 18,
  },
  sheetQuoteRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  sheetAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: acacia.color.yellow,
    marginRight: 10,
  },
  sheetQuote: {
    flex: 1,
    color: acacia.color.ink2,
    fontFamily: acacia.font.display,
    fontSize: 16,
    lineHeight: 22,
  },
  sheetClose: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annotationSwatches: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  annotationSwatch: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  annotationSwatchActive: {
    borderColor: acacia.color.ink,
    borderWidth: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTags: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderColor: acacia.color.ink,
    backgroundColor: acacia.color.ink,
  },
  buttonActive: {
    borderColor: acacia.color.ink,
    backgroundColor: acacia.color.sunken,
  },
  buttonDisabled: {
    opacity: 0.42,
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
  buttonIconFrame: {
    marginRight: 6,
  },
  buttonTextPrimary: {
    color: acacia.color.paper,
  },
});

export default App;
