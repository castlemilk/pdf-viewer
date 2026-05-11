type DownloadLink = {
  label: string;
  href: string;
  detail: string;
};

type Feature = {
  title: string;
  body: string;
  tone: "violet" | "amber" | "blue" | "green";
  visual: "reader" | "annotate" | "edit" | "pages" | "secure" | "devices";
};

const downloads: DownloadLink[] = [
  {
    label: "Download Free",
    href: "/downloads/PaperView-mac-universal.dmg",
    detail: "Universal macOS installer",
  },
  {
    label: "Download for Apple Silicon",
    href: "/downloads/PaperView-arm64.dmg",
    detail: "M1, M2, M3, and M4 Macs",
  },
  {
    label: "Download for Intel Mac",
    href: "/downloads/PaperView-x64.dmg",
    detail: "Intel-based Mac models",
  },
];

const features: Feature[] = [
  {
    title: "Read. Smooth and clear.",
    body: "Enjoy a distraction-free reading experience with typography and smooth scrolling that feels right at home on Mac.",
    tone: "violet",
    visual: "reader",
  },
  {
    title: "Annotate with ease.",
    body: "Highlight, underline, strikethrough, and add notes. Every markup tool stays one click away.",
    tone: "amber",
    visual: "annotate",
  },
  {
    title: "Edit like a pro.",
    body: "Edit text, images, and pages in your PDFs without leaving the app.",
    tone: "blue",
    visual: "edit",
  },
  {
    title: "Organize pages.",
    body: "Reorder, delete, rotate, or extract pages without breaking your focus.",
    tone: "green",
    visual: "pages",
  },
  {
    title: "Keep it secure.",
    body: "Your documents stay private on your Mac. No uploads. No tracking.",
    tone: "violet",
    visual: "secure",
  },
  {
    title: "Work across devices.",
    body: "Sync with iCloud so your PDFs are available on all your Apple devices.",
    tone: "blue",
    visual: "devices",
  },
];

const testimonials = [
  {
    quote: "Finally, a PDF app that feels like it was built for Mac. Fast, beautiful, and packed with everything I need.",
    name: "Sarah J.",
    role: "Product Designer",
  },
  {
    quote: "PaperView has become my go-to PDF app. The annotation tools are incredibly intuitive.",
    name: "Michael T.",
    role: "Architect",
  },
  {
    quote: "Clean interface, syncs perfectly with iCloud, and best of all, my files stay private. Love it.",
    name: "Priya K.",
    role: "Student",
  },
];

const partnerLogos = ["PIXAR", "shopify", "Notion", "FRONT", "duolingo"];

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
      <a className="brand" href="/" aria-label="PaperView home">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span>PaperView</span>
      </a>
      <nav className="primary-nav" aria-label="Primary navigation">
        <a href="#features">Features</a>
        <a href="#whats-new">What's New</a>
        <a href="#security">Security</a>
        <a href="#pricing">Pricing</a>
        <a href="#support">Support</a>
      </nav>
      <div className="header-actions">
        <a className="login-link" href="/login">
          Log in
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
          Optimized for macOS Sonoma
        </p>
        <h1 id="hero-title">
          The PDF viewer <span>made for Mac.</span>
        </h1>
        <p className="hero-lede">
          PaperView is a fast, beautiful, and powerful PDF viewer for macOS. Read, annotate, edit, and organize your
          documents with ease.
        </p>
        <div className="hero-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="secondary-button" href="#features">
            See Features
          </a>
        </div>
        <ul className="hero-proof" aria-label="Product qualities">
          <li>Native macOS experience</li>
          <li>Lightning fast</li>
          <li>Private & Secure</li>
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
    <div className="product-preview" role="img" aria-label="PaperView app preview">
      <div className="mock-laptop">
        <div className="mock-screen">
          <div className="app-toolbar">
            <div className="traffic-lights" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="file-pill">Architecture_Proposal.pdf</div>
            <div className="toolbar-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="app-body">
            <aside className="page-rail" aria-hidden="true">
              {[1, 2, 3, 4].map((page) => (
                <span className={page === 1 ? "active" : ""} key={page}>
                  {page}
                </span>
              ))}
            </aside>
            <article className="pdf-page">
              <div className="pdf-copy">
                <p>Architecture</p>
                <strong>Proposal</strong>
                <span>A bold vision for sustainable design and modern living.</span>
                <em>Focus Here</em>
              </div>
              <div className="building-preview" aria-hidden="true">
                <span />
              </div>
              <div className="annotation-bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>
          </div>
        </div>
        <div className="laptop-base" aria-hidden="true" />
      </div>
    </div>
  );
}

function TrustedBy() {
  return (
    <section className="trusted-by" aria-label="Trusted by professionals">
      <p>Trusted by professionals at</p>
      <div className="logo-row">
        {partnerLogos.map((logo) => (
          <span key={logo}>{logo}</span>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="features-section" id="features" aria-labelledby="features-title">
      <p className="section-eyebrow">Powerful features. Beautifully simple.</p>
      <h2 id="features-title">Everything you need, right where you need it.</h2>
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
          <span>1 / 24</span>
          <div />
        </div>
      </div>
    );
  }

  if (visual === "annotate") {
    return (
      <div className="mini-visual annotate-visual" aria-hidden="true">
        <p>
          A bold vision for <mark>sustainable design</mark> and modern living.
        </p>
        <span>Focus Here</span>
      </div>
    );
  }

  if (visual === "edit") {
    return (
      <div className="mini-visual edit-visual" aria-hidden="true">
        <p>Our approach combines functionality, aesthetics, and sustainability to create spaces that inspire and endure.</p>
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
      <h2 id="testimonials-title">Loved by Mac users</h2>
      <div className="testimonial-grid">
        {testimonials.map((testimonial) => (
          <article className="testimonial-card" key={testimonial.name}>
            <blockquote>"{testimonial.quote}"</blockquote>
            <div className="person">
              <span aria-hidden="true">{testimonial.name.slice(0, 1)}</span>
              <p>
                <strong>{testimonial.name}</strong>
                {testimonial.role}
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
    </section>
  );
}

function DownloadPanel() {
  const [primaryDownload, appleSiliconDownload, intelDownload] = downloads;

  return (
    <section className="download-panel" id="pricing" aria-labelledby="download-title">
      <div className="download-icon" aria-hidden="true">
        <span />
      </div>
      <div className="download-copy">
        <h2 id="download-title">Ready to elevate your PDF experience?</h2>
        <p>Download PaperView for free and see the difference.</p>
        <div className="download-actions">
          <DownloadButton href={primaryDownload.href} label={primaryDownload.label} variant="dark" />
          <a className="secondary-button" href="#pricing">
            View Pricing
          </a>
        </div>
        <div className="download-options" aria-label="Platform downloads">
          <DownloadOption link={appleSiliconDownload} />
          <DownloadOption link={intelDownload} />
        </div>
      </div>
      <div className="rating-card" aria-label="macOS App Store rating 4.8 out of 5 from 18 thousand ratings">
        <span>macOS App Store</span>
        <strong>4.8 out of 5</strong>
        <p>5 stars</p>
        <small>18K+ Ratings</small>
      </div>
    </section>
  );
}

function DownloadOption({ link }: { link: DownloadLink }) {
  return (
    <a className="download-option" href={link.href} download="">
      <strong>{link.label}</strong>
      <span>{link.detail}</span>
    </a>
  );
}

function ValueStrip() {
  return (
    <section className="value-strip" id="whats-new" aria-label="PaperView benefits">
      <article>
        <strong>Universal App</strong>
        <span>Works on Intel & Apple Silicon</span>
      </article>
      <article>
        <strong>Shortcuts Support</strong>
        <span>Automate your workflow</span>
      </article>
      <article>
        <strong>Regular Updates</strong>
        <span>New features and improvements</span>
      </article>
      <article id="support">
        <strong>Dedicated Support</strong>
        <span>We're here to help</span>
      </article>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="brand" href="/" aria-label="PaperView home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>PaperView</span>
        </a>
        <p>The PDF viewer made for Mac.</p>
        <p>Fast, Powerful, Beautiful.</p>
      </div>
      <nav aria-label="Product links">
        <strong>Product</strong>
        <a href="#features">Features</a>
        <a href="#whats-new">What's New</a>
        <a href="#pricing">Pricing</a>
        <a href={downloads[0].href} download="">
          Download
        </a>
      </nav>
      <nav aria-label="Resource links">
        <strong>Resources</strong>
        <a href="#support">User Guide</a>
        <a href="#support">Shortcuts</a>
        <a href="#support">Support</a>
        <a href="#support">FAQ</a>
      </nav>
      <nav aria-label="Company links">
        <strong>Company</strong>
        <a href="#support">About</a>
        <a href="#support">Privacy</a>
        <a href="#support">Terms</a>
        <a href="mailto:support@paperview.app">Contact</a>
      </nav>
      <div className="footer-meta">
        <div className="social-links" aria-label="Social links">
          <a href="#support" aria-label="PaperView on X">
            X
          </a>
          <a href="#support" aria-label="PaperView on Instagram">
            IG
          </a>
          <a href="mailto:support@paperview.app" aria-label="Email PaperView">
            @
          </a>
        </div>
        <p>(c) 2026 PaperView Inc.</p>
        <p>All rights reserved.</p>
      </div>
    </footer>
  );
}
