#import <XCTest/XCTest.h>

@interface PDFViewerUITests : XCTestCase
@property(nonatomic, strong) XCUIApplication *app;
@end

@implementation PDFViewerUITests

- (void)setUp
{
  self.continueAfterFailure = NO;
  self.app = [[XCUIApplication alloc] init];
  self.app.launchArguments = @[@"--uitesting"];
  self.app.launchEnvironment = @{@"PDFVIEWER_UITESTING" : @"1"};
}

- (void)tearDown
{
  [self.app terminate];
  self.app = nil;
}

- (XCUIElement *)elementWithIdentifier:(NSString *)identifier
{
  return [[[self.app descendantsMatchingType:XCUIElementTypeAny] matchingIdentifier:identifier] firstMatch];
}

- (XCUIElement *)waitForIdentifier:(NSString *)identifier
{
  XCUIElement *element = [self elementWithIdentifier:identifier];
  XCTAssertTrue([element waitForExistenceWithTimeout:20], @"Expected %@ to exist", identifier);
  return element;
}

- (XCUIElement *)waitForText:(NSString *)text
{
  XCUIElement *element = self.app.staticTexts[text];
  XCTAssertTrue([element waitForExistenceWithTimeout:20], @"Expected text '%@' to exist", text);
  return element;
}

- (void)assertIdentifier:(NSString *)identifier labelContains:(NSString *)expected
{
  XCUIElement *element = [self waitForIdentifier:identifier];
  NSString *content = element.label;
  if (content.length == 0 && element.value != nil) {
    content = [element.value description];
  }
  XCTAssertTrue([content containsString:expected],
                @"Expected %@ label '%@' to contain '%@'",
                identifier,
                content,
                expected);
}

- (void)tapIdentifier:(NSString *)identifier
{
  XCUIElement *element = [self waitForIdentifier:identifier];
  [self clickElement:element];
}

- (void)clickElement:(XCUIElement *)element
{
  [self.app activate];
  if (element.isHittable) {
    [element click];
  } else {
    XCUICoordinate *center =
        [element coordinateWithNormalizedOffset:CGVectorMake(0.5, 0.5)];
    [center click];
  }
}

- (void)launchAndWaitForLibrary
{
  [self.app launch];
  XCTAssertTrue([self.app.windows.firstMatch waitForExistenceWithTimeout:20]);
  [self.app activate];
  [self waitForIdentifier:@"library-screen"];
}

- (void)openSelectedDocument
{
  [self tapIdentifier:@"inspector-open-action"];
  [self waitForIdentifier:@"viewer-screen"];
  [self waitForIdentifier:@"viewer-page-next"];
  [self waitForIdentifier:@"bottom-scrubber"];
}

- (void)assertPageLabelContains:(NSString *)expected
{
  XCUIElement *label = [self elementWithIdentifier:@"bottom-page-label"];
  if (![label waitForExistenceWithTimeout:2]) {
    label = [self waitForIdentifier:@"bottom-scrubber"];
  }
  NSString *content = label.label;
  if (content.length == 0 && label.value != nil) {
    content = [label.value description];
  }
  XCTAssertTrue([content containsString:expected],
                @"Expected page label '%@' to contain '%@'",
                content,
                expected);
}

- (void)testSeededLibraryLaunchesWithMajorRegions
{
  [self launchAndWaitForLibrary];

  [self waitForIdentifier:@"library-search-input"];
  [self waitForIdentifier:@"view-mode-grid"];
  [self waitForIdentifier:@"view-mode-list"];
  [self waitForIdentifier:@"doc-card-q4-market-analysis"];
  [self waitForIdentifier:@"doc-row-q4-market-analysis"];
  [self waitForIdentifier:@"doc-row-product-roadmap"];
  [self waitForIdentifier:@"doc-row-annual-financial-report"];
  [self waitForIdentifier:@"inspector-open-action"];
  [self waitForIdentifier:@"library-compare-button"];

  [self assertIdentifier:@"doc-card-q4-market-analysis" labelContains:@"Q4 Market Analysis Report"];
  [self assertIdentifier:@"doc-row-q4-market-analysis" labelContains:@"Q4 Market Analysis Report"];
}

- (void)testLibrarySearchSelectionAndDocumentOpen
{
  [self launchAndWaitForLibrary];

  XCUIElement *search = [self waitForIdentifier:@"library-search-input"];
  [self clickElement:search];
  [search typeText:@"roadmap"];

  [self waitForIdentifier:@"doc-row-product-roadmap"];
  [self tapIdentifier:@"doc-row-product-roadmap"];
  [self tapIdentifier:@"inspector-open-action"];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"Product Roadmap 2025"];
  [self assertPageLabelContains:@"Page 1"];
}

- (void)testViewerNavigationAnnotationAndCommentsFlow
{
  [self launchAndWaitForLibrary];
  [self openSelectedDocument];

  [self tapIdentifier:@"thumbnail-page-8"];
  [self assertPageLabelContains:@"Page 8"];
  [self tapIdentifier:@"thumbnail-page-9"];
  [self assertPageLabelContains:@"Page 9"];

  [self tapIdentifier:@"viewer-zoom-in"];
  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"comments-panel"];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];
}

- (void)testCompareModeChangesPanelAndSyncedNavigation
{
  [self launchAndWaitForLibrary];
  [self tapIdentifier:@"library-compare-button"];

  [self waitForIdentifier:@"compare-screen"];
  [self waitForIdentifier:@"changes-panel"];
  [self waitForIdentifier:@"change-stat-added"];
  [self waitForIdentifier:@"change-stat-removed"];
  [self waitForIdentifier:@"change-stat-modified"];
  [self waitForIdentifier:@"change-row-page-1"];
  [self waitForIdentifier:@"sync-scroll-button"];

  [self tapIdentifier:@"compare-thumbnail-page-8"];
  [self assertPageLabelContains:@"Page 8"];
  [self tapIdentifier:@"compare-page-next"];
  [self assertPageLabelContains:@"Page 9"];
}

@end
