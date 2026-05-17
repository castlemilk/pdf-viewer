declare const __dirname: string;
export {};
const {readFileSync} = require('fs');
const path = require('path');

describe('App Store CLI publishing pipeline', () => {
  const appRoot = path.join(__dirname, '..');

  it('exposes a Greenveil-style rollout command from package scripts', () => {
    const pkg = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));

    expect(pkg.scripts['publish:appstore:rollout']).toBe('scripts/rollout-app-store-local.sh');
    expect(pkg.scripts['publish:appstore:wait']).toBe('scripts/wait-app-store-build.sh');
    expect(pkg.scripts['publish:appstore:attach-build']).toBe(
      'scripts/attach-app-store-version-build.sh',
    );
    expect(pkg.scripts['publish:ios:appstore:attach-build']).toBe(
      'scripts/attach-app-store-version-build.sh --platform IOS',
    );
    expect(pkg.scripts['package:ios:appstore']).toBe('scripts/build-ios-app-store-archive.sh');
    expect(pkg.scripts['publish:testflight:internal']).toBe(
      'scripts/rollout-testflight-internal.sh',
    );
    expect(pkg.scripts['publish:ios:testflight:internal']).toBe(
      'scripts/rollout-testflight-internal.sh --platform IOS',
    );
  });

  it('defaults to the Acacia App Store Connect app id without importing another app id', () => {
    const loader = readFileSync(path.join(appRoot, 'scripts', 'load-apple-publishing-env.sh'), 'utf8');

    expect(loader).toContain('APP_STORE_CONNECT_APP_ID:-6768526705');
    expect(loader).toContain('/Users/benebsworth/projects/greenveil/.env');
    expect(loader).not.toContain('  APP_STORE_CONNECT_APP_ID \\');
  });

  it('builds, uploads, and waits from the rollout script without submitting for review', () => {
    const rollout = readFileSync(path.join(appRoot, 'scripts', 'rollout-app-store-local.sh'), 'utf8');

    expect(rollout).toContain('scripts/publish-app-store.sh "${BUILD_ARGS[@]}"');
    expect(rollout).toContain('scripts/build-app-store-archive.sh "${BUILD_ARGS[@]}"');
    expect(rollout).toContain('BUILD_ARGS+=("--upload")');
    expect(rollout).toContain('scripts/wait-app-store-build.sh "${WAIT_ARGS[@]}"');
    expect(rollout).toContain('scripts/attach-app-store-version-build.sh "${ATTACH_ARGS[@]}"');
    expect(rollout).toContain('--no-attach-build');
    expect(rollout).toContain('complete review metadata');
    expect(rollout).not.toContain('--submit-for-review');
  });

  it('attaches processed builds to App Store version rows for macOS and iOS', () => {
    const attachScript = readFileSync(
      path.join(appRoot, 'scripts', 'attach-app-store-version-build.sh'),
      'utf8',
    );

    expect(attachScript).toContain('PATCH "https://api.appstoreconnect.apple.com/v1/appStoreVersions/$VERSION_ID/relationships/build"');
    expect(attachScript).toContain('filter[preReleaseVersion.platform]=$PLATFORM');
    expect(attachScript).toContain('filter[platform]=$PLATFORM');
    expect(attachScript).toContain('attachedBuild: true');
    expect(attachScript).toContain('MAC_OS|IOS');
  });

  it('waits for App Store Connect processing with terminal success and failure states', () => {
    const waitScript = readFileSync(path.join(appRoot, 'scripts', 'wait-app-store-build.sh'), 'utf8');

    expect(waitScript).toContain('scripts/check-app-store-status.sh');
    expect(waitScript).toContain("node - \"$status_file\"");
    expect(waitScript).toContain('extract_status "$last_output"');
    expect(waitScript).toContain('VALID|COMPLETE|COMPLETED|SUCCESS|READY');
    expect(waitScript).toContain('FAILED|INVALID|REJECTED');
    expect(waitScript).toContain('APP_STORE_PROCESSING_ATTEMPTS');
    expect(waitScript).toContain('APP_STORE_PLATFORM');
  });

  it('checks App Store build processing by querying App Store Connect builds when no delivery id exists', () => {
    const statusScript = readFileSync(
      path.join(appRoot, 'scripts', 'check-app-store-status.sh'),
      'utf8',
    );

    expect(statusScript).toContain('https://api.appstoreconnect.apple.com/v1/builds');
    expect(statusScript).toContain('filter[app]=$APP_STORE_CONNECT_APP_ID');
    expect(statusScript).toContain('filter[version]=$BUILD_NUMBER');
    expect(statusScript).toContain('filter[preReleaseVersion.version]=$VERSION');
    expect(statusScript).toContain('filter[preReleaseVersion.platform]=$PLATFORM');
    expect(statusScript).toContain('APP_STORE_STATUS_USE_DELIVERY_ID');
    expect(statusScript).toContain('altool delivery status failed; falling back');
    expect(statusScript).toContain("source: 'app-store-connect-api'");
    expect(statusScript).toContain("processingState: matchingBuild?.processingState || 'WAITING'");
  });

  it('can export App Store archives through the signed-in Xcode account like Greenveil', () => {
    const buildScript = readFileSync(
      path.join(appRoot, 'scripts', 'build-app-store-archive.sh'),
      'utf8',
    );
    const keychainScript = readFileSync(
      path.join(appRoot, 'scripts', 'prepare-apple-build-keychain.sh'),
      'utf8',
    );
    const prereqsScript = readFileSync(
      path.join(appRoot, 'scripts', 'check-publishing-prereqs.sh'),
      'utf8',
    );

    expect(buildScript).toContain('APP_STORE_EXPORT_USE_XCODE_ACCOUNT');
    expect(buildScript).toContain('prepare-apple-build-keychain.sh');
    expect(buildScript).toContain('OTHER_CODE_SIGN_FLAGS=--keychain $APPLE_BUILD_KEYCHAIN_PATH');
    expect(buildScript).toContain('AUTHENTICATION_ARGS=()');
    expect(buildScript).toContain('Signing:');
    expect(buildScript).toContain('Xcode account');
    expect(buildScript).toContain('App Store Connect API key');
    expect(buildScript).toContain('repair_react_native_resource_bundles');
    expect(buildScript).toContain("-name '*.bundle'");
    expect(buildScript).toContain("codesign --remove-signature");
    expect(keychainScript).toContain('acacia-build.keychain-db');
    expect(keychainScript).toContain('acacia-build.keychain.password');
    expect(keychainScript).toContain('security unlock-keychain -p "$ACACIA_KEYCHAIN_PASSWORD"');
    expect(keychainScript).toContain('security set-key-partition-list -S apple-tool:,apple:,codesign:');
    expect(keychainScript).toContain('security list-keychains -d user -s "${keychains[@]}"');
    expect(keychainScript).toContain('refusing to continue because macOS would otherwise show a GUI keychain prompt');
    expect(prereqsScript).toContain('Mac App Store export will use the signed-in Xcode account.');
  });

  it('links the valid macOS build to an internal TestFlight group', () => {
    const testflightScript = readFileSync(
      path.join(appRoot, 'scripts', 'rollout-testflight-internal.mjs'),
      'utf8',
    );
    const testflightWrapper = readFileSync(
      path.join(appRoot, 'scripts', 'rollout-testflight-internal.sh'),
      'utf8',
    );

    expect(testflightWrapper).toContain('load-apple-publishing-env.sh');
    expect(testflightScript).toContain("filter[preReleaseVersion.platform]': config.platform");
    expect(testflightScript).toContain('--platform');
    expect(testflightScript).toContain('normalizePlatform');
    expect(testflightScript).toContain("'/betaGroups'");
    expect(testflightScript).toContain('/relationships/builds');
    expect(testflightScript).toContain('MISSING_EXPORT_COMPLIANCE');
    expect(testflightScript).toContain('usesNonExemptEncryption: false');
    expect(testflightScript).toContain('internalBuildState');
    expect(testflightScript).toContain('Acacia Internal');
    expect(testflightScript).toContain('testerAssignmentErrors');
    expect(testflightScript).toContain('--strict-testers');
    expect(testflightScript).toContain('APP_STORE_CONNECT_INTERNAL_TESTER_EMAILS');
  });

  it('can archive and upload an iOS App Store build through the signed-in Xcode account', () => {
    const iosBuildScript = readFileSync(
      path.join(appRoot, 'scripts', 'build-ios-app-store-archive.sh'),
      'utf8',
    );

    expect(iosBuildScript).toContain('generic/platform=iOS');
    expect(iosBuildScript).toContain('APP_STORE_EXPORT_USE_XCODE_ACCOUNT');
    expect(iosBuildScript).toContain('prepare-apple-build-keychain.sh');
    expect(iosBuildScript).toContain('OTHER_CODE_SIGN_FLAGS=--keychain $APPLE_BUILD_KEYCHAIN_PATH');
    expect(iosBuildScript).toContain('PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_ID');
    expect(iosBuildScript).toContain("platform: 'IOS'");
    expect(iosBuildScript).toContain('Acacia-iOS-${VERSION}-${BUILD_NUMBER}.xcarchive');
  });
});
