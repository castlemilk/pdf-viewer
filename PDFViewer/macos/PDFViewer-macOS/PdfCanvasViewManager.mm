#import "PdfCanvasViewManager.h"

#import <PDFKit/PDFKit.h>
#import <React/RCTComponent.h>
#import <React/RCTConvert.h>
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

static NSSize AcaciaAnnotationSizeForKind(NSString *kind)
{
  if ([kind isEqualToString:@"signature"]) {
    return NSMakeSize(180.0, 48.0);
  }
  if ([kind isEqualToString:@"note"]) {
    return NSMakeSize(190.0, 54.0);
  }
  if ([kind isEqualToString:@"drawing"]) {
    return NSMakeSize(120.0, 80.0);
  }
  return NSMakeSize(160.0, 24.0);
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

static NSPoint AcaciaCanonicalPointForPDFPoint(NSPoint pagePoint, NSRect pageBounds)
{
  return NSMakePoint(
    ((pagePoint.x - NSMinX(pageBounds)) / NSWidth(pageBounds)) * AcaciaCanonicalPageWidth,
    ((NSMaxY(pageBounds) - pagePoint.y) / NSHeight(pageBounds)) * AcaciaCanonicalPageHeight
  );
}

static NSRect AcaciaClampCanonicalBounds(NSRect bounds)
{
  CGFloat width = MIN(MAX(NSWidth(bounds), 4.0), AcaciaCanonicalPageWidth);
  CGFloat height = MIN(MAX(NSHeight(bounds), 4.0), AcaciaCanonicalPageHeight);
  CGFloat x = MIN(MAX(NSMinX(bounds), 0.0), AcaciaCanonicalPageWidth - width);
  CGFloat y = MIN(MAX(NSMinY(bounds), 0.0), AcaciaCanonicalPageHeight - height);
  return NSMakeRect(round(x), round(y), round(width), round(height));
}

static CGFloat AcaciaCenteredMinimumRangeStart(CGFloat first, CGFloat second, CGFloat minimumLength)
{
  CGFloat length = fabs(second - first);
  if (length >= minimumLength) {
    return MIN(first, second);
  }

  return ((first + second) / 2.0) - minimumLength / 2.0;
}

static NSRect AcaciaCanonicalBoundsForPoint(NSString *kind, NSPoint pagePoint, NSRect pageBounds)
{
  NSSize annotationSize = AcaciaAnnotationSizeForKind(kind);
  NSPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(pagePoint, pageBounds);
  return AcaciaClampCanonicalBounds(NSMakeRect(
    canonicalPoint.x - annotationSize.width / 2.0,
    canonicalPoint.y - annotationSize.height / 2.0,
    annotationSize.width,
    annotationSize.height
  ));
}

static NSRect AcaciaCanonicalBoundsForDrag(NSPoint startPagePoint, NSPoint endPagePoint, NSRect pageBounds)
{
  NSPoint start = AcaciaCanonicalPointForPDFPoint(startPagePoint, pageBounds);
  NSPoint end = AcaciaCanonicalPointForPDFPoint(endPagePoint, pageBounds);
  CGFloat minimumHighlightLength = AcaciaAnnotationSizeForKind(@"highlight").height;
  CGFloat width = MAX(fabs(end.x - start.x), minimumHighlightLength);
  CGFloat height = MAX(fabs(end.y - start.y), minimumHighlightLength);
  CGFloat x = AcaciaCenteredMinimumRangeStart(start.x, end.x, minimumHighlightLength);
  CGFloat y = AcaciaCenteredMinimumRangeStart(start.y, end.y, minimumHighlightLength);
  return AcaciaClampCanonicalBounds(NSMakeRect(x, y, width, height));
}

static NSArray<NSDictionary *> *AcaciaCanonicalInkPathForViewPoints(NSArray<NSValue *> *viewPoints,
                                                                    PDFView *pdfView,
                                                                    PDFPage *page,
                                                                    NSRect pageBounds)
{
  NSMutableArray<NSDictionary *> *path = [NSMutableArray array];

  for (NSValue *value in viewPoints) {
    NSPoint viewPoint = value.pointValue;
    NSPoint pagePoint = [pdfView convertPoint:viewPoint toPage:page];
    NSPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(pagePoint, pageBounds);
    [path addObject:@{
      @"x": @(round(canonicalPoint.x)),
      @"y": @(round(canonicalPoint.y)),
    }];
  }

  return path;
}

static NSRect AcaciaCanonicalBoundsForInkPath(NSArray<NSDictionary *> *points)
{
  if (points.count == 0) {
    return AcaciaClampCanonicalBounds(NSMakeRect(0.0, 0.0, 24.0, 24.0));
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
  return AcaciaClampCanonicalBounds(NSMakeRect(
    minX - padding,
    minY - padding,
    maxX - minX + padding * 2.0,
    maxY - minY + padding * 2.0
  ));
}

static NSRect AcaciaFallbackAnnotationBounds(PDFPage *page)
{
  NSRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (NSIsEmptyRect(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }

  CGFloat margin = 24.0;
  CGFloat width = MIN(280.0, MAX(80.0, NSWidth(pageBounds) - margin * 2.0));
  CGFloat height = 24.0;

  return NSMakeRect(
    NSMinX(pageBounds) + margin,
    NSMaxY(pageBounds) - margin - height,
    width,
    height
  );
}

static NSRect AcaciaPDFBoundsForAnnotation(NSDictionary *boundsInfo, PDFPage *page)
{
  NSRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (NSIsEmptyRect(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }

  if (NSIsEmptyRect(pageBounds) || boundsInfo == nil) {
    return AcaciaFallbackAnnotationBounds(page);
  }

  CGFloat requestedX = [RCTConvert CGFloat:boundsInfo[@"x"]];
  CGFloat requestedY = [RCTConvert CGFloat:boundsInfo[@"y"]];
  CGFloat requestedWidth = [RCTConvert CGFloat:boundsInfo[@"width"]];
  CGFloat requestedHeight = [RCTConvert CGFloat:boundsInfo[@"height"]];
  if (requestedWidth <= 0 || requestedHeight <= 0) {
    return AcaciaFallbackAnnotationBounds(page);
  }

  CGFloat width = requestedWidth / AcaciaCanonicalPageWidth * NSWidth(pageBounds);
  CGFloat height = requestedHeight / AcaciaCanonicalPageHeight * NSHeight(pageBounds);
  width = MIN(MAX(width, 4.0), NSWidth(pageBounds));
  height = MIN(MAX(height, 4.0), NSHeight(pageBounds));

  CGFloat x = NSMinX(pageBounds) + requestedX / AcaciaCanonicalPageWidth * NSWidth(pageBounds);
  CGFloat y = NSMaxY(pageBounds) - ((requestedY + requestedHeight) / AcaciaCanonicalPageHeight * NSHeight(pageBounds));
  x = MIN(MAX(x, NSMinX(pageBounds)), NSMaxX(pageBounds) - width);
  y = MIN(MAX(y, NSMinY(pageBounds)), NSMaxY(pageBounds) - height);

  return NSMakeRect(x, y, width, height);
}

static NSPoint AcaciaPDFPointForCanonicalPoint(NSDictionary *pointInfo, NSRect pageBounds)
{
  CGFloat canonicalX = [RCTConvert CGFloat:pointInfo[@"x"]];
  CGFloat canonicalY = [RCTConvert CGFloat:pointInfo[@"y"]];
  return NSMakePoint(
    NSMinX(pageBounds) + canonicalX / AcaciaCanonicalPageWidth * NSWidth(pageBounds),
    NSMaxY(pageBounds) - canonicalY / AcaciaCanonicalPageHeight * NSHeight(pageBounds)
  );
}

static NSBezierPath *AcaciaBezierPathForInkPoints(NSArray *points, PDFPage *page)
{
  if (points.count == 0) {
    return nil;
  }

  NSRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (NSIsEmptyRect(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (NSIsEmptyRect(pageBounds)) {
    return nil;
  }

  NSBezierPath *path = [NSBezierPath bezierPath];
  path.lineWidth = 2.4;
  NSPoint firstPoint = AcaciaPDFPointForCanonicalPoint(points.firstObject, pageBounds);
  [path moveToPoint:firstPoint];

  for (NSUInteger index = 1; index < points.count; index += 1) {
    [path lineToPoint:AcaciaPDFPointForCanonicalPoint(points[index], pageBounds)];
  }

  if (points.count == 1) {
    NSRect dot = NSMakeRect(firstPoint.x - 1.2, firstPoint.y - 1.2, 2.4, 2.4);
    [path appendBezierPathWithOvalInRect:dot];
  }

  return path;
}

@interface PdfCanvasView : NSView <NSGestureRecognizerDelegate>
@property (nonatomic, copy) NSString *testID;
@property (nonatomic, copy) NSString *documentPath;
@property (nonatomic, copy) NSString *documentBookmark;
@property (nonatomic, strong) NSNumber *pageIndex;
@property (nonatomic, strong) NSNumber *zoom;
@property (nonatomic, copy) NSString *activeTool;
@property (nonatomic, copy) NSArray *annotations;
@property (nonatomic, copy) RCTBubblingEventBlock onCanvasPress;
@end

@implementation PdfCanvasView {
  PDFView *_pdfView;
  NSString *_loadedPath;
  NSString *_loadedBookmark;
  NSURL *_securityScopedURL;
  BOOL _isAccessingSecurityScope;
  NSPoint _highlightPanStartPoint;
  BOOL _hasHighlightPanStartPoint;
  NSMutableArray<NSValue *> *_drawingViewPoints;
  NSPanGestureRecognizer *_highlightPanRecognizer;
  NSPanGestureRecognizer *_drawingPanRecognizer;
}

- (instancetype)initWithFrame:(NSRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    _pdfView = [[PDFView alloc] initWithFrame:self.bounds];
    _pdfView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _pdfView.autoScales = YES;
    _pdfView.displayMode = kPDFDisplaySinglePageContinuous;
    _pdfView.displaysPageBreaks = YES;
    _pdfView.backgroundColor = [NSColor colorWithCalibratedWhite:0.92 alpha:1.0];
    [self addSubview:_pdfView];
    NSClickGestureRecognizer *clickRecognizer =
      [[NSClickGestureRecognizer alloc] initWithTarget:self action:@selector(handleClick:)];
    [_pdfView addGestureRecognizer:clickRecognizer];
    _highlightPanRecognizer =
      [[NSPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleHighlightPan:)];
    _highlightPanRecognizer.delegate = self;
    [_pdfView addGestureRecognizer:_highlightPanRecognizer];
    _drawingPanRecognizer =
      [[NSPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleDrawingPan:)];
    _drawingPanRecognizer.delegate = self;
    [_pdfView addGestureRecognizer:_drawingPanRecognizer];
  }
  return self;
}

- (BOOL)gestureRecognizerShouldBegin:(NSGestureRecognizer *)gestureRecognizer
{
  if (gestureRecognizer == _highlightPanRecognizer) {
    return [AcaciaAnnotationKindForTool(_activeTool) isEqualToString:@"highlight"];
  }
  if (gestureRecognizer == _drawingPanRecognizer) {
    return [AcaciaAnnotationKindForTool(_activeTool) isEqualToString:@"drawing"];
  }
  return YES;
}

- (void)layout
{
  [super layout];
  [self applyZoom];
}

- (void)setTestID:(NSString *)testID
{
  _testID = [testID copy];
  self.accessibilityIdentifier = _testID;
  _pdfView.accessibilityIdentifier = _testID;
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
  PDFPage *page = [_pdfView.document pageAtIndex:pageIndex.unsignedIntegerValue];
  if (page != nil) {
    [_pdfView goToPage:page];
  }
}

- (void)setZoom:(NSNumber *)zoom
{
  _zoom = zoom;
  [self applyZoom];
}

- (void)applyZoom
{
  if (_pdfView.document == nil || NSIsEmptyRect(self.bounds)) {
    return;
  }

  CGFloat zoomMultiplier = _zoom == nil ? 1.0 : _zoom.doubleValue;
  zoomMultiplier = MAX(0.25, MIN(zoomMultiplier, 3.0));

  [_pdfView layoutSubtreeIfNeeded];
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
}

- (void)setAnnotations:(NSArray *)annotations
{
  _annotations = [annotations copy];
  [self applyAnnotations];
}

- (void)handleClick:(NSClickGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (self.onCanvasPress == nil || kind == nil) {
    return;
  }

  NSPoint viewPoint = [recognizer locationInView:_pdfView];
  PDFPage *page = [_pdfView pageForPoint:viewPoint nearest:NO];
  if (page == nil || _pdfView.document == nil) {
    return;
  }

  [self emitAnnotationForKind:kind page:page startViewPoint:viewPoint endViewPoint:viewPoint preferDrag:NO];
}

- (void)handleHighlightPan:(NSPanGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (![kind isEqualToString:@"highlight"] || self.onCanvasPress == nil) {
    _hasHighlightPanStartPoint = NO;
    return;
  }

  if (recognizer.state == NSGestureRecognizerStateBegan) {
    _highlightPanStartPoint = [recognizer locationInView:_pdfView];
    _hasHighlightPanStartPoint = YES;
    return;
  }

  if (recognizer.state == NSGestureRecognizerStateCancelled ||
      recognizer.state == NSGestureRecognizerStateFailed) {
    _hasHighlightPanStartPoint = NO;
    return;
  }

  if (recognizer.state != NSGestureRecognizerStateEnded || !_hasHighlightPanStartPoint) {
    return;
  }

  NSPoint endPoint = [recognizer locationInView:_pdfView];
  PDFPage *page = [_pdfView pageForPoint:_highlightPanStartPoint nearest:NO];
  _hasHighlightPanStartPoint = NO;
  if (page == nil || _pdfView.document == nil) {
    return;
  }

  [self emitAnnotationForKind:kind page:page startViewPoint:_highlightPanStartPoint endViewPoint:endPoint preferDrag:YES];
}

- (void)handleDrawingPan:(NSPanGestureRecognizer *)recognizer
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (![kind isEqualToString:@"drawing"] || self.onCanvasPress == nil) {
    [_drawingViewPoints removeAllObjects];
    return;
  }

  NSPoint viewPoint = [recognizer locationInView:_pdfView];

  if (recognizer.state == NSGestureRecognizerStateBegan) {
    _drawingViewPoints = [NSMutableArray arrayWithObject:[NSValue valueWithPoint:viewPoint]];
    return;
  }

  if (recognizer.state == NSGestureRecognizerStateChanged) {
    if (_drawingViewPoints == nil) {
      _drawingViewPoints = [NSMutableArray array];
    }
    [_drawingViewPoints addObject:[NSValue valueWithPoint:viewPoint]];
    return;
  }

  if (recognizer.state == NSGestureRecognizerStateCancelled ||
      recognizer.state == NSGestureRecognizerStateFailed) {
    [_drawingViewPoints removeAllObjects];
    return;
  }

  if (recognizer.state != NSGestureRecognizerStateEnded) {
    return;
  }

  if (_drawingViewPoints == nil) {
    _drawingViewPoints = [NSMutableArray array];
  }
  [_drawingViewPoints addObject:[NSValue valueWithPoint:viewPoint]];

  PDFPage *page = [_pdfView pageForPoint:_drawingViewPoints.firstObject.pointValue nearest:NO];
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
  NSRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (NSIsEmptyRect(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (NSIsEmptyRect(pageBounds)) {
    return;
  }

  NSArray<NSDictionary *> *points =
    AcaciaCanonicalInkPathForViewPoints(viewPoints, _pdfView, page, pageBounds);
  NSRect canonicalBounds = AcaciaCanonicalBoundsForInkPath(points);
  NSUInteger pageIndex = [_pdfView.document indexForPage:page];

  self.onCanvasPress(@{
    @"kind": @"drawing",
    @"pageIndex": @(pageIndex),
    @"bounds": @{
      @"x": @(NSMinX(canonicalBounds)),
      @"y": @(NSMinY(canonicalBounds)),
      @"width": @(NSWidth(canonicalBounds)),
      @"height": @(NSHeight(canonicalBounds)),
    },
    @"points": points,
  });
}

- (void)emitAnnotationForKind:(NSString *)kind
                         page:(PDFPage *)page
               startViewPoint:(NSPoint)startViewPoint
                 endViewPoint:(NSPoint)endViewPoint
                    preferDrag:(BOOL)preferDrag
{
  NSUInteger pageIndex = [_pdfView.document indexForPage:page];
  NSPoint startPagePoint = [_pdfView convertPoint:startViewPoint toPage:page];
  NSPoint endPagePoint = [_pdfView convertPoint:endViewPoint toPage:page];
  NSRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (NSIsEmptyRect(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (NSIsEmptyRect(pageBounds)) {
    return;
  }

  BOOL meaningfulDrag = preferDrag &&
    (fabs(endViewPoint.x - startViewPoint.x) >= 6.0 || fabs(endViewPoint.y - startViewPoint.y) >= 6.0);
  NSRect canonicalBounds = meaningfulDrag
    ? AcaciaCanonicalBoundsForDrag(startPagePoint, endPagePoint, pageBounds)
    : AcaciaCanonicalBoundsForPoint(kind, startPagePoint, pageBounds);

  NSMutableDictionary *payload = [@{
    @"kind": kind,
    @"pageIndex": @(pageIndex),
    @"bounds": @{
      @"x": @(NSMinX(canonicalBounds)),
      @"y": @(NSMinY(canonicalBounds)),
      @"width": @(NSWidth(canonicalBounds)),
      @"height": @(NSHeight(canonicalBounds)),
    },
  } mutableCopy];

  if ([kind isEqualToString:@"drawing"]) {
    NSPoint canonicalPoint = AcaciaCanonicalPointForPDFPoint(startPagePoint, pageBounds);
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
  [self setPageIndex:_pageIndex ?: @0];
}

- (NSURL *)resolvedDocumentURL
{
  if (_documentBookmark.length > 0) {
    NSData *bookmarkData = [[NSData alloc] initWithBase64EncodedString:_documentBookmark options:0];
    if (bookmarkData.length > 0) {
      BOOL stale = NO;
      NSError *error = nil;
      NSURL *resolvedURL = [NSURL URLByResolvingBookmarkData:bookmarkData
                                                     options:NSURLBookmarkResolutionWithSecurityScope
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
    NSRect bounds = AcaciaPDFBoundsForAnnotation(boundsInfo, page);
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    NSString *subtype = AcaciaAnnotationSubtypeForKind(kind);
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds
                                                             forType:subtype
                                                      withProperties:nil];
    annotation.userName = @"Acacia";
    annotation.contents = [NSString stringWithFormat:@"Acacia:%@", [RCTConvert NSString:annotationInfo[@"id"]]];
    if ([kind isEqualToString:@"signature"]) {
      annotation.color = [NSColor clearColor];
      annotation.font = [NSFont fontWithName:@"Snell Roundhand" size:22] ?: [NSFont systemFontOfSize:20 weight:NSFontWeightSemibold];
      annotation.fontColor = [NSColor colorWithCalibratedWhite:0.08 alpha:1.0];
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Signature";
    } else if ([kind isEqualToString:@"note"]) {
      annotation.color = [NSColor colorWithCalibratedRed:0.25 green:0.52 blue:0.96 alpha:0.78];
      annotation.font = [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold];
      annotation.fontColor = [NSColor colorWithCalibratedRed:0.07 green:0.16 blue:0.31 alpha:1.0];
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Local note";
    } else if ([kind isEqualToString:@"drawing"]) {
      annotation.color = [NSColor colorWithCalibratedRed:0.94 green:0.27 blue:0.27 alpha:0.9];
      id rawPoints = annotationInfo[@"points"];
      NSArray *points = [rawPoints isKindOfClass:[NSArray class]] ? rawPoints : @[];
      NSBezierPath *inkPath = AcaciaBezierPathForInkPoints(points, page);
      if (inkPath != nil) {
        [annotation addBezierPath:inkPath];
      }
      annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Local drawing";
    } else {
      annotation.color = [NSColor colorWithCalibratedRed:1 green:0.82 blue:0.12 alpha:0.42];
      annotation.quadrilateralPoints = @[
        [NSValue valueWithPoint:NSMakePoint(NSMinX(bounds), NSMaxY(bounds))],
        [NSValue valueWithPoint:NSMakePoint(NSMaxX(bounds), NSMaxY(bounds))],
        [NSValue valueWithPoint:NSMakePoint(NSMinX(bounds), NSMinY(bounds))],
        [NSValue valueWithPoint:NSMakePoint(NSMaxX(bounds), NSMinY(bounds))],
      ];
    }
    [page addAnnotation:annotation];
  }
}

@end

@implementation PdfCanvasViewManager

RCT_EXPORT_MODULE(PdfCanvas)
RCT_EXPORT_VIEW_PROPERTY(testID, NSString)
RCT_EXPORT_VIEW_PROPERTY(documentPath, NSString)
RCT_EXPORT_VIEW_PROPERTY(documentBookmark, NSString)
RCT_EXPORT_VIEW_PROPERTY(pageIndex, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(zoom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(activeTool, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)
RCT_EXPORT_VIEW_PROPERTY(onCanvasPress, RCTBubblingEventBlock)

- (NSView *)view
{
  return [PdfCanvasView new];
}

@end
