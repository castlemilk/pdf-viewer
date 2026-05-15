#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static const CGFloat AcaciaCanonicalPageWidth = 595.0;
static const CGFloat AcaciaCanonicalPageHeight = 842.0;

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

static CGPoint AcaciaPDFPointForCanonicalPoint(NSDictionary *pointInfo, CGRect pageBounds)
{
  CGFloat canonicalX = [RCTConvert CGFloat:pointInfo[@"x"]];
  CGFloat canonicalY = [RCTConvert CGFloat:pointInfo[@"y"]];
  return CGPointMake(
    CGRectGetMinX(pageBounds) + canonicalX / AcaciaCanonicalPageWidth * CGRectGetWidth(pageBounds),
    CGRectGetMaxY(pageBounds) - canonicalY / AcaciaCanonicalPageHeight * CGRectGetHeight(pageBounds)
  );
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
    [results addObject:@{
      @"pageIndex": @(pageIndex),
      @"snippet": snippet,
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

  return [NSURL fileURLWithPath:path];
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
      annotation.quadrilateralPoints = @[
        [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMaxY(bounds))],
        [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMaxY(bounds))],
        [NSValue valueWithCGPoint:CGPointMake(CGRectGetMinX(bounds), CGRectGetMinY(bounds))],
        [NSValue valueWithCGPoint:CGPointMake(CGRectGetMaxX(bounds), CGRectGetMinY(bounds))],
      ];
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
