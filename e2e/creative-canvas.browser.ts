import { expect, test } from "@playwright/test";

test("creative canvas preview renders the connected strategic workspace", async ({ page }) => {
  await page.goto("/creative-canvas-preview");
  const title = page.getByText("LV Creative Canvas™ Demo");
  await page.waitForTimeout(750);
  // Vite may perform a one-time dependency optimization reload when this is
  // the first page requested by a parallel worker.
  if (await title.count() === 0) await page.reload();
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Strategy drives every generation")).toBeVisible();
  await expect(page.getByText("LV Intelligence")).toBeVisible();
  expect(await page.locator(".creative-shape").count()).toBe(7);
  await expect(page.getByText("React Flow", { exact: true })).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  expect(await page.locator("input.creative-shape__title").evaluateAll((items) => items.some((item) => (item as HTMLInputElement).value.includes("Made Here, Shared Here")))).toBe(true);
  expect(await page.locator("textarea.creative-shape__body").evaluateAll((items) => items.some((item) => (item as HTMLTextAreaElement).value.includes("Hecho aquí. Compartido aquí.")))).toBe(true);
});

test("creative canvas keeps core controls reachable at a common laptop size", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/creative-canvas-preview");
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeVisible();
  await expect(page.getByText("Reference", { exact: true }).first()).toBeVisible();
  const stage = page.locator(".creative-canvas-stage");
  await expect(stage).toBeVisible();
  expect(await stage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
