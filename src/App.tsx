type DownloadLink = {
  label: string;
  href: string;
  detail: string;
  download?: boolean;
};

type ResourceLink = {
  label: string;
  href: string;
  detail: string;
  download?: boolean;
};

type Feature = {
  kicker: string;
  title: string;
  body: string;
};

const release = {
  appName: "Acacia",
  href:
    import.meta.env.VITE_DOWNLOAD_URL ??
    "https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-1.0.3.dmg",
  size: import.meta.env.VITE_DOWNLOAD_SIZE ?? "13 MB",
};

const logoSrc = "/logo.png";
const heroScreenshot = "/screenshots/library.png";
const annotationScreenshot = "/screenshots/annotations.png";
const launchVideo = "/video/acacia-launch-hero.mp4";
const previewVideo = "/video/acacia-app-preview.mp4";
const supportUrl = "/support.html";
const privacyUrl = "/privacy.html";
const accessibilityUrl = "/accessibility.html";
const supportEmail = "support@benebsworth.com";
const appStoreUrl = "https://apps.apple.com/app/id6768526705";

const downloads: DownloadLink[] = [
  {
    label: "Download for Mac",
    href: release.href,
    detail: `Mac download, ${release.size}`,
    download: true,
  },
];

const resourceLinks: ResourceLink[] = [
  {
    label: "App Store",
    href: appStoreUrl,
    detail: "Open Acacia on Apple",
  },
  {
    label: "Support",
    href: supportUrl,
    detail: "Get help with Acacia",
  },
  {
    label: "Privacy",
    href: privacyUrl,
    detail: "How documents are handled",
  },
];

const features: Feature[] = [
  {
    kicker: "Library",
    title: "A quiet home for working documents.",
    body: "Keep recent files, folders, tags, favorites, and reading progress in one calm place.",
  },
  {
    kicker: "Markup",
    title: "Mark the parts that matter.",
    body: "Highlight text, add notes, bookmark pages, and place signatures without fuss.",
  },
  {
    kicker: "Share",
    title: "Send a clean copy when you are done.",
    body: "Export the marked-up version when a report, brief, or contract needs to leave your desk.",
  },
  {
    kicker: "Compare",
    title: "Check versions side by side.",
    body: "Compare two PDFs without bouncing between windows or losing your place.",
  },
];

const workflowItems = [
  "Original PDFs stay unchanged while your notes remain easy to edit.",
  "Search, highlights, notes, and page context stay visible while you read.",
  "No account is required for everyday PDF review.",
];

export function App() {
  const primaryDownload = downloads[0];

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to Main Content
      </a>
      <Header primaryDownload={primaryDownload} />
      <main id="main-content" tabIndex={-1}>
        <Hero primaryDownload={primaryDownload} />
        <ProductVideo />
        <Features />
        <Workflow />
        <DownloadSection primaryDownload={primaryDownload} />
      </main>
      <Footer />
    </div>
  );
}

function Header({ primaryDownload }: { primaryDownload: DownloadLink }) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Acacia home">
        <span className="brand-mark" aria-hidden="true">
          <img src={logoSrc} alt="" width="42" height="42" />
        </span>
        <span>Acacia</span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a href="#video">Video</a>
        <a href="#features">Features</a>
        <a href="#workflow">How it works</a>
        <a href="#download">Download</a>
        <a href={supportUrl}>Support</a>
      </nav>
      <div className="header-actions">
        <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
      </div>
    </header>
  );
}

function Hero({ primaryDownload }: { primaryDownload: DownloadLink }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <figure className="hero-media" aria-label="Acacia library preview">
        <img src={heroScreenshot} alt="Acacia library showing PDF documents, reading progress, and document details" width="2880" height="1800" />
        <figcaption>Library view · documents · notes</figcaption>
      </figure>
      <div className="hero-copy">
        <p className="section-eyebrow">ACACIA · PDF REVIEW FOR MAC</p>
        <h1 id="hero-title">Acacia for private PDF review.</h1>
        <p className="hero-lede">
          Read, mark up, compare, and share PDFs while keeping your documents on your Mac.
        </p>
        <div className="hero-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="button-secondary" href={appStoreUrl}>
            View App Store
          </a>
        </div>
        <ul className="hero-proof" aria-label="Acacia qualities">
          <li>Read</li>
          <li>Mark up</li>
          <li>Keep private</li>
          <li>No account required</li>
        </ul>
      </div>
    </section>
  );
}

function DownloadButton({
  href,
  label,
  variant = "light",
}: {
  href: string;
  label: string;
  variant?: "dark" | "light";
}) {
  return (
    <a className={`button button-${variant}`} href={href} download="">
      {label}
    </a>
  );
}

function ProductVideo() {
  return (
    <section className="video-section" id="video" aria-labelledby="video-title">
      <div className="video-copy">
        <p className="section-eyebrow">VIDEO</p>
        <h2 id="video-title">Watch Acacia in use.</h2>
        <p>
          A quick look at reading, marking up, comparing, and sharing PDFs in Acacia.
        </p>
      </div>
      <div className="video-frame">
        <video
          aria-label="Acacia launch video"
          autoPlay
          controls
          loop
          muted
          playsInline
          poster={heroScreenshot}
          preload="metadata"
        >
          <source src={launchVideo} type="video/mp4" />
        </video>
      </div>
      <div className="video-links" aria-label="Acacia video links">
        <a href={launchVideo} download="">
          Short tour
          <span>12 seconds</span>
        </a>
        <a href={previewVideo} download="">
          Full preview
          <span>30 seconds</span>
        </a>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="features-section" id="features" aria-labelledby="features-title">
      <div className="section-heading">
        <p className="section-eyebrow">FEATURES</p>
        <h2 id="features-title">Everything you need to review a PDF.</h2>
      </div>
      <div className="feature-list">
        {features.map((feature, index) => (
          <article className="feature-row" key={feature.title}>
            <span className="feature-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p>{feature.kicker}</p>
              <h3>{feature.title}</h3>
            </div>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
      <figure className="workflow-preview">
        <img src={annotationScreenshot} alt="Acacia annotation view with highlighted PDF text and notes" width="2880" height="1800" />
      </figure>
      <div className="workflow-copy">
        <p className="section-eyebrow">FOCUS</p>
        <h2 id="workflow-title">Made for focused reading.</h2>
        <p>
          Acacia is for contracts, reports, research, invoices, and other PDFs that need careful attention. The
          document stays first, with the right tools close by.
        </p>
        <ul>
          {workflowItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DownloadSection({ primaryDownload }: { primaryDownload: DownloadLink }) {
  return (
    <section className="download-section" id="download" aria-labelledby="download-title">
      <div>
        <p className="section-eyebrow">GET ACACIA</p>
        <h2 id="download-title">Download the Mac app.</h2>
        <p>Download Acacia for Mac, or open the App Store listing.</p>
      </div>
      <div className="download-stack">
        <div className="download-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="button-secondary" href={appStoreUrl}>
            App Store
          </a>
        </div>
        <p className="release-meta">
          {primaryDownload.detail}
        </p>
        <div className="resource-grid" aria-label="Acacia links">
          {resourceLinks.map((link) => (
            <a className="resource-link" href={link.href} download={link.download ? "" : undefined} key={link.label}>
              <strong>{link.label}</strong>
              <span>{link.detail}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <a className="brand" href="/" aria-label="Acacia home">
        <span className="brand-mark" aria-hidden="true">
          <img src={logoSrc} alt="" width="42" height="42" />
        </span>
        <span>Acacia</span>
      </a>
      <p>Private PDF review for Mac.</p>
      <nav aria-label="Footer links">
        <a href={appStoreUrl}>App Store</a>
        <a href={privacyUrl}>Privacy</a>
        <a href={accessibilityUrl}>Accessibility</a>
        <a href={`mailto:${supportEmail}`}>Contact</a>
      </nav>
    </footer>
  );
}
