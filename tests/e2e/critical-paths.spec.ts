import { expect, test } from "@playwright/test";

test("desktop preview supports keyboard map and accessible dialogs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("application", { name: "Customs map" })).toBeVisible();

  const settingsTrigger = page.getByRole("button", { name: "Settings" });
  await settingsTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Raid Signal settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsTrigger).toBeFocused();

  const map = page.getByRole("application", { name: "Customs map" });
  await map.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "CLEAR WAYPOINTS" })).toBeVisible();
});

test("quest intelligence loads through the browser boundary", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "QUEST NAVIGATOR" }).click();
  const dialog = page.getByRole("dialog", { name: "Quest navigator" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Search quests, traders, objectives")).toBeVisible();
});

test("public landing page exposes privacy and lazy scene controls", async ({ page }) => {
  await page.route("**/release.json", (route) =>
    route.fulfill({
      json: {
        filename: "Raid-Signal-Setup-1.1.0.exe",
        version: "1.1.0",
        sha256: "98f5f3f4810cff60ff87f088ceea2a9c2f8ea07fd886bc8878ac72093e983fa3",
        downloadUrl: "https://github.com/QTtrash/tarkov-map/releases/download/v1.1.0/Raid-Signal-Setup-1.1.0.exe",
        size: 26717120,
        publishedAt: "2026-08-20T14:00:56.8797963Z",
      },
    }),
  );
  await page.goto("/signal.html");
  await expect(page.getByRole("heading", { name: /Your squad/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Built in public/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One quest at a time became the whole route." })).toBeVisible();
  await expect(page.getByRole("link", { name: "@TedCreator" })).toHaveAttribute(
    "href",
    "https://github.com/TedCreator",
  );
  await expect(page.getByRole("link", { name: "VIEW PR #12 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/pull/12",
  );
  await expect(page.getByRole("link", { name: "VIEW V1.1.0 RELEASE RUN ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/actions/runs/32376201098",
  );
  await expect(page.getByRole("link", { name: "DOWNLOAD 1.1.0 FOR WINDOWS" }).first()).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/releases/download/v1.1.0/Raid-Signal-Setup-1.1.0.exe",
  );
  await expect(page.locator("[data-release-sha]")).toHaveText(
    "98f5f3f4810cff60ff87f088ceea2a9c2f8ea07fd886bc8878ac72093e983fa3",
  );
  await expect(page.locator("script[src*='signal-scene']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /SEALED RELAY/ })).toBeVisible();
});

test("public landing page keeps the community spotlight usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/release.json", (route) => route.abort());
  await page.goto("/signal.html#community");
  await expect(page.getByRole("heading", { name: "One quest at a time became the whole route." })).toBeVisible();
  await expect(page.getByRole("link", { name: "@TedCreator" })).toBeVisible();
  await expect(page.locator(".community-flow article")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test("public landing page keeps a releases fallback when its manifest is unavailable", async ({ page }) => {
  await page.route("**/release.json", (route) => route.abort());
  await page.goto("/signal.html");
  await expect(page.getByRole("link", { name: "VIEW WINDOWS RELEASES" }).first()).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/releases",
  );
});
