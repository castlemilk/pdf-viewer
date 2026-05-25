#import <PDFKit/PDFKit.h>
#import <React/RCTComponent.h>
#import <React/RCTConvert.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <Accessibility/Accessibility.h>
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

static NSString *AcaciaAnnotationAccessibilityIdentifierForKind(NSString *kind)
{
  if ([kind isEqualToString:@"signature"]) {
    return @"pdf-annotation-signature";
  }
  if ([kind isEqualToString:@"note"]) {
    return @"pdf-annotation-note";
  }
  if ([kind isEqualToString:@"drawing"]) {
    return @"pdf-annotation-drawing";
  }
  if ([kind isEqualToString:@"highlight"]) {
    return @"pdf-annotation-highlight";
  }
  return @"pdf-annotation";
}

static NSString *AcaciaAnnotationKindAccessibilityLabel(NSString *kind)
{
  if ([kind isEqualToString:@"signature"]) {
    return @"Signature";
  }
  if ([kind isEqualToString:@"note"]) {
    return @"Note";
  }
  if ([kind isEqualToString:@"drawing"]) {
    return @"Drawing";
  }
  if ([kind isEqualToString:@"highlight"]) {
    return @"Highlight";
  }
  return @"Annotation";
}

static NSString *AcaciaAnnotationAccessibilityLabel(NSDictionary *annotationInfo)
{
  NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
  NSString *text = [RCTConvert NSString:annotationInfo[@"text"]];
  if ([kind isEqualToString:@"signature"] && text.length > 0) {
    return text;
  }

  NSNumber *pageIndex = [RCTConvert NSNumber:annotationInfo[@"pageIndex"]];
  NSUInteger pageNumber = pageIndex == nil ? 1 : pageIndex.unsignedIntegerValue + 1;
  NSString *kindLabel = AcaciaAnnotationKindAccessibilityLabel(kind);
  if (text.length > 0) {
    return [NSString stringWithFormat:@"%@ annotation on page %lu, %@",
                                      kindLabel,
                                      (unsigned long)pageNumber,
                                      text];
  }
  return [NSString stringWithFormat:@"%@ annotation on page %lu",
                                    kindLabel,
                                    (unsigned long)pageNumber];
}

static NSString *AcaciaToolActionAccessibilityLabel(NSString *kind)
{
  if ([kind isEqualToString:@"signature"]) {
    return @"Add signature at page center";
  }
  if ([kind isEqualToString:@"note"]) {
    return @"Add note at page center";
  }
  if ([kind isEqualToString:@"drawing"]) {
    return @"Add pen drawing at page center";
  }
  if ([kind isEqualToString:@"highlight"]) {
    return @"Add highlight at page center";
  }
  return nil;
}

static NSArray<NSString *> *AcaciaCanvasAccessibilityInputLabels(NSString *kind)
{
  NSMutableArray<NSString *> *labels = [@[@"PDF canvas", @"Document canvas", @"Page canvas"] mutableCopy];
  NSString *actionLabel = AcaciaToolActionAccessibilityLabel(kind);
  if (actionLabel.length > 0) {
    [labels addObject:actionLabel];
  }
  return labels;
}

static AXCustomContent *AcaciaCustomContent(NSString *label,
                                            NSString *value,
                                            AXCustomContentImportance importance)
{
  AXCustomContent *content = [AXCustomContent customContentWithLabel:label value:value];
  content.importance = importance;
  return content;
}

static NSURL *AcaciaDocumentURLForPath(NSString *path)
{
  if (path.length == 0) {
    return nil;
  }

  NSURL *url = [NSURL URLWithString:path];
  if (url.isFileURL) {
    return url;
  }

  return [NSURL fileURLWithPath:path];
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

static UIColor *AcaciaColorFromHexString(NSString *hexString, CGFloat alpha, UIColor *fallbackColor)
{
  NSString *hex = [RCTConvert NSString:hexString];
  if (hex.length == 0) {
    return fallbackColor;
  }

  if ([hex hasPrefix:@"#"]) {
    hex = [hex substringFromIndex:1];
  }

  if (hex.length != 6) {
    return fallbackColor;
  }

  unsigned int rgb = 0;
  NSScanner *scanner = [NSScanner scannerWithString:hex];
  if (![scanner scanHexInt:&rgb]) {
    return fallbackColor;
  }

  return [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0
                         green:((rgb >> 8) & 0xFF) / 255.0
                          blue:(rgb & 0xFF) / 255.0
                         alpha:alpha];
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

static CGRect AcaciaPDFBoundsForRequestedBounds(CGRect requestedBounds, PDFPage *page)
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

@interface AcaciaPDFAnnotationOverlayView : UIView
@property (nonatomic, weak) PDFView *pdfView;
@property (nonatomic, copy) NSArray *annotations;
@property (nonatomic, copy) NSArray *searchHighlights;
@end

@implementation AcaciaPDFAnnotationOverlayView

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.userInteractionEnabled = NO;
  }
  return self;
}

- (void)setAnnotations:(NSArray *)annotations
{
  _annotations = [annotations copy];
  [self setNeedsDisplay];
}

- (void)setSearchHighlights:(NSArray *)searchHighlights
{
  _searchHighlights = [searchHighlights copy];
  [self setNeedsDisplay];
}

- (void)drawRect:(CGRect)rect
{
  [super drawRect:rect];

  [self drawHighlightOverlays:self.searchHighlights alpha:0.46];

  NSMutableArray *highlightAnnotations = [NSMutableArray array];
  for (NSDictionary *annotationInfo in self.annotations) {
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    if ([kind isEqualToString:@"highlight"]) {
      [highlightAnnotations addObject:annotationInfo];
    }
  }
  [self drawHighlightOverlays:highlightAnnotations alpha:0.62];
}

- (void)drawHighlightOverlays:(NSArray *)items alpha:(CGFloat)alpha
{
  PDFDocument *document = self.pdfView.document;
  if (document == nil || items.count == 0) {
    return;
  }

  CGContextRef context = UIGraphicsGetCurrentContext();
  CGContextSaveGState(context);
  CGContextSetBlendMode(context, kCGBlendModeNormal);

  for (NSDictionary *itemInfo in items) {
    NSNumber *pageIndex = [RCTConvert NSNumber:itemInfo[@"pageIndex"]];
    PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];
    if (page == nil) {
      continue;
    }

    NSDictionary *boundsInfo = [RCTConvert NSDictionary:itemInfo[@"bounds"]];
    CGRect requestedBounds = CGRectMake(
      [RCTConvert CGFloat:boundsInfo[@"x"]],
      [RCTConvert CGFloat:boundsInfo[@"y"]],
      [RCTConvert CGFloat:boundsInfo[@"width"]],
      [RCTConvert CGFloat:boundsInfo[@"height"]]
    );
    CGRect pdfBounds = AcaciaPDFBoundsForRequestedBounds(requestedBounds, page);
    CGRect pdfViewBounds = [self.pdfView convertRect:pdfBounds fromPage:page];
    CGRect overlayBounds = [self convertRect:pdfViewBounds fromView:self.pdfView];
    if (CGRectIsEmpty(overlayBounds) || !CGRectIntersectsRect(overlayBounds, self.bounds)) {
      continue;
    }

    CGRect paddedBounds = CGRectInset(overlayBounds, -1.0, -1.0);
    UIBezierPath *path = [UIBezierPath bezierPathWithRoundedRect:paddedBounds cornerRadius:2.0];
    UIColor *color = AcaciaColorFromHexString(
      itemInfo[@"color"],
      alpha,
      [UIColor colorWithRed:1.0 green:0.82 blue:0.12 alpha:alpha]
    );
    [color setFill];
    [path fill];
  }

  CGContextRestoreGState(context);
}

@end

@interface PdfCanvasView : UIView
@property (nonatomic, copy) NSString *documentPath;
@property (nonatomic, copy) NSString *documentBookmark;
@property (nonatomic, strong) NSNumber *pageIndex;
@property (nonatomic, strong) NSNumber *zoom;
@property (nonatomic, copy) NSString *activeTool;
@property (nonatomic, copy) NSArray *annotations;
@property (nonatomic, copy) NSArray *searchHighlights;
@property (nonatomic, copy) NSString *signaturePreviewText;
@property (nonatomic, copy) RCTBubblingEventBlock onCanvasPress;
@property (nonatomic, copy) RCTBubblingEventBlock onCanvasAccessibilityAction;
@end

@interface PdfCanvasView () <UIGestureRecognizerDelegate>
@end

@implementation PdfCanvasView {
  PDFView *_pdfView;
  AcaciaPDFAnnotationOverlayView *_annotationOverlayView;
  NSString *_loadedPath;
  NSString *_loadedBookmark;
  NSURL *_securityScopedURL;
  BOOL _isAccessingSecurityScope;
  CGPoint _highlightPanStartPoint;
  BOOL _hasHighlightPanStartPoint;
  NSMutableArray<NSValue *> *_drawingViewPoints;
  PDFSelection *_pendingTextSelection;
  UIPanGestureRecognizer *_highlightPanRecognizer;
  UIPanGestureRecognizer *_drawingPanRecognizer;
  NSMutableArray<UIView *> *_annotationAccessibilityViews;
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
    _annotationOverlayView = [[AcaciaPDFAnnotationOverlayView alloc] initWithFrame:self.bounds];
    _annotationOverlayView.pdfView = _pdfView;
    _annotationOverlayView.autoresizingMask =
      UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self addSubview:_annotationOverlayView];
    UITapGestureRecognizer *tapRecognizer =
      [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleTap:)];
    tapRecognizer.cancelsTouchesInView = NO;
    [self addGestureRecognizer:tapRecognizer];
    _highlightPanRecognizer =
      [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleHighlightPan:)];
    _highlightPanRecognizer.delegate = self;
    _highlightPanRecognizer.cancelsTouchesInView = YES;
    [self addGestureRecognizer:_highlightPanRecognizer];
    _drawingPanRecognizer =
      [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleDrawingPan:)];
    _drawingPanRecognizer.delegate = self;
    _drawingPanRecognizer.cancelsTouchesInView = YES;
    [self addGestureRecognizer:_drawingPanRecognizer];
    _annotationAccessibilityViews = [NSMutableArray array];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(pdfSelectionChanged:)
                                                 name:PDFViewSelectionChangedNotification
                                               object:_pdfView];

    self.isAccessibilityElement = YES;
    self.accessibilityLabel = @"PDF canvas";
    self.accessibilityTraits = UIAccessibilityTraitAdjustable | UIAccessibilityTraitAllowsDirectInteraction;
    self.accessibilityIgnoresInvertColors = YES;
    self.showsLargeContentViewer = YES;
    self.largeContentTitle = @"PDF canvas";
    self.accessibilityRespondsToUserInteraction = YES;
    self.accessibilityUserInputLabels = AcaciaCanvasAccessibilityInputLabels(nil);
    [self addInteraction:[[UILargeContentViewerInteraction alloc] init]];
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
  _annotationOverlayView.frame = self.bounds;
  [self applyZoom];
  [self goToCurrentPage];
  [self updateAnnotationAccessibilityViews];
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
  [[NSNotificationCenter defaultCenter] removeObserver:self];
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
  [_annotationOverlayView setNeedsDisplay];
  [self refreshAccessibilityValue];
  [self updateAnnotationAccessibilityViews];
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
    [self cacheCurrentSelectionForHighlight];
    [self highlightCurrentSelectionIfPossible];
  }
  [self refreshAccessibilityValue];
}

- (void)emitCanvasAccessibilityAction:(NSString *)actionName
{
  if (self.onCanvasAccessibilityAction == nil || actionName.length == 0) {
    return;
  }

  self.onCanvasAccessibilityAction(@{@"actionName": actionName});
}

- (void)accessibilityIncrement
{
  [self emitCanvasAccessibilityAction:@"increment"];
}

- (void)accessibilityDecrement
{
  [self emitCanvasAccessibilityAction:@"decrement"];
}

- (BOOL)accessibilityScroll:(UIAccessibilityScrollDirection)direction
{
  if (direction == UIAccessibilityScrollDirectionLeft ||
      direction == UIAccessibilityScrollDirectionUp) {
    [self emitCanvasAccessibilityAction:@"increment"];
    return YES;
  }

  if (direction == UIAccessibilityScrollDirectionRight ||
      direction == UIAccessibilityScrollDirectionDown) {
    [self emitCanvasAccessibilityAction:@"decrement"];
    return YES;
  }

  return NO;
}

- (BOOL)accessibilityActivate
{
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  if (kind == nil) {
    return NO;
  }

  return [self emitCenteredAccessibilityAnnotationForKind:kind];
}

- (BOOL)accessibilityPerformMagicTap
{
  return [self accessibilityActivate];
}

- (BOOL)performPreviousPageAccessibilityAction
{
  [self emitCanvasAccessibilityAction:@"decrement"];
  return YES;
}

- (BOOL)performNextPageAccessibilityAction
{
  [self emitCanvasAccessibilityAction:@"increment"];
  return YES;
}

- (BOOL)performActiveToolAccessibilityAction
{
  return [self accessibilityActivate];
}

- (BOOL)emitCenteredAccessibilityAnnotationForKind:(NSString *)kind
{
  if (self.onCanvasPress == nil || kind.length == 0 || _pdfView.document == nil) {
    return NO;
  }

  if ([kind isEqualToString:@"highlight"] && [self highlightCurrentSelectionIfPossible]) {
    return YES;
  }

  if (_pdfView.document.pageCount == 0) {
    return NO;
  }

  PDFPage *page = _pdfView.currentPage ?: [_pdfView.document pageAtIndex:MIN(_pageIndex.unsignedIntegerValue, _pdfView.document.pageCount - 1)];
  if (page == nil) {
    return NO;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }
  if (CGRectIsEmpty(pageBounds)) {
    return NO;
  }

  CGPoint pageCenter = CGPointMake(
    CGRectGetMidX(pageBounds),
    CGRectGetMaxY(pageBounds) - CGRectGetHeight(pageBounds) * 0.45
  );

  if ([kind isEqualToString:@"highlight"]) {
    CGPoint startPagePoint = CGPointMake(CGRectGetMinX(pageBounds) + CGRectGetWidth(pageBounds) * 0.32, pageCenter.y);
    CGPoint endPagePoint = CGPointMake(CGRectGetMinX(pageBounds) + CGRectGetWidth(pageBounds) * 0.68, pageCenter.y);
    [self emitAnnotationForKind:kind
                           page:page
                 startViewPoint:[_pdfView convertPoint:startPagePoint fromPage:page]
                   endViewPoint:[_pdfView convertPoint:endPagePoint fromPage:page]
                      preferDrag:YES];
    return YES;
  }

  if ([kind isEqualToString:@"drawing"]) {
    CGPoint leftPoint = CGPointMake(CGRectGetMinX(pageBounds) + CGRectGetWidth(pageBounds) * 0.38, pageCenter.y);
    CGPoint rightPoint = CGPointMake(CGRectGetMinX(pageBounds) + CGRectGetWidth(pageBounds) * 0.62, pageCenter.y);
    [self emitDrawingAnnotationForPage:page viewPoints:@[
      [NSValue valueWithCGPoint:[_pdfView convertPoint:leftPoint fromPage:page]],
      [NSValue valueWithCGPoint:[_pdfView convertPoint:pageCenter fromPage:page]],
      [NSValue valueWithCGPoint:[_pdfView convertPoint:rightPoint fromPage:page]],
    ]];
    return YES;
  }

  CGPoint viewPoint = [_pdfView convertPoint:pageCenter fromPage:page];
  [self emitAnnotationForKind:kind page:page startViewPoint:viewPoint endViewPoint:viewPoint preferDrag:NO];
  return YES;
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
  [_annotationOverlayView setNeedsDisplay];
  [self refreshAccessibilityValue];
  [self updateAnnotationAccessibilityViews];
}

- (void)setAnnotations:(NSArray *)annotations
{
  _annotations = [annotations copy];
  _annotationOverlayView.annotations = _annotations;
  [self applyAnnotations];
  [self updateAnnotationAccessibilityViews];
}

- (void)setSearchHighlights:(NSArray *)searchHighlights
{
  _searchHighlights = [searchHighlights copy];
  _annotationOverlayView.searchHighlights = _searchHighlights;
  [self applySearchHighlights];
}

- (void)pdfSelectionChanged:(NSNotification *)notification
{
  [self cacheCurrentSelectionForHighlight];
}

- (void)cacheCurrentSelectionForHighlight
{
  PDFSelection *selection = _pdfView.currentSelection;
  if (selection == nil || selection.string.length == 0) {
    return;
  }

  _pendingTextSelection = [selection copy];
}

- (BOOL)highlightCurrentSelectionIfPossible
{
  PDFSelection *selection = _pdfView.currentSelection;
  if (selection == nil || selection.string.length == 0) {
    selection = _pendingTextSelection;
  }

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
    _pendingTextSelection = nil;
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

  _pendingTextSelection = nil;
  [self stopAccessingDocumentURL];
  NSURL *documentURL = [self resolvedDocumentURL];
  if (documentURL == nil) {
    _pdfView.document = nil;
    _loadedPath = nil;
    _loadedBookmark = nil;
    [self refreshAccessibilityValue];
    return;
  }
  if (_documentBookmark.length > 0) {
    _isAccessingSecurityScope = [documentURL startAccessingSecurityScopedResource];
    _securityScopedURL = documentURL;
  }

  PDFDocument *document = [[PDFDocument alloc] initWithURL:documentURL];
  if (document == nil || document.pageCount == 0) {
    _pdfView.document = nil;
    _loadedPath = nil;
    _loadedBookmark = nil;
    [self stopAccessingDocumentURL];
    [self refreshAccessibilityValue];
    return;
  }

  _pdfView.document = document;
  _pdfView.autoScales = YES;
  _loadedPath = [_documentPath copy];
  _loadedBookmark = [_documentBookmark copy];
  [_annotationOverlayView setNeedsDisplay];
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

  return AcaciaDocumentURLForPath(_documentPath);
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
      annotation.color = AcaciaColorFromHexString(
        annotationInfo[@"color"],
        0.42,
        [UIColor colorWithRed:1 green:0.82 blue:0.12 alpha:0.42]
      );
      annotation.quadrilateralPoints = AcaciaHighlightQuadPointsForBounds(bounds);
    }
    [page addAnnotation:annotation];
  }

  [self applySearchHighlights];
  [_annotationOverlayView setNeedsDisplay];
  [self refreshAccessibilityValue];
}

- (void)applySearchHighlights
{
  PDFDocument *document = _pdfView.document;
  if (document == nil) {
    return;
  }

  for (NSUInteger pageIndex = 0; pageIndex < document.pageCount; pageIndex += 1) {
    PDFPage *page = [document pageAtIndex:pageIndex];
    for (PDFAnnotation *annotation in page.annotations.copy) {
      if ([annotation.userName isEqualToString:@"AcaciaSearch"] ||
          [annotation.contents hasPrefix:@"AcaciaSearch:"]) {
        [page removeAnnotation:annotation];
      }
    }
  }

  for (NSDictionary *highlightInfo in _searchHighlights) {
    NSNumber *pageIndex = [RCTConvert NSNumber:highlightInfo[@"pageIndex"]];
    PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];
    if (page == nil) {
      continue;
    }

    NSDictionary *boundsInfo = [RCTConvert NSDictionary:highlightInfo[@"bounds"]];
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
    annotation.userName = @"AcaciaSearch";
    annotation.contents = [NSString stringWithFormat:@"AcaciaSearch:%@", [RCTConvert NSString:highlightInfo[@"id"]]];
    annotation.color = [UIColor colorWithRed:1.0 green:0.84 blue:0.18 alpha:0.58];
    annotation.quadrilateralPoints = AcaciaHighlightQuadPointsForBounds(bounds);
    [page addAnnotation:annotation];
  }

  [self refreshAccessibilityValue];
  [_annotationOverlayView setNeedsDisplay];
}

- (void)updateAnnotationAccessibilityViews
{
  for (UIView *view in _annotationAccessibilityViews) {
    [view removeFromSuperview];
  }
  [_annotationAccessibilityViews removeAllObjects];

  PDFDocument *document = _pdfView.document;
  PDFPage *currentPage = _pdfView.currentPage;
  if (document == nil || currentPage == nil || _annotations.count == 0) {
    self.accessibilityCustomRotors = @[];
    return;
  }

  NSUInteger currentPageIndex = [document indexForPage:currentPage];
  for (NSDictionary *annotationInfo in _annotations) {
    NSNumber *pageIndex = [RCTConvert NSNumber:annotationInfo[@"pageIndex"]];
    if (pageIndex == nil || pageIndex.unsignedIntegerValue != currentPageIndex) {
      continue;
    }

    PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];
    NSDictionary *boundsInfo = [RCTConvert NSDictionary:annotationInfo[@"bounds"]];
    if (page == nil || boundsInfo == nil) {
      continue;
    }

    CGRect requestedBounds = CGRectMake(
      [RCTConvert CGFloat:boundsInfo[@"x"]],
      [RCTConvert CGFloat:boundsInfo[@"y"]],
      [RCTConvert CGFloat:boundsInfo[@"width"]],
      [RCTConvert CGFloat:boundsInfo[@"height"]]
    );
    CGRect pdfBounds = [self visibleAnnotationBoundsForRequestedBounds:requestedBounds page:page];
    CGRect pdfViewBounds = [_pdfView convertRect:pdfBounds fromPage:page];
    CGRect viewBounds = [self convertRect:pdfViewBounds fromView:_pdfView];
    if (CGRectIsEmpty(viewBounds) || !CGRectIntersectsRect(viewBounds, self.bounds)) {
      continue;
    }

    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    NSString *labelText = AcaciaAnnotationAccessibilityLabel(annotationInfo);
    UILabel *label = [[UILabel alloc] initWithFrame:CGRectInset(viewBounds, -6.0, -6.0)];
    label.isAccessibilityElement = YES;
    label.accessibilityIdentifier = AcaciaAnnotationAccessibilityIdentifierForKind(kind);
    label.accessibilityLabel = labelText;
    label.accessibilityTraits = UIAccessibilityTraitStaticText;
    label.accessibilityUserInputLabels = @[labelText, AcaciaAnnotationKindAccessibilityLabel(kind)];
    label.accessibilityRespondsToUserInteraction = YES;
    ((id<AXCustomContentProvider>)label).accessibilityCustomContent = @[
      AcaciaCustomContent(@"Kind", AcaciaAnnotationKindAccessibilityLabel(kind), AXCustomContentImportanceHigh),
      AcaciaCustomContent(@"Page", [NSString stringWithFormat:@"%lu", (unsigned long)(pageIndex.unsignedIntegerValue + 1)], AXCustomContentImportanceDefault),
    ];
    label.backgroundColor = UIColor.clearColor;
    label.textColor = UIColor.clearColor;
    label.text = labelText;
    label.numberOfLines = 1;
    label.userInteractionEnabled = NO;
    [self addSubview:label];
    [_annotationAccessibilityViews addObject:label];
  }

  if (_annotationAccessibilityViews.count > 0) {
    __weak typeof(self) weakSelf = self;
    UIAccessibilityCustomRotor *annotationRotor =
      [[UIAccessibilityCustomRotor alloc] initWithName:@"Annotations"
                                        itemSearchBlock:^UIAccessibilityCustomRotorItemResult * _Nullable(UIAccessibilityCustomRotorSearchPredicate * _Nonnull predicate) {
      __strong typeof(weakSelf) strongSelf = weakSelf;
      if (strongSelf == nil || strongSelf->_annotationAccessibilityViews.count == 0) {
        return nil;
      }

      NSArray<UIView *> *elements = strongSelf->_annotationAccessibilityViews.copy;
      NSUInteger currentIndex = [elements indexOfObject:predicate.currentItem.targetElement];
      NSInteger nextIndex = 0;
      if (currentIndex != NSNotFound) {
        nextIndex = predicate.searchDirection == UIAccessibilityCustomRotorDirectionNext
          ? (NSInteger)currentIndex + 1
          : (NSInteger)currentIndex - 1;
      } else if (predicate.searchDirection == UIAccessibilityCustomRotorDirectionPrevious) {
        nextIndex = (NSInteger)elements.count - 1;
      }

      if (nextIndex < 0 || nextIndex >= (NSInteger)elements.count) {
        return nil;
      }

      return [[UIAccessibilityCustomRotorItemResult alloc] initWithTargetElement:elements[(NSUInteger)nextIndex]
                                                                    targetRange:nil];
    }];
    self.accessibilityCustomRotors = @[annotationRotor];
    UIAccessibilityPostNotification(UIAccessibilityLayoutChangedNotification, _annotationAccessibilityViews.firstObject);
  } else {
    self.accessibilityCustomRotors = @[];
  }
}

- (CGRect)visibleAnnotationBoundsForRequestedBounds:(CGRect)requestedBounds page:(PDFPage *)page
{
  return AcaciaPDFBoundsForRequestedBounds(requestedBounds, page);
}

- (NSArray<UIAccessibilityCustomAction *> *)currentAccessibilityCustomActions
{
  NSMutableArray<UIAccessibilityCustomAction *> *actions = [@[
    [[UIAccessibilityCustomAction alloc] initWithName:@"Previous page"
                                               target:self
                                             selector:@selector(performPreviousPageAccessibilityAction)],
    [[UIAccessibilityCustomAction alloc] initWithName:@"Next page"
                                               target:self
                                             selector:@selector(performNextPageAccessibilityAction)],
  ] mutableCopy];

  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  NSString *toolActionLabel = AcaciaToolActionAccessibilityLabel(kind);
  if (toolActionLabel.length > 0) {
    [actions addObject:[[UIAccessibilityCustomAction alloc] initWithName:toolActionLabel
                                                                  target:self
                                                                selector:@selector(performActiveToolAccessibilityAction)]];
  }

  return actions;
}

- (void)refreshAccessibilityValue
{
  NSUInteger pageCount = _pdfView.document.pageCount;
  NSUInteger currentPage = 0;
  if (_pdfView.document != nil && _pdfView.currentPage != nil) {
    currentPage = [_pdfView.document indexForPage:_pdfView.currentPage] + 1;
  }

  NSString *toolSummary = _activeTool.length > 0
    ? [NSString stringWithFormat:@", %@ tool active", _activeTool]
    : @"";
  NSString *summary = [NSString stringWithFormat:@"Page %lu of %lu, zoom %.0f%%, annotations %lu%@",
    (unsigned long)currentPage,
    (unsigned long)pageCount,
    _pdfView.scaleFactor * 100.0,
    (unsigned long)_annotations.count,
    toolSummary];
  NSString *kind = AcaciaAnnotationKindForTool(_activeTool);
  NSString *toolActionLabel = AcaciaToolActionAccessibilityLabel(kind);
  self.accessibilityLabel = [NSString stringWithFormat:@"PDF canvas, %@", summary];
  self.accessibilityValue = summary;
  self.accessibilityHint = toolActionLabel.length > 0
    ? [NSString stringWithFormat:@"%@. Swipe up or down to change pages.", toolActionLabel]
    : @"Swipe up or down to change pages. Double tap with a tool active to add an annotation at page center.";
  self.accessibilityTraits = UIAccessibilityTraitAdjustable | UIAccessibilityTraitAllowsDirectInteraction;
  self.accessibilityCustomActions = [self currentAccessibilityCustomActions];
  self.accessibilityUserInputLabels = AcaciaCanvasAccessibilityInputLabels(kind);
  self.largeContentTitle = [NSString stringWithFormat:@"PDF page %lu of %lu",
                                                      (unsigned long)currentPage,
                                                      (unsigned long)pageCount];
  ((id<AXCustomContentProvider>)self).accessibilityCustomContent = @[
    AcaciaCustomContent(@"Page", [NSString stringWithFormat:@"%lu of %lu", (unsigned long)currentPage, (unsigned long)pageCount], AXCustomContentImportanceHigh),
    AcaciaCustomContent(@"Zoom", [NSString stringWithFormat:@"%.0f%%", _pdfView.scaleFactor * 100.0], AXCustomContentImportanceDefault),
    AcaciaCustomContent(@"Annotations", [NSString stringWithFormat:@"%lu", (unsigned long)_annotations.count], AXCustomContentImportanceDefault),
  ];
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
RCT_EXPORT_VIEW_PROPERTY(searchHighlights, NSArray)
RCT_EXPORT_VIEW_PROPERTY(signaturePreviewText, NSString)
RCT_EXPORT_VIEW_PROPERTY(onCanvasPress, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onCanvasAccessibilityAction, RCTBubblingEventBlock)

- (UIView *)view
{
  return [PdfCanvasView new];
}

@end
