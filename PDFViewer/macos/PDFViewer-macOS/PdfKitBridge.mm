#import "PdfKitBridge.h"

#import <AppKit/AppKit.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTConvert.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static const CGFloat AcaciaCanonicalPageWidth = 595.0;
static const CGFloat AcaciaCanonicalPageHeight = 842.0;
static NSString *const AcaciaPDFMenuOpenURLNotification = @"AcaciaPDFMenuOpenURLNotification";
static NSString *const AcaciaPdfOpenedFromMenuEvent = @"AcaciaPdfOpenedFromMenu";

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

static NSArray<NSDictionary *> *AcaciaDemoPDFSpecs(void)
{
  return @[
    @{@"id": @"q4-market-analysis", @"title": @"Q4 Market Analysis Report", @"author": @"Analytics Team", @"pageCount": @32},
    @{@"id": @"competitive-landscape", @"title": @"Competitive Landscape Overview", @"author": @"Strategy Group", @"pageCount": @18},
    @{@"id": @"product-roadmap", @"title": @"Product Roadmap 2025", @"author": @"Product Team", @"pageCount": @44},
    @{@"id": @"annual-financial-report", @"title": @"Annual Financial Report", @"author": @"Finance Department", @"pageCount": @56},
    @{@"id": @"future-work", @"title": @"Future of Work Report", @"author": @"Trend Insights", @"pageCount": @32},
    @{@"id": @"marketing-strategy", @"title": @"Marketing Strategy 2025", @"author": @"Marketing Team", @"pageCount": @24},
    @{@"id": @"board-minutes-apr", @"title": @"Board Meeting Minutes - Apr 2025", @"author": @"Corporate Secretary", @"pageCount": @14},
    @{@"id": @"invoice-0042", @"title": @"Invoice #INV-2025-0042", @"author": @"Finance Department", @"pageCount": @4},
  ];
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

static NSRect AcaciaCanonicalBoundsForPDFBounds(NSRect pdfBounds, NSRect pageBounds)
{
  CGFloat x = ((NSMinX(pdfBounds) - NSMinX(pageBounds)) / NSWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat y = ((NSMaxY(pageBounds) - NSMaxY(pdfBounds)) / NSHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  CGFloat width = (NSWidth(pdfBounds) / NSWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat height = (NSHeight(pdfBounds) / NSHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  return NSMakeRect(round(x), round(y), round(width), round(height));
}

static NSArray<NSValue *> *AcaciaHighlightQuadPointsForBounds(NSRect bounds)
{
  return @[
    [NSValue valueWithPoint:NSMakePoint(NSMinX(bounds), NSMaxY(bounds))],
    [NSValue valueWithPoint:NSMakePoint(NSMaxX(bounds), NSMaxY(bounds))],
    [NSValue valueWithPoint:NSMakePoint(NSMinX(bounds), NSMinY(bounds))],
    [NSValue valueWithPoint:NSMakePoint(NSMaxX(bounds), NSMinY(bounds))],
  ];
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
    [path appendBezierPathWithOvalInRect:NSMakeRect(firstPoint.x - 1.2, firstPoint.y - 1.2, 2.4, 2.4)];
  }

  return path;
}

@interface PdfKitBridge ()
@property (nonatomic, assign) BOOL hasPdfMenuOpenListeners;
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *pendingMenuOpenEvents;
+ (NSURL *)resolvedURLForPath:(NSString *)path
                     bookmark:(NSString *)bookmark
           didStartAccessing:(BOOL *)didStartAccessing;
+ (NSURL *)demoPDFDirectoryURL;
+ (BOOL)writeDemoPDFForSpec:(NSDictionary *)spec toURL:(NSURL *)url error:(NSError **)error;
+ (NSURL *)thumbnailURLForDocumentId:(NSString *)documentId pageIndex:(NSNumber *)pageIndex;
+ (NSString *)cacheSafeIdentifierForString:(NSString *)value;
@end

@implementation PdfKitBridge

RCT_EXPORT_MODULE();

- (instancetype)init
{
  self = [super init];
  if (self) {
    _pendingMenuOpenEvents = [NSMutableArray array];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleMenuOpenPDFNotification:)
                                                 name:AcaciaPDFMenuOpenURLNotification
                                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[AcaciaPdfOpenedFromMenuEvent];
}

- (void)startObserving
{
  self.hasPdfMenuOpenListeners = YES;

  for (NSDictionary *metadata in self.pendingMenuOpenEvents) {
    [self sendEventWithName:@"AcaciaPdfOpenedFromMenu" body:metadata];
  }
  [self.pendingMenuOpenEvents removeAllObjects];
}

- (void)stopObserving
{
  self.hasPdfMenuOpenListeners = NO;
}

- (void)emitOpenedPDFMetadata:(NSDictionary *)metadata
{
  if (self.hasPdfMenuOpenListeners) {
    [self sendEventWithName:@"AcaciaPdfOpenedFromMenu" body:metadata];
  } else {
    [self.pendingMenuOpenEvents addObject:metadata];
  }
}

- (void)handleMenuOpenPDFNotification:(NSNotification *)notification
{
  NSURL *url = notification.userInfo[@"url"];
  if (![url isKindOfClass:[NSURL class]]) {
    return;
  }

  NSError *error = nil;
  NSDictionary *metadata = [PdfKitBridge metadataForURL:url error:&error];
  if (metadata == nil) {
    NSLog(@"Unable to open PDF from menu: %@", error.localizedDescription);
    return;
  }

  [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:url];
  [self emitOpenedPDFMetadata:metadata];
}

RCT_EXPORT_METHOD(openPdf:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *testImportPath =
      [[NSProcessInfo processInfo].environment objectForKey:@"PDFVIEWER_TEST_IMPORT_PATH"];
    if (testImportPath.length > 0) {
      NSURL *testURL = [NSURL fileURLWithPath:testImportPath];
      NSError *error = nil;
      NSDictionary *metadata = [PdfKitBridge metadataForURL:testURL error:&error];

      if (metadata == nil) {
        reject(@"pdf_open_failed", error.localizedDescription, error);
        return;
      }

      [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:testURL];
      resolve(metadata);
      return;
    }

    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"pdf"]];
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    panel.canChooseFiles = YES;
    panel.message = @"Choose a PDF to add to Acacia";

    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
      resolve(nil);
      return;
    }

    NSError *error = nil;
    NSDictionary *metadata = [PdfKitBridge metadataForURL:panel.URL error:&error];

    if (metadata == nil) {
      reject(@"pdf_open_failed", error.localizedDescription, error);
      return;
    }

    [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:panel.URL];
    resolve(metadata);
  });
}

RCT_EXPORT_METHOD(seedDemoPdfs:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSURL *directoryURL = [PdfKitBridge demoPDFDirectoryURL];
    NSError *directoryError = nil;
    [[NSFileManager defaultManager] createDirectoryAtURL:directoryURL
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:&directoryError];

    if (directoryError != nil) {
      reject(@"pdf_demo_seed_failed", directoryError.localizedDescription, directoryError);
      return;
    }

    NSMutableArray *metadataItems = [NSMutableArray array];

    for (NSDictionary *spec in AcaciaDemoPDFSpecs()) {
      NSString *identifier = spec[@"id"];
      NSURL *url = [directoryURL URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.pdf", identifier]];

      if (![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        NSError *writeError = nil;
        if (![PdfKitBridge writeDemoPDFForSpec:spec toURL:url error:&writeError]) {
          reject(@"pdf_demo_seed_failed", writeError.localizedDescription, writeError);
          return;
        }
      }

      NSError *metadataError = nil;
      NSDictionary *metadata = [PdfKitBridge metadataForURL:url error:&metadataError];
      if (metadata != nil) {
        [metadataItems addObject:metadata];
      }
    }

    resolve(metadataItems);
  });
}

RCT_EXPORT_METHOD(loadDocumentMetadata:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:path];
  NSError *error = nil;
  NSDictionary *metadata = [PdfKitBridge metadataForURL:url error:&error];

  if (metadata == nil) {
    reject(@"pdf_metadata_failed", error.localizedDescription, error);
    return;
  }

  resolve(metadata);
}

RCT_EXPORT_METHOD(search:(NSString *)path
                  bookmark:(NSString *)bookmark
                  query:(NSString *)query
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  PDFDocument *document = url == nil ? nil : [[PDFDocument alloc] initWithURL:url];
  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }
  if (document == nil) {
    reject(@"pdf_search_failed", @"Unable to load PDF.", nil);
    return;
  }

  NSMutableArray *results = [NSMutableArray array];
  NSArray<PDFSelection *> *selections = [document findString:query withOptions:NSCaseInsensitiveSearch];
  NSUInteger limit = MIN(selections.count, 50);

  for (NSUInteger index = 0; index < limit; index += 1) {
    PDFSelection *selection = selections[index];
    PDFPage *page = selection.pages.firstObject;
    NSUInteger pageIndex = page == nil ? 0 : [document indexForPage:page];
    NSString *snippet = selection.string ?: query;
    NSMutableArray *searchBounds = [NSMutableArray array];
    NSArray<PDFSelection *> *lineSelections = selection.selectionsByLine;
    if (lineSelections.count == 0) {
      lineSelections = @[selection];
    }
    for (PDFSelection *lineSelection in lineSelections) {
      PDFPage *linePage = lineSelection.pages.firstObject ?: page;
      if (linePage == nil) {
        continue;
      }
      NSRect lineBounds = [lineSelection boundsForPage:linePage];
      NSRect pageBounds = [linePage boundsForBox:kPDFDisplayBoxCropBox];
      if (NSIsEmptyRect(pageBounds)) {
        pageBounds = [linePage boundsForBox:kPDFDisplayBoxMediaBox];
      }
      if (NSIsEmptyRect(lineBounds) || NSIsEmptyRect(pageBounds)) {
        continue;
      }
      NSRect canonicalBounds = AcaciaCanonicalBoundsForPDFBounds(lineBounds, pageBounds);
      [searchBounds addObject:@{
        @"x": @(NSMinX(canonicalBounds)),
        @"y": @(NSMinY(canonicalBounds)),
        @"width": @(NSWidth(canonicalBounds)),
        @"height": @(NSHeight(canonicalBounds)),
      }];
    }
    [results addObject:@{
      @"pageIndex": @(pageIndex),
      @"snippet": snippet,
      @"bounds": searchBounds,
    }];
  }

  resolve(results);
}

+ (NSURL *)resolvedURLForPath:(NSString *)path
                     bookmark:(NSString *)bookmark
           didStartAccessing:(BOOL *)didStartAccessing
{
  if (didStartAccessing != nil) {
    *didStartAccessing = NO;
  }

  if (bookmark.length > 0) {
    NSData *bookmarkData = [[NSData alloc] initWithBase64EncodedString:bookmark options:0];
    if (bookmarkData.length > 0) {
      BOOL stale = NO;
      NSError *error = nil;
      NSURL *resolvedURL = [NSURL URLByResolvingBookmarkData:bookmarkData
                                                     options:NSURLBookmarkResolutionWithSecurityScope
                                               relativeToURL:nil
                                         bookmarkDataIsStale:&stale
                                                       error:&error];
      if (resolvedURL != nil) {
        if (didStartAccessing != nil) {
          *didStartAccessing = [resolvedURL startAccessingSecurityScopedResource];
        }
        return resolvedURL;
      }
    }
  }

  return AcaciaDocumentURLForPath(path);
}

RCT_EXPORT_METHOD(exportPageText:(NSString *)path
                  bookmark:(NSString *)bookmark
                  pageIndex:(nonnull NSNumber *)pageIndex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
  PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];

  if (page == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_text_failed", @"Page not found.", nil);
    return;
  }

  NSString *fileName = [NSString stringWithFormat:@"acacia-page-%@.txt", pageIndex];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:fileName]];
  NSError *error = nil;

  if (![(page.string ?: @"") writeToURL:outputURL atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_text_failed", error.localizedDescription, error);
    return;
  }

  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }

  resolve(outputURL.path);
}

RCT_EXPORT_METHOD(exportPageImage:(NSString *)path
                  bookmark:(NSString *)bookmark
                  pageIndex:(nonnull NSNumber *)pageIndex
                  format:(NSString *)format
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
  PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];

  if (page == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_image_failed", @"Page not found.", nil);
    return;
  }

  NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  NSImage *image = [[NSImage alloc] initWithSize:bounds.size];
  [image lockFocus];
  [[NSColor whiteColor] setFill];
  NSRectFill(NSMakeRect(0, 0, bounds.size.width, bounds.size.height));
  CGContextRef context = NSGraphicsContext.currentContext.CGContext;
  CGContextSaveGState(context);
  [page drawWithBox:kPDFDisplayBoxMediaBox toContext:context];
  CGContextRestoreGState(context);
  [image unlockFocus];

  NSData *tiff = image.TIFFRepresentation;
  NSBitmapImageRep *bitmap = tiff == nil ? nil : [NSBitmapImageRep imageRepWithData:tiff];
  BOOL isJPEG = [format.lowercaseString isEqualToString:@"jpg"] || [format.lowercaseString isEqualToString:@"jpeg"];
  NSBitmapImageFileType imageType = isJPEG ? NSBitmapImageFileTypeJPEG : NSBitmapImageFileTypePNG;
  NSDictionary *properties = isJPEG ? @{NSImageCompressionFactor: @0.92} : @{};
  NSData *imageData = [bitmap representationUsingType:imageType properties:properties];

  if (imageData == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_image_failed", @"Unable to render page image.", nil);
    return;
  }

  NSString *extension = isJPEG ? @"jpg" : @"png";
  NSString *fileName = [NSString stringWithFormat:@"acacia-page-%@.%@", pageIndex, extension];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:fileName]];
  NSError *error = nil;

  if (![imageData writeToURL:outputURL options:NSDataWritingAtomic error:&error]) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_image_failed", error.localizedDescription, error);
    return;
  }

  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }

  resolve(outputURL.path);
}

RCT_EXPORT_METHOD(renderPageThumbnail:(NSString *)path
                  bookmark:(NSString *)bookmark
                  pageIndex:(nonnull NSNumber *)pageIndex
                  documentId:(NSString *)documentId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
  PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];

  if (page == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_thumbnail_failed", @"Page not found.", nil);
    return;
  }

  NSImage *thumbnail = [page thumbnailOfSize:NSMakeSize(220, 320)
                                      forBox:kPDFDisplayBoxMediaBox];
  NSData *tiff = thumbnail.TIFFRepresentation;
  NSBitmapImageRep *bitmap = tiff == nil ? nil : [NSBitmapImageRep imageRepWithData:tiff];
  NSData *imageData = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];

  if (imageData == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_thumbnail_failed", @"Unable to render page thumbnail.", nil);
    return;
  }

  NSURL *outputURL = [PdfKitBridge thumbnailURLForDocumentId:documentId pageIndex:pageIndex];
  NSError *error = nil;
  [[NSFileManager defaultManager] createDirectoryAtURL:outputURL.URLByDeletingLastPathComponent
                          withIntermediateDirectories:YES
                                           attributes:nil
                                                error:nil];

  if (![imageData writeToURL:outputURL options:NSDataWritingAtomic error:&error]) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_thumbnail_failed", error.localizedDescription, error);
    return;
  }

  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }

  resolve(outputURL.path);
}

RCT_EXPORT_METHOD(exportAnnotatedCopy:(NSString *)path
                  bookmark:(NSString *)bookmark
                  annotations:(NSArray *)annotations
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
  if (document == nil) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_failed", @"Unable to load PDF.", nil);
    return;
  }

  [PdfKitBridge applyAnnotations:annotations toDocument:document];

  NSString *baseName = path.lastPathComponent.stringByDeletingPathExtension;
  NSString *outputName = [NSString stringWithFormat:@"%@-annotated.pdf", baseName];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:outputName]];

  if (![document writeToURL:outputURL]) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_failed", @"Unable to write annotated PDF copy.", nil);
    return;
  }

  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }

  resolve(outputURL.path);
}

+ (BOOL)runMarkItDownForURL:(NSURL *)sourceURL outputURL:(NSURL *)outputURL error:(NSError **)error
{
  NSString *pythonScript =
    @"import sys\n"
    @"from markitdown import MarkItDown\n"
    @"result = MarkItDown(enable_plugins=False).convert_local(sys.argv[1])\n"
    @"with open(sys.argv[2], 'w', encoding='utf-8') as output:\n"
    @"    output.write(result.text_content or '')\n";
  NSArray<NSDictionary *> *attempts = @[
    @{
      @"executable": @"/usr/bin/env",
      @"arguments": @[@"markitdown", sourceURL.path, @"-o", outputURL.path],
    },
    @{
      @"executable": @"/usr/bin/env",
      @"arguments": @[@"python3", @"-c", pythonScript, sourceURL.path, outputURL.path],
    },
  ];
  NSString *lastFailure = @"MarkItDown is not available. Install it with `pip install 'markitdown[pdf]'` and try again.";

  for (NSDictionary *attempt in attempts) {
    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:attempt[@"executable"]];
    task.arguments = attempt[@"arguments"];
    task.environment = @{
      @"PATH": @"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      @"PYTHONIOENCODING": @"utf-8",
    };
    NSPipe *errorPipe = [NSPipe pipe];
    task.standardError = errorPipe;

    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
      lastFailure = launchError.localizedDescription ?: lastFailure;
      continue;
    }

    [task waitUntilExit];
    NSData *errorData = [errorPipe.fileHandleForReading readDataToEndOfFile];
    NSString *stderrText = [[NSString alloc] initWithData:errorData encoding:NSUTF8StringEncoding];
    BOOL outputExists = [[NSFileManager defaultManager] fileExistsAtPath:outputURL.path];
    if (task.terminationStatus == 0 && outputExists) {
      return YES;
    }
    if (stderrText.length > 0) {
      lastFailure = stderrText;
    }
  }

  if (error != nil) {
    *error = [NSError errorWithDomain:@"PdfKitBridge"
                                 code:3001
                             userInfo:@{NSLocalizedDescriptionKey: lastFailure}];
  }
  return NO;
}

RCT_EXPORT_METHOD(exportMarkdown:(NSString *)path
                  bookmark:(NSString *)bookmark
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL didStartAccessing = NO;
  NSURL *url = [PdfKitBridge resolvedURLForPath:path
                                       bookmark:bookmark
                             didStartAccessing:&didStartAccessing];
  if (url == nil) {
    reject(@"pdf_export_markdown_failed", @"Unable to resolve PDF URL.", nil);
    return;
  }

  NSString *baseName = path.lastPathComponent.stringByDeletingPathExtension;
  NSString *outputName = [NSString stringWithFormat:@"%@.md", baseName];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:outputName]];
  NSError *error = nil;

  if (![PdfKitBridge runMarkItDownForURL:url outputURL:outputURL error:&error]) {
    if (didStartAccessing) {
      [url stopAccessingSecurityScopedResource];
    }
    reject(@"pdf_export_markdown_failed", error.localizedDescription, error);
    return;
  }

  if (didStartAccessing) {
    [url stopAccessingSecurityScopedResource];
  }

  resolve(outputURL.path);
}

RCT_EXPORT_METHOD(compareDocuments:(NSString *)leftPath
                  rightPath:(NSString *)rightPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  PDFDocument *left = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:leftPath]];
  PDFDocument *right = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:rightPath]];

  if (left == nil || right == nil) {
    reject(@"pdf_compare_failed", @"Unable to load one or both PDFs.", nil);
    return;
  }

  NSUInteger maxPages = MAX(left.pageCount, right.pageCount);
  NSMutableArray *pages = [NSMutableArray array];
  NSUInteger added = 0;
  NSUInteger removed = 0;
  NSUInteger modified = 0;

  for (NSUInteger index = 0; index < maxPages; index += 1) {
    NSString *leftText = [left pageAtIndex:index].string ?: @"";
    NSString *rightText = [right pageAtIndex:index].string ?: @"";

    if ([leftText isEqualToString:rightText]) {
      continue;
    }

    NSString *status = @"modified";
    if (leftText.length == 0) {
      status = @"added";
      added += 1;
    } else if (rightText.length == 0) {
      status = @"removed";
      removed += 1;
    } else {
      modified += 1;
    }

    [pages addObject:@{
      @"pageIndex": @(index),
      @"changeCount": @1,
      @"status": status,
      @"title": [NSString stringWithFormat:@"Page %lu", (unsigned long)index + 1],
    }];
  }

  resolve(@{
    @"added": @(added),
    @"removed": @(removed),
    @"modified": @(modified),
    @"totalChanges": @(added + removed + modified),
    @"pages": pages,
  });
}

RCT_EXPORT_METHOD(readSidecar:(NSString *)documentId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [PdfKitBridge sidecarURLForDocumentId:documentId];
  BOOL shouldResetAppState =
      [documentId isEqualToString:@"__acacia_app_state__"] &&
      [[[NSProcessInfo processInfo].environment objectForKey:@"PDFVIEWER_RESET_STATE"] isEqualToString:@"1"];
  if (shouldResetAppState) {
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
    resolve(nil);
    return;
  }

  NSError *error = nil;
  NSString *contents = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];

  if (contents == nil && error.code != NSFileReadNoSuchFileError) {
    reject(@"pdf_sidecar_read_failed", error.localizedDescription, error);
    return;
  }

  resolve(contents);
}

RCT_EXPORT_METHOD(writeSidecar:(NSString *)documentId
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [PdfKitBridge sidecarURLForDocumentId:documentId];
  NSError *error = nil;
  [[NSFileManager defaultManager] createDirectoryAtURL:url.URLByDeletingLastPathComponent
                          withIntermediateDirectories:YES
                                           attributes:nil
                                                error:nil];

  if (![value writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
    reject(@"pdf_sidecar_write_failed", error.localizedDescription, error);
    return;
  }

  resolve(@YES);
}

+ (NSURL *)demoPDFDirectoryURL
{
  NSURL *supportURL = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                             inDomains:NSUserDomainMask].firstObject;
  return [supportURL URLByAppendingPathComponent:@"Acacia/DemoPDFs" isDirectory:YES];
}

+ (BOOL)writeDemoPDFForSpec:(NSDictionary *)spec toURL:(NSURL *)url error:(NSError **)error
{
  NSString *title = spec[@"title"] ?: @"Acacia Demo PDF";
  NSString *author = spec[@"author"] ?: @"Acacia";
  NSUInteger pageCount = [spec[@"pageCount"] unsignedIntegerValue];
  if (pageCount == 0) {
    pageCount = 1;
  }

  NSMutableData *data = [NSMutableData data];
  CGRect mediaBox = CGRectMake(0, 0, AcaciaCanonicalPageWidth, AcaciaCanonicalPageHeight);
  NSDictionary *pdfInfo = @{
    (NSString *)kCGPDFContextTitle: title,
    (NSString *)kCGPDFContextAuthor: author,
  };
  CGDataConsumerRef consumer = CGDataConsumerCreateWithCFData((__bridge CFMutableDataRef)data);
  CGContextRef context = CGPDFContextCreate(consumer, &mediaBox, (__bridge CFDictionaryRef)pdfInfo);

  if (consumer != nil) {
    CGDataConsumerRelease(consumer);
  }

  if (context == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"PdfKitBridge"
                                   code:2001
                               userInfo:@{NSLocalizedDescriptionKey: @"Unable to create demo PDF context."}];
    }
    return NO;
  }

  NSDictionary *titleAttributes = @{
    NSFontAttributeName: [NSFont fontWithName:@"Georgia-Bold" size:34] ?: [NSFont systemFontOfSize:34 weight:NSFontWeightBold],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.08 alpha:1.0],
  };
  NSDictionary *leadAttributes = @{
    NSFontAttributeName: [NSFont systemFontOfSize:14 weight:NSFontWeightSemibold],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedRed:0.08 green:0.35 blue:0.86 alpha:1.0],
  };
  NSDictionary *bodyAttributes = @{
    NSFontAttributeName: [NSFont systemFontOfSize:11 weight:NSFontWeightRegular],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.14 alpha:1.0],
  };
  NSDictionary *captionAttributes = @{
    NSFontAttributeName: [NSFont monospacedDigitSystemFontOfSize:9 weight:NSFontWeightMedium],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.46 alpha:1.0],
  };
  NSMutableParagraphStyle *readerParagraphStyle = [NSMutableParagraphStyle new];
  readerParagraphStyle.lineSpacing = 5.0;
  readerParagraphStyle.paragraphSpacing = 12.0;
  NSDictionary *readerTitleAttributes = @{
    NSFontAttributeName: [NSFont fontWithName:@"Georgia-Bold" size:34] ?: [NSFont systemFontOfSize:34 weight:NSFontWeightBold],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.08 alpha:1.0],
  };
  NSDictionary *readerHeadingAttributes = @{
    NSFontAttributeName: [NSFont fontWithName:@"Georgia-Bold" size:18] ?: [NSFont systemFontOfSize:18 weight:NSFontWeightBold],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.08 alpha:1.0],
  };
  NSDictionary *readerBodyAttributes = @{
    NSFontAttributeName: [NSFont fontWithName:@"Georgia" size:14] ?: [NSFont systemFontOfSize:14 weight:NSFontWeightRegular],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.13 alpha:1.0],
    NSParagraphStyleAttributeName: readerParagraphStyle,
  };
  NSDictionary *highlightAttributes = @{
    NSFontAttributeName: [NSFont fontWithName:@"Georgia" size:14] ?: [NSFont systemFontOfSize:14 weight:NSFontWeightRegular],
    NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.10 alpha:1.0],
  };

  NSArray<NSString *> *segments = @[@"Technology", @"Healthcare", @"Consumer Goods", @"Financial Services"];

  for (NSUInteger pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    CGPDFContextBeginPage(context, NULL);
    [NSGraphicsContext saveGraphicsState];
    NSGraphicsContext *graphicsContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:NO];
    [NSGraphicsContext setCurrentContext:graphicsContext];

    [[NSColor whiteColor] setFill];
    NSRectFill(NSMakeRect(0, 0, AcaciaCanonicalPageWidth, AcaciaCanonicalPageHeight));
    [[NSColor colorWithCalibratedWhite:0.86 alpha:1.0] setStroke];
    NSFrameRect(NSMakeRect(48, 56, AcaciaCanonicalPageWidth - 96, AcaciaCanonicalPageHeight - 112));

    [title drawInRect:NSMakeRect(72, 724, 420, 42) withAttributes:captionAttributes];
    [[NSString stringWithFormat:@"%lu", (unsigned long)pageIndex + 1]
      drawInRect:NSMakeRect(512, 724, 32, 20)
      withAttributes:captionAttributes];

    if ([title isEqualToString:@"Product Roadmap 2025"]) {
      [@"PRODUCT ROADMAP 2025 - VISION" drawInRect:NSMakeRect(72, 660, 420, 18) withAttributes:captionAttributes];
      [@"Why now" drawInRect:NSMakeRect(72, 616, 420, 46) withAttributes:readerTitleAttributes];

      NSString *first = @"Three forces are converging that make 2025 the right year to commit. First, the cost of high-quality models has fallen by an order of magnitude in the last twelve months.";
      [first drawInRect:NSMakeRect(72, 548, 420, 78) withAttributes:readerBodyAttributes];

      [[NSColor colorWithCalibratedRed:1.00 green:0.87 blue:0.34 alpha:0.70] setFill];
      NSRectFill(NSMakeRect(72, 499, 404, 20));
      NSRectFill(NSMakeRect(72, 476, 394, 20));
      NSRectFill(NSMakeRect(72, 453, 276, 20));
      NSString *highlight = @"Second, customer behavior has shifted: enterprises are no longer evaluating AI in isolation but as a layer threaded through existing workflows.";
      [highlight drawInRect:NSMakeRect(72, 452, 420, 66) withAttributes:highlightAttributes];

      NSString *second = @"Third, the regulatory picture has clarified enough to plan without guessing.\n\nActing on these three at once is the prize. The risk is not novelty - it is coordination. We have to ship a coherent product across surfaces that previously moved at different speeds.";
      [second drawInRect:NSMakeRect(72, 352, 420, 98) withAttributes:readerBodyAttributes];

      [@"Three commitments" drawInRect:NSMakeRect(72, 310, 420, 28) withAttributes:readerHeadingAttributes];
      NSString *third = @"We are organizing the year around three commitments, deliberately fewer than last year. Each is owned end-to-end by a named lead, with quarterly checkpoints and a single success metric.";
      [third drawInRect:NSMakeRect(72, 234, 420, 70) withAttributes:readerBodyAttributes];

      NSString *footer = [NSString stringWithFormat:@"Acacia local demo PDF - %@ - Page %lu of %lu",
                          author,
                          (unsigned long)pageIndex + 1,
                          (unsigned long)pageCount];
      [footer drawInRect:NSMakeRect(72, 76, 420, 18) withAttributes:captionAttributes];

      [NSGraphicsContext restoreGraphicsState];
      CGPDFContextEndPage(context);
      continue;
    }

    NSString *pageHeading = pageIndex == 0
      ? title
      : (pageIndex % 3 == 0 ? @"Revenue by Region" : (pageIndex % 3 == 1 ? @"Key Takeaways" : @"Market Overview"));
    [pageHeading drawInRect:NSMakeRect(72, 650, 440, 56) withAttributes:titleAttributes];

    NSString *lead = [title isEqualToString:@"Future of Work Report"]
      ? @"The hybrid model is no longer an experiment; it has become the new standard."
      : @"Global markets closed the year with steady growth across key segments.";
    [lead drawInRect:NSMakeRect(72, 606, 430, 34) withAttributes:leadAttributes];

    NSString *body = [NSString stringWithFormat:
      @"%@ page %lu contains searchable text for Acacia demo validation. Use it to test PDFKit rendering, document search, page navigation, zooming, highlights, notes, pen drawings, signatures, export, and Open Recent behavior without relying on placeholder views.",
      title,
      (unsigned long)pageIndex + 1];
    [body drawInRect:NSMakeRect(72, 548, 430, 48) withAttributes:bodyAttributes];

    [[NSColor colorWithCalibratedRed:0.91 green:0.94 blue:0.98 alpha:1.0] setFill];
    NSRectFill(NSMakeRect(72, 292, 440, 214));
    [[NSColor colorWithCalibratedRed:0.15 green:0.43 blue:0.92 alpha:1.0] setFill];
    for (NSUInteger index = 0; index < 5; index += 1) {
      CGFloat barHeight = 54 + index * 19 + (pageIndex % 4) * 5;
      NSRectFill(NSMakeRect(108 + index * 76, 326, 42, barHeight));
      [[NSString stringWithFormat:@"Q%lu", (unsigned long)index + 1]
        drawInRect:NSMakeRect(106 + index * 76, 304, 52, 16)
        withAttributes:captionAttributes];
      [[NSColor colorWithCalibratedRed:0.15 green:0.43 blue:0.92 alpha:1.0] setFill];
    }

    for (NSUInteger index = 0; index < segments.count; index += 1) {
      NSString *line = [NSString stringWithFormat:@"- %@ %@%%", segments[index], @[@34, @28, @22, @16][index]];
      [line drawInRect:NSMakeRect(92, 226 - index * 20, 320, 18) withAttributes:bodyAttributes];
    }

    NSString *footer = [NSString stringWithFormat:@"Acacia local demo PDF - %@ - Page %lu of %lu",
                        author,
                        (unsigned long)pageIndex + 1,
                        (unsigned long)pageCount];
    [footer drawInRect:NSMakeRect(72, 76, 420, 18) withAttributes:captionAttributes];

    [NSGraphicsContext restoreGraphicsState];
    CGPDFContextEndPage(context);
  }

  CGPDFContextClose(context);
  CGContextRelease(context);

  return [data writeToURL:url options:NSDataWritingAtomic error:error];
}

+ (NSDictionary *)metadataForURL:(NSURL *)url error:(NSError **)error
{
  PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
  if (document == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"PdfKitBridge"
                                   code:1001
                               userInfo:@{NSLocalizedDescriptionKey: @"Unable to load PDF."}];
    }
    return nil;
  }

  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:url.path error:nil];
  NSNumber *fileSize = attributes[NSFileSize] ?: @0;
  NSDate *createdAt = attributes[NSFileCreationDate] ?: [NSDate date];
  NSDate *modifiedAt = attributes[NSFileModificationDate] ?: [NSDate date];
  NSData *bookmark = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                   includingResourceValuesForKeys:nil
                                    relativeToURL:nil
                                            error:nil];
  NSString *title = document.documentAttributes[PDFDocumentTitleAttribute] ?: url.lastPathComponent.stringByDeletingPathExtension;
  NSString *author = document.documentAttributes[PDFDocumentAuthorAttribute] ?: @"Local Document";
  double sizeMb = fileSize.doubleValue / 1024.0 / 1024.0;

  return @{
    @"id": [PdfKitBridge stableIdForURL:url],
    @"title": title,
    @"author": author,
    @"pageCount": @(document.pageCount),
    @"sizeMb": @(sizeMb),
    @"createdAt": [PdfKitBridge isoStringFromDate:createdAt],
    @"modifiedAt": [PdfKitBridge isoStringFromDate:modifiedAt],
    @"path": url.path,
    @"bookmark": bookmark == nil ? @"" : [bookmark base64EncodedStringWithOptions:0],
  };
}

+ (void)applyAnnotations:(NSArray *)annotations toDocument:(PDFDocument *)document
{
  for (NSDictionary *annotationInfo in annotations) {
    NSNumber *pageIndex = [RCTConvert NSNumber:annotationInfo[@"pageIndex"]];
    PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];
    if (page == nil) {
      continue;
    }

    NSDictionary *boundsInfo = [RCTConvert NSDictionary:annotationInfo[@"bounds"]];
    NSRect bounds = AcaciaPDFBoundsForAnnotation(boundsInfo, page);
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    NSString *subtype = [kind isEqualToString:@"note"]
      ? PDFAnnotationSubtypeText
      : ([kind isEqualToString:@"signature"]
          ? PDFAnnotationSubtypeFreeText
          : ([kind isEqualToString:@"drawing"] ? PDFAnnotationSubtypeInk : PDFAnnotationSubtypeHighlight));
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds forType:subtype withProperties:nil];
    annotation.color = [kind isEqualToString:@"signature"]
      ? [NSColor clearColor]
      : [NSColor colorWithCalibratedRed:1 green:0.82 blue:0.12 alpha:0.45];
    annotation.userName = @"Acacia";
    annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Acacia annotation";
    if ([kind isEqualToString:@"signature"]) {
      annotation.font = [NSFont fontWithName:@"Snell Roundhand" size:22] ?: [NSFont systemFontOfSize:20 weight:NSFontWeightSemibold];
      annotation.fontColor = [NSColor colorWithCalibratedWhite:0.08 alpha:1.0];
    } else if ([kind isEqualToString:@"drawing"]) {
      annotation.color = [NSColor colorWithCalibratedRed:0.94 green:0.27 blue:0.27 alpha:0.9];
      id rawPoints = annotationInfo[@"points"];
      NSArray *points = [rawPoints isKindOfClass:[NSArray class]] ? rawPoints : @[];
      NSBezierPath *inkPath = AcaciaBezierPathForInkPoints(points, page);
      if (inkPath != nil) {
        [annotation addBezierPath:inkPath];
      }
    } else if ([subtype isEqualToString:PDFAnnotationSubtypeHighlight]) {
      annotation.quadrilateralPoints = AcaciaHighlightQuadPointsForBounds(bounds);
    }
    [page addAnnotation:annotation];
  }
}

+ (NSURL *)sidecarURLForDocumentId:(NSString *)documentId
{
  NSURL *supportURL = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                             inDomains:NSUserDomainMask].firstObject;
  return [[supportURL URLByAppendingPathComponent:@"Acacia/Sidecars" isDirectory:YES]
          URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.json", documentId]];
}

+ (NSURL *)thumbnailURLForDocumentId:(NSString *)documentId pageIndex:(NSNumber *)pageIndex
{
  NSURL *supportURL = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                             inDomains:NSUserDomainMask].firstObject;
  NSString *safeDocumentId = [PdfKitBridge cacheSafeIdentifierForString:documentId ?: @"document"];
  return [[[supportURL URLByAppendingPathComponent:@"Acacia/ThumbnailCache" isDirectory:YES]
           URLByAppendingPathComponent:safeDocumentId isDirectory:YES]
          URLByAppendingPathComponent:[NSString stringWithFormat:@"page-%@.png", pageIndex]];
}

+ (NSString *)cacheSafeIdentifierForString:(NSString *)value
{
  NSCharacterSet *allowed = [NSCharacterSet alphanumericCharacterSet];
  NSMutableString *result = [NSMutableString string];

  for (NSUInteger index = 0; index < value.length; index += 1) {
    unichar character = [value characterAtIndex:index];
    if ([allowed characterIsMember:character]) {
      [result appendFormat:@"%C", character];
    } else if (result.length == 0 || ![result hasSuffix:@"-"]) {
      [result appendString:@"-"];
    }
  }

  return result.length == 0 ? @"document" : result;
}

+ (NSString *)stableIdForURL:(NSURL *)url
{
  NSString *base = url.lastPathComponent.stringByDeletingPathExtension.lowercaseString;
  NSCharacterSet *allowed = [NSCharacterSet alphanumericCharacterSet];
  NSMutableString *result = [NSMutableString string];

  for (NSUInteger index = 0; index < base.length; index += 1) {
    unichar character = [base characterAtIndex:index];
    if ([allowed characterIsMember:character]) {
      [result appendFormat:@"%C", character];
    } else if (result.length == 0 || ![result hasSuffix:@"-"]) {
      [result appendString:@"-"];
    }
  }

  return result.length == 0 ? @"local-pdf" : result;
}

+ (NSString *)isoStringFromDate:(NSDate *)date
{
  NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
  return [formatter stringFromDate:date];
}

@end
