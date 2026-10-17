import { test, expect, type Page } from "@playwright/test";
import { loadEnv } from "vite";

const backend = loadEnv("development", process.cwd(), "VITE_").VITE_SUPABASE_URL;
const orgId = "00000000-0000-4000-8000-000000000001";
const user = { id: "00000000-0000-4000-8000-000000000002", email: "preview@example.com", user_metadata: { full_name: "Alex Preview" }, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
const projects = [
  { id: "project-1", name: "Brand launch", client_name: "Sample Studio", description: "Strategy and creative direction for the next chapter.", status: "active", context_complete: true },
  { id: "project-2", name: "Autumn campaign", client_name: "Sample Collective", description: "A connected campaign across every channel.", status: "paused", context_complete: false },
].map(project => ({ ...project, org_id: orgId, branch_id: null, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }));

async function mockWorkspace(page: Page) {
  // All backend requests are intercepted; these tests never use real accounts
  // or write to the production database.
  await page.route(`${backend}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/v1/user")) data = user;
    if (path.endsWith("/rpc/portal_account_restricted")) data = false;
    if (path.endsWith("/rpc/portal_workspaces")) data = [{ org_id: orgId, name: "LV Branding", role: "ambassador" }];
    if (path.endsWith("/team_members")) data = { org_id: orgId, role: "owner", feature_access: null };
    if (path.endsWith("/organizations")) data = { id: orgId, name: "LV Branding", owner_id: user.id };
    if (path.endsWith("/projects")) data = projects;
    if (path.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204 });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString("base64url")}.test-signature`;
  await page.addInitScript(({ key, user, token, expires }) => {
    localStorage.setItem("lv-marketing-suite-language", "en");
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_at: expires, expires_in: 3600, user }));
  }, { key: `sb-${new URL(backend).hostname.split(".")[0]}-auth-token`, user, token, expires });
}

test.beforeEach(async ({ page }) => mockWorkspace(page));

test("dark mode persists across suite pages and themes portaled dialogs", async ({ page }) => {
  await page.goto("/projects");
  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await expect(toggle).toHaveAttribute("data-state", "unchecked");
  await toggle.click();
  await expect(page.locator("body")).toHaveClass(/dark/);
  await expect(toggle).toHaveAttribute("data-state", "checked");
  await expect(page.locator(".suite-main")).toHaveCSS("color", "rgb(240, 240, 240)");
  await page.screenshot({ path: "/private/tmp/lv-suite-dark-projects.png", animations: "disabled" });
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("color", "rgb(240, 240, 240)");
  await page.screenshot({ path: "/private/tmp/lv-suite-dark-dialog.png", animations: "disabled" });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/dark/);
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("data-state", "checked");
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator("body")).not.toHaveClass(/dark/);
});

test("workspace theme spans navigation and portaled forms without changing their behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveAttribute("data-suite-theme", "glass");
  await expect(page.getByRole("heading", { name: "Brand launch" })).toBeVisible();
  await page.screenshot({ path: "/private/tmp/lv-suite-dashboard.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("tab", { name: "Paused", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Autumn campaign" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brand launch" })).toHaveCount(0);
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("border-radius", "28px");
  await expect(dialog.getByLabel("Project Name")).toBeFocused();
  await dialog.getByRole("button", { name: "Create Project", exact: true }).click();
  await expect(dialog.getByText("Project name is required")).toBeVisible();
  await dialog.getByLabel("Project Name").fill("Preview only");
  await dialog.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toHaveCSS("border-radius", "18px");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/private/tmp/lv-suite-dialog.png", fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Project", exact: true })).toBeVisible();
});

test("mobile menu and dialog fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Brand launch" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Projects", exact: true })).toBeVisible();
  await page.screenshot({ path: "/private/tmp/lv-suite-mobile-menu.png", fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Create Project", exact: true })).toBeInViewport();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/private/tmp/lv-suite-mobile-dialog.png", fullPage: true, animations: "disabled" });
});

test("signing out removes the workspace theme and preserves the sign-in design", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("body")).toHaveAttribute("data-suite-theme", "glass");
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-suite-theme");
  await expect(page.locator("body")).not.toHaveClass(/dark/);
  await expect(page.locator(".auth-scene")).toHaveCSS("background-image", /lv-auth-background/);
});


test("protected ambassador portal shares the light workspace theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/portal");
  await expect(page.locator("body")).toHaveAttribute("data-suite-theme", "glass");
  await expect(page.locator(".suite-portal > aside")).toBeVisible();
  await expect(page.locator(".suite-portal > aside")).toHaveCSS("color", /rgb\(35, 31, 3[12]\)/);
  await expect(page.locator(".suite-portal > aside nav button[aria-current='page']")).toBeVisible();
  await page.screenshot({ path: "/private/tmp/lv-suite-portal.png", fullPage: true, animations: "disabled" });
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator("body")).toHaveClass(/dark/);
  await page.screenshot({ path: "/private/tmp/lv-suite-dark-portal.png", fullPage: true, animations: "disabled" });
});
