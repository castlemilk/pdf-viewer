#import <XCTest/XCTest.h>
#import <AppKit/AppKit.h>

@interface PDFViewerUITests : XCTestCase
@property(nonatomic, strong) XCUIApplication *app;
@end

@implementation PDFViewerUITests

- (void)setUp
{
  self.continueAfterFailure = NO;
  self.app = [[XCUIApplication alloc] init];
  self.app.launchArguments = @[@"--uitesting"];
  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_RESET_STATE" : @"1",
  };

  [self addUIInterruptionMonitorWithDescription:@"Dismiss Codex test-run notification"
                                        handler:^BOOL(XCUIElement *element) {
    if (CGRectGetWidth(element.frame) > 500 || CGRectGetHeight(element.frame) > 500) {
      return NO;
    }

    NSPredicate *dismissPredicate =
        [NSPredicate predicateWithFormat:@"label BEGINSWITH[c] 'Dismiss' OR title BEGINSWITH[c] 'Dismiss'"];
    XCUIElement *dismissButton =
        [[[element descendantsMatchingType:XCUIElementTypeAny] matchingPredicate:dismissPredicate] firstMatch];
    if ([dismissButton waitForExistenceWithTimeout:2]) {
      [dismissButton click];
      return YES;
    }

    NSArray<XCUIElement *> *buttons =
        [element descendantsMatchingType:XCUIElementTypeButton].allElementsBoundByIndex;
    if (buttons.count > 0) {
      [buttons.lastObject click];
      return YES;
    }

    return NO;
  }];
}

- (void)tearDown
{
  [self.app terminate];
  self.app = nil;
}

- (NSDictionary<NSString *, NSString *> *)proPurchaseE2EConfiguration
{
  NSArray<NSString *> *keys = @[
    @"ACACIA_PRO_API_BASE_URL",
    @"ACACIA_FIREBASE_ID_TOKEN",
    @"ACACIA_STOREKIT_TEST_SIGNED_JWS",
  ];
  NSDictionary<NSString *, NSString *> *environment = [NSProcessInfo processInfo].environment;
  NSMutableDictionary<NSString *, NSString *> *config = [NSMutableDictionary dictionary];

  NSString *configPath = environment[@"ACACIA_PRO_PURCHASE_E2E_CONFIG_PATH"];
  if (configPath.length == 0) {
    configPath = @"/tmp/acacia-pro-purchase-e2e-config.plist";
  }
  NSDictionary *fileConfig = [NSDictionary dictionaryWithContentsOfFile:configPath];

  for (NSString *key in keys) {
    NSString *value = environment[key];
    if (value.length == 0 && [fileConfig[key] isKindOfClass:[NSString class]]) {
      value = fileConfig[key];
    }
    if (value.length > 0) {
      config[key] = value;
    }
  }

  return config;
}

- (BOOL)proBackendIsHealthyAtBaseURL:(NSString *)baseURL
{
  if (baseURL.length == 0) {
    return NO;
  }

  NSString *trimmedBaseURL =
      [baseURL stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]];
  NSURL *healthURL = [NSURL URLWithString:[trimmedBaseURL stringByAppendingString:@"/health"]];
  if (healthURL == nil) {
    return NO;
  }

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:healthURL];
  request.HTTPMethod = @"GET";
  request.timeoutInterval = 2;

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block NSInteger statusCode = 0;
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
      dataTaskWithRequest:request
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
          if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
            statusCode = ((NSHTTPURLResponse *)response).statusCode;
          }
          dispatch_semaphore_signal(semaphore);
        }];
  [task resume];

  dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC));
  if (dispatch_semaphore_wait(semaphore, deadline) != 0) {
    [task cancel];
    return NO;
  }
  return statusCode == 200;
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

- (void)waitForLibrarySurface
{
  XCUIElement *library = [self elementWithIdentifier:@"library-screen"];
  if ([library waitForExistenceWithTimeout:5]) {
    return;
  }

  XCUIElement *libraryTitle = self.app.staticTexts[@"Library"].firstMatch;
  if ([libraryTitle waitForExistenceWithTimeout:10]) {
    return;
  }

  XCUIElement *libraryNav = [self elementWithIdentifier:@"nav-library"];
  XCTAssertTrue([libraryNav waitForExistenceWithTimeout:10], @"Expected Library surface to exist");
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

- (void)waitForFilterPanel
{
  [self waitForFirstIdentifier:@[
    @"filter-panel",
    @"filter-tag-all",
    @"filter-tag-finance",
    @"filter-collection-all"
  ]];
}

- (XCUIElement *)tapIdentifier:(NSString *)tapIdentifier
     untilFirstIdentifierExists:(NSArray<NSString *> *)targetIdentifiers
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    for (NSString *targetIdentifier in targetIdentifiers) {
      XCUIElement *target = [self elementWithIdentifier:targetIdentifier];
      if (target.exists) {
        return target;
      }
    }

    XCUIElement *tapTarget = [self elementWithIdentifier:tapIdentifier];
    if ([tapTarget waitForExistenceWithTimeout:1]) {
      [self clickElement:tapTarget];
    }

    NSDate *pollDeadline = [NSDate dateWithTimeIntervalSinceNow:1];
    while ([[NSDate date] compare:pollDeadline] == NSOrderedAscending) {
      for (NSString *targetIdentifier in targetIdentifiers) {
        XCUIElement *target = [self elementWithIdentifier:targetIdentifier];
        if (target.exists) {
          return target;
        }
      }
      [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }
  }

  XCTFail(@"Expected tapping %@ to reveal one of these identifiers: %@",
          tapIdentifier,
          [targetIdentifiers componentsJoinedByString:@", "]);
  return [self elementWithIdentifier:targetIdentifiers.firstObject];
}

- (void)waitForCommentsPanel
{
  [self waitForFirstIdentifier:@[
    @"comments-panel",
    @"comment-filter-all",
  ]];
}

- (NSString *)contentForElement:(XCUIElement *)element
{
  NSString *content = element.label;
  if (element.value != nil) {
    NSString *value = [element.value description];
    if (value.length > 0) {
      content = content.length > 0 ? [content stringByAppendingFormat:@" %@", value] : value;
    }
  }
  return content ?: @"";
}

- (void)waitForElement:(XCUIElement *)element contentContaining:(NSString *)expected
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    if ([[self contentForElement:element] containsString:expected]) {
      return;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected element %@ content '%@' to contain '%@'",
          element.identifier,
          [self contentForElement:element],
          expected);
}

- (XCUIElement *)nativeCanvasElement
{
  XCUIElement *nativeCanvas = [self elementWithIdentifier:@"pdf-canvas-native"];
  if (nativeCanvas.exists) {
    return nativeCanvas;
  }

  XCUIElement *nativeFrame = [self elementWithIdentifier:@"pdf-canvas-native-frame"];
  XCTAssertTrue(nativeFrame.exists, @"Expected native PDF canvas to exist for annotation verification");
  return nativeFrame;
}

- (NSInteger)annotationCountForElement:(XCUIElement *)element
{
  NSString *content = [self contentForElement:element];
  NSRegularExpression *regex =
      [NSRegularExpression regularExpressionWithPattern:@"(?:annotations?\\s+([0-9]+)|([0-9]+)\\s+annotations?)"
                                                options:0
                                                  error:nil];
  NSTextCheckingResult *match =
      [regex firstMatchInString:content options:0 range:NSMakeRange(0, content.length)];
  XCTAssertNotNil(match, @"Expected native canvas content to include an annotation count: %@", content);
  if (match == nil || match.numberOfRanges < 2) {
    return 0;
  }

  for (NSUInteger rangeIndex = 1; rangeIndex < match.numberOfRanges; rangeIndex++) {
    NSRange range = [match rangeAtIndex:rangeIndex];
    if (range.location != NSNotFound) {
      return [[content substringWithRange:range] integerValue];
    }
  }

  return 0;
}

- (NSInteger)nativeCanvasAnnotationCount
{
  return [self annotationCountForElement:[self nativeCanvasElement]];
}

- (void)waitForNativeCanvasAnnotationCountGreaterThan:(NSInteger)previousCount
{
  XCUIElement *element = [self nativeCanvasElement];
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    if ([self annotationCountForElement:element] > previousCount) {
      return;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected native canvas annotation count to exceed %ld, content was '%@'",
          (long)previousCount,
          [self contentForElement:element]);
}

- (NSInteger)yellowPixelCountForElement:(XCUIElement *)element
{
  XCUIScreenshot *screenshot = [element screenshot];
  NSImage *image = screenshot.image;
  NSBitmapImageRep *bitmap = nil;
  for (NSImageRep *candidate in image.representations) {
    if ([candidate isKindOfClass:NSBitmapImageRep.class]) {
      bitmap = (NSBitmapImageRep *)candidate;
      break;
    }
  }
  if (bitmap == nil && image.TIFFRepresentation != nil) {
    bitmap = [[NSBitmapImageRep alloc] initWithData:image.TIFFRepresentation];
  }
  XCTAssertNotNil(bitmap, @"Expected a bitmap screenshot for %@", element.identifier);
  if (bitmap == nil) {
    return 0;
  }

  NSInteger yellowPixels = 0;
  for (NSInteger y = 0; y < bitmap.pixelsHigh; y += 2) {
    for (NSInteger x = 0; x < bitmap.pixelsWide; x += 2) {
      NSColor *color =
          [[bitmap colorAtX:x y:y] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
      if (color == nil) {
        continue;
      }

      CGFloat red = 0;
      CGFloat green = 0;
      CGFloat blue = 0;
      CGFloat alpha = 0;
      [color getRed:&red green:&green blue:&blue alpha:&alpha];
      if (alpha > 0.6 &&
          red > 0.74 &&
          green > 0.62 &&
          green < 0.99 &&
          blue < 0.84 &&
          red > blue + 0.12 &&
          green > blue + 0.07) {
        yellowPixels += 1;
      }
    }
  }

  return yellowPixels;
}

- (NSInteger)yellowPixelSignalForElement:(XCUIElement *)element
{
  XCUIScreenshot *screenshot = [element screenshot];
  NSImage *image = screenshot.image;
  NSBitmapImageRep *bitmap = nil;
  for (NSImageRep *candidate in image.representations) {
    if ([candidate isKindOfClass:NSBitmapImageRep.class]) {
      bitmap = (NSBitmapImageRep *)candidate;
      break;
    }
  }
  if (bitmap == nil && image.TIFFRepresentation != nil) {
    bitmap = [[NSBitmapImageRep alloc] initWithData:image.TIFFRepresentation];
  }
  XCTAssertNotNil(bitmap, @"Expected a bitmap screenshot for %@", element.identifier);
  if (bitmap == nil) {
    return 0;
  }

  NSInteger yellowSignal = 0;
  for (NSInteger y = 0; y < bitmap.pixelsHigh; y += 2) {
    for (NSInteger x = 0; x < bitmap.pixelsWide; x += 2) {
      NSColor *color =
          [[bitmap colorAtX:x y:y] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
      if (color == nil) {
        continue;
      }

      CGFloat red = 0;
      CGFloat green = 0;
      CGFloat blue = 0;
      CGFloat alpha = 0;
      [color getRed:&red green:&green blue:&blue alpha:&alpha];
      if (alpha > 0.6 &&
          red > 0.74 &&
          green > 0.62 &&
          green < 0.99 &&
          blue < 0.84 &&
          red > blue + 0.12 &&
          green > blue + 0.07) {
        yellowSignal += (NSInteger)round(((red - blue) + (green - blue)) * 1000.0);
      }
    }
  }

  return yellowSignal;
}

- (void)waitForElement:(XCUIElement *)element yellowPixelCountGreaterThan:(NSInteger)previousCount
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  NSInteger latestCount = 0;

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    latestCount = [self yellowPixelCountForElement:element];
    if (latestCount > previousCount) {
      return;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected visible yellow highlight pixels for %@ to exceed %ld, saw %ld",
          element.identifier,
          (long)previousCount,
          (long)latestCount);
}

- (void)waitForElement:(XCUIElement *)element yellowPixelSignalGreaterThan:(NSInteger)previousSignal
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  NSInteger latestSignal = 0;

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    latestSignal = [self yellowPixelSignalForElement:element];
    if (latestSignal > previousSignal) {
      return;
    }
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCTFail(@"Expected visible yellow highlight signal for %@ to exceed %ld, saw %ld",
          element.identifier,
          (long)previousSignal,
          (long)latestSignal);
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

- (void)selectSidebarScope:(NSString *)identifier
              summaryTitle:(NSString *)summaryTitle
              expectedRows:(NSArray<NSString *> *)expectedRows
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];

  while ([[NSDate date] compare:deadline] == NSOrderedAscending) {
    [self tapIdentifier:identifier];

    XCUIElement *summary = [self waitForIdentifier:@"library-results-summary"];
    if ([[self contentForElement:summary] containsString:summaryTitle]) {
      [self waitForFirstIdentifier:expectedRows];
      return;
    }

    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.5]];
  }

  XCUIElement *summary = [self waitForIdentifier:@"library-results-summary"];
  XCTFail(@"Expected sidebar scope %@ to show '%@', summary was '%@'",
          identifier,
          summaryTitle,
          [self contentForElement:summary]);
  [self waitForFirstIdentifier:expectedRows];
}

- (void)clickElement:(XCUIElement *)element
{
  [self.app activate];
  XCTAssertTrue(element.exists, @"Expected element %@ to exist before clicking", element.identifier);
  // React Native macOS can expose testIDs as generic elements even when the
  // native control is a button; coordinate clicks avoid XCTest re-querying by
  // a stale element type.
  XCUICoordinate *center =
      [element coordinateWithNormalizedOffset:CGVectorMake(0.5, 0.5)];
  [center click];
}

- (void)scrollIdentifierIntoView:(NSString *)identifier
{
  XCUIElement *element = [self waitForIdentifier:identifier];
  if (element.isHittable) {
    return;
  }

  XCUIElement *scrollView = [self elementWithIdentifier:@"inspector-scroll"];
  if (![scrollView waitForExistenceWithTimeout:2]) {
    scrollView = [self elementWithIdentifier:@"reader-inspector"];
  }
  BOOL usingWindowFallback = NO;
  if (![scrollView waitForExistenceWithTimeout:2]) {
    scrollView = self.app.windows.firstMatch;
    usingWindowFallback = YES;
    XCTAssertTrue([scrollView waitForExistenceWithTimeout:5],
                  @"Expected a window to exist for inspector scrolling fallback");
  }

  for (NSInteger attempt = 0; attempt < 20; attempt += 1) {
    CGRect visibleFrame = CGRectInset(scrollView.frame, 0, 8);
    CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
    if (CGRectContainsPoint(visibleFrame, center) && element.isHittable) {
      return;
    }

    BOOL elementIsAboveVisibleArea = center.y < CGRectGetMinY(visibleFrame);
    CGFloat scrollX = usingWindowFallback ? 0.88 : 0.5;
    XCUICoordinate *start =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(scrollX, elementIsAboveVisibleArea ? 0.12 : 0.88)];
    XCUICoordinate *end =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(scrollX, elementIsAboveVisibleArea ? 0.88 : 0.12)];
    [start pressForDuration:0.05 thenDragToCoordinate:end];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  CGRect visibleFrame = CGRectInset(scrollView.frame, 0, 8);
  CGRect tolerantFrame = CGRectInset(visibleFrame, -16, -16);
  CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
  XCTAssertTrue((CGRectContainsPoint(visibleFrame, center) && element.isHittable) ||
                    CGRectContainsPoint(tolerantFrame, center),
                @"Expected %@ to be visible after scrolling inspector. Element frame %@, scroll frame %@",
                identifier,
                NSStringFromRect(element.frame),
                NSStringFromRect(scrollView.frame));
}

- (void)scrollThumbnailIdentifierIntoView:(NSString *)identifier
{
  for (NSInteger attempt = 0; attempt < 20; attempt += 1) {
    XCUIElement *rail = [self waitForIdentifier:@"thumbnail-rail"];
    XCUIElement *scrollView = [[rail descendantsMatchingType:XCUIElementTypeScrollView] firstMatch];
    if (![scrollView waitForExistenceWithTimeout:2]) {
      scrollView = rail;
    }
    XCUIElement *element = [self waitForIdentifier:identifier];
    CGRect visibleFrame = CGRectInset(scrollView.frame, 8, 12);
    CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
    if (CGRectContainsPoint(visibleFrame, center) && element.isHittable) {
      return;
    }

    BOOL elementIsAboveVisibleArea = center.y < CGRectGetMinY(visibleFrame);
    XCUICoordinate *start =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(0.5, elementIsAboveVisibleArea ? 0.15 : 0.9)];
    XCUICoordinate *end =
        [scrollView coordinateWithNormalizedOffset:CGVectorMake(0.5, elementIsAboveVisibleArea ? 0.9 : 0.15)];
    [start pressForDuration:0.05 thenDragToCoordinate:end];
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
  }

  XCUIElement *rail = [self waitForIdentifier:@"thumbnail-rail"];
  XCUIElement *scrollView = [[rail descendantsMatchingType:XCUIElementTypeScrollView] firstMatch];
  if (![scrollView waitForExistenceWithTimeout:2]) {
    scrollView = rail;
  }
  XCUIElement *element = [self waitForIdentifier:identifier];
  CGRect visibleFrame = CGRectInset(scrollView.frame, 8, 12);
  CGPoint center = CGPointMake(CGRectGetMidX(element.frame), CGRectGetMidY(element.frame));
  XCTAssertTrue(CGRectContainsPoint(visibleFrame, center) && element.isHittable,
                @"Expected %@ to be visible in thumbnail rail. Element frame %@, rail frame %@",
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

- (NSString *)alertContentIfPresent
{
  XCUIElement *sheet = self.app.sheets.firstMatch;
  if (![sheet waitForExistenceWithTimeout:2]) {
    sheet = self.app.windows.firstMatch.sheets.firstMatch;
  }
  if (![sheet waitForExistenceWithTimeout:2]) {
    return @"";
  }

  NSMutableArray<NSString *> *parts = [NSMutableArray array];
  for (XCUIElement *text in [sheet descendantsMatchingType:XCUIElementTypeStaticText].allElementsBoundByIndex) {
    NSString *content = [self contentForElement:text];
    if (content.length > 0) {
      [parts addObject:content];
    }
  }
  for (XCUIElement *button in [sheet descendantsMatchingType:XCUIElementTypeButton].allElementsBoundByIndex) {
    NSString *content = [self contentForElement:button];
    if (content.length > 0) {
      [parts addObject:content];
    }
  }
  return [parts componentsJoinedByString:@" | "];
}

- (void)chooseOpenRecentMenuItemNamed:(NSString *)title
{
  [self.app activate];
  XCUIElement *fileMenu = self.app.menuBars.menuBarItems[@"File"].firstMatch;
  if (![fileMenu waitForExistenceWithTimeout:5]) {
    fileMenu = self.app.menuBars.menuItems[@"File"].firstMatch;
  }
  XCTAssertTrue([fileMenu waitForExistenceWithTimeout:10], @"Expected File menu to exist");
  [fileMenu click];

  XCUIElement *openRecentMenuItem = self.app.menuItems[@"Open Recent"].firstMatch;
  XCTAssertTrue([openRecentMenuItem waitForExistenceWithTimeout:10],
                @"Expected File > Open Recent to exist");
  [openRecentMenuItem click];

  XCUIElement *recentDocumentMenuItem = openRecentMenuItem.menuItems[title].firstMatch;
  XCTAssertTrue([recentDocumentMenuItem waitForExistenceWithTimeout:10],
                @"Expected Open Recent item '%@' to exist", title);
  [recentDocumentMenuItem click];
}

- (void)launchAndWaitForLibrary
{
  [self terminateRunningAcaciaApplications];
  [self.app terminate];
  [self.app launch];
  XCTAssertTrue([self.app.windows.firstMatch waitForExistenceWithTimeout:20]);
  [self.app activate];
  XCUIElement *library = [self elementWithIdentifier:@"library-screen"];
  if (![library waitForExistenceWithTimeout:5]) {
    XCUIElement *viewerLibraryButton = [self elementWithIdentifier:@"viewer-library-button"];
    if ([viewerLibraryButton waitForExistenceWithTimeout:5]) {
      [self clickElement:viewerLibraryButton];
    }
  }
  [self waitForLibrarySurface];
}

- (void)terminateRunningAcaciaApplications
{
  NSArray<NSRunningApplication *> *runningApps =
      [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.benebsworth.acacia"];
  for (NSRunningApplication *candidate in runningApps) {
    if (!candidate.terminated) {
      [candidate terminate];
    }
  }

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
  while ([deadline timeIntervalSinceNow] > 0) {
    BOOL allTerminated = YES;
    for (NSRunningApplication *candidate in runningApps) {
      if (!candidate.terminated) {
        allTerminated = NO;
        break;
      }
    }
    if (allTerminated) {
      return;
    }
    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                             beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
  }

  for (NSRunningApplication *candidate in runningApps) {
    if (!candidate.terminated) {
      [candidate forceTerminate];
    }
  }

  deadline = [NSDate dateWithTimeIntervalSinceNow:5];
  while ([deadline timeIntervalSinceNow] > 0) {
    BOOL anyStillRunning = NO;
    for (NSRunningApplication *candidate in runningApps) {
      if (!candidate.terminated) {
        anyStillRunning = YES;
        break;
      }
    }
    if (!anyStillRunning) {
      return;
    }
    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                             beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
  }
}

- (void)reopenRunningApplication
{
  NSArray<NSRunningApplication *> *runningApps =
      [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.benebsworth.acacia"];
  NSRunningApplication *runningApp = nil;
  for (NSRunningApplication *candidate in runningApps) {
    if (!candidate.terminated && candidate.processIdentifier > 0) {
      runningApp = candidate;
      break;
    }
  }
  XCTAssertNotNil(runningApp, @"Expected Acacia to still be running after its window closes");

  NSURL *bundleURL = runningApp.bundleURL;
  XCTAssertNotNil(bundleURL, @"Expected Acacia running application to expose a bundle URL");

  NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
  configuration.activates = YES;
  configuration.createsNewApplicationInstance = NO;

  __block BOOL completed = NO;
  __block NSError *openError = nil;
  [[NSWorkspace sharedWorkspace] openApplicationAtURL:bundleURL
                                       configuration:configuration
                                   completionHandler:^(NSRunningApplication *application, NSError *error) {
                                     openError = error;
                                     completed = YES;
                                   }];

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  while (!completed && [deadline timeIntervalSinceNow] > 0) {
    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                             beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
  }

  XCTAssertTrue(completed, @"Expected Acacia reopen request to complete");
  XCTAssertNil(openError, @"Expected Acacia reopen request to succeed: %@", openError);
}

- (void)openSelectedDocument
{
  [self tapIdentifier:@"inspector-open-action"];
  [self waitForFirstIdentifier:@[
    @"viewer-screen",
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
  ]];
  [self waitForIdentifier:@"viewer-page-next"];
  [self waitForFirstIdentifier:@[
    @"bottom-scrubber",
    @"bottom-page-label",
    @"viewer-page-input",
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
  ]];
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
  NSArray<NSString *> *identifiers = @[
    @"bottom-page-label",
    @"bottom-scrubber",
    @"viewer-page-input",
    @"pdf-canvas-native",
    @"pdf-canvas-native-frame",
  ];
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

  XCTFail(@"Expected a page label, bottom scrubber, or native canvas page summary to exist");
  return [self elementWithIdentifier:@"bottom-page-label"];
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

- (void)typePageNumber:(NSInteger)pageNumber
{
  XCUIElement *pageInput = [self waitForIdentifier:@"viewer-page-input"];
  [self clickElement:pageInput];
  [pageInput typeKey:@"a" modifierFlags:XCUIKeyModifierCommand];
  [pageInput typeText:[NSString stringWithFormat:@"%ld\n", (long)pageNumber]];
  [self waitForPageNumber:pageNumber];
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

  [self tapIdentifier:@"filter-button"
      untilFirstIdentifierExists:@[
        @"filter-panel",
        @"filter-tag-all",
        @"filter-tag-finance",
        @"filter-collection-all"
      ]];
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

  XCUIElement *roadmapResult =
      [self waitForFirstIdentifier:@[ @"command-result-product-roadmap", @"doc-row-product-roadmap" ]];
  [self clickElement:roadmapResult];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"Product Roadmap 2025"];
  [self assertPageLabelContains:@"Page 1"];
}

- (void)testLibraryNavigationSummaryAndEmptyStateRecovery
{
  [self launchAndWaitForLibrary];

  [self waitForIdentifier:@"library-results-summary"];

  [self tapIdentifier:@"filter-button"
      untilFirstIdentifierExists:@[
        @"filter-panel",
        @"filter-tag-all",
        @"filter-tag-finance",
        @"filter-collection-all"
      ]];
  [self tapIdentifier:@"filter-tag-finance"];
  [self waitForIdentifier:@"filter-button" labelContaining:@"1 active"];
  [self waitForIdentifier:@"doc-card-annual-financial-report"];

  XCUIElement *search = [self waitForIdentifier:@"library-search-input"];
  [self clickElement:search];
  [search typeText:@"definitely no matching local pdf"];

  [self waitForIdentifier:@"library-empty-state"];
  [self tapIdentifier:@"clear-empty-state-filters"
      untilFirstIdentifierExists:@[ @"doc-card-q4-market-analysis" ]];
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
    @"PDFVIEWER_RESET_STATE" : @"1",
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

  [self scrollIdentifierIntoView:@"export-text-action"];
  [self tapIdentifier:@"export-text-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"acacia-page-3.txt"];
  [self dismissAlertIfPresent];

  [self scrollIdentifierIntoView:@"export-png-action"];
  [self tapIdentifier:@"export-png-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"acacia-page-3.png"];
  [self dismissAlertIfPresent];

  [self tapIdentifier:@"viewer-page-next"];
  [self waitForPageNumber:5];
  [self tapIdentifier:@"viewer-zoom-in"];
  [self tapIdentifier:@"viewer-zoom-out"];

  [self scrollIdentifierIntoView:@"quick-action-highlight"];
  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Highlighter ready"];
  NSInteger annotationsBeforeHighlight = [self nativeCanvasAnnotationCount];
  XCUIElement *canvas = [self waitForFirstIdentifier:@[
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
    @"viewer-screen",
  ]];
  NSInteger yellowPixelsBeforeHighlight = [self yellowPixelCountForElement:canvas];
  XCUICoordinate *highlightStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.34)];
  XCUICoordinate *highlightEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.37)];
  [highlightStart pressForDuration:0.1 thenDragToCoordinate:highlightEnd];
  [self waitForNativeCanvasAnnotationCountGreaterThan:annotationsBeforeHighlight];
  [self waitForElement:canvas yellowPixelCountGreaterThan:yellowPixelsBeforeHighlight + 24];
  [self waitForCommentsPanel];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self scrollIdentifierIntoView:@"quick-action-add-note"];
  [self tapIdentifier:@"quick-action-add-note"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Note ready"];
  XCUICoordinate *notePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.44, 0.44)];
  [notePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifierWithPrefix:@"comment-item-note-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self scrollIdentifierIntoView:@"quick-action-draw"];
  [self tapIdentifier:@"quick-action-draw"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Pen ready"];
  XCUICoordinate *drawingStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.52)];
  XCUICoordinate *drawingEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.68, 0.58)];
  [drawingStart pressForDuration:0.1 thenDragToCoordinate:drawingEnd];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-drawings"];
  [self waitForIdentifierWithPrefix:@"comment-item-drawing-"];

  [self tapIdentifier:@"tool-signature"];
  [self scrollIdentifierIntoView:@"signature-manager"];
  [self waitForIdentifier:@"signature-manager"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Signature ready"];
  XCUICoordinate *signaturePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.56, 0.48)];
  [signaturePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifierWithPrefix:@"comment-item-signature-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self scrollIdentifierIntoView:@"export-annotated-action"];
  [self tapIdentifier:@"export-annotated-action"];
  [self waitForStaticTextContaining:@"Export ready"];
  [self waitForStaticTextContaining:@"annotated.pdf"];
  [self dismissAlertIfPresent];
}

- (void)testSelectedRealPdfTextCanBeHighlightedFromToolbar
{
  NSString *fixturePath =
      [NSProcessInfo processInfo].environment[@"PDFVIEWER_REAL_PDF_FIXTURE_PATH"];
  if (fixturePath.length == 0) {
    fixturePath = @"/tmp/AcaciaUITestFixtures/2025 Electronic Pack - Ben Ebsworth.pdf";
  }
  if (fixturePath.length == 0 ||
      ![[NSFileManager defaultManager] fileExistsAtPath:fixturePath]) {
    XCTSkip(@"Real PDF fixture unavailable for selected-text highlight validation.");
    return;
  }
  NSString *sandboxFixturePath = [self copyFixtureIntoAppSandbox:fixturePath];

  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_RESET_STATE" : @"1",
    @"PDFVIEWER_TEST_IMPORT_PATH" : sandboxFixturePath,
  };
  [self launchAndWaitForLibrary];

  [self tapIdentifier:@"toolbar-open-file-button"];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"2025 Electronic Pack - Ben Ebsworth"];
  [self assertPageLabelContains:@"Page 1 of 19"];

  XCUIElement *documentSearch = [self waitForIdentifier:@"document-search-input"];
  [self clickElement:documentSearch];
  [documentSearch typeText:@"Taxable income\n"];
  [self waitForPageNumber:4];

  XCUIElement *canvas = [self nativeCanvasElement];
  NSInteger yellowSignalBeforeSelectionHighlight = [self yellowPixelSignalForElement:canvas];

  [self tapIdentifier:@"tool-select"];
  XCUIElement *selectedText = [self waitForStaticTextContaining:@"Taxable income"];
  XCUICoordinate *selectionStart =
      [selectedText coordinateWithNormalizedOffset:CGVectorMake(0.08, 0.5)];
  XCUICoordinate *selectionEnd =
      [selectedText coordinateWithNormalizedOffset:CGVectorMake(0.92, 0.5)];
  [selectionStart pressForDuration:0.35 thenDragToCoordinate:selectionEnd];

  NSInteger annotationsBeforeSelectionHighlight = [self nativeCanvasAnnotationCount];
  [self scrollIdentifierIntoView:@"quick-action-highlight"];
  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Highlighter ready"];
  [self waitForNativeCanvasAnnotationCountGreaterThan:annotationsBeforeSelectionHighlight];
  [self waitForElement:canvas
      yellowPixelSignalGreaterThan:yellowSignalBeforeSelectionHighlight + 8000];
  [self waitForCommentsPanel];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];
}

- (void)testProPurchaseFlowActivatesCommentsThroughBackend
{
  NSDictionary<NSString *, NSString *> *config = [self proPurchaseE2EConfiguration];
  NSString *baseURL = config[@"ACACIA_PRO_API_BASE_URL"];
  NSString *firebaseToken = config[@"ACACIA_FIREBASE_ID_TOKEN"];
  NSString *signedTransactionJWS = config[@"ACACIA_STOREKIT_TEST_SIGNED_JWS"];
  if (baseURL.length == 0 || firebaseToken.length == 0 || signedTransactionJWS.length == 0) {
    XCTSkip(@"Set ACACIA_PRO_API_BASE_URL, ACACIA_FIREBASE_ID_TOKEN, and "
            @"ACACIA_STOREKIT_TEST_SIGNED_JWS to run Pro purchase e2e.");
    return;
  }
  if (![self proBackendIsHealthyAtBaseURL:baseURL]) {
    XCTSkip(@"Acacia Pro e2e backend is not reachable.");
    return;
  }

  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_PRO_PURCHASE_TESTING" : @"1",
    @"PDFVIEWER_RESET_STATE" : @"1",
    @"ACACIA_PRO_API_BASE_URL" : baseURL,
    @"ACACIA_FIREBASE_ID_TOKEN" : firebaseToken,
    @"ACACIA_STOREKIT_TEST_SIGNED_JWS" : signedTransactionJWS,
  };
  [self launchAndWaitForLibrary];

  [self tapIdentifier:@"doc-card-q4-market-analysis"];
  [self waitForIdentifier:@"viewer-screen"];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForCommentsPanel];

  NSString *alertContent = [self alertContentIfPresent];
  [self dismissAlertIfPresent];
  XCUIElement *commentsFilter = [self elementWithIdentifier:@"comment-filter-all"];
  XCTAssertTrue([commentsFilter waitForExistenceWithTimeout:20],
                @"Expected comments controls to exist after Pro purchase. Last alert: %@",
                alertContent);
}

- (void)testFileOpenRecentMenuReopensImportedPdf
{
  NSString *fixturePath =
      [NSProcessInfo processInfo].environment[@"PDFVIEWER_REAL_PDF_FIXTURE_PATH"];
  if (fixturePath.length == 0) {
    fixturePath = @"/tmp/AcaciaUITestFixtures/2025 Electronic Pack - Ben Ebsworth.pdf";
  }
  if (fixturePath.length == 0 ||
      ![[NSFileManager defaultManager] fileExistsAtPath:fixturePath]) {
    XCTSkip(@"Real PDF fixture unavailable for Open Recent validation.");
    return;
  }

  NSString *sandboxFixturePath = [self copyFixtureIntoAppSandbox:fixturePath];
  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_RESET_STATE" : @"1",
    @"PDFVIEWER_TEST_IMPORT_PATH" : sandboxFixturePath,
  };
  [self launchAndWaitForLibrary];

  [self tapIdentifier:@"toolbar-open-file-button"];
  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"2025 Electronic Pack - Ben Ebsworth"];

  [self tapIdentifier:@"viewer-library-button"];
  [self waitForLibrarySurface];
  [self chooseOpenRecentMenuItemNamed:sandboxFixturePath.lastPathComponent];

  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"2025 Electronic Pack - Ben Ebsworth"];
  [self assertPageLabelContains:@"Page 1 of 19"];
  [self waitForElement:[self nativeCanvasElement] contentContaining:@"Page 1 of 19"];
}

- (void)testLibraryRecentReopensImportedPdfAfterRelaunch
{
  NSString *fixturePath =
      [NSProcessInfo processInfo].environment[@"PDFVIEWER_REAL_PDF_FIXTURE_PATH"];
  if (fixturePath.length == 0) {
    fixturePath = @"/tmp/AcaciaUITestFixtures/2025 Electronic Pack - Ben Ebsworth.pdf";
  }
  if (fixturePath.length == 0 ||
      ![[NSFileManager defaultManager] fileExistsAtPath:fixturePath]) {
    XCTSkip(@"Real PDF fixture unavailable for persisted Recent validation.");
    return;
  }

  NSString *sandboxFixturePath = [self copyFixtureIntoAppSandbox:fixturePath];
  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
    @"PDFVIEWER_RESET_STATE" : @"1",
    @"PDFVIEWER_TEST_IMPORT_PATH" : sandboxFixturePath,
  };
  [self launchAndWaitForLibrary];

  [self tapIdentifier:@"toolbar-open-file-button"];
  [self waitForIdentifier:@"viewer-screen"];
  [self waitForElement:[self nativeCanvasElement] contentContaining:@"Page 1 of 19"];
  [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.75]];

  [self.app terminate];
  self.app = [[XCUIApplication alloc] init];
  self.app.launchArguments = @[@"--uitesting"];
  self.app.launchEnvironment = @{
    @"PDFVIEWER_UITESTING" : @"1",
  };
  [self launchAndWaitForLibrary];

  [self selectSidebarScope:@"nav-recent"
              summaryTitle:@"Recently Opened"
              expectedRows:@[@"doc-card-2025-electronic-pack-ben-ebsworth"]];
  [self tapIdentifier:@"doc-card-2025-electronic-pack-ben-ebsworth"];
  [self waitForIdentifier:@"viewer-screen"];
  [self assertIdentifier:@"viewer-screen" labelContains:@"2025 Electronic Pack - Ben Ebsworth"];
  [self waitForElement:[self nativeCanvasElement] contentContaining:@"Page 1 of 19"];
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

  [self selectSidebarScope:@"nav-favorites"
             summaryTitle:@"Favorite Documents"
             expectedRows:@[@"doc-row-product-roadmap", @"doc-row-future-work"]];

  [self selectSidebarScope:@"nav-shared"
             summaryTitle:@"Shared Documents"
             expectedRows:@[@"doc-row-competitive-landscape", @"doc-row-board-minutes-apr"]];

  [self selectSidebarScope:@"nav-recent"
             summaryTitle:@"Recently Opened"
             expectedRows:@[
               @"doc-row-q4-market-analysis",
               @"doc-row-annual-financial-report",
               @"doc-row-product-roadmap",
             ]];
}

- (void)testMainWindowReopensAfterClose
{
  [self launchAndWaitForLibrary];

  XCUIElement *window = self.app.windows.firstMatch;
  XCTAssertTrue([window waitForExistenceWithTimeout:20], @"Expected main window before close");
  [self.app typeKey:@"w" modifierFlags:XCUIKeyModifierCommand];

  NSPredicate *windowGone = [NSPredicate predicateWithFormat:@"exists == false"];
  [self expectationForPredicate:windowGone evaluatedWithObject:window handler:nil];
  [self waitForExpectationsWithTimeout:10 handler:nil];

  [self reopenRunningApplication];
  XCTAssertTrue([self.app.windows.firstMatch waitForExistenceWithTimeout:20],
                @"Expected main window to reopen after close and app activation");
  [self waitForLibrarySurface];
}

- (void)testViewerNavigationAnnotationAndCommentsFlow
{
  [self launchAndWaitForLibrary];
  [self openSelectedDocument];

  XCUIElement *window = self.app.windows.firstMatch;
  XCUIElement *viewer = [self waitForFirstIdentifier:@[
    @"viewer-screen",
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
  ]];
  XCUIElement *canvas = [self waitForFirstIdentifier:@[
    @"pdf-canvas-native-frame",
    @"pdf-canvas-native",
    @"pdf-canvas-fallback",
    @"viewer-screen",
  ]];
  XCUIElement *bottomScrubber = [self waitForFirstIdentifier:@[
    @"bottom-scrubber",
    @"bottom-page-label",
    @"viewer-page-input",
    @"pdf-canvas-native-frame",
  ]];
  [self waitForIdentifier:@"viewer-page-next"];
  [self waitForIdentifier:@"viewer-page-previous"];

  [self assertElement:viewer staysInsideElement:window name:@"viewer"];
  if (![canvas.identifier isEqualToString:@"viewer-screen"] &&
      ![canvas.identifier isEqualToString:viewer.identifier]) {
    [self assertElement:canvas staysInsideElement:viewer name:@"PDF canvas"];
    XCTAssertLessThanOrEqual(CGRectGetMaxY(canvas.frame),
                             CGRectGetMinY(bottomScrubber.frame) + 1,
                             @"PDF canvas should not cover the bottom page scrubber");
  } else if ([viewer.identifier isEqualToString:@"viewer-screen"]) {
    [self assertElement:bottomScrubber staysInsideElement:viewer name:@"bottom scrubber"];
  }

  NSInteger startingPage = [self currentDisplayedPageNumber];
  [self tapIdentifier:@"viewer-page-next"];
  [self waitForPageNumber:startingPage + 1];
  [self tapIdentifier:@"viewer-page-previous"];
  [self waitForPageNumber:startingPage];

  [self tapIdentifier:@"thumbnail-page-2"];
  [self waitForPageNumber:2];
  [self tapIdentifier:@"viewer-page-previous"];
  [self waitForPageNumber:1];

  XCUIElement *documentSearch = [self waitForIdentifier:@"document-search-input"];
  [self clickElement:documentSearch];
  [documentSearch typeText:@"revenue\n"];
  [self waitForPageNumber:4];

  [self typePageNumber:8];
  [self typePageNumber:9];

  [self tapIdentifier:@"viewer-zoom-in"];
  [self scrollIdentifierIntoView:@"quick-action-highlight"];
  [self tapIdentifier:@"quick-action-highlight"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Highlighter ready"];
  NSInteger annotationsBeforeHighlight = [self nativeCanvasAnnotationCount];
  NSInteger yellowPixelsBeforeHighlight = [self yellowPixelCountForElement:canvas];
  XCUICoordinate *highlightStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.34)];
  XCUICoordinate *highlightEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.37)];
  [highlightStart pressForDuration:0.1 thenDragToCoordinate:highlightEnd];
  [self waitForNativeCanvasAnnotationCountGreaterThan:annotationsBeforeHighlight];
  [self waitForElement:canvas yellowPixelCountGreaterThan:yellowPixelsBeforeHighlight + 24];
  [self waitForCommentsPanel];
  [self assertIdentifier:@"comment-item-local-highlight" labelContains:@"Local non-destructive highlight"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self scrollIdentifierIntoView:@"quick-action-add-note"];
  [self tapIdentifier:@"quick-action-add-note"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Note ready"];
  XCUICoordinate *notePoint =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.42, 0.42)];
  [notePoint click];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-notes"];
  [self waitForIdentifierWithPrefix:@"comment-item-note-"];

  [self tapIdentifier:@"inspector-tab-info"];
  [self scrollIdentifierIntoView:@"quick-action-draw"];
  [self tapIdentifier:@"quick-action-draw"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Pen ready"];
  XCUICoordinate *drawingStart =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.58, 0.52)];
  XCUICoordinate *drawingEnd =
      [canvas coordinateWithNormalizedOffset:CGVectorMake(0.68, 0.58)];
  [drawingStart pressForDuration:0.1 thenDragToCoordinate:drawingEnd];
  [self tapIdentifier:@"inspector-tab-comments"];
  [self waitForIdentifier:@"comment-filter-drawings"];
  [self waitForIdentifierWithPrefix:@"comment-item-drawing-"];

  [self tapIdentifier:@"tool-signature"];
  [self scrollIdentifierIntoView:@"signature-manager"];
  [self waitForIdentifier:@"signature-manager"];
  [self waitForIdentifier:@"pdf-tool-hint" labelContaining:@"Signature ready"];
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
