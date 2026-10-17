import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const backend = loadEnv("development", process.cwd(), "VITE_").VITE_SUPABASE_URL;
const orgId = "00000000-0000-4000-8000-000000000001";
const pageId = "00000000-0000-4000-8000-000000000003";
const user = { id: "00000000-0000-4000-8000-000000000002", email: "preview@example.com", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9wQDMAAAAASUVORK5CYII=", "base64");

test("the white writing sheet keeps dropped images at their document position after reopening", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const now = new Date().toISOString();
  const workspacePage = {
    id: pageId, org_id: orgId, parent_id: null, title: "Campaign draft", icon: null,
    cover_color: null, position: 0, is_archived: false, metadata: {}, created_by: user.id,
    created_at: now, updated_at: now,
  };
  let html = "<p>Before the image</p><p>After the image</p>";
  let savedHtml = "";
  const assets: Record<string, unknown>[] = [];
  await page.route(`${backend}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/v1/user")) data = user;
    else if (path.endsWith("/rpc/portal_account_restricted")) data = false;
    else if (path.endsWith("/team_members")) data = { org_id: orgId, role: "owner", feature_access: null };
    else if (path.endsWith("/organizations")) data = { id: orgId, name: "LV Branding", owner_id: user.id };
    else if (path.endsWith("/workspace_pages")) {
      if (request.method() === "PATCH") {
        html = JSON.parse(request.postData() ?? "{}").document_html ?? html;
        savedHtml = html;
        data = { id: pageId, updated_at: now };
      } else if (url.searchParams.get("select") === "document_html") data = { document_html: html };
      else data = [workspacePage];
    } else if (path.endsWith("/workspace_assets")) {
      if (request.method() === "POST") {
        const body = JSON.parse(request.postData() ?? "{}");
        data = { ...body, id: `asset-${assets.length + 1}`, created_at: now, updated_at: now };
        assets.push(data as Record<string, unknown>);
      } else data = assets;
    } else if (path.includes("/storage/v1/object/sign/workspace-assets/")) {
      if (request.method() === "POST") data = { signedURL: `${path}?token=preview` };
      else return route.fulfill({ status: 200, contentType: "image/png", body: png });
    } else if (path.includes("/storage/v1/object/workspace-assets/")) data = { Key: path };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString("base64url")}.preview`;
  await page.addInitScript(({ key, user, token, expires }) => {
    localStorage.setItem("lv-marketing-suite-dark-mode", "true");
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: "preview", token_type: "bearer", expires_at: expires, expires_in: 3600, user }));
  }, { key: `sb-${new URL(backend).hostname.split(".")[0]}-auth-token`, user, token, expires });

  await page.goto(`/workspace?page=${pageId}`);
  const paper = page.locator(".workspace-paper");
  await expect(paper).toBeVisible();
  await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(paper.locator(".workspace-doc")).toHaveCSS("color", "rgb(35, 31, 32)");

  const secondParagraph = paper.locator(".workspace-doc p").nth(1);
  const bounds = await secondParagraph.boundingBox();
  expect(bounds).not.toBeNull();
  const transfer = await page.evaluateHandle(({ bytes }) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(bytes), char => char.charCodeAt(0))], "storyboard.png", { type: "image/png" }));
    return data;
  }, { bytes: png.toString("base64") });
  await secondParagraph.dispatchEvent("drop", { dataTransfer: transfer, clientX: bounds!.x + 4, clientY: bounds!.y + 2 });
  await expect(paper.locator("figure.workspace-inline-image img")).toBeVisible();
  await expect.poll(() => paper.locator("figure.workspace-inline-image img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => savedHtml).toContain("data-workspace-image-path");
  expect(savedHtml.indexOf("Before the image")).toBeLessThan(savedHtml.indexOf("data-workspace-image-path"));
  expect(savedHtml.indexOf("data-workspace-image-path")).toBeLessThan(savedHtml.indexOf("After the image"));
  await page.getByRole("button", { name: /Reference library/ }).click();
  await page.getByRole("button", { name: "Delete storyboard.png" }).click();
  await expect(page.getByText("Image is in this document", { exact: true })).toBeVisible();
  expect(assets).toHaveLength(1);
  await page.getByRole("button", { name: /Reference library/ }).click();
  await paper.locator("figure.workspace-inline-image").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/lv-workspace-dark-image.png", animations: "disabled" });

  await page.reload();
  await expect(page.locator("figure.workspace-inline-image img")).toBeVisible();
  await expect.poll(() => page.locator("figure.workspace-inline-image img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".workspace-doc")).toContainText("Before the image");
  await expect(page.locator(".workspace-doc")).toContainText("After the image");
  await page.getByRole("button", { name: "Insert image" }).click();
  await page.getByLabel("Choose document images").setInputFiles({ name: "second.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("figure.workspace-inline-image img")).toHaveCount(2);
  await page.locator(".workspace-doc").evaluate((editor, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(bytes), char => char.charCodeAt(0))], "pasted.png", { type: "image/png" }));
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, png.toString("base64"));
  await expect(page.locator("figure.workspace-inline-image img")).toHaveCount(3);
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator(".workspace-paper")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
