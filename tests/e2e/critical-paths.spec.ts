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
  await dialog.getByRole("button", { name: "SEASONAL" }).click();
  await expect(dialog.getByText(/Seasonal quest eligibility is not reliably present/)).toBeVisible();
  await dialog.getByRole("checkbox", { name: "All maps" }).check();
  await expect(dialog.locator(".quest-card.unknown").first()).toBeVisible();
});

test("loot filters enable one child when their parent layer is off", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open map legend" }).click();

  const lootLayer = page.getByRole("button", { name: /Loot containers/i });
  const drawers = page.getByRole("button", { name: /Drawers \d+/i });
  const bags = page.getByRole("button", { name: /Bags, jackets, cases \d+/i });
  await expect(lootLayer).toHaveAttribute("aria-pressed", "false");
  await expect(drawers).toHaveAttribute("aria-pressed", "false");

  await drawers.click();

  await expect(lootLayer).toHaveAttribute("aria-pressed", "true");
  await expect(drawers).toHaveAttribute("aria-pressed", "true");
  await expect(bags).toHaveAttribute("aria-pressed", "false");
});

test("public landing page exposes privacy and lazy scene controls", async ({ page }) => {
  await page.route("**/release.json", (route) =>
    route.fulfill({
      json: {
        filename: "Raid-Signal-Setup-1.3.0.exe",
        version: "1.3.0",
        sha256: "8a29f31c3d5f977752138bb76c6055476714f5aca11ca8ed590629ab630b4741",
        downloadUrl: "https://github.com/QTtrash/tarkov-map/releases/download/v1.3.0/Raid-Signal-Setup-1.3.0.exe",
        size: 27000000,
        publishedAt: "2026-08-21T12:30:00.000Z",
      },
    }),
  );
  await page.goto("/signal.html");
  await expect(page.getByRole("heading", { name: /Your squad/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Built in public/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quest-log import, without pretending every build matches." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "u/iShadowLTu" })).toHaveAttribute(
    "href",
    "https://www.reddit.com/user/iShadowLTu/",
  );
  await expect(page.getByRole("link", { name: "VIEW PR #19 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/pull/19",
  );
  await expect(page.getByRole("link", { name: "REPORT COMPATIBILITY ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/issues/new?template=quest_log_compatibility.yml",
  );
  await expect(page.getByRole("link", { name: "@Carbneth" })).toHaveAttribute("href", "https://github.com/Carbneth");
  await expect(page.getByRole("link", { name: "PR #15 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/pull/15",
  );
  await expect(page.getByRole("link", { name: "@TedCreator" })).toHaveAttribute(
    "href",
    "https://github.com/TedCreator",
  );
  await expect(page.getByRole("link", { name: "PR #12 ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/pull/12",
  );
  await expect(page.getByRole("link", { name: "VIEW RELEASE WORKFLOW ↗" })).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/actions/workflows/release.yml",
  );
  await expect(page.getByRole("link", { name: "DOWNLOAD 1.3.0 FOR WINDOWS" }).first()).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/releases/download/v1.3.0/Raid-Signal-Setup-1.3.0.exe",
  );
  await expect(page.locator("[data-release-sha]")).toHaveText(
    "8a29f31c3d5f977752138bb76c6055476714f5aca11ca8ed590629ab630b4741",
  );
  await expect(page.locator("script[src*='signal-scene']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /SEALED RELAY/ })).toBeVisible();
});

test("public landing page keeps the community spotlight usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/release.json", (route) => route.abort());
  await page.goto("/signal.html#community");
  await expect(
    page.getByRole("heading", { name: "Quest-log import, without pretending every build matches." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "u/iShadowLTu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "@Carbneth" })).toBeVisible();
  await expect(page.getByRole("link", { name: "@TedCreator" })).toBeVisible();
  await expect(page.locator(".community-flow article")).toHaveCount(3);
  await expect(page.locator(".community-sync-board")).toBeVisible();
  await expect(page.locator(".community-archive")).toHaveCount(2);
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
