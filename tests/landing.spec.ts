import { expect, test } from "@playwright/test";

test("presents a focused Acacia landing page with direct download links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("Acacia");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/logo.png");
  await expect(page.locator('img[src="/logo.png"]')).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Acacia for private PDF review." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "See the review loop in motion." })).toBeVisible();
  await expect(page.getByText("ACACIA · PDF WORKSPACE FOR MAC")).toBeVisible();
  await expect(page.getByText("Launch-ready links and assets")).toHaveCount(0);
  await expect(page.getByText("Every public Acacia link in one place.")).toHaveCount(0);

  const primaryDownloadLinks = page.getByRole("link", { name: /download for mac/i });
  await expect(primaryDownloadLinks.first()).toHaveAttribute(
    "href",
    "https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-0.0.1.dmg",
  );
  await expect(primaryDownloadLinks.first()).toHaveAttribute("download", "");

  await expect(page.getByRole("link", { name: "View App Store" })).toHaveAttribute(
    "href",
    "https://apps.apple.com/app/id6768526705",
  );
  await expect(page.getByRole("link", { name: "App Store" }).last()).toHaveAttribute(
    "href",
    "https://apps.apple.com/app/id6768526705",
  );

  await expect(page.getByRole("link", { name: "Checksum Verify the DMG" })).toHaveAttribute(
    "href",
    "https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-0.0.1.dmg.sha256",
  );
  await expect(page.getByRole("link", { name: "Manifest Release metadata" })).toHaveAttribute(
    "href",
    "https://storage.googleapis.com/acacia-496104-downloads/downloads/Acacia-0.0.1.manifest.json",
  );
});

test("publishes Remotion video assets on the landing page", async ({ page }) => {
  await page.goto("/");

  const launchVideo = page.getByLabel("Acacia launch video");
  await expect(launchVideo).toBeVisible();
  await expect(page.locator('video[aria-label="Acacia launch video"] source')).toHaveAttribute(
    "src",
    "/video/acacia-launch-hero.mp4",
  );
  await expect(page.getByRole("link", { name: "Launch Hero 8 seconds · 1920 x 1080" })).toHaveAttribute(
    "href",
    "/video/acacia-launch-hero.mp4",
  );
  await expect(page.getByRole("link", { name: "App Preview 30 seconds · 1920 x 1080" })).toHaveAttribute(
    "href",
    "/video/acacia-app-preview.mp4",
  );
});

test("keeps only the core product sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "See the review loop in motion." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The full review loop, stripped down." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Designed for quiet document work." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Download the Mac app." })).toBeVisible();

  const expectedFeatures = [
    "A quiet home for working documents.",
    "Highlights, notes, and signatures stay precise.",
    "Export the useful version.",
    "Inspect versions without losing place.",
  ];

  for (const feature of expectedFeatures) {
    await expect(page.getByRole("heading", { name: feature })).toBeVisible();
  }
});

test("keeps the landing page usable on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Acacia for private PDF review." })).toBeVisible();
  await expect(page.getByLabel("Acacia library preview")).toBeVisible();
  await expect(page.getByRole("link", { name: /download for mac/i }).first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("supports keyboard users and points navigation at real landing sections", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to Main Content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute("href", "#main-content");

  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  if ((page.viewportSize()?.width ?? 0) > 760) {
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Video" })).toHaveAttribute(
      "href",
      "#video",
    );
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "#features",
    );
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Workflow" })).toHaveAttribute(
      "href",
      "#workflow",
    );
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "#download",
    );
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "/support.html",
    );
  }
  await expect(page.getByLabel("Footer links").getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/privacy.html",
  );
  await expect(page.getByLabel("Footer links").getByRole("link", { name: "Contact" })).toHaveAttribute(
    "href",
    "mailto:support@benebsworth.com",
  );
});

test("publishes support, privacy, and accessibility pages for App Store metadata", async ({ page }) => {
  await page.goto("/support.html");
  await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@benebsworth.com" }).first()).toHaveAttribute(
    "href",
    "mailto:support@benebsworth.com",
  );

  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("does not upload the PDF documents")).toBeVisible();

  await page.goto("/accessibility.html");
  await expect(page.getByRole("heading", { name: "Accessibility" })).toBeVisible();
  await expect(page.getByText("labelled controls")).toBeVisible();
});
