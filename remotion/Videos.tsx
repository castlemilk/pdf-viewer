import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  paper: "#fffffb",
  surface: "#fafaf9",
  sunken: "#f4f3f1",
  hairline: "#ebeae7",
  ink: "#111110",
  ink2: "#2c2c2a",
  ink4: "#8a8a83",
  muted: "#686660",
  yellow: "#f3d66a",
  green: "#8bc29d",
  blue: "#a9bae8",
  rose: "#df9bb0",
};

const assets = {
  logo: "logo.png",
  library: "screenshots/library.png",
  viewer: "screenshots/viewer-info.png",
  annotations: "screenshots/annotations.png",
  compare: "screenshots/compare-changes.png",
};

const sans =
  "Geist, SF Pro Text, -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial, sans-serif";
const serif = "Source Serif 4, Iowan Old Style, Georgia, Times New Roman, serif";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const ease = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const fade = (frame: number, start: number, end: number) => ({
  opacity: ease(frame, start, end),
  transform: `translateY(${interpolate(ease(frame, start, end), [0, 1], [24, 0])}px)`,
});

type FramedScreenshotProps = {
  src: string;
  label: string;
  delay?: number;
  scale?: number;
  x?: number;
  y?: number;
};

const Background = () => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.paper,
      backgroundImage:
        "linear-gradient(rgba(17,17,16,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,16,0.04) 1px, transparent 1px)",
      backgroundSize: "120px 120px",
    }}
  />
);

const LogoRow = ({ compact = false }: { compact?: boolean }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? 16 : 22,
      color: colors.ink,
      fontFamily: sans,
      fontSize: compact ? 32 : 44,
      fontWeight: 760,
      letterSpacing: 0,
    }}
  >
    <Img src={staticFile(assets.logo)} style={{ width: compact ? 58 : 76, height: compact ? 58 : 76 }} />
    <span>Acacia</span>
  </div>
);

const FramedScreenshot = ({ src, label, delay = 0, scale = 1, x = 0, y = 0 }: FramedScreenshotProps) => {
  const frame = useCurrentFrame();
  const enter = ease(frame, delay, delay + 34);
  const drift = interpolate(frame, [delay, delay + 150], [0, -30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + drift,
        width: 1180 * scale,
        border: `1px solid ${colors.hairline}`,
        borderRadius: 22,
        background: "rgba(255,255,251,0.88)",
        padding: 12,
        boxShadow: "0 46px 120px rgba(17,17,16,0.18)",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [32, 0])}px) scale(${interpolate(
          enter,
          [0, 1],
          [0.975, 1],
        )})`,
        transformOrigin: "50% 50%",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          display: "block",
          width: "100%",
          borderRadius: 12,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 28,
          bottom: 28,
          padding: "11px 18px",
          border: `1px solid ${colors.hairline}`,
          borderRadius: 999,
          background: "rgba(255,255,251,0.94)",
          color: colors.ink4,
          fontFamily: sans,
          fontSize: 21 * scale,
          fontWeight: 650,
          boxShadow: "0 16px 38px rgba(17,17,16,0.12)",
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Tag = ({ children, color = colors.paper }: { children: string; color?: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: 46,
      padding: "0 20px",
      border: `1px solid ${colors.hairline}`,
      borderRadius: 999,
      background: color,
      color: colors.ink2,
      fontFamily: sans,
      fontSize: 22,
      fontWeight: 650,
    }}
  >
    {children}
  </span>
);

export const AcaciaLaunchHero = () => {
  const frame = useCurrentFrame();
  const titleIn = fade(frame, 16, 52);
  const copyIn = fade(frame, 42, 76);
  const tagsIn = fade(frame, 68, 104);
  const ctaIn = fade(frame, 128, 168);

  return (
    <AbsoluteFill style={{ color: colors.ink, overflow: "hidden" }}>
      <Background />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #fffffb 0%, rgba(255,255,251,0.94) 44%, rgba(255,255,251,0.2) 100%)",
        }}
      />
      <FramedScreenshot
        src={assets.library}
        label="Library · local documents · sidecar notes"
        delay={22}
        scale={0.92}
        x={760}
        y={164}
      />
      <div style={{ position: "absolute", left: 150, top: 118, ...fade(frame, 0, 28) }}>
        <LogoRow />
      </div>
      <div style={{ position: "absolute", left: 150, top: 256, width: 790 }}>
        <div
          style={{
            ...titleIn,
            color: colors.ink4,
            fontFamily: sans,
            fontSize: 22,
            fontWeight: 760,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          PDF workspace for Mac
        </div>
        <div
          style={{
            ...titleIn,
            marginTop: 28,
            color: colors.ink,
            fontFamily: serif,
            fontSize: 108,
            fontWeight: 720,
            lineHeight: 0.98,
            letterSpacing: 0,
          }}
        >
          Private PDF review.
        </div>
        <div
          style={{
            ...copyIn,
            marginTop: 34,
            width: 540,
            color: colors.muted,
            fontFamily: sans,
            fontSize: 32,
            fontWeight: 500,
            lineHeight: 1.45,
          }}
        >
          Read, mark up, organize, compare, and export professional documents without sending files to a cloud service.
        </div>
        <div style={{ ...tagsIn, display: "flex", gap: 16, marginTop: 46 }}>
          <Tag>Native PDFKit</Tag>
          <Tag>Sidecar notes</Tag>
          <Tag>No account required</Tag>
        </div>
      </div>
      <div
        style={{
          ...ctaIn,
          position: "absolute",
          left: 150,
          bottom: 122,
          display: "flex",
          alignItems: "center",
          gap: 22,
          color: colors.ink,
          fontFamily: sans,
          fontSize: 28,
          fontWeight: 760,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 62,
            padding: "0 28px",
            borderRadius: 10,
            color: colors.paper,
            background: colors.ink,
          }}
        >
          acacia-eta.vercel.app
        </span>
        <span style={{ color: colors.ink4, fontSize: 23 }}>Download for Mac · App Store</span>
      </div>
    </AbsoluteFill>
  );
};

type SceneProps = {
  start: number;
  end: number;
  title: string;
  body: string;
  screenshot: string;
  label: string;
  accent: string;
};

const PreviewScene = ({ start, end, title, body, screenshot, label, accent }: SceneProps) => {
  const frame = useCurrentFrame();
  const local = frame - start;
  const progress = clamp(local / (end - start));
  const sceneOpacity = Math.min(ease(frame, start, start + 22), 1 - ease(frame, end - 22, end));
  const zoom = interpolate(progress, [0, 1], [1, 1.055], { easing: Easing.inOut(Easing.sin) });
  const screenshotIn = fade(local, 8, 42);

  return (
    <Sequence from={start} durationInFrames={end - start}>
      <AbsoluteFill style={{ opacity: sceneOpacity }}>
        <div style={{ position: "absolute", left: 112, top: 94, ...fade(local, 0, 24) }}>
          <LogoRow compact />
        </div>
        <div
          style={{
            position: "absolute",
            left: 112,
            top: 210,
            width: 590,
            ...fade(local, 12, 44),
          }}
        >
          <div
            style={{
              color: colors.ink4,
              fontFamily: sans,
              fontSize: 20,
              fontWeight: 760,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          <div
            style={{
              marginTop: 26,
              color: colors.ink,
              fontFamily: serif,
              fontSize: 82,
              fontWeight: 720,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 30,
              color: colors.muted,
              fontFamily: sans,
              fontSize: 29,
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            {body}
          </div>
          <div
            style={{
              width: 118,
              height: 12,
              marginTop: 42,
              borderRadius: 999,
              background: accent,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 790,
            top: 142,
            width: 1010,
            padding: 10,
            border: `1px solid ${colors.hairline}`,
            borderRadius: 20,
            background: "rgba(255,255,251,0.9)",
            boxShadow: "0 46px 120px rgba(17,17,16,0.16)",
            opacity: screenshotIn.opacity,
            transform: `${screenshotIn.transform} scale(${zoom})`,
            transformOrigin: "50% 50%",
          }}
        >
          <Img src={staticFile(screenshot)} style={{ display: "block", width: "100%", borderRadius: 11 }} />
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};

export const AcaciaAppPreview = () => {
  const frame = useCurrentFrame();
  const endIn = ease(frame, 812, 850);

  return (
    <AbsoluteFill style={{ color: colors.ink, overflow: "hidden" }}>
      <Background />
      <PreviewScene
        start={0}
        end={218}
        title="Start from a calm local library."
        body="Tags, recents, collections, progress, and details stay visible without crowding the work."
        screenshot={assets.library}
        label="Library"
        accent={colors.yellow}
      />
      <PreviewScene
        start={210}
        end={428}
        title="Read long PDFs without losing context."
        body="Native PDF rendering, thumbnails, search, zoom, metadata, and page controls are built for sustained review."
        screenshot={assets.viewer}
        label="Viewer"
        accent={colors.blue}
      />
      <PreviewScene
        start={420}
        end={638}
        title="Mark up without touching originals."
        body="Highlights, notes, signatures, comments, and bookmarks are stored as local sidecar data."
        screenshot={assets.annotations}
        label="Annotations"
        accent={colors.green}
      />
      <PreviewScene
        start={630}
        end={812}
        title="Compare versions side by side."
        body="Synced navigation and a focused changes panel make contracts, reports, and drafts easier to inspect."
        screenshot={assets.compare}
        label="Compare"
        accent={colors.rose}
      />
      <AbsoluteFill
        style={{
          opacity: endIn,
          background: colors.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 34, transform: `scale(${0.96 + endIn * 0.04})` }}>
          <LogoRow />
          <div
            style={{
              width: 960,
              color: colors.ink,
              fontFamily: serif,
              fontSize: 94,
              fontWeight: 720,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            Acacia for private PDF review.
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 6,
            }}
          >
            <Tag color={colors.yellow}>Read</Tag>
            <Tag color={colors.green}>Annotate</Tag>
            <Tag color={colors.blue}>Compare</Tag>
            <Tag color={colors.rose}>Export</Tag>
          </div>
          <div
            style={{
              marginTop: 12,
              color: colors.ink4,
              fontFamily: sans,
              fontSize: 28,
              fontWeight: 650,
            }}
          >
            acacia-eta.vercel.app
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
