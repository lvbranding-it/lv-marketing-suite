import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uid(1);
const otherOrg = uid(2);
const admin = uid(10);
const outsider = uid(11);
let db: PGlite;

const as = async (user: string, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${role}`);
};
const scalar = async (sql: string, args: unknown[] = []) =>
  Object.values((await db.query<Record<string, unknown>>(sql, args)).rows[0])[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create table public.organizations(id uuid primary key, name text not null);
    create table public.team_members(
      org_id uuid references public.organizations(id), user_id uuid references auth.users(id),
      role text, primary key(org_id, user_id)
    );
    create function public.is_org_member(_org_id uuid)
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists(select 1 from team_members where org_id = _org_id and user_id = auth.uid()) $$;
    create function public.org_role(_org_id uuid)
    returns text language sql stable security definer set search_path = public
    as $$ select role from team_members where org_id = _org_id and user_id = auth.uid() limit 1 $$;
    create function public.update_updated_at_column()
    returns trigger language plpgsql set search_path = public
    as $$ begin new.updated_at = now(); return new; end $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
  `);
  const migration = readFileSync(new URL("../migrations/20260922120000_social_publisher.sql", import.meta.url), "utf8");
  // Storage and pg_cron are Supabase-hosted extensions. The complete relational
  // schema and all workflow functions are exercised in portable Postgres here.
  await db.exec(migration.slice(0, migration.indexOf("insert into storage.buckets")));
}, 30_000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate public.social_activity_log, public.social_publish_attempts, public.social_publish_jobs,
      public.social_approvals, public.social_post_assets, public.social_post_variants, public.social_posts,
      public.social_campaigns, public.social_account_credentials, public.social_accounts,
      public.social_oauth_states, public.social_connections, public.social_publisher_settings,
      public.team_members, public.organizations, auth.users cascade;
  `);
  await db.query("insert into auth.users values($1,'admin@example.test'),($2,'outside@example.test')", [admin, outsider]);
  await db.query("insert into public.organizations values($1,'LV'),($2,'Other')", [org, otherOrg]);
  await db.query("insert into public.team_members values($1,$2,'owner'),($3,$4,'owner')", [org, admin, otherOrg, outsider]);
});

async function seedAccount(targetOrg = org, platform = "facebook") {
  await as("", "service_role");
  let connection = (await db.query<{ id: string }>("select id from social_connections where org_id=$1", [targetOrg])).rows[0]?.id;
  if (!connection) connection = await scalar(
    "insert into social_connections(org_id,encrypted_access_token,granted_scopes) values($1,'encrypted',array['pages_manage_posts','instagram_content_publish']) returning id",
    [targetOrg],
  ) as string;
  return scalar(
    `insert into social_accounts(org_id,connection_id,platform,provider_account_id,page_id,instagram_business_account_id,display_name)
     values($1,$2,$3,$4,$5,$6,'Destination') returning id`,
    [targetOrg, connection, platform, `${platform}-${targetOrg}`, "page-1", platform === "instagram" ? "ig-1" : null],
  ) as Promise<string>;
}

describe("social publisher database boundary", () => {
  it("keeps encrypted connections inaccessible and exposes only redacted status", async () => {
    await seedAccount();
    await as(admin);
    await expect(db.query("select encrypted_access_token from social_connections")).rejects.toMatchObject({ code: "42501" });
    const status = await db.query("select * from social_connection_status($1)", [org]);
    expect(status.rows).toHaveLength(1);
    expect(Object.keys(status.rows[0])).not.toContain("encrypted_access_token");
  });

  it("rejects cross-tenant account links even for a user who belongs to both organizations", async () => {
    const foreignAccount = await seedAccount(otherOrg);
    await db.exec("reset role");
    await db.query("insert into team_members values($1,$2,'owner')", [otherOrg, admin]);
    await as(admin);
    const post = await scalar("insert into social_posts(org_id,title) values($1,'Launch') returning id", [org]);
    await expect(db.query(
      "insert into social_post_variants(org_id,social_post_id,social_account_id,platform,caption) values($1,$2,$3,'facebook','Hello')",
      [org, post, foreignAccount],
    )).rejects.toThrow(/SOCIAL_ACCOUNT_SCOPE_MISMATCH/);
  });

  it("atomically creates one idempotent job per valid channel", async () => {
    const facebook = await seedAccount(org, "facebook");
    const instagram = await seedAccount(org, "instagram");
    await as(admin);
    const post = await scalar("insert into social_posts(org_id,title) values($1,'Launch') returning id", [org]) as string;
    const variants = await db.query<{ id: string }>(
      `insert into social_post_variants(org_id,social_post_id,social_account_id,platform,format,caption,scheduled_for_utc)
       values($1,$2,$3,'facebook','image','Facebook copy',now()+interval '1 hour'),
             ($1,$2,$4,'instagram','image','Instagram copy',now()+interval '1 hour') returning id`,
      [org, post, facebook, instagram],
    );
    for (const variant of variants.rows) {
      await db.query("insert into social_post_assets(org_id,post_variant_id,public_url,media_type) values($1,$2,'https://example.test/image.jpg','image')", [org, variant.id]);
    }
    expect(await scalar("select social_schedule_post($1)", [post])).toBe(2);
    expect(await scalar("select count(*) from social_publish_jobs where org_id=$1", [org])).toBe(2);
    expect(await scalar("select workflow_status from social_posts where id=$1", [post])).toBe("scheduled");
  });

  it("enforces optional approval before scheduling", async () => {
    const account = await seedAccount();
    await as(admin);
    await db.query("insert into social_publisher_settings(org_id,approval_required) values($1,true)", [org]);
    const post = await scalar("insert into social_posts(org_id,title) values($1,'Approval test') returning id", [org]) as string;
    const variant = await scalar(
      "insert into social_post_variants(org_id,social_post_id,social_account_id,platform,format,caption,scheduled_for_utc) values($1,$2,$3,'facebook','text','Approved copy',now()+interval '1 hour') returning id",
      [org, post, account],
    );
    await expect(db.query("select social_schedule_post($1)", [post])).rejects.toThrow(/APPROVAL_REQUIRED/);
    await db.query("select social_transition_post($1,'submit')", [post]);
    await db.query("select social_transition_post($1,'approve')", [post]);
    expect(await scalar("select social_schedule_post($1)", [post])).toBe(1);
    expect(variant).toEqual(expect.any(String));
  });
});
