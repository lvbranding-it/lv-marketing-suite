import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uid(1),
  otherOrg = uid(2),
  admin = uid(10),
  alice = uid(11),
  bob = uid(12),
  staff = uid(13),
  outsider = uid(14),
  newcomer = uid(15);
let db: PGlite;
const fields = {
  first_name: "Ana",
  last_name: "Lopez",
  company: "Example Co",
  email: "ana@example.test",
  source: "Event",
  service: "Brand strategy",
  summary: "Needs a brand system",
};
const as = async (user: string, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  await db.exec(`set role ${role}`);
};
const scalar = async (sql: string, args: unknown[] = []) =>
  Object.values(
    (await db.query<Record<string, unknown>>(sql, args)).rows[0],
  )[0];
const create = async (data: object = fields) =>
  (await scalar("select public.portal_save_lead($1,$2)", [
    org,
    JSON.stringify(data),
  ])) as string;
const submit = async (id: string, version = 1) =>
  db.query("select public.portal_submit_lead($1,$2)", [id, version]);
const manage = async (
  id: string,
  version: number,
  stage: string,
  assignee: string | null = staff,
  publish = false,
) =>
  db.query("select public.portal_manage_lead($1,$2,$3,$4,$5)", [
    id,
    version,
    stage,
    assignee,
    publish,
  ]);

beforeAll(async () => {
  db = new PGlite();
  // Minimal dependencies matching the verified live schema. Auth JWT plumbing is
  // simulated; all portal SQL, roles, grants, RLS and transactions execute in Postgres.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade);
    create table public.organizations(id uuid primary key,name text not null);
    create table public.team_members(org_id uuid references public.organizations(id),user_id uuid references auth.users(id),role text,primary key(org_id,user_id));`);
  await db.exec(
    readFileSync(
      new URL(
        "../portal-migrations/202609080001_portal_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../portal-migrations/202609080002_portal_invitations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../portal-migrations/202609080003_standalone_advisor.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
 await db.exec(readFileSync(new URL("../portal-migrations/202609080004_commission_tracker.sql",import.meta.url),"utf8"));
 await db.exec(readFileSync(new URL("../portal-migrations/202609080005_ambassador_welcome.sql",import.meta.url),"utf8"));
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    `reset role; truncate public.portal_note_revisions,public.portal_notes,public.portal_activities,public.portal_audit_events,public.portal_notifications,public.portal_sales,public.portal_leads,public.portal_memberships,public.team_members,public.organizations,auth.users cascade;`,
  );
  for (const id of [admin, alice, bob, staff, outsider, newcomer])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, `${id}@example.test`],
    );
  await db.query(
    "insert into public.organizations values($1,'LV'),($2,'Other')",
    [org, otherOrg],
  );
  await db.query(
    "insert into public.team_members values($1,$2,'owner'),($3,$4,'owner')",
    [org, admin, otherOrg, outsider],
  );
  await as(admin);
  for (const [user, role, name] of [
    [alice, "ambassador", "Alice"],
    [bob, "business_developer", "Bob"],
    [staff, "staff", "Staff"],
  ]) {
    await db.query("select public.portal_set_member($1,$2,$3,$4)", [
      org,
      user,
      role,
      name,
    ]);
  }
  await as(alice);
});

describe("portal database permissions", () => {
  it("lets representatives create and read only their own leads", async () => {
    const id = await create();
    expect(await scalar("select count(*) from portal_leads")).toBe(1);
    await as(bob);
    expect(await scalar("select count(*) from portal_leads")).toBe(0);
    await expect(
      db.query("select portal_save_lead($1,$2,$3,1)", [org, "{}", id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(submit(id)).rejects.toMatchObject({ code: "42501" });
  });
  it("does not grant access through another organization admin role", async () => {
    await create();
    await as(outsider);
    expect(await scalar("select count(*) from portal_leads")).toBe(0);
    await expect(create()).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects anonymous commands and reads", async () => {
    await as("", "anon");
    await expect(create()).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from portal_leads")).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("blocks direct writes and injected sensitive fields", async () => {
    const id = await create();
    await expect(
      db.query("update portal_leads set shared_stage='won' where id=$1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      create({ ...fields, attributed_user_id: bob }),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      create({ ...fields, shared_stage: "won" }),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      db.query(
        "insert into portal_audit_events(org_id,actor_id,action) values($1,$2,'forged')",
        [org, alice],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await scalar("select count(*) from portal_leads")).toBe(1);
  });
  it("restricts membership management to the organization admin", async () => {
    await expect(
      db.query("select portal_set_member($1,$2,'staff','Me')", [org, alice]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("revokes representative access without deleting history", async () => {
    const id = await create();
    await as(admin);
    await db.query(
      "select portal_set_member($1,$2,'ambassador','Alice',false)",
      [org, alice],
    );
    await as(alice);
    expect(await scalar("select count(*) from portal_leads")).toBe(0);
    await expect(submit(id)).rejects.toMatchObject({ code: "42501" });
    await as(admin);
    expect(await scalar("select count(*) from portal_leads")).toBe(1);
  });
});

describe("lead handoff transaction", () => {
  it("allows incomplete drafts but rejects incomplete submissions atomically", async () => {
    const id = await create({ first_name: "Draft" });
    await expect(submit(id)).rejects.toMatchObject({ code: "22023" });
    expect(
      await scalar("select shared_stage from portal_leads where id=$1", [id]),
    ).toBe("draft");
    await as(admin);
    expect(await scalar("select count(*) from portal_notifications")).toBe(0);
  });
  it("preserves attribution and creates one notification on submission retries", async () => {
    const id = await create();
    await submit(id);
    await submit(id);
    const lead = (
      await db.query("select * from portal_leads where id=$1", [id])
    ).rows[0];
    expect(lead).toMatchObject({
      attributed_user_id: alice,
      created_by: alice,
      version: 2,
      shared_stage: "new",
    });
    await as(admin);
    expect(await scalar("select count(*) from portal_notifications")).toBe(1);
    expect(
      await scalar(
        "select count(*) from portal_audit_events where action='submitted'",
      ),
    ).toBe(1);
  });
  it("blocks stale changes and lost updates", async () => {
    const id = await create();
    await db.query("select portal_save_lead($1,$2,$3,1)", [
      org,
      '{"company":"Updated"}',
      id,
    ]);
    await expect(submit(id, 1)).rejects.toMatchObject({ code: "40001" });
    await expect(
      db.query("select portal_save_lead($1,$2,$3,1)", [org, "{}", id]),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("allows only assigned staff and keeps internal stage private until published", async () => {
    const id = await create();
    await submit(id);
    await as(staff);
    expect(await scalar("select count(*) from portal_leads")).toBe(0);
    await as(admin);
    await manage(id, 2, "qualified");
    await as(staff);
    expect(await scalar("select count(*) from portal_leads")).toBe(1);
    expect(
      await scalar("select stage from portal_sales where lead_id=$1", [id]),
    ).toBe("qualified");
    await as(alice);
    expect(await scalar("select count(*) from portal_sales")).toBe(0);
    expect(
      await scalar("select shared_stage from portal_leads where id=$1", [id]),
    ).toBe("new");
    await expect(manage(id, 3, "won")).rejects.toMatchObject({ code: "42501" });
    await as(staff);
    await manage(id, 3, "qualified", staff, true);
    await as(alice);
    expect(
      await scalar("select shared_stage from portal_leads where id=$1", [id]),
    ).toBe("qualified");
    expect(
      await scalar(
        "select count(*) from portal_activities where visibility='internal'",
      ),
    ).toBe(0);
  });
  it("rejects assignment to a representative or another tenant user", async () => {
    const id = await create();
    await submit(id);
    await as(admin);
    for (const assignee of [bob, outsider])
      await expect(manage(id, 2, "new", assignee)).rejects.toMatchObject({
        code: "22023",
      });
    expect(
      await scalar("select version from portal_leads where id=$1", [id]),
    ).toBe(2);
  });
});

describe("note visibility and revisions", () => {
  it("keeps personal bodies private even from admins and internal bodies private from representatives", async () => {
    const id = await create();
    await submit(id);
    await db.query(
      "select portal_save_note($1,'Private rep note','personal')",
      [id],
    );
    await db.query("select portal_save_note($1,'Shared note','shared')", [id]);
    await as(admin);
    expect(await scalar("select count(*) from portal_notes")).toBe(1);
    await db.query(
      "select portal_save_note($1,'Internal staff note','internal')",
      [id],
    );
    await as(alice);
    expect(await scalar("select count(*) from portal_notes")).toBe(2);
    await expect(
      db.query("select portal_save_note($1,'fake internal','internal')", [id]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("preserves original timestamp and revision visibility on edits", async () => {
    const id = await create();
    const note = await scalar(
      "select portal_save_note($1,'Original','personal')",
      [id],
    );
    const old = (
      await db.query<{ created_at: string; updated_at: string }>(
        "select * from portal_notes where id=$1",
        [note],
      )
    ).rows[0];
    await db.query("select portal_save_note($1,'Edited','personal',$2,$3)", [
      id,
      note,
      old.updated_at,
    ]);
    const edited = (
      await db.query<{ created_at: string }>(
        "select * from portal_notes where id=$1",
        [note],
      )
    ).rows[0];
    expect(edited.created_at).toEqual(old.created_at);
    expect(await scalar("select body from portal_note_revisions")).toBe(
      "Original",
    );
    await as(admin);
    expect(await scalar("select count(*) from portal_note_revisions")).toBe(0);
  });
});

it("notification reads and acknowledgements are recipient-private", async () => {
  const id = await create();
  await submit(id);
  await as(admin);
  const notification = await scalar("select id from portal_notifications");
  await as(bob);
  expect(await scalar("select count(*) from portal_notifications")).toBe(0);
  await expect(
    db.query("select portal_read_notification($1)", [notification]),
  ).rejects.toMatchObject({ code: "42501" });
  await as(admin);
  await db.query("select portal_read_notification($1)", [notification]);
  expect(
    await scalar("select read_at is not null from portal_notifications"),
  ).toBe(true);
});

const issue = async (email = `${newcomer}@example.test`) => {
  await as(admin);
  return (
    await db.query<{ invitation_id: string; token: string }>(
      "select * from portal_create_invitation($1,$2,'New Rep','ambassador')",
      [org, email],
    )
  ).rows[0];
};
describe("portal invitation onboarding", () => {
  it("binds acceptance to the verified invited account without internal team membership", async () => {
    const invite = await issue();
    await as(newcomer);
    expect(
      (
        await db.query("select * from portal_invitation_details($1)", [
          invite.token,
        ])
      ).rows[0],
    ).toMatchObject({ org_name: "LV", role: "ambassador" });
    expect(
      await scalar("select portal_accept_invitation($1)", [invite.token]),
    ).toBe(org);
    expect(
      await scalar("select portal_accept_invitation($1)", [invite.token]),
    ).toBe(org);
    expect(
      await scalar("select role from portal_memberships where user_id=$1", [
        newcomer,
      ]),
    ).toBe("ambassador");
    await db.exec("reset role");
    expect(
      await scalar(
        "select count(*) from team_members where user_id=$1 and org_id=$2",
        [newcomer, org],
      ),
    ).toBe(0);
    expect(
      await scalar(
        "select count(*) from portal_audit_events where action='invitation_accepted'",
      ),
    ).toBe(1);
    expect(
      await scalar("select token_digest from portal_invitations"),
    ).not.toBe(invite.token);
  });
  it("does not disclose invitation rows, tokens, or details to other representatives", async () => {
    const invite = await issue();
    await as(bob);
    expect(await scalar("select count(id) from portal_invitations")).toBe(0);
    await expect(
      db.query("select token_digest from portal_invitations"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select * from portal_invitation_details($1)", [invite.token]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select portal_accept_invitation($1)", [invite.token]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "select portal_create_invitation($1,'x@example.test','X','staff')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects unverified email even with the correct token", async () => {
    const invite = await issue();
    await db.exec("reset role");
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [newcomer],
    );
    await as(newcomer);
    await expect(
      db.query("select portal_accept_invitation($1)", [invite.token]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects expired, canceled and superseded invitations", async () => {
    const first = await issue();
    const replacement = await issue();
    await as(newcomer);
    await expect(
      db.query("select portal_accept_invitation($1)", [first.token]),
    ).rejects.toMatchObject({ code: "42501" });
    await as(admin);
    await db.query("select portal_cancel_invitation($1)", [
      replacement.invitation_id,
    ]);
    await as(newcomer);
    await expect(
      db.query("select portal_accept_invitation($1)", [replacement.token]),
    ).rejects.toMatchObject({ code: "42501" });
    const expired = await issue();
    await db.exec("reset role");
    await db.query(
      "update portal_invitations set expires_at=now()-interval '1 day' where id=$1",
      [expired.invitation_id],
    );
    await as(newcomer);
    await expect(
      db.query("select portal_accept_invitation($1)", [expired.token]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("cannot reactivate a member by replaying their accepted token", async () => {
    const invite = await issue();
    await as(newcomer);
    await db.query("select portal_accept_invitation($1)", [invite.token]);
    await as(admin);
    await db.query(
      "select portal_set_member($1,$2,'ambassador','New Rep',false)",
      [org, newcomer],
    );
    await as(newcomer);
    await expect(
      db.query("select portal_accept_invitation($1)", [invite.token]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select * from portal_workspaces()")).rows,
    ).toHaveLength(0);
  });
  it("cannot overwrite existing membership using a stale invitation", async () => {
    const invite = await issue(`${bob}@example.test`);
    await as(bob);
    await expect(
      db.query("select portal_accept_invitation($1)", [invite.token]),
    ).rejects.toMatchObject({ code: "22023" });
    expect(
      await scalar("select role from portal_memberships where user_id=$1", [
        bob,
      ]),
    ).toBe("business_developer");
  });
  it("limits successful invitation commands without exposing the counter", async () => {
    await as(admin);
    for (let i = 0; i < 30; i++)
      await db.query(
        "select portal_create_invitation($1,$2,'Rep','ambassador')",
        [org, `rep${i}@example.test`],
      );
    await expect(
      db.query(
        "select portal_create_invitation($1,'extra@example.test','Rep','ambassador')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "P0429" });
    await expect(
      db.query("select * from portal_request_limits"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

it("allows a standalone advisor without leads and denies other organizations", async () => {
  await as(alice);
  expect(
    await scalar("select public.portal_advisor_session($1)", [org]),
  ).toEqual({ role: "ambassador", first_name: null });
  await expect(
    scalar("select public.portal_advisor_session($1)", [otherOrg]),
  ).rejects.toThrow("Not authorized");
});

const commission = {ambassador_id:alice,title:"Brand project",kind:"direct",amount_cents:20000,status:"projected",plan_reference:"Signed plan A",reason:"Initial record"};
it("commission tracker enforces recipient privacy and admin-only writes",async()=>{
 await as(admin);
 const id=await scalar("select public.portal_save_commission($1,$2)",[org,JSON.stringify(commission)]);
 await as(alice);
 expect((await db.query("select * from public.portal_commissions")).rows).toHaveLength(1);
 expect((await db.query("select * from public.portal_commission_history")).rows).toHaveLength(0);
 await expect(scalar("select public.portal_save_commission($1,$2)",[org,JSON.stringify(commission)])).rejects.toThrow("Not authorized");
 await expect(db.query("update public.portal_commissions set amount_cents=1 where id=$1",[id])).rejects.toThrow();
 await as(bob);
 expect((await db.query("select * from public.portal_commissions")).rows).toHaveLength(0);
 await as(staff);
 expect((await db.query("select * from public.portal_commissions")).rows).toHaveLength(0);
 await as(admin);
 expect((await db.query("select * from public.portal_commission_history")).rows).toHaveLength(1);
 await expect(scalar("select public.portal_save_commission($1,$2)",[otherOrg,JSON.stringify(commission)])).rejects.toThrow("Not authorized");
});
it("commission changes are versioned, audited and final payments locked",async()=>{
 await as(admin);
 const id=await scalar("select public.portal_save_commission($1,$2)",[org,JSON.stringify(commission)]);
 await expect(scalar("select public.portal_save_commission($1,$2,$3,$4)",[org,JSON.stringify(commission),id,2])).rejects.toThrow("Record changed");
 await expect(scalar("select public.portal_save_commission($1,$2,$3,$4)",[org,JSON.stringify({...commission,ambassador_id:bob}),id,1])).rejects.toThrow("Recipient cannot");
 await expect(scalar("select public.portal_save_commission($1,$2,$3,$4)",[org,JSON.stringify({...commission,status:"paid"}),id,1])).rejects.toThrow();
 await scalar("select public.portal_save_commission($1,$2,$3,$4)",[org,JSON.stringify({...commission,status:"paid",payment_date:"2026-09-08",payment_reference:"Receipt 1"}),id,1]);
 await expect(scalar("select public.portal_save_commission($1,$2,$3,$4)",[org,JSON.stringify(commission),id,2])).rejects.toThrow("Final records");
 expect((await db.query("select * from public.portal_commission_history")).rows).toHaveLength(2);
});
it("commission entries reject invalid amounts and audit omissions",async()=>{
 await as(admin);
 for(const change of [{amount_cents:-1},{amount_cents:1.5},{reason:""},{ambassador_id:outsider}]){
 await expect(scalar("select public.portal_save_commission($1,$2)",[org,JSON.stringify({...commission,...change})])).rejects.toThrow();
 }
});

it("claims the ambassador welcome once and rejects unrelated accounts",async()=>{
 await as(alice);
 expect(await scalar("select public.portal_claim_welcome($1)",[org])).toBe(true);
 expect(await scalar("select public.portal_claim_welcome($1)",[org])).toBe(false);
 await expect(db.query("delete from public.portal_welcome_seen")).rejects.toThrow();
 await as(bob);
 expect(await scalar("select public.portal_claim_welcome($1)",[org])).toBe(true);
 await as(outsider);
 await expect(scalar("select public.portal_claim_welcome($1)",[org])).rejects.toThrow("Not authorized");
 await as(staff);
 await expect(scalar("select public.portal_claim_welcome($1)",[org])).rejects.toThrow("Not authorized");
});
