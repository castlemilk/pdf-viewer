type DownloadLink = {
  label: string;
  href: string;
  detail: string;
  download?: boolean;
};

type LaunchLink = {
  label: string;
  href: string;
  detail: string;
  tone: "dark" | "paper" | "sun";
  download?: boolean;
};

type Feature = {
  title: string;
  body: string;
  tone: "violet" | "amber" | "blue" | "green";
  visual: "reader" | "annotate" | "edit" | "pages" | "secure" | "devices";
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
    label: "Download Acacia",
    href: release.href,
    detail: `Universal macOS DMG, ${release.size}`,
    download: true,
  },
  {
    label: "SHA-256 checksum",
    href: release.checksumHref,
    detail: "Verify the downloaded DMG",
  },
  {
    label: "Release manifest",
    href: release.manifestHref,
    detail: "Version, bundle ID, and notarization metadata",
  },
];

const launchLinks: LaunchLink[] = [
  {
    label: "App Store",
    href: appStoreUrl,
    detail: "Public listing for Acacia on Apple platforms",
    tone: "dark",
  },
  {
    label: "Direct DMG",
    href: release.href,
    detail: `Signed Mac download, ${release.size}`,
    tone: "sun",
    download: true,
  },
  {
    label: "Support",
    href: supportUrl,
    detail: "Troubleshooting, contact, and release help",
    tone: "paper",
  },
  {
    label: "Privacy",
    href: privacyUrl,
    detail: "Local-first policy and Pro account details",
    tone: "paper",
  },
  {
    label: "Accessibility",
    href: accessibilityUrl,
    detail: "Keyboard, labels, and feedback channel",
    tone: "paper",
  },
  {
    label: "Checksum",
    href: release.checksumHref,
    detail: "SHA-256 verification for the DMG",
    tone: "paper",
  },
];

const features: Feature[] = [
  {
    title: "Organize a local PDF library.",
    body: "Keep documents, tags, collections, favorites, recents, and reading progress in a clean Mac workspace.",
    tone: "violet",
    visual: "pages",
  },
  {
    title: "Read with native PDFKit.",
    body: "Open real PDFs with thumbnails, page navigation, zoom, search, metadata, and a polished macOS viewer shell.",
    tone: "blue",
    visual: "reader",
  },
  {
    title: "Annotate without touching originals.",
    body: "Highlights, notes, comments, signatures, and bookmarks are stored as local sidecar metadata.",
    tone: "amber",
    visual: "annotate",
  },
  {
    title: "Export review-ready copies.",
    body: "Create annotated copies, page images, and extracted text when you need to share or archive work.",
    tone: "green",
    visual: "edit",
  },
  {
    title: "Compare versions side by side.",
    body: "Review two documents together with synced navigation and a changes panel for additions and edits.",
    tone: "blue",
    visual: "devices",
  },
  {
    title: "Private by default.",
    body: "No account, telemetry, or document upload. Acacia keeps your PDF workflow on your Mac.",
    tone: "violet",
    visual: "secure",
  },
];

const workflows = [
  {
    quote: "Review quarterly reports, contracts, invoices, and research without sending private files to a cloud service.",
    name: "Local-first review",
    role: "Built for private document work",
  },
  {
    quote: "Use comments and non-destructive annotations to mark up a document, then export a separate annotated copy.",
    name: "Sidecar annotations",
    role: "Original PDFs stay untouched",
  },
  {
    quote: "Open two versions together and keep navigation synced while you inspect text-level changes.",
    name: "Compare mode",
    role: "Fast version review",
  },
];

const audienceLabels = ["Reports", "Contracts", "Research", "Invoices", "Reference"];

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
        <LaunchLinks />
        <TrustedBy />
        <Features />
        <Testimonials />
        <DownloadPanel />
        <ValueStrip />
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
          <img src={logoSrc} alt="" />
        </span>
        <span>Acacia</span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a href="#features">Features</a>
        <a href="#links">Links</a>
        <a href="#whats-new">What's New</a>
        <a href={privacyUrl}>Privacy</a>
        <a href="#download">Download</a>
        <a href={supportUrl}>Support</a>
      </nav>
      <div className="header-actions">
        <a className="login-link" href="#bundle-id">
          Bundle ID
        </a>
        <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
      </div>
    </header>
  );
}

function Hero({ primaryDownload }: { primaryDownload: DownloadLink }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="sonoma-badge">
          <span className="sonoma-dot" aria-hidden="true" />
          Launch-ready links and assets
        </p>
        <h1 id="hero-title">
          Acacia <span>for private PDF work.</span>
        </h1>
        <p className="hero-lede">
          A focused PDF workspace for reading, annotating, organizing, exporting, and comparing professional documents
          without sending private files to a cloud service.
        </p>
        <div className="hero-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="secondary-button" href="#features">
            See Features
          </a>
        </div>
        <ul className="hero-proof" aria-label="Product qualities">
          <li>Universal macOS app</li>
          <li>Native PDFKit rendering</li>
          <li id="bundle-id">App ID: 6768526705</li>
        </ul>
      </div>
      <ProductPreview />
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
    <a className={`download-button download-button-${variant}`} href={href} download="">
      {label}
    </a>
  );
}

function ProductPreview() {
  return (
    <figure className="product-preview" aria-label="Acacia app preview">
      <div className="screenshot-stage">
        <img src={heroScreenshot} alt="Acacia library with PDF documents, reading progress, and document details" />
        <div className="floating-note floating-note-one">
          <strong>128 documents</strong>
          <span>Library, tags, recents, and review state in one local workspace.</span>
        </div>
        <div className="floating-note floating-note-two">
          <strong>Sidecar notes</strong>
          <span>Highlights and comments stay separate from original PDFs.</span>
        </div>
      </div>
    </figure>
  );
}

function LaunchLinks() {
  return (
    <section className="launch-links" id="links" aria-labelledby="links-title">
      <div className="links-copy">
        <p className="section-eyebrow">Launch kit</p>
        <h2 id="links-title">Every public Acacia link in one place.</h2>
      </div>
      <div className="links-grid">
        {launchLinks.map(link => (
          <a
            className={`launch-link launch-link-${link.tone}`}
            download={link.download ? "" : undefined}
            href={link.href}
            key={link.label}
          >
            <strong>{link.label}</strong>
            <span>{link.detail}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function TrustedBy() {
  return (
    <section className="trusted-by" aria-label="Built for professional PDFs">
      <p>Built for local-first document review</p>
      <div className="logo-row">
        {audienceLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="features-section" id="features" aria-labelledby="features-title">
      <p className="section-eyebrow">Native Mac workflow. Local-first storage.</p>
      <h2 id="features-title">Everything a serious PDF review flow needs.</h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <FeatureCard feature={feature} key={feature.title} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="feature-card" id={feature.visual === "secure" ? "security" : undefined}>
      <span className={`feature-mark feature-${feature.tone}`} aria-hidden="true" />
      <h3>{feature.title}</h3>
      <p>{feature.body}</p>
      <FeatureVisual visual={feature.visual} />
    </article>
  );
}

function FeatureVisual({ visual }: { visual: Feature["visual"] }) {
  if (visual === "reader") {
    return (
      <div className="mini-visual reader-visual" aria-hidden="true">
        <div className="reader-window">
          <span>8 / 32</span>
          <div />
        </div>
      </div>
    );
  }

  if (visual === "annotate") {
    return (
      <div className="mini-visual annotate-visual" aria-hidden="true">
        <p>
          The hybrid model has become <mark>the new standard</mark> for work.
        </p>
        <span>Add Note</span>
      </div>
    );
  }

  if (visual === "edit") {
    return (
      <div className="mini-visual edit-visual" aria-hidden="true">
        <p>Export annotated copies, selected page images, or extracted text without changing the source document.</p>
      </div>
    );
  }

  if (visual === "pages") {
    return (
      <div className="mini-visual pages-visual" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (visual === "secure") {
    return (
      <div className="mini-visual secure-visual" aria-hidden="true">
        <div className="shield">
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="mini-visual devices-visual" aria-hidden="true">
      <span className="device desktop" />
      <span className="device tablet" />
      <span className="device phone" />
    </div>
  );
}

function Testimonials() {
  return (
    <section className="testimonials-section" aria-labelledby="testimonials-title">
      <h2 id="testimonials-title">Built around real review workflows</h2>
      <div className="testimonial-grid">
        {workflows.map((workflow) => (
          <article className="testimonial-card" key={workflow.name}>
            <blockquote>"{workflow.quote}"</blockquote>
            <div className="person">
              <span aria-hidden="true">{workflow.name.slice(0, 1)}</span>
              <p>
                <strong>{workflow.name}</strong>
                {workflow.role}
              </p>
            </div>
          </article>
        ))}
      </div>
      <div className="carousel-dots" aria-hidden="true">
        <span />
        <span className="active" />
        <span />
        <span />
        <span />
      </div>
      <figure className="annotation-preview">
        <img src={annotationScreenshot} alt="Acacia annotation view with highlighted PDF text and notes" />
      </figure>
    </section>
  );
}

function DownloadPanel() {
  const [primaryDownload, checksumDownload, manifestDownload] = downloads;

  return (
    <section className="download-panel" id="download" aria-labelledby="download-title">
      <div className="download-icon" aria-hidden="true">
        <img src={logoSrc} alt="" />
      </div>
      <div className="download-copy">
        <h2 id="download-title">Download Acacia directly.</h2>
        <p>
          Version {release.version}. Signed with Developer ID, notarized by Apple, and distributed as a universal macOS
          DMG.
        </p>
        <div className="download-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="secondary-button" href={checksumDownload.href}>
            Verify Checksum
          </a>
        </div>
        <div className="download-options" aria-label="Release downloads">
          <DownloadOption link={primaryDownload} />
          <DownloadOption link={checksumDownload} />
          <DownloadOption link={manifestDownload} />
        </div>
      </div>
      <div className="rating-card" aria-label={`Acacia ${release.version} release metadata`}>
        <span>Release {release.version}</span>
        <strong>{release.size}</strong>
        <p>{release.bundleId}</p>
        <small>SHA-256: {release.checksum}</small>
      </div>
    </section>
  );
}

function DownloadOption({ link }: { link: DownloadLink }) {
  return (
    <a className="download-option" href={link.href} download={link.download ? "" : undefined}>
      <strong>{link.label}</strong>
      <span>{link.detail}</span>
    </a>
  );
}

function ValueStrip() {
  return (
    <section className="value-strip" id="whats-new" aria-label="Acacia benefits">
      <article>
        <strong>Universal App</strong>
        <span>Works on Intel and Apple Silicon</span>
      </article>
      <article>
        <strong>Offline First</strong>
        <span>No account or cloud sync required</span>
      </article>
      <article>
        <strong>Sidecar Data</strong>
        <span>Original PDFs stay untouched</span>
      </article>
      <article id="support">
        <strong>Direct Support</strong>
        <span>{supportEmail}</span>
      </article>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="brand" href="/" aria-label="Acacia home">
          <span className="brand-mark" aria-hidden="true">
            <img src={logoSrc} alt="" />
          </span>
          <span>Acacia</span>
        </a>
        <p>The local-first PDF workspace for Mac.</p>
        <p>Bundle ID: {release.bundleId}</p>
      </div>
      <nav aria-label="Product links">
        <strong>Product</strong>
        <a href="#features">Features</a>
        <a href="#links">Launch Links</a>
        <a href="#whats-new">What's New</a>
        <a href="#download">Download</a>
        <a href={appStoreUrl}>App Store</a>
        <a href={downloads[0].href} download="">
          Direct DMG
        </a>
      </nav>
      <nav aria-label="Resource links">
        <strong>Resources</strong>
        <a href={release.checksumHref}>Checksum</a>
        <a href={release.manifestHref}>Manifest</a>
        <a href={supportUrl}>Support</a>
        <a href={privacyUrl}>Privacy</a>
      </nav>
      <nav aria-label="Company links">
        <strong>Company</strong>
        <a href={supportUrl}>About</a>
        <a href={privacyUrl}>Privacy</a>
        <a href={accessibilityUrl}>Accessibility</a>
        <a href={`mailto:${supportEmail}`}>Contact</a>
      </nav>
      <div className="footer-meta">
        <div className="social-links" aria-label="Social links">
          <a href={supportUrl} aria-label="Acacia support">
            ?
          </a>
          <a href={privacyUrl} aria-label="Acacia privacy">
            P
          </a>
          <a href={`mailto:${supportEmail}`} aria-label="Email Acacia">
            @
          </a>
        </div>
        <p>(c) 2026 Acacia.</p>
        <p>All rights reserved.</p>
      </div>
    </footer>
  );
}
