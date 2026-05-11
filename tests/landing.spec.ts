import { expect, test } from "@playwright/test";

test("presents the PaperView landing page with primary download links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("PaperView");
  await expect(page.getByRole("heading", { name: "The PDF viewer made for Mac." })).toBeVisible();
  await expect(page.getByText("Optimized for macOS Sonoma")).toBeVisible();
  await expect(page.getByText("Fast, Powerful, Beautiful.")).toBeVisible();

  const primaryDownloadLinks = page.getByRole("link", { name: /download free/i });
  await expect(primaryDownloadLinks.first()).toHaveAttribute("href", "/downloads/PaperView-mac-universal.dmg");
  await expect(primaryDownloadLinks.first()).toHaveAttribute("download", "");

  await expect(page.getByRole("link", { name: "Download for Apple Silicon" })).toHaveAttribute(
    "href",
    "/downloads/PaperView-arm64.dmg",
  );
  await expect(page.getByRole("link", { name: "Download for Intel Mac" })).toHaveAttribute(
    "href",
    "/downloads/PaperView-x64.dmg",
  );
});

test("shows the core product sections from the supplied design", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Everything you need, right where you need it." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Loved by Mac users" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready to elevate your PDF experience?" })).toBeVisible();

  const expectedFeatures = [
    "Read. Smooth and clear.",
    "Annotate with ease.",
    "Edit like a pro.",
    "Organize pages.",
    "Keep it secure.",
    "Work across devices.",
  ];

  for (const feature of expectedFeatures) {
    await expect(page.getByRole("heading", { name: feature })).toBeVisible();
  }
});

test("keeps the landing page usable on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The PDF viewer made for Mac." })).toBeVisible();
  await expect(page.getByLabel("PaperView app preview")).toBeVisible();
  await expect(page.getByRole("link", { name: /download free/i }).first()).toBeVisible();

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
    await expect(page.getByLabel("Primary navigation").getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "#pricing",
    );
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  }
  await expect(page.getByLabel("Product links").getByRole("link", { name: "Pricing" })).toHaveAttribute(
    "href",
    "#pricing",
  );
  await expect(page.getByRole("link", { name: "View Pricing" })).toHaveAttribute("href", "#pricing");
});
