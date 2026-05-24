# Acacia Screenshots

Captured on 2026-05-20 from a Release app build produced for screenshot capture.

All App Store screenshots are PNG files at 2880 x 1800, matching Apple's current Mac screenshot specification.

iOS screenshot sets are captured from simulators with Apple's required App Store sizes:

- `ios/iphone-65/` - 1284 x 2778, iPhone 6.5" display
- `ios/iphone-67/` - 1290 x 2796, iPhone 6.7" display
- `ios/ipad-129/` - 2064 x 2752, iPad Pro 12.9" / 13" display

## Files

- app-store/01-library.png - library, tags, collections, recent documents, inspector
- app-store/02-viewer-info.png - native PDF viewer, thumbnails, metadata, quick actions
- app-store/03-comments-annotations.png - comments panel and non-destructive highlight
- app-store/04-compare-changes.png - side-by-side compare mode and changes panel

## Recapture Command Summary

The screenshots were captured by launching `.build-release/Acacia.app --uitesting`, positioning the window to 1440 x 900 points on a Retina display, and capturing a 1440 x 900 point region. The resulting PNGs are 2880 x 1800 pixels.

iOS screenshots are captured with:

```bash
npm run screenshots:ios
```
