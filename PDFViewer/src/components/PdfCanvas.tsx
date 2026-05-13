import React, {useState} from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  requireNativeComponent,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type {Annotation, DocumentRecord, ViewerState} from '../domain/types';

type NativePdfCanvasProps = {
  testID?: string;
  documentPath?: string;
  pageIndex: number;
  zoom: number;
  annotations: Annotation[];
  style?: StyleProp<ViewStyle>;
};

type PdfCanvasProps = {
  document: DocumentRecord;
  viewer: ViewerState;
  annotations: Annotation[];
  compact?: boolean;
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
}: PdfCanvasProps) {
  const [viewportSize, setViewportSize] = useState({width: 0, height: 0});
  const pageWidth = getPageWidth(viewportSize, compact, viewer.zoom);

  if (document.path && NativePdfCanvas) {
    return (
      <NativePdfCanvas
        testID="pdf-canvas-native"
        documentPath={document.path}
        pageIndex={viewer.pageIndex}
        zoom={viewer.zoom}
        annotations={annotations}
        style={styles.nativeCanvas}
      />
    );
  }

  return (
    <View
      testID="pdf-canvas-fallback"
      onLayout={(event: LayoutChangeEvent) => {
        const {width, height} = event.nativeEvent.layout;
        setViewportSize({width, height});
      }}
      style={styles.canvas}>
      <View
        testID="pdf-canvas-viewport"
        style={[
          styles.canvasViewport,
          compact && styles.canvasViewportCompact,
        ]}>
        <View
          testID="pdf-canvas-page"
          style={[
            styles.page,
            compact && styles.pageCompact,
            {width: pageWidth},
          ]}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageKicker}>{document.title}</Text>
            <Text style={styles.pageNumber}>{viewer.pageIndex + 1}</Text>
          </View>
          <Text style={styles.pageTitle}>
            {document.id === 'future-work'
              ? 'The Hybrid Work Evolution'
              : 'Market Overview'}
          </Text>
          <Text style={styles.blueLead}>
            Global markets closed the year with steady growth across key
            segments.
          </Text>
          <Text style={styles.paragraph}>
            The document view is powered by PDFKit for local PDFs and this
            fixture surface for the built-in demo set. Imported documents render
            in the native PDF canvas.
          </Text>
          <View testID="pdf-canvas-chart" style={styles.chartBlock}>
            {[3.1, 4, 5.2, 6.1, 7.3].map((value, index) => (
              <View style={styles.barColumn} key={value}>
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
            <View testID="pdf-canvas-donut" style={styles.donut}>
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
          {annotations.map(annotation => (
            <View
              key={annotation.id}
              style={[
                styles.annotation,
                {
                  left: `${Math.min(annotation.bounds.x / 5, 76)}%`,
                  top: `${Math.min(annotation.bounds.y / 7, 78)}%`,
                  width: annotation.bounds.width / 2,
                  backgroundColor: annotation.color,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const pageAspectRatio = 0.707;

function getPageWidth(
  viewport: {width: number; height: number},
  compact: boolean,
  zoom: number,
) {
  const fallbackWidth = compact ? 320 : 620;

  if (viewport.width <= 0 || viewport.height <= 0) {
    return Math.round(fallbackWidth * zoom);
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

  return Math.round(Math.max(floorWidth, fitWidth) * zoom);
}

const styles = StyleSheet.create({
  nativeCanvas: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: '#ECEEF2',
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
  page: {
    aspectRatio: pageAspectRatio,
    backgroundColor: '#FBFAF8',
    borderColor: '#DADDE4',
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
    color: '#444B5A',
    fontSize: 13,
    fontWeight: '600',
  },
  pageNumber: {
    color: '#1F2633',
    fontSize: 13,
    fontWeight: '700',
  },
  pageTitle: {
    color: '#171B22',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 12,
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
    height: 18,
    borderRadius: 2,
    opacity: 0.58,
  },
});

function isJestRuntime() {
  const globals = globalThis as {it?: unknown; jest?: unknown};

  return typeof globals.it === 'function' || globals.jest !== undefined;
}
