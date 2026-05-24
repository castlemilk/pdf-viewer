# Acacia Publishing

## Direct Developer ID Distribution

Use this for local/web distribution outside the Mac App Store:

```sh
npm run publish:macos
```

This runs JS tests, TypeScript, XCTest, macOS UI e2e, builds a universal Release app, signs with Developer ID, notarizes with the local `brandbrain` notarytool profile, staples the DMG, verifies signatures, and launch-smoke-tests the mounted app.

Artifacts:

- `dist/macos/Acacia-<version>.dmg`
- `dist/macos/Acacia-<version>.zip`
- `dist/macos/Acacia-<version>.manifest.json`
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

Create or confirm the Apple Developer Bundle ID:

```sh
npm run publish:appstore:bundle-id
```

Current App Store export requirements:

- Local `Mac App Distribution` or `Apple Distribution` signing identity for team `WFTX6CN23F`.
- Local `Mac Installer Distribution` signing identity for team `WFTX6CN23F`.
- Or an App Store Connect API key with cloud signing permission, then run with `ALLOW_APP_STORE_CLOUD_SIGNING=1`.
- `APP_STORE_CONNECT_APP_ID` is needed for metadata upload and build status checks after the app exists in App Store Connect.

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

Run the Greenveil-style local rollout command:

```sh
npm run publish:appstore:rollout -- --version 1.0.3
```

This runs the local validation gate, confirms the Bundle ID, archives, uploads
to App Store Connect, then polls Apple processing. If `--build-number` is not
provided, it uses a timestamp build number. Useful options:

```sh
npm run publish:appstore:rollout -- --version 1.0.3 --build-number 202605221703
npm run publish:appstore:rollout -- --version 1.0.3 --skip-validation
npm run publish:appstore:rollout -- --version 1.0.3 --skip-archive --archive-path dist/app-store/Acacia-1.0.3-202605221703.xcarchive
npm run publish:appstore:rollout -- --version 1.0.3 --no-wait
```

Check build processing after upload:

```sh
APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:status
```

Wait for build processing after upload:

```sh
npm run publish:appstore:wait -- --version 1.0.3 --build-number 202605221703
```

Upload App Store text metadata after refreshing the local `en-AU` metadata:

```sh
VERSION=1.0.3 APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:text
```

Upload the macOS App Store screenshot set after refreshing the PNGs:

```sh
npm run publish:appstore:screenshots -- --version 1.0.3 --platform MAC_OS
```

Upload the iOS App Store screenshot sets after refreshing the PNGs:

```sh
npm run publish:appstore:screenshots -- --version 1.0.3 --platform IOS --locale en-AU --display-type APP_IPHONE_65 --screenshots-dir publishing/screenshots/ios/iphone-65
npm run publish:appstore:screenshots -- --version 1.0.3 --platform IOS --locale en-AU --display-type APP_IPHONE_67 --screenshots-dir publishing/screenshots/ios/iphone-67
npm run publish:appstore:screenshots -- --version 1.0.3 --platform IOS --locale en-AU --display-type APP_IPAD_PRO_3GEN_129 --screenshots-dir publishing/screenshots/ios/ipad-129
```

Render and upload the iOS App Preview videos:

```sh
cd ..
npm run video:render:store-previews
cd PDFViewer
npm run publish:appstore:previews -- --version 1.0.3 --platform IOS --locale en-AU --preview-type IPHONE_65 --previews-dir publishing/app-previews/iphone-65
npm run publish:appstore:previews -- --version 1.0.3 --platform IOS --locale en-AU --preview-type IPHONE_67 --previews-dir publishing/app-previews/iphone-67
npm run publish:appstore:previews -- --version 1.0.3 --platform IOS --locale en-AU --preview-type IPAD_PRO_3GEN_129 --previews-dir publishing/app-previews/ipad-129
```

## Screenshots

Screenshots are deterministic via launch state props:

```sh
npm run screenshots:publish
npm run screenshots:ios
```

The script captures:

- `publishing/screenshots/app-store/01-library.png`
- `publishing/screenshots/app-store/02-viewer-info.png`
- `publishing/screenshots/app-store/03-comments-annotations.png`
- `publishing/screenshots/app-store/04-compare-changes.png`
- `publishing/screenshots/ios/iphone-65/*.png`
- `publishing/screenshots/ios/iphone-67/*.png`
- `publishing/screenshots/ios/ipad-129/*.png`
- `publishing/app-previews/iphone-65/01-acacia-preview.mp4`
- `publishing/app-previews/iphone-67/01-acacia-preview.mp4`
- `publishing/app-previews/ipad-129/01-acacia-preview.mp4`

## Icon

Regenerate the macOS icon set:

```sh
npm run icon:macos
```
