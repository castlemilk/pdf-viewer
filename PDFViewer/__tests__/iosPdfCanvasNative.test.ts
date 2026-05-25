declare const __dirname: string;
export {};
const {readFileSync} = require('fs');
const path = require('path');

describe('iOS native PDF canvas behavior', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
    'utf8',
  );
  const componentSource = readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'PdfCanvas.tsx'),
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
    expect(source).toContain('self.accessibilityLabel');
    expect(source).toContain('annotations %lu');
    expect(source).toContain('tool active');
  });

  it('supports native ink drawing gestures instead of square stamps', () => {
    expect(source).toContain('UIPanGestureRecognizer *_drawingPanRecognizer');
    expect(source).toContain('handleDrawingPan:');
    expect(source).toContain('AcaciaCanonicalInkPathForViewPoints');
    expect(source).toContain('PDFAnnotationSubtypeInk');
    expect(source).toContain('addBezierPath');
  });

  it('exposes native annotations as accessibility elements on the active page', () => {
    expect(source).toContain('updateAnnotationAccessibilityViews');
    expect(source).toContain('AcaciaAnnotationAccessibilityIdentifierForKind');
    expect(source).toContain('pdf-annotation-signature');
    expect(source).toContain('AcaciaAnnotationAccessibilityLabel');
    expect(source).toContain('UIAccessibilityPostNotification(UIAccessibilityLayoutChangedNotification');
  });

  it('bridges native iOS adjustable canvas gestures back into React page state', () => {
    expect(componentSource).toContain('onCanvasAccessibilityAction');
    expect(componentSource).toContain('handleCanvasAccessibilityAction');
    expect(componentSource).toContain("Platform.OS === 'ios'");
    expect(source).toContain('onCanvasAccessibilityAction');
    expect(source).toContain('RCT_EXPORT_VIEW_PROPERTY(onCanvasAccessibilityAction, RCTBubblingEventBlock)');
    expect(source).toContain('UIAccessibilityTraitAdjustable');
    expect(source).toContain('UIAccessibilityTraitAllowsDirectInteraction');
    expect(source).toContain('- (void)accessibilityIncrement');
    expect(source).toContain('- (void)accessibilityDecrement');
    expect(source).toContain('- (BOOL)accessibilityScroll:');
  });

  it('supports native iOS activation, custom actions, rotors, and Voice Control labels', () => {
    expect(source).toContain('accessibilityPerformMagicTap');
    expect(source).toContain('accessibilityCustomActions');
    expect(source).toContain('UIAccessibilityCustomAction');
    expect(source).toContain('Add highlight at page center');
    expect(source).toContain('accessibilityCustomRotors');
    expect(source).toContain('UIAccessibilityCustomRotor');
    expect(source).toContain('accessibilityUserInputLabels');
    expect(source).toContain('accessibilityRespondsToUserInteraction');
    expect(source).toContain('showsLargeContentViewer');
    expect(source).toContain('AXCustomContent');
  });
});
