import { expect, test } from "@playwright/test";

test("presents the Acacia landing page with direct download links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("Acacia");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/logo.png");
  await expect(page.locator('img[src="/logo.png"]')).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Acacia for Mac PDFs." })).toBeVisible();
  await expect(page.getByText("Signed and notarized for macOS")).toBeVisible();
  await expect(page.getByText("Bundle ID: com.benebsworth.acacia").first()).toBeVisible();

  const primaryDownloadLinks = page.getByRole("link", { name: /download acacia/i });
  await expect(primaryDownloadLinks.first()).toHaveAttribute("href", "/downloads/Acacia-0.0.1.dmg");
  await expect(primaryDownloadLinks.first()).toHaveAttribute("download", "");

  await expect(page.getByRole("link", { name: "SHA-256 checksum Verify the downloaded DMG" })).toHaveAttribute(
    "href",
    "/downloads/Acacia-0.0.1.dmg.sha256",
  );
  await expect(
    page.getByRole("link", { name: "Release manifest Version, bundle ID, and notarization metadata" }),
  ).toHaveAttribute("href", "/downloads/Acacia-0.0.1.manifest.json");
});

test("shows the core product sections from the supplied design", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Everything a serious PDF review flow needs." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Built around real review workflows" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Download Acacia directly." })).toBeVisible();

  const expectedFeatures = [
    "Organize a local PDF library.",
    "Read with native PDFKit.",
    "Annotate without touching originals.",
    "Export review-ready copies.",
    "Compare versions side by side.",
    "Private by default.",
  ];

  for (const feature of expectedFeatures) {
    await expect(page.getByRole("heading", { name: feature })).toBeVisible();
  }
});

test("keeps the landing page usable on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Acacia for Mac PDFs." })).toBeVisible();
  await expect(page.getByLabel("Acacia app preview")).toBeVisible();
  await expect(page.getByRole("link", { name: /download acacia/i }).first()).toBeVisible();

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
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "#download",
    );
    await expect(page.getByRole("link", { name: "Bundle ID", exact: true })).toHaveAttribute("href", "#bundle-id");
  }
  await expect(page.getByLabel("Product links").getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    "#download",
  );
  await expect(page.getByRole("link", { name: "Verify Checksum" })).toHaveAttribute(
    "href",
    "/downloads/Acacia-0.0.1.dmg.sha256",
  );
});
