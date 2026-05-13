declare const __dirname: string;
export {};
const {readFileSync} = require('fs');
const path = require('path');

describe('iOS native PDF canvas behavior', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
    'utf8',
  );

  it('uses deterministic single-page navigation for toolbar page controls', () => {
    expect(source).toContain('_pdfView.displayMode = kPDFDisplaySinglePage');
    expect(source).toContain('- (void)goToCurrentPage');
    expect(source).toContain('[_pdfView goToPage:page]');
    expect(source).toContain('MIN(_pageIndex.unsignedIntegerValue, document.pageCount - 1)');
  });

  it('applies zoom as a fit-to-page multiplier instead of fighting auto scale', () => {
    expect(source).toContain('- (void)applyZoom');
    expect(source).toContain('_pdfView.scaleFactorForSizeToFit');
    expect(source).toContain('_pdfView.autoScales = NO');
    expect(source).toContain('_pdfView.scaleFactor = targetScale');
  });

  it('creates visible highlight annotations with quad points and accessibility state', () => {
    expect(source).toContain('visibleAnnotationBoundsForRequestedBounds');
    expect(source).toContain('annotation.quadrilateralPoints');
    expect(source).toContain('self.accessibilityValue');
    expect(source).toContain('annotations %lu');
  });
});
