import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const settings = JSON.parse(readFileSync("contracts/settings-v2.json", "utf8"));
import type { CustomPinPoi, QuestBundle, QuestObjectivePoi } from "../../src/types";

const questBundle = JSON.parse(readFileSync("public/maps/quests/regular.json", "utf8")) as QuestBundle;
const makePin = (map: string, id: string, x: number): CustomPinPoi => ({
  id: `pin-${map}-${id}`,
  kind: "custom-pin",
  category: "custom-pin",
  name: `Waypoint ${id}`,
  note: "Saved on this phone",
  position: { x, y: 0, z: 0 },
});
const pins = [makePin("customs", "one", 0), makePin("customs", "two", 300), makePin("woods", "other", 0)];

async function companion(page: Page, savedPins = pins) {
  const room = Buffer.alloc(20, 7);
  room.writeUInt32BE(Math.floor(Date.now() / 1000));
  const fragment = Buffer.alloc(32, 7).toString("base64url");
  const invitation = `/lan/${room.toString("base64url")}#${fragment}`;
  const html = await (await page.request.get("/companion.html")).text();
  await page.route("**/lan/*", (route) => route.fulfill({ body: html, contentType: "text/html" }));
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage(() => {
      throw new Error("The companion must not publish progress or pins");
    });
  });
  await page.addInitScript((initialPins) => {
    if (!sessionStorage.getItem("waypoint-test-seeded")) {
      localStorage.setItem("raid-signal-companion-pins", JSON.stringify(initialPins));
      sessionStorage.setItem("waypoint-test-seeded", "yes");
    }
  }, savedPins);
  await page.goto(invitation);
  await expect(page.getByRole("application", { name: "Customs map" })).toBeVisible();
  await expect(page.locator(".tarkov-svg-layer")).toBeVisible();
  return invitation;
}

async function expectExtractionNames(page: Page) {
  await expect.poll(async () => page.locator(".extraction-label, .extraction-overflow button").count()).toBe(22);
  const labels = await page.locator(".extraction-label").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const canvas = element.closest(".map-canvas")!.getBoundingClientRect();
      return {
        within:
          rect.left >= canvas.left &&
          rect.right <= canvas.right &&
          rect.top >= canvas.top &&
          rect.bottom <= canvas.bottom,
        pointerEvents: getComputedStyle(element).pointerEvents,
      };
    }),
  );
  expect(labels.every((label) => label.within && label.pointerEvents === "none")).toBe(true);
  await expect(page.locator(".poi-marker.transit .poi-marker-label").first()).toBeHidden();
}

test("overview extraction names are visible, bounded, filtered, and safe without zoom", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectExtractionNames(page);
  await page.screenshot({ path: testInfo.outputPath("desktop-overview.png") });
  await page.getByRole("button", { name: "Open map legend" }).click();
  await page.getByRole("button", { name: /PMC extracts/ }).click();
  await expect(page.locator(".extraction-label.extract-pmc")).toHaveCount(0);
  const marker = page.locator(".leaflet-marker-icon").first();
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(0);
});

test("quest-panel focus survives floors, map changes, and repeated requests", async ({ page }, testInfo) => {
  await page.route("**/maps/poi/woods.json*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "QUEST NAVIGATOR" }).click();
  await page.getByPlaceholder("Search quests, traders, objectives").fill("Chumming");
  await page.locator(".quest-expand").first().click();
  await page.getByRole("button", { name: /SHOW POINT.*CUSTOMS/ }).click();
  const details = page.getByRole("dialog", { name: "Chumming" });
  await expect(details).toBeVisible();
  await expect(details.getByRole("region", { name: "Selected objective" })).toContainText("3rd floor");
  await expect(details.locator(".quest-location-preview figcaption")).toContainText("3rd Floor");
  await expect(details.getByText("Loading location map…")).toBeHidden();
  await expect(details.getByRole("link", { name: /Open Tarkov Wiki/ })).toHaveAttribute("rel", "noopener noreferrer");
  const artwork = details.getByRole("img", { name: /Generic quest artwork for Chumming/ });
  await expect(artwork).toBeVisible();
  await expect
    .poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  await expect(details.locator(".quest-artwork figcaption")).toContainText("Source: Tarkov.dev");
  await page.screenshot({ path: testInfo.outputPath("desktop-quest.png") });
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "QUEST NAVIGATOR" }).click();
    await page.getByRole("button", { name: /SHOW POINT.*WOODS/ }).click();
    await expect(details).toBeVisible();
    await expect(page.getByRole("application", { name: "Woods map" })).toBeVisible();
    await expect(details.getByRole("region", { name: "Selected objective" })).toContainText("sawmill on Woods");
    await details.getByRole("button", { name: "Close quest details" }).click();
  }
});

test("active markers resolve bundled quest details and keep working after disconnection", async ({ page }) => {
  const quest = questBundle.quests.find((q) => q.name === "Chemical - Part 4")!;
  await page.addInitScript(
    (taskId) =>
      localStorage.setItem("quest-progress:regular", JSON.stringify([{ taskId, status: "active", updatedAt: 1 }])),
    quest.id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Open map legend" }).click();
  await page.getByRole("button", { name: /Quest markers/ }).click();
  const marker = page.locator('.leaflet-marker-icon[title="Chemical - Part 4"]').last();
  await expect(marker).toBeVisible();
  await page.getByRole("button", { name: "Close map legend" }).first().click();
  await page.route("**/maps/quests/wiki-links.json", (route) => route.abort());
  await page.route("**/maps/svg/*", (route) => route.abort());
  await page.route("**/maps/quests/images/*.webp*", (route) => route.abort());
  const objectiveId = await marker.getAttribute("data-objective-id");
  await marker.click();
  const details = page.getByRole("dialog", { name: "Chemical - Part 4" });
  await expect(details.getByRole("region", { name: "Selected objective" })).toContainText(
    quest.objectives.find((objective) => objective.id === objectiveId)!.description,
  );
  await details.locator(".quest-artwork").scrollIntoViewIfNeeded();
  await expect(details).toContainText("Quest artwork unavailable");
  await expect(details).toContainText("Location map unavailable");
  await expect(details).toContainText("No verified Wiki link available");
});

test.describe("touch companion", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("deletes a selected waypoint, persists, and clears only the current map", async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    const invitation = await companion(page);
    await expectExtractionNames(page);
    await page.screenshot({ path: testInfo.outputPath("phone-overview.png") });
    await page.getByRole("button", { name: "Waypoint one", exact: true }).tap();
    const remove = page.getByRole("button", { name: "Delete waypoint", exact: true });
    await expect(remove).toBeVisible();
    expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".leaflet-popup")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("phone-delete.png") });
    await remove.tap();
    await expect(page.locator(".poi-popup-content")).toHaveCount(0);
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(1);
    await expect(page.getByRole("application", { name: "Customs map" })).toBeFocused();
    await page.goto("about:blank");
    await page.goto(invitation);
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(1);
    const clear = page.getByRole("button", { name: "Clear waypoints on this map", exact: true });
    await clear.tap();
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(0);
    await expect(clear).toBeDisabled();
    await expect(page.locator(".poi-marker.extract-pmc").first()).toBeVisible();
    await page.getByRole("combobox", { name: "Map", exact: true }).selectOption("woods");
    await expect(page.getByRole("button", { name: "Waypoint other", exact: true })).toBeVisible();
    await page.goto("about:blank");
    await page.goto(invitation);
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("raid-signal-companion-pins")!).map((pin: { id: string }) => pin.id),
      ),
    ).toEqual(["pin-woods-other"]);
    expect(requests.every((url) => !url.includes("#") && !url.includes("quest-progress"))).toBe(true);
  });

  test("keyboard deletion does not create a replacement pin and gestures still create/pan", async ({ page }) => {
    await companion(page);
    await page.getByRole("button", { name: "Waypoint one", exact: true }).tap();
    await page.getByRole("button", { name: "Delete waypoint" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(1);
    const map = page.getByRole("application", { name: "Customs map" });
    await map.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(2);
    await page.getByRole("button", { name: "Clear waypoints on this map" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(0);
    const box = (await map.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 60);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 60);
    await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(1);
    const boxBeforePan = (await map.boundingBox())!;
    const pane = page.locator(".leaflet-map-pane");
    const transformBeforePan = await pane.evaluate((element) => element.style.transform);
    const cdp = await page.context().newCDPSession(page);
    const start = { x: boxBeforePan.x + boxBeforePan.width / 2, y: boxBeforePan.y + 90 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (const distance of [15, 30, 45, 60]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + distance, y: start.y }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => pane.evaluate((element) => element.style.transform)).not.toBe(transformBeforePan);
    const artwork = page.locator(".tarkov-svg-layer");
    const transformBeforeZoom = await artwork.evaluate((element) => element.style.transform);
    await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
    await expect.poll(() => artwork.evaluate((element) => element.style.transform)).not.toBe(transformBeforeZoom);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("raid-signal-companion-pins")!).length)).toBe(2);
  });

  test("quest focus opens touch details for possible locations without claiming a spawn", async ({
    page,
  }, testInfo) => {
    await companion(page, []);
    const quest = questBundle.quests.find((q) =>
      q.objectives.some((objective) => objective.possibleLocations?.some((location) => location.positions.length > 1)),
    )!;
    await page.getByRole("button", { name: "QUESTS", exact: true }).tap();
    await page.getByRole("checkbox", { name: "All maps" }).check();
    await page.getByPlaceholder("Search quests, traders, objectives").fill(quest.name);
    await page.locator(".quest-expand").first().tap();
    await page
      .getByRole("button", { name: /SHOW AREA/ })
      .first()
      .tap();
    const dialog = page.getByRole("dialog", { name: quest.name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("A spawn here is not guaranteed");
    await expect(dialog.locator(".quest-location-preview figcaption")).toContainText("Objective location map");
    await expect(dialog.getByText("Loading location map…")).toBeHidden();
    const artwork = dialog.getByRole("img", { name: /Generic quest artwork/ });
    await artwork.scrollIntoViewIfNeeded();
    await expect
      .poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true);
    await expect(dialog.locator(".quest-artwork figcaption")).toContainText("Source: Tarkov.dev");
    await page.screenshot({ path: testInfo.outputPath("phone-quest.png") });
    await dialog.getByRole("button", { name: "Close quest details" }).tap();
    await expect(dialog).toBeHidden();
  });
});

for (const size of [300, 430])
  test(`compact overlay ${size}px shows extraction names and read-only quest details with a mocked native bridge`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: size, height: size });
    const quest = questBundle.quests.find((q) => q.name === "Chemical - Part 4")!;
    const objective = quest.objectives.find((o) => o.zones.some((zone) => zone.mapId === "customs"))!;
    const zone = objective.zones.find((z) => z.mapId === "customs")!;
    const poi: QuestObjectivePoi = {
      id: "overlay-quest",
      kind: "quest-objective",
      category: "quest-objective",
      mapId: "customs",
      name: quest.name,
      taskId: quest.id,
      objectiveId: objective.id,
      description: objective.description,
      position: zone.position,
    };
    await page.addInitScript(
      ({ settings, poi }) => {
        const callbacks = new Map<number, (event: unknown) => void>();
        const events = new Map<number, string>();
        let next = 1;
        Object.assign(window, {
          __TAURI_EVENT_PLUGIN_INTERNALS__: {
            unregisterListener: (_event: string, id: number) => {
              events.delete(id);
              callbacks.delete(id);
            },
          },
          __TAURI_INTERNALS__: {
            transformCallback: (callback: (event: unknown) => void) => {
              const id = next++;
              callbacks.set(id, callback);
              return id;
            },
            unregisterCallback: (id: number) => callbacks.delete(id),
            invoke: async (command: string, args: { event: string; handler: number }) => {
              if (command === "plugin:event|listen") {
                events.set(args.handler, args.event);
                return args.handler;
              }
              if (command === "get_settings") return { ...settings, showQuestMarkers: true };
              if (command === "get_locator_snapshot")
                return {
                  fix: null,
                  mapContext: { mapId: "customs", inRaid: false, source: "manual" },
                  status: null,
                  ocrText: { observedAt: 1, mapId: "customs", rawText: "EXFIL Dorms V-Ex", message: "analyzed" },
                };
              if (command === "overlay_ready")
                for (const [id, event] of events)
                  if (event === "quest://objective-pois")
                    callbacks.get(id)?.({ id, event, payload: { mapId: "customs", gameMode: "regular", pois: [poi] } });
              if (command === "hide_overlay") document.body.dataset.hiddenByNative = "true";
              return null;
            },
          },
        });
      },
      { settings, poi },
    );
    await page.goto("/overlay.html");
    await expectExtractionNames(page);
    await expect(page.locator(".poi-marker.raid-active")).toHaveCount(1);
    await expect(page.locator(".extraction-label.raid-active, .extraction-overflow .raid-active")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`overlay-${size}.png`) });
    await page.getByRole("button", { name: quest.name, exact: true }).click();
    await expect(page.getByRole("dialog", { name: quest.name })).toContainText(objective.description);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.locator("body").getAttribute("data-hidden-by-native")).toBeNull();
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).toHaveAttribute("data-hidden-by-native", "true");
  });

test("POI tooltip names render literal markup as text", async ({ page }) => {
  await page.route("**/maps/poi/customs.json*", async (route) => {
    const response = await route.fetch();
    const bundle = await response.json();
    bundle.pois
      .filter((poi: { kind: string }) => poi.kind === "extract")
      .forEach((poi: { name: string }) => {
        poi.name = "<b>Literal exit</b>";
      });
    await route.fulfill({ response, json: bundle });
  });
  await page.goto("/");
  const marker = page.locator('.leaflet-marker-icon[title="<b>Literal exit</b>"]').first();
  await marker.focus();
  await expect(page.locator(".poi-tooltip")).toHaveText("<b>Literal exit</b>");
  await expect(page.locator(".poi-tooltip b")).toHaveCount(0);
});

test("companion reports storage failure while removal still updates the map", async ({ page }) => {
  await companion(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Clear waypoints on this map" }).click();
  await expect(page.locator(".poi-marker.custom-pin")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("could not be saved");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("raid-signal-companion-pins")!).length)).toBe(3);
});
