import type { ReactNode } from "react";
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
  charcoal: "#2c2c2a",
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

const fadeOut = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

const sceneOpacity = (frame: number, start: number, end: number, fadeFrames = 18) =>
  Math.min(ease(frame, start, start + fadeFrames), fadeOut(frame, end - fadeFrames, end));

const rise = (frame: number, start: number, end: number, amount = 34) => ({
  opacity: ease(frame, start, end),
  transform: `translateY(${interpolate(ease(frame, start, end), [0, 1], [amount, 0])}px)`,
});

const cropFrom = (x: number, y: number) => `${x}% ${y}%`;

const Background = () => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.paper,
      backgroundImage:
        "linear-gradient(rgba(17,17,16,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,16,0.045) 1px, transparent 1px)",
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

const MacDots = () => (
  <div style={{ display: "flex", gap: 12 }}>
    {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
      <span key={color} style={{ width: 14, height: 14, borderRadius: 999, background: color }} />
    ))}
  </div>
);

const Tag = ({ children, color = colors.paper }: { children: string; color?: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 46,
      padding: "0 20px",
      border: `1px solid ${colors.hairline}`,
      borderRadius: 999,
      background: color,
      color: colors.ink2,
      fontFamily: sans,
      fontSize: 22,
      fontWeight: 650,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

type ScreenshotWindowProps = {
  src: string;
  width: number;
  x: number;
  y: number;
  frame: number;
  start: number;
  end?: number;
  label?: string;
  crop?: string;
  imageScale?: number;
  lift?: number;
};

const ScreenshotWindow = ({
  src,
  width,
  x,
  y,
  frame,
  start,
  end,
  label,
  crop = "50% 50%",
  imageScale = 1,
  lift = 32,
}: ScreenshotWindowProps) => {
  const opacity = end === undefined ? ease(frame, start, start + 24) : sceneOpacity(frame, start, end);
  const enter = ease(frame, start, start + 32);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        border: `1px solid ${colors.hairline}`,
        borderRadius: 24,
        overflow: "hidden",
        background: "rgba(255,255,251,0.94)",
        boxShadow: "0 48px 130px rgba(17,17,16,0.18)",
        opacity,
        transform: `translateY(${interpolate(enter, [0, 1], [lift, 0])}px) scale(${interpolate(
          enter,
          [0, 1],
          [0.975, 1],
        )})`,
      }}
    >
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: `1px solid ${colors.hairline}`,
          background: "rgba(255,255,251,0.92)",
        }}
      >
        <MacDots />
        <span
          style={{
            color: colors.ink4,
            fontFamily: sans,
            fontSize: 18,
            fontWeight: 650,
          }}
        >
          {label ?? "Acacia"}
        </span>
      </div>
      <div
        style={{
          height: (width / 16) * 10,
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: crop,
            transform: `scale(${imageScale})`,
            transformOrigin: "50% 50%",
          }}
        />
      </div>
    </div>
  );
};

const Callout = ({
  frame,
  start,
  end,
  x,
  y,
  title,
  detail,
  accent,
  compact = false,
}: {
  frame: number;
  start: number;
  end: number;
  x: number;
  y: number;
  title: string;
  detail?: string;
  accent: string;
  compact?: boolean;
}) => {
  const opacity = sceneOpacity(frame, start, end, 12);
  const enter = ease(frame, start, start + 18);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        maxWidth: compact ? 288 : 390,
        padding: compact ? "15px 18px" : "18px 22px",
        border: `1px solid ${colors.hairline}`,
        borderRadius: 12,
        background: "rgba(255,255,251,0.96)",
        boxShadow: "0 20px 60px rgba(17,17,16,0.13)",
        opacity,
        transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: accent }} />
        <span
          style={{
            color: colors.ink,
            fontFamily: sans,
            fontSize: compact ? 20 : 23,
            fontWeight: 760,
            lineHeight: 1.15,
          }}
        >
          {title}
        </span>
      </div>
      {detail ? (
        <p
          style={{
            margin: "9px 0 0 24px",
            color: colors.muted,
            fontFamily: sans,
            fontSize: compact ? 16 : 18,
            fontWeight: 560,
            lineHeight: 1.35,
          }}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
};

const Cursor = ({
  frame,
  start,
  end,
  from,
  to,
}: {
  frame: number;
  start: number;
  end: number;
  from: [number, number];
  to: [number, number];
}) => {
  const t = ease(frame, start, end);
  const x = interpolate(t, [0, 1], [from[0], to[0]]);
  const y = interpolate(t, [0, 1], [from[1], to[1]]);
  const pulse = Math.sin(frame * 0.28) * 0.08 + 1;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: sceneOpacity(frame, start, end + 36, 10),
        transform: `scale(${pulse})`,
      }}
    >
      <svg width="54" height="54" viewBox="0 0 54 54" fill="none">
        <path d="M12 8 40 31 27 33 20 46 12 8Z" fill={colors.ink} />
        <path d="M12 8 40 31 27 33 20 46 12 8Z" stroke={colors.paper} strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const TopBrand = ({ frame, compact = false }: { frame: number; compact?: boolean }) => (
  <div style={{ position: "absolute", left: compact ? 86 : 110, top: compact ? 72 : 88, ...rise(frame, 0, 24) }}>
    <LogoRow compact={compact} />
  </div>
);

type HeroBeat = {
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  body: string;
  screenshot: string;
  crop: string;
  accent: string;
  calls: Array<{ title: string; detail: string; x: number; y: number; delay: number }>;
};

const heroBeats: HeroBeat[] = [
  {
    start: 0,
    end: 96,
    eyebrow: "Local library",
    title: "Every PDF starts organized.",
    body: "Recents, tags, collections, reading progress, and document details stay in one quiet workspace.",
    screenshot: assets.library,
    crop: cropFrom(50, 48),
    accent: colors.yellow,
    calls: [
      { title: "Progress at a glance", detail: "Continue where the review stopped.", x: 1238, y: 730, delay: 42 },
      { title: "Local details", detail: "Metadata and tags without an account.", x: 1330, y: 214, delay: 58 },
    ],
  },
  {
    start: 86,
    end: 186,
    eyebrow: "Native viewer",
    title: "Read long documents without losing place.",
    body: "Search, page controls, outline, thumbnails, and metadata are always close to the document.",
    screenshot: assets.viewer,
    crop: cropFrom(50, 47),
    accent: colors.blue,
    calls: [
      { title: "Find in document", detail: "Matches stay connected to the page.", x: 1144, y: 184, delay: 34 },
      { title: "Outline and info", detail: "Context stays visible while reading.", x: 1330, y: 628, delay: 52 },
    ],
  },
  {
    start: 176,
    end: 276,
    eyebrow: "Markup",
    title: "Highlights and notes stay precise.",
    body: "Color highlights, comments, signatures, and bookmarks are stored beside the original PDF.",
    screenshot: assets.annotations,
    crop: cropFrom(48, 47),
    accent: colors.green,
    calls: [
      { title: "Color palette", detail: "Pick the right mark for the job.", x: 1240, y: 320, delay: 34 },
      { title: "Sidecar notes", detail: "Original files stay untouched.", x: 1324, y: 610, delay: 52 },
    ],
  },
  {
    start: 266,
    end: 360,
    eyebrow: "Compare and export",
    title: "Check versions, then send the useful copy.",
    body: "Compare revisions side by side and export annotated copies, page images, text, or Markdown.",
    screenshot: assets.compare,
    crop: cropFrom(50, 47),
    accent: colors.rose,
    calls: [
      { title: "Synced compare", detail: "Two versions without losing place.", x: 1170, y: 246, delay: 32 },
      { title: "Export options", detail: "Annotated PDF, images, text, Markdown.", x: 1290, y: 646, delay: 50 },
    ],
  },
];

const HeroCopy = ({ beat, frame }: { beat: HeroBeat; frame: number }) => {
  const opacity = sceneOpacity(frame, beat.start, beat.end, 16);
  const local = frame - beat.start;

  return (
    <div
      style={{
        position: "absolute",
        left: 118,
        top: 220,
        width: 590,
        opacity,
      }}
    >
      <div
        style={{
          ...rise(local, 0, 22, 22),
          color: colors.ink4,
          fontFamily: sans,
          fontSize: 22,
          fontWeight: 760,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {beat.eyebrow}
      </div>
      <div
        style={{
          ...rise(local, 8, 30, 28),
          marginTop: 28,
          color: colors.ink,
          fontFamily: serif,
          fontSize: 84,
          fontWeight: 720,
          lineHeight: 1.02,
        }}
      >
        {beat.title}
      </div>
      <p
        style={{
          ...rise(local, 18, 42, 30),
          margin: "30px 0 0",
          color: colors.muted,
          fontFamily: sans,
          fontSize: 29,
          fontWeight: 560,
          lineHeight: 1.48,
        }}
      >
        {beat.body}
      </p>
      <div style={{ ...rise(local, 36, 58, 18), display: "flex", gap: 14, marginTop: 42 }}>
        <Tag color={beat.accent}>Private</Tag>
        <Tag>Local-first</Tag>
        <Tag>No upload</Tag>
      </div>
    </div>
  );
};

export const AcaciaLaunchHero = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ color: colors.ink, overflow: "hidden" }}>
      <Background />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #fffffb 0%, rgba(255,255,251,0.98) 34%, rgba(255,255,251,0.54) 100%)",
        }}
      />
      <TopBrand frame={frame} />
      {heroBeats.map((beat) => (
        <div key={beat.eyebrow} style={{ position: "absolute", inset: 0, opacity: sceneOpacity(frame, beat.start, beat.end) }}>
          <HeroCopy beat={beat} frame={frame} />
          <ScreenshotWindow
            src={beat.screenshot}
            width={1100}
            x={760}
            y={144}
            frame={frame}
            start={beat.start + 10}
            end={beat.end}
            label={beat.eyebrow}
            crop={beat.crop}
            imageScale={1.04}
          />
          {beat.calls.map((call) => (
            <Callout
              key={call.title}
              frame={frame}
              start={beat.start + call.delay}
              end={beat.end}
              x={call.x}
              y={call.y}
              title={call.title}
              detail={call.detail}
              accent={beat.accent}
              compact
            />
          ))}
        </div>
      ))}
      <Cursor frame={frame} start={52} end={328} from={[1420, 198]} to={[1126, 740]} />
      <div
        style={{
          position: "absolute",
          left: 118,
          bottom: 72,
          display: "flex",
          alignItems: "center",
          gap: 20,
          ...rise(frame, 280, 320, 16),
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
            fontFamily: sans,
            fontSize: 27,
            fontWeight: 760,
          }}
        >
          acacia-eta.vercel.app
        </span>
        <span style={{ color: colors.ink4, fontFamily: sans, fontSize: 22, fontWeight: 650 }}>
          Download for Mac · App Store
        </span>
      </div>
    </AbsoluteFill>
  );
};

type ShowcaseSceneProps = {
  start: number;
  end: number;
  label: string;
  title: string;
  body: string;
  screenshot: string;
  accent: string;
  crop: string;
  callouts: Array<{ title: string; detail: string; x: number; y: number; delay: number }>;
  chips: string[];
  children?: ReactNode;
};

const Timeline = ({ frame }: { frame: number }) => {
  const progress = clamp(frame / 900);

  return (
    <div
      style={{
        position: "absolute",
        left: 116,
        right: 116,
        bottom: 64,
        height: 4,
        borderRadius: 999,
        background: colors.hairline,
      }}
    >
      <div
        style={{
          width: `${progress * 100}%`,
          height: "100%",
          borderRadius: 999,
          background: colors.ink,
        }}
      />
    </div>
  );
};

const ShowcaseScene = ({
  start,
  end,
  label,
  title,
  body,
  screenshot,
  accent,
  crop,
  callouts,
  chips,
  children,
}: ShowcaseSceneProps) => {
  const frame = useCurrentFrame();
  const local = frame - start;
  const opacity = sceneOpacity(frame, start, end);
  const pan = interpolate(clamp(local / Math.max(1, end - start)), [0, 1], [0, -26], {
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <Sequence from={start} durationInFrames={end - start}>
      <AbsoluteFill style={{ opacity }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, #fffffb 0%, #fffffb 31%, ${accent}22 100%)`,
          }}
        />
        <TopBrand frame={local} compact />
        <div style={{ position: "absolute", left: 112, top: 206, width: 610 }}>
          <div
            style={{
              ...rise(local, 0, 24, 22),
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
              ...rise(local, 10, 34, 28),
              marginTop: 24,
              color: colors.ink,
              fontFamily: serif,
              fontSize: 76,
              fontWeight: 720,
              lineHeight: 1.02,
            }}
          >
            {title}
          </div>
          <p
            style={{
              ...rise(local, 22, 46, 28),
              margin: "28px 0 0",
              color: colors.muted,
              fontFamily: sans,
              fontSize: 28,
              fontWeight: 560,
              lineHeight: 1.45,
            }}
          >
            {body}
          </p>
          <div style={{ ...rise(local, 42, 66, 22), display: "flex", flexWrap: "wrap", gap: 13, marginTop: 38 }}>
            {chips.map((chip, index) => (
              <Tag key={chip} color={index === 0 ? accent : colors.paper}>
                {chip}
              </Tag>
            ))}
          </div>
        </div>
        <div style={{ transform: `translateY(${pan}px)` }}>
          <ScreenshotWindow
            src={screenshot}
            width={1038}
            x={792}
            y={132}
            frame={local}
            start={8}
            label={label}
            crop={crop}
            imageScale={1.08}
            lift={24}
          />
        </div>
        {callouts.map((callout) => (
          <Callout
            key={callout.title}
            frame={local}
            start={callout.delay}
            end={end - start}
            x={callout.x}
            y={callout.y}
            title={callout.title}
            detail={callout.detail}
            accent={accent}
          />
        ))}
        {children}
      </AbsoluteFill>
    </Sequence>
  );
};

const FeatureRecap = ({ frame }: { frame: number }) => {
  const inFrame = frame - 780;
  const opacity = ease(frame, 780, 818);
  const items = [
    ["Read", "Native PDFKit with search, outline, thumbnails, and metadata."],
    ["Annotate", "Color highlights, comments, bookmarks, and signature placement."],
    ["Compare", "Side-by-side revision checks with focused navigation."],
    ["Export", "Annotated PDFs, page images, text, and Markdown."],
  ];

  return (
    <AbsoluteFill
      style={{
        opacity,
        background: colors.paper,
        display: "grid",
        gridTemplateColumns: "0.8fr 1fr",
        gap: 76,
        alignItems: "center",
        padding: "0 120px",
      }}
    >
      <div>
        <div style={rise(inFrame, 0, 24, 24)}>
          <LogoRow />
        </div>
        <h2
          style={{
            ...rise(inFrame, 14, 42, 28),
            margin: "64px 0 0",
            color: colors.ink,
            fontFamily: serif,
            fontSize: 96,
            fontWeight: 720,
            lineHeight: 1,
          }}
        >
          Private PDF review, end to end.
        </h2>
        <p
          style={{
            ...rise(inFrame, 34, 62, 24),
            margin: "34px 0 0",
            color: colors.muted,
            fontFamily: sans,
            fontSize: 30,
            fontWeight: 560,
            lineHeight: 1.45,
          }}
        >
          A calm Mac workspace for documents that should stay on your machine.
        </p>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {items.map(([title, detail], index) => (
          <div
            key={title}
            style={{
              ...rise(inFrame, 22 + index * 10, 52 + index * 10, 26),
              minHeight: 128,
              padding: "26px 30px",
              border: `1px solid ${colors.hairline}`,
              borderRadius: 14,
              background: index === 0 ? colors.yellow : index === 1 ? colors.green : index === 2 ? colors.blue : colors.rose,
            }}
          >
            <div style={{ color: colors.ink, fontFamily: sans, fontSize: 27, fontWeight: 800 }}>{title}</div>
            <div
              style={{
                marginTop: 10,
                color: colors.ink2,
                fontFamily: sans,
                fontSize: 21,
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {detail}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          bottom: 80,
          color: colors.ink4,
          fontFamily: sans,
          fontSize: 26,
          fontWeight: 650,
        }}
      >
        acacia-eta.vercel.app
      </div>
    </AbsoluteFill>
  );
};

export const AcaciaAppPreview = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cursorStart = 1.3 * fps;
  const cursorEnd = 26.4 * fps;

  return (
    <AbsoluteFill style={{ color: colors.ink, overflow: "hidden" }}>
      <Background />
      <ShowcaseScene
        start={0}
        end={190}
        label="Library"
        title="Bring every working PDF into view."
        body="Recents, collections, tags, reading progress, and document details stay visible without crowding the workspace."
        screenshot={assets.library}
        accent={colors.yellow}
        crop={cropFrom(50, 48)}
        chips={["Recents", "Tags", "Progress"]}
        callouts={[
          { title: "Continue reading", detail: "Progress follows each document.", x: 1080, y: 240, delay: 44 },
          { title: "Detail rail", detail: "Tags, metadata, and quick actions stay close.", x: 1326, y: 636, delay: 74 },
        ]}
      />
      <ShowcaseScene
        start={176}
        end={378}
        label="Viewer"
        title="Read without losing document context."
        body="Search, page controls, zoom, thumbnails, outline, and info panels are built around sustained review."
        screenshot={assets.viewer}
        accent={colors.blue}
        crop={cropFrom(50, 47)}
        chips={["Search", "Outline", "Metadata"]}
        callouts={[
          { title: "Search and page state", detail: "Find matches while keeping the page number visible.", x: 1078, y: 190, delay: 46 },
          { title: "Panels stay useful", detail: "Outline, notes, ask, and info stay one click away.", x: 1332, y: 610, delay: 82 },
        ]}
      />
      <ShowcaseScene
        start={364}
        end={574}
        label="Annotations"
        title="Mark the exact point, not the whole page."
        body="Color highlights, notes, signatures, comments, and bookmarks are stored locally beside the original PDF."
        screenshot={assets.annotations}
        accent={colors.green}
        crop={cropFrom(48, 47)}
        chips={["Highlights", "Notes", "Signatures"]}
        callouts={[
          { title: "Color palette", detail: "Use distinct colors for pull, risk, tone, and marks.", x: 1056, y: 272, delay: 48 },
          { title: "Sidecar comments", detail: "Notes and highlights remain editable without changing the source.", x: 1288, y: 590, delay: 88 },
        ]}
      />
      <ShowcaseScene
        start={560}
        end={790}
        label="Compare"
        title="Review changes before anything leaves your desk."
        body="Compare versions side by side, check page differences, then export the useful copy."
        screenshot={assets.compare}
        accent={colors.rose}
        crop={cropFrom(50, 47)}
        chips={["Compare", "Export", "Markdown"]}
        callouts={[
          { title: "Side-by-side review", detail: "Inspect revisions without bouncing between windows.", x: 1030, y: 216, delay: 52 },
          { title: "Export when ready", detail: "Annotated PDF, images, text, and Markdown outputs.", x: 1288, y: 642, delay: 90 },
        ]}
      />
      <Cursor frame={frame} start={cursorStart} end={cursorEnd} from={[1498, 198]} to={[1042, 734]} />
      <Timeline frame={frame} />
      <FeatureRecap frame={frame} />
    </AbsoluteFill>
  );
};
