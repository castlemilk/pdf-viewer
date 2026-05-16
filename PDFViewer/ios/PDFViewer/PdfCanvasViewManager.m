#import <PDFKit/PDFKit.h>
#import <React/RCTComponent.h>
#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <math.h>

static const CGFloat AcaciaCanonicalPageWidth = 595.0;
static const CGFloat AcaciaCanonicalPageHeight = 842.0;

static NSString *AcaciaAnnotationKindForTool(NSString *tool)
{
  if ([tool isEqualToString:@"highlight"] ||
      [tool isEqualToString:@"note"] ||
      [tool isEqualToString:@"drawing"] ||
      [tool isEqualToString:@"signature"]) {
    return tool;
  }
  return nil;
}

static CGSize AcaciaAnnotationSizeForKind(NSString *kind)
{
  if ([kind isEqualToString:@"signature"]) {
    return CGSizeMake(180.0, 48.0);
  }
  if ([kind isEqualToString:@"note"]) {
    return CGSizeMake(190.0, 54.0);
  }
  if ([kind isEqualToString:@"drawing"]) {
    return CGSizeMake(120.0, 80.0);
  }
  return CGSizeMake(160.0, 24.0);
}

static NSString *AcaciaAnnotationSubtypeForKind(NSString *kind)
{
  if ([kind isEqualToString:@"signature"] || [kind isEqualToString:@"note"]) {
    return PDFAnnotationSubtypeFreeText;
  }
  if ([kind isEqualToString:@"drawing"]) {
    return PDFAnnotationSubtypeInk;
  }
  return PDFAnnotationSubtypeHighlight;
}

static CGPoint AcaciaCanonicalPointForPDFPoint(CGPoint pagePoint, CGRect pageBounds)
{
  return CGPointMake(
    ((pagePoint.x - CGRectGetMinX(pageBounds)) / CGRectGetWidth(pageBounds)) * AcaciaCanonicalPageWidth,
    ((CGRectGetMaxY(pageBounds) - pagePoint.y) / CGRectGetHeight(pageBounds)) * AcaciaCanonicalPageHeight
  );
}

static CGRect AcaciaClampCanonicalBounds(CGRect bounds)
{
  CGFloat width = MIN(MAX(CGRectGetWidth(bounds), 4.0), AcaciaCanonicalPageWidth);
  CGFloat height = MIN(MAX(CGRectGetHeight(bounds), 4.0), AcaciaCanonicalPageHeight);
  CGFloat x = MIN(MAX(CGRectGetMinX(bounds), 0.0), AcaciaCanonicalPageWidth - width);
  CGFloat y = MIN(MAX(CGRectGetMinY(bounds), 0.0), AcaciaCanonicalPageHeight - height);
  return CGRectMake(round(x), round(y), round(width), round(height));
}

static CGFloat AcaciaCenteredMinimumRangeStart(CGFloat first, CGFloat second, CGFloat minimumLength)
{
  CGFloat length = fabs(second - first);
  if (length >= minimumLength) {
    return MIN(first, second);
  }

  return ((first + second) / 2.0) - minimumLength / 2.0;
}

static CGRect AcaciaCanonicalBoundsForPoint(NSString *kind, CGPoint pagePoint, CGRect pageBounds)
{
  CGSize annotationSize = AcaciaAnnotationSizeForKind(kind);
  CGPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(pagePoint, pageBounds);
  return AcaciaClampCanonicalBounds(CGRectMake(
    canonicalPoint.x - annotationSize.width / 2.0,
    canonicalPoint.y - annotationSize.height / 2.0,
    annotationSize.width,
    annotationSize.height
  ));
}

static CGRect AcaciaCanonicalBoundsForDrag(CGPoint startPagePoint, CGPoint endPagePoint, CGRect pageBounds)
{
  CGPoint start = AcaciaCanonicalPointForPDFPoint(startPagePoint, pageBounds);
  CGPoint end = AcaciaCanonicalPointForPDFPoint(endPagePoint, pageBounds);
  CGFloat minimumHighlightLength = AcaciaAnnotationSizeForKind(@"highlight").height;
  CGFloat width = MAX(fabs(end.x - start.x), minimumHighlightLength);
  CGFloat height = MAX(fabs(end.y - start.y), minimumHighlightLength);
  CGFloat x = AcaciaCenteredMinimumRangeStart(start.x, end.x, minimumHighlightLength);
  CGFloat y = AcaciaCenteredMinimumRangeStart(start.y, end.y, minimumHighlightLength);
  return AcaciaClampCanonicalBounds(CGRectMake(x, y, width, height));
}

static CGRect AcaciaCanonicalBoundsForPDFBounds(CGRect pdfBounds, CGRect pageBounds)
{
  CGFloat x = ((CGRectGetMinX(pdfBounds) - CGRectGetMinX(pageBounds)) / CGRectGetWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat y = ((CGRectGetMaxY(pageBounds) - CGRectGetMaxY(pdfBounds)) / CGRectGetHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  CGFloat width = (CGRectGetWidth(pdfBounds) / CGRectGetWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat height = (CGRectGetHeight(pdfBounds) / CGRectGetHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  return AcaciaClampCanonicalBounds(CGRectMake(x, y, width, height));
}

static CGRect AcaciaExpandedPDFRectForDrag(CGPoint startPagePoint,
                                           CGPoint endPagePoint,
                                           CGRect pageBounds)
{
  CGFloat minX = MIN(startPagePoint.x, endPagePoint.x);
  CGFloat minY = MIN(startPagePoint.y, endPagePoint.y);
  CGFloat width = fabs(endPagePoint.x - startPagePoint.x);
  CGFloat height = fabs(endPagePoint.y - startPagePoint.y);
  CGFloat minimumHeight = MAX(12.0, CGRectGetHeight(pageBounds) * 0.012);

  if (height < minimumHeight) {
    CGFloat midY = (startPagePoint.y + endPagePoint.y) / 2.0;
    minY = midY - minimumHeight / 2.0;
    height = minimumHeight;
  }

  CGRect expanded = CGRectInset(CGRectMake(minX, minY, MAX(width, 4.0), height), -4.0, -6.0);
  CGRect clamped = CGRectIntersection(expanded, pageBounds);
  return CGRectIsEmpty(clamped) ? expanded : clamped;
}

static NSArray<NSDictionary *> *AcaciaCanonicalInkPathForViewPoints(NSArray<NSValue *> *viewPoints,
                                                                    PDFView *pdfView,
                                                                    PDFPage *page,
                                                                    CGRect pageBounds)
{
  NSMutableArray<NSDictionary *> *path = [NSMutableArray array];

  for (NSValue *value in viewPoints) {
    CGPoint viewPoint = value.CGPointValue;
    CGPoint pagePoint = [pdfView convertPoint:viewPoint toPage:page];
    CGPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(pagePoint, pageBounds);
    [path addObject:@{
      @"x": @(round(canonicalPoint.x)),
      @"y": @(round(canonicalPoint.y)),
    }];
  }

  return path;
}

static CGRect AcaciaCanonicalBoundsForInkPath(NSArray<NSDictionary *> *points)
{
  if (points.count == 0) {
    return AcaciaClampCanonicalBounds(CGRectMake(0.0, 0.0, 24.0, 24.0));
  }

  CGFloat minX = AcaciaCanonicalPageWidth;
  CGFloat minY = AcaciaCanonicalPageHeight;
  CGFloat maxX = 0.0;
  CGFloat maxY = 0.0;

  for (NSDictionary *pointInfo in points) {
    CGFloat x = [RCTConvert CGFloat:pointInfo[@"x"]];
    CGFloat y = [RCTConvert CGFloat:pointInfo[@"y"]];
    minX = MIN(minX, x);
    minY = MIN(minY, y);
    maxX = MAX(maxX, x);
    maxY = MAX(maxY, y);
  }

  CGFloat padding = 12.0;
  return AcaciaClampCanonicalBounds(CGRectMake(
    minX - padding,
    minY - padding,
    maxX - minX + padding * 2.0,
    maxY - minY + padding * 2.0
  ));
}

static CGPoint AcaciaPDFPointForCanonicalPoint(NSDictionary *pointInfo, CGRect pageBounds)
{
  CGFloat canonicalX = [RCTConvert CGFloat:pointInfo[@"x"]];
  CGFloat canonicalY = [RCTConvert CGFloat:pointInfo[@"y"]];
  return CGPointMake(
    CGRectGetMinX(pageBounds) + canonicalX / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds),
    CGRectGetMaxY(pageBounds) - canonicalY / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds)
  );
}

static NSArray<NSValue *> *AcaciaHighlightQuadPointsForBounds(CGRect bounds)
{
  return @[
    [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMaxY(bounds))],
    [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMaxY(bounds))],
    [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMinY(bounds))],
    [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMinY(bounds))],
  ];
}

static UIBezierPath *AcaciaBezierPathForInkPoints(NSArray *points, PDFPage *page)
{
  if (points.count == 0) {
    return nil;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (CGRectIsEmpty(pageBounds)) {
    return nil;
  }

  UIBezierPath *path = [UIBezierPath bezierPath];
  path.lineWidth = 2.4;
  CGPoint firstPoint = AcaciaPDFPointForCanonicalPoint(points.firstObject, pageBounds);
  [path moveToPoint:firstPoint];

  for (NSUInteger index = 1; index < points.count; index += 1) {
    [path addLineToPoint:AcaciaPDFPointForCanonicalPoint(points[index], pageBounds)];
  }

  if (points.count == 1) {
    [path appendPath:[UIBezierPath bezierPathWithOvalInRect:CGRectMake(firstPoint.x - 1.2, firstPoint.y - 1.2, 2.4, 2.4)]];
  }

  return path;
}

@interface PdfCanvasView : UIView
@property (nonatomic, copy) NSString *documentPath;
@property (nonatomic, copy) NSString *documentBookmark;
@property (nonatomic, strong) NSNumber *pageIndex;
@property (nonatomic, strong) NSNumber *zoom;
@property (nonatomic, copy) NSString *activeTool;
@property (nonatomic, copy) NSArray *annotations;
@property (nonatomic, copy) RCTBubblingEventBlock onCanvasPress;
@end

@interface PdfCanvasView () <UIGestureRecognizerDelegate>
@end

@implementation PdfCanvasView {
  PDFView *_pdfView;
  NSString *_loadedPath;
  NSString *_loadedBookmark;
  NSURL *_securityScopedURL;
  BOOL _isAccessingSecurityScope;
  CGPoint _highlightPanStartPoint;
  BOOL _hasHighlightPanStartPoint;
  NSMutableArray<NSValue *> *_drawingViewPoints;
  UIPanGestureRecognizer *_highlightPanRecognizer;
  UIPanGestureRecognizer *_drawingPanRecognizer;
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
    UITapGestureRecognizer *tapRecognizer =
      [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleTap:)];
    tapRecognizer.cancelsTouchesInView = NO;
    [_pdfView addGestureRecognizer:tapRecognizer];
    _highlightPanRecognizer =
      [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleHighlightPan:)];
    _highlightPanRecognizer.delegate = self;
    _highlightPanRecognizer.cancelsTouchesInView = NO;
    [_pdfView addGestureRecognizer:_highlightPanRecognizer];
    _drawingPanRecognizer =
      [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleDrawingPan:)];
    _drawingPanRecognizer.delegate = self;
    _drawingPanRecognizer.cancelsTouchesInView = NO;
    [_pdfView addGestureRecognizer:_drawingPanRecognizer];

    self.isAccessibilityElement = YES;
    self.accessibilityLabel = @"PDF canvas";
    [self refreshAccessibilityValue];
  }
  return self;
}

- (BOOL)gestureRecognizerShouldBegin:(UIGestureRecognizer *)gestureRecognizer
{
  if (gestureRecognizer == _highlightPanRecognizer) {
    return [AcaciaAnnotationKindForTool(_activeTool) isEqualToString:@"highlight"];
  }
  if (gestureRecognizer == _drawingPanRecognizer) {
    return [AcaciaAnnotationKindForTool(_activeTool) isEqualToString:@"drawing"];
  }
  return YES;
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

- (void)setDocumentBookmark:(NSString *)documentBookmark
{
  _documentBookmark = [documentBookmark copy];
  [self reloadDocumentIfNeeded];
}

- (void)dealloc
{
  [self stopAccessingDocumentURL];
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

- (void)setActiveTool:(NSString *)activeTool
{
  _activeTool = [activeTool copy];

  if ([_activeTool isEqualToString:@"highlight"]) {
    [self highlightCurrentSelectionIfPossible];
  }
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

- (BOOL)highlightCurrentSelectionIfPossible
{
  PDFSelection *selection = _pdfView.currentSelection;
  if (selection == nil || selection.string.length == 0 || self.onCanvasPress == nil || _pdfView.document == nil) {
    return NO;
  }

  NSArray<PDFSelection *> *lineSelections = selection.selectionsByLine;
  if (lineSelections.count == 0) {
    lineSelections = @[selection];
  }

  BOOL emittedHighlight = NO;
  for (PDFSelection *lineSelection in lineSelections) {
    PDFPage *page = lineSelection.pages.firstObject;
    if (page == nil) {
      continue;
    }

    CGRect lineBounds = [lineSelection boundsForPage:page];
    if (CGRectIsEmpty(lineBounds)) {
      continue;
    }

    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
    if (CGRectIsEmpty(pageBounds)) {
      pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
    }
    if (CGRectIsEmpty(pageBounds)) {
      continue;
    }

    CGRect canonicalBounds = AcaciaCanonicalBoundsForPDFBounds(lineBounds, pageBounds);
    NSUInteger pageIndex = [_pdfView.document indexForPage:page];
    self.onCanvasPress(@{
      @"kind": @"highlight",
      @"pageIndex": @(pageIndex),
      @"bounds": @{
        @"x": @(CGRectGetMinX(canonicalBounds)),
        @"y": @(CGRectGetMinY(canonicalBounds)),
        @"width": @(CGRectGetWidth(canonicalBounds)),
        @"height": @(CGRectGetHeight(canonicalBounds)),
      },
    });
    emittedHighlight = YES;
  }

  if (emittedHighlight) {
    [_pdfView clearSelection];
  }

  return emittedHighlight;
}

- (BOOL)emitTextHighlightAnnotationsForPage:(PDFPage *)page dragBounds:(CGRect)dragBounds
{
  if (self.onCanvasPress == nil || _pdfView.document == nil || CGRectIsEmpty(dragBounds)) {
    return NO;
  }

  PDFSelection *selection = [page selectionForRect:dragBounds];
  if (selection == nil || selection.string.length == 0) {
    return NO;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (CGRectIsEmpty(pageBounds)) {
    return NO;
  }

  NSArray<PDFSelection *> *lineSelections = selection.selectionsByLine;
  if (lineSelections.count == 0) {
    lineSelections = @[selection];
  }

  BOOL emittedHighlight = NO;
  NSUInteger pageIndex = [_pdfView.document indexForPage:page];
  for (PDFSelection *lineSelection in lineSelections) {
    CGRect lineBounds = [lineSelection boundsForPage:page];
    if (CGRectIsEmpty(lineBounds)) {
      continue;
    }

    CGRect canonicalBounds = AcaciaCanonicalBoundsForPDFBounds(lineBounds, pageBounds);
    self.onCanvasPress(@{
      @"kind": @"highlight",
      @"pageIndex": @(pageIndex),
      @"bounds": @{
        @"x": @(CGRectGetMinX(canonicalBounds)),
        @"y": @(CGRectGetMinY(canonicalBounds)),
        @"width": @(CGRectGetWidth(canonicalBounds)),
        @"height": @(CGRectGetHeight(canonicalBounds)),
      },
    });
    emittedHighlight = YES;
  }

  return emittedHighlight;
}

- (void)handleTap:(UITapGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (self.onCanvasPress == nil || kind == nil) {
    return;
  }

  CGPoint viewPoint = [recognizer locationInView:_pdfView];
  PDFPage *page = [_pdfView pageForPoint:viewPoint nearest:NO];
  if (page == nil || _pdfView.document == nil) {
    return;
  }

  [self emitAnnotationForKind:kind page:page startViewPoint:viewPoint endViewPoint:viewPoint preferDrag:NO];
}

- (void)handleHighlightPan:(UIPanGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (![kind isEqualToString:@"highlight"] || self.onCanvasPress == nil) {
    _hasHighlightPanStartPoint = NO;
    return;
  }

  if (recognizer.state == UIGestureRecognizerStateBegan) {
    _highlightPanStartPoint = [recognizer locationInView:_pdfView];
    _hasHighlightPanStartPoint = YES;
    return;
  }

  if (recognizer.state == UIGestureRecognizerStateCancelled ||
      recognizer.state == UIGestureRecognizerStateFailed) {
    _hasHighlightPanStartPoint = NO;
    return;
  }

  if (recognizer.state != UIGestureRecognizerStateEnded || !_hasHighlightPanStartPoint) {
    return;
  }

  CGPoint endPoint = [recognizer locationInView:_pdfView];
  PDFPage *page = [_pdfView pageForPoint:_highlightPanStartPoint nearest:NO];
  _hasHighlightPanStartPoint = NO;
  if (page == nil || _pdfView.document == nil) {
    return;
  }

  [self emitAnnotationForKind:kind page:page startViewPoint:_highlightPanStartPoint endViewPoint:endPoint preferDrag:YES];
}

- (void)handleDrawingPan:(UIPanGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (![kind isEqualToString:@"drawing"] || self.onCanvasPress == nil) {
    [_drawingViewPoints removeAllObjects];
    return;
  }

  CGPoint viewPoint = [recognizer locationInView:_pdfView];

  if (recognizer.state == UIGestureRecognizerStateBegan) {
    _drawingViewPoints = [NSMutableArray arrayWithObject:[NSValue valueWithCGPoint:viewPoint]];
    return;
  }

  if (recognizer.state == UIGestureRecognizerStateChanged) {
    if (_drawingViewPoints == nil) {
      _drawingViewPoints = [NSMutableArray array];
    }
    [_drawingViewPoints addObject:[NSValue valueWithCGPoint:viewPoint]];
    return;
  }

  if (recognizer.state == UIGestureRecognizerStateCancelled ||
      recognizer.state == UIGestureRecognizerStateFailed) {
    [_drawingViewPoints removeAllObjects];
    return;
  }

  if (recognizer.state != UIGestureRecognizerStateEnded) {
    return;
  }

  if (_drawingViewPoints == nil) {
    _drawingViewPoints = [NSMutableArray array];
  }
  [_drawingViewPoints addObject:[NSValue valueWithCGPoint:viewPoint]];

  PDFPage *page = [_pdfView pageForPoint:_drawingViewPoints.firstObject.CGPointValue nearest:NO];
  if (page == nil || _pdfView.document == nil) {
    [_drawingViewPoints removeAllObjects];
    return;
  }

  [self emitDrawingAnnotationForPage:page viewPoints:_drawingViewPoints.copy];
  [_drawingViewPoints removeAllObjects];
}

- (void)emitDrawingAnnotationForPage:(PDFPage *)page
                          viewPoints:(NSArray<NSValue *> *)viewPoints
{
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (CGRectIsEmpty(pageBounds)) {
    return;
  }

  NSArray<NSDictionary *> *points =
    AcaciaCanonicalInkPathForViewPoints(viewPoints, _pdfView, page, pageBounds);
  CGRect canonicalBounds = AcaciaCanonicalBoundsForInkPath(points);
  NSUInteger pageIndex = [_pdfView.document indexForPage:page];

  self.onCanvasPress(@{
    @"kind": @"drawing",
    @"pageIndex": @(pageIndex),
    @"bounds": @{
      @"x": @(CGRectGetMinX(canonicalBounds)),
      @"y": @(CGRectGetMinY(canonicalBounds)),
      @"width": @(CGRectGetWidth(canonicalBounds)),
      @"height": @(CGRectGetHeight(canonicalBounds)),
    },
    @"points": points,
  });
}

- (void)emitAnnotationForKind:(NSString *)kind
                         page:(PDFPage *)page
               startViewPoint:(CGPoint)startViewPoint
                 endViewPoint:(CGPoint)endViewPoint
                    preferDrag:(BOOL)preferDrag
{
  NSUInteger pageIndex = [_pdfView.document indexForPage:page];
  CGPoint startPagePoint = [_pdfView convertPoint:startViewPoint toPage:page];
  CGPoint endPagePoint = [_pdfView convertPoint:endViewPoint toPage:page];
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (CGRectIsEmpty(pageBounds)) {
    return;
  }

  BOOL meaningfulDrag = preferDrag &&
    (fabs(endViewPoint.x - startViewPoint.x) >= 6.0 || fabs(endViewPoint.y - startViewPoint.y) >= 6.0);
  if ([kind isEqualToString:@"highlight"] && meaningfulDrag) {
    CGRect dragBounds = AcaciaExpandedPDFRectForDrag(startPagePoint, endPagePoint, pageBounds);
    if ([self emitTextHighlightAnnotationsForPage:page dragBounds:dragBounds]) {
      return;
    }
  }

  CGRect canonicalBounds = meaningfulDrag
    ? AcaciaCanonicalBoundsForDrag(startPagePoint, endPagePoint, pageBounds)
    : AcaciaCanonicalBoundsForPoint(kind, startPagePoint, pageBounds);

  NSMutableDictionary *payload = [@{
    @"kind": kind,
    @"pageIndex": @(pageIndex),
    @"bounds": @{
      @"x": @(CGRectGetMinX(canonicalBounds)),
      @"y": @(CGRectGetMinY(canonicalBounds)),
      @"width": @(CGRectGetWidth(canonicalBounds)),
      @"height": @(CGRectGetHeight(canonicalBounds)),
    },
  } mutableCopy];

  if ([kind isEqualToString:@"drawing"]) {
    CGPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(startPagePoint, pageBounds);
    payload[@"points"] = @[@{
      @"x": @(round(canonicalPoint.x)),
      @"y": @(round(canonicalPoint.y)),
    }];
  }

  self.onCanvasPress(payload);
}

- (void)reloadDocumentIfNeeded
{
  if (_documentPath.length == 0 ||
      ([_documentPath isEqualToString:_loadedPath] &&
       ((_documentBookmark.length == 0 && _loadedBookmark.length == 0) ||
        [_documentBookmark isEqualToString:_loadedBookmark]))) {
    return;
  }

  [self stopAccessingDocumentURL];
  NSURL *documentURL = [self resolvedDocumentURL];
  if (documentURL == nil) {
    return;
  }
  if (_documentBookmark.length > 0) {
    _isAccessingSecurityScope = [documentURL startAccessingSecurityScopedResource];
    _securityScopedURL = documentURL;
  }

  PDFDocument *document = [[PDFDocument alloc] initWithURL:documentURL];
  _pdfView.document = document;
  _pdfView.autoScales = YES;
  _loadedPath = [_documentPath copy];
  _loadedBookmark = [_documentBookmark copy];
  [self applyAnnotations];
  [self applyZoom];
  [self goToCurrentPage];
}

- (NSURL *)resolvedDocumentURL
{
  if (_documentBookmark.length > 0) {
    NSData *bookmarkData = [[NSData alloc] initWithBase64EncodedString:_documentBookmark options:0];
    if (bookmarkData.length > 0) {
      BOOL stale = NO;
      NSError *error = nil;
      NSURL *resolvedURL = [NSURL URLByResolvingBookmarkData:bookmarkData
                                                     options:0
                                               relativeToURL:nil
                                         bookmarkDataIsStale:&stale
                                                       error:&error];
      if (resolvedURL != nil) {
        return resolvedURL;
      }
    }
  }

  return [NSURL fileURLWithPath:_documentPath];
}

- (void)stopAccessingDocumentURL
{
  if (_isAccessingSecurityScope) {
    [_securityScopedURL stopAccessingSecurityScopedResource];
  }
  _securityScopedURL = nil;
  _isAccessingSecurityScope = NO;
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
      if ([annotation.contents hasPrefix:@"Acacia:"] || [annotation.userName isEqualToString:@"Acacia"]) {
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
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    NSString *subtype = AcaciaAnnotationSubtypeForKind(kind);
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds
                                                             forType:subtype
                                                      withProperties:nil];
    annotation.userName = @"Acacia";
    annotation.contents = [NSString stringWithFormat:@"Acacia:%@", [RCTConvert NSString:annotationInfo[@"id"]]];
    if ([kind isEqualToString:@"signature"]) {
      annotation.color = [UIColor clearColor];
      annotation.font = [UIFont fontWithName:@"SnellRoundhand-Bold" size:22] ?: [UIFont italicSystemFontOfSize:20];
      annotation.fontColor = [UIColor colorWithWhite:0.08 alpha:1.0];
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Signature";
    } else if ([kind isEqualToString:@"note"]) {
      annotation.color = [UIColor colorWithRed:0.25 green:0.52 blue:0.96 alpha:0.78];
      annotation.font = [UIFont systemFontOfSize:12 weight:UIFontWeightSemibold];
      annotation.fontColor = [UIColor colorWithRed:0.07 green:0.16 blue:0.31 alpha:1.0];
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Local note";
    } else if ([kind isEqualToString:@"drawing"]) {
      annotation.color = [UIColor colorWithRed:0.94 green:0.27 blue:0.27 alpha:0.9];
      id rawPoints = annotationInfo[@"points"];
      NSArray *points = [rawPoints isKindOfClass:[NSArray class]] ? rawPoints : @[];
      UIBezierPath *inkPath = AcaciaBezierPathForInkPoints(points, page);
      if (inkPath != nil) {
        [annotation addBezierPath:inkPath];
      }
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Local drawing";
    } else {
      annotation.color = [UIColor colorWithRed:1 green:0.82 blue:0.12 alpha:0.42];
      annotation.quadrilateralPoints = AcaciaHighlightQuadPointsForBounds(bounds);
    }
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

  CGFloat width = CGRectGetWidth(requestedBounds) / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds);
  CGFloat height = CGRectGetHeight(requestedBounds) / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds);
  width = MIN(MAX(width, 4.0), CGRectGetWidth(pageBounds));
  height = MIN(MAX(height, 4.0), CGRectGetHeight(pageBounds));

  CGFloat x = CGRectGetMinX(pageBounds) + CGRectGetMinX(requestedBounds) / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds);
  CGFloat y = CGRectGetMaxY(pageBounds) - ((CGRectGetMinY(requestedBounds) + CGRectGetHeight(requestedBounds)) / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds));
  x = MIN(MAX(x, CGRectGetMinX(pageBounds)), CGRectGetMaxX(pageBounds) - width);
  y = MIN(MAX(y, CGRectGetMinY(pageBounds)), CGRectGetMaxY(pageBounds) - height);

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
RCT_EXPORT_VIEW_PROPERTY(documentBookmark, NSString)
RCT_EXPORT_VIEW_PROPERTY(pageIndex, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(zoom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(activeTool, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)
RCT_EXPORT_VIEW_PROPERTY(onCanvasPress, RCTBubblingEventBlock)

- (UIView *)view
{
  return [PdfCanvasView new];
}

@end
