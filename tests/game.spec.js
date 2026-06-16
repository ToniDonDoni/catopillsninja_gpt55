import { expect, test } from "@playwright/test";

async function openGame(page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const stream = canvas.captureStream(12);
    navigator.mediaDevices = {
      getUserMedia: async () => stream,
    };
  });
  await page.goto("/?testMode=1");
  await expect(page.getByRole("button", { name: "Start Camera Game" })).toBeVisible();
}

test("starts a camera-controlled round", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "Start Camera Game" }).click();

  await expect(page.locator("#cameraStatus")).toHaveText("Test finger tracker active");
  await expect(page.locator("#score")).toHaveText("0");
  await expect(page.locator("#time")).not.toHaveText("0");

  const snapshot = await page.evaluate(() => window.__gameTestApi.snapshot());
  expect(snapshot.running).toBe(true);
  expect(snapshot.trackerMode).toBe("test");
});

test("finger movement catches a cat and processes it in the glass", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "Start Camera Game" }).click();

  await page.evaluate(() => {
    window.__gameTestApi.spawnCatAt({ x: 0.25, y: 0.5 });
    window.__gameTestApi.setFinger({ x: 0.25, y: 0.5 });
  });
  await expect.poll(() => page.evaluate(() => window.__gameTestApi.snapshot().grabbedCatId)).not.toBeNull();

  await page.evaluate(() => window.__gameTestApi.setFinger({ x: 0.89, y: 0.5 }));
  await expect.poll(() => page.evaluate(() => window.__gameTestApi.snapshot().score)).toBeGreaterThanOrEqual(100);
  await expect(page.locator("#score")).toHaveText("100");
  await expect.poll(() => page.evaluate(() => window.__gameTestApi.snapshot().pills)).toBeGreaterThan(0);
});

test("pointer fallback drags a cat responsively into the glass", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "Start Camera Game" }).click();

  const box = await page.locator("#gameCanvas").boundingBox();
  expect(box).not.toBeNull();

  await page.evaluate(() => {
    window.__gameTestApi.spawnCatAt({ x: 0.25, y: 0.5 });
  });

  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__gameTestApi.snapshot().grabbedCatId)).not.toBeNull();

  await page.mouse.move(box.x + box.width * 0.88, box.y + box.height * 0.5, { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.__gameTestApi.snapshot().score)).toBeGreaterThanOrEqual(100);
  await page.mouse.up();
});

test("round can end and restart from the game-over panel", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "Start Camera Game" }).click();

  await page.evaluate(() => window.__gameTestApi.end());
  await expect(page.getByRole("heading", { name: "Game Over" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart" })).toBeVisible();

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("heading", { name: "Game Over" })).toBeHidden();
  await expect(page.locator("#score")).toHaveText("0");

  const snapshot = await page.evaluate(() => window.__gameTestApi.snapshot());
  expect(snapshot.running).toBe(true);
  expect(snapshot.gameOver).toBe(false);
});
