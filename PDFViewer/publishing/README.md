# PDFViewer Publishing

## Direct Developer ID Distribution

Use this for local/web distribution outside the Mac App Store:

```sh
npm run publish:macos
```

This runs JS tests, TypeScript, XCTest, macOS UI e2e, builds a universal Release app, signs with Developer ID, notarizes with the local `brandbrain` notarytool profile, staples the DMG, verifies signatures, and launch-smoke-tests the mounted app.

Artifacts:

- `dist/macos/PDFViewer-<version>.dmg`
- `dist/macos/PDFViewer-<version>.zip`
- `dist/macos/PDFViewer-<version>.manifest.json`
- SHA-256 files beside each artifact

## Mac App Store

Configure credentials locally:

```sh
cp .env.apple.example .env.apple
```

The scripts also load the shared Apple API credential values from `/Users/benebsworth/projects/greenveil/.env` when local values are missing, but they do not import that app's App Store app id.

Check credentials and local signing:

```sh
npm run publish:prereqs
```

Build an App Store archive without upload:

```sh
npm run package:appstore
```

Run the full validation gate and create the App Store archive:

```sh
npm run publish:appstore
```

Upload the archive to App Store Connect only when ready:

```sh
npm run publish:appstore -- --upload
```

Check build processing after upload:

```sh
APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:status
```

Upload App Store text metadata after replacing support and marketing URLs:

```sh
APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:text
```

## Screenshots

Screenshots are deterministic via launch state props:

```sh
npm run screenshots:publish
```

The script captures:

- `publishing/screenshots/app-store/01-library.png`
- `publishing/screenshots/app-store/02-viewer-info.png`
- `publishing/screenshots/app-store/03-comments-annotations.png`
- `publishing/screenshots/app-store/04-compare-changes.png`

## Icon

Regenerate the macOS icon set:

```sh
npm run icon:macos
```
