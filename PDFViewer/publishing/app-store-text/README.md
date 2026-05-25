# App Store Text Upload

This folder is the local source for `npm run publish:appstore:text`.

The live App Store Connect localization is `en-AU`; keep metadata updates in `en-AU/` unless App Store Connect adds another localization. The upload script stages this source folder into Apple's required `up-<app id>/<platform>` layout automatically.

## Source Files

- `en-AU/description.txt`
- `en-AU/keywords.txt`
- `en-AU/marketingUrl.txt`
- `en-AU/name.txt`
- `en-AU/privacyPolicyUrl.txt`
- `en-AU/promotionalText.txt`
- `en-AU/subtitle.txt`
- `en-AU/supportUrl.txt`
- `en-AU/whatsNew.txt`
- `copyright.txt`

`whatsNew.txt` is kept as a draft by default. Apple may lock the field depending on version state, so it is only uploaded when `APP_STORE_TEXT_INCLUDE_WHATS_NEW=1`.

## Upload

```sh
VERSION=1.0.3 npm run publish:appstore:text
```

The upload script refuses to run while any text metadata file contains placeholder values.

## Accessibility Nutrition Labels

The App Store Connect accessibility URL and labels are managed separately from the text
upload because Apple exposes them through the App Store Connect API:

```sh
npm run publish:appstore:accessibility
```

By default this updates VoiceOver, Voice Control, Larger Text, Dark Interface,
Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion, Captions,
and Audio Descriptions support for `MAC`, `IPHONE`, and `IPAD`, and sets the
accessibility URL to `https://acacia-eta.vercel.app/accessibility.html`. It tries
to publish the declarations, but falls back to drafts when App Store Connect
blocks publishing before the app is available on the store.

Apple does not expose every label for every device family; the script omits
unsupported fields such as Larger Text on Mac.
