#import "PdfCanvasViewManager.h"

#import <PDFKit/PDFKit.h>
#import <React/RCTConvert.h>

@interface PdfCanvasView : NSView
@property (nonatomic, copy) NSString *documentPath;
@property (nonatomic, strong) NSNumber *pageIndex;
@property (nonatomic, strong) NSNumber *zoom;
@property (nonatomic, copy) NSArray *annotations;
@end

@implementation PdfCanvasView {
  PDFView *_pdfView;
  NSString *_loadedPath;
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
  }
  return self;
}

- (void)setDocumentPath:(NSString *)documentPath
{
  _documentPath = [documentPath copy];
  [self reloadDocumentIfNeeded];
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
  if (zoom.doubleValue > 0) {
    _pdfView.scaleFactor = zoom.doubleValue;
  }
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
  _loadedPath = [_documentPath copy];
  [self applyAnnotations];
  [self setPageIndex:_pageIndex ?: @0];
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
      if ([annotation.contents hasPrefix:@"PaperView:"]) {
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
    NSRect bounds = NSMakeRect(
      [RCTConvert CGFloat:boundsInfo[@"x"]],
      [RCTConvert CGFloat:boundsInfo[@"y"]],
      [RCTConvert CGFloat:boundsInfo[@"width"]],
      [RCTConvert CGFloat:boundsInfo[@"height"]]
    );
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds
                                                             forType:PDFAnnotationSubtypeHighlight
                                                      withProperties:nil];
    annotation.color = [NSColor colorWithCalibratedRed:1 green:0.82 blue:0.12 alpha:0.42];
    annotation.contents = [NSString stringWithFormat:@"PaperView:%@", [RCTConvert NSString:annotationInfo[@"id"]]];
    [page addAnnotation:annotation];
  }
}

@end

@implementation PdfCanvasViewManager

RCT_EXPORT_MODULE(PdfCanvas)
RCT_EXPORT_VIEW_PROPERTY(documentPath, NSString)
RCT_EXPORT_VIEW_PROPERTY(pageIndex, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(zoom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)

- (NSView *)view
{
  return [PdfCanvasView new];
}

@end
