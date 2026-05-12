# App Store Text Upload

This folder is the local source for `xcrun altool --app-store-text`.

Before running `npm run publish:appstore:text`, download the live App Store Connect text once for the PDFViewer app and compare the generated file layout:

```sh
xcrun altool --app-store-text publishing/app-store-text-download \
  --download \
  --apple-id "$APP_STORE_CONNECT_APP_ID" \
  --bundle-short-version-string "$(node -p "require('./package.json').version")" \
  --platform macos \
  --api-key "$APP_STORE_CONNECT_API_KEY_ID" \
  --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
  --p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH"
```

Then copy this draft text into the downloaded structure and run:

```sh
npm run publish:appstore:text
```

The upload script refuses to run while any file contains `TBD`, `REPLACE_BEFORE_UPLOAD`, or `example.com`.
