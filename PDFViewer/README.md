# PDFViewer

macOS-only PDF viewer prototype built with React Native macOS for the product shell and native PDFKit bindings for document work.

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
```

`e2e:macos` runs XCTest UI/e2e coverage against the macOS app. macOS may require Accessibility/Automation permission for Xcode or the terminal before UI automation can drive the app. `macos:ui-build` is useful for validating that the UI test bundle compiles even when the current machine cannot grant automation.

## Local Publishing

```sh
npm run publish:local
```

The local publish gate runs Jest, TypeScript, native XCTest, macOS UI e2e tests, then packages a Release app into `dist/macos/PDFViewer.app` and `dist/macos/PDFViewer-macOS-Release.zip` with a SHA-256 checksum.

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

- `PDFViewer-<version>.dmg`
- `PDFViewer-<version>.zip`
- SHA-256 checksum files
- `PDFViewer-<version>.manifest.json`

Useful overrides:

```sh
VERSION=0.1.0 BUILD_NUMBER=12 npm run publish:macos
NOTARY_PROFILE=brandbrain npm run publish:macos
SKIP_NOTARIZATION=1 npm run package:macos:dmg
ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES npm run package:macos:dmg
```
