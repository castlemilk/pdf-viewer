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
  bundleId: "com.benebsworth.acacia",
  version: import.meta.env.VITE_DOWNLOAD_VERSION ?? "0.0.1",
  href: import.meta.env.VITE_DOWNLOAD_URL ?? "/downloads/Acacia-0.0.1.dmg",
  checksum: import.meta.env.VITE_DOWNLOAD_SHA256 ?? "pending release checksum",
  size: import.meta.env.VITE_DOWNLOAD_SIZE ?? "9.1 MB",
  manifestHref: import.meta.env.VITE_DOWNLOAD_MANIFEST_URL ?? "/downloads/Acacia-0.0.1.manifest.json",
  checksumHref: import.meta.env.VITE_DOWNLOAD_CHECKSUM_URL ?? "/downloads/Acacia-0.0.1.dmg.sha256",
};

const logoSrc = "/logo.png";
const heroScreenshot = "/screenshots/library.png";
const annotationScreenshot = "/screenshots/annotations.png";
const supportUrl = "/support.html";
const privacyUrl = "/privacy.html";
const accessibilityUrl = "/accessibility.html";
const supportEmail = "support@benebsworth.com";
const appStoreUrl = "https://apps.apple.com/app/id6768526705";

const downloads: DownloadLink[] = [
  {
    label: "Download for Mac",
    href: release.href,
    detail: `Universal macOS DMG, ${release.size}`,
    download: true,
  },
  {
    label: "SHA-256 checksum",
    href: release.checksumHref,
    detail: "Verify the direct download",
  },
  {
    label: "Release manifest",
    href: release.manifestHref,
    detail: "Version and notarization metadata",
  },
];

const resourceLinks: ResourceLink[] = [
  {
    label: "App Store",
    href: appStoreUrl,
    detail: "Apple platform listing",
  },
  {
    label: "Checksum",
    href: release.checksumHref,
    detail: "Verify the DMG",
  },
  {
    label: "Manifest",
    href: release.manifestHref,
    detail: "Release metadata",
  },
  {
    label: "Support",
    href: supportUrl,
    detail: "Help and contact",
  },
  {
    label: "Privacy",
    href: privacyUrl,
    detail: "Local-first policy",
  },
  {
    label: "Accessibility",
    href: accessibilityUrl,
    detail: "Keyboard and assistive tech notes",
  },
];

const features: Feature[] = [
  {
    kicker: "Library",
    title: "A quiet home for working documents.",
    body: "Recents, tags, collections, favorites, inbox items, and reading progress sit in one local Mac workspace.",
  },
  {
    kicker: "Markup",
    title: "Highlights, notes, and signatures stay precise.",
    body: "Use native PDF rendering with color highlights, comments, bookmarks, and signature placement designed for real review work.",
  },
  {
    kicker: "Handoff",
    title: "Export the useful version.",
    body: "Create annotated copies, page images, text, or Markdown when a report needs to leave your desk.",
  },
  {
    kicker: "Compare",
    title: "Inspect versions without losing place.",
    body: "Compare PDFs side by side with synced navigation so contracts, research drafts, and reports are easier to check.",
  },
];

const workflowItems = [
  "Original PDFs stay untouched while annotations live as local sidecar data.",
  "Search, highlights, notes, and page context stay visible while reviewing long documents.",
  "No account is required for the core workflow, and private files are not uploaded.",
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
        <a href="#features">Features</a>
        <a href="#workflow">Workflow</a>
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
        <figcaption>Library view · local documents · sidecar notes</figcaption>
      </figure>
      <div className="hero-copy">
        <p className="section-eyebrow">ACACIA · PDF WORKSPACE FOR MAC</p>
        <h1 id="hero-title">Acacia for private PDF review.</h1>
        <p className="hero-lede">
          Read, mark up, organize, compare, and export professional PDFs without sending private files to a cloud
          service.
        </p>
        <div className="hero-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="button-secondary" href={appStoreUrl}>
            View App Store
          </a>
        </div>
        <ul className="hero-proof" aria-label="Acacia qualities">
          <li>Native PDFKit</li>
          <li>Sidecar annotations</li>
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

function Features() {
  return (
    <section className="features-section" id="features" aria-labelledby="features-title">
      <div className="section-heading">
        <p className="section-eyebrow">WHAT STAYS</p>
        <h2 id="features-title">The full review loop, stripped down.</h2>
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
        <img src={annotationScreenshot} alt="Acacia annotation view with highlighted PDF text and notes" width="2880" height="1800" loading="lazy" />
      </figure>
      <div className="workflow-copy">
        <p className="section-eyebrow">REVIEW MODE</p>
        <h2 id="workflow-title">Designed for quiet document work.</h2>
        <p>
          Acacia is for the PDFs that contain contracts, forecasts, research, invoices, and decisions. The interface
          keeps the document first and makes markup feel deliberate.
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
        <p>
          Version {release.version}. Signed and notarized for macOS, with checksum and manifest links for direct
          verification.
        </p>
      </div>
      <div className="download-stack">
        <div className="download-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="button-secondary" href={appStoreUrl}>
            App Store
          </a>
        </div>
        <p className="release-meta">
          {primaryDownload.detail} · {release.bundleId}
        </p>
        <div className="resource-grid" aria-label="Acacia launch resources">
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
      <p>Local-first PDF review for Mac.</p>
      <nav aria-label="Footer links">
        <a href={downloads[1].href}>Checksum</a>
        <a href={downloads[2].href}>Manifest</a>
        <a href={privacyUrl}>Privacy</a>
        <a href={accessibilityUrl}>Accessibility</a>
        <a href={`mailto:${supportEmail}`}>Contact</a>
      </nav>
      <p className="footer-meta">
        Release {release.version}. SHA-256: {release.checksum}
      </p>
    </footer>
  );
}
