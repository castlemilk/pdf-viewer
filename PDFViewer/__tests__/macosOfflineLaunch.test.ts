declare const __dirname: string;
export {};
const {existsSync, readFileSync} = require('fs');
const path = require('path');

describe('macOS offline launch configuration', () => {
  const appRoot = path.join(__dirname, '..');

  it('prefers the embedded JavaScript bundle unless Metro is explicitly requested', () => {
    const appDelegate = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'AppDelegate.mm'),
      'utf8',
    );

    expect(appDelegate).toContain('URLForResource:@"main" withExtension:@"jsbundle"');
    expect(appDelegate).toContain('ACACIA_USE_METRO');
    expect(appDelegate).toContain('containsObject:@"--metro"');
    expect(appDelegate).toContain('if (!useMetro && bundledURL != nil)');
    expect(appDelegate).toContain('return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"]');
  });

  it('forces macOS Debug builds to embed a bundle for Xcode launches', () => {
    const project = readFileSync(
      path.join(appRoot, 'macos', 'Acacia.xcodeproj', 'project.pbxproj'),
      'utf8',
    );

    const normalizedProject = project.replace(/\\"/g, '"').replace(/\\n/g, '\n');

    expect(normalizedProject).toContain('if [ "${PLATFORM_NAME:-}" = "macosx" ]; then');
    expect(normalizedProject).toContain('case "${CONFIGURATION:-}" in');
    expect(normalizedProject).toContain('if [ "${ACACIA_USE_METRO:-0}" != "1" ]; then');
    expect(normalizedProject).toContain('export FORCE_BUNDLING=1');
  });

  it('wires the macOS UI test target to the Acacia app target', () => {
    const project = readFileSync(
      path.join(appRoot, 'macos', 'Acacia.xcodeproj', 'project.pbxproj'),
      'utf8',
    );
    const e2eScript = readFileSync(path.join(appRoot, 'scripts', 'run-macos-e2e.sh'), 'utf8');

    expect(project).toContain('TEST_TARGET_NAME = "Acacia-macOS";');
    expect(project).not.toContain('TEST_TARGET_NAME = "PDFViewer-macOS";');
    expect(e2eScript).toContain('xcrun automationmodetool');
    expect(e2eScript).toContain('DOES NOT REQUIRE user authentication');
    expect(e2eScript).toContain('ONLY_TESTING');
    expect(e2eScript).toContain('PDFVIEWER_REAL_PDF_FIXTURE_PATH');
    expect(e2eScript).toContain('TEST_TARGET_NAME="Acacia-macOS"');
    expect(e2eScript).toContain('pkill -x "Acacia"');
  });

  it('declares export compliance in the macOS Info.plist for TestFlight', () => {
    const infoPlist = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'Info.plist'),
      'utf8',
    );

    expect(infoPlist).toContain('<key>ITSAppUsesNonExemptEncryption</key>');
    expect(infoPlist).toContain('<false/>');
  });

  it('declares explicit macOS icon and architecture metadata for LaunchServices', () => {
    const infoPlist = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'Info.plist'),
      'utf8',
    );

    expect(infoPlist).toContain('<key>CFBundleIconFile</key>');
    expect(infoPlist).toContain('<key>CFBundleIconName</key>');
    expect(infoPlist).toContain('<string>AppIcon</string>');
    expect(infoPlist).toContain('<key>LSArchitecturePriority</key>');
    expect(infoPlist).toContain('<string>arm64</string>');
    expect(infoPlist).toContain('<string>x86_64</string>');
  });

  it('keeps native PDF export methods bookmark-aware on macOS and iOS', () => {
    const macBridge = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.mm'),
      'utf8',
    );
    const iosBridge = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfKitBridge.m'),
      'utf8',
    );
    const tsBridge = readFileSync(
      path.join(appRoot, 'src', 'native', 'PdfKitBridge.ts'),
      'utf8',
    );

    for (const source of [macBridge, iosBridge]) {
      expect(source).toContain('exportPageText:(NSString *)path');
      expect(source).toContain('bookmark:(NSString *)bookmark');
      expect(source).toContain('exportPageImage:(NSString *)path');
      expect(source).toContain('format:(NSString *)format');
      expect(source).toContain('exportAnnotatedCopy:(NSString *)path');
      expect(source).toContain('resolvedURLForPath:path');
      expect(source).toContain('stopAccessingSecurityScopedResource');
      expect(source).toContain('acacia-page-%@.txt');
    }

    expect(tsBridge).toContain(
      "exportPageImage?.(path, bookmark, pageIndex, format)",
    );
    expect(tsBridge).toContain("exportPageText?.(path, bookmark, pageIndex)");
    expect(tsBridge).toContain(
      "exportAnnotatedCopy?.(path, bookmark, annotations)",
    );
  });

  it('bridges macOS File > Open and Open Recent into the React import flow', () => {
    const appDelegate = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'AppDelegate.mm'),
      'utf8',
    );
    const macBridge = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.mm'),
      'utf8',
    );
    const macBridgeHeader = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.h'),
      'utf8',
    );
    const tsBridge = readFileSync(
      path.join(appRoot, 'src', 'native', 'PdfKitBridge.ts'),
      'utf8',
    );

    expect(appDelegate).toContain('openDocument:');
    expect(appDelegate).toContain('application:(NSApplication *)application openFiles:');
    expect(appDelegate).toContain('AcaciaPDFMenuOpenURLNotification');
    expect(appDelegate).toContain('noteNewRecentDocumentURL:url');
    expect(macBridgeHeader).toContain('RCTEventEmitter');
    expect(macBridge).toContain('AcaciaPdfOpenedFromMenu');
    expect(macBridge).toContain('sendEventWithName:@"AcaciaPdfOpenedFromMenu"');
    expect(macBridge).toContain('noteNewRecentDocumentURL:url');
    expect(macBridge).toContain('managedImportURLForSourceURL');
    expect(macBridge).toContain('ImportedPDFs');
    expect(macBridge).toContain('UITestSidecars');
    expect(tsBridge).toContain('NativeEventEmitter');
    expect(tsBridge).toContain('addOpenedPdfListener');
  });

  it('keeps the main macOS window alive across close and Dock reopen', () => {
    const appDelegate = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'AppDelegate.mm'),
      'utf8',
    );

    expect(appDelegate).toContain('@interface AppDelegate () <NSWindowDelegate>');
    expect(appDelegate).toContain(
      '- (NSWindow *)mainWindowCreatingIfNeededWithLaunchOptions:',
    );
    expect(appDelegate).toContain('window.releasedWhenClosed = NO;');
    expect(appDelegate).toContain('window.delegate = self;');
    expect(appDelegate).toContain('- (void)applicationDidBecomeActive:');
    expect(appDelegate).toContain('!window.isVisible');
    expect(appDelegate).toContain('- (BOOL)windowShouldClose:(NSWindow *)sender');
    expect(appDelegate).toContain('[sender orderOut:nil];');
    expect(appDelegate).toContain(
      'NSWindow *window = [self mainWindowCreatingIfNeededWithLaunchOptions:',
    );
    expect(appDelegate).toContain('[window makeKeyAndOrderFront:nil]');
  });

  it('seeds generated real PDF files for demo documents on macOS and iOS', () => {
    const macBridge = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.mm'),
      'utf8',
    );
    const iosBridge = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfKitBridge.m'),
      'utf8',
    );
    const app = readFileSync(path.join(appRoot, 'App.tsx'), 'utf8');
    const tsBridge = readFileSync(
      path.join(appRoot, 'src', 'native', 'PdfKitBridge.ts'),
      'utf8',
    );

    for (const source of [macBridge, iosBridge]) {
      expect(source).toContain('seedDemoPdfs');
      expect(source).toContain('AcaciaDemoPDFSpecs');
      expect(source).toContain('DemoPDFs');
      expect(source).toContain('q4-market-analysis');
      expect(source).toContain('future-work');
      expect(source).toContain('@"%@.pdf"');
      expect(source).toContain('metadataForURL');
    }

    expect(app).toContain('seedDemoPdfs');
    expect(app).toContain('applySeededDemoPdfs');
    expect(tsBridge).toContain('seedDemoPdfs?: () => Promise<ImportedPdf[]>');
  });

  it('keeps macOS native PDF zoom relative to the fitted page size', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );

    expect(macCanvas).toContain('- (void)applyZoom');
    expect(macCanvas).toContain('_pdfView.scaleFactorForSizeToFit');
    expect(macCanvas).toContain('fitScale * zoomMultiplier');
    expect(macCanvas).toContain('_pdfView.autoScales = NO');
    expect(macCanvas).toContain('[self applyZoom];');
  });

  it('keeps native PDF canvas note and drawing tools interactive on macOS and iOS', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas]) {
      expect(source).toContain('AcaciaAnnotationKindForTool');
      expect(source).toContain('isEqualToString:@"note"');
      expect(source).toContain('isEqualToString:@"drawing"');
      expect(source).toContain('AcaciaAnnotationSizeForKind');
      expect(source).toContain('Local drawing');
    }
  });

  it('uses drag-aware native highlight gestures on macOS and iOS', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
      'utf8',
    );

    expect(macCanvas).toContain('NSPanGestureRecognizer');
    expect(macCanvas).toContain('handleHighlightPan:');
    expect(macCanvas).toContain('AcaciaCanonicalBoundsForDrag');
    expect(iosCanvas).toContain('UIPanGestureRecognizer');
    expect(iosCanvas).toContain('handleHighlightPan:');
    expect(iosCanvas).toContain('AcaciaCanonicalBoundsForDrag');
  });

  it('exposes native PDF annotation state for macOS editor e2e checks', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );

    expect(macCanvas).toContain('- (void)refreshAccessibilityValue');
    expect(macCanvas).toContain('[self setAccessibilityElement:YES]');
    expect(macCanvas).toContain('[_pdfView setAccessibilityElement:YES]');
    expect(macCanvas).toContain('annotations %lu');
    expect(macCanvas).toContain('PDF canvas, %@');
    expect(macCanvas).toContain('[self refreshAccessibilityValue];');
    expect(macCanvas).toContain('[_pdfView setAccessibilityValue:summary]');
  });

  it('centers native minimum-height highlight drags around the pointer path', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas]) {
      expect(source).toContain('AcaciaCenteredMinimumRangeStart');
      expect(source).toContain('((first + second) / 2.0) - minimumLength / 2.0');
    }
  });

  it('uses real PDFKit ink paths for imported-PDF pen annotations and exports', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
      'utf8',
    );
    const macBridge = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.mm'),
      'utf8',
    );
    const iosBridge = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfKitBridge.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas]) {
      expect(source).toContain('handleDrawingPan:');
      expect(source).toContain('AcaciaCanonicalInkPathForViewPoints');
      expect(source).toContain('@"points"');
      expect(source).toContain('PDFAnnotationSubtypeInk');
      expect(source).toContain('addBezierPath');
    }

    for (const source of [macBridge, iosBridge]) {
      expect(source).toContain('PDFAnnotationSubtypeInk');
      expect(source).toContain('AcaciaBezierPathForInkPoints');
      expect(source).toContain('addBezierPath');
    }
  });

  it('guards stored drawing annotations without ink points before rendering or exporting', () => {
    const macCanvas = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfCanvasViewManager.mm'),
      'utf8',
    );
    const iosCanvas = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfCanvasViewManager.m'),
      'utf8',
    );
    const macBridge = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'PdfKitBridge.mm'),
      'utf8',
    );
    const iosBridge = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer', 'PdfKitBridge.m'),
      'utf8',
    );

    for (const source of [macCanvas, iosCanvas, macBridge, iosBridge]) {
      expect(source).toContain('id rawPoints = annotationInfo[@"points"];');
      expect(source).toContain('isKindOfClass:[NSArray class]');
      expect(source).toContain('AcaciaBezierPathForInkPoints(points, page)');
    }
  });

  it('brands and signs the iOS target as Acacia for TestFlight', () => {
    const infoPlist = readFileSync(path.join(appRoot, 'ios', 'PDFViewer', 'Info.plist'), 'utf8');
    const project = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer.xcodeproj', 'project.pbxproj'),
      'utf8',
    );

    expect(infoPlist).toContain('<string>Acacia</string>');
    expect(infoPlist).toContain('<key>ITSAppUsesNonExemptEncryption</key>');
    expect(infoPlist).not.toContain('NSLocationWhenInUseUsageDescription');
    expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.benebsworth.acacia;');
    expect(project).toContain('DEVELOPMENT_TEAM = WFTX6CN23F;');
    expect(project).toContain('PRODUCT_NAME = Acacia;');
  });

  it('includes complete local icon slots for iPhone, iPad, macOS, and App Store lists', () => {
    const iosIconSet = path.join(
      appRoot,
      'ios',
      'PDFViewer',
      'Images.xcassets',
      'AppIcon.appiconset',
    );
    const macIconSet = path.join(
      appRoot,
      'macos',
      'PDFViewer-macOS',
      'Assets.xcassets',
      'AppIcon.appiconset',
    );
    const iosContents = JSON.parse(readFileSync(path.join(iosIconSet, 'Contents.json'), 'utf8'));
    const macContents = JSON.parse(readFileSync(path.join(macIconSet, 'Contents.json'), 'utf8'));

    const iosSlots = new Set(
      iosContents.images.map(
        (image: {idiom: string; size: string; scale: string}) =>
          `${image.idiom}:${image.size}:${image.scale}`,
      ),
    );
    for (const slot of [
      'iphone:20x20:2x',
      'iphone:20x20:3x',
      'iphone:60x60:2x',
      'iphone:60x60:3x',
      'ipad:20x20:1x',
      'ipad:20x20:2x',
      'ipad:76x76:1x',
      'ipad:76x76:2x',
      'ipad:83.5x83.5:2x',
      'ios-marketing:1024x1024:1x',
    ]) {
      expect(iosSlots.has(slot)).toBe(true);
    }

    const macSlots = new Set(
      macContents.images.map(
        (image: {idiom: string; size: string; scale: string}) =>
          `${image.idiom}:${image.size}:${image.scale}`,
      ),
    );
    for (const slot of ['mac:16x16:1x', 'mac:32x32:2x', 'mac:512x512:2x']) {
      expect(macSlots.has(slot)).toBe(true);
    }

    for (const image of [...iosContents.images, ...macContents.images]) {
      const iconSet = image.idiom === 'mac' ? macIconSet : iosIconSet;
      expect(existsSync(path.join(iconSet, image.filename))).toBe(true);
    }
  });
});
