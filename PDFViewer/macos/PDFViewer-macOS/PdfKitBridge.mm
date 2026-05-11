#import "PdfKitBridge.h"

#import <AppKit/AppKit.h>
#import <PDFKit/PDFKit.h>
#import <React/RCTConvert.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

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
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"pdf"]];
    panel.allowsMultipleSelection = NO;
    panel.canChooseDirectories = NO;
    panel.canChooseFiles = YES;
    panel.message = @"Choose a PDF to add to PaperView";

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

    resolve(metadata);
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
                  query:(NSString *)query
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:path]];
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

RCT_EXPORT_METHOD(exportPageText:(NSString *)path
                  pageIndex:(nonnull NSNumber *)pageIndex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:path]];
  PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];

  if (page == nil) {
    reject(@"pdf_export_text_failed", @"Page not found.", nil);
    return;
  }

  resolve(page.string ?: @"");
}

RCT_EXPORT_METHOD(exportPageImage:(NSString *)path
                  pageIndex:(nonnull NSNumber *)pageIndex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:path]];
  PDFPage *page = [document pageAtIndex:pageIndex.unsignedIntegerValue];

  if (page == nil) {
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
  NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];

  if (png == nil) {
    reject(@"pdf_export_image_failed", @"Unable to render page image.", nil);
    return;
  }

  NSString *fileName = [NSString stringWithFormat:@"paperview-page-%@.png", pageIndex];
  NSURL *url = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:fileName]];
  NSError *error = nil;

  if (![png writeToURL:url options:NSDataWritingAtomic error:&error]) {
    reject(@"pdf_export_image_failed", error.localizedDescription, error);
    return;
  }

  resolve(url.path);
}

RCT_EXPORT_METHOD(exportAnnotatedCopy:(NSString *)path
                  annotations:(NSArray *)annotations
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:path]];
  if (document == nil) {
    reject(@"pdf_export_failed", @"Unable to load PDF.", nil);
    return;
  }

  [PdfKitBridge applyAnnotations:annotations toDocument:document];

  NSString *baseName = path.lastPathComponent.stringByDeletingPathExtension;
  NSString *outputName = [NSString stringWithFormat:@"%@-annotated.pdf", baseName];
  NSURL *outputURL = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:outputName]];

  if (![document writeToURL:outputURL]) {
    reject(@"pdf_export_failed", @"Unable to write annotated PDF copy.", nil);
    return;
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
    NSRect bounds = NSMakeRect(
      [RCTConvert CGFloat:boundsInfo[@"x"]],
      [RCTConvert CGFloat:boundsInfo[@"y"]],
      [RCTConvert CGFloat:boundsInfo[@"width"]],
      [RCTConvert CGFloat:boundsInfo[@"height"]]
    );
    NSString *kind = [RCTConvert NSString:annotationInfo[@"kind"]];
    NSString *subtype = [kind isEqualToString:@"note"] ? PDFAnnotationSubtypeText : PDFAnnotationSubtypeHighlight;
    PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:bounds forType:subtype withProperties:nil];
    annotation.color = [NSColor colorWithCalibratedRed:1 green:0.82 blue:0.12 alpha:0.45];
    annotation.contents = [RCTConvert NSString:annotationInfo[@"text"]] ?: @"PaperView annotation";
    [page addAnnotation:annotation];
  }
}

+ (NSURL *)sidecarURLForDocumentId:(NSString *)documentId
{
  NSURL *supportURL = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                             inDomains:NSUserDomainMask].firstObject;
  return [[supportURL URLByAppendingPathComponent:@"PaperView/Sidecars" isDirectory:YES]
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
