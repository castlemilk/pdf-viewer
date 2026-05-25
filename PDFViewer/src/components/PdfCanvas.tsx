import React, {useEffect, useRef, useState} from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  requireNativeComponent,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import {
  annotationBoundsForCanonicalPoints,
  annotationBoundsForPageGesture,
  annotationBoundsToFallbackStyle,
  annotationSizeForKind,
  canonicalInkPathForPagePoints,
} from '../domain/annotationGeometry';
import type {
  Annotation,
  AnnotationKind,
  DocumentRecord,
  PdfPoint,
  ViewerState,
  ViewerTool,
} from '../domain/types';

type NativePdfCanvasProps = {
  testID?: string;
  accessible?: boolean;
  documentPath?: string;
  documentBookmark?: string;
  pageIndex: number;
  zoom: number;
  activeTool?: string;
  annotations: Annotation[];
  searchHighlights: SearchHighlight[];
  signaturePreviewText?: string;
  accessibilityIgnoresInvertColors?: boolean;
  onCanvasPress?: (event: {
    nativeEvent: CanvasAnnotationRequest;
  }) => void;
  onCanvasAccessibilityAction?: (event: {
    nativeEvent: {
      actionName: string;
    };
  }) => void;
  style?: StyleProp<ViewStyle>;
};

type PdfCanvasProps = {
  document: DocumentRecord;
  viewer: ViewerState;
  annotations: Annotation[];
  searchHighlights?: SearchHighlight[];
  signaturePreviewText?: string;
  compact?: boolean;
  onCreateAnnotation?: (request: CanvasAnnotationRequest) => void;
  onPageChange?: (pageIndex: number) => void;
};

export type CanvasAnnotationRequest = {
  kind: Extract<AnnotationKind, 'highlight' | 'note' | 'drawing' | 'signature'>;
  pageIndex: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points?: PdfPoint[];
};

export type SearchHighlight = {
  id: string;
  pageIndex: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

const NativePdfCanvas =
  (Platform.OS as string) === 'macos' ||
  ((Platform.OS as string) === 'ios' && !isJestRuntime())
    ? requireNativeComponent<NativePdfCanvasProps>('PdfCanvas')
    : undefined;

const pageAccessibilityActions = [
  {name: 'decrement', label: 'Previous page'},
  {name: 'increment', label: 'Next page'},
];

export function PdfCanvas({
  document,
  viewer,
  annotations,
  searchHighlights = [],
  signaturePreviewText,
  compact = false,
  onCreateAnnotation,
  onPageChange,
}: PdfCanvasProps) {
  const [viewportSize, setViewportSize] = useState({width: 0, height: 0});
  const [signaturePreview, setSignaturePreview] = useState<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pageWidth = getPageWidth(viewportSize, compact);
  const pageHeight = pageWidth / pageAspectRatio;
  const scaledPageWidth = roundLayout(pageWidth * viewer.zoom);
  const scaledPageHeight = roundLayout(pageHeight * viewer.zoom);
  const pageGap = compact ? 18 : 26;
  const interactiveKind = canvasAnnotationKindForTool(viewer.activeTool);
  const canvasA11yLabel = pdfCanvasAccessibilityLabel({
    document,
    pageIndex: viewer.pageIndex,
    zoom: viewer.zoom,
    annotations,
    interactiveKind,
  });
  const canvasA11yValue = {
    min: 1,
    max: document.pageCount,
    now: viewer.pageIndex + 1,
    text: `Page ${viewer.pageIndex + 1} of ${document.pageCount}`,
  };
  const canvasA11yActions = canvasAccessibilityActions(interactiveKind);
  const useIosNativeAccessibility = (Platform.OS as string) === 'ios';
  const handleCenteredToolAnnotation = (pageIndex: number) => {
    if (!interactiveKind) {
      return;
    }

    onCreateAnnotation?.(
      centeredToolAnnotation(
        interactiveKind,
        pageIndex,
        pageWidth,
        pageHeight,
      ),
    );
  };
  const handleCanvasAccessibilityAction = (actionName: string) => {
    if (actionName === 'increment' && viewer.pageIndex < document.pageCount - 1) {
      onPageChange?.(viewer.pageIndex + 1);
    }

    if (actionName === 'decrement' && viewer.pageIndex > 0) {
      onPageChange?.(viewer.pageIndex - 1);
    }

    if (actionName === 'activate') {
      handleCenteredToolAnnotation(viewer.pageIndex);
    }
  };
  const handlePageAccessibilityAction = (event: AccessibilityActionEvent) => {
    handleCanvasAccessibilityAction(event.nativeEvent.actionName);
  };
  const signaturePreviewSize = annotationSizeForKind('signature');
  const gestureStartRef = useRef<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const gesturePointsRef = useRef<
    Array<{
      pageIndex: number;
      x: number;
      y: number;
    }>
  >([]);

  useEffect(() => {
    if (document.path) {
      return;
    }

    scrollRef.current?.scrollTo({
      y: viewer.pageIndex * (scaledPageHeight + pageGap),
      animated: false,
    });
  }, [document.path, pageGap, scaledPageHeight, viewer.pageIndex]);

  if (document.path && NativePdfCanvas) {
    return (
      <View
        style={styles.nativeCanvasFrame}
        testID="pdf-canvas-native-frame"
        accessible={!useIosNativeAccessibility}
        accessibilityRole="adjustable"
        accessibilityLabel={canvasA11yLabel}
        accessibilityHint={nativeCanvasAccessibilityHint(interactiveKind)}
        accessibilityActions={canvasA11yActions}
        accessibilityValue={canvasA11yValue}
        accessibilityLanguage="en"
        accessibilityIgnoresInvertColors
        onAccessibilityAction={
          useIosNativeAccessibility ? undefined : handlePageAccessibilityAction
        }>
        <NativePdfCanvas
          testID="pdf-canvas-native"
          accessible={useIosNativeAccessibility}
          accessibilityIgnoresInvertColors
          documentPath={document.path}
          documentBookmark={document.bookmark}
          pageIndex={viewer.pageIndex}
          zoom={viewer.zoom}
          activeTool={interactiveKind}
          annotations={annotations}
          searchHighlights={searchHighlights}
          signaturePreviewText={signaturePreviewText}
          onCanvasPress={event => {
            if (!interactiveKind) {
              return;
            }

            onCreateAnnotation?.({
              ...event.nativeEvent,
              kind: interactiveKind,
            });
          }}
          onCanvasAccessibilityAction={(event: {
            nativeEvent: {actionName: string};
          }) => {
            handleCanvasAccessibilityAction(event.nativeEvent.actionName);
          }}
          style={styles.nativeCanvas}
        />
        <ToolHint kind={interactiveKind} />
      </View>
    );
  }

  return (
    <View
      testID="pdf-canvas-fallback"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={canvasA11yLabel}
      accessibilityHint={nativeCanvasAccessibilityHint(interactiveKind)}
      accessibilityActions={canvasA11yActions}
      accessibilityValue={canvasA11yValue}
      accessibilityLanguage="en"
      accessibilityIgnoresInvertColors
      onAccessibilityAction={handlePageAccessibilityAction}
      onLayout={(event: LayoutChangeEvent) => {
        const {width, height} = event.nativeEvent.layout;
        setViewportSize({width, height});
      }}
      style={styles.canvas}>
      <ToolHint kind={interactiveKind} />
      <ScrollView
        ref={scrollRef}
        testID="pdf-demo-scroll"
        scrollEnabled={interactiveKind === undefined}
        accessibilityLabel={canvasA11yLabel}
        accessibilityHint={nativeCanvasAccessibilityHint(interactiveKind)}
        accessibilityLanguage="en"
        accessibilityIgnoresInvertColors
        style={styles.demoScroll}
        contentContainerStyle={[
          styles.demoScrollContent,
          compact && styles.demoScrollContentCompact,
        ]}
        onScroll={event => {
          const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
          const nextPage = Math.max(
            0,
            Math.min(
              document.pageCount - 1,
              Math.round(offsetY / (scaledPageHeight + pageGap)),
            ),
          );

          if (nextPage !== viewer.pageIndex) {
            onPageChange?.(nextPage);
          }
        }}
        scrollEventThrottle={80}>
        {Array.from({length: document.pageCount}, (_, pageIndex) => (
          <View
            key={pageIndex}
            testID={`pdf-demo-page-frame-${pageIndex + 1}`}
            accessible={false}
            accessibilityIgnoresInvertColors
            style={[
              styles.demoPageFrame,
              demoPageFrameStyle(
                pageIndex,
                document.pageCount,
                scaledPageWidth,
                scaledPageHeight,
                pageGap,
              ),
            ]}>
            <View
              testID={`pdf-demo-page-${pageIndex + 1}`}
              style={[
                styles.page,
                styles.demoPageContent,
                compact && styles.pageCompact,
                {
                  width: pageWidth,
                  transform: [{scale: viewer.zoom}],
                },
              ]}>
              <DemoPageContent document={document} pageIndex={pageIndex} />
              {annotations
                .filter(annotation => annotation.pageIndex === pageIndex)
                .map(annotation => (
                  <AnnotationOverlay
                    key={annotation.id}
                    annotation={annotation}
                  />
                ))}
              {searchHighlights
                .filter(highlight => highlight.pageIndex === pageIndex)
                .map(highlight => (
                  <SearchHighlightOverlay
                    key={highlight.id}
                    highlight={highlight}
                  />
                ))}
              {interactiveKind === 'signature' &&
              signaturePreview?.pageIndex === pageIndex ? (
                <View
                  testID="pdf-signature-preview"
                  pointerEvents="none"
                  style={[
                    styles.signaturePreview,
                    {
                      left: Math.min(
                        pageWidth - signaturePreviewSize.width - 10,
                        Math.max(8, signaturePreview.x - signaturePreviewSize.width / 2),
                      ),
                      top: Math.min(
                        pageHeight - 58,
                        Math.max(8, signaturePreview.y - 24),
                      ),
                    },
                  ]}>
                  <Text style={styles.signaturePreviewText}>
                    {signaturePreviewText || 'Signature'}
                  </Text>
                </View>
              ) : null}
            </View>
            {interactiveKind ? (
              <View
                testID={`pdf-demo-page-hitbox-${pageIndex + 1}`}
                accessible
                accessibilityRole="button"
                accessibilityLabel={pageToolActionAccessibilityLabel(
                  interactiveKind,
                  pageIndex,
                )}
                accessibilityHint={toolHintCopy(interactiveKind)}
                accessibilityActions={[
                  {
                    name: 'activate',
                    label: `Add ${annotationKindLabel(interactiveKind).toLowerCase()} at page center`,
                  },
                ]}
                onAccessibilityAction={event => {
                  if (event.nativeEvent.actionName === 'activate') {
                    handleCenteredToolAnnotation(pageIndex);
                  }
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event: GestureResponderEvent) => {
                  const point = pagePointFromVisualPoint(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                    viewer.zoom,
                  );
                  gestureStartRef.current = {
                    pageIndex,
                    ...point,
                  };
                  gesturePointsRef.current = [{pageIndex, ...point}];
                  if (interactiveKind === 'signature') {
                    setSignaturePreview({pageIndex, ...point});
                  }
                }}
                onResponderMove={(event: GestureResponderEvent) => {
                  const point = pagePointFromVisualPoint(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                    viewer.zoom,
                  );

                  if (interactiveKind === 'signature') {
                    setSignaturePreview({pageIndex, ...point});
                    return;
                  }

                  if (interactiveKind !== 'drawing') {
                    return;
                  }

                  gesturePointsRef.current = [
                    ...gesturePointsRef.current,
                    {pageIndex, ...point},
                  ];
                }}
                onResponderRelease={(event: GestureResponderEvent) => {
                  const endPoint = pagePointFromVisualPoint(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                    viewer.zoom,
                  );
                  const gesturePoints =
                    interactiveKind === 'drawing'
                      ? [
                          ...gesturePointsRef.current.filter(
                            point => point.pageIndex === pageIndex,
                          ),
                          {pageIndex, ...endPoint},
                        ]
                      : undefined;
                  const gestureStart =
                    gestureStartRef.current?.pageIndex === pageIndex
                      ? gestureStartRef.current
                      : undefined;
                  gestureStartRef.current = null;
                  gesturePointsRef.current = [];
                  setSignaturePreview(null);
                  onCreateAnnotation?.(
                    canvasGestureToAnnotation(
                      interactiveKind,
                      pageIndex,
                      {
                        x: gestureStart?.x ?? endPoint.x,
                        y: gestureStart?.y ?? endPoint.y,
                      },
                      endPoint,
                      pageWidth,
                      pageHeight,
                      gesturePoints?.map(point => ({
                        x: point.x,
                        y: point.y,
                      })),
                    ),
                  );
                }}
                onResponderTerminate={() => {
                  gestureStartRef.current = null;
                  gesturePointsRef.current = [];
                  setSignaturePreview(null);
                }}
                style={styles.demoPageHitbox}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

type InteractiveAnnotationKind = CanvasAnnotationRequest['kind'];

function canvasAnnotationKindForTool(
  tool: ViewerTool,
): InteractiveAnnotationKind | undefined {
  switch (tool) {
    case 'highlight':
      return 'highlight';
    case 'comment':
      return 'note';
    case 'pen':
      return 'drawing';
    case 'signature':
      return 'signature';
    default:
      return undefined;
  }
}

function ToolHint({kind}: {kind?: InteractiveAnnotationKind}) {
  if (!kind) {
    return null;
  }

  const copy = toolHintCopy(kind);

  return (
    <View
      testID="pdf-tool-hint"
      pointerEvents="none"
      accessible
      accessibilityLabel={copy}
      accessibilityHint="Describes the active PDF annotation tool"
      accessibilityLiveRegion="polite"
      style={styles.toolHint}>
      <Text style={styles.toolHintText}>{copy}</Text>
    </View>
  );
}

function pdfCanvasAccessibilityLabel({
  document,
  pageIndex,
  zoom,
  annotations,
  interactiveKind,
}: {
  document: DocumentRecord;
  pageIndex: number;
  zoom: number;
  annotations: Annotation[];
  interactiveKind?: InteractiveAnnotationKind;
}) {
  const pageAnnotations = annotations.filter(
    annotation => annotation.pageIndex === pageIndex,
  );
  const toolCopy = interactiveKind
    ? `, ${annotationKindLabel(interactiveKind)} tool active`
    : '';

  return `${document.title} PDF canvas, page ${pageIndex + 1} of ${document.pageCount}, zoom ${Math.round(zoom * 100)}%, ${pageAnnotations.length} annotations on this page${toolCopy}`;
}

function nativeCanvasAccessibilityHint(kind?: InteractiveAnnotationKind) {
  if (!kind) {
    return 'Scroll to read the PDF page';
  }

  return toolHintCopy(kind);
}

function pageToolActionAccessibilityLabel(
  kind: InteractiveAnnotationKind,
  pageIndex: number,
) {
  return `${annotationKindLabel(kind)} on page ${pageIndex + 1}`;
}

function canvasAccessibilityActions(kind?: InteractiveAnnotationKind) {
  if (!kind) {
    return pageAccessibilityActions;
  }

  return [...pageAccessibilityActions, toolActivationAction(kind)];
}

function toolActivationAction(kind: InteractiveAnnotationKind) {
  return {
    name: 'activate',
    label: `Add ${annotationKindLabel(kind).toLowerCase()} at page center`,
  };
}

function annotationKindLabel(kind: InteractiveAnnotationKind) {
  switch (kind) {
    case 'signature':
      return 'Signature';
    case 'note':
      return 'Note';
    case 'drawing':
      return 'Pen drawing';
    case 'highlight':
    default:
      return 'Highlight';
  }
}

const pageAspectRatio = 0.707;

function getPageWidth(
  viewport: {width: number; height: number},
  compact: boolean,
) {
  const fallbackWidth = compact ? 320 : 620;

  if (viewport.width <= 0 || viewport.height <= 0) {
    return fallbackWidth;
  }

  const padding = compact ? 24 : 48;
  const maxWidth = compact ? 520 : 720;
  const minWidth = compact ? 220 : 320;
  const availableWidth = Math.max(0, viewport.width - padding);
  const availableHeight = Math.max(0, viewport.height - padding);
  const fitWidth = Math.min(
    maxWidth,
    availableWidth,
    availableHeight * pageAspectRatio,
  );
  const floorWidth = Math.min(minWidth, availableWidth);

  return Math.round(Math.max(floorWidth, fitWidth));
}

function roundLayout(value: number) {
  return Number(value.toFixed(4));
}

function pagePointFromVisualPoint(x: number, y: number, zoom: number) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  return {
    x: x / safeZoom,
    y: y / safeZoom,
  };
}

function demoPageFrameStyle(
  pageIndex: number,
  pageCount: number,
  width: number,
  height: number,
  pageGap: number,
): ViewStyle {
  return {
    width,
    height,
    marginBottom: pageIndex === pageCount - 1 ? 0 : pageGap,
  };
}

function toolHintCopy(kind: InteractiveAnnotationKind) {
  switch (kind) {
    case 'signature':
      return 'Signature ready - click a page to stamp it';
    case 'note':
      return 'Note ready - click a page to place it';
    case 'drawing':
      return 'Pen ready - drag on the page to draw';
    case 'highlight':
    default:
      return 'Highlighter ready - drag a page or select text, then press Highlight';
  }
}

function centeredToolAnnotation(
  kind: InteractiveAnnotationKind,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
) {
  const center = {
    x: pageWidth * 0.5,
    y: pageHeight * 0.45,
  };

  if (kind === 'highlight') {
    return canvasGestureToAnnotation(
      kind,
      pageIndex,
      {x: pageWidth * 0.32, y: pageHeight * 0.42},
      {x: pageWidth * 0.68, y: pageHeight * 0.45},
      pageWidth,
      pageHeight,
    );
  }

  if (kind === 'drawing') {
    return canvasGestureToAnnotation(
      kind,
      pageIndex,
      {x: pageWidth * 0.38, y: pageHeight * 0.47},
      {x: pageWidth * 0.62, y: pageHeight * 0.47},
      pageWidth,
      pageHeight,
      [
        {x: pageWidth * 0.38, y: pageHeight * 0.47},
        center,
        {x: pageWidth * 0.62, y: pageHeight * 0.47},
      ],
    );
  }

  return canvasGestureToAnnotation(
    kind,
    pageIndex,
    center,
    center,
    pageWidth,
    pageHeight,
  );
}

function canvasGestureToAnnotation(
  kind: InteractiveAnnotationKind,
  pageIndex: number,
  start: {x: number; y: number},
  end: {x: number; y: number},
  pageWidth: number,
  pageHeight: number,
  points?: Array<{x: number; y: number}>,
): CanvasAnnotationRequest {
  if (kind === 'drawing' && points && points.length > 1) {
    const canonicalPoints = canonicalInkPathForPagePoints({
      pageSize: {width: pageWidth, height: pageHeight},
      points,
    });

    return {
      kind,
      pageIndex,
      bounds: annotationBoundsForCanonicalPoints(canonicalPoints),
      points: canonicalPoints,
    };
  }

  return {
    kind,
    pageIndex,
    bounds: annotationBoundsForPageGesture({
      kind,
      pageSize: {width: pageWidth, height: pageHeight},
      start,
      end,
    }),
  };
}

function DemoPageContent({
  document,
  pageIndex,
}: {
  document: DocumentRecord;
  pageIndex: number;
}) {
  const isRoadmap = document.id === 'product-roadmap';

  return (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.pageKicker}>
          {isRoadmap ? 'PRODUCT ROADMAP 2025 · VISION' : document.title}
        </Text>
        <Text style={styles.pageNumber}>{pageIndex + 1}</Text>
      </View>
      <Text
        testID={`pdf-demo-title-${pageIndex + 1}`}
        selectable
        style={styles.pageTitle}>
        {isRoadmap
          ? 'Why now'
          : document.id === 'future-work'
            ? 'The Hybrid Work Evolution'
            : 'Market Overview'}
      </Text>
      {isRoadmap ? (
        <>
          <Text selectable style={styles.readerParagraph}>
            Three forces are converging that make 2025 the right year to
            commit. First, the cost of high-quality models has fallen by an
            order of magnitude in the last twelve months; what once required
            dedicated infrastructure now runs at the edge.
          </Text>
          <Text selectable style={[styles.readerParagraph, styles.highlightedLine]}>
            Second, customer behavior has shifted: enterprises are no longer
            evaluating AI in isolation but as a layer threaded through existing
            workflows.
          </Text>
          <Text selectable style={styles.readerParagraph}>
            Third, the regulatory picture has clarified enough to plan without
            guessing.
          </Text>
          <Text selectable style={styles.readerHeading}>
            Three commitments
          </Text>
          <Text selectable style={styles.readerParagraph}>
            We are organizing the year around three commitments, deliberately
            fewer than last year. Each is owned end-to-end by a named lead,
            with quarterly checkpoints and a single success metric.
          </Text>
        </>
      ) : (
        <Text selectable style={styles.blueLead}>
          Global markets closed the year with steady growth across key segments.
        </Text>
      )}
      <Text
        testID={`pdf-demo-body-${pageIndex + 1}`}
        selectable
        style={isRoadmap ? styles.readerParagraph : styles.paragraph}>
        {isRoadmap
          ? 'The first commitment, Platform, replaces our patchwork of integrations with a single contract surface.'
          : 'The document view is powered by PDFKit for local PDFs and this fixture surface for the built-in demo set. Imported documents render in the native PDF canvas.'}
      </Text>
      {isRoadmap ? null : (
        <>
          <View
            testID={pageIndex === 0 ? 'pdf-canvas-chart' : undefined}
            accessible={pageIndex === 0}
            accessibilityRole={pageIndex === 0 ? 'image' : undefined}
            accessibilityLabel={
              pageIndex === 0
                ? 'Quarterly growth chart, Q1 3.1%, Q2 4.0%, Q3 5.2%, Q4 6.1%, Q5 7.3%'
                : undefined
            }
            accessibilityHint={
              pageIndex === 0 ? 'Summarizes the sample document chart' : undefined
            }
            style={styles.chartBlock}>
            {[3.1, 4, 5.2, 6.1, 7.3].map((value, index) => (
              <View
                style={styles.barColumn}
                key={`${pageIndex}-${value}`}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden>
                <Text style={styles.barLabel}>{value.toFixed(1)}%</Text>
                <View
                  style={[
                    styles.bar,
                    {height: 14 + value * 6},
                    index === 4 && styles.barActive,
                  ]}
                />
                <Text style={styles.axisLabel}>Q{index + 1}</Text>
              </View>
            ))}
          </View>
          <View style={styles.divider} />
          <View style={styles.lowerPage}>
            <View
              testID={pageIndex === 0 ? 'pdf-canvas-donut' : undefined}
              accessible={pageIndex === 0}
              accessibilityRole={pageIndex === 0 ? 'image' : undefined}
              accessibilityLabel={
                pageIndex === 0
                  ? 'Market share chart, Technology 34%, Healthcare 28%, Consumer Goods 22%, Financial Services 16%'
                  : undefined
              }
              accessibilityHint={
                pageIndex === 0
                  ? 'Summarizes the sample document market share chart'
                  : undefined
              }
              style={styles.donut}>
              <Text style={styles.donutText}>34%</Text>
            </View>
            <View style={styles.legend}>
              <Text style={styles.legendTitle}>Market Share by Segment</Text>
              <Text style={styles.legendLine}>Technology 34%</Text>
              <Text style={styles.legendLine}>Healthcare 28%</Text>
              <Text style={styles.legendLine}>Consumer Goods 22%</Text>
              <Text style={styles.legendLine}>Financial Services 16%</Text>
            </View>
          </View>
        </>
      )}
    </>
  );
}

function AnnotationOverlay({annotation}: {annotation: Annotation}) {
  return (
    <View
      testID={`pdf-annotation-${annotation.id}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={annotationAccessibilityLabel(annotation)}
      accessibilityHint="PDF annotation overlay"
      style={[
        styles.annotation,
        annotation.kind === 'note' && styles.annotationNote,
        annotation.kind === 'drawing' && styles.annotationDrawing,
        annotation.kind === 'bookmark' && styles.annotationBookmark,
        annotation.kind === 'signature' && styles.annotationSignature,
        {
          ...annotationBoundsToFallbackStyle(annotation.bounds),
          backgroundColor:
            annotation.kind === 'signature' ? 'transparent' : annotation.color,
        } as ViewStyle,
      ]}>
      {annotation.kind === 'signature' ? (
        <Text testID="pdf-annotation-signature" style={styles.signatureStamp}>
          {annotation.text}
        </Text>
      ) : annotation.kind === 'note' ? (
        <Text testID="pdf-annotation-note" style={styles.noteStamp}>
          {annotation.text}
        </Text>
      ) : null}
    </View>
  );
}

function SearchHighlightOverlay({highlight}: {highlight: SearchHighlight}) {
  return (
    <View
      testID={`pdf-search-highlight-${highlight.id}`}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Search match on page ${highlight.pageIndex + 1}`}
      accessibilityHint="Highlights matched search text on the page"
      style={[
        styles.searchHighlight,
        annotationBoundsToFallbackStyle(highlight.bounds) as ViewStyle,
      ]}
    />
  );
}

function annotationAccessibilityLabel(annotation: Annotation) {
  const kind = annotation.kind === 'note'
    ? 'Note'
    : annotation.kind === 'drawing'
      ? 'Drawing'
      : annotation.kind === 'signature'
        ? 'Signature'
        : annotation.kind === 'bookmark'
          ? 'Bookmark'
          : 'Highlight';
  const copy = annotation.text ? `, ${annotation.text}` : '';

  return `${kind} annotation on page ${annotation.pageIndex + 1}${copy}`;
}

const styles = StyleSheet.create({
  nativeCanvas: {
    flex: 1,
  },
  nativeCanvasFrame: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: '#F4F3F1',
  },
  toolHint: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    zIndex: 20,
    borderColor: '#B9C9EC',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 5},
  },
  toolHintText: {
    color: '#1E4F9A',
    fontSize: 12,
    fontWeight: '800',
  },
  canvasViewport: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    padding: 24,
  },
  canvasViewportCompact: {
    padding: 12,
  },
  demoScroll: {
    flex: 1,
    width: '100%',
  },
  demoScrollContent: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 48,
  },
  demoScrollContentCompact: {
    padding: 12,
    paddingBottom: 28,
  },
  demoPageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  demoPageHitbox: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
  },
  demoPageContent: {},
  page: {
    aspectRatio: pageAspectRatio,
    backgroundColor: '#FFFFFF',
    borderColor: '#EBEAE7',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#1F2937',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 12},
    padding: 42,
  },
  pageCompact: {
    padding: 24,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  pageKicker: {
    color: '#8A8A83',
    fontFamily: 'Geist Mono',
    fontSize: 13,
    fontWeight: '600',
  },
  pageNumber: {
    color: '#1F2633',
    fontSize: 13,
    fontWeight: '700',
  },
  pageTitle: {
    color: '#111110',
    fontFamily: 'Source Serif 4',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 12,
  },
  readerHeading: {
    color: '#111110',
    fontFamily: 'Source Serif 4',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 10,
  },
  readerParagraph: {
    color: '#2C2C2A',
    fontFamily: 'Source Serif 4',
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 490,
    marginBottom: 12,
  },
  highlightedLine: {
    backgroundColor: '#F7D96D',
  },
  blueLead: {
    color: '#1668E8',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    maxWidth: 430,
    marginBottom: 16,
  },
  paragraph: {
    color: '#2F3542',
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 490,
    marginBottom: 20,
  },
  chartBlock: {
    height: 132,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomColor: '#CBD1DB',
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barLabel: {
    color: '#1A1F29',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
  },
  bar: {
    width: 30,
    backgroundColor: '#BBD0F4',
  },
  barActive: {
    backgroundColor: '#2F73E8',
  },
  axisLabel: {
    color: '#555E6E',
    fontSize: 9,
    marginTop: 6,
    marginBottom: -18,
  },
  divider: {
    height: 1,
    backgroundColor: '#D9DDE5',
    marginVertical: 18,
  },
  lowerPage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donut: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 20,
    borderColor: '#2F73E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 28,
  },
  donutText: {
    color: '#2F73E8',
    fontSize: 13,
    fontWeight: '800',
  },
  legend: {
    flex: 1,
  },
  legendTitle: {
    color: '#1D2430',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  legendLine: {
    color: '#303746',
    fontSize: 10,
    marginBottom: 5,
  },
  annotation: {
    position: 'absolute',
    borderRadius: 2,
    opacity: 0.58,
    minHeight: 8,
  },
  searchHighlight: {
    position: 'absolute',
    borderRadius: 2,
    minHeight: 8,
    backgroundColor: 'rgba(247, 214, 74, 0.58)',
    borderColor: 'rgba(180, 137, 0, 0.26)',
    borderWidth: 1,
  },
  signaturePreview: {
    position: 'absolute',
    zIndex: 14,
    minWidth: 176,
    minHeight: 44,
    borderBottomColor: '#111827',
    borderBottomWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  signaturePreviewText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  annotationNote: {
    borderRadius: 5,
    borderColor: '#2E74F5',
    borderWidth: 1,
    opacity: 0.82,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  annotationDrawing: {
    borderRadius: 999,
    borderColor: '#EF4444',
    borderWidth: 3,
    backgroundColor: 'transparent',
    opacity: 0.88,
  },
  annotationBookmark: {
    borderRadius: 4,
    opacity: 0.82,
  },
  annotationSignature: {
    borderColor: '#1F2937',
    borderBottomWidth: 1,
    opacity: 1,
    justifyContent: 'center',
  },
  signatureStamp: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  noteStamp: {
    color: '#1E4F9A',
    fontSize: 10,
    fontWeight: '800',
  },
});

function isJestRuntime() {
  const globals = globalThis as {it?: unknown; jest?: unknown};

  return typeof globals.it === 'function' || globals.jest !== undefined;
}
