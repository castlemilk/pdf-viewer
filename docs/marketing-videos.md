# Acacia Marketing Videos

Remotion source lives in `remotion/` and renders two launch assets into `public/video/`.

## Outputs

- `public/video/acacia-launch-hero.mp4` - 12 second homepage cut, 1920 x 1080.
- `public/video/acacia-app-preview.mp4` - 30 second store and release post cut, 1920 x 1080.

## Commands

```bash
rtk npm run video:studio
rtk npm run video:render
```

`video:render` also strips silent audio tracks before publishing. If you only need to repeat the post-processing step:

```bash
rtk npm run video:strip-audio
```
