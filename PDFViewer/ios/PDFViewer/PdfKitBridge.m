#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static const CGFloat AcaciaCanonicalPageWidth = 595.0;
static const CGFloat AcaciaCanonicalPageHeight = 842.0;

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

static CGRect AcaciaFallbackAnnotationBounds(PDFPage *page)
{
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }

  CGFloat margin = 24.0;
  CGFloat width = MIN(280.0, MAX(80.0, CGRectGetWidth(pageBounds) - margin * 2.0));
  CGFloat height = 24.0;

  return CGRectMake(
    CGRectGetMinX(pageBounds) + margin,
    CGRectGetMaxY(pageBounds) - margin - height,
    width,
    height
  );
}

static CGRect AcaciaPDFBoundsForAnnotation(NSDictionary *boundsInfo, PDFPage *page)
{
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  }

  if (CGRectIsEmpty(pageBounds) || boundsInfo == nil) {
    return AcaciaFallbackAnnotationBounds(page);
  }

  CGFloat requestedX = [RCTConvert CGFloat:boundsInfo[@"x"]];
  CGFloat requestedY = [RCTConvert CGFloat:boundsInfo[@"y"]];
  CGFloat requestedWidth = [RCTConvert CGFloat:boundsInfo[@"width"]];
  CGFloat requestedHeight = [RCTConvert CGFloat:boundsInfo[@"height"]];
  if (requestedWidth <= 0 || requestedHeight <= 0) {
    return AcaciaFallbackAnnotationBounds(page);
  }

  CGFloat width = requestedWidth / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds);
  CGFloat height = requestedHeight / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds);
  width = MIN(MAX(width, 4.0), CGRectGetWidth(pageBounds));
  height = MIN(MAX(height, 4.0), CGRectGetHeight(pageBounds));

  CGFloat x = CGRectGetMinX(pageBounds) + requestedX / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds);
  CGFloat y = CGRectGetMaxY(pageBounds) - ((requestedY + requestedHeight) / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds));
  x = MIN(MAX(x, CGRectGetMinX(pageBounds)), CGRectGetMaxX(pageBounds) - width);
  y = MIN(MAX(y, CGRectGetMinY(pageBounds)), CGRectGetMaxY(pageBounds) - height);

  return CGRectMake(x, y, width, height);
}

static CGRect AcaciaCanonicalBoundsForPDFBounds(CGRect pdfBounds, CGRect pageBounds)
{
  CGFloat x = ((CGRectGetMinX(pdfBounds) - CGRectGetMinX(pageBounds)) / CGRectGetWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat y = ((CGRectGetMaxY(pageBounds) - CGRectGetMaxY(pdfBounds)) / CGRectGetHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  CGFloat width = (CGRectGetWidth(pdfBounds) / CGRectGetWidth(pageBounds)) * AcaciaCanonicalPageWidth;
  CGFloat height = (CGRectGetHeight(pdfBounds) / CGRectGetHeight(pageBounds)) * AcaciaCanonicalPageHeight;
  return CGRectMake(round(x), round(y), round(width), round(height));
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

@interface PdfKitBridge : NSObject <RCTBridgeModule, UIDocumentPickerDelegate>
@property (nonatomic, copy) RCTPromiseResolveBlock pendingResolve;
@property (nonatomic, copy) RCTPromiseRejectBlock pendingReject;
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

+ (BOOL)requiresMainQueueSetup
{
  return YES;
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

      resolve(metadata);
      return;
    }

    UIViewController *presentingViewController = RCTPresentedViewController();
    if (presentingViewController == nil) {
      reject(@"pdf_open_failed", @"Unable to present document picker.", nil);
      return;
    }

    self.pendingResolve = resolve;
    self.pendingReject = reject;

    UIDocumentPickerViewController *picker =
      [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:@[UTTypePDF]
                                                                  asCopy:YES];
    picker.delegate = self;
    picker.allowsMultipleSelection = NO;
    [presentingViewController presentViewController:picker animated:YES completion:nil];
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
      CGRect lineBounds = [lineSelection boundsForPage:linePage];
      CGRect pageBounds = [linePage boundsForBox:kPDFDisplayBoxCropBox];
      if (CGRectIsEmpty(pageBounds)) {
        pageBounds = [linePage boundsForBox:kPDFDisplayBoxMediaBox];
      }
      if (CGRectIsEmpty(lineBounds) || CGRectIsEmpty(pageBounds)) {
        continue;
      }
      CGRect canonicalBounds = AcaciaCanonicalBoundsForPDFBounds(lineBounds, pageBounds);
      [searchBounds addObject:@{
        @"x": @(CGRectGetMinX(canonicalBounds)),
        @"y": @(CGRectGetMinY(canonicalBounds)),
        @"width": @(CGRectGetWidth(canonicalBounds)),
        @"height": @(CGRectGetHeight(canonicalBounds)),
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
                                                     options:0
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

  CGRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:bounds.size];
  UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [[UIColor whiteColor] setFill];
    [context fillRect:CGRectMake(0, 0, bounds.size.width, bounds.size.height)];
    CGContextSaveGState(context.CGContext);
    [page drawWithBox:kPDFDisplayBoxMediaBox toContext:context.CGContext];
      CGContextRestoreGState(context.CGContext);
  }];
  BOOL isJPEG = [format.lowercaseString isEqualToString:@"jpg"] || [format.lowercaseString isEqualToString:@"jpeg"];
  NSData *imageData = isJPEG ? UIImageJPEGRepresentation(image, 0.92) : UIImagePNGRepresentation(image);

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

  UIImage *thumbnail = [page thumbnailOfSize:CGSizeMake(220, 320)
                                      forBox:kPDFDisplayBoxMediaBox];
  NSData *imageData = UIImagePNGRepresentation(thumbnail);

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

RCT_EXPORT_METHOD(exportMarkdown:(NSString *)path
                  bookmark:(NSString *)bookmark
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
    reject(@"pdf_export_markdown_failed", @"Unable to load PDF.", nil);
    return;
  }

  NSMutableString *markdown = [NSMutableString stringWithFormat:@"# %@\n\n", path.lastPathComponent.stringByDeletingPathExtension];
  for (NSUInteger pageIndex = 0; pageIndex < document.pageCount; pageIndex += 1) {
    PDFPage *page = [document pageAtIndex:pageIndex];
    NSString *text = page.string ?: @"";
    [markdown appendFormat:@"## Page %lu\n\n%@\n\n", (unsigned long)pageIndex + 1, text];
  }

  NSString *baseName = path.lastPathComponent.stringByDeletingPathExtension;
  NSString *outputName = [NSString stringWithFormat:@"%@.md", baseName];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:outputName]];
  NSError *error = nil;

  if (![markdown writeToURL:outputURL atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
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

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
  NSURL *url = urls.firstObject;
  if (url == nil) {
    [self resolveOpenWithValue:nil];
    return;
  }

  BOOL scoped = [url startAccessingSecurityScopedResource];
  NSError *error = nil;
  NSDictionary *metadata = [PdfKitBridge metadataForURL:url error:&error];
  if (scoped) {
    [url stopAccessingSecurityScopedResource];
  }

  if (metadata == nil) {
    [self rejectOpenWithCode:@"pdf_open_failed" message:error.localizedDescription error:error];
    return;
  }

  [self resolveOpenWithValue:metadata];
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller
{
  [self resolveOpenWithValue:nil];
}

- (void)resolveOpenWithValue:(id)value
{
  if (self.pendingResolve != nil) {
    self.pendingResolve(value);
  }
  self.pendingResolve = nil;
  self.pendingReject = nil;
}

- (void)rejectOpenWithCode:(NSString *)code message:(NSString *)message error:(NSError *)error
{
  if (self.pendingReject != nil) {
    self.pendingReject(code, message, error);
  }
  self.pendingResolve = nil;
  self.pendingReject = nil;
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

  CGRect pageBounds = CGRectMake(0, 0, AcaciaCanonicalPageWidth, AcaciaCanonicalPageHeight);
  UIGraphicsPDFRendererFormat *format = [UIGraphicsPDFRendererFormat defaultFormat];
  format.documentInfo = @{
    (NSString *)kCGPDFContextTitle: title,
    (NSString *)kCGPDFContextAuthor: author,
  };
  UIGraphicsPDFRenderer *renderer = [[UIGraphicsPDFRenderer alloc] initWithBounds:pageBounds format:format];
  NSDictionary *titleAttributes = @{
    NSFontAttributeName: [UIFont fontWithName:@"Georgia-Bold" size:34] ?: [UIFont boldSystemFontOfSize:34],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.08 alpha:1.0],
  };
  NSDictionary *leadAttributes = @{
    NSFontAttributeName: [UIFont systemFontOfSize:14 weight:UIFontWeightSemibold],
    NSForegroundColorAttributeName: [UIColor colorWithRed:0.08 green:0.35 blue:0.86 alpha:1.0],
  };
  NSDictionary *bodyAttributes = @{
    NSFontAttributeName: [UIFont systemFontOfSize:11 weight:UIFontWeightRegular],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.14 alpha:1.0],
  };
  NSDictionary *captionAttributes = @{
    NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:9 weight:UIFontWeightMedium],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.46 alpha:1.0],
  };
  NSMutableParagraphStyle *readerParagraphStyle = [NSMutableParagraphStyle new];
  readerParagraphStyle.lineSpacing = 5.0;
  readerParagraphStyle.paragraphSpacing = 12.0;
  NSDictionary *readerTitleAttributes = @{
    NSFontAttributeName: [UIFont fontWithName:@"Georgia-Bold" size:34] ?: [UIFont boldSystemFontOfSize:34],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.08 alpha:1.0],
  };
  NSDictionary *readerHeadingAttributes = @{
    NSFontAttributeName: [UIFont fontWithName:@"Georgia-Bold" size:18] ?: [UIFont boldSystemFontOfSize:18],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.08 alpha:1.0],
  };
  NSDictionary *readerBodyAttributes = @{
    NSFontAttributeName: [UIFont fontWithName:@"Georgia" size:14] ?: [UIFont systemFontOfSize:14 weight:UIFontWeightRegular],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.13 alpha:1.0],
    NSParagraphStyleAttributeName: readerParagraphStyle,
  };
  NSDictionary *highlightAttributes = @{
    NSFontAttributeName: [UIFont fontWithName:@"Georgia" size:14] ?: [UIFont systemFontOfSize:14 weight:UIFontWeightRegular],
    NSForegroundColorAttributeName: [UIColor colorWithWhite:0.10 alpha:1.0],
  };
  NSArray<NSString *> *segments = @[@"Technology", @"Healthcare", @"Consumer Goods", @"Financial Services"];

  return [renderer writePDFToURL:url withActions:^(UIGraphicsPDFRendererContext *rendererContext) {
    for (NSUInteger pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      [rendererContext beginPage];

      [[UIColor whiteColor] setFill];
      UIRectFill(pageBounds);
      [[UIColor colorWithWhite:0.86 alpha:1.0] setStroke];
      UIRectFrame(CGRectMake(48, 56, AcaciaCanonicalPageWidth - 96, AcaciaCanonicalPageHeight - 112));

      [title drawInRect:CGRectMake(72, 724, 420, 42) withAttributes:captionAttributes];
      [[NSString stringWithFormat:@"%lu", (unsigned long)pageIndex + 1]
        drawInRect:CGRectMake(512, 724, 32, 20)
        withAttributes:captionAttributes];

      if ([title isEqualToString:@"Product Roadmap 2025"]) {
        [@"PRODUCT ROADMAP 2025 - VISION" drawInRect:CGRectMake(72, 660, 420, 18) withAttributes:captionAttributes];
        [@"Why now" drawInRect:CGRectMake(72, 616, 420, 46) withAttributes:readerTitleAttributes];

        NSString *first = @"Three forces are converging that make 2025 the right year to commit. First, the cost of high-quality models has fallen by an order of magnitude in the last twelve months.";
        [first drawInRect:CGRectMake(72, 548, 420, 78) withAttributes:readerBodyAttributes];

        [[UIColor colorWithRed:1.00 green:0.87 blue:0.34 alpha:0.70] setFill];
        UIRectFill(CGRectMake(72, 499, 404, 20));
        UIRectFill(CGRectMake(72, 476, 394, 20));
        UIRectFill(CGRectMake(72, 453, 276, 20));
        NSString *highlight = @"Second, customer behavior has shifted: enterprises are no longer evaluating AI in isolation but as a layer threaded through existing workflows.";
        [highlight drawInRect:CGRectMake(72, 452, 420, 66) withAttributes:highlightAttributes];

        NSString *second = @"Third, the regulatory picture has clarified enough to plan without guessing.\n\nActing on these three at once is the prize. The risk is not novelty - it is coordination. We have to ship a coherent product across surfaces that previously moved at different speeds.";
        [second drawInRect:CGRectMake(72, 352, 420, 98) withAttributes:readerBodyAttributes];

        [@"Three commitments" drawInRect:CGRectMake(72, 310, 420, 28) withAttributes:readerHeadingAttributes];
        NSString *third = @"We are organizing the year around three commitments, deliberately fewer than last year. Each is owned end-to-end by a named lead, with quarterly checkpoints and a single success metric.";
        [third drawInRect:CGRectMake(72, 234, 420, 70) withAttributes:readerBodyAttributes];

        NSString *footer = [NSString stringWithFormat:@"Acacia local demo PDF - %@ - Page %lu of %lu",
                            author,
                            (unsigned long)pageIndex + 1,
                            (unsigned long)pageCount];
        [footer drawInRect:CGRectMake(72, 76, 420, 18) withAttributes:captionAttributes];
        continue;
      }

      NSString *pageHeading = pageIndex == 0
        ? title
        : (pageIndex % 3 == 0 ? @"Revenue by Region" : (pageIndex % 3 == 1 ? @"Key Takeaways" : @"Market Overview"));
      [pageHeading drawInRect:CGRectMake(72, 650, 440, 56) withAttributes:titleAttributes];

      NSString *lead = [title isEqualToString:@"Future of Work Report"]
        ? @"The hybrid model is no longer an experiment; it has become the new standard."
        : @"Global markets closed the year with steady growth across key segments.";
      [lead drawInRect:CGRectMake(72, 606, 430, 34) withAttributes:leadAttributes];

      NSString *body = [NSString stringWithFormat:
        @"%@ page %lu contains searchable text for Acacia demo validation. Use it to test PDFKit rendering, document search, page navigation, zooming, highlights, notes, pen drawings, signatures, export, and Open Recent behavior without relying on placeholder views.",
        title,
        (unsigned long)pageIndex + 1];
      [body drawInRect:CGRectMake(72, 548, 430, 48) withAttributes:bodyAttributes];

      [[UIColor colorWithRed:0.91 green:0.94 blue:0.98 alpha:1.0] setFill];
      UIRectFill(CGRectMake(72, 292, 440, 214));
      [[UIColor colorWithRed:0.15 green:0.43 blue:0.92 alpha:1.0] setFill];
      for (NSUInteger index = 0; index < 5; index += 1) {
        CGFloat barHeight = 54 + index * 19 + (pageIndex % 4) * 5;
        UIRectFill(CGRectMake(108 + index * 76, 326, 42, barHeight));
        [[NSString stringWithFormat:@"Q%lu", (unsigned long)index + 1]
          drawInRect:CGRectMake(106 + index * 76, 304, 52, 16)
          withAttributes:captionAttributes];
        [[UIColor colorWithRed:0.15 green:0.43 blue:0.92 alpha:1.0] setFill];
      }

      for (NSUInteger index = 0; index < segments.count; index += 1) {
        NSString *line = [NSString stringWithFormat:@"- %@ %@%%", segments[index], @[@34, @28, @22, @16][index]];
        [line drawInRect:CGRectMake(92, 226 - index * 20, 320, 18) withAttributes:bodyAttributes];
      }

      NSString *footer = [NSString stringWithFormat:@"Acacia local demo PDF - %@ - Page %lu of %lu",
                          author,
                          (unsigned long)pageIndex + 1,
                          (unsigned long)pageCount];
      [footer drawInRect:CGRectMake(72, 76, 420, 18) withAttributes:captionAttributes];
    }
  } error:error];
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
  NSData *bookmark = [url bookmarkDataWithOptions:0
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
    CGRect bounds = AcaciaPDFBoundsForAnnotation(boundsInfo, page);
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    PDFAnnotationSubtype subtype = [kind isEqualToString:@"note"]
      ? PDFAnnotationSubtypeText
      : ([kind isEqualToString:@"signature"]
          ? PDFAnnotationSubtypeFreeText
          : ([kind isEqualToString:@"drawing"] ? PDFAnnotationSubtypeInk : PDFAnnotationSubtypeHighlight));
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds forType:subtype withProperties:nil];
    annotation.color = [kind isEqualToString:@"signature"]
      ? [UIColor clearColor]
      : [UIColor colorWithRed:1 green:0.82 blue:0.12 alpha:0.45];
    annotation.userName = @"Acacia";
    annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"Acacia annotation";
    if ([kind isEqualToString:@"signature"]) {
      annotation.font = [UIFont fontWithName:@"SnellRoundhand-Bold" size:22] ?: [UIFont italicSystemFontOfSize:20];
      annotation.fontColor = [UIColor colorWithWhite:0.08 alpha:1.0];
    } else if ([kind isEqualToString:@"drawing"]) {
      annotation.color = [UIColor colorWithRed:0.94 green:0.27 blue:0.27 alpha:0.9];
      id rawPoints = annotationInfo[@"points"];
      NSArray *points = [rawPoints isKindOfClass:[NSArray class]] ? rawPoints : @[];
      UIBezierPath *inkPath = AcaciaBezierPathForInkPoints(points, page);
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
