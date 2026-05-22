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
npm run publish:appstore:rollout -- --version 1.0
```

This runs the local validation gate, confirms the Bundle ID, archives, uploads
to App Store Connect, then polls Apple processing. If `--build-number` is not
provided, it uses a timestamp build number. Useful options:

```sh
npm run publish:appstore:rollout -- --version 1.0 --build-number 2
npm run publish:appstore:rollout -- --version 1.0 --skip-validation
npm run publish:appstore:rollout -- --version 1.0 --skip-archive --archive-path dist/app-store/Acacia-1.0-2.xcarchive
npm run publish:appstore:rollout -- --version 1.0 --no-wait
```

Check build processing after upload:

```sh
APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:status
```

Wait for build processing after upload:

```sh
npm run publish:appstore:wait -- --version 1.0 --build-number 2
```

Upload App Store text metadata after refreshing the local `en-AU` metadata:

```sh
APP_STORE_CONNECT_APP_ID=<apple-app-id> npm run publish:appstore:text
```

Upload the macOS App Store screenshot set after refreshing the PNGs:

```sh
npm run publish:appstore:screenshots -- --version 1.0.3 --platform MAC_OS
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
