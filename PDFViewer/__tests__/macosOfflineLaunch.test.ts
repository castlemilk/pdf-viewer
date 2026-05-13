declare const __dirname: string;
export {};
const {readFileSync} = require('fs');
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
    expect(e2eScript).toContain('TEST_TARGET_NAME="Acacia-macOS"');
  });

  it('declares export compliance in the macOS Info.plist for TestFlight', () => {
    const infoPlist = readFileSync(
      path.join(appRoot, 'macos', 'PDFViewer-macOS', 'Info.plist'),
      'utf8',
    );

    expect(infoPlist).toContain('<key>ITSAppUsesNonExemptEncryption</key>');
    expect(infoPlist).toContain('<false/>');
  });

  it('brands and signs the iOS target as Acacia for TestFlight', () => {
    const infoPlist = readFileSync(path.join(appRoot, 'ios', 'PDFViewer', 'Info.plist'), 'utf8');
    const project = readFileSync(
      path.join(appRoot, 'ios', 'PDFViewer.xcodeproj', 'project.pbxproj'),
      'utf8',
    );

    expect(infoPlist).toContain('<string>Acacia</string>');
    expect(infoPlist).toContain('<key>ITSAppUsesNonExemptEncryption</key>');
    expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.benebsworth.acacia;');
    expect(project).toContain('DEVELOPMENT_TEAM = WFTX6CN23F;');
    expect(project).toContain('PRODUCT_NAME = Acacia;');
  });
});
