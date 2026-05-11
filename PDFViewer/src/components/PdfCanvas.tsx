import React from 'react';
import {
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
  (Platform.OS as string) === 'macos'
    ? requireNativeComponent<NativePdfCanvasProps>('PdfCanvas')
    : undefined;

export function PdfCanvas({
  document,
  viewer,
  annotations,
  compact = false,
}: PdfCanvasProps) {
  if (document.path && NativePdfCanvas) {
    return (
      <NativePdfCanvas
        documentPath={document.path}
        pageIndex={viewer.pageIndex}
        zoom={viewer.zoom}
        annotations={annotations}
        style={styles.nativeCanvas}
      />
    );
  }

  return (
    <View style={[styles.canvas, compact && styles.canvasCompact]}>
      <View style={[styles.page, compact && styles.pageCompact]}>
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
        <View style={styles.chartBlock}>
          {[3.1, 4, 5.2, 6.1, 7.3].map((value, index) => (
            <View style={styles.barColumn} key={value}>
              <Text style={styles.barLabel}>{value.toFixed(1)}%</Text>
              <View
                style={[
                  styles.bar,
                  {height: 18 + value * 8},
                  index === 4 && styles.barActive,
                ]}
              />
              <Text style={styles.axisLabel}>Q{index + 1}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.lowerPage}>
          <View style={styles.donut}>
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
  );
}

const styles = StyleSheet.create({
  nativeCanvas: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEEF2',
    padding: 24,
  },
  canvasCompact: {
    padding: 12,
  },
  page: {
    width: '70%',
    maxWidth: 720,
    minHeight: 860,
    backgroundColor: '#FBFAF8',
    borderColor: '#DADDE4',
    borderWidth: 1,
    shadowColor: '#1F2937',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 12},
    padding: 54,
  },
  pageCompact: {
    width: '94%',
    minHeight: 650,
    padding: 34,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
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
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 14,
  },
  blueLead: {
    color: '#1668E8',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 430,
    marginBottom: 22,
  },
  paragraph: {
    color: '#2F3542',
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 490,
    marginBottom: 34,
  },
  chartBlock: {
    height: 180,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomColor: '#CBD1DB',
    borderBottomWidth: 1,
    marginBottom: 24,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barLabel: {
    color: '#1A1F29',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  bar: {
    width: 38,
    backgroundColor: '#BBD0F4',
  },
  barActive: {
    backgroundColor: '#2F73E8',
  },
  axisLabel: {
    color: '#555E6E',
    fontSize: 10,
    marginTop: 8,
    marginBottom: -22,
  },
  divider: {
    height: 1,
    backgroundColor: '#D9DDE5',
    marginVertical: 30,
  },
  lowerPage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donut: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 28,
    borderColor: '#2F73E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 36,
  },
  donutText: {
    color: '#2F73E8',
    fontSize: 16,
    fontWeight: '800',
  },
  legend: {
    flex: 1,
  },
  legendTitle: {
    color: '#1D2430',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  legendLine: {
    color: '#303746',
    fontSize: 12,
    marginBottom: 6,
  },
  annotation: {
    position: 'absolute',
    height: 18,
    borderRadius: 2,
    opacity: 0.58,
  },
});
