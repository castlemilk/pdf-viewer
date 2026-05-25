/**
 * @format
 */

import React from 'react';
import {AccessibilityInfo, Alert, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import {createInitialLibraryState} from '../src/domain';
import {importedPdfToDocument, PdfKitBridge} from '../src/native/PdfKitBridge';

function pressSidebarItem(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const navId = `nav-${label.toLowerCase()}`;
  const navItem = renderer.root.findByProps({testID: navId});

  navItem.props.onPress();
}

function nativeButtonProps(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  return renderer.root.find(
    instance =>
      instance.props.testID === testID &&
      instance.props.accessibilityRole === 'button',
  ).props;
}

function visibleGridDocumentIds(renderer: ReactTestRenderer.ReactTestRenderer) {
  const grid = renderer.root.findByProps({testID: 'recent-grid'});

  return Array.from(
    new Set(
      grid
        .findAll(
          instance =>
            typeof instance.props.testID === 'string' &&
            instance.props.testID.startsWith('doc-card-'),
        )
        .map(instance => instance.props.testID),
    ),
  );
}

function signatureCommentItems(renderer: ReactTestRenderer.ReactTestRenderer) {
  return visibleCommentItemIds(renderer).filter(testID =>
    testID.startsWith('comment-item-signature-'),
  );
}

function visibleCommentItemIds(renderer: ReactTestRenderer.ReactTestRenderer) {
  return Array.from(
    new Set(
      renderer.root
        .findAll(
          instance =>
            typeof instance.props.testID === 'string' &&
            instance.props.testID.startsWith('comment-item-'),
        )
        .map(instance => instance.props.testID as string),
    ),
  );
}

function localHighlightCommentItems(renderer: ReactTestRenderer.ReactTestRenderer) {
  return visibleCommentItemIds(renderer).filter(
    testID => testID === 'comment-item-local-highlight',
  );
}

function highlightAnnotationIds(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAll(
      instance =>
        typeof instance.props.testID === 'string' &&
        instance.props.testID.startsWith('pdf-annotation-highlight-'),
    )
    .map(instance => instance.props.testID as string);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('applies Apple accessibility preferences to shared controls', async () => {
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'isGrayscaleEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isInvertColorsEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest
    .spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled')
    .mockResolvedValue(true);
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(true);
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockResolvedValue(true);
  jest
    .spyOn(AccessibilityInfo, 'prefersCrossFadeTransitions')
    .mockResolvedValue(true);
  const addEventListener = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({remove} as never);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(AccessibilityInfo.isBoldTextEnabled).toHaveBeenCalled();
  expect(addEventListener).toHaveBeenCalledWith(
    'reduceMotionChanged',
    expect.any(Function),
  );
  expect(addEventListener).toHaveBeenCalledWith(
    'screenReaderChanged',
    expect.any(Function),
  );
  expect(
    renderer!.root.findByProps({testID: 'app-window'}).props
      .accessibilityLanguage,
  ).toBe('en');
  expect(
    renderer!.root.findByProps({testID: 'app-logo-image'}).props
      .accessibilityIgnoresInvertColors,
  ).toBe(true);

  const openButton = nativeButtonProps(renderer!, 'open-file-button');
  expect(openButton.accessibilityShowsLargeContentViewer).toBe(true);
  expect(openButton.accessibilityLargeContentTitle).toBe('Open PDF');
  expect(
    StyleSheet.flatten(openButton.style({pressed: false})),
  ).toEqual(
    expect.objectContaining({
      minHeight: 44,
      borderColor: '#111110',
    }),
  );
  expect(
    StyleSheet.flatten(openButton.style({pressed: true})),
  ).not.toEqual(expect.objectContaining({opacity: 0.74}));
});

test('renders the PDF library shell with core document workflows', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Library');
  expect(output).toContain('Continue Reading');
  expect(output).toContain('Recent Documents');
  expect(output).toContain('Q4 Market Analysis Report');
  expect(output).toContain('Open PDF');
  expect(output).toContain('Compare');
});

test('hides account storage quota while signed out', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const storageLabels = renderer!.root.findAll(
    instance =>
      Array.isArray(instance.props.children) &&
      instance.props.children.some(
        (child: unknown) =>
          typeof child === 'string' && child.includes('GB of'),
      ),
  );

  expect(storageLabels).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({testID: 'account-storage-usage'}),
  ).toHaveLength(0);
});

test('hides account storage quota for signed-in free accounts', async () => {
  const persistedAt = '2026-05-13T08:30:00.000Z';
  const libraryState = {
    ...createInitialLibraryState(),
    storageUsedGb: 4.5,
    storageLimitGb: 10,
  };
  const persistedState = {
    schemaVersion: 1,
    libraryState,
    filter: {
      query: '',
      tagId: 'all',
      collectionId: 'all',
      scope: 'library',
      sortBy: 'lastOpened',
      viewMode: 'grid',
    },
    screenMode: 'library',
    selectedDocumentId: 'q4-market-analysis',
    viewerState: {
      documentId: 'q4-market-analysis',
      pageCount: 32,
      pageIndex: 0,
      zoom: 1,
      activeTool: 'select',
      inspectorTab: 'info',
      showThumbnails: true,
      searchQuery: '',
    },
    annotations: [],
    signatures: [],
    activeSignatureId: '',
    accountState: {signedIn: true, plan: 'free'},
    compareSynced: true,
    updatedAt: persistedAt,
  };
  jest
    .spyOn(PdfKitBridge, 'readSidecar')
    .mockResolvedValueOnce(JSON.stringify(persistedState));
  jest.spyOn(PdfKitBridge, 'writeSidecar').mockResolvedValue(true);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(
    renderer!.root.findAllByProps({testID: 'account-storage-usage'}),
  ).toHaveLength(0);
  expect(JSON.stringify(renderer?.toJSON())).not.toContain('GB of');
});

test('refreshes Pro account entitlement from backend on launch', async () => {
  const syncAccount = jest.fn(async () => ({
    accountState: {signedIn: true, plan: 'pro' as const},
    storageLimitGb: 20,
    storageUsedGb: 1.5,
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <App proAccountSynchronizer={{syncAccount}} />,
    );
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(syncAccount).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findByProps({testID: 'account-storage-usage'}),
  ).toBeTruthy();
  expect(
    renderer!.root.findAll(
      instance =>
        Array.isArray(instance.props.children) &&
        instance.props.children.join('') === '1.5 GB of 20 GB used',
    ),
  ).not.toHaveLength(0);
});

test('stale launch account sync cannot downgrade a completed Pro purchase', async () => {
  let resolveSync!: (value: {
    accountState: {signedIn: true; plan: 'free'};
  }) => void;
  const syncPromise = new Promise<{
    accountState: {signedIn: true; plan: 'free'};
  }>(resolve => {
    resolveSync = resolve;
  });
  const syncAccount = jest.fn(() => syncPromise);
  const purchasePro = jest.fn(async () => ({
    accountState: {signedIn: true, plan: 'pro' as const},
    storageLimitGb: 20,
  }));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <App
        isProPurchaseTestingLaunch
        proAccountSynchronizer={{syncAccount}}
        proPurchaseCoordinator={{
          purchasePro,
          restorePro: jest.fn(),
        }}
      />,
    );
    await Promise.resolve();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-tab-comments'}).props.onPress();
  });
  expect(
    renderer!.root.findAllByProps({testID: 'comments-paywall'}).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findAllByProps({testID: 'unlock-comments-button'})[0].props.onPress();
  });

  expect(purchasePro).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Acacia Pro',
    'Pro is active on this account.',
  );
  expect(
    renderer!.root.findAllByProps({testID: 'comments-panel'}).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    resolveSync({accountState: {signedIn: true, plan: 'free'}});
    await syncPromise;
    await Promise.resolve();
  });

  expect(
    renderer!.root.findAllByProps({testID: 'comments-panel'}).length,
  ).toBeGreaterThan(0);
  expect(renderer!.root.findAllByProps({testID: 'comments-paywall'})).toHaveLength(0);
});

test('library brand uses the Acacia logo image instead of a letter mark', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(renderer!.root.findByProps({testID: 'app-logo-image'})).toBeTruthy();
  expect(renderer!.root.findAllByProps({testID: 'app-mark-letter'})).toHaveLength(0);
});

test('renders a compact mobile shell when requested', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('mobile-library-screen');
  expect(JSON.stringify(renderer?.toJSON())).toContain('Acacia');

  const documentRow = renderer!.root.findByProps({
    testID: 'mobile-doc-row-q4-market-analysis',
  });

  expect(documentRow.props.accessibilityLabel).toContain(
    'Q4 Market Analysis Report, Analytics Team, 32 pages',
  );
  expect(documentRow.props.accessibilityHint).toBe(
    'Opens this document in the reader',
  );

  await ReactTestRenderer.act(() => {
    documentRow.props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('mobile-viewer-screen');
  expect(output).toContain('Page 1 of 32');
  expect(output).toContain('Highlight');
});

test('mobile viewer controls page, zoom, and highlight state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-page-next'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 2 of 32');
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-current'}).props.children,
  ).toBe(2);
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-meter'}).props
      .accessibilityValue,
  ).toEqual({
    min: 1,
    max: 32,
    now: 2,
    text: 'Page 2 of 32',
  });
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-label'}).props.children[2]
      .props.children,
  ).toBe(32);
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-meter'}).props
      .accessibilityActions,
  ).toEqual([
    {name: 'decrement', label: 'Previous page'},
    {name: 'increment', label: 'Next page'},
  ]);
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'mobile-page-meter'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      alignItems: 'center',
      justifyContent: 'center',
    }),
  );

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-page-meter'})
      .props.onAccessibilityAction({nativeEvent: {actionName: 'decrement'}});
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 1 of 32');
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-current'}).props.children,
  ).toBe(1);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-zoom-in'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'mobile-zoom-label'}).props.children,
  ).toEqual([110, '%']);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  expect(
    nativeButtonProps(renderer!, 'mobile-highlight').accessibilityState,
  ).toEqual({selected: true, disabled: false});
  expect(
    nativeButtonProps(renderer!, 'mobile-page-previous').accessibilityState,
  ).toEqual({selected: false, disabled: true});
  expect(JSON.stringify(renderer?.toJSON())).toContain('pdf-tool-hint');
  expect(JSON.stringify(renderer?.toJSON())).not.toContain(
    'comment-item-local-highlight',
  );

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 150, locationY: 220},
    });
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Comments');
  expect(output).toContain('Sign in to unlock comments');
  expect(output).toContain('comments-paywall');
  expect(output).toContain('restore-purchases-button');
  expect(output).not.toContain('comment-item-local-highlight');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'comment-item-local-highlight',
  );
});

test('mobile highlights created in the same tick receive unique keys', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 150, locationY: 220},
    });
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 170, locationY: 240},
    });
  });

  const annotationIds = highlightAnnotationIds(renderer!);
  const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter(call =>
    call.some(
      argument =>
        typeof argument === 'string' &&
        argument.includes('Encountered two children with the same key'),
    ),
  );

  expect(new Set(annotationIds).size).toBe(2);
  expect(duplicateKeyWarnings).toHaveLength(0);
});

test('mobile highlight palette applies the selected color to new highlights', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight-color-blue'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 150, locationY: 220},
    });
  });

  const highlight = renderer!.root.find(
    instance =>
      typeof instance.props.testID === 'string' &&
      instance.props.testID.startsWith('pdf-annotation-highlight-'),
  );

  expect(StyleSheet.flatten(highlight.props.style)).toEqual(
    expect.objectContaining({
      backgroundColor: '#A7BAE8',
    }),
  );
});

test('mobile demo canvas scrolling updates the visible page state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-scroll'}).props.onScroll({
      nativeEvent: {contentOffset: {y: 1000}},
    });
  });

  expect(
    renderer!.root.findByProps({testID: 'mobile-page-current'}).props.children,
  ).toBe(3);
  expect(
    renderer!.root.findByProps({testID: 'mobile-page-label'}).props.children[2].props
      .children,
  ).toBe(32);
});

test('mobile signature tool exposes signature manager and stamps the page', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-signature'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('signature-manager');
  expect(JSON.stringify(renderer?.toJSON())).toContain('pdf-tool-hint');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'signature-name-input'}).props.onChangeText('Ben Ebsworth');
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'save-signature-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 220, locationY: 300},
    });
  });

  const output = JSON.stringify(renderer?.toJSON());
  expect(output).toContain('pdf-annotation-signature');
  expect(output).toContain('Ben Ebsworth');
});

test('opens the first matching search result from the inspector', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const searchInput = renderer!.root.findByProps({
    testID: 'library-search-input',
  });

  await ReactTestRenderer.act(() => {
    searchInput.props.onChangeText('roadmap');
  });

  const openAction = renderer!.root.findByProps({
    testID: 'inspector-open-action',
  });

  await ReactTestRenderer.act(() => {
    openAction.props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Product Roadmap 2025');
});

test('submitting library search opens the current matching document', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({testID: 'library-search-input'})
      .props.onSubmitEditing({nativeEvent: {text: 'roadmap'}});
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Product Roadmap 2025');
  expect(output).toContain('Page 1 of 44');
});

test('desktop document clicks open the reader and controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Viewer screen Q4 Market Analysis Report',
  );
  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 1 of 32');
  expect(
    nativeButtonProps(renderer!, 'viewer-page-previous').accessibilityState,
  ).toEqual({selected: false, disabled: true});
  expect(
    renderer!.root.findByProps({testID: 'viewer-page-input'}).props
      .accessibilityValue,
  ).toEqual({
    min: 1,
    max: 32,
    now: 1,
    text: 'Page 1 of 32',
  });
  expect(
    renderer!.root.findByProps({testID: 'viewer-page-input'}).props
      .accessibilityActions,
  ).toEqual([
    {name: 'decrement', label: 'Previous page'},
    {name: 'increment', label: 'Next page'},
  ]);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'viewer-page-input'})
      .props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}});
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 2 of 32');
  expect(
    renderer!.root.findByProps({testID: 'viewer-page-input'}).props
      .accessibilityValue.text,
  ).toBe('Page 2 of 32');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-zoom-in'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'viewer-zoom-label'}).props.children,
  ).toEqual([110, '%']);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-highlight'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('pdf-tool-hint');
  expect(JSON.stringify(renderer?.toJSON())).not.toContain(
    'pdf-annotation-highlight',
  );
  expect(JSON.stringify(renderer?.toJSON())).not.toContain('comments-paywall');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-9'}).props.onResponderRelease({
      nativeEvent: {locationX: 220, locationY: 280},
    });
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Comments');
  expect(output).toContain('Sign in to unlock comments');
  expect(output).not.toContain('comment-item-local-highlight');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Local non-destructive highlight',
  );
});

test('document titles and inspector metadata are selectable for copy workflows', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findByProps({testID: 'library-inspector-title'}).props
      .selectable,
  ).toBe(true);
  expect(
    renderer!.root.findByProps({testID: 'info-value-author'}).props.selectable,
  ).toBe(true);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-open-action'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'title-document-name'}).props
      .selectable,
  ).toBe(true);
  expect(
    renderer!.root.findByProps({testID: 'viewer-inspector-title'}).props
      .selectable,
  ).toBe(true);
});

test('desktop reader clips the canvas below toolbar and scrubber controls', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'viewer-screen'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      flex: 1,
      overflow: 'hidden',
      zIndex: 0,
    }),
  );
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'reader-toolbar'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      position: 'absolute',
      top: 0,
      height: 52,
      zIndex: 10,
    }),
  );
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'reader-body'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      position: 'absolute',
      top: 52,
      bottom: 52,
      overflow: 'hidden',
      zIndex: 0,
    }),
  );
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'bottom-scrubber'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      position: 'absolute',
      bottom: 0,
      height: 52,
      zIndex: 10,
    }),
  );
});

test('desktop reader thumbnails and page meter avoid nested preview chrome', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'thumbnail-page-1'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      borderWidth: 0,
      alignItems: 'center',
    }),
  );
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'thumbnail-fallback-page-1'}).props
        .style,
    ),
  ).toEqual(
    expect.objectContaining({
      width: 84,
      height: 119,
    }),
  );
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'viewer-page-meter'}).props.style,
    ),
  ).toEqual(
    expect.objectContaining({
      minWidth: 92,
      justifyContent: 'center',
    }),
  );
});

test('desktop library view mode toggle swaps recent documents between grid and list', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('recent-grid');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'view-mode-list'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('recent-table');
  expect(output).toContain('doc-row-q4-market-analysis');
});

test('desktop library favorite, sort, and filter controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-favorite-action'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Remove Favorite');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'sort-last-opened-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Modified');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'library-search-input'})
      .props.onChangeText('roadmap');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Product Roadmap 2025');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'filter-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('filter-panel');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'clear-filters-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'filter-tag-finance'}).props.onPress();
  });

  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-annual-financial-report',
    'doc-card-invoice-0042',
  ]);

  expect(renderer!.root.findByProps({testID: 'library-search-input'}).props.value).toBe('');
});

test('desktop library surfaces active navigation context and empty results', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findByProps({testID: 'library-results-summary-text'}).props
      .accessibilityLabel,
  ).toBe('Showing 8 documents in Recent Documents');
  expect(
    renderer!.root.findByProps({testID: 'filter-button'}).props
      .accessibilityLabel,
  ).toBe('Filters');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'filter-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'filter-tag-finance'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'filter-button'}).props
      .accessibilityLabel,
  ).toBe('Filters, 1 active');
  expect(JSON.stringify(renderer?.toJSON())).toContain('Finance');
  expect(
    renderer!.root.findByProps({testID: 'library-results-summary-text'}).props
      .accessibilityLabel,
  ).toBe('Showing 2 documents in Recent Documents');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'library-search-input'})
      .props.onChangeText('no matching local pdf');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('library-empty-state');
  expect(JSON.stringify(renderer?.toJSON())).toContain('No documents found');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'clear-empty-state-filters'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).not.toContain('library-empty-state');
  expect(visibleGridDocumentIds(renderer!)).toHaveLength(8);
});

test('desktop sidebar exposes friendly navigation labels and counts', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findByProps({testID: 'nav-library'}).props
      .accessibilityLabel,
  ).toBe('Library, 8 documents');
  expect(
    nativeButtonProps(renderer!, 'nav-library').accessibilityState,
  ).toEqual({selected: true});
  expect(
    nativeButtonProps(renderer!, 'nav-recent').accessibilityState,
  ).toEqual({selected: false});
  expect(
    renderer!.root.findByProps({testID: 'nav-favorites'}).props
      .accessibilityLabel,
  ).toBe('Favorites, 2 documents');
  expect(
    renderer!.root.findByProps({testID: 'nav-shared'}).props
      .accessibilityLabel,
  ).toBe('Shared, 2 documents');
  expect(
    renderer!.root.findByProps({testID: 'all-tags-filter'}).props
      .accessibilityLabel,
  ).toBe('Show all tags');
  expect(
    renderer!.root.findByProps({testID: 'all-collections-filter'}).props
      .accessibilityLabel,
  ).toBe('Show all collections');
});

test('mobile library scope chips filter documents without relying on the desktop sidebar', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-scope-favorites'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Favorite Documents');
  expect(JSON.stringify(renderer?.toJSON())).toContain('Product Roadmap 2025');
  expect(JSON.stringify(renderer?.toJSON())).not.toContain(
    'Q4 Market Analysis Report',
  );

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-scope-library'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Q4 Market Analysis Report');
});

test('mobile library search submit opens the first matching document', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(async () => {
    const searchInput = renderer!.root.findByProps({
      testID: 'mobile-library-search-input',
    });
    searchInput.props.onChangeText('roadmap');
    await searchInput.props.onSubmitEditing({nativeEvent: {text: 'roadmap'}});
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('mobile-viewer-screen');
  expect(output).toContain('Product Roadmap 2025');
});

test('desktop title bar relies on native macOS chrome instead of synthetic traffic lights', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findAllByProps({testID: 'synthetic-traffic-lights'}),
  ).toHaveLength(0);
});

test('opening a local PDF adds it to recent documents and opens the viewer', async () => {
  const importedAt = '2026-05-12T12:00:00.000Z';
  jest.spyOn(PdfKitBridge, 'openPdf').mockResolvedValueOnce({
    id: 'manual-imported-pdf',
    title: 'Manual Imported PDF',
    author: 'Local Author',
    pageCount: 5,
    sizeMb: 2.5,
    createdAt: importedAt,
    modifiedAt: importedAt,
    path: '/tmp/manual-imported.pdf',
    bookmark: 'bookmark',
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'open-file-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Viewer screen Manual Imported PDF',
  );

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-library-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'nav-recent'}).props.onPress();
  });

  expect(visibleGridDocumentIds(renderer!)[0]).toBe(
    'doc-card-manual-imported-pdf',
  );
});

test('restores persisted imported PDFs and preferences before seeding demos', async () => {
  const persistedAt = '2026-05-13T08:30:00.000Z';
  const persistedState = {
    schemaVersion: 1,
    libraryState: {
      documents: [
        importedPdfToDocument({
          id: 'persisted-imported-pdf',
          title: 'Persisted Imported PDF',
          author: 'Local Author',
          pageCount: 7,
          sizeMb: 3.4,
          createdAt: persistedAt,
          modifiedAt: persistedAt,
          path: '/tmp/persisted-imported.pdf',
          bookmark: 'persisted-bookmark',
        }),
      ],
      tags: [{id: 'work', label: 'Work', tone: 'blue'}],
      collections: [{id: 'archive', label: 'Archive', count: 1}],
      storageUsedGb: 0,
      storageLimitGb: 0,
    },
    filter: {
      query: '',
      tagId: 'all',
      collectionId: 'all',
      scope: 'recent',
      sortBy: 'lastOpened',
      viewMode: 'list',
    },
    screenMode: 'library',
    selectedDocumentId: 'persisted-imported-pdf',
    viewerState: {
      documentId: 'persisted-imported-pdf',
      pageCount: 7,
      pageIndex: 3,
      zoom: 1.25,
      activeTool: 'select',
      inspectorTab: 'info',
      showThumbnails: true,
      searchQuery: '',
    },
    annotations: [],
    signatures: [
      {
        id: 'signature-persisted',
        label: 'Ben',
        value: 'Ben Ebsworth',
        updatedAt: persistedAt,
      },
    ],
    activeSignatureId: 'signature-persisted',
    accountState: {signedIn: false, plan: 'free'},
    compareSynced: true,
    updatedAt: persistedAt,
  };
  jest
    .spyOn(PdfKitBridge, 'readSidecar')
    .mockResolvedValueOnce(JSON.stringify(persistedState));
  const writeSpy = jest
    .spyOn(PdfKitBridge, 'writeSidecar')
    .mockResolvedValue(true);
  jest.spyOn(PdfKitBridge, 'seedDemoPdfs').mockResolvedValueOnce([
    {
      id: 'q4-market-analysis',
      title: 'Q4 Market Analysis Report',
      author: 'Analytics Team',
      pageCount: 32,
      sizeMb: 0.25,
      createdAt: persistedAt,
      modifiedAt: persistedAt,
      path: '/tmp/acacia-demo/q4-market-analysis.pdf',
      bookmark: '',
    },
  ]);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Persisted Imported PDF');
  expect(JSON.stringify(renderer?.toJSON())).toContain('recent-table');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-open-action'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());
  expect(output).toContain('Viewer screen Persisted Imported PDF');
  expect(output).toContain('Page 4 of 7');
  expect(writeSpy).toHaveBeenCalledWith(
    '__acacia_app_state__',
    expect.stringContaining('persisted-imported-pdf'),
  );
});

test('screenshot launches ignore persisted sidecar state', async () => {
  const persistedAt = '2026-05-13T08:30:00.000Z';
  const persistedState = {
    schemaVersion: 1,
    libraryState: {
      documents: [
        importedPdfToDocument({
          id: 'persisted-imported-pdf',
          title: 'Persisted Imported PDF',
          author: 'Local Author',
          pageCount: 7,
          sizeMb: 3.4,
          createdAt: persistedAt,
          modifiedAt: persistedAt,
          path: '/tmp/persisted-imported.pdf',
          bookmark: 'persisted-bookmark',
        }),
      ],
      tags: [{id: 'work', label: 'Work', tone: 'blue'}],
      collections: [{id: 'archive', label: 'Archive', count: 1}],
      storageUsedGb: 0,
      storageLimitGb: 0,
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
    selectedDocumentId: 'persisted-imported-pdf',
    viewerState: {
      documentId: 'persisted-imported-pdf',
      pageCount: 7,
      pageIndex: 3,
      zoom: 1.25,
      activeTool: 'select',
      inspectorTab: 'info',
      showThumbnails: true,
      searchQuery: '',
    },
    annotations: [],
    signatures: [],
    activeSignatureId: '',
    accountState: {signedIn: false, plan: 'free'},
    compareSynced: true,
    updatedAt: persistedAt,
  };
  const readSpy = jest
    .spyOn(PdfKitBridge, 'readSidecar')
    .mockResolvedValueOnce(JSON.stringify(persistedState));
  const writeSpy = jest
    .spyOn(PdfKitBridge, 'writeSidecar')
    .mockResolvedValue(true);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App screenshotMode="library" />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  const output = JSON.stringify(renderer?.toJSON());
  expect(readSpy).not.toHaveBeenCalled();
  expect(writeSpy).not.toHaveBeenCalled();
  expect(output).toContain('Library');
  expect(output).toContain('Q4 Market Analysis Report');
  expect(output).not.toContain('Persisted Imported PDF');
  expect(output).not.toContain('Viewer screen Persisted Imported PDF');
});

test('renders real PDF thumbnail rail pages from cached page images', async () => {
  const importedAt = '2026-05-12T12:00:00.000Z';
  const renderPageThumbnail = jest.spyOn(PdfKitBridge, 'renderPageThumbnail').mockImplementation(
    async (
      _path: string,
      pageIndex: number,
      _bookmark = '',
      documentId = 'document',
    ) => `/tmp/acacia-thumbnails/${documentId}/page-${pageIndex}.png`,
  );
  jest.spyOn(PdfKitBridge, 'openPdf').mockResolvedValueOnce({
    id: 'manual-imported-pdf',
    title: 'Manual Imported PDF',
    author: 'Local Author',
    pageCount: 5,
    sizeMb: 2.5,
    createdAt: importedAt,
    modifiedAt: importedAt,
    path: '/tmp/manual-imported.pdf',
    bookmark: 'bookmark-data',
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'open-file-button'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  expect(renderPageThumbnail).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    0,
    'bookmark-data',
    'manual-imported-pdf',
  );
  expect(renderPageThumbnail).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    4,
    'bookmark-data',
    'manual-imported-pdf',
  );
  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'thumbnail-image-page-1',
  );
  expect(
    renderer!.root.findByProps({testID: 'thumbnail-image-page-1'}).props
      .resizeMode,
  ).toBe('contain');
  expect(
    StyleSheet.flatten(
      renderer!.root.findByProps({testID: 'thumbnail-image-page-1'}).props
        .style,
    ),
  ).toEqual(
    expect.objectContaining({
      width: 84,
      height: 119,
    }),
  );
  expect(JSON.stringify(renderer?.toJSON())).toContain(
    '/tmp/acacia-thumbnails/manual-imported-pdf/page-0.png',
  );
});

test('opening a PDF from the macOS File menu imports it and promotes it to recent', async () => {
  const importedAt = '2026-05-12T12:00:00.000Z';
  let menuOpenListener:
    | Parameters<typeof PdfKitBridge.addOpenedPdfListener>[0]
    | undefined;
  const removeListener = jest.fn();
  jest
    .spyOn(PdfKitBridge, 'addOpenedPdfListener')
    .mockImplementation(listener => {
      menuOpenListener = listener;
      return {remove: removeListener} as any;
    });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    menuOpenListener?.({
      id: 'menu-imported-pdf',
      title: 'Menu Imported PDF',
      author: 'Local Author',
      pageCount: 9,
      sizeMb: 3.1,
      createdAt: importedAt,
      modifiedAt: importedAt,
      path: '/tmp/menu-imported.pdf',
      bookmark: 'menu-bookmark',
    });
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Viewer screen Menu Imported PDF',
  );

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-library-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'nav-recent'}).props.onPress();
  });

  expect(visibleGridDocumentIds(renderer!)[0]).toBe(
    'doc-card-menu-imported-pdf',
  );
});

test('seeded demo PDFs attach real local paths for PDFKit-backed demo validation', async () => {
  const seededAt = '2026-05-12T12:00:00.000Z';
  const exportImageSpy = jest
    .spyOn(PdfKitBridge, 'exportPageImage')
    .mockResolvedValueOnce('/tmp/acacia-seeded-page.png');
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
  jest.spyOn(PdfKitBridge, 'seedDemoPdfs').mockResolvedValueOnce([
    {
      id: 'q4-market-analysis',
      title: 'Q4 Market Analysis Report',
      author: 'Analytics Team',
      pageCount: 32,
      sizeMb: 0.25,
      createdAt: seededAt,
      modifiedAt: seededAt,
      path: '/tmp/acacia-demo/q4-market-analysis.pdf',
      bookmark: '',
    },
  ]);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'export-png-action'}).props.onPress();
  });

  expect(exportImageSpy).toHaveBeenCalledWith(
    '/tmp/acacia-demo/q4-market-analysis.pdf',
    0,
    '',
    'png',
  );
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Export ready',
    expect.stringContaining('/tmp/acacia-seeded-page.png'),
  );
});

test('opening an existing document promotes it to the top of recent documents', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-invoice-0042'})[0]
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-library-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'nav-recent'}).props.onPress();
  });

  expect(visibleGridDocumentIds(renderer!)[0]).toBe(
    'doc-card-invoice-0042',
  );
});

test('viewer thumbnail rail only offers pages that exist for short documents', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-invoice-0042'})[0]
      .props.onPress();
  });

  expect(
    renderer!.root.findAllByProps({testID: 'thumbnail-page-4'}).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findAllByProps({testID: 'thumbnail-page-8'}),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({testID: 'thumbnail-page-12'}),
  ).toHaveLength(0);
});

test('bottom scrubber exposes navigation to the final page of long documents', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-product-roadmap'})[0]
      .props.onPress();
  });

  expect(
    renderer!.root.findAllByProps({testID: 'scrubber-page-44'}).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'scrubber-page-44'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Page 44 of 44');
});

test('desktop export actions use the native PDFKit bridge for imported PDFs', async () => {
  const importedAt = '2026-05-12T12:00:00.000Z';
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
  jest.spyOn(PdfKitBridge, 'openPdf').mockResolvedValueOnce({
    id: 'manual-imported-pdf',
    title: 'Manual Imported PDF',
    author: 'Local Author',
    pageCount: 5,
    sizeMb: 2.5,
    createdAt: importedAt,
    modifiedAt: importedAt,
    path: '/tmp/manual-imported.pdf',
    bookmark: 'bookmark-data',
  });
  const exportImageSpy = jest
    .spyOn(PdfKitBridge, 'exportPageImage')
    .mockResolvedValueOnce('/tmp/acacia-page-0.png');
  const exportTextSpy = jest
    .spyOn(PdfKitBridge, 'exportPageText')
    .mockResolvedValueOnce('/tmp/acacia-page-0.txt');
  const exportAnnotatedSpy = jest
    .spyOn(PdfKitBridge, 'exportAnnotatedCopy')
    .mockResolvedValueOnce('/tmp/manual-imported-annotated.pdf');
  const exportMarkdownSpy = jest
    .spyOn(PdfKitBridge, 'exportMarkdown')
    .mockResolvedValueOnce('/tmp/manual-imported.md');
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'open-file-button'}).props.onPress();
  });

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'export-png-action'}).props.onPress();
  });

  expect(exportImageSpy).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    0,
    'bookmark-data',
    'png',
  );
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Export ready',
    expect.stringContaining('/tmp/acacia-page-0.png'),
  );

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'export-text-action'}).props.onPress();
  });

  expect(exportTextSpy).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    0,
    'bookmark-data',
  );
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Export ready',
    expect.stringContaining('/tmp/acacia-page-0.txt'),
  );

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'export-annotated-action'}).props.onPress();
  });

  expect(exportAnnotatedSpy).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    expect.any(Array),
    'bookmark-data',
  );
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Export ready',
    expect.stringContaining('/tmp/manual-imported-annotated.pdf'),
  );

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({testID: 'export-markdown-action'}).props.onPress();
  });

  expect(exportMarkdownSpy).toHaveBeenCalledWith(
    '/tmp/manual-imported.pdf',
    'bookmark-data',
  );
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Export ready',
    expect.stringContaining('/tmp/manual-imported.md'),
  );
});

test('imported PDF records retain the security-scoped bookmark', () => {
  const document = importedPdfToDocument({
    id: 'manual-imported-pdf',
    title: 'Manual Imported PDF',
    author: 'Local Author',
    pageCount: 5,
    sizeMb: 2.5,
    createdAt: '2026-05-12T12:00:00.000Z',
    modifiedAt: '2026-05-12T12:00:00.000Z',
    path: '/tmp/manual-imported.pdf',
    bookmark: 'bookmark-data',
  });

  expect(document.bookmark).toBe('bookmark-data');
});

test('library supports adding collections and tags from the visible controls', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'add-collection-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('New Collection');
  expect(JSON.stringify(renderer?.toJSON())).toContain('0');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'add-tag-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Research');
});

test('viewer search navigates within demo documents', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  try {
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<App />);
    });

    await ReactTestRenderer.act(() => {
      renderer!.root.findAllByProps({testID: 'doc-card-future-work'})[0].props.onPress();
    });

    const searchInput = renderer!.root.findByProps({
      testID: 'document-search-input',
    });

    await ReactTestRenderer.act(() => {
      searchInput.props.onChangeText('hybrid');
    });

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(JSON.stringify(renderer?.toJSON())).toContain('Page 12 of 32');
    expect(
      renderer!.root.findAll(
        instance =>
          typeof instance.props.testID === 'string' &&
          instance.props.testID.startsWith('pdf-search-highlight-'),
      ).length,
    ).toBeGreaterThan(0);
  } finally {
    jest.useRealTimers();
  }
});

test('signature manager saves a custom signature and stamps it on the clicked page', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findAllByProps({testID: 'doc-card-q4-market-analysis'})[0].props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-signature'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'signature-name-input'}).props.onChangeText('Ben Ebsworth');
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'save-signature-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 210, locationY: 320},
    });
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Ben Ebsworth');
  expect(JSON.stringify(renderer?.toJSON())).toContain('pdf-annotation-signature');
});

test('signature tool opens the manager even after comments are selected', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findAllByProps({testID: 'doc-card-q4-market-analysis'})[0].props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-add-note'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('comments-paywall');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'tool-signature'}).props.onPress();
  });

  const output = JSON.stringify(renderer?.toJSON());
  expect(output).toContain('signature-manager');
  expect(output).toContain('pdf-tool-hint');
});

test('note and drawing tools create page-anchored review items', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findAllByProps({testID: 'doc-card-q4-market-analysis'})[0].props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-add-note'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('pdf-tool-hint');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 180, locationY: 240},
    });
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Local note on page 1');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-tab-info'}).props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-draw'}).props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 220, locationY: 320},
    });
  });

  const output = JSON.stringify(renderer?.toJSON());
  expect(output).toContain('Local drawing on page 1');
  expect(output).toContain('comment-filter-drawings');
});

test('comments panel filters highlights and signatures as actionable controls', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findAllByProps({testID: 'doc-card-q4-market-analysis'})[0].props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-highlight'}).props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 180, locationY: 260},
    });
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'tool-signature'}).props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 240, locationY: 360},
    });
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'inspector-tab-comments'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'comment-filter-signatures'}).props.onPress();
  });

  expect(signatureCommentItems(renderer!).length).toBeGreaterThan(0);
  expect(localHighlightCommentItems(renderer!)).toHaveLength(0);
  expect(
    visibleCommentItemIds(renderer!).every(testID =>
      testID.startsWith('comment-item-signature-'),
    ),
  ).toBe(true);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'comment-filter-highlights'}).props.onPress();
  });

  expect(localHighlightCommentItems(renderer!)).toHaveLength(1);
  expect(signatureCommentItems(renderer!)).toHaveLength(0);
});

test('desktop sidebar scopes recent favorite and shared documents', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Favorites');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Favorite Documents');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-product-roadmap',
    'doc-card-future-work',
  ]);

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Shared');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Shared Documents');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-competitive-landscape',
    'doc-card-board-minutes-apr',
  ]);

  await ReactTestRenderer.act(() => {
    pressSidebarItem(renderer!, 'Recent');
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Recently Opened');
  expect(visibleGridDocumentIds(renderer!)).toEqual([
    'doc-card-q4-market-analysis',
    'doc-card-competitive-landscape',
    'doc-card-product-roadmap',
    'doc-card-annual-financial-report',
    'doc-card-future-work',
    'doc-card-board-minutes-apr',
    'doc-card-marketing-strategy',
    'doc-card-invoice-0042',
  ]);
});

test('desktop viewer bookmark and compare sync controls update visible state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findAllByProps({testID: 'doc-card-q4-market-analysis'})[0]
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'quick-action-bookmark'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'Sign in to unlock comments',
  );

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Bookmark on page 1');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'viewer-compare-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Sync On');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'sync-scroll-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain('Sync Off');
});

test('opens directly into the viewer info screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="viewer-info" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Q4 Market Analysis Report');
  expect(output).toContain('Page 8 of 32');
  expect(output).toContain('Info');
});

test('opens directly into the comments screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="comments" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Viewer screen Future of Work Report');
  expect(output).toContain('Page 12 of 32');
  expect(output).toContain('Comments');
  expect(output).toContain('Sign in to unlock comments');
});

test('opens directly into the compare screenshot state', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App screenshotMode="compare" />);
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('Compare screen Q4 Market Analysis Report');
  expect(output).toContain('Changes panel');
  expect(output).toContain('Added');
  expect(output).toContain('Page 8 of 32');
});

test('desktop library search opens a command palette with matched documents and actions', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'library-search-input'})
      .props.onChangeText('steady growth');
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('command-palette');
  expect(output).toContain('Ask across library');
  expect(output).toContain('Q4 Market Analysis Report');
  expect(output).toContain('steady growth');
});

test('desktop viewer outline screenshot state renders the editorial reader shell', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <App screenshotMode={'viewer-outline' as never} />,
    );
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('reader-outline-panel');
  expect(output).toContain('Product Roadmap 2025');
  expect(output).toContain('Why now');
  expect(output).toContain('Vision');
});

test('mobile highlight creation opens the annotation action sheet', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 150, locationY: 220},
    });
  });

  const output = JSON.stringify(renderer?.toJSON());

  expect(output).toContain('mobile-annotation-sheet');
  expect(output).toContain('Note');
  expect(output).toContain('Ask');
  expect(output).toContain('Link');
  expect(output).toContain('Share');
  expect(output).toContain('mobile-annotation-note');
  expect(output).toContain('mobile-annotation-ask');
  expect(output).toContain('mobile-annotation-link');
  expect(output).toContain('mobile-annotation-share');
});

test('mobile annotation sheet hides the underlying detail panel until dismissed', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App forceCompactLayout />);
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({testID: 'mobile-doc-row-q4-market-analysis'})
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-highlight'}).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'pdf-demo-page-hitbox-1'}).props.onResponderRelease({
      nativeEvent: {locationX: 150, locationY: 220},
    });
  });

  expect(
    renderer!.root.findByProps({testID: 'mobile-detail-panel'}).props
      .accessibilityElementsHidden,
  ).toBe(true);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'mobile-annotation-close'}).props.onPress();
  });

  expect(
    renderer!.root.findByProps({testID: 'mobile-detail-panel'}).props
      .accessibilityElementsHidden,
  ).toBe(false);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({testID: 'unlock-comments-button'}).props.onPress();
  });

  expect(JSON.stringify(renderer?.toJSON())).toContain(
    'comment-item-local-highlight',
  );
});
