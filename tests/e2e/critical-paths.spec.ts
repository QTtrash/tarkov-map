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
        filename: "Raid-Signal-Setup-1.0.0.exe",
        version: "1.0.0",
        sha256: "b524e80f9cc8e1af6a74e3470de5ce471aeb0186ced523319b314cc39c265722",
        downloadUrl: "https://github.com/QTtrash/tarkov-map/releases/download/v1.0.0/Raid-Signal-Setup-1.0.0.exe",
        size: 26194715,
        publishedAt: "2026-08-14T18:02:39Z",
      },
    }),
  );
  await page.goto("/signal.html");
  await expect(page.getByRole("heading", { name: /Your squad/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Built in public/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "DOWNLOAD 1.0.0 FOR WINDOWS" }).first()).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/releases/download/v1.0.0/Raid-Signal-Setup-1.0.0.exe",
  );
  await expect(page.locator("[data-release-sha]")).toHaveText(
    "b524e80f9cc8e1af6a74e3470de5ce471aeb0186ced523319b314cc39c265722",
  );
  await expect(page.locator("script[src*='signal-scene']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /SEALED RELAY/ })).toBeVisible();
});

test("public landing page keeps a releases fallback when its manifest is unavailable", async ({ page }) => {
  await page.route("**/release.json", (route) => route.abort());
  await page.goto("/signal.html");
  await expect(page.getByRole("link", { name: "VIEW WINDOWS RELEASES" }).first()).toHaveAttribute(
    "href",
    "https://github.com/QTtrash/tarkov-map/releases",
  );
});
