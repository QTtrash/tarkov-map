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
  await page.goto("/signal.html");
  await expect(page.getByRole("heading", { name: /Your squad/ })).toBeVisible();
  await expect(page.locator("script[src*='signal-scene']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /SEALED RELAY/ })).toBeVisible();
});
