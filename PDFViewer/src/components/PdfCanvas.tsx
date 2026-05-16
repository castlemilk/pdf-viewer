import React, {useEffect, useRef, useState} from 'react';
import {
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
  documentPath?: string;
  documentBookmark?: string;
  pageIndex: number;
  zoom: number;
  activeTool?: string;
  annotations: Annotation[];
  onCanvasPress?: (event: {
    nativeEvent: CanvasAnnotationRequest;
  }) => void;
  style?: StyleProp<ViewStyle>;
};

type PdfCanvasProps = {
  document: DocumentRecord;
  viewer: ViewerState;
  annotations: Annotation[];
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

const NativePdfCanvas =
  (Platform.OS as string) === 'macos' ||
  ((Platform.OS as string) === 'ios' && !isJestRuntime())
    ? requireNativeComponent<NativePdfCanvasProps>('PdfCanvas')
    : undefined;

export function PdfCanvas({
  document,
  viewer,
  annotations,
  compact = false,
  onCreateAnnotation,
  onPageChange,
}: PdfCanvasProps) {
  const [viewportSize, setViewportSize] = useState({width: 0, height: 0});
  const scrollRef = useRef<ScrollView>(null);
  const pageWidth = getPageWidth(viewportSize, compact);
  const pageHeight = pageWidth / pageAspectRatio;
  const scaledPageWidth = roundLayout(pageWidth * viewer.zoom);
  const scaledPageHeight = roundLayout(pageHeight * viewer.zoom);
  const pageGap = compact ? 18 : 26;
  const interactiveKind = canvasAnnotationKindForTool(viewer.activeTool);
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
      <View style={styles.nativeCanvasFrame} testID="pdf-canvas-native-frame">
        <NativePdfCanvas
          testID="pdf-canvas-native"
          documentPath={document.path}
          documentBookmark={document.bookmark}
          pageIndex={viewer.pageIndex}
          zoom={viewer.zoom}
          activeTool={interactiveKind}
          annotations={annotations}
          onCanvasPress={event => {
            if (!interactiveKind) {
              return;
            }

            onCreateAnnotation?.({
              ...event.nativeEvent,
              kind: interactiveKind,
            });
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
      accessibilityLabel="Demo PDF canvas"
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
            </View>
            {interactiveKind ? (
              <View
                testID={`pdf-demo-page-hitbox-${pageIndex + 1}`}
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
                }}
                onResponderMove={(event: GestureResponderEvent) => {
                  if (interactiveKind !== 'drawing') {
                    return;
                  }

                  const point = pagePointFromVisualPoint(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                    viewer.zoom,
                  );
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
      style={styles.toolHint}>
      <Text style={styles.toolHintText}>{copy}</Text>
    </View>
  );
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
            style={styles.chartBlock}>
            {[3.1, 4, 5.2, 6.1, 7.3].map((value, index) => (
              <View style={styles.barColumn} key={`${pageIndex}-${value}`}>
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
