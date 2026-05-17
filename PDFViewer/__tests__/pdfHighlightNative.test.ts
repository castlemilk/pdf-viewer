declare const __dirname: string;

const {readFileSync} = require('fs');
const path = require('path');

const nativeHighlightSources = [
  ['macOS canvas', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'],
  ['macOS export bridge', 'macos/PDFViewer-macOS/PdfKitBridge.mm'],
  ['iOS canvas', 'ios/PDFViewer/PdfCanvasViewManager.m'],
  ['iOS export bridge', 'ios/PDFViewer/PdfKitBridge.m'],
] as const;

describe('native PDFKit highlight placement', () => {
  it.each(nativeHighlightSources)(
    '%s uses page-space quadrilateral points',
    (_label, sourcePath) => {
      const source = readFileSync(
        path.join(__dirname, '..', sourcePath),
        'utf8',
      );

      expect(source).toContain('AcaciaHighlightQuadPointsForBounds');
      const usesAppKitCoordinates =
        source.includes('NSMinX(bounds)') &&
        source.includes('NSMaxX(bounds)') &&
        source.includes('NSMinY(bounds)') &&
        source.includes('NSMaxY(bounds)');
      const usesUIKitCoordinates =
        source.includes('CGRectGetMinX(bounds)') &&
        source.includes('CGRectGetMaxX(bounds)') &&
        source.includes('CGRectGetMinY(bounds)') &&
        source.includes('CGRectGetMaxY(bounds)');

      expect(usesAppKitCoordinates || usesUIKitCoordinates).toBe(true);
      expect(source).not.toMatch(
        /(?:NSMakePoint|CGPointMake)\(0\.0,\s*(?:NSHeight|CGRectGetHeight)\(bounds\)\)/,
      );
    },
  );

  it('can convert an existing PDF text selection into highlight annotations', () => {
    const macCanvas = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(__dirname, '..', 'ios/PDFViewer/PdfCanvasViewManager.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas]) {
      expect(source).toContain('highlightCurrentSelectionIfPossible');
      expect(source).toContain('currentSelection');
      expect(source).toContain('selectionsByLine');
      expect(source).toContain('boundsForPage:');
      expect(source).toContain('clearSelection');
    }
  });

  it('snaps highlighter drags to PDF text selections before falling back to rectangles', () => {
    const macCanvas = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(__dirname, '..', 'ios/PDFViewer/PdfCanvasViewManager.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas]) {
      expect(source).toContain('AcaciaExpandedPDFRectForDrag');
      expect(source).toContain('emitTextHighlightAnnotationsForPage');
      expect(source).toContain('selectionForRect:dragBounds');
      expect(source).toContain('AcaciaCanonicalBoundsForPDFBounds(lineBounds, pageBounds)');
      expect(source).toContain('AcaciaCanonicalBoundsForDrag');
    }
  });

  it('macOS canvas forwards wrapper mouse events into annotation creation', () => {
    const macCanvas = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'),
      'utf8',
    );

    expect(macCanvas).toContain('pdfViewPointForEvent:');
    expect(macCanvas).toContain('[self beginPDFAnnotationGestureAtPoint:[self pdfViewPointForEvent:event]]');
    expect(macCanvas).toContain('[self continuePDFAnnotationGestureAtPoint:[self pdfViewPointForEvent:event]]');
    expect(macCanvas).toContain('[self endPDFAnnotationGestureAtPoint:[self pdfViewPointForEvent:event]]');
  });

  it('macOS canvas installs active-tool pan recognizers for PDFKit subviews', () => {
    const macCanvas = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'),
      'utf8',
    );

    expect(macCanvas).toContain('[_pdfView addGestureRecognizer:_annotationClickRecognizer]');
    expect(macCanvas).toContain('[_pdfView addGestureRecognizer:_highlightPanRecognizer]');
    expect(macCanvas).toContain('[_pdfView addGestureRecognizer:_drawingPanRecognizer]');
    expect(macCanvas).toContain('- (void)updateAnnotationGestureRecognizerState');
    expect(macCanvas).toContain('_annotationClickRecognizer.enabled =');
    expect(macCanvas).toContain('_highlightPanRecognizer.enabled = [kind isEqualToString:@"highlight"]');
    expect(macCanvas).toContain('_drawingPanRecognizer.enabled = [kind isEqualToString:@"drawing"]');
    expect(macCanvas).toContain('shouldRecognizeSimultaneouslyWithGestureRecognizer');
  });

  it('macOS canvas shows a pointer-following signature preview before stamping', () => {
    const macCanvas = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfCanvasViewManager.mm'),
      'utf8',
    );

    expect(macCanvas).toContain('signaturePreviewText');
    expect(macCanvas).toContain('NSTrackingArea');
    expect(macCanvas).toContain('mouseMoved:');
    expect(macCanvas).toContain('updateSignaturePreviewAtPoint');
    expect(macCanvas).toContain('_signaturePreviewLabel.hidden = NO');
  });

  it('native search returns page-space bounds for transient match highlights', () => {
    const macBridge = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfKitBridge.mm'),
      'utf8',
    );
    const iosBridge = readFileSync(
      path.join(__dirname, '..', 'ios/PDFViewer/PdfKitBridge.m'),
      'utf8',
    );

    for (const source of [macBridge, iosBridge]) {
      expect(source).toContain('searchBounds');
      expect(source).toContain('selectionsByLine');
      expect(source).toContain('AcaciaCanonicalBoundsForPDFBounds');
      expect(source).toContain('@"bounds": searchBounds');
    }
  });

  it('macOS markdown export invokes the MarkItDown local-file converter', () => {
    const macBridge = readFileSync(
      path.join(__dirname, '..', 'macos/PDFViewer-macOS/PdfKitBridge.mm'),
      'utf8',
    );
    const tsBridge = readFileSync(
      path.join(__dirname, '..', 'src/native/PdfKitBridge.ts'),
      'utf8',
    );

    expect(macBridge).toContain('exportMarkdown:(NSString *)path');
    expect(macBridge).toContain('markitdown');
    expect(macBridge).toContain('convert_local');
    expect(tsBridge).toContain('exportMarkdown?.(path, bookmark)');
  });
});
