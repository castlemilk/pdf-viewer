#import <AppKit/AppKit.h>
#import <PDFKit/PDFKit.h>
#import <XCTest/XCTest.h>

@interface TextPDFView : NSView
@property(nonatomic, copy) NSString *text;
@end

@implementation TextPDFView

- (void)drawRect:(NSRect)dirtyRect
{
  [super drawRect:dirtyRect];
  [[NSColor whiteColor] setFill];
  NSRectFill(self.bounds);
  NSDictionary *attributes = @{
    NSFontAttributeName: [NSFont systemFontOfSize:24 weight:NSFontWeightSemibold],
    NSForegroundColorAttributeName: NSColor.blackColor,
  };
  [self.text drawInRect:NSMakeRect(56, 690, 480, 80) withAttributes:attributes];
}

@end

@interface PdfKitSmokeTests : XCTestCase
@end

@implementation PdfKitSmokeTests

- (void)testPDFKitLoadsAndSearchesGeneratedPDF
{
  NSURL *url = [self temporaryPDFURLWithName:@"search-fixture.pdf"];
  PDFDocument *document = [self makeDocumentWithText:@"Market Overview\nGlobal markets closed with steady growth."];

  XCTAssertTrue([document writeToURL:url]);

  PDFDocument *loaded = [[PDFDocument alloc] initWithURL:url];
  XCTAssertEqual(loaded.pageCount, 1);
  XCTAssertGreaterThan([loaded findString:@"market" withOptions:NSCaseInsensitiveSearch].count, 0);
}

- (void)testAnnotatedExportDoesNotModifyOriginalPDF
{
  NSURL *sourceURL = [self temporaryPDFURLWithName:@"source.pdf"];
  NSURL *copyURL = [self temporaryPDFURLWithName:@"annotated-copy.pdf"];
  PDFDocument *source = [self makeDocumentWithText:@"Annotation export fixture"];

  XCTAssertTrue([source writeToURL:sourceURL]);

  PDFDocument *workingCopy = [[PDFDocument alloc] initWithURL:sourceURL];
  PDFPage *page = [workingCopy pageAtIndex:0];
  PDFAnnotation *annotation = [[PDFAnnotation alloc] initWithBounds:NSMakeRect(24, 24, 120, 24)
                                                           forType:PDFAnnotationSubtypeHighlight
                                                    withProperties:nil];
  annotation.color = [NSColor colorWithCalibratedRed:1 green:0.82 blue:0.12 alpha:0.45];
  annotation.contents = @"Acacia test annotation";
  [page addAnnotation:annotation];

  XCTAssertTrue([workingCopy writeToURL:copyURL]);

  PDFDocument *reloadedOriginal = [[PDFDocument alloc] initWithURL:sourceURL];
  PDFDocument *reloadedCopy = [[PDFDocument alloc] initWithURL:copyURL];
  XCTAssertEqual([reloadedOriginal pageAtIndex:0].annotations.count, 0);
  XCTAssertEqual([reloadedCopy pageAtIndex:0].annotations.count, 1);
}

- (PDFDocument *)makeDocumentWithText:(NSString *)text
{
  TextPDFView *view = [[TextPDFView alloc] initWithFrame:NSMakeRect(0, 0, 600, 800)];
  view.text = text;
  NSData *pdfData = [view dataWithPDFInsideRect:view.bounds];
  return [[PDFDocument alloc] initWithData:pdfData];
}

- (NSURL *)temporaryPDFURLWithName:(NSString *)name
{
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:name];
  [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
  return [NSURL fileURLWithPath:path];
}

@end
