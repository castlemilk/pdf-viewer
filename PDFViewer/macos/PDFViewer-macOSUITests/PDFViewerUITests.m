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

- (XCUIElement *)waitForIdentifierWithPrefix:(NSString *)prefix
{
  NSPredicate *predicate = [NSPredicate predicateWithFormat:@"identifier BEGINSWITH %@", prefix];
  XCUIElement *element =
      [[[self.app descendantsMatchingType:XCUIElementTypeAny] matchingPredicate:predicate] firstMatch];
  XCTAssertTrue([element waitForExistenceWithTimeout:20],
                @"Expected an element with identifier prefix %@ to exist",
                prefix);
  return element;
}

- (XCUIElement *)waitForFirstIdentifier:(NSArray<NSString *> *)identifiers
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    for (NSString *identifier in identifiers) {
      XCUIElement *element = [self elementWithIdentifier:identifier];
      if (element.exists) {
        return element;
      }
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected one of these identifiers to exist: %@",
          [identifiers componentsJoinedByString:@", "]);
  return [self elementWithIdentifier:identifiers.firstObject];
}

- (NSString *)contentForElement:(XCUIElement *)element
{
  NSString *content = element.label;
  if (content.length == 0 && element.value != nil) {
    content = [element.value description];
  }
  return content ?: @"";
}

- (XCUIElement *)waitForIdentifier:(NSString *)identifier labelContaining:(NSString *)expected
{
  XCUIElement *element = [self waitForIdentifier:identifier];
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    if ([[self contentForElement:element] containsString:expected]) {
      return element;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected %@ label '%@' to contain '%@'",
          identifier,
          [self contentForElement:element],
          expected);
  return element;
}

- (XCUIElement *)waitForText:(NSString *)text
{
  XCUIElement *element = self.app.staticTexts[text];
  XCTAssertTrue([element waitForExistenceWithTimeout:20], @"Expected text '%@' to exist", text);
  return element;
}

- (XCUIElement *)waitForStaticTextContaining:(NSString *)text
{
  NSPredicate *predicate =
      [NSPredicate predicateWithFormat:@"label CONTAINS[c] %@ OR value CONTAINS[c] %@", text, text];
  XCUIElement *element = [[self.app.staticTexts matchingPredicate:predicate] firstMatch];
  XCTAssertTrue([element waitForExistenceWithTimeout:20],
                @"Expected rendered PDF text containing '%@' to exist",
                text);
  return element;
}

- (void)assertIdentifier:(NSString *)identifier labelContains:(NSString *)expected
{
  [self waitForIdentifier:identifier labelContaining:expected];
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

- (void)scrollIdentifierIntoView:(NSString *)identifier
{
  XCUIElement *element = [self waitForIdentifier:identifier];
  XCUIElement *scrollView = [self waitForIdentifier:@"inspector-scroll"];

  for (NSInteger attempt = 0; attempt < 10; attempt += 1) {
    CGRect visibleFrame = CGRectInset(scrollView.frame, 0, 8);
    CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
    if (CGRectContainsPoint(visibleFrame, center) && element.isHittable) {
      return;
    }

    XCUICoordinate *start =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(0.5, 0.88)];
    XCUICoordinate *end =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(0.5, 0.12)];
    [start pressForDuration:0.05 thenDragToCoordinate:end];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  CGRect visibleFrame = CGRectInset(scrollView.frame, 0, 8);
  CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
  XCTAssertTrue(CGRectContainsPoint(visibleFrame, center) && element.isHittable,
                @"Expected %@ to be visible after scrolling inspector. Element frame %@, scroll frame %@",
                identifier,
                NSStringFromRect(element.frame),
                NSStringFromRect(scrollView.frame));
}

- (void)dismissAlertIfPresent
{
  XCUIElement *okButton = self.app.sheets.buttons[@"OK"].firstMatch;
  if (![okButton waitForExistenceWithTimeout:2]) {
    okButton = self.app.windows.firstMatch.sheets.buttons[@"OK"].firstMatch;
  }
  if ([okButton waitForExistenceWithTimeout:5]) {
    [okButton click];
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
  XCUIElement *label = [self pageLabelElement];
  NSString *content = [self contentForElement:label];
  XCTAssertTrue([content containsString:expected],
                @"Expected page label '%@' to contain '%@'",
                content,
                expected);
}

- (XCUIElement *)pageLabelElement
{
  XCUIElement *label = [self elementWithIdentifier:@"bottom-page-label"];
  if (![label waitForExistenceWithTimeout:2]) {
    label = [self waitForIdentifier:@"bottom-scrubber"];
  }
  return label;
}

- (NSInteger)currentDisplayedPageNumber
{
  NSString *content = [self contentForElement:[self pageLabelElement]];
  NSRegularExpression *regex =
      [NSRegularExpression regularExpressionWithPattern:@"\\b(\\d+)\\b"
                                                options:0
                                                  error:nil];
  NSTextCheckingResult *match =
      [regex firstMatchInString:content options:0 range:NSMakeRange(0, content.length)];
  if (match == nil || match.numberOfRanges < 2) {
    XCTFail(@"Could not parse current page number from '%@'", content);
    return NSNotFound;
  }

  return [[content substringWithRange:[match rangeAtIndex:1]] integerValue];
}

- (void)waitForPageNumber:(NSInteger)expectedPageNumber
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:8];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    if ([self currentDisplayedPageNumber] == expectedPageNumber) {
      return;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected page number %ld, got '%@'",
          (long)expectedPageNumber,
          [self contentForElement:[self pageLabelElement]]);
}

- (void)assertElement:(XCUIElement *)inner staysInsideElement:(XCUIElement *)outer name:(NSString *)name
{
  XCTAssertFalse(CGRectIsEmpty(inner.frame), @"Expected %@ to have a measurable frame", name);
  XCTAssertFalse(CGRectIsEmpty(outer.frame), @"Expected containing element for %@ to have a measurable frame", name);
  XCTAssertTrue(CGRectContainsRect(CGRectInset(outer.frame, -1, -1), inner.frame),
                @"Expected %@ frame %@ to stay inside %@",
                name,
                NSStringFromRect(inner.frame),
                NSStringFromRect(outer.frame));
}

- (void)testSeededLibraryLaunchesWithMajorRegions
{
  [self launchAndWaitForLibrary];

  [self waitForIdentifier:@"library-search-input"];
  [self waitForIdentifier:@"view-mode-grid"];
  [self waitForIdentifier:@"view-mode-list"];
  [self waitForIdentifier:@"filter-button"];
  [self waitForIdentifier:@"add-collection-button"];
  [self waitForIdentifier:@"doc-card-q4-market-analysis"];

  [self tapIdentifier:@"view-mode-list"];
  [self waitForIdentifier:@"doc-row-q4-market-analysis"];
  [self waitForIdentifier:@"doc-row-product-roadmap"];
  [self waitForIdentifier:@"doc-row-annual-financial-report"];
  [self waitForIdentifier:@"inspector-open-action"];
  [self waitForIdentifier:@"library-compare-button"];

  [self assertIdentifier:@"doc-card-q4-market-analysis" labelContains:@"Q4 Market Analysis Report"];
  [self assertIdentifier:@"doc-row-q4-market-analysis" labelContains:@"Q4 Market Analysis Report"];

  [self tapIdentifier:@"filter-button"];
  [self waitForIdentifier:@"filter-panel"];
  [self tapIdentifier:@"filter-tag-finance"];
  [self waitForIdentifier:@"doc-row-annual-financial-report"];
  [self waitForIdentifier:@"doc-row-invoice-0042"];

  [self tapIdentifier:@"add-collection-button"];
  [self waitForIdentifier:@"collection-new-collection"];
}

- (void)testLibrarySearchSelectionAndDocumentOpen
{
  [self launchAndWaitForLibrary];

  XCUIElement *search = [self waitForIdentifier:@"library-search-input"];
  [self clickElement:search];
  [search typeText:@"roadmap"];

  [self tapIdentifier:@"view-mode-list"];
  [self waitForIdentifier:@"doc-row-product-roadmap"];
  [self tapIdentifier:@"doc-row-product-roadmap"];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"Product Roadmap 2025"];
  [self assertPageLabelContains:@"Page 1"];
}

- (void)testLibraryNavigationSummaryAndEmptyStateRecovery
{
  [self launchAndWaitForLibrary];

  [self waitForIdentifier:@"library-results-summary"];

  [self tapIdentifier:@"filter-button"];
  [self waitForIdentifier:@"filter-panel"];
  [self tapIdentifier:@"filter-tag-finance"];
  [self waitForIdentifier:@"filter-button" labelContaining:@"1 active"];
  [self waitForIdentifier:@"doc-card-annual-financial-report"];

  XCUIElement *search = [self waitForIdentifier:@"library-search-input"];
  [self clickElement:search];
  [search typeText:@"definitely no matching local pdf"];

  [self waitForIdentifier:@"library-empty-state"];
  [self tapIdentifier:@"clear-empty-state-filters"];
  [self waitForIdentifier:@"doc-card-q4-market-analysis"];
  [self waitForIdentifier:@"doc-card-q4-market-analysis"];
}

- (void)testImportsRealPdfAndSearchesItsPages
{
  NSString *fixturePath =
      [NSProcessInfo processInfo].environment[@"PDFVIEWER_REAL_PDF_FIXTURE_PATH"];
  if (fixturePath.length == 0) {
    fixturePath = @"/tmp/AcaciaUITestFixtures/2025 Electronic Pack - Ben Ebsworth.pdf";
  }
  if (fixturePath.length == 0 ||
      ![[NSFileManager defaultManager] fileExistsAtPath:fixturePath]) {
    XCTSkip(@"Real PDF fixture unavailable. Run scripts/run-macos-e2e.sh with "
            @"PDFVIEWER_REAL_PDF_SOURCE pointing at a local PDF.");
    return;
  }
  NSString *sandboxFixturePath = [self copyFixtureIntoAppSandbox:fixturePath];

  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_TEST_IMPORT_PATH" : sandboxFixturePath,
  };
  [self launchAndWaitForLibrary];

  [self tapIdentifier:@"toolbar-open-file-button"];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"2025 Electronic Pack - Ben Ebsworth"];
  [self waitForStaticTextContaining:@"Income Tax Return"];
  [self assertPageLabelContains:@"Page 1 of 19"];

  XCUIElement *documentSearch = [self waitForIdentifier:@"document-search-input"];
  [self clickElement:documentSearch];
  [documentSearch typeText:@"Taxable income\n"];
  [self assertPageLabelContains:@"Page 4"];

  [self tapIdentifier:@"export-text-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"acacia-page-3.txt"];
  [self dismissAlertIfPresent];

  [self tapIdentifier:@"export-png-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"acacia-page-3.png"];
  [self dismissAlertIfPresent];

  [self tapIdentifier:@"viewer-page-next"];
  [self waitForPageNumber:5];
  [self tapIdentifier:@"viewer-zoom-in"];
  [self tapIdentifier:@"viewer-zoom-out"];

  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUIElement *canvas = [self waitForFirstIdentifier:@[
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
    @"viewer-screen",
  ]];
  XCUICoordinate *highlightStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.34)];
  XCUICoordinate *highlightEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.37)];
  [highlightStart pressForDuration:0.1 thenDragToCoordinate:highlightEnd];
  [self waitForIdentifier:@"comments-paywall"];
  [self tapIdentifier:@"unlock-comments-button"];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self tapIdentifier:@"quick-action-add-note"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *notePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.44, 0.44)];
  [notePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifierWithPrefix:@"comment-item-note-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self tapIdentifier:@"quick-action-draw"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *drawingStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.52)];
  XCUICoordinate *drawingEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.68, 0.58)];
  [drawingStart pressForDuration:0.1 thenDragToCoordinate:drawingEnd];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-drawings"];
  [self waitForIdentifierWithPrefix:@"comment-item-drawing-"];

  [self tapIdentifier:@"tool-signature"];
  [self waitForIdentifier:@"signature-manager"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *signaturePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.56, 0.48)];
  [signaturePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifierWithPrefix:@"comment-item-signature-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self tapIdentifier:@"export-annotated-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"annotated.pdf"];
  [self dismissAlertIfPresent];
}

- (NSString *)copyFixtureIntoAppSandbox:(NSString *)sourcePath
{
  NSString *containerDirectory =
      [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Containers/com.benebsworth.acacia/Data/tmp/AcaciaUITests"];
  NSError *error = nil;
  XCTAssertTrue([[NSFileManager defaultManager] createDirectoryAtPath:containerDirectory
                                          withIntermediateDirectories:YES
                                                           attributes:nil
                                                                error:&error],
                @"Unable to create app sandbox fixture directory: %@", error);

  NSString *destinationPath = [containerDirectory stringByAppendingPathComponent:sourcePath.lastPathComponent];
  [[NSFileManager defaultManager] removeItemAtPath:destinationPath error:nil];
  XCTAssertTrue([[NSFileManager defaultManager] copyItemAtPath:sourcePath
                                                        toPath:destinationPath
                                                         error:&error],
                @"Unable to copy real PDF fixture into app sandbox: %@", error);
  return destinationPath;
}

- (void)testSidebarRecentFavoritesAndSharedScopes
{
  [self launchAndWaitForLibrary];
  [self tapIdentifier:@"view-mode-list"];

  [self tapIdentifier:@"nav-favorites"];
  [self waitForIdentifier:@"doc-row-product-roadmap"];
  [self waitForIdentifier:@"doc-row-future-work"];

  [self tapIdentifier:@"nav-shared"];
  [self waitForIdentifier:@"doc-row-competitive-landscape"];
  [self waitForIdentifier:@"doc-row-board-minutes-apr"];

  [self tapIdentifier:@"nav-recent"];
  [self waitForIdentifier:@"doc-row-q4-market-analysis"];
  [self waitForIdentifier:@"doc-row-annual-financial-report"];
}

- (void)testViewerNavigationAnnotationAndCommentsFlow
{
  [self launchAndWaitForLibrary];
  [self openSelectedDocument];

  XCUIElement *window = self.app.windows.firstMatch;
  XCUIElement *viewer = [self waitForIdentifier:@"viewer-screen"];
  XCUIElement *canvas = [self waitForIdentifier:@"pdf-canvas-fallback"];
  XCUIElement *bottomScrubber = [self waitForIdentifier:@"bottom-scrubber"];
  [self waitForIdentifier:@"viewer-page-next"];
  [self waitForIdentifier:@"viewer-page-previous"];

  [self assertElement:viewer staysInsideElement:window name:@"viewer"];
  [self assertElement:canvas staysInsideElement:viewer name:@"PDF canvas"];
  XCTAssertLessThanOrEqual(CGRectGetMaxY(canvas.frame),
                           CGRectGetMinY(bottomScrubber.frame) + 1,
                           @"PDF canvas should not cover the bottom page scrubber");

  NSInteger startingPage = [self currentDisplayedPageNumber];
  [self tapIdentifier:@"viewer-page-next"];
  [self waitForPageNumber:startingPage + 1];
  [self tapIdentifier:@"viewer-page-previous"];
  [self waitForPageNumber:startingPage];

  XCUIElement *documentSearch = [self waitForIdentifier:@"document-search-input"];
  [self clickElement:documentSearch];
  [documentSearch typeText:@"revenue\n"];
  [self waitForPageNumber:9];

  [self tapIdentifier:@"thumbnail-page-8"];
  [self waitForPageNumber:8];
  [self tapIdentifier:@"thumbnail-page-9"];
  [self waitForPageNumber:9];

  [self tapIdentifier:@"viewer-zoom-in"];
  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *highlightStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.34)];
  XCUICoordinate *highlightEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.37)];
  [highlightStart pressForDuration:0.1 thenDragToCoordinate:highlightEnd];
  [self waitForIdentifier:@"comments-paywall"];
  [self tapIdentifier:@"unlock-comments-button"];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self tapIdentifier:@"quick-action-add-note"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *notePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.42)];
  [notePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-notes"];
  [self waitForIdentifierWithPrefix:@"comment-item-note-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self tapIdentifier:@"quick-action-draw"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *drawingStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.52)];
  XCUICoordinate *drawingEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.68, 0.58)];
  [drawingStart pressForDuration:0.1 thenDragToCoordinate:drawingEnd];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-drawings"];
  [self waitForIdentifierWithPrefix:@"comment-item-drawing-"];

  [self tapIdentifier:@"tool-signature"];
  [self waitForIdentifier:@"signature-manager"];
  [self waitForIdentifier:@"pdf-tool-hint"];
  XCUICoordinate *signaturePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.48)];
  [signaturePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-signatures" labelContaining:@"Signatures 1"];
  [self tapIdentifier:@"comment-filter-signatures"];
  [self waitForIdentifierWithPrefix:@"comment-item-signature-"];
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
  [self waitForPageNumber:8];
  [self tapIdentifier:@"compare-page-next"];
  [self waitForPageNumber:9];
}

@end
