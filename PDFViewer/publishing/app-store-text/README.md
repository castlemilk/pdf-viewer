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
