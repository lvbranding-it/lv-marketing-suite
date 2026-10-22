import {test,expect,type Page} from '@playwright/test';
import {loadEnv} from 'vite';
const backend=loadEnv('development',process.cwd(),'VITE_').VITE_SUPABASE_URL;
const orgId='00000000-0000-4000-8000-000000000001';
const user={id:'00000000-0000-4000-8000-000000000002',email:'preview@example.com',user_metadata:{full_name:'Preview'},app_metadata:{},aud:'authenticated',created_at:'2026-01-01T00:00:00Z'};
const campaign={id:'00000000-0000-4000-8000-000000000003',org_id:orgId,name:'Autumn bulletin',subject:'An update for you',preview_text:'Latest news',body_html:'<p>Hello {{first_name}}</p>',status:'sent',sent_count:66,open_count:1,click_count:1,bounce_count:0,unsubscribe_count:0,recipient_count:66,sent_at:'2026-10-22T14:58:00Z',created_at:'2026-10-22T14:58:00Z',share_token:null as string|null};
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
    if (path.endsWith("/email_campaigns")) {
      if (route.request().method() === 'PATCH') Object.assign(campaign,route.request().postDataJSON());
      data = new URL(route.request().url()).searchParams.has('id') ? campaign : [campaign];
    }
    if (path.endsWith("/email_campaign_recipients")) data = [];
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


test.beforeEach(async({page})=>{campaign.share_token=null; campaign.open_count=1; await mockWorkspace(page);});
test('refreshes campaign percentages and enables, copies, then revokes a public link',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto(`/campaigns/${campaign.id}`);
 await expect(page.getByText('1.5% (1)',{exact:true})).toHaveCount(2);
 campaign.open_count=33;
 await page.getByRole('button',{name:'Refresh stats'}).click();
 await expect(page.getByText('50% (33)',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create share link'}).click();
 const link=page.getByRole('textbox',{name:'Public email link'});
 await expect(link).toHaveValue(/\/campaign\/[0-9a-f-]{36}$/);
 const url=await link.inputValue();
 expect(url).not.toContain(campaign.id);
 await page.getByRole('button',{name:'Copy link'}).click();
 await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
 await page.getByRole('button',{name:'Disable link'}).click();
 await expect(link).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create share link'})).toBeVisible();
});
test('campaign list and sharing fit a mobile screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/campaigns');
 await expect(page.getByRole('heading',{name:'Autumn bulletin'})).toBeVisible();
 await page.getByRole('heading',{name:'Autumn bulletin'}).click();
 await page.getByRole('button',{name:'Create share link'}).click();
 await expect(page.getByRole('textbox',{name:'Public email link'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/private/tmp/lv-campaign-sharing-mobile.png',fullPage:true});
});
