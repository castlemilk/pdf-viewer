# Acacia Marketing Videos

Remotion source lives in `remotion/` and renders launch assets into `public/video/` plus App Store preview assets into `PDFViewer/publishing/app-previews/`.

## Outputs

- `public/video/acacia-launch-hero.mp4` - 12 second homepage cut, 1920 x 1080.
- `public/video/acacia-app-preview.mp4` - 30 second store and release post cut, 1920 x 1080.
- `PDFViewer/publishing/app-previews/iphone-65/01-acacia-preview.mp4` - 16 second iPhone 6.5" App Preview, 886 x 1920.
- `PDFViewer/publishing/app-previews/iphone-67/01-acacia-preview.mp4` - 16 second iPhone 6.7" App Preview, 886 x 1920.
- `PDFViewer/publishing/app-previews/ipad-129/01-acacia-preview.mp4` - 16 second iPad 12.9"/13" App Preview, 1200 x 1600.

## Commands

```bash
rtk npm run video:studio
rtk npm run video:render
rtk npm run video:render:store-previews
```

`video:render` also strips silent audio tracks before publishing. If you only need to repeat the post-processing step:

```bash
rtk npm run video:strip-audio
```
