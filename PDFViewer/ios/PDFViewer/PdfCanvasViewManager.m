#import <PDFKit/PDFKit.h>
#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <math.h>

@interface PdfCanvasView : UIView
@property (nonatomic, copy) NSString *documentPath;
@property (nonatomic, strong) NSNumber *pageIndex;
@property (nonatomic, strong) NSNumber *zoom;
@property (nonatomic, copy) NSArray *annotations;
@end

@implementation PdfCanvasView {
  PDFView *_pdfView;
  NSString *_loadedPath;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    _pdfView = [[PDFView alloc] initWithFrame:self.bounds];
    _pdfView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _pdfView.autoScales = YES;
    _pdfView.displayMode = kPDFDisplaySinglePage;
    _pdfView.displayDirection = kPDFDisplayDirectionVertical;
    _pdfView.displaysPageBreaks = YES;
    _pdfView.minScaleFactor = 0.25;
    _pdfView.maxScaleFactor = 4.0;
    _pdfView.backgroundColor = [UIColor colorWithWhite:0.92 alpha:1.0];
    [self addSubview:_pdfView];

    self.isAccessibilityElement = YES;
    self.accessibilityLabel = @"PDF canvas";
    [self refreshAccessibilityValue];
  }
  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _pdfView.frame = self.bounds;
  [self applyZoom];
  [self goToCurrentPage];
}

- (void)setDocumentPath:(NSString *)documentPath
{
  _documentPath = [documentPath copy];
  [self reloadDocumentIfNeeded];
}

- (void)setPageIndex:(NSNumber *)pageIndex
{
  _pageIndex = pageIndex;
  [self goToCurrentPage];
}

- (void)goToCurrentPage
{
  PDFDocument *document = _pdfView.document;
  if (document == nil || document.pageCount == 0) {
    [self refreshAccessibilityValue];
    return;
  }

  NSUInteger pageIndex = MIN(_pageIndex.unsignedIntegerValue, document.pageCount - 1);
  PDFPage *page = [document pageAtIndex:pageIndex];
  if (page != nil) {
    [_pdfView goToPage:page];
  }
  [self refreshAccessibilityValue];
}

- (void)setZoom:(NSNumber *)zoom
{
  _zoom = zoom;
  [self applyZoom];
}

- (void)applyZoom
{
  if (_pdfView.document == nil || CGRectIsEmpty(self.bounds)) {
    [self refreshAccessibilityValue];
    return;
  }

  CGFloat zoomMultiplier = _zoom == nil ? 1.0 : _zoom.doubleValue;
  zoomMultiplier = MAX(0.25, MIN(zoomMultiplier, 3.0));

  [_pdfView layoutIfNeeded];
  CGFloat fitScale = _pdfView.scaleFactorForSizeToFit;
  if (!isfinite(fitScale) || fitScale <= 0) {
    fitScale = _pdfView.scaleFactor > 0 ? _pdfView.scaleFactor : 1.0;
  }

  CGFloat minScale = fitScale * 0.25;
  CGFloat maxScale = fitScale * 3.0;
  CGFloat targetScale = MAX(minScale, MIN(fitScale * zoomMultiplier, maxScale));

  _pdfView.autoScales = NO;
  _pdfView.minScaleFactor = minScale;
  _pdfView.maxScaleFactor = maxScale;
  _pdfView.scaleFactor = targetScale;
  [self refreshAccessibilityValue];
}

- (void)setAnnotations:(NSArray *)annotations
{
  _annotations = [annotations copy];
  [self applyAnnotations];
}

- (void)reloadDocumentIfNeeded
{
  if (_documentPath.length == 0 || [_documentPath isEqualToString:_loadedPath]) {
    return;
  }

  PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:_documentPath]];
  _pdfView.document = document;
  _pdfView.autoScales = YES;
  _loadedPath = [_documentPath copy];
  [self applyAnnotations];
  [self applyZoom];
  [self goToCurrentPage];
}

- (void)applyAnnotations
{
  PDFDocument *document = _pdfView.document;
  if (document == nil) {
    return;
  }

  for (NSUInteger pageIndex = 0; pageIndex < document.pageCount; pageIndex += 1) {
    PDFPage *page = [document pageAtIndex:pageIndex];
    for (PDFAnnotation *annotation in page.annotations.copy) {
      if ([annotation.contents hasPrefix:@"Acacia:"]) {
        [page removeAnnotation:annotation];
      }
    }
  }

  for (NSDictionary *annotationInfo in _annotations) {
    NSNumber *pageIndex = [RCTConvert NSNumber:annotationInfo[@"pageIndex"]];
    PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];
    if (page == nil) {
      continue;
    }

    NSDictionary *boundsInfo = [RCTConvert NSDictionary:annotationInfo[@"bounds"]];
    CGRect requestedBounds = CGRectMake(
      [RCTConvert CGFloat:boundsInfo[@"x"]],
      [RCTConvert CGFloat:boundsInfo[@"y"]],
      [RCTConvert CGFloat:boundsInfo[@"width"]],
      [RCTConvert CGFloat:boundsInfo[@"height"]]
    );
    CGRect bounds = [self visibleAnnotationBoundsForRequestedBounds:requestedBounds page:page];
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds
                                                             forType:PDFAnnotationSubtypeHighlight
                                                      withProperties:nil];
    annotation.color = [UIColor colorWithRed:1 green:0.82 blue:0.12 alpha:0.42];
    annotation.contents = [NSString stringWithFormat:@"Acacia:%@", [RCTConvert NSString:annotationInfo[@"id"]]];
    annotation.quadrilateralPoints = @[
      [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMaxY(bounds))],
      [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMaxY(bounds))],
      [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMinY(bounds))],
      [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMinY(bounds))],
    ];
    [page addAnnotation:annotation];
  }

  [self refreshAccessibilityValue];
}

- (CGRect)visibleAnnotationBoundsForRequestedBounds:(CGRect)requestedBounds page:(PDFPage *)page
{
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }

  CGFloat margin = 24.0;
  CGFloat fallbackWidth = MIN(280.0, MAX(80.0, CGRectGetWidth(pageBounds) - margin * 2.0));
  CGFloat fallbackHeight = 24.0;
  CGRect fallbackBounds = CGRectMake(
    CGRectGetMinX(pageBounds) + margin,
    CGRectGetMaxY(pageBounds) - margin - fallbackHeight,
    fallbackWidth,
    fallbackHeight
  );

  if (CGRectIsEmpty(pageBounds) || CGRectIsEmpty(requestedBounds)) {
    return fallbackBounds;
  }

  CGFloat width = MIN(MAX(CGRectGetWidth(requestedBounds), 24.0), MAX(24.0, CGRectGetWidth(pageBounds) - margin * 2.0));
  CGFloat height = MIN(MAX(CGRectGetHeight(requestedBounds), 12.0), MAX(12.0, CGRectGetHeight(pageBounds) - margin * 2.0));
  CGFloat maxX = CGRectGetMaxX(pageBounds) - margin - width;
  CGFloat maxY = CGRectGetMaxY(pageBounds) - margin - height;
  CGFloat x = MIN(MAX(CGRectGetMinX(requestedBounds), CGRectGetMinX(pageBounds) + margin), maxX);
  CGFloat y = MIN(MAX(CGRectGetMinY(requestedBounds), CGRectGetMinY(pageBounds) + margin), maxY);

  return CGRectMake(x, y, width, height);
}

- (void)refreshAccessibilityValue
{
  NSUInteger pageCount = _pdfView.document.pageCount;
  NSUInteger currentPage = 0;
  if (_pdfView.document != nil && _pdfView.currentPage != nil) {
    currentPage = [_pdfView.document indexForPage:_pdfView.currentPage] + 1;
  }

  self.accessibilityValue = [NSString stringWithFormat:@"Page %lu of %lu, zoom %.0f%%, annotations %lu",
    (unsigned long)currentPage,
    (unsigned long)pageCount,
    _pdfView.scaleFactor * 100.0,
    (unsigned long)_annotations.count];
}

@end

@interface PdfCanvasViewManager : RCTViewManager
@end

@implementation PdfCanvasViewManager

RCT_EXPORT_MODULE(PdfCanvas)
RCT_EXPORT_VIEW_PROPERTY(documentPath, NSString)
RCT_EXPORT_VIEW_PROPERTY(pageIndex, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(zoom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)

- (UIView *)view
{
  return [PdfCanvasView new];
}

@end
