import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("lv-marketing-suite-language", "en"),
  );
  await page.goto("/portal-preview");
});
test("desktop preview supports lead search, detail and draft form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", {
      name: "Build relationships that move businesses forward.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/lv-portal-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", {
      name: "Search contacts, companies, email or phone",
    })
    .fill("Northline");
  await expect(
    page.getByRole("button", { name: "Northline Coffee", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Forma Studio", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Northline Coffee", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northline Coffee" }),
  ).toBeVisible();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Maya",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/private/tmp/lv-portal-lead.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to leads" }).click();
  await page.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
});
test("mobile cards and Spanish forms remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Northline Coffee" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("combobox").filter({ hasText: "English" }).click();
  await page.getByRole("option", { name: "Spanish" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Construye relaciones que impulsen los negocios.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/lv-portal-mobile-es.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Northline Coffee/ }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Maya");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("admin preview exposes deliberate sharing controls without enabling writes", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Your role" }).selectOption("admin");
  await page
    .getByRole("button", { name: "Northline Coffee", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Internal pipeline" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Share this stage with the representative",
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Update pipeline" }),
  ).toBeDisabled();
});

test("admin preview includes invitation creation without sending messages", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Your role" }).selectOption("admin");
  await page
    .getByRole("button", { name: "Representatives", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Invite a representative", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create and send invitation" }),
  ).toBeDisabled();
  await expect(page.getByText(/Create and email a private invitation/)).toBeVisible();
});

test("invitation entry removes the bearer token from the URL and reuses sign-in", async ({
  page,
}) => {
  const token = "a".repeat(64);
  await page.goto(`/portal-invite#invite=${token}`);
  await expect(
    page.getByRole("heading", { name: "Join the LV Branding portal" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByRole("button",{name:"Email me a sign-in link",exact:true})).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.goto("/auth?returnTo=%2Fportal-invite");
  await expect(page).toHaveURL(/\/portal-invite$/);
  await expect(page.getByRole("button",{name:"Email me a sign-in link",exact:true})).toBeVisible();
  let payload:any;
  await page.route("**/auth/v1/otp**",async route=>{
    payload=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:"application/json",body:"{}"});
  });
  await page.getByRole("textbox",{name:"Email",exact:false}).fill("invited@example.test");
  await page.getByRole("button",{name:"Email me a sign-in link",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  expect(payload.email).toBe("invited@example.test");
  expect(payload.create_user).toBe(true);
  expect(JSON.stringify(payload)).not.toContain(token);
  expect(page.url()).not.toContain(token);
});

test("advisor opens without a lead and preserves the draft between tabs", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open advisor", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "LV Branding Advisor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No lead connected/),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Help me prepare discovery questions.",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your message", exact: true }),
  ).toHaveValue("Help me prepare discovery questions.");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", {name:"Dashboard", exact:true}).click();
  await page.getByRole("button", {name:"LV Branding Advisor", exact:true}).click();
  await expect(page.getByRole("textbox", {name:"Your message", exact:true})).toHaveValue("Help me prepare discovery questions.");
  await page.screenshot({
    path: "/private/tmp/lv-portal-advisor.png",
    fullPage: true,
  });
});

test("commission tracker separates ambassador viewing from admin entry",async({page})=>{
 await page.getByRole("button",{name:"Commissions",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Commissions",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Add commission",exact:true})).toHaveCount(0);
 await page.getByRole("combobox",{name:"Your role"}).selectOption("admin");
 await page.getByRole("button",{name:"Add commission",exact:true}).click();
 await expect(page.getByLabel("Commission amount (USD)",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Save record",exact:true})).toBeDisabled();
});

test("voice dictation fills an editable draft and stops when leaving advisor",async({page})=>{
 await page.addInitScript(()=>{
  class Recognition {
   lang="";continuous=false;interimResults=false;
   onresult:any;onerror:any;onend:any;
   start(){(window as any).testRecognition=this;}
   abort(){(window as any).voiceAborted=true;}
  }
  (window as any).SpeechRecognition=Recognition;
 });
 await page.reload();
 await page.getByRole("button",{name:"Open advisor",exact:true}).click();
 await page.getByRole("button",{name:"Speak message",exact:true}).click();
 await expect(page.getByText("Listening…",{exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const r=(window as any).testRecognition;
  r.onresult({results:[{isFinal:true,0:{transcript:"Help me introduce LV Branding"}}]});
  r.onend();
 });
 await expect(page.getByRole("textbox",{name:"Your message",exact:true})).toHaveValue("Help me introduce LV Branding");
 await expect(page.getByRole("textbox",{name:"Your message",exact:true})).toBeEditable();
 await page.getByRole("button",{name:"Speak message",exact:true}).click();
 await page.getByRole("button",{name:"Dashboard",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).voiceAborted)).toBe(true);
});

test("unsupported voice input keeps text chat available",async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window,"SpeechRecognition",{value:undefined,configurable:true});
  Object.defineProperty(window,"webkitSpeechRecognition",{value:undefined,configurable:true});
 });
 await page.reload();
 await page.getByRole("button",{name:"Open advisor",exact:true}).click();
 await expect(page.getByRole("button",{name:"Speak message",exact:true})).toBeDisabled();
 await expect(page.getByRole("textbox",{name:"Your message",exact:true})).toBeEditable();
});

test("redesigned chat switches session drafts and fits mobile",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole("button",{name:"Open advisor",exact:true}).click();
 await page.getByRole("textbox",{name:"Your message",exact:true}).fill("First conversation");
 await page.getByRole("button",{name:"Chat history",exact:true}).click();
 await page.getByRole("button",{name:"New conversation",exact:true}).click();
 await expect(page.getByRole("textbox",{name:"Your message",exact:true})).toHaveValue("");
 await page.getByRole("textbox",{name:"Your message",exact:true}).fill("Second conversation");
 await page.getByRole("button",{name:"Chat history",exact:true}).click();
 await page.getByRole("button",{name:"First conversation",exact:true}).click();
 await expect(page.getByRole("textbox",{name:"Your message",exact:true})).toHaveValue("First conversation");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const composer=await page.getByRole("textbox",{name:"Your message",exact:true}).boundingBox();
 expect(composer!.y+composer!.height).toBeLessThanOrEqual(844);
 await expect(page.getByRole("img",{name:"LV Branding Agent",exact:true})).toBeVisible();
 await page.screenshot({path:"/private/tmp/lv-chat-mobile.png",fullPage:true});
 const asset=await page.request.get("/animations/lv-advisor-loading.json");
 expect(asset.ok()).toBe(true);
 expect((await asset.json()).op).toBe(150);
});

test("portal menu folds to an icon rail and expands without losing navigation",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole("button",{name:"Collapse menu",exact:true}).click();
 const expand=page.getByRole("button",{name:"Expand menu",exact:true});
 await expect(expand).toHaveAttribute("aria-expanded","false");
 await page.getByRole("button",{name:"LV Branding Advisor",exact:true}).click();
 await expect(page.getByRole("heading",{name:"LV Branding Advisor",exact:true})).toBeVisible();
 expect((await page.locator("main").boundingBox())!.x).toBe(64);
 await expand.click();
 expect((await page.locator("main").boundingBox())!.x).toBe(256);
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole("button",{name:"Collapse menu",exact:true})).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("invitation logo sits above the card and selector uses the light surface",async({page})=>{
 await page.goto("/portal-invite");
 const logo=page.getByLabel("LV Branding",{exact:true}).locator("svg");
 await expect(logo).toHaveAttribute("width","44.1");
 const logoBox=await logo.boundingBox();
 const card=await page.locator("main section").boundingBox();
 expect(logoBox!.y+logoBox!.height).toBeLessThan(card!.y);
 expect(Math.abs(logoBox!.x+logoBox!.width/2-(card!.x+card!.width/2))).toBeLessThan(1);
 const selector=page.getByRole("combobox",{name:"Language",exact:true});
 await expect(selector).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await page.screenshot({path:"/private/tmp/lv-invite-welcome.png",fullPage:true});
});
