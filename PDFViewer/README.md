# Acacia

Local-first PDF viewer prototype built with React Native for the product shell and native PDFKit bindings for document work on macOS and iOS.

## Local Development

```sh
npm install
npm start
npm run macos:build
```

## Validation

```sh
npm test -- --runInBand
npm run typecheck
npm run macos:test
npm run macos:ui-build
npm run e2e:macos
npm run e2e:ios
```

`e2e:macos` runs XCTest UI/e2e coverage against the macOS app. macOS may require Accessibility/Automation permission for Xcode or the terminal before UI automation can drive the app. `macos:ui-build` is useful for validating that the UI test bundle compiles even when the current machine cannot grant automation.

`e2e:ios` runs XCTest UI/e2e coverage against a booted iOS Simulator when available. It opens a document, changes pages, zooms, adds a highlight, and verifies the highlight appears in the comments panel.

## Local Publishing

```sh
npm run publish:local
```

The local publish gate runs Jest, TypeScript, native XCTest, macOS UI e2e tests, then packages a Release app into `dist/macos/Acacia.app` and `dist/macos/Acacia-macOS-Release.zip` with a SHA-256 checksum.

To package without UI automation in constrained environments:

```sh
SKIP_E2E=1 npm run publish:local
```

To only build the local artifact:

```sh
npm run package:macos
```

Local packaging defaults to the current Mac architecture for speed. To produce a universal artifact locally:

```sh
ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO npm run package:macos
```

## Developer ID Publishing

```sh
npm run publish:macos
```

The Developer ID publish gate runs lint, Jest, TypeScript, native XCTest, macOS UI e2e, builds a universal Release app, signs it with the local Developer ID Application certificate, notarizes with the local `brandbrain` notarytool keychain profile, staples the DMG, mounts it, verifies Team ID/bundle ID/hardened runtime/entitlements, and launch-smoke-tests the app.

Artifacts are written to `dist/macos/`:

- `Acacia-<version>.dmg`
- `Acacia-<version>.zip`
- SHA-256 checksum files
- `Acacia-<version>.manifest.json`

Useful overrides:

```sh
VERSION=0.1.0 BUILD_NUMBER=12 npm run publish:macos
NOTARY_PROFILE=brandbrain npm run publish:macos
SKIP_NOTARIZATION=1 npm run package:macos:dmg
ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES npm run package:macos:dmg
```

## App Store Connect Publishing

Use the signed-in Xcode account path from this Mac:

```sh
APP_STORE_EXPORT_USE_XCODE_ACCOUNT=1 npm run publish:appstore:rollout -- --version 1.0
```

That command validates, archives, uploads to App Store Connect, and waits for Apple processing. It does not submit for App Review.

If UI automation is not enabled yet, run this once and then rerun the rollout without `SKIP_E2E`:

```sh
sudo xcrun automationmodetool enable-automationmode-without-authentication
```

To check an uploaded build directly:

```sh
VERSION=1.0 BUILD_NUMBER=<build> npm run publish:appstore:status
npm run publish:appstore:wait -- --version 1.0 --build-number <build>
```
